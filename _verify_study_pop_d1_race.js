/**
 * Verify study material POP stays open while delayed D1 loadRemote() re-renders.
 * Reproduces first-open race: open POP before D1 completes, wait, assert POP remains.
 *
 * node _verify_study_pop_d1_race.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = 8799;
const D1_API = 'https://chidori-route-api.info-chibafukushi.workers.dev/data';
const D1_DELAY_MS = 4500;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

function serve() {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
}

async function main() {
  const server = serve();
  await new Promise((resolve) => server.listen(port, resolve));

  const report = {
    ok: true,
    cacheVersion: 'v99',
    checks: [],
    errors: [],
    consoleErrors: [],
    infoLogs: [],
  };

  function check(name, cond, detail) {
    report.checks.push({ name, ok: !!cond, detail: detail == null ? null : detail });
    if (!cond) {
      report.ok = false;
      report.errors.push(name + (detail != null ? `: ${JSON.stringify(detail)}` : ''));
    }
  }

  const browser = await chromium.launch({ headless: true });

  async function runScenario(label, { withServiceWorker }) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    if (!withServiceWorker) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
      });
    }

    // Delayed successful D1 payload so loadRemote → render → renderList races first POP open.
    // Order is reversed so list DOM changes behind the POP (proves re-render happened).
    let d1Applied = false;
    await context.route(D1_API, async (route) => {
      await new Promise((r) => setTimeout(r, D1_DELAY_MS));
      if (route.request().method() === 'GET') {
        d1Applied = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              routes: [],
              pins: [],
              categories: [],
              studyMaterialsOrder: [
                'door-lever-safety-operation',
                'passenger-door-safety-guide',
                'bus-stop-arrival-safety',
                'bus-stop-departure-safety',
                'pre-trip-inspection-procedure',
                'start-end-roll-call-guide',
                'passenger-injury-prevention-guide',
                'intersection-turning-safety-guide',
                'bus-hijacking-response-manual',
                'accident-response-guide',
                'driver-health-emergency-response',
                'bicycle-accident-prevention',
                'mic-guide',
                'wheelchair',
                'stroller',
              ],
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    const page = await context.newPage();
    const pageErrors = [];
    const infoLogs = [];
    const ignoreError = (text) =>
      /CORS policy|net::ERR_FAILED|Failed to load resource|Failed to fetch|addEventListener/i.test(text);
    page.on('pageerror', (err) => {
      const text = String(err);
      if (!ignoreError(text)) pageErrors.push(text);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!ignoreError(text)) pageErrors.push(text);
      }
      if (msg.type() === 'info' && /study material POP is open/i.test(msg.text())) {
        infoLogs.push(msg.text());
      }
    });

    await context.clearCookies();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (_) {}
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-go="materials"]', { timeout: 15000 });
    await page.locator('[data-go="materials"]').click();
    await page.waitForSelector('.study-material-item', { timeout: 10000 });

    const cardsBefore = await page.$$eval('[data-material-id]', (els) =>
      els.map((el) => el.getAttribute('data-material-id'))
    );
    check(`${label}: materials list visible before D1`, cardsBefore.length > 0, cardsBefore.length);

    // Open first card ASAP (before delayed D1 finishes)
    const firstId = cardsBefore[0];
    await page.locator(`[data-material-id="${firstId}"]`).click();
    await page.waitForSelector('.study-pop-root', { timeout: 5000 });

    const openImmediately = await page.evaluate(() => ({
      pop: !!document.querySelector('.study-pop-root'),
      apiOpen: !!(window.__chidoriStudyMaterialsPop && window.__chidoriStudyMaterialsPop.isOpen()),
      materialId: window.__chidoriStudyMaterialsPop?.openMaterialId?.() || null,
      historyLen: history.length,
    }));
    check(`${label}: POP opens on first tap`, openImmediately.pop && openImmediately.apiOpen, openImmediately);

    // Wait for D1 mock + re-render
    await page.waitForFunction(
      () => {
        const first = document.querySelector('[data-material-id]');
        return first && first.getAttribute('data-material-id') === 'door-lever-safety-operation';
      },
      { timeout: D1_DELAY_MS + 8000 }
    );
    await page.waitForTimeout(500);

    const afterD1 = await page.evaluate(() => ({
      pop: !!document.querySelector('.study-pop-root'),
      apiOpen: !!(window.__chidoriStudyMaterialsPop && window.__chidoriStudyMaterialsPop.isOpen()),
      materialId: window.__chidoriStudyMaterialsPop?.openMaterialId?.() || null,
      page: typeof page !== 'undefined' ? page : null,
      historyLen: history.length,
      listCount: document.querySelectorAll('[data-material-id]').length,
      firstCardId: document.querySelector('[data-material-id]')?.getAttribute('data-material-id') || null,
    }));
    check(`${label}: D1 mock applied (list reordered)`, afterD1.firstCardId === 'door-lever-safety-operation', afterD1);
    check(`${label}: POP stays open after D1 refresh`, afterD1.pop && afterD1.apiOpen, afterD1);
    check(`${label}: open material id preserved`, afterD1.materialId === firstId, afterD1);
    check(`${label}: D1-open diagnostic log observed`, infoLogs.length > 0, infoLogs);
    check(`${label}: d1 route fulfilled`, d1Applied);

    // Focus replacement: close via × and confirm focus returns to same id card
    const focusBeforeClose = await page.evaluate(() => {
      const id = window.__chidoriStudyMaterialsPop.openMaterialId();
      const cards = [...document.querySelectorAll('[data-material-id]')];
      const match = cards.find((el) => el.getAttribute('data-material-id') === id);
      return {
        id,
        matchInDom: !!match,
        matchConnected: !!(match && match.isConnected),
      };
    });
    check(`${label}: replacement card exists for focus`, focusBeforeClose.matchConnected, focusBeforeClose);

    // Multi-page nav if slides present
    const hasSlides = await page.locator('#studySlideNext').count();
    if (hasSlides) {
      const pageText1 = (await page.locator('#studySlidePage').textContent()).trim();
      await page.locator('#studySlideNext').click();
      await page.waitForTimeout(200);
      const pageText2 = (await page.locator('#studySlidePage').textContent()).trim();
      check(`${label}: next page works while open after D1`, pageText1 !== pageText2 || /1 \/ 1/.test(pageText1), {
        pageText1,
        pageText2,
      });
      if (pageText1 !== pageText2) {
        await page.locator('#studySlidePrev').click();
        await page.waitForTimeout(200);
        const pageText3 = (await page.locator('#studySlidePage').textContent()).trim();
        check(`${label}: prev page works`, pageText3 === pageText1, { pageText1, pageText3 });
      }
    } else {
      check(`${label}: single-page body visible`, await page.locator('#studyPopBody').count() > 0);
    }

    // History back should close POP only (stay on materials)
    const histBeforeBack = await page.evaluate(() => ({
      len: history.length,
      page: typeof page !== 'undefined' ? page : null,
      pop: !!(window.__chidoriStudyMaterialsPop && window.__chidoriStudyMaterialsPop.isOpen()),
    }));
    await page.goBack();
    await page.waitForTimeout(400);
    const afterBack1 = await page.evaluate(() => ({
      pop: !!(window.__chidoriStudyMaterialsPop && window.__chidoriStudyMaterialsPop.isOpen()),
      popDom: !!document.querySelector('.study-pop-root'),
      page: typeof page !== 'undefined' ? page : null,
      materialsVisible: !!document.querySelector('.study-list'),
      activeId: document.activeElement?.getAttribute?.('data-material-id') || null,
    }));
    check(`${label}: back closes POP only`, !afterBack1.pop && !afterBack1.popDom, afterBack1);
    check(`${label}: still on materials after one back`, afterBack1.page === 'materials' && afterBack1.materialsVisible, afterBack1);
    check(`${label}: focus restored to card`, afterBack1.activeId === firstId, afterBack1);

    // Re-open and test close button / overlay / ×
    await page.locator(`[data-material-id="${firstId}"]`).click();
    await page.waitForSelector('.study-pop-root', { timeout: 5000 });

    if (await page.locator('#studyPopCloseX').count()) {
      await page.locator('#studyPopCloseX').click();
      await page.waitForTimeout(200);
      check(
        `${label}: × closes POP`,
        !(await page.evaluate(() => window.__chidoriStudyMaterialsPop.isOpen()))
      );
    }

    await page.locator(`[data-material-id="${firstId}"]`).click();
    await page.waitForSelector('.study-pop-root', { timeout: 5000 });
    if (await page.locator('#studyPopCloseBtn').count()) {
      await page.locator('#studyPopCloseBtn').click();
    } else if (await page.locator('#studySlideNext').count()) {
      // advance to last then close via next label, or use overlay
      await page.locator('[data-study-pop-dismiss]').click({ force: true, position: { x: 2, y: 2 } });
    } else {
      await page.locator('[data-study-pop-dismiss]').click({ force: true, position: { x: 2, y: 2 } });
    }
    await page.waitForTimeout(250);
    const closedByUi = await page.evaluate(() => !window.__chidoriStudyMaterialsPop.isOpen());
    check(`${label}: UI close/dismiss works`, closedByUi);

    // Overlay dismiss explicitly
    await page.locator(`[data-material-id="${firstId}"]`).click();
    await page.waitForSelector('.study-pop-root', { timeout: 5000 });
    await page.locator('[data-study-pop-dismiss]').click({ force: true, position: { x: 4, y: 4 } });
    await page.waitForTimeout(250);
    check(
      `${label}: overlay dismiss works`,
      !(await page.evaluate(() => window.__chidoriStudyMaterialsPop.isOpen()))
    );

    // Second back from materials should leave materials (home)
    const pageBeforeHome = await page.evaluate(() => page);
    if (pageBeforeHome === 'materials') {
      await page.goBack();
      await page.waitForTimeout(400);
      const afterBack2 = await page.evaluate(() => ({
        page: typeof page !== 'undefined' ? page : null,
        home: !!document.querySelector('[data-go="materials"]'),
      }));
      check(`${label}: second back leaves materials`, afterBack2.page !== 'materials', afterBack2);
    }

    report.consoleErrors.push(...pageErrors.map((e) => `${label}: ${e}`));
    report.infoLogs.push(...infoLogs.map((e) => `${label}: ${e}`));
    check(`${label}: no unexpected page errors`, pageErrors.length === 0, pageErrors);

    await context.close();
  }

  try {
    await runScenario('browser-no-sw', { withServiceWorker: false });
    await runScenario('pwa-sw', { withServiceWorker: true });

    // Desktop regression smoke
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
      });
      await context.route(D1_API, async (route) => {
        await new Promise((r) => setTimeout(r, 2000));
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                routes: [],
                pins: [],
                categories: [],
                studyMaterialsOrder: ['wheelchair', 'stroller', 'mic-guide'],
              },
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      });
      const page = await context.newPage();
      const errors = [];
      const ignoreError = (text) => /addEventListener/i.test(text);
      page.on('pageerror', (err) => {
        const text = String(err);
        if (!ignoreError(text)) errors.push(text);
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-go="materials"]').click();
      await page.waitForSelector('.study-material-item');
      await page.locator('[data-material-id]').first().click();
      await page.waitForSelector('.study-pop-root');
      await page.waitForFunction(
        () => document.querySelector('[data-material-id]')?.getAttribute('data-material-id') === 'wheelchair',
        { timeout: 10000 }
      );
      const stillOpen = await page.evaluate(() => window.__chidoriStudyMaterialsPop.isOpen());
      check('pc: POP stays after delayed D1', stillOpen);
      await page.locator('#studyPopCloseX').click();
      check('pc: × closes', !(await page.evaluate(() => window.__chidoriStudyMaterialsPop.isOpen())));
      check('pc: no unexpected errors', errors.length === 0, errors);
      await context.close();
    }

    // Cache version files
    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
    const pwa = fs.readFileSync(path.join(root, 'pwa-install.js'), 'utf8');
    check('index study-materials v99', /study-materials\.js\?v=99/.test(indexHtml));
    check('index d1-sync v62', /d1-sync\.js\?v=62/.test(indexHtml));
    check('SW CACHE_NAME v99', /chidori-route-map-v99/.test(sw));
    check('SW study-materials v99', /study-materials\.js\?v=99/.test(sw));
    check('SW d1-sync v62', /d1-sync\.js\?v=62/.test(sw));
    check('pwa SW_VERSION 99', /SW_VERSION = '99'/.test(pwa));

    // Source-level: renderList no longer closes POP
    const studySrc = fs.readFileSync(path.join(root, 'study-materials.js'), 'utf8');
    const renderListFn = studySrc.match(/function renderList\(\) \{[\s\S]*?\n  function renderDetail/);
    check('renderList exists', !!renderListFn);
    if (renderListFn) {
      check(
        'renderList does not closePop on entry',
        !/if \(popOpen\) \{\s*closePop\(\{ fromPopstate: true \}\)/.test(renderListFn[0])
      );
      check(
        'renderList updates popReturnFocus',
        /popReturnFocus = replacementTrigger/.test(renderListFn[0])
      );
    }
  } finally {
    await browser.close();
    server.close();
  }

  const outPath = path.join(root, '_verify_study_pop_d1_race_report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: report.ok, errors: report.errors, checks: report.checks.length, outPath }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
