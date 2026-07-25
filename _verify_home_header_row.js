/**
 * Verify home header title + action buttons share one row on mobile widths.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PORT = 4177;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = path.join(ROOT, 'evidence', 'home-header-row-2026-07-25');
fs.mkdirSync(OUT, { recursive: true });

const WIDTHS = [360, 390, 412, 1280];

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-e', `
const http=require('http');const fs=require('fs');const path=require('path');
const root=${JSON.stringify(ROOT)};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
http.createServer((req,res)=>{
  let u=decodeURIComponent((req.url||'/').split('?')[0]);
  if(u==='/')u='/index.html';
  const p=path.join(root,u.replace(/^\\/+/,''));
  if(!p.startsWith(root)){res.writeHead(403);res.end();return;}
  fs.readFile(p,(err,buf)=>{
    if(err){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(buf);
  });
}).listen(${PORT},'127.0.0.1',()=>console.log('ready'));
`],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let settled = false;
    const onData = (buf) => {
      if (!settled && /ready/.test(String(buf))) {
        settled = true;
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (b) => process.stderr.write(b));
    child.on('exit', (code) => {
      if (!settled) reject(new Error('server exited ' + code));
    });
    setTimeout(() => {
      if (!settled) reject(new Error('server timeout'));
    }, 8000);
  });
}

async function measure(page, width) {
  return page.evaluate((w) => {
    const h1 = document.querySelector('.header--home h1');
    const brand = document.querySelector('.header-brand');
    const actions = document.querySelector('.header-shortcuts');
    const buttons = [...document.querySelectorAll('.home-shortcut')];
    const sub = document.querySelector('.header--home p');
    const hb = brand?.getBoundingClientRect();
    const ha = actions?.getBoundingClientRect();
    const ht = h1?.getBoundingClientRect();
    const hs = sub?.getBoundingClientRect();
    const btnRects = buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    });
    const sameRow =
      ht && ha
        ? Math.abs(ht.top - ha.top) <= 12 && ha.left >= ht.right - 2
        : false;
    const buttonsBelowTitle = ht && ha ? ha.top > ht.bottom + 4 : true;
    const titleWraps = h1 ? h1.getClientRects().length > 1 : true;
    const scrollX = document.documentElement.scrollWidth > window.innerWidth + 1;
    const overlap =
      hb && ha
        ? !(
            hb.right <= ha.left + 1 ||
            ha.right <= hb.left + 1 ||
            hb.bottom <= ha.top + 1 ||
            ha.bottom <= hb.top + 1
          )
        : true;
    const equalButtons =
      btnRects.length === 2 &&
      Math.abs(btnRects[0].width - btnRects[1].width) <= 1 &&
      Math.abs(btnRects[0].height - btnRects[1].height) <= 1 &&
      Math.abs(btnRects[0].top - btnRects[1].top) <= 1;
    const subUnderButtons = hs && ha ? hs.right > ha.left + 4 && hs.top < ha.bottom : false;
    const pdf = document.querySelector('[data-route-map-pdf]');
    const install = document.querySelector('[data-pwa-install]');
    return {
      width: w,
      title: h1?.textContent?.trim(),
      subtitle: sub?.textContent?.trim(),
      sameRow,
      buttonsBelowTitle,
      titleWraps,
      scrollX,
      overlap,
      equalButtons,
      subUnderButtons,
      brand: hb && { top: +hb.top.toFixed(1), right: +hb.right.toFixed(1), bottom: +hb.bottom.toFixed(1) },
      actions: ha && { top: +ha.top.toFixed(1), left: +ha.left.toFixed(1), bottom: +ha.bottom.toFixed(1) },
      titleTop: ht?.top,
      actionsTop: ha?.top,
      buttons: btnRects,
      pdfHref: pdf?.getAttribute('href'),
      pdfText: pdf?.innerText?.replace(/\s+/g, ' ').trim(),
      installText: install?.innerText?.replace(/\s+/g, ' ').trim(),
    };
  }, width);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const report = { widths: {}, pass: true, fails: [] };

  try {
    for (const width of WIDTHS) {
      const height = width <= 768 ? 844 : 900;
      await page.setViewportSize({ width, height });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('.home-card');
      const m = await measure(page, width);
      await page.screenshot({ path: path.join(OUT, `home-${width}.png`), fullPage: false });
      report.widths[width] = m;

      if (width <= 768) {
        if (!m.sameRow) report.fails.push(`${width}: not same row`);
        if (m.buttonsBelowTitle) report.fails.push(`${width}: buttons below title`);
        if (m.titleWraps) report.fails.push(`${width}: title wraps`);
        if (m.scrollX) report.fails.push(`${width}: scrollX`);
        if (m.overlap) report.fails.push(`${width}: overlap`);
        if (!m.equalButtons) report.fails.push(`${width}: unequal buttons`);
        if (m.subUnderButtons) report.fails.push(`${width}: subtitle under buttons`);
      } else {
        if (m.scrollX) report.fails.push(`${width}: scrollX`);
        if (!m.title) report.fails.push(`${width}: missing title`);
      }
      if (m.pdfHref !== 'https://www.keiseibus.co.jp/wp-content/uploads/2026/02/routemap-chidori.pdf') {
        report.fails.push(`${width}: pdf href changed`);
      }
    }
    report.pass = report.fails.length === 0;
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.pass) process.exitCode = 1;
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
