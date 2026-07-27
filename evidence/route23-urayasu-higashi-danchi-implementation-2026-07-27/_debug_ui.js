'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8882;
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': 'text/javascript' });
  if (filePath.endsWith('.html')) {
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/src="https:\/\/maps\.googleapis\.com[^"]*"/, 'src=""');
    res.end(html);
  } else res.end(fs.readFileSync(filePath));
});
server.listen(PORT, async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => ({
    hasGo: typeof go === 'function',
    page,
    appHtml: document.getElementById('app')?.innerHTML?.slice(0, 500),
    title: document.title,
  }));
  console.log(JSON.stringify({ info, errs }, null, 2));
  await page.evaluate(() => { if (typeof go === 'function') go('routes'); });
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    page,
    hasRouteSelect: !!document.getElementById('routeSelect'),
    appHtml: document.getElementById('app')?.innerHTML?.slice(0, 800),
  }));
  console.log('after routes', JSON.stringify(after, null, 2));
  await browser.close();
  server.close();
});
