/**
 * v104: mobile home spacing + ©山本信勝
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const PORT = 4184;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = path.join(ROOT, 'evidence', 'home-ui-v104-2026-07-26');
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('.header--home h1');
    const sub = document.querySelector('.header--home .header-brand p');
    const brand = document.querySelector('.header-brand');
    const shortcuts = document.querySelector('.header-shortcuts');
    const cards = [...document.querySelectorAll('.home-card')];
    const lastCard = cards[cards.length - 1];
    const city = document.querySelector('.home-cityscape, .home-footer svg');
    const copy = document.querySelector('.home-copy');
    const footer = document.querySelector('.home-footer');
    const header = document.querySelector('.header--home');

    const subStyle = sub ? getComputedStyle(sub) : null;
    const footerStyle = footer ? getComputedStyle(footer) : null;
    const mainStyle = document.querySelector('.app--home .main')
      ? getComputedStyle(document.querySelector('.app--home .main'))
      : null;

    const lastRect = lastCard?.getBoundingClientRect();
    const cityRect = city?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const gapCardToCity =
      lastRect && cityRect ? Math.round(cityRect.top - lastRect.bottom) : null;
    const gapCityToCopy =
      cityRect && copyRect ? Math.round(copyRect.top - cityRect.bottom) : null;

    const brandRect = brand?.getBoundingClientRect();
    const shortRect = shortcuts?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const h1Rect = h1?.getBoundingClientRect();
    const subRect = sub?.getBoundingClientRect();

    const brandCenterY = brandRect ? brandRect.top + brandRect.height / 2 : null;
    const shortCenterY = shortRect ? shortRect.top + shortRect.height / 2 : null;
    const headerCenterY = headerRect ? headerRect.top + headerRect.height / 2 : null;

    const subLines = sub
      ? Math.round(sub.getBoundingClientRect().height / parseFloat(getComputedStyle(sub).lineHeight || '14'))
      : null;

    return {
      title: h1?.textContent?.trim() || null,
      subtitle: sub?.textContent?.trim() || null,
      copyText: copy?.textContent?.trim() || null,
      scrollX: document.documentElement.scrollWidth > window.innerWidth + 1,
      cardCount: cards.length,
      gapCardToCity,
      gapCityToCopy,
      subFontSize: subStyle?.fontSize || null,
      subWhiteSpace: subStyle?.whiteSpace || null,
      subNowrap: subStyle?.whiteSpace === 'nowrap',
      subLines,
      footerMarginTop: footerStyle?.marginTop || null,
      footerJustify: footerStyle?.justifyContent || null,
      mainFlex: mainStyle?.flex || null,
      brandShortCenterDelta:
        brandCenterY != null && shortCenterY != null
          ? Math.round(Math.abs(brandCenterY - shortCenterY))
          : null,
      brandHeaderCenterDelta:
        brandCenterY != null && headerCenterY != null
          ? Math.round(Math.abs(brandCenterY - headerCenterY))
          : null,
      h1SubGap:
        h1Rect && subRect ? Math.round(subRect.top - h1Rect.bottom) : null,
      copyVisible:
        !!copyRect &&
        copyRect.bottom <= window.innerHeight + 2 ||
        (copyRect && copyRect.top < document.documentElement.scrollHeight),
      copyFullyInDoc:
        !!copyRect &&
        copyRect.bottom <= document.documentElement.scrollHeight + 1,
      shortcutSizes: [...document.querySelectorAll('.home-shortcut')].map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      }),
      cols: getComputedStyle(document.querySelector('.home')).gridTemplateColumns,
    };
  });
}

(async () => {
  // syntax checks
  const syntax = {};
  for (const f of ['app.js', 'pwa-install.js', 'service-worker.js']) {
    try {
      // eslint-disable-next-line no-new-func
      new Function(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      syntax[f] = 'ok';
    } catch (e) {
      syntax[f] = String(e);
    }
  }
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const version = {
    indexApp: /app\.js\?v=104/.test(index),
    indexStyles: /styles\.css\?v=104/.test(index),
    indexPwa: /pwa-install\.js\?v=104/.test(index),
    cache: /CACHE_NAME = 'chidori-route-map-v104'/.test(sw),
    swApp: /app\.js\?v=104/.test(sw),
    swStyles: /styles\.css\?v=104/.test(sw),
    swPwa: /pwa-install\.js\?v=104/.test(sw),
    copyrightInApp: fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').includes('©山本信勝'),
  };

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const report = { version, syntax, widths: {}, fails: [], ok: true };

  function fail(msg) {
    report.ok = false;
    report.fails.push(msg);
  }

  if (Object.values(syntax).some((v) => v !== 'ok')) fail('syntax check failed');
  for (const [k, v] of Object.entries(version)) {
    if (!v) fail(`version check failed: ${k}`);
  }

  try {
    const widths = [320, 355, 390, 400, 768, 1280];
    for (const width of widths) {
      const page = await browser.newPage({
        viewport: { width, height: width <= 480 ? 844 : 900 },
      });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('.home-card');
      await page.waitForSelector('.home-copy');
      const m = await measure(page);
      await page.screenshot({
        path: path.join(OUT, `home-${width}.png`),
        fullPage: true,
      });
      report.widths[width] = m;

      if (m.scrollX) fail(`${width}: horizontal scroll`);
      if (m.copyText !== '©山本信勝') fail(`${width}: copyright text mismatch: ${m.copyText}`);
      if (!m.copyFullyInDoc) fail(`${width}: copyright clipped from document`);

      if (width <= 480) {
        if (!m.subNowrap) fail(`${width}: subtitle not nowrap`);
        if (m.subLines > 1) fail(`${width}: subtitle wraps (${m.subLines} lines)`);
        if (m.gapCardToCity == null || m.gapCardToCity < 18 || m.gapCardToCity > 32) {
          fail(`${width}: card→city gap ${m.gapCardToCity} not in 20–28 (±2)`);
        }
        if (m.gapCityToCopy == null || m.gapCityToCopy < 0 || m.gapCityToCopy > 10) {
          fail(`${width}: city→copy gap ${m.gapCityToCopy}`);
        }
        if (m.footerMarginTop !== '24px') fail(`${width}: footer margin-top ${m.footerMarginTop}`);
        if (m.brandShortCenterDelta != null && m.brandShortCenterDelta > 6) {
          fail(`${width}: brand/shortcut vertical misalign Δ${m.brandShortCenterDelta}`);
        }
      }

      if (width >= 768) {
        const colCount = (m.cols || '').split(' ').filter(Boolean).length;
        if (width >= 1024 && colCount < 2) fail(`${width}: PC not 2-col`);
        if (width === 1280 && colCount < 2) fail(`${width}: PC not 2-col`);
      }

      await page.close();
    }

    // reorder cards: move last to top, recheck gap still ok at 390
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.home-card');
    await page.evaluate(() => {
      const card = document.querySelector('[data-go="settings"]');
      if (card) card.click();
    });
    await page.waitForSelector('[data-tab="home-order"]', { timeout: 30000 });
    await page.evaluate(() => document.querySelector('[data-tab="home-order"]').click());
    await page.waitForSelector('#homeOrderList');
    // move first card down a few times to change last card
    await page.evaluate(() => {
      const down = document.querySelector('[data-move-down="0"]');
      if (down) {
        down.click();
        down.click();
      }
      const save = document.getElementById('homeOrderSave');
      if (save) save.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const back = document.getElementById('back');
      if (back) back.click();
    });
    await page.waitForSelector('.home-card');
    const after = await measure(page);
    report.reorder390 = after;
    await page.screenshot({ path: path.join(OUT, 'home-390-reordered.png'), fullPage: true });
    if (after.gapCardToCity == null || after.gapCardToCity < 18 || after.gapCardToCity > 32) {
      fail(`reorder390: card→city gap ${after.gapCardToCity}`);
    }
    if (after.copyText !== '©山本信勝') fail('reorder390: copyright missing');
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
