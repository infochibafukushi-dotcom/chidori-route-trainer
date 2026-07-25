/**
 * v79 verification: MutationObserver self-recursion fix + standalone display-mode.
 * Does NOT claim Android physical device pass.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PORT = 8769;
const BASE = `http://127.0.0.1:${PORT}`;
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, BASE);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const filePath = path.join(ROOT, rel.replace(/^\//, ''));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('missing');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function injectStandaloneMatchMedia(context) {
  await context.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query === '(display-mode: standalone)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        };
      }
      return originalMatchMedia(query);
    };
  });
}

async function measureTapMs(page, selector, readyFn) {
  return page.evaluate(
    async ({ sel, readySrc }) => {
      const ready = new Function('return (' + readySrc + ')')();
      const t0 = performance.now();
      const el = document.querySelector(sel);
      if (!el) throw new Error('missing ' + sel);
      el.click();
      await new Promise((resolve, reject) => {
        const start = Date.now();
        const id = setInterval(() => {
          try {
            if (ready()) {
              clearInterval(id);
              resolve();
            } else if (Date.now() - start > 3000) {
              clearInterval(id);
              reject(new Error('tap timeout ' + sel));
            }
          } catch (e) {
            clearInterval(id);
            reject(e);
          }
        }, 10);
      });
      return Math.round(performance.now() - t0);
    },
    { sel: selector, readySrc: readyFn.toString() }
  );
}

async function runMode(browser, mode) {
  const result = {
    mode,
    checks: [],
    errors: [],
    timers: {},
    quizMs: null,
    materialsMs: null,
    observerCallbacks: [],
    restartOk: [],
    cpuBusyMs: null,
  };

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: ANDROID_UA,
  });

  if (mode === 'standalone') {
    await injectStandaloneMatchMedia(context);
  }

  const page = await context.newPage();

  try {
    await page.addInitScript(() => {
      window.__chidoriMoProbe = { count: 0, stamps: [] };
      const NativeMO = window.MutationObserver;
      window.MutationObserver = function PatchedMO(cb) {
        const wrapped = function (...args) {
          try {
            window.__chidoriMoProbe.count += 1;
            window.__chidoriMoProbe.stamps.push(performance.now());
          } catch (e) {}
          return cb.apply(this, args);
        };
        return new NativeMO(wrapped);
      };
      window.MutationObserver.prototype = NativeMO.prototype;
    });

    const navStarted = Date.now();
    await page.goto(BASE + '/?diag=1&mode=' + mode, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const domContentLoadedMs = Date.now() - navStarted;
    result.timers.domContentLoadedMs = domContentLoadedMs;
    assert(domContentLoadedMs < 15000, 'DOMContentLoaded too slow: ' + domContentLoadedMs);
    result.checks.push('DOMContentLoaded ' + domContentLoadedMs + 'ms');

    await page.waitForSelector('.home-card--quiz', { timeout: 20000 });

    const timerProbe = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const out = {
            standalone: false,
            setTimeoutMs: null,
            rafFired: false,
            installState: null,
            installDisabled: null,
            homeInteractive: false,
            d1CallbackDefined: false,
            safeHomeReady: false,
          };
          try {
            out.standalone = window.matchMedia('(display-mode: standalone)').matches;
          } catch (e) {}
          out.homeInteractive = !!window.__chidoriHomeInteractive;
          out.d1CallbackDefined = typeof window.__chidoriOnHomeInteractive === 'function';
          const t0 = performance.now();
          setTimeout(() => {
            out.setTimeoutMs = Math.round(performance.now() - t0);
            requestAnimationFrame(() => {
              out.rafFired = true;
              const btn = document.querySelector('[data-pwa-install]');
              out.installState = btn ? btn.dataset.installState || null : null;
              out.installDisabled = btn ? !!btn.disabled : null;
              const marks = window.__chidoriBoot ? window.__chidoriBoot.dump().map((m) => m.name) : [];
              out.safeHomeReady = marks.includes('safe-home-ready');
              resolve(out);
            });
          }, 0);
        })
    );

    assert(timerProbe.setTimeoutMs != null && timerProbe.setTimeoutMs <= 100, 'setTimeout slow: ' + timerProbe.setTimeoutMs);
    assert(timerProbe.rafFired, 'requestAnimationFrame did not fire');
    assert(timerProbe.homeInteractive, 'home not interactive');
    result.timers.setTimeoutMs = timerProbe.setTimeoutMs;
    result.timers.rafFired = timerProbe.rafFired;
    result.checks.push('setTimeout ' + timerProbe.setTimeoutMs + 'ms / rAF ok');

    if (mode === 'standalone') {
      assert(timerProbe.standalone === true, 'standalone matchMedia not mocked');
      assert(timerProbe.installState === 'installed', 'installState not installed');
      assert(timerProbe.installDisabled === true, 'install button not disabled');
      result.checks.push('standalone install marked once');
    } else {
      assert(timerProbe.standalone === false, 'browser mode unexpectedly standalone');
      assert(timerProbe.installState !== 'installed', 'browser mode marked installed');
      result.checks.push('browser mode install unbound/ready');
    }

    // Wait briefly and ensure MutationObserver is not storming
    const moBefore = await page.evaluate(() => window.__chidoriMoProbe.count);
    await page.waitForTimeout(1200);
    const moAfter = await page.evaluate(() => ({
      count: window.__chidoriMoProbe.count,
      stamps: window.__chidoriMoProbe.stamps.slice(-40),
    }));
    const delta = moAfter.count - moBefore;
    result.observerCallbacks = { before: moBefore, after: moAfter.count, delta, recent: moAfter.stamps };
    assert(delta < 30, 'MutationObserver storm: delta=' + delta);
    // Detect tight consecutive callbacks (< 2ms apart for many hits)
    let tight = 0;
    for (let i = 1; i < moAfter.stamps.length; i += 1) {
      if (moAfter.stamps[i] - moAfter.stamps[i - 1] < 2) tight += 1;
    }
    assert(tight < 20, 'MutationObserver tight recursion: tight=' + tight);
    result.checks.push('MutationObserver stable delta=' + delta + ' tight=' + tight);

    // CPU occupancy rough probe: main thread should keep answering within 5s
    const cpu = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const samples = [];
          const start = performance.now();
          let last = start;
          function tick() {
            const now = performance.now();
            samples.push(now - last);
            last = now;
            if (now - start < 5000) {
              setTimeout(tick, 16);
            } else {
              const maxGap = Math.max(...samples);
              const busyRatio = samples.filter((g) => g > 80).length / samples.length;
              resolve({ maxGap: Math.round(maxGap), busyRatio, samples: samples.length });
            }
          }
          setTimeout(tick, 0);
        })
    );
    result.cpuBusyMs = cpu;
    assert(cpu.maxGap < 1500, 'main thread blocked maxGap=' + cpu.maxGap);
    assert(cpu.busyRatio < 0.5, 'CPU occupied too long busyRatio=' + cpu.busyRatio);
    result.checks.push('CPU probe maxGap=' + cpu.maxGap + ' busyRatio=' + cpu.busyRatio.toFixed(3));

    // Quiz (問題) within 1s
    const quizMs = await measureTapMs(
      page,
      '.home-card--quiz',
      () => !!document.querySelector('.question, .empty, [data-qt]')
    );
    result.quizMs = quizMs;
    assert(quizMs < 1000, 'quiz too slow: ' + quizMs);
    result.checks.push('quiz ' + quizMs + 'ms');
    await page.click('#back');
    await page.waitForSelector('.home-card--quiz', { timeout: 10000 });

    // Materials (基本研修資料) within 1s
    const materialsMs = await measureTapMs(
      page,
      '.home-card--materials',
      () => !!document.querySelector('#back') && !document.querySelector('.home-card--quiz')
    );
    result.materialsMs = materialsMs;
    assert(materialsMs < 1000, 'materials too slow: ' + materialsMs);
    result.checks.push('materials ' + materialsMs + 'ms');
    await page.click('#back');
    await page.waitForSelector('.home-card--materials', { timeout: 10000 });

    // Restart loop x10 (goto equivalent of launch → exit → relaunch)
    for (let i = 0; i < 10; i += 1) {
      await page.goto(BASE + '/?restart=' + i + '&mode=' + mode, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForSelector('.home-card--quiz', { timeout: 20000 });
      const alive = await page.evaluate(() => {
        return new Promise((resolve) => {
          const t0 = performance.now();
          setTimeout(() => {
            requestAnimationFrame(() => {
              const btn = document.querySelector('[data-pwa-install]');
              resolve({
                setTimeoutMs: Math.round(performance.now() - t0),
                raf: true,
                interactive: !!window.__chidoriHomeInteractive,
                installState: btn ? btn.dataset.installState || null : null,
                heading: document.querySelector('h1')?.textContent || null,
              });
            });
          }, 0);
        });
      });
      assert(alive.setTimeoutMs <= 100, 'restart setTimeout slow #' + i + ': ' + alive.setTimeoutMs);
      assert(alive.interactive, 'restart not interactive #' + i);
      assert(alive.heading === '千鳥路線図', 'restart home missing #' + i);
      if (mode === 'standalone') {
        assert(alive.installState === 'installed', 'restart installState #' + i);
      }
      result.restartOk.push({ i, ...alive });
    }
    result.checks.push('restart x10 ok');

    // Explicit old-vs-new MutationObserver recursion reproduction (isolated fixtures)
    const loopUnit = await page.evaluate(() => {
      const installedHtml = '<span>ショートカット</span><span>作成済み</span>';

      function runScenario(kind) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const button = document.createElement('button');
        button.innerHTML = '<span class="home-shortcut-label"><span>ショートカット</span><span>作成</span></span>';
        host.appendChild(button);
        let callbacks = 0;
        let stopped = false;
        const hardCap = 200;
        const obs = new MutationObserver(() => {
          callbacks += 1;
          if (callbacks >= hardCap) {
            stopped = true;
            obs.disconnect();
            return;
          }
          if (kind === 'old') {
            // Pre-v79: always rewrite label when "installed"
            button.classList.add('is-installed');
            button.disabled = true;
            const label = button.querySelector('.home-shortcut-label');
            if (label) label.innerHTML = installedHtml;
            else button.textContent = '作成済み';
          } else {
            // v79: idempotent
            if (button.dataset.installState === 'installed') return;
            button.dataset.installState = 'installed';
            button.classList.add('is-installed');
            button.disabled = true;
            const label = button.querySelector('.home-shortcut-label');
            if (label) {
              if (label.innerHTML !== installedHtml) label.innerHTML = installedHtml;
            } else if (button.textContent !== '作成済み') {
              button.textContent = '作成済み';
            }
          }
        });
        obs.observe(host, { childList: true, subtree: true, characterData: true, attributes: true });
        // Kick once
        const label = button.querySelector('.home-shortcut-label');
        if (label) label.innerHTML = '<span>ショートカット</span><span>作成</span>';
        return new Promise((resolve) => {
          setTimeout(() => {
            obs.disconnect();
            host.remove();
            resolve({ kind, callbacks, hitCap: stopped || callbacks >= hardCap });
          }, 400);
        });
      }

      return Promise.all([runScenario('old'), runScenario('new')]).then(([oldResult, newResult]) => ({
        oldResult,
        newResult,
      }));
    });
    assert(loopUnit.oldResult.hitCap || loopUnit.oldResult.callbacks >= 50, 'old loop did not reproduce: ' + JSON.stringify(loopUnit.oldResult));
    assert(!loopUnit.newResult.hitCap && loopUnit.newResult.callbacks < 20, 'new path still looping: ' + JSON.stringify(loopUnit.newResult));
    result.checks.push(
      'loop repro old=' + loopUnit.oldResult.callbacks + ' new=' + loopUnit.newResult.callbacks
    );
    result.loopUnit = loopUnit;

    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.errors.push(String(error && error.stack || error));
  } finally {
    await context.close();
  }

  return result;
}

(async () => {
  const report = {
    static: [],
    browser: null,
    standalone: null,
    ok: false,
    errors: [],
    androidDevice: 'not-checked',
  };

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const pwa = fs.readFileSync(path.join(ROOT, 'pwa-install.js'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

    assert(/pwa-install\.js\?v=79/.test(idx), 'index pwa not v79');
    assert(/__chidoriHomeInteractive/.test(idx), 'D1 race fix missing');
    assert(/SW_VERSION = '79'/.test(pwa), 'SW_VERSION not 79');
    assert(/dataset\.installState === 'installed'/.test(pwa), 'installState guard missing');
    assert(/MutationObserver\(\(\) =>/.test(pwa) || /new MutationObserver\(\(\) =>/.test(pwa), 'MO callback not updated');
    assert(/chidori-route-map-v79/.test(sw), 'CACHE_NAME not v79');
    assert(/'\.\/manifest\.webmanifest'/.test(sw), 'CORE_SHELL manifest not unified');
    assert(!/manifest\.webmanifest\?v=78/.test(sw), 'old manifest?v=78 still in SW');
    assert(/pwa-install\.js\?v=79/.test(sw), 'CORE_SHELL pwa not v79');
    report.static.push('versions + guards + manifest ok');

    report.browser = await runMode(browser, 'browser');
    report.standalone = await runMode(browser, 'standalone');
    report.ok = report.browser.ok && report.standalone.ok;
    if (!report.browser.ok) report.errors.push(...report.browser.errors);
    if (!report.standalone.ok) report.errors.push(...report.standalone.errors);
  } catch (error) {
    report.ok = false;
    report.errors.push(String(error && error.stack || error));
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(ROOT, '_pwa_v79_standalone_verify_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
})();
