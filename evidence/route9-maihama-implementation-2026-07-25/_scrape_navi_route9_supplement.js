'use strict';
/** Supplement scrape for missing route-9 patterns only. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');
const ROSETOWN = '00020678';
const TOKAI_ENTRANCE = '00020637';

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  return 'https://transfer-cloud.navitime.biz' + href;
}

function parseStopSequence(bodyText) {
  const stops = [];
  const re = /(\d{1,2}:\d{2})\s*\n\s*(発|着)\s*\n\s*([^\n]+)/g;
  let m;
  while ((m = re.exec(bodyText)) !== null) {
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || /系統・時刻表一覧|通過時刻表|ページの先頭/.test(name)) continue;
    stops.push({ time: m[1], kind: m[2], name });
  }
  return stops;
}

function uniqueNames(stops) {
  const names = [];
  for (const s of stops) {
    if (!names.length || names[names.length - 1] !== s.name) names.push(s.name);
  }
  return names.map((n) => n.replace(/東海大学浦安高校/g, '東海大浦安高校'));
}

async function scrapeTrip(page, url, meta) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const body = document.body.innerText;
    const h = document.querySelector('h1, h2');
    return {
      title: document.title,
      heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
      body,
      busstopLinks: [...document.querySelectorAll('a[href*="busstop="]')].map((a) => ({
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        href: a.getAttribute('href'),
        id: (a.getAttribute('href') || '').match(/busstop=(\d+)/)?.[1] || null,
      })),
    };
  });
  const stops = parseStopSequence(data.body);
  return {
    url,
    meta,
    stops,
    stopNames: uniqueNames(stops),
    stopCount: uniqueNames(stops).length,
    heading: data.heading,
    title: data.title,
    bodySnippet: data.body.slice(0, 2500),
    busstopLinks: data.busstopLinks,
  };
}

async function scrapeTimetableTargets(page, timetableUrl, linkFilter, label) {
  await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /系統|行き|止まり/.test(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const cell = a.closest('td, li, div') || a.parentElement;
      const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
      return { href, text, cellText: cellText.slice(0, 120) };
    });
    return { legend, tripLinks };
  });
  const picks = meta.tripLinks.filter((l) => linkFilter(l.cellText || '')).slice(0, 8);
  const sampled = [];
  for (const link of picks) {
    const trip = await scrapeTrip(page, absUrl(link.href), link);
    if (trip.stopNames.length >= 2) sampled.push({ link, trip });
    if (sampled.length >= 3) break;
  }
  return { label, timetableUrl, legend: meta.legend, sampled };
}

function isRoute9(text) {
  return /\[9\]/.test(text || '');
}

async function listRoute9Courses(page, busstopId) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => {
      const tr = a.closest('tr');
      const cell = tr && tr.querySelector('th, td');
      return {
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim(),
        berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null,
      };
    })
  );
  return links.filter((l) => isRoute9(l.text)).map((l) => ({ ...l, absHref: absUrl(l.href) }));
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const supplement = { scrapedAt: new Date().toISOString(), added: {}, extraPatterns: {} };

  try {
    // 9-urayasu: unmarked from 舞浜 course 0008200243-1
    if (!raw.confirmed['9-urayasu']) {
      const r = await scrapeTimetableTargets(
        page,
        `${BASE}/courses/timetables?busstop=00020617&course-sequence=0008200243-1`,
        (c) => /^\d{1,2}$/.test(c),
        '9-urayasu'
      );
      const hit = r.sampled.find((s) => /舞浜駅/.test(s.trip.stopNames[0]) && /浦安駅入口/.test(s.trip.stopNames.at(-1)));
      if (hit) {
        supplement.added['9-urayasu'] = {
          class: '9-urayasu',
          cellText: hit.link.cellText,
          sampleUrl: hit.trip.url,
          stopNames: hit.trip.stopNames,
          stopCount: hit.trip.stopCount,
          stops: hit.trip.stops,
          heading: hit.trip.heading,
          title: hit.trip.title,
          bodySnippet: hit.trip.bodySnippet,
          busstopLinks: hit.trip.busstopLinks,
          terminalId: '00020617',
          terminalLabel: '舞浜駅',
          berth: raw.inboundMaihamaSamples?.primary?.berth,
          timetableUrl: r.timetableUrl,
          legend: r.legend,
        };
        console.log('ADD 9-urayasu', hit.trip.stopCount);
      }
    }

    // daytime 9-tokai (non-late) if current is late-only
    if (raw.confirmed['9-tokai']?.lateNight) {
      const r = await scrapeTimetableTargets(
        page,
        `${BASE}/courses/timetables?busstop=00020617&course-sequence=0008200243-1`,
        (c) => /と/.test(c) && !/★/.test(c),
        '9-tokai-day'
      );
      const hit = r.sampled.find((s) => /東海大浦安高校入口/.test(s.trip.stopNames.at(-1)));
      if (hit) {
        supplement.added['9-tokai-day'] = {
          class: '9-tokai',
          cellText: hit.link.cellText,
          sampleUrl: hit.trip.url,
          stopNames: hit.trip.stopNames,
          stopCount: hit.trip.stopCount,
          stops: hit.trip.stops,
          terminalId: '00020617',
          timetableUrl: r.timetableUrl,
          legend: r.legend,
          lateNight: false,
        };
        console.log('ADD 9-tokai-day', hit.trip.stopCount);
      }
    }

    // daytime 9-rosetown if current sample is late-only
    if (raw.confirmed['9-rosetown']?.lateNight) {
      const r = await scrapeTimetableTargets(
        page,
        `${BASE}/courses/timetables?busstop=00020739&course-sequence=0008200244-1`,
        (c) => /ロ/.test(c) && !/★/.test(c),
        '9-rosetown-day'
      );
      const hit = r.sampled.find((s) => /京成ローズタウン/.test(s.trip.stopNames.at(-1)));
      if (hit) {
        supplement.added['9-rosetown-day'] = {
          class: '9-rosetown',
          cellText: hit.link.cellText,
          sampleUrl: hit.trip.url,
          stopNames: hit.trip.stopNames,
          stopCount: hit.trip.stopCount,
          stops: hit.trip.stops,
          terminalId: '00020739',
          timetableUrl: r.timetableUrl,
          legend: r.legend,
          lateNight: false,
        };
        console.log('ADD 9-rosetown-day', hit.trip.stopCount);
      }
    }

    // 9-maihama-tokai from 東海大浦安高校入口
    if (!raw.confirmed['9-maihama-tokai']) {
      const courses = await listRoute9Courses(page, TOKAI_ENTRANCE);
      console.log('tokai entrance route9 courses', courses.length);
      for (const course of courses.slice(0, 3)) {
        const r = await scrapeTimetableTargets(
          page,
          course.absHref,
          (c) => /^\d{1,2}$/.test(c) || (!/と/.test(c) && !/ロ/.test(c)),
          '9-maihama-tokai'
        );
        const hit = r.sampled.find(
          (s) => /東海大浦安高校入口/.test(s.trip.stopNames[0]) && /^舞浜駅$/.test(s.trip.stopNames.at(-1))
        );
        if (hit) {
          supplement.added['9-maihama-tokai'] = {
            class: '9-maihama-tokai',
            cellText: hit.link.cellText,
            sampleUrl: hit.trip.url,
            stopNames: hit.trip.stopNames,
            stopCount: hit.trip.stopCount,
            stops: hit.trip.stops,
            terminalId: TOKAI_ENTRANCE,
            terminalLabel: '東海大浦安高校入口',
            berth: course.berth,
            timetableUrl: course.absHref,
            legend: r.legend,
          };
          console.log('ADD 9-maihama-tokai', hit.trip.stopCount);
          break;
        }
      }
    }

    // 9-urayasu-rosetown from 京成ローズタウン
    if (!raw.confirmed['9-urayasu-rosetown']) {
      const courses = await listRoute9Courses(page, ROSETOWN);
      console.log('rosetown route9 courses', courses.length);
      for (const course of courses.slice(0, 4)) {
        const r = await scrapeTimetableTargets(
          page,
          course.absHref,
          (c) => /^\d{1,2}$/.test(c) || /浦安/.test(c),
          '9-urayasu-rosetown'
        );
        for (const s of r.sampled) {
          const first = s.trip.stopNames[0];
          const last = s.trip.stopNames.at(-1);
          if (/京成ローズタウン/.test(first) && /浦安駅入口/.test(last)) {
            supplement.added['9-urayasu-rosetown'] = {
              class: '9-urayasu-rosetown',
              cellText: s.link.cellText,
              sampleUrl: s.trip.url,
              stopNames: s.trip.stopNames,
              stopCount: s.trip.stopCount,
              stops: s.trip.stops,
              terminalId: ROSETOWN,
              terminalLabel: '京成ローズタウン',
              berth: course.berth,
              timetableUrl: course.absHref,
              legend: r.legend,
            };
            console.log('ADD 9-urayasu-rosetown', s.trip.stopCount);
            break;
          }
          if (/京成ローズタウン/.test(first) && /^舞浜駅$/.test(last)) {
            supplement.extraPatterns['extra:rosetown-maihama'] = {
              cellText: s.link.cellText,
              sampleUrl: s.trip.url,
              stopNames: s.trip.stopNames,
              stopCount: s.trip.stopCount,
            };
          }
          if (/京成ローズタウン/.test(first) && /東海大浦安高校入口/.test(last)) {
            supplement.extraPatterns['extra:rosetown-tokai'] = {
              cellText: s.link.cellText,
              sampleUrl: s.trip.url,
              stopNames: s.trip.stopNames,
              stopCount: s.trip.stopCount,
            };
          }
        }
        if (supplement.added['9-urayasu-rosetown']) break;
      }
    }

    // scan horie6 short-turn on outbound timetable
    const horie = await scrapeTimetableTargets(
      page,
      `${BASE}/courses/timetables?busstop=00020739&course-sequence=0008200244-1`,
      (c) => /堀江六|止/.test(c),
      'horie6-scan'
    );
    for (const s of horie.sampled) {
      const last = s.trip.stopNames.at(-1);
      if (/堀江六丁目/.test(last)) {
        supplement.extraPatterns['extra:horie6-stop'] = {
          cellText: s.link.cellText,
          sampleUrl: s.trip.url,
          stopNames: s.trip.stopNames,
          stopCount: s.trip.stopCount,
        };
      }
    }
  } finally {
    await browser.close();
  }

  // merge into raw
  raw.knownIds.rosetown = ROSETOWN;
  raw.knownIds.tokaiEntrance = TOKAI_ENTRANCE;
  raw.supplement = supplement;
  for (const [k, v] of Object.entries(supplement.added)) {
    const key = k.replace(/-day$/, '');
    if (k.endsWith('-day') && raw.confirmed[key]?.lateNight) {
      raw.lateNight[key] = raw.lateNight[key] || {};
      raw.lateNight[key].daytimeSample = v;
      raw.lateNight[key].sameStopOrder =
        JSON.stringify(v.stopNames) === JSON.stringify(raw.confirmed[key].stopNames);
      raw.confirmed[key] = { ...v, ...raw.confirmed[key], ...v, lateNight: false };
    } else if (!raw.confirmed[key]) {
      raw.confirmed[key] = v;
    }
  }
  raw.extraPatterns = { ...(raw.extraPatterns || {}), ...supplement.extraPatterns };
  fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2));
  console.log('confirmed now:', Object.keys(raw.confirmed));
  console.log('extra:', Object.keys(raw.extraPatterns));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
