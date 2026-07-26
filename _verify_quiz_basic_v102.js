/**
 * 問題画面3区分化・基礎研修問題のローカル検証
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const PORT = 8765;
const REPORT_DIR = path.join(ROOT, 'evidence', 'quiz-basic-v102-2026-07-26');
fs.mkdirSync(REPORT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json'
};

function serve() {
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }).listen(PORT);
}

async function clickHomeQuiz(page) {
  await page.waitForSelector('[data-go="quiz"]', { timeout: 10000 });
  await page.click('[data-go="quiz"]');
  await page.waitForSelector('.quiz-type-grid', { timeout: 10000 });
}

async function main() {
  const report = { checks: [], fails: [], consoleErrors: [], cacheName: null };
  const fail = (msg) => { report.fails.push(msg); report.checks.push({ ok: false, msg }); };
  const ok = (msg) => { report.checks.push({ ok: true, msg }); };

  const server = serve();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/chidori-route-api|d1-sync|CORS|Failed to fetch|D1 load failed|net::ERR_FAILED/i.test(text)) return;
    report.consoleErrors.push(text);
  });
  page.on('pageerror', (err) => {
    const text = String(err);
    if (/chidori-route-api|d1-sync|CORS|Failed to fetch|D1 load failed|net::ERR_FAILED/i.test(text)) return;
    report.consoleErrors.push(text);
  });

  try {
    // Static file checks
    const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const bank = fs.readFileSync(path.join(ROOT, 'basic-training-quiz-data.js'), 'utf8');
    const m = sw.match(/CACHE_NAME = '([^']+)'/);
    report.cacheName = m ? m[1] : null;
    if (report.cacheName === 'chidori-route-map-v102') ok('CACHE_NAME v102'); else fail('CACHE_NAME not v102: ' + report.cacheName);
    if (/basic-training-quiz-data\.js\?v=102/.test(idx) && /basic-training-quiz-data\.js\?v=102/.test(sw)) ok('basic quiz data in index+SW'); else fail('basic quiz data missing from index/SW');
    if (/app\.js\?v=102/.test(idx) && /styles\.css\?v=102/.test(idx)) ok('index query v102'); else fail('index query not v102');

    // Count questions
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Array.isArray(window.BASIC_TRAINING_QUIZ), null, { timeout: 10000 });
    const bankMeta = await page.evaluate(() => {
      const q = window.BASIC_TRAINING_QUIZ;
      const ids = q.map((x) => x.id);
      const cats = [...new Set(q.map((x) => x.category))];
      const required = [
        'bicycle-distance', 'bicycle-wait-pass', 'bicycle-crawl-speed', 'bicycle-watch-until-end',
        'intersection-right-turn-speed', 'intersection-left-turn-speed', 'intersection-entry-speed',
        'departure-wait-2sec', 'door-lever-hands-off'
      ];
      return {
        count: q.length,
        cats,
        missingRequired: required.filter((id) => !ids.includes(id)),
        answerIdsOk: q.every((item) => item.choices.some((c) => c.id === item.answerId))
      };
    });
    report.bankMeta = bankMeta;
    if (bankMeta.count >= 24) ok(`basic questions count=${bankMeta.count}`); else fail(`basic questions count=${bankMeta.count}`);
    if (!bankMeta.missingRequired.length) ok('required question ids present'); else fail('missing required ids: ' + bankMeta.missingRequired.join(','));
    if (bankMeta.answerIdsOk) ok('all answerId resolve'); else fail('some answerId invalid');

    // Initial quiz display = basic
    await clickHomeQuiz(page);
    const initial = await page.evaluate(() => {
      const selected = document.querySelector('.quiz-type-btn.is-selected');
      return {
        quizType: selected && selected.getAttribute('data-qt'),
        aria: selected && selected.getAttribute('aria-pressed'),
        hasCategory: !!document.querySelector('.quiz-category'),
        hasQuestion: !!document.querySelector('.quiz-question'),
        choiceCount: document.querySelectorAll('[data-choice-id]').length
      };
    });
    report.initial = initial;
    if (initial.quizType === 'basic' && initial.aria === 'true') ok('initial selected basic'); else fail('initial not basic: ' + JSON.stringify(initial));
    if (initial.hasCategory && initial.hasQuestion && initial.choiceCount === 4) ok('basic question rendered'); else fail('basic question UI incomplete');

    await page.screenshot({ path: path.join(REPORT_DIR, 'pc-basic.png'), fullPage: true });

    // Answer lock + feedback
    await page.click('[data-choice-id]');
    const afterAnswer = await page.evaluate(() => {
      const feedback = document.getElementById('quizFeedback');
      const disabled = [...document.querySelectorAll('[data-choice-id]')].every((b) => b.disabled);
      return {
        hidden: feedback.hidden,
        text: feedback.textContent,
        disabled,
        hasCorrectClass: !!document.querySelector('[data-choice-id].is-correct')
      };
    });
    if (!afterAnswer.hidden && afterAnswer.disabled && /解説/.test(afterAnswer.text) && /出典/.test(afterAnswer.text)) ok('answer feedback + lock'); else fail('answer feedback failed: ' + JSON.stringify(afterAnswer));

    // Switch types
    await page.click('[data-qt="next"]');
    await page.waitForSelector('[data-answer], .empty', { timeout: 5000 });
    const nextState = await page.evaluate(() => ({
      selected: document.querySelector('.quiz-type-btn.is-selected')?.dataset.qt,
      aria: document.querySelector('[data-qt="next"]')?.getAttribute('aria-pressed'),
      hasAnswers: document.querySelectorAll('[data-answer]').length > 0 || !!document.querySelector('.empty')
    }));
    if (nextState.selected === 'next' && nextState.aria === 'true') ok('switched to next'); else fail('next switch failed');

    await page.click('[data-qt="route"]');
    const routeState = await page.evaluate(() => ({
      selected: document.querySelector('.quiz-type-btn.is-selected')?.dataset.qt,
      aria: document.querySelector('[data-qt="route"]')?.getAttribute('aria-pressed')
    }));
    if (routeState.selected === 'route' && routeState.aria === 'true') ok('switched to route'); else fail('route switch failed');

    // Stay on route after next question
    if (await page.$('#nextQ')) {
      await page.click('#nextQ');
      const stay = await page.evaluate(() => document.querySelector('.quiz-type-btn.is-selected')?.dataset.qt);
      if (stay === 'route') ok('nextQ keeps route type'); else fail('nextQ reset type to ' + stay);
    } else {
      ok('nextQ skipped (empty route quiz)');
    }

    // Back to basic via home re-entry
    await page.click('#back');
    await page.waitForSelector('[data-go="quiz"]');
    // select next first then leave and re-enter
    await clickHomeQuiz(page);
    await page.click('[data-qt="next"]');
    await page.click('#back');
    await clickHomeQuiz(page);
    const reenter = await page.evaluate(() => document.querySelector('.quiz-type-btn.is-selected')?.dataset.qt);
    if (reenter === 'basic') ok('re-enter quiz resets to basic'); else fail('re-enter did not reset: ' + reenter);

    // Mobile 390
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await clickHomeQuiz(page);
    const mobileLayout = await page.evaluate(() => {
      const grid = document.querySelector('.quiz-type-grid');
      const btns = [...document.querySelectorAll('.quiz-type-btn')];
      const rects = btns.map((b) => b.getBoundingClientRect());
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      return {
        overflowX,
        count: btns.length,
        heights: rects.map((r) => Math.round(r.height)),
        minHeight: Math.min(...rects.map((r) => r.height)),
        allInViewport: rects.every((r) => r.left >= 0 && r.right <= window.innerWidth + 1),
        textOverflow: btns.some((b) => b.scrollWidth > b.clientWidth + 2)
      };
    });
    report.mobile390 = mobileLayout;
    if (!mobileLayout.overflowX && mobileLayout.count === 3 && mobileLayout.minHeight >= 44 && mobileLayout.allInViewport) {
      ok('390px layout ok');
    } else {
      fail('390px layout issue: ' + JSON.stringify(mobileLayout));
    }
    await page.screenshot({ path: path.join(REPORT_DIR, 'mobile-390-basic.png'), fullPage: true });

    // 320px
    await page.setViewportSize({ width: 320, height: 720 });
    const mobile320 = await page.evaluate(() => {
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      const nums = [...document.querySelectorAll('.quiz-type-num')].map((n) => n.textContent.trim());
      return { overflowX, nums };
    });
    report.mobile320 = mobile320;
    if (!mobile320.overflowX && mobile320.nums.join('') === '①②③') ok('320px no h-scroll + nums'); else fail('320px issue: ' + JSON.stringify(mobile320));
    await page.screenshot({ path: path.join(REPORT_DIR, 'mobile-320-basic.png'), fullPage: true });

    // No consecutive same basic question (sample)
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await clickHomeQuiz(page);
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const id = await page.evaluate(() => {
        const cat = document.querySelector('.quiz-category')?.textContent || '';
        const q = document.querySelector('.quiz-question')?.textContent || '';
        return cat + '|' + q;
      });
      ids.push(id);
      await page.click('#nextQ');
      await page.waitForTimeout(50);
    }
    let consecutive = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] === ids[i - 1]) consecutive++;
    report.consecutiveDupes = consecutive;
    if (consecutive === 0) ok('no consecutive duplicate basic questions in sample'); else fail('consecutive duplicates: ' + consecutive);

    // Offline / SW
    const swPage = await context.newPage();
    await swPage.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await swPage.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => null);
    const swInfo = await swPage.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.getRegistration();
      await new Promise((r) => setTimeout(r, 1500));
      const keys = await caches.keys();
      return {
        supported: true,
        controller: !!(navigator.serviceWorker.controller),
        scriptURL: reg && reg.active ? reg.active.scriptURL : null,
        caches: keys
      };
    });
    report.swInfo = swInfo;
    if (swInfo.caches && swInfo.caches.includes('chidori-route-map-v102')) ok('SW cache v102 present'); else fail('SW cache v102 missing: ' + JSON.stringify(swInfo));

    await context.setOffline(true);
    await swPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await swPage.waitForTimeout(800);
    const offlineOk = await swPage.evaluate(async () => {
      try {
        await new Promise((r) => {
          if (document.querySelector('[data-go="quiz"]')) return r();
          const t = setInterval(() => {
            if (document.querySelector('[data-go="quiz"]')) { clearInterval(t); r(); }
          }, 100);
          setTimeout(() => { clearInterval(t); r(); }, 5000);
        });
        const btn = document.querySelector('[data-go="quiz"]');
        if (!btn) return { ok: false, reason: 'no home quiz button' };
        btn.click();
        await new Promise((r) => setTimeout(r, 500));
        return {
          ok: !!document.querySelector('.quiz-question') || !!document.querySelector('[data-choice-id]'),
          selected: document.querySelector('.quiz-type-btn.is-selected')?.dataset.qt || null,
          bank: Array.isArray(window.BASIC_TRAINING_QUIZ) ? window.BASIC_TRAINING_QUIZ.length : 0
        };
      } catch (e) {
        return { ok: false, reason: String(e) };
      }
    });
    report.offline = offlineOk;
    if (offlineOk.ok && offlineOk.bank >= 24) ok('offline basic quiz works'); else fail('offline basic quiz failed: ' + JSON.stringify(offlineOk));
    await context.setOffline(false);

    if (report.consoleErrors.length) fail('console errors: ' + report.consoleErrors.slice(0, 5).join(' | '));
    else ok('no console errors');
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ fails: report.fails.length, checks: report.checks.length, cacheName: report.cacheName, failsList: report.fails }, null, 2));
  if (report.fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
