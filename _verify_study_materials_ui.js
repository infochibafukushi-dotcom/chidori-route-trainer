const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const port = 8765;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

function isIgnoredError(text) {
  return /D1 load failed|Failed to fetch|CORS policy|chidori-route-api|ERR_FAILED|net::ERR|Cannot read properties of undefined \(reading 'addEventListener'\)/i.test(text);
}

function loadCanon() {
  const code = fs.readFileSync(path.join(root, 'study-materials-data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.STUDY_MATERIALS;
}

async function main() {
  const canon = loadCanon();
  await new Promise((resolve) => server.listen(port, resolve));
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let failed = 0;

  async function checkViewport(width, height, label) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => {
      const text = String(err);
      if (!isIgnoredError(text)) errors.push(text);
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!isIgnoredError(text)) errors.push(text);
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-go="materials"]');
    await page.locator('[data-go="materials"]').evaluate((el) => el.click());
    await page.waitForSelector('.study-list');
    const titles = await page.$$eval('.study-material-item strong', (els) => els.map((e) => e.textContent.trim()));
    results.push({ label, step: 'list', titles, errors: [...errors] });

    for (const material of canon) {
      const id = material.id;
      await page.locator(`[data-material-id="${id}"]`).evaluate((el) => el.click());
      await page.waitForSelector('#studyMaterialPop [role="dialog"]');

      const dialog = page.locator('#studyMaterialPop [role="dialog"]');
      const title = (await page.textContent('#studyPopTitle')).trim();
      const ariaModal = await dialog.getAttribute('aria-modal');
      const labelledBy = await dialog.getAttribute('aria-labelledby');
      const activeIsClose = await page.evaluate(() => {
        const el = document.activeElement;
        return !!(el && (el.id === 'studyPopCloseX' || el.getAttribute('aria-label') === '閉じる'));
      });

      const blocks = await page.$$eval('#studyPopBody > div', (els) => els.map((el) => ({
        className: el.className,
        text: el.textContent,
      })));

      const expectedBlocks = material.blocks.map((block) => {
        const cls = block.type === 'heading' ? 'study-heading'
          : block.type === 'label' ? 'study-label'
            : block.type === 'sublabel' ? 'study-sublabel'
              : block.type === 'note' ? 'study-note'
                : 'study-text';
        return { className: cls, text: block.text };
      });

      let blocksMatch = blocks.length === expectedBlocks.length;
      const blockDiffs = [];
      if (blocksMatch) {
        for (let i = 0; i < blocks.length; i++) {
          if (blocks[i].className !== expectedBlocks[i].className || blocks[i].text !== expectedBlocks[i].text) {
            blocksMatch = false;
            blockDiffs.push({ index: i, expected: expectedBlocks[i], actual: blocks[i] });
          }
        }
      } else {
        blockDiffs.push({ expectedLen: expectedBlocks.length, actualLen: blocks.length });
      }

      const metrics = await page.evaluate(() => {
        const root = document.getElementById('studyMaterialPop');
        const panel = root && root.querySelector('.study-pop-panel');
        const body = document.getElementById('studyPopBody');
        const closeX = document.getElementById('studyPopCloseX');
        const closeBtn = document.getElementById('studyPopCloseBtn');
        const panelRect = panel.getBoundingClientRect();
        const closeXRect = closeX.getBoundingClientRect();
        const closeBtnRect = closeBtn.getBoundingClientRect();
        const bodyStyle = window.getComputedStyle(body.firstElementChild || body);
        return {
          panelWidth: panelRect.width,
          panelHeight: panelRect.height,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          bodyScrollTop: body.scrollTop,
          bodyCanScroll: body.scrollHeight > body.clientHeight + 1,
          bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
          pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          closeXMin: Math.min(closeXRect.width, closeXRect.height),
          closeBtnMin: Math.min(closeBtnRect.width, closeBtnRect.height),
          fontSize: bodyStyle.fontSize,
          lineHeight: bodyStyle.lineHeight,
          bodyLocked: document.body.classList.contains('study-pop-open'),
        };
      });

      const sideGap = metrics.viewportW - metrics.panelWidth;
      const heightRatio = metrics.panelHeight / metrics.viewportH;
      const okGeometry = sideGap >= 20 && sideGap <= 40 + 8 && heightRatio <= 0.94 + 0.02;
      // PC max width ~760
      const okPcWidth = label !== 'pc' || metrics.panelWidth <= 760 + 1;

      const row = {
        label,
        step: `pop:${id}`,
        title,
        titleMatch: title === material.title,
        ariaModal,
        labelledBy,
        activeIsClose,
        blocksMatch,
        blockDiffs: blockDiffs.slice(0, 3),
        metrics,
        okGeometry: label === 'sp' ? (sideGap >= 20 && heightRatio <= 0.96) : okPcWidth,
        pageStillMaterials: await page.evaluate(() => !!document.querySelector('.study-list')),
        errors: [...errors],
      };
      results.push(row);
      if (!row.titleMatch || !row.blocksMatch || ariaModal !== 'true' || labelledBy !== 'studyPopTitle' || !activeIsClose || !row.pageStillMaterials || metrics.pageOverflowX || metrics.bodyOverflowX || metrics.closeXMin < 44 || metrics.closeBtnMin < 44 || !metrics.bodyLocked) {
        failed += 1;
      }

      // reopen should start at top: scroll then close/reopen
      await page.evaluate(() => {
        const body = document.getElementById('studyPopBody');
        if (body) body.scrollTop = body.scrollHeight;
      });
      await page.locator('#studyPopCloseBtn').evaluate((el) => el.click());
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });

      // focus returned to card
      const focusBack = await page.evaluate((mid) => {
        const el = document.activeElement;
        return !!(el && el.getAttribute && el.getAttribute('data-material-id') === mid);
      }, id);
      results.push({ label, step: `focus-return:${id}`, focusBack });
      if (!focusBack) failed += 1;

      await page.locator(`[data-material-id="${id}"]`).evaluate((el) => el.click());
      await page.waitForSelector('#studyPopBody');
      const scrollTop = await page.evaluate(() => document.getElementById('studyPopBody').scrollTop);
      results.push({ label, step: `reopen-top:${id}`, scrollTop });
      if (scrollTop !== 0) failed += 1;

      // close methods rotate: x / overlay / Escape / history.back
      if (id === 'stroller') {
        await page.locator('#studyPopCloseX').evaluate((el) => el.click());
      } else if (id === 'wheelchair') {
        await page.locator('[data-study-pop-dismiss]').evaluate((el) => el.click());
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
      results.push({ label, step: `closed:${id}`, ok: true });
    }

    // history back closes pop
    await page.locator('[data-material-id="stroller"]').evaluate((el) => el.click());
    await page.waitForSelector('#studyMaterialPop');
    await page.evaluate(() => history.back());
    await page.waitForSelector('#studyMaterialPop', { state: 'detached' });
    const stayed = await page.evaluate(() => !!document.querySelector('.study-list') && !document.querySelector('.home'));
    results.push({ label, step: 'history-back-closes-pop', stayed });
    if (!stayed) failed += 1;

    await page.locator('#back').evaluate((el) => el.click());
    await page.waitForSelector('.home');
    results.push({ label, step: 'back-home', ok: true, errors: [...errors] });
    if (errors.length) failed += 1;
    await context.close();
  }

  await checkViewport(1280, 800, 'pc');
  await checkViewport(390, 844, 'sp');
  await checkViewport(844, 390, 'sp-landscape');

  await browser.close();
  server.close();
  fs.writeFileSync(path.join(root, '_study_materials_ui_out.json'), JSON.stringify({ failed, results }, null, 2), 'utf8');
  console.log(JSON.stringify({ failed, results }, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
