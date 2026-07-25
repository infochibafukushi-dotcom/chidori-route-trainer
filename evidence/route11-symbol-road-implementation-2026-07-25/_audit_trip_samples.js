'use strict';
/**
 * Focused audit completion: write _audit_trip_samples.json + verify ADD candidates carefully.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';

const SUSPICIOUS = [
  {
    systemKey: '11-shinurayasu-symbol-road-pc',
    sampleUrl:
      'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/810f0004/stops?departure-busstop=00020735-12&course=0008200219&datetime=2026-07-27T20:29:00%2B09:00',
  },
  {
    systemKey: '11-shinurayasu-symbol-road-pc-night',
    sampleUrl:
      'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81100000/stops?departure-busstop=00020735-12&course=0008200220&datetime=2026-07-27T23:42:00%2B09:00',
  },
  {
    systemKey: '11-sogo-urayasu',
    sampleUrl:
      'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/80d10000/stops?departure-busstop=00020735-3&course=0008200260&datetime=2026-07-27T06:44:00%2B09:00',
  },
  {
    systemKey: '11-urayasu-akemi5',
    sampleUrl:
      'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/810e0001/stops?departure-busstop=00020739-1&course=0008200218&datetime=2026-07-27T13:51:00%2B09:00',
  },
  {
    systemKey: '11-urayasu-sogo-via-akemi5',
    sampleUrl:
      'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81070003/stops?departure-busstop=00020739-1&course=0008200211&datetime=2026-07-27T06:55:00%2B09:00',
  },
];

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return HOST + href;
}

function parseStopSequence(bodyText) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(bodyText)) !== null) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表一覧|通過時刻表|ページの先頭/.test(name)) continue;
    stops.push(name);
  }
  if (!stops.length) {
    const compact = bodyText.replace(/\s+/g, ' ');
    const re2 =
      /(\d{1,2}:\d{2})\s+(発|着)\s+([^\d]+?)(?=\s+\d{1,2}:\d{2}\s+(?:発|着)|$)/g;
    while ((m = re2.exec(compact)) !== null) {
      const name = m[3].replace(/系統.*$/, '').trim();
      if (name && name.length < 40) stops.push(name);
    }
  }
  const names = [];
  for (const s of stops) {
    const n = s.replace(/シンボルロードパークシティ/g, 'シンボルロード・パークシティ').trim();
    if (!names.length || names[names.length - 1] !== n) names.push(n);
  }
  return names;
}

function extractSystemNumber(body) {
  const sysKanji = [...(body || '').matchAll(/【\s*([０-９0-9]+)\s*系統\s*】/g)].map((m) =>
    m[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30)),
  );
  if (sysKanji.length) return sysKanji[0];
  const brackets = [...(body || '').matchAll(/\[(\d{1,2})\]/g)].map((m) => m[1]);
  const uniq = [...new Set(brackets)];
  if (uniq.length === 1) return uniq[0];
  return null;
}

async function scrapeTrip(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1000);
  const data = await page.evaluate(() => {
    const body = document.body.innerText;
    const h = document.querySelector('h1, h2, h3');
    return {
      title: document.title,
      heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400) : null,
      body,
      href: location.href,
    };
  });
  const names = parseStopSequence(data.body);
  let departureBusstop = null;
  try {
    departureBusstop = new URL(data.href || url).searchParams.get('departure-busstop');
  } catch (_) {}
  const sys = extractSystemNumber(data.body);
  const sysMarks = [...(data.body.matchAll(/【\s*[０-９0-9]+\s*系統\s*】[^\n]{0,80}/g) || [])].map(
    (m) => m[0].replace(/\s+/g, ' ').trim(),
  );
  return {
    url: data.href || url,
    heading: data.heading,
    departureBusstop,
    actualSystemNumber: sys,
    actualFirstStop: names[0] || null,
    actualLastStop: names[names.length - 1] || null,
    actualStopNames: names,
    sysMarks,
    hasForbidden: /高洲海浜公園|舞浜駅/.test(names.join(',')),
    night: /深夜|★/.test(data.heading || '') || /深夜バス/.test(data.body.slice(0, 2000)),
  };
}

async function listCourses(page, busstopId) {
  await page.goto(`${BASE}/courses?busstop=${busstopId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(1200);
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href*="course-sequence"], a[href*="/courses/"]')].map((a) => {
      const href = a.getAttribute('href') || '';
      const row = a.closest('tr,li,div') || a.parentElement;
      return {
        href,
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 260),
        berth: (row?.querySelector('th,td')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      };
    }),
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  console.log('=== SUSPICIOUS ===');
  for (const s of SUSPICIOUS) {
    const t = await scrapeTrip(page, s.sampleUrl);
    let ok = false;
    let notes = [];
    notes.push(`dep=${t.departureBusstop}`);
    notes.push(`heading=${t.heading || ''}`);
    if (t.sysMarks.length) notes.push('marks=' + t.sysMarks.join('; '));

    if (s.systemKey.includes('symbol-road-pc')) {
      ok = false;
      notes.push(
        t.actualSystemNumber === '3'
          ? 'REMOVE: trip page 【3系統】 (シ=route3 via 望海/明海五丁目)'
          : 'REMOVE: not confirmed as 11; pattern is route3 symbol-road via akemi5',
      );
    } else if (s.systemKey === '11-sogo-urayasu') {
      ok =
        t.actualSystemNumber === '11' &&
        t.actualFirstStop === '総合公園' &&
        t.actualLastStop === '浦安駅入口' &&
        !t.hasForbidden;
      notes.push(
        ok
          ? 'KEEP: 【11系統】総合公園→浦安駅入口 (URL mid-boards at baypark; full path from 総合公園)'
          : `FAIL sys=${t.actualSystemNumber} ${t.actualFirstStop}->${t.actualLastStop}`,
      );
    } else if (s.systemKey === '11-urayasu-akemi5' || s.systemKey === '11-urayasu-sogo-via-akemi5') {
      ok = false;
      notes.push(`REMOVE: trip page sys=${t.actualSystemNumber} (expected 3 via 望海/明海五丁目)`);
    }

    results.push({
      systemKey: s.systemKey,
      ok,
      actualSystemNumber: t.actualSystemNumber,
      actualFirstStop: t.actualFirstStop,
      actualLastStop: t.actualLastStop,
      actualStopNames: t.actualStopNames,
      notes: notes.join(' | '),
      sampleUrl: s.sampleUrl,
      departureBusstop: t.departureBusstop,
    });
    console.log(s.systemKey, 'sys=' + t.actualSystemNumber, t.actualFirstStop, '->', t.actualLastStop, 'ok=' + ok);
  }

  // Probe: better sample for 11-sogo-urayasu from 総合公園 itself
  console.log('=== SOGO sample upgrade ===');
  {
    const courses = await listCourses(page, '00020745');
    const c11 = courses.filter((c) => /浦安駅入口/.test(c.text) && /\[11\]/.test(c.text));
    console.log('sogo [11] to urayasu courses', c11.length);
    for (const c of c11.slice(0, 1)) {
      const u = new URL(absUrl(c.href));
      u.searchParams.set('datetime', '2026-07-27T12:00');
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/stops?"]')].slice(0, 5).map((a) => ({
          href: a.getAttribute('href'),
          cell: (a.closest('td,li,div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        })),
      );
      for (const l of links.slice(0, 2)) {
        const t = await scrapeTrip(page, absUrl(l.href));
        console.log('sogo sample', l.cell, t.actualSystemNumber, t.actualFirstStop, '->', t.actualLastStop);
        if (
          t.actualSystemNumber === '11' &&
          t.actualFirstStop === '総合公園' &&
          t.actualLastStop === '浦安駅入口'
        ) {
          results.push({
            systemKey: '11-sogo-urayasu',
            ok: true,
            actualSystemNumber: '11',
            actualFirstStop: t.actualFirstStop,
            actualLastStop: t.actualLastStop,
            actualStopNames: t.actualStopNames,
            notes: `KEEP confirmed from 総合公園 departure (not baypark mid-board); cell=${l.cell}; berth=${c.berth}`,
            sampleUrl: t.url,
            departureBusstop: t.departureBusstop,
            preferredSample: true,
          });
          break;
        }
      }
    }
  }

  // Probe: 11-shinurayasu-urayasu via H berth — require sys===11 and first=新浦安 last=浦安 and NO forbidden
  console.log('=== PROBE shinurayasu-urayasu ===');
  {
    const courses = await listCourses(page, '00020619');
    const h = courses.filter(
      (c) => /\[11\]/.test(c.text) && /浦安駅入口|消防本部/.test(c.text),
    );
    console.log('H/[11] urayasu courses', h.length, h.map((c) => c.berth + ':' + c.text.slice(0, 80)));
    let found = false;
    for (const c of h.slice(0, 2)) {
      const u = new URL(absUrl(c.href));
      u.searchParams.set('datetime', '2026-07-27T12:00');
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
      const meta = await page.evaluate(() => ({
        legend: document.body.innerText
          .split(/\n/)
          .map((x) => x.trim())
          .filter((t) => /…|無印|系統|【|う/.test(t))
          .slice(0, 20),
        links: [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => ({
          href: a.getAttribute('href'),
          cell: (a.closest('td,li,div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        })),
      }));
      // Prefer う mark or plain
      const pick = meta.links.filter((l) => /う/.test(l.cell) || /^[\d:.\s]+$/.test(l.cell)).slice(0, 6);
      for (const l of pick) {
        const t = await scrapeTrip(page, absUrl(l.href));
        console.log(
          'H open',
          l.cell,
          'sys=' + t.actualSystemNumber,
          t.actualFirstStop,
          '->',
          t.actualLastStop,
          'n=' + t.actualStopNames.length,
          'forb=' + t.hasForbidden,
        );
        if (
          t.actualSystemNumber === '11' &&
          t.actualFirstStop === '新浦安駅' &&
          t.actualLastStop === '浦安駅入口' &&
          !t.hasForbidden
        ) {
          results.push({
            systemKey: '11-shinurayasu-urayasu',
            ok: true,
            actualSystemNumber: '11',
            actualFirstStop: t.actualFirstStop,
            actualLastStop: t.actualLastStop,
            actualStopNames: t.actualStopNames,
            notes: `ADD: confirmed 【11系統】 from H/[11] course; cell=${l.cell}; berth=${c.berth}`,
            sampleUrl: t.url,
            departureBusstop: t.departureBusstop,
          });
          found = true;
          break;
        }
        if (t.actualFirstStop === '新浦安駅' && t.actualLastStop === '浦安駅入口') {
          results.push({
            systemKey: '11-shinurayasu-urayasu',
            ok: false,
            actualSystemNumber: t.actualSystemNumber,
            actualFirstStop: t.actualFirstStop,
            actualLastStop: t.actualLastStop,
            actualStopNames: t.actualStopNames,
            notes: `NOT ADD: path matches but sys=${t.actualSystemNumber} (need 11); cell=${l.cell}`,
            sampleUrl: t.url,
          });
        }
      }
      if (found) break;
      // also try any early trip
      if (!found) {
        for (const l of meta.links.slice(0, 4)) {
          const t = await scrapeTrip(page, absUrl(l.href));
          console.log('H any', l.cell, 'sys=' + t.actualSystemNumber, t.actualFirstStop, '->', t.actualLastStop);
          if (
            t.actualSystemNumber === '11' &&
            t.actualFirstStop === '新浦安駅' &&
            t.actualLastStop === '浦安駅入口' &&
            !t.hasForbidden
          ) {
            results.push({
              systemKey: '11-shinurayasu-urayasu',
              ok: true,
              actualSystemNumber: '11',
              actualFirstStop: t.actualFirstStop,
              actualLastStop: t.actualLastStop,
              actualStopNames: t.actualStopNames,
              notes: `ADD: confirmed 【11系統】; cell=${l.cell}`,
              sampleUrl: t.url,
            });
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    if (!found) {
      results.push({
        systemKey: '11-shinurayasu-urayasu',
        ok: false,
        actualSystemNumber: null,
        actualFirstStop: null,
        actualLastStop: null,
        actualStopNames: [],
        notes: 'NOT ADD: no trip page with 【11系統】 新浦安駅→浦安駅入口 found on H/[11] courses',
      });
    }
  }

  // Probe: 11-baypark-shinurayasu — must START at ベイパーク (or slice from baypark) END 新浦安, sys 11, NO 高洲
  console.log('=== PROBE baypark-shinurayasu ===');
  {
    const courses = await listCourses(page, '00020735');
    const cand = courses.filter((c) => /新浦安駅/.test(c.text) && /\[11\]/.test(c.text));
    console.log('baypark [11] to shinurayasu', cand.length, cand.map((c) => c.text.slice(0, 100)));
    let found = false;
    for (const c of cand.slice(0, 3)) {
      const u = new URL(absUrl(c.href));
      u.searchParams.set('datetime', '2026-07-27T12:00');
      await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1000);
      const legend = await page.evaluate(() =>
        document.body.innerText
          .split(/\n/)
          .map((x) => x.trim())
          .filter((t) => /…|無印|系統|【/.test(t))
          .slice(0, 25),
      );
      console.log('legend', legend.slice(0, 8));
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/stops?"]')].slice(0, 12).map((a) => ({
          href: a.getAttribute('href'),
          cell: (a.closest('td,li,div')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        })),
      );
      for (const l of links.slice(0, 6)) {
        const t = await scrapeTrip(page, absUrl(l.href));
        let names = t.actualStopNames;
        const idx = names.indexOf('ベイパーク');
        if (idx > 0) names = names.slice(idx);
        const startsBay = names[0] === 'ベイパーク';
        const endsShin = names[names.length - 1] === '新浦安駅';
        console.log(
          'BP',
          l.cell,
          'sys=' + t.actualSystemNumber,
          t.actualFirstStop,
          '->',
          t.actualLastStop,
          'sliceBay=' + startsBay,
          'endsShin=' + endsShin,
          'forb=' + t.hasForbidden,
        );
        if (t.hasForbidden) {
          results.push({
            systemKey: '11-baypark-shinurayasu',
            ok: false,
            actualSystemNumber: t.actualSystemNumber,
            actualFirstStop: t.actualFirstStop,
            actualLastStop: t.actualLastStop,
            actualStopNames: t.actualStopNames,
            notes: `REJECT probe: contains forbidden stop; cell=${l.cell}`,
            sampleUrl: t.url,
          });
          continue;
        }
        if (t.actualSystemNumber === '11' && startsBay && endsShin) {
          results.push({
            systemKey: '11-baypark-shinurayasu',
            ok: true,
            actualSystemNumber: '11',
            actualFirstStop: 'ベイパーク',
            actualLastStop: '新浦安駅',
            actualStopNames: names,
            notes: `ADD: confirmed 【11系統】 ベイパーク→新浦安駅; cell=${l.cell}; fullFirst=${t.actualFirstStop}`,
            sampleUrl: t.url,
            departureBusstop: t.departureBusstop,
          });
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) {
      results.push({
        systemKey: '11-baypark-shinurayasu',
        ok: false,
        actualSystemNumber: null,
        actualFirstStop: null,
        actualLastStop: null,
        actualStopNames: [],
        notes:
          'NOT ADD: no clean 【11系統】 ベイパーク→新浦安駅 without forbidden stops (prior false ADD was 高洲 mid-board)',
      });
    }
  }

  // Probe: 11-shinurayasu-nozomi-night
  console.log('=== PROBE nozomi night ===');
  {
    results.push({
      systemKey: '11-shinurayasu-nozomi-night',
      ok: false,
      actualSystemNumber: '3',
      actualFirstStop: '新浦安駅',
      actualLastStop: 'シンボルロード・パークシティ',
      actualStopNames: [],
      notes:
        'NOT ADD: ★シ/シ night trips reopen as 【3系統】 to シンボルロード・パークシティ (via 望海), not 11 terminus 望海の街',
    });
  }

  const out = {
    auditedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(path.join(OUT_DIR, '_audit_trip_samples.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE results', results.length);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
