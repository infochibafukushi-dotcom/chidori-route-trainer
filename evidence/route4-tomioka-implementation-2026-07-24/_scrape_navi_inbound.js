'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return 'https://transfer-cloud.navitime.biz' + href;
}

function parseStops(body) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (name && !/系統・時刻表|通過時刻表|ページの先頭/.test(name)) {
      if (!stops.length || stops[stops.length - 1].name !== name) {
        stops.push({ time: m[1], kind: m[2], name });
      }
    }
  }
  return stops;
}

async function main() {
  const report = { scrapedAt: new Date().toISOString(), terminals: {}, inboundTrips: {} };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // 1) From outbound TDL trip, collect busstop links for terminals
  const tt =
    `${BASE}/courses/timetables?busstop=00020739&course-sequence=0008200222-1`;
  await page.goto(tt, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  const tripHrefs = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const cell = (a.closest('td, li, div') || a.parentElement).innerText || '';
      return {
        href: a.getAttribute('href'),
        text: (a.innerText || '').trim(),
        cell: cell.replace(/\s+/g, ' ').trim().slice(0, 50),
      };
    });
  });
  const picks = {
    tdl: tripHrefs.find((x) => /ランド/.test(x.cell)),
    chidori: tripHrefs.find((x) => /ち/.test(x.cell) && !/ランド/.test(x.cell)),
    maihama: tripHrefs.find((x) => !/ランド|ち|ホ/.test(x.cell)),
  };
  report.outboundPickLinks = picks;

  for (const [key, link] of Object.entries(picks)) {
    if (!link) continue;
    await page.goto(absUrl(link.href), { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const body = document.body.innerText;
      const busstopLinks = [...document.querySelectorAll('a[href*="busstop="]')].map((a) => ({
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        href: a.getAttribute('href'),
        id: (a.getAttribute('href') || '').match(/busstop=(\d+)/)?.[1] || null,
      }));
      return { title: document.title, busstopLinks, body: body.slice(0, 2500) };
    });
    const stops = parseStops(info.body);
    report.terminals[key] = {
      sampleUrl: absUrl(link.href),
      stopNames: stops.map((s) => s.name),
      busstopLinks: info.busstopLinks,
    };
    console.log(key, 'stops', stops.length, 'links', info.busstopLinks.length);
    const interesting = info.busstopLinks.filter((b) =>
      /舞浜|ディズニー|千鳥|浦安駅入口/.test(b.text)
    );
    console.log('  interesting', interesting.slice(0, 10));
  }

  // 2) Resolve IDs from last stop name links
  const idMap = {};
  for (const [key, t] of Object.entries(report.terminals)) {
    const lastName = t.stopNames?.at(-1);
    const hit = (t.busstopLinks || []).find((b) => b.text.includes((lastName || '').slice(0, 4)) || b.text.includes('ディズニー') || b.text.includes('千鳥') || b.text.includes('舞浜'));
    // Prefer link whose text matches last stop closely
    const better =
      (t.busstopLinks || []).find((b) => lastName && b.text.replace(/\s/g, '').includes(lastName.replace(/\s/g, '').slice(0, 6))) ||
      hit;
    if (better?.id) {
      idMap[key] = { id: better.id, text: better.text, lastName };
      console.log('ID', key, better.id, better.text);
    }
  }

  // Also scan all busstop links across the three trips for known names
  for (const t of Object.values(report.terminals)) {
    for (const b of t.busstopLinks || []) {
      if (/舞浜駅/.test(b.text) && !/オリエンタル/.test(b.text)) idMap.maihamaStation = idMap.maihamaStation || { id: b.id, text: b.text };
      if (/ディズニーランド/.test(b.text)) idMap.tdlStation = idMap.tdlStation || { id: b.id, text: b.text };
      if (/千鳥車庫/.test(b.text)) idMap.chidoriGarage = idMap.chidoriGarage || { id: b.id, text: b.text };
      if (/浦安駅入口/.test(b.text)) idMap.urayasu = idMap.urayasu || { id: b.id, text: b.text };
    }
  }
  report.idMap = idMap;
  console.log('idMap', idMap);

  // 3) For each terminal ID, list courses with [4] toward 浦安駅入口 and sample trips
  const terminals = [
    { sysPrefix: '4-urayasu-maihama', idKey: 'maihamaStation', label: '舞浜駅' },
    { sysPrefix: '4-urayasu-tdl', idKey: 'tdlStation', label: '東京ディズニーランド' },
    { sysPrefix: '4-urayasu-chidori', idKey: 'chidoriGarage', label: '千鳥車庫' },
  ];

  for (const term of terminals) {
    const idInfo = idMap[term.idKey] || idMap[term.sysPrefix] || null;
    // fallback keys from earlier
    const id = idInfo?.id;
    if (!id) {
      console.log('NO ID for', term.label);
      continue;
    }
    const coursesUrl = `${BASE}/courses?busstop=${id}`;
    await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      h: (document.querySelector('h1,h2')?.innerText || '').slice(0, 100),
      links: [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => ({
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 250),
      })),
    }));
    console.log('COURSES', term.label, id, pageInfo.h || pageInfo.title);
    const r4 = pageInfo.links.filter((l) => /\[4\]/.test(l.text) || (/4\s*\[4\]/.test(l.text)));
    const towardUrayasu = pageInfo.links.filter((l) => /浦安駅入口/.test(l.text));
    console.log('  r4', r4.length, 'urayasu', towardUrayasu.length);
    const use = r4.length ? r4 : towardUrayasu.filter((l) => /\[4\]|富岡|市役所入口/.test(l.text));
    report.inboundTrips[term.sysPrefix] = { terminalId: id, terminalLabel: pageInfo.h, courses: use };

    for (const course of use.slice(0, 2)) {
      const abs = absUrl(course.href);
      await page.goto(abs, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(1500);
      const legend = await page.evaluate(() =>
        document.body.innerText
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => /【\s*４\s*系統\s*】|無印…|ランド…|ち…/.test(l))
      );
      const tripLinks = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
          const cell = (a.closest('td, li, div') || a.parentElement).innerText || '';
          return {
            href: a.getAttribute('href'),
            text: (a.innerText || '').trim(),
            cell: cell.replace(/\s+/g, ' ').trim().slice(0, 50),
          };
        })
      );
      console.log('  legend', legend);
      // sample first few trips
      for (const tl of tripLinks.slice(0, 8)) {
        await page.goto(absUrl(tl.href), { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(1000);
        const body = await page.evaluate(() => document.body.innerText);
        const stops = parseStops(body);
        const names = stops.map((s) => s.name);
        if (names.length < 2) continue;
        const last = names[names.length - 1];
        if (!/浦安駅入口/.test(last)) continue;
        const first = names[0];
        let sys = term.sysPrefix;
        if (/ディズニー/.test(first)) sys = '4-urayasu-tdl';
        else if (/千鳥/.test(first)) sys = '4-urayasu-chidori';
        else if (/舞浜/.test(first)) sys = '4-urayasu-maihama';
        if (!report.inboundTrips[sys]) report.inboundTrips[sys] = {};
        if (!report.inboundTrips[sys].sample) {
          report.inboundTrips[sys].sample = {
            url: absUrl(tl.href),
            cell: tl.cell,
            stopNames: names,
            stopCount: names.length,
            stops,
            legend,
            terminalId: id,
          };
          console.log('INBOUND', sys, names.join(' → '));
        }
      }
    }
  }

  fs.writeFileSync(path.join(OUT, '_navi_inbound_raw.json'), JSON.stringify(report, null, 2));
  console.log('wrote inbound raw');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
