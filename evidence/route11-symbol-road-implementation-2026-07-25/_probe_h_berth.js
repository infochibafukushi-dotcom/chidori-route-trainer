'use strict';
const { chromium } = require('playwright');
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/courses?busstop=00020619`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  const courses = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => ({
      href: a.getAttribute('href'),
      text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      berth: (a.closest('tr')?.querySelector('th,td')?.innerText || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40),
    })),
  );
  const h = courses.find((c) => /消防本部|浦安駅入口/.test(c.text) && /\[11\]/.test(c.text));
  console.log('H_COURSE', h && { berth: h.berth, text: h.text.slice(0, 160), href: h.href });
  if (!h) {
    await browser.close();
    return;
  }
  const u = new URL(h.href.startsWith('http') ? h.href : HOST + h.href);
  u.searchParams.set('datetime', '2026-07-24T12:00');
  await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = body
      .split(/\n/)
      .map((l) => l.trim())
      .filter((t) => /…|無印|系統|望海|★|深夜|\[11\]/.test(t))
      .slice(0, 25);
    const links = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const cell = a.closest('td,li,div') || a.parentElement;
      return {
        cellText: (cell?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50),
        href: a.getAttribute('href'),
      };
    });
    const pats = {};
    for (const l of links) {
      const k = l.cellText.replace(/\d/g, '#').slice(0, 20);
      if (!pats[k]) pats[k] = l.cellText;
    }
    return { legend, linkCount: links.length, pats, links };
  });
  console.log('LEGEND');
  meta.legend.forEach((l) => console.log(' ', l));
  console.log('LINK_COUNT', meta.linkCount);
  console.log('PAT_SAMPLES', meta.pats);

  const picked = [];
  const seen = new Set();
  for (const c of meta.links) {
    if (/ま|め/.test(c.cellText)) continue;
    const sym = c.cellText.replace(/[0-9:.\s]/g, '') || 'plain';
    if (seen.has(sym)) continue;
    seen.add(sym);
    picked.push(c);
    if (picked.length >= 8) break;
  }
  // also force a few plain digit-only cells from different hours
  for (const c of meta.links) {
    if (picked.length >= 12) break;
    if (!/^[\d:.\s]+$/.test(c.cellText) && !/無印/.test(c.cellText)) continue;
    if (picked.some((p) => p.href === c.href)) continue;
    picked.push(c);
  }
  console.log(
    'PICKED',
    picked.map((p) => p.cellText),
  );

  for (const p of picked) {
    const abs = p.href.startsWith('http') ? p.href : HOST + p.href;
    try {
      await page.goto(abs, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(700);
      const info = await page.evaluate(() => {
        const body = document.body.innerText;
        const stops = [];
        const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
        let m;
        while ((m = re.exec(body))) stops.push(m[3].replace(/\s+/g, ' ').trim());
        const names = [];
        for (const s of stops) {
          if (!names.length || names[names.length - 1] !== s) names.push(s);
        }
        const sysRaw = (body.match(/【\s*([０-９0-9]+)\s*系統\s*】/) || [])[1] || null;
        const sys = sysRaw
          ? sysRaw.replace(/[０-９]/g, (ch) =>
              String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
            )
          : null;
        return {
          sys,
          first: names[0],
          last: names[names.length - 1],
          count: names.length,
          names,
          has11: /\[11\]|【\s*11\s*系統/.test(body),
        };
      });
      console.log(
        'OPEN',
        JSON.stringify(p.cellText),
        'sys=' + info.sys,
        'has11=' + info.has11,
        info.first,
        '->',
        info.last,
        'n=' + info.count,
      );
      if (/浦安駅入口/.test(info.last || '') && (info.sys === '11' || info.has11 || !info.sys)) {
        console.log('CANDIDATE_STOPS', info.names.join(' > '));
      }
    } catch (e) {
      console.log('FAIL', p.cellText, e.message);
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
