'use strict';
/**
 * Scrape Keisei Bus Navi for 系統6 市役所線 official stop orders.
 * Evidence only — does not invent stop sequences.
 * Prefers a[href*="/stops?"] trip pages (通過時刻表).
 *
 * Target patterns:
 *   6-maihama          浦安駅入口 → 舞浜駅 (outbound, 無印)
 *   6-chidori          浦安駅入口 → 千鳥車庫 (outbound, ち; not 千鳥北)
 *   6-urayasu-maihama  舞浜駅 → 浦安駅入口 (inbound, 無印)
 *   6-tokai            舞浜駅 → 東海大浦安高校前 (inbound, と)
 *   6-urayasu-chidori  千鳥車庫 → 浦安駅入口 (inbound)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const URAYASU = '00020739';
const MAIHAMA = '00020617';
const CHIDORI = '00020620';

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
  if (stops.length === 0) {
    const compact = bodyText.replace(/\s+/g, ' ');
    const re2 = /(\d{1,2}:\d{2})\s+(発|着)\s+([^\d]+?)(?=\s+\d{1,2}:\d{2}\s+(?:発|着)|$)/g;
    while ((m = re2.exec(compact)) !== null) {
      const name = m[3].replace(/系統.*$/, '').trim();
      if (name && name.length < 40) stops.push({ time: m[1], kind: m[2], name });
    }
  }
  return stops;
}

function uniqueNames(stops) {
  const names = [];
  for (const s of stops) {
    if (!names.length || names[names.length - 1] !== s.name) names.push(s.name);
  }
  return names;
}

/** Reject non-route-6 cell marks / system numbers. */
function looksLikeOtherSystem(cell) {
  return /\[(?:2|4|5|9|11|12|14|15|16|17|18|19|20|22|23|24|25|37|38)\]|【\s*[２４５９]/.test(cell || '');
}

/**
 * Classify outbound trip from 浦安駅入口 by cell mark + last stop.
 * ち → 千鳥車庫 (not 千鳥北方面)
 * 無印 → 舞浜駅
 */
function classifyOutbound(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  const first = stopNames[0] || '';
  if (!/浦安駅入口/.test(first)) return null;
  if (looksLikeOtherSystem(cell) && !/\[6\]/.test(cell)) return null;
  // Reject 千鳥北 as destination (ち mark is 千鳥車庫, not 千鳥北方面)
  if (/千鳥北/.test(last)) return null;
  if (/ち/.test(cell) || /^千鳥車庫$/.test(last)) {
    if (/千鳥車庫/.test(last) && !/千鳥北/.test(last)) return '6-chidori';
  }
  if (/舞浜駅/.test(last) && !/ち|と|Ｎ|ランド|ホ|あ|明|ひ|そ|ベ/.test(cell.replace(/舞浜|千鳥/g, ''))) {
    return '6-maihama';
  }
  if (/^舞浜駅$/.test(last)) return '6-maihama';
  if (/^千鳥車庫$/.test(last)) return '6-chidori';
  return null;
}

/**
 * Classify inbound from 舞浜駅.
 * と → 東海大浦安高校前
 * 無印 → 浦安駅入口
 */
function classifyInboundMaihama(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  const first = stopNames[0] || '';
  if (!/舞浜駅/.test(first)) return null;
  if (looksLikeOtherSystem(cell) && !/\[6\]/.test(cell)) return null;
  if (/と/.test(cell) || /東海大浦安高校前/.test(last)) {
    if (/東海大浦安高校前/.test(last)) return '6-tokai';
  }
  if (/浦安駅入口/.test(last)) return '6-urayasu-maihama';
  return null;
}

/**
 * Classify inbound from 千鳥車庫 → 浦安駅入口.
 * Mark 「市」 = 【６系統】. Unmarked from this berth is 【２系統】— reject.
 */
function classifyInboundChidori(cellText, stopNames) {
  const cell = cellText || '';
  const last = stopNames[stopNames.length - 1] || '';
  const first = stopNames[0] || '';
  if (!/千鳥車庫/.test(first)) return null;
  // Require 市 mark (route 6). Reject 南小(4) / し(14) / unmarked(2).
  if (!/市/.test(cell) || /南小/.test(cell)) return null;
  if (looksLikeOtherSystem(cell) && !/\[6\]/.test(cell)) return null;
  // Must actually pass 市役所前 (not 新浦安駅北口 2系統 path)
  const hasShiyakushoMae = stopNames.some((n) => n === '市役所前');
  if (/浦安駅入口/.test(last) && hasShiyakushoMae) return '6-urayasu-chidori';
  return null;
}

function isRoute6Legend(line) {
  return /【\s*[６6]\s*系統\s*】|無印…|ち…|と…/.test(line);
}

function isRoute6CourseText(text) {
  if (!/\[6\]/.test(text)) return false;
  // Prefer 市役所 / 舞浜 / 千鳥 for route 6
  if (/市役所|舞浜|千鳥|東海大/.test(text)) return true;
  if (/\b6\s*\[6\]/.test(text)) return true;
  return false;
}

async function scrapeTrip(page, url, meta) {
  const out = {
    url,
    meta,
    stops: [],
    stopNames: [],
    heading: null,
    title: null,
    bodySnippet: null,
    busstopLinks: [],
    errors: [],
  };
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1200);
    const data = await page.evaluate(() => {
      const body = document.body.innerText;
      const h = document.querySelector('h1, h2');
      const busstopLinks = [...document.querySelectorAll('a[href*="busstop="]')].map((a) => ({
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        href: a.getAttribute('href'),
        id: (a.getAttribute('href') || '').match(/busstop=(\d+)/)?.[1] || null,
      }));
      return {
        title: document.title,
        heading: h ? (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
        body,
        busstopLinks,
      };
    });
    out.heading = data.heading;
    out.title = data.title;
    out.stops = parseStopSequence(data.body);
    out.stopNames = uniqueNames(out.stops);
    out.bodySnippet = data.body.slice(0, 2500);
    out.busstopLinks = data.busstopLinks;
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function scrapeTimetable(page, timetableUrl, label, classifyFn, targetKeys) {
  const result = {
    label,
    timetableUrl,
    legend: [],
    tripLinks: [],
    sampled: {},
    bodySnippet: null,
    errors: [],
  };
  await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t)) && /系統|行き|止まり/.test(t)) legend.push(t);
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const cell = a.closest('td, li, div') || a.parentElement;
      const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
      return { href, text, cellText: cellText.slice(0, 100) };
    });
    return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 5500) };
  });
  result.legend = meta.legend;
  result.allLegend = meta.legend;
  result.bodySnippet = meta.bodySnippet;
  result.tripLinks = meta.tripLinks.map((l) => ({ ...l, absHref: absUrl(l.href) }));

  const scored = result.tripLinks.map((l) => {
    let score = 0;
    const c = l.cellText || '';
    const href = l.href || '';
    if (/ち/.test(c)) score += 8;
    if (/と/.test(c)) score += 8;
    // 千鳥車庫共有時刻表: 「市」=6系統（無印は2系統）
    if (/市/.test(c) && !/南小/.test(c)) score += 10;
    if (!/ち|と|市|南小|し|Ｎ|ランド|ホ|あ|明|ひ|そ|ベ|中央/.test(c)) score += 4; // unmarked
    if (/course=/.test(href)) score += 1;
    if (/\[(?:2|4|5|9|11|12|14)\]/.test(c) && !/\[6\]/.test(c)) score -= 25;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, 50);
  const seen = new Set();
  const targets = new Set(targetKeys || []);

  for (const link of picks) {
    const trip = await scrapeTrip(page, link.absHref, link);
    if (trip.stopNames.length < 2) continue;
    const cls = classifyFn(link.cellText, trip.stopNames);
    const key = cls || `other:${trip.stopNames[0]}→${trip.stopNames[trip.stopNames.length - 1]}`;
    if (seen.has(key)) continue;
    result.sampled[key] = {
      class: cls,
      cellText: link.cellText,
      sampleUrl: link.absHref,
      stopNames: trip.stopNames,
      stopCount: trip.stopNames.length,
      stops: trip.stops,
      heading: trip.heading,
      title: trip.title,
      bodySnippet: trip.bodySnippet,
      busstopLinks: trip.busstopLinks,
      nameChecks: {
        hasShiyakushoMae: trip.stopNames.some((n) => n === '市役所前'),
        hasShiyakushoIriguchiYubin: trip.stopNames.some((n) => /市役所入口|郵便局前/.test(n)),
        hasTokaiIriguchi: trip.stopNames.some((n) => n === '東海大浦安高校入口'),
        hasTokaiMae: trip.stopNames.some((n) => n === '東海大浦安高校前'),
        hasChidoriKita: trip.stopNames.some((n) => /千鳥北/.test(n)),
      },
    };
    seen.add(key);
    console.log('GOT', key, trip.stopNames.length, trip.stopNames[0], '→', trip.stopNames[trip.stopNames.length - 1]);
    if (targets.size && [...targets].every((t) => seen.has(t))) break;
  }
  return result;
}

async function listCourses(page, busstopId) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    h: (document.querySelector('h1,h2')?.innerText || '').slice(0, 120),
    links: [...document.querySelectorAll('a[href*="course-sequence"]')].map((a) => {
      const tr = a.closest('tr');
      const cell = tr && tr.querySelector('th, td');
      return {
        href: a.getAttribute('href'),
        text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
        berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 20) : null,
      };
    }),
  }));
  const route6 = pageInfo.links
    .filter((l) => isRoute6CourseText(l.text))
    .map((c) => ({ ...c, absHref: absUrl(c.href) }));
  return {
    busstopId,
    coursesUrl,
    title: pageInfo.title,
    heading: pageInfo.h,
    all: pageInfo.links.map((c) => ({ ...c, absHref: absUrl(c.href) })),
    route6,
  };
}

async function main() {
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note: 'Transcribed only from Navi trip pages; nothing invented. Filter system 6 only.',
    knownIds: { urayasu: URAYASU, maihama: MAIHAMA, chidori: CHIDORI },
    urayasuCourses: null,
    outbound: null,
    maihamaCourses: null,
    inboundMaihama: null,
    chidoriCourses: null,
    inboundChidori: null,
    confirmed: {},
    nameDistinctionNotes: [],
    errors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // 1) Outbound from 浦安駅入口
    const urayasu = await listCourses(page, URAYASU);
    report.urayasuCourses = urayasu;
    console.log('浦安駅入口 route6 courses:', urayasu.route6.length);
    for (const c of urayasu.route6) console.log(' -', c.berth, c.text.slice(0, 160));

    for (const course of urayasu.route6.slice(0, 3)) {
      const sampled = await scrapeTimetable(
        page,
        course.absHref,
        `outbound/${course.berth}`,
        classifyOutbound,
        ['6-maihama', '6-chidori']
      );
      if (!report.outbound) {
        report.outbound = { ...sampled, berth: course.berth, courseText: course.text };
      } else {
        for (const [k, v] of Object.entries(sampled.sampled || {})) {
          if (!report.outbound.sampled[k]) report.outbound.sampled[k] = v;
        }
        if (sampled.legend?.length) {
          report.outbound.legend = [...new Set([...(report.outbound.legend || []), ...sampled.legend])];
        }
      }
      for (const key of ['6-maihama', '6-chidori']) {
        if (report.outbound.sampled[key] && !report.confirmed[key]) {
          report.confirmed[key] = {
            ...report.outbound.sampled[key],
            terminalId: URAYASU,
            terminalLabel: '浦安駅入口',
            berth: course.berth,
            timetableUrl: course.absHref,
            legend: sampled.legend,
          };
        }
      }
      if (report.confirmed['6-maihama'] && report.confirmed['6-chidori']) break;
    }

    // 2) Inbound from 舞浜駅
    const maihama = await listCourses(page, MAIHAMA);
    report.maihamaCourses = maihama;
    console.log('舞浜駅 route6 courses:', maihama.route6.length);
    for (const c of maihama.route6) console.log(' -', c.berth, c.text.slice(0, 160));

    for (const course of maihama.route6.slice(0, 4)) {
      const sampled = await scrapeTimetable(
        page,
        course.absHref,
        `inbound-maihama/${course.berth}`,
        classifyInboundMaihama,
        ['6-urayasu-maihama', '6-tokai']
      );
      if (!report.inboundMaihama) {
        report.inboundMaihama = { ...sampled, berth: course.berth, courseText: course.text };
      } else {
        for (const [k, v] of Object.entries(sampled.sampled || {})) {
          if (!report.inboundMaihama.sampled[k]) report.inboundMaihama.sampled[k] = v;
        }
        if (sampled.legend?.length) {
          report.inboundMaihama.legend = [
            ...new Set([...(report.inboundMaihama.legend || []), ...sampled.legend]),
          ];
        }
      }
      for (const key of ['6-urayasu-maihama', '6-tokai']) {
        if (report.inboundMaihama.sampled[key] && !report.confirmed[key]) {
          report.confirmed[key] = {
            ...report.inboundMaihama.sampled[key],
            terminalId: MAIHAMA,
            terminalLabel: '舞浜駅',
            berth: course.berth,
            timetableUrl: course.absHref,
            legend: sampled.legend,
          };
        }
      }
      if (report.confirmed['6-urayasu-maihama'] && report.confirmed['6-tokai']) break;
    }

    // 3) Inbound from 千鳥車庫
    const chidori = await listCourses(page, CHIDORI);
    report.chidoriCourses = chidori;
    console.log('千鳥車庫 route6 courses:', chidori.route6.length);
    for (const c of chidori.route6) console.log(' -', c.berth, c.text.slice(0, 160));

    for (const course of chidori.route6.slice(0, 4)) {
      const sampled = await scrapeTimetable(
        page,
        course.absHref,
        `inbound-chidori/${course.berth}`,
        classifyInboundChidori,
        ['6-urayasu-chidori']
      );
      if (!report.inboundChidori) {
        report.inboundChidori = { ...sampled, berth: course.berth, courseText: course.text };
      } else {
        for (const [k, v] of Object.entries(sampled.sampled || {})) {
          if (!report.inboundChidori.sampled[k]) report.inboundChidori.sampled[k] = v;
        }
        if (sampled.legend?.length) {
          report.inboundChidori.legend = [
            ...new Set([...(report.inboundChidori.legend || []), ...sampled.legend]),
          ];
        }
      }
      if (report.inboundChidori.sampled['6-urayasu-chidori'] && !report.confirmed['6-urayasu-chidori']) {
        report.confirmed['6-urayasu-chidori'] = {
          ...report.inboundChidori.sampled['6-urayasu-chidori'],
          terminalId: CHIDORI,
          terminalLabel: '千鳥車庫',
          berth: course.berth,
          timetableUrl: course.absHref,
          legend: sampled.legend,
        };
      }
      if (report.confirmed['6-urayasu-chidori']) break;
    }

    // Name distinction summary across confirmed samples
    for (const [k, v] of Object.entries(report.confirmed)) {
      const nc = v.nameChecks || {};
      report.nameDistinctionNotes.push({
        systemKey: k,
        hasShiyakushoMae: !!nc.hasShiyakushoMae,
        hasShiyakushoIriguchiYubin: !!nc.hasShiyakushoIriguchiYubin,
        hasTokaiIriguchi: !!nc.hasTokaiIriguchi,
        hasTokaiMae: !!nc.hasTokaiMae,
        hasChidoriKita: !!nc.hasChidoriKita,
        stopNamesSample: (v.stopNames || []).filter((n) =>
          /市役所|東海大|千鳥/.test(n)
        ),
      });
    }
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
  }

  const outPath = path.join(OUT_DIR, '_navi_scrape_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('wrote', outPath);
  console.log('confirmed:', Object.keys(report.confirmed));
  for (const [k, v] of Object.entries(report.confirmed)) {
    console.log(
      ' ',
      k,
      v.stopCount,
      v.stopNames[0],
      '→',
      v.stopNames[v.stopNames.length - 1]
    );
  }
  const missing = [
    '6-maihama',
    '6-chidori',
    '6-urayasu-maihama',
    '6-tokai',
    '6-urayasu-chidori',
  ].filter((k) => !report.confirmed[k]);
  if (missing.length) console.log('MISSING:', missing.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
