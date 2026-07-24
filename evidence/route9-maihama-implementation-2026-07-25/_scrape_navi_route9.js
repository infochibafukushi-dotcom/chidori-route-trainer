'use strict';
/**
 * Scrape Keisei Bus Navi for 系統9 舞浜線 official stop orders.
 * Evidence only — does not invent stop sequences.
 * Prefers a[href*="/stops?"] trip pages (通過時刻表).
 *
 * Target patterns:
 *   9-maihama            浦安駅入口 → 舞浜駅 (outbound, 無印)
 *   9-rosetown           浦安駅入口 → 京成ローズタウン (outbound, ロ)
 *   9-urayasu            舞浜駅 → 浦安駅入口 (inbound, 無印)
 *   9-tokai              舞浜駅 → 東海大浦安高校入口 (inbound, と; NOT 高校前)
 *   9-maihama-tokai      東海大浦安高校入口 → 舞浜駅
 *   9-urayasu-rosetown   京成ローズタウン → 浦安駅入口
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const URAYASU = '00020739';
const MAIHAMA = '00020617';

const REQUIRED = [
  '9-maihama',
  '9-rosetown',
  '9-urayasu',
  '9-tokai',
  '9-maihama-tokai',
  '9-urayasu-rosetown',
];

const EXPECTED_MAIHAMA_STOPS = [
  '浦安駅入口',
  'フラワー通り',
  '堀江三丁目',
  '南小入口',
  '堀江六丁目',
  '清滝弁財天',
  '堀江中学校前',
  '富士見三丁目',
  '富士見五丁目',
  '京成ローズタウン',
  '舞浜駅',
];

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

function normalizeStopName(name) {
  return String(name || '')
    .replace(/東海大学浦安高校/g, '東海大浦安高校')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStopNames(names) {
  return (names || []).map(normalizeStopName);
}

function isLateNight(cellText) {
  return /★|深夜|\[深夜\]/.test(cellText || '');
}

function hasRoute9Mark(cell) {
  return /\[9\]|【\s*[９9]\s*系統\s*】/.test(cell || '');
}

/** Reject non-route-9 cell marks / system numbers. */
function looksLikeOtherSystem(cell) {
  if (hasRoute9Mark(cell)) return false;
  return /\[(?:2|4|5|6|11|12|14|15|16|17|18|19|20|22|23|24|25|37|38)\]|【\s*[２４５６]/.test(
    cell || ''
  );
}

function isRoute9CourseText(text) {
  if (!/\[9\]/.test(text || '')) return false;
  if (/舞浜|ローズ|堀江|富士見|東海大|浦安/.test(text || '')) return true;
  return /\b9\s*\[9\]/.test(text || '');
}

function nameChecks(stopNames) {
  const names = normalizeStopNames(stopNames);
  return {
    hasRoseTown: names.some((n) => /京成ローズタウン/.test(n)),
    hasTokaiIriguchi: names.some((n) => n === '東海大浦安高校入口'),
    hasTokaiMae: names.some((n) => n === '東海大浦安高校前'),
    hasHorie6: names.some((n) => n === '堀江六丁目'),
    hasFujimi3: names.some((n) => n === '富士見三丁目'),
    hasFujimi5: names.some((n) => n === '富士見五丁目'),
    matchesExpectedMaihamaPrefix: EXPECTED_MAIHAMA_STOPS.every((exp, i) => names[i] === exp),
  };
}

function classifyOutbound(cellText, stopNames) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (!/浦安駅入口/.test(first)) return null;
  if (looksLikeOtherSystem(cell)) return null;
  if (!hasRoute9Mark(cell) && !/ロ|と|★|深夜/.test(cell)) {
    // shared timetable: unmarked route-9 maihama still allowed if stop pattern matches
    if (!/舞浜駅/.test(last)) return null;
  }
  if (/ロ/.test(cell.replace(/舞浜|ローズ/g, '')) || /★ロ/.test(cell)) {
    if (/京成ローズタウン/.test(last)) return '9-rosetown';
  }
  if (/^京成ローズタウン$/.test(last) && /ロ|★/.test(cell)) return '9-rosetown';
  if (/^舞浜駅$/.test(last) && !/ロ/.test(cell.replace(/舞浜/g, ''))) return '9-maihama';
  if (/堀江六丁目/.test(last) && /止/.test(cell)) return 'extra:horie6-stop';
  return null;
}

function classifyInboundMaihama(cellText, stopNames) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (!/舞浜駅/.test(first)) return null;
  if (looksLikeOtherSystem(cell)) return null;
  if (/と/.test(cell) || /★と/.test(cell)) {
    if (/東海大浦安高校入口/.test(last) && !/高校前/.test(last)) return '9-tokai';
  }
  if (/^東海大浦安高校入口$/.test(last) && /と|★/.test(cell)) return '9-tokai';
  if (/浦安駅入口/.test(last) && !/と/.test(cell.replace(/浦安/g, ''))) return '9-urayasu';
  return null;
}

function classifyFromTokaiEntrance(cellText, stopNames) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (!/東海大浦安高校入口/.test(first)) return null;
  if (looksLikeOtherSystem(cell)) return null;
  if (/^舞浜駅$/.test(last)) return '9-maihama-tokai';
  return null;
}

function classifyFromRoseTown(cellText, stopNames) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (!/京成ローズタウン/.test(first)) return null;
  if (looksLikeOtherSystem(cell)) return null;
  if (/^舞浜駅$/.test(last)) return 'extra:rosetown-maihama';
  if (/^東海大浦安高校入口$/.test(last)) return 'extra:rosetown-tokai';
  if (/浦安駅入口/.test(last)) return '9-urayasu-rosetown';
  return null;
}

function classifyGeneric(cellText, stopNames) {
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (/^堀江六丁目$/.test(first) && /止/.test(cellText || '')) return 'extra:horie6-departure-stop';
  if (/^堀江六丁目$/.test(last) && /止/.test(cellText || '')) return 'extra:horie6-stop';
  if (/京成ローズタウン/.test(first) && /^舞浜駅$/.test(last)) return 'extra:rosetown-maihama';
  if (/京成ローズタウン/.test(first) && /東海大浦安高校入口/.test(last)) return 'extra:rosetown-tokai';
  return null;
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
    out.stopNames = normalizeStopNames(uniqueNames(out.stops));
    out.bodySnippet = data.body.slice(0, 2500);
    out.busstopLinks = data.busstopLinks;
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function scrapeTimetable(page, timetableUrl, label, classifyFn, targetKeys, options = {}) {
  const result = {
    label,
    timetableUrl,
    legend: [],
    tripLinks: [],
    sampled: {},
    lateNightSamples: {},
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
      if (/^\[深夜\]/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const cell = a.closest('td, li, div') || a.parentElement;
      const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
      return { href, text, cellText: cellText.slice(0, 120) };
    });
    return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 5500) };
  });
  result.legend = meta.legend;
  result.bodySnippet = meta.bodySnippet;
  result.tripLinks = meta.tripLinks.map((l) => ({ ...l, absHref: absUrl(l.href) }));

  const scored = result.tripLinks.map((l) => {
    let score = 0;
    const c = l.cellText || '';
    const href = l.href || '';
    if (/ロ/.test(c)) score += 10;
    if (/と/.test(c)) score += 10;
    if (/★/.test(c)) score += 8;
    if (/深夜/.test(c)) score += 8;
    if (!/ロ|と|★|深夜|ち|市|Ｎ|ランド|ホ|あ|明|ひ|そ|ベ|中央/.test(c)) score += 4;
    if (/course=/.test(href)) score += 1;
    if (/\[(?:2|4|5|6|37)\]/.test(c) && !/\[9\]/.test(c)) score -= 25;
    if (options.preferLateNight && isLateNight(c)) score += 12;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, 60);
  const seen = new Set();
  const targets = new Set(targetKeys || []);

  for (const link of picks) {
    const trip = await scrapeTrip(page, link.absHref, link);
    if (trip.stopNames.length < 2) continue;
    const cls =
      classifyFn(link.cellText, trip.stopNames) ||
      classifyGeneric(link.cellText, trip.stopNames);
    const key = cls || `other:${trip.stopNames[0]}→${trip.stopNames[trip.stopNames.length - 1]}`;
    const late = isLateNight(link.cellText);
    const sample = {
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
      lateNight: late,
      nameChecks: nameChecks(trip.stopNames),
    };
    if (late && cls && (cls === '9-rosetown' || cls === '9-tokai')) {
      const lnKey = cls === '9-rosetown' ? '9-rosetown-late-night' : '9-tokai-late-night';
      if (!result.lateNightSamples[lnKey]) result.lateNightSamples[lnKey] = sample;
    }
    if (seen.has(key)) continue;
    result.sampled[key] = sample;
    seen.add(key);
    console.log('GOT', key, late ? '(late)' : '', trip.stopNames.length, trip.stopNames[0], '→', trip.stopNames[trip.stopNames.length - 1]);
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
        berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null,
      };
    }),
  }));
  const route9 = pageInfo.links
    .filter((l) => isRoute9CourseText(l.text))
    .map((c) => ({ ...c, absHref: absUrl(c.href) }));
  return {
    busstopId,
    coursesUrl,
    title: pageInfo.title,
    heading: pageInfo.h,
    all: pageInfo.links.map((c) => ({ ...c, absHref: absUrl(c.href) })),
    route9,
  };
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/pc/busstops?name=${encodeURIComponent(word)}`,
    `${BASE}/busstops?name=${encodeURIComponent(word)}`,
  ];
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="busstop="]')]
          .map((a) => {
            const href = a.getAttribute('href') || '';
            const m = href.match(/busstop=(\d+)/);
            return {
              id: m && m[1],
              text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
              href,
            };
          })
          .filter((x) => x.id)
      );
      if (hits.length) return { searchUrl: u, hits };
    } catch (_) {}
  }
  return { searchUrl: null, hits: [] };
}

function promoteConfirmed(report, key, sample, terminalId, terminalLabel, berth, timetableUrl, legend) {
  if (!sample || report.confirmed[key]) return;
  report.confirmed[key] = {
    ...sample,
    terminalId,
    terminalLabel,
    berth,
    timetableUrl,
    legend,
  };
}

async function sampleTerminal(page, report, terminalId, classifyFn, targetKeys, sectionKey) {
  const courses = await listCourses(page, terminalId);
  report[sectionKey] = courses;
  console.log(sectionKey, 'route9 courses:', courses.route9.length);
  for (const c of courses.route9) console.log(' -', c.berth, c.text.slice(0, 160));

  for (const course of courses.route9.slice(0, 4)) {
    const sampled = await scrapeTimetable(
      page,
      course.absHref,
      `${sectionKey}/${course.berth}`,
      classifyFn,
      targetKeys,
      { preferLateNight: true }
    );
    const bucket = report[`${sectionKey}Samples`] || (report[`${sectionKey}Samples`] = {});
    if (!bucket.primary) {
      bucket.primary = { ...sampled, berth: course.berth, courseText: course.text };
    } else {
      for (const [k, v] of Object.entries(sampled.sampled || {})) {
        if (!bucket.primary.sampled[k]) bucket.primary.sampled[k] = v;
      }
      for (const [k, v] of Object.entries(sampled.lateNightSamples || {})) {
        if (!bucket.primary.lateNightSamples[k]) bucket.primary.lateNightSamples[k] = v;
      }
      if (sampled.legend?.length) {
        bucket.primary.legend = [...new Set([...(bucket.primary.legend || []), ...sampled.legend])];
      }
    }
    for (const key of targetKeys) {
      if (bucket.primary.sampled[key]) {
        promoteConfirmed(
          report,
          key,
          bucket.primary.sampled[key],
          terminalId,
          courses.heading?.split('\n')[0] || sectionKey,
          course.berth,
          course.absHref,
          sampled.legend
        );
      }
    }
    if (targetKeys.every((k) => report.confirmed[k])) break;
  }
  return courses;
}

async function discoverIdFromTrip(report, sampleKey, namePattern) {
  const sample = report.outboundSamples?.primary?.sampled?.[sampleKey];
  if (!sample?.busstopLinks) return null;
  return sample.busstopLinks.filter((b) => namePattern.test(b.text || ''));
}

async function main() {
  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note: 'Transcribed only from Navi trip pages; nothing invented. Filter system 9 only.',
    knownIds: { urayasu: URAYASU, maihama: MAIHAMA, rosetown: null, tokaiEntrance: null },
    expectedMaihamaStops: EXPECTED_MAIHAMA_STOPS,
    urayasuCourses: null,
    outboundSamples: null,
    maihamaCourses: null,
    inboundMaihamaSamples: null,
    tokaiEntranceSearch: null,
    rosetownSearch: null,
    tokaiEntranceCourses: null,
    tokaiEntranceSamples: null,
    rosetownCourses: null,
    rosetownSamples: null,
    extraPatterns: {},
    confirmed: {},
    lateNight: {},
    errors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // 1) Outbound from 浦安駅入口
    await sampleTerminal(
      page,
      report,
      URAYASU,
      classifyOutbound,
      ['9-maihama', '9-rosetown'],
      'urayasuCourses'
    );
    report.outboundSamples = report.urayasuCoursesSamples;

    // late-night outbound ro
    const outLate = report.outboundSamples?.primary?.lateNightSamples?.['9-rosetown-late-night'];
    if (outLate) {
      report.lateNight['9-rosetown'] = {
        serviceType: 'late-night',
        symbol: '★ロ',
        sameSystemKey: '9-rosetown',
        sameStopOrder:
          JSON.stringify(outLate.stopNames) ===
          JSON.stringify(report.confirmed['9-rosetown']?.stopNames || []),
        sample: outLate,
      };
    }

    // 2) Inbound from 舞浜駅
    await sampleTerminal(
      page,
      report,
      MAIHAMA,
      classifyInboundMaihama,
      ['9-urayasu', '9-tokai'],
      'maihamaCourses'
    );
    report.inboundMaihamaSamples = report.maihamaCoursesSamples;

    const inLate = report.inboundMaihamaSamples?.primary?.lateNightSamples?.['9-tokai-late-night'];
    if (inLate) {
      report.lateNight['9-tokai'] = {
        serviceType: 'late-night',
        symbol: '★と',
        sameSystemKey: '9-tokai',
        sameStopOrder:
          JSON.stringify(inLate.stopNames) ===
          JSON.stringify(report.confirmed['9-tokai']?.stopNames || []),
        sample: inLate,
      };
    }

    // Discover busstop ids from outbound trips
    const roseLinks = await discoverIdFromTrip(report, '9-rosetown', /京成ローズタウン/);
    const maihamaLinks = await discoverIdFromTrip(report, '9-maihama', /舞浜駅/);
    report.idDiscovery = { roseLinks, maihamaLinks };

    // 3) Search 京成ローズタウン / 東海大浦安高校入口
    report.rosetownSearch = await findBusstopId(page, '京成ローズタウン');
    report.tokaiEntranceSearch = await findBusstopId(page, '東海大浦安高校入口');
    console.log(
      'SEARCH 京成ローズタウン',
      (report.rosetownSearch.hits || []).slice(0, 8).map((h) => h.id + ':' + h.text).join(' | ')
    );
    console.log(
      'SEARCH 東海大浦安高校入口',
      (report.tokaiEntranceSearch.hits || [])
        .slice(0, 8)
        .map((h) => h.id + ':' + h.text)
        .join(' | ')
    );

    const roseCandidates = [];
    for (const b of roseLinks || []) if (b.id && !roseCandidates.includes(b.id)) roseCandidates.push(b.id);
    for (const h of report.rosetownSearch.hits || []) {
      if (h.id && /京成ローズタウン/.test(h.text) && !roseCandidates.includes(h.id)) roseCandidates.push(h.id);
    }

    const tokaiCandidates = [];
    for (const h of report.tokaiEntranceSearch.hits || []) {
      if (h.id && /東海大浦安高校入口/.test(h.text) && !tokaiCandidates.includes(h.id)) {
        tokaiCandidates.push(h.id);
      }
    }

    // 4) Inbound from 京成ローズタウン
    for (const id of roseCandidates.slice(0, 6)) {
      report.knownIds.rosetown = report.knownIds.rosetown || id;
      await sampleTerminal(
        page,
        report,
        id,
        classifyFromRoseTown,
        ['9-urayasu-rosetown'],
        'rosetownCourses'
      );
      report.rosetownSamples = report.rosetownCoursesSamples;
      for (const [k, v] of Object.entries(report.rosetownSamples?.primary?.sampled || {})) {
        if (k.startsWith('extra:')) report.extraPatterns[k] = v;
      }
      if (report.confirmed['9-urayasu-rosetown']) {
        report.knownIds.rosetown = id;
        break;
      }
    }

    // 5) From 東海大浦安高校入口 → 舞浜駅
    for (const id of tokaiCandidates.slice(0, 6)) {
      report.knownIds.tokaiEntrance = report.knownIds.tokaiEntrance || id;
      await sampleTerminal(
        page,
        report,
        id,
        classifyFromTokaiEntrance,
        ['9-maihama-tokai'],
        'tokaiEntranceCourses'
      );
      report.tokaiEntranceSamples = report.tokaiEntranceCoursesSamples;
      if (report.confirmed['9-maihama-tokai']) {
        report.knownIds.tokaiEntrance = id;
        break;
      }
    }

    // Collect extra patterns from all sampled buckets
    for (const bucket of [
      report.outboundSamples?.primary,
      report.inboundMaihamaSamples?.primary,
      report.rosetownSamples?.primary,
      report.tokaiEntranceSamples?.primary,
    ]) {
      for (const [k, v] of Object.entries(bucket?.sampled || {})) {
        if (k.startsWith('extra:') || k.startsWith('other:')) report.extraPatterns[k] = v;
      }
    }

    if (report.confirmed['9-maihama']) {
      report.expectedMaihamaCheck = {
        expected: EXPECTED_MAIHAMA_STOPS,
        actual: report.confirmed['9-maihama'].stopNames,
        exactMatch:
          JSON.stringify(report.confirmed['9-maihama'].stopNames) ===
          JSON.stringify(EXPECTED_MAIHAMA_STOPS),
        prefixMatch: EXPECTED_MAIHAMA_STOPS.every(
          (exp, i) => report.confirmed['9-maihama'].stopNames[i] === exp
        ),
      };
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
    console.log(' ', k, v.stopCount, v.stopNames[0], '→', v.stopNames[v.stopNames.length - 1]);
  }
  const missing = REQUIRED.filter((k) => !report.confirmed[k]);
  if (missing.length) console.log('MISSING:', missing.join(', '));
  console.log('extra:', Object.keys(report.extraPatterns));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
