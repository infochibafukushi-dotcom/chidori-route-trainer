'use strict';
/**
 * Scrape Keisei Bus Navi for 系統10 高洲線 official stop orders.
 * CRITICAL: Filter system 10 only. Reject system 19 (高洲海浜公園 / 無印 on F berth).
 * Symbol 「み」 = 10系統 みなと南（鉄鋼団地）行き
 * 無印 on same F timetable = 19系統 — DO NOT capture as route-10.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const SHINURAYASU = '00020619'; // 新浦安駅 F候補

const EXPECTED_OUTBOUND = [
  '新浦安駅',
  '入船中央エステート',
  '明海交差点',
  '入船橋',
  '高洲北小学校',
  '東京学館前',
  '高洲二丁目',
  '順天堂大学入口',
  '高洲西児童公園',
  '高洲三丁目',
  '高洲四丁目',
  '鉄鋼団地入口',
  'アライプロバンス',
  'みなと第二',
  'みなと南',
];

const REQUIRED = ['10-minato-minami', '10-shinurayasu'];

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
  return String(name || '').replace(/\s+/g, ' ').trim();
}

function normalizeStopNames(names) {
  return (names || []).map(normalizeStopName);
}

function hasRoute10Mark(cell) {
  return /\[10\]|【\s*[１０10]\s*系統\s*】/.test(cell || '');
}

function hasRoute19Mark(cell) {
  return /\[19\]|【\s*[１９19]\s*系統\s*】/.test(cell || '');
}

/** Reject route-19 and other systems. */
function looksLikeOtherSystem(cell) {
  if (hasRoute10Mark(cell)) return false;
  if (hasRoute19Mark(cell)) return true;
  return /\[(?:2|3|4|5|6|9|11|12|14|15|16|17|18|20|22|23|24|25|37|38)\]/.test(cell || '');
}

function isRoute10CourseText(text) {
  const t = text || '';
  if (/\[19\]|高洲海浜公園|浦安南高校/.test(t) && !/\[10\]/.test(t)) return false;
  if (/\[10\]/.test(t)) return true;
  // F berth course list may say みなと南 without [10] — require みなと/鉄鋼 and not 海浜公園
  if (/みなと南|鉄鋼団地/.test(t) && !/高洲海浜公園|浦安南高校/.test(t)) return true;
  return false;
}

function isRoute19Pattern(stopNames, cellText) {
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const cell = cellText || '';
  if (hasRoute19Mark(cell)) return true;
  if (/高洲海浜公園|浦安南高校|特養/.test(last)) return true;
  if (/高洲海浜公園|浦安南高校/.test(cell) && !/み/.test(cell)) return true;
  // unmarked F berth trips ending at みなと南 are NOT 19; unmarked to 海浜公園 are 19
  return false;
}

function hasMiSymbol(cell) {
  // 「み」 symbol for route 10 — avoid matching inside other words
  return /(?:^|[^\u3040-\u30ff\u4e00-\u9fff])み(?:[^\u3040-\u30ff\u4e00-\u9fff]|$)|【み】|記号.*み|…\s*み/.test(
    cell || '',
  ) || /み/.test(cell || '') && /みなと南|鉄鋼/.test(cell || '');
}

function nameChecks(stopNames) {
  const names = normalizeStopNames(stopNames);
  return {
    stopCount: names.length,
    hasMinatoMinami: names.some((n) => n === 'みなと南'),
    hasSteelEntry: names.some((n) => n === '鉄鋼団地入口'),
    hasTakasu4: names.some((n) => n === '高洲四丁目'),
    hasKaihin: names.some((n) => /高洲海浜公園/.test(n)),
    hasMinamiHigh: names.some((n) => /浦安南高校/.test(n)),
    hasGakkan: names.some((n) => n === '東京学館前'),
    matchesExpectedOutbound:
      names.length === EXPECTED_OUTBOUND.length &&
      EXPECTED_OUTBOUND.every((exp, i) => names[i] === exp),
    route19Contamination: names.some((n) => /高洲海浜公園|浦安南高校|特養ホーム/.test(n)),
  };
}

function classifyOutbound(cellText, stopNames) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (!/新浦安駅/.test(first)) return null;
  if (isRoute19Pattern(names, cell)) return 'reject:route-19';
  if (looksLikeOtherSystem(cell) && !hasRoute10Mark(cell)) return null;
  if (nameChecks(names).route19Contamination) return 'reject:route-19-stops';

  // Require 「み」 or explicit [10] or destination みなと南 with route-10 markers
  const mi = /み/.test(cell) || hasRoute10Mark(cell);
  if (!mi && !/^みなと南$/.test(last)) return null;
  if (!mi && /^みなと南$/.test(last) && !hasRoute10Mark(cell)) {
    // Without み / [10], unmarked may be ambiguous — only accept if legend-confirmed via course text
    // Prefer reject unmarked to avoid 19 confusion; course list filter should already prefer 10.
    return null;
  }

  if (/^みなと南$/.test(last)) return '10-minato-minami';
  if (/^鉄鋼団地入口$/.test(last)) return 'extra:steel-entry-stop';
  if (/^高洲四丁目$/.test(last)) return 'extra:takasu4-stop';
  if (/^アライプロバンス$/.test(last)) return 'extra:arai-stop';
  if (/^みなと第二$/.test(last)) return 'extra:minato2-stop';
  return null;
}

function classifyInbound(cellText, stopNames) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const last = names[names.length - 1] || '';
  const first = names[0] || '';
  if (isRoute19Pattern(names, cell)) return 'reject:route-19';
  if (looksLikeOtherSystem(cell) && !hasRoute10Mark(cell)) return null;
  if (nameChecks(names).route19Contamination) return 'reject:route-19-stops';

  const fromMinato = /^みなと南$/.test(first);
  const fromSteel = /^鉄鋼団地入口$/.test(first);
  const fromTakasu4 = /^高洲四丁目$/.test(first);
  const fromArai = /^アライプロバンス$/.test(first);
  const fromMinato2 = /^みなと第二$/.test(first);
  if (!fromMinato && !fromSteel && !fromTakasu4 && !fromArai && !fromMinato2) return null;

  if (/^新浦安駅$/.test(last)) {
    if (fromMinato) return '10-shinurayasu';
    if (fromSteel) return 'extra:steel-entry-start';
    if (fromTakasu4) return 'extra:takasu4-start';
    if (fromArai) return 'extra:arai-start';
    if (fromMinato2) return 'extra:minato2-start';
  }
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
    systemNumberHint: null,
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
    out.bodySnippet = data.body.slice(0, 3000);
    out.busstopLinks = data.busstopLinks;
    const sys = (data.body.match(/【\s*([０-９0-9]+)\s*系統\s*】/) || [])[1];
    out.systemNumberHint = sys || null;
    if (sys && !/^10$|^１０$/.test(sys)) {
      out.errors.push(`systemNumberHint=${sys} (not 10)`);
    }
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
    rejected: {},
    bodySnippet: null,
    errors: [],
    weekdayHint: options.weekdayHint || null,
  };
  await page.goto(timetableUrl, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  const meta = await page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t) || /み/.test(t)) && /系統|行き|止まり|みなと|高洲/.test(t)) {
        legend.push(t);
      }
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href');
      const text = (a.innerText || '').replace(/\s+/g, ' ').trim();
      const cell = a.closest('td, li, div') || a.parentElement;
      const cellText = cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim() : text;
      return { href, text, cellText: cellText.slice(0, 160) };
    });
    return { legend: [...new Set(legend)], tripLinks, bodySnippet: body.slice(0, 6000) };
  });
  result.legend = meta.legend;
  result.bodySnippet = meta.bodySnippet;
  result.tripLinks = meta.tripLinks.map((l) => ({ ...l, absHref: absUrl(l.href) }));

  const scored = result.tripLinks.map((l) => {
    let score = 0;
    const c = l.cellText || '';
    if (/み/.test(c)) score += 20;
    if (/\[10\]/.test(c)) score += 25;
    if (/みなと南|鉄鋼/.test(c)) score += 8;
    if (/\[19\]|高洲海浜公園|浦安南高校/.test(c)) score -= 40;
    if (!/み|\[10\]/.test(c) && !/みなと/.test(c)) score -= 5;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, 80);
  const seen = new Set();
  const targets = new Set(targetKeys || []);

  for (const link of picks) {
    const trip = await scrapeTrip(page, link.absHref, link);
    if (trip.stopNames.length < 2) continue;
    const cls = classifyFn(link.cellText, trip.stopNames);
    const key = cls || `other:${trip.stopNames[0]}→${trip.stopNames[trip.stopNames.length - 1]}`;
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
      systemNumberHint: trip.systemNumberHint,
      nameChecks: nameChecks(trip.stopNames),
      errors: trip.errors,
      weekdayHint: options.weekdayHint || null,
    };
    if (String(key).startsWith('reject:')) {
      if (!result.rejected[key]) result.rejected[key] = sample;
      console.log('REJECT', key, trip.stopNames[0], '→', trip.stopNames[trip.stopNames.length - 1]);
      continue;
    }
    if (trip.systemNumberHint && !/^10$|^１０$/.test(trip.systemNumberHint) && cls && String(cls).startsWith('10-')) {
      console.log('SKIP non-10 system hint', trip.systemNumberHint, key);
      if (!result.rejected[`reject:sys-${trip.systemNumberHint}`]) {
        result.rejected[`reject:sys-${trip.systemNumberHint}`] = sample;
      }
      continue;
    }
    if (seen.has(key)) continue;
    result.sampled[key] = sample;
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
        berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) : null,
      };
    }),
  }));
  const route10 = pageInfo.links
    .filter((l) => isRoute10CourseText(l.text))
    .map((c) => ({ ...c, absHref: absUrl(c.href) }));
  const route19suspect = pageInfo.links
    .filter((l) => /\[19\]|高洲海浜公園/.test(l.text || ''))
    .map((c) => ({ ...c, absHref: absUrl(c.href) }));
  return {
    busstopId,
    coursesUrl,
    title: pageInfo.title,
    heading: pageInfo.h,
    all: pageInfo.links.map((c) => ({ ...c, absHref: absUrl(c.href) })),
    route10,
    route19suspect,
  };
}

async function findBusstopId(page, word) {
  const urls = [
    `${BASE}/busstops?word=${encodeURIComponent(word)}`,
    `${BASE}/pc/busstops?name=${encodeURIComponent(word)}`,
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
          .filter((x) => x.id),
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

function withDayParam(url, dayIso) {
  if (!url) return url;
  // Prefer datetime= for weekday/holiday sampling when supported
  try {
    const u = new URL(url);
    if (dayIso) u.searchParams.set('datetime', `${dayIso}T12:00`);
    return u.toString();
  } catch (_) {
    return url;
  }
}

async function sampleTerminal(page, report, terminalId, classifyFn, targetKeys, sectionKey, dayIso, dayLabel) {
  const courses = await listCourses(page, terminalId);
  report[sectionKey] = courses;
  console.log(sectionKey, 'route10 courses:', courses.route10.length, 'route19suspect:', courses.route19suspect.length);
  for (const c of courses.route10) console.log(' -', c.berth, c.text.slice(0, 180));

  for (const course of courses.route10.slice(0, 5)) {
    const url = withDayParam(course.absHref, dayIso);
    const sampled = await scrapeTimetable(
      page,
      url,
      `${sectionKey}/${course.berth}/${dayLabel || 'default'}`,
      classifyFn,
      targetKeys,
      { weekdayHint: dayLabel || null },
    );
    const bucket = report[`${sectionKey}Samples`] || (report[`${sectionKey}Samples`] = {});
    const bucketKey = dayLabel || 'primary';
    if (!bucket[bucketKey]) {
      bucket[bucketKey] = { ...sampled, berth: course.berth, courseText: course.text };
    } else {
      for (const [k, v] of Object.entries(sampled.sampled || {})) {
        if (!bucket[bucketKey].sampled[k]) bucket[bucketKey].sampled[k] = v;
      }
      for (const [k, v] of Object.entries(sampled.rejected || {})) {
        if (!bucket[bucketKey].rejected[k]) bucket[bucketKey].rejected[k] = v;
      }
      if (sampled.legend?.length) {
        bucket[bucketKey].legend = [...new Set([...(bucket[bucketKey].legend || []), ...sampled.legend])];
      }
    }
    for (const key of targetKeys) {
      if (bucket[bucketKey].sampled[key]) {
        promoteConfirmed(
          report,
          key,
          bucket[bucketKey].sampled[key],
          terminalId,
          courses.heading?.split('\n')[0] || sectionKey,
          course.berth,
          url,
          sampled.legend,
        );
      }
    }
    // Also record extras
    for (const [k, v] of Object.entries(bucket[bucketKey].sampled || {})) {
      if (String(k).startsWith('extra:')) report.extraPatterns[k] = v;
    }
    if (targetKeys.every((k) => report.confirmed[k])) break;
  }
  return courses;
}

async function main() {
  // 2026-07-25 is Saturday (holiday calendar). Use weekday 2026-07-24 and holiday 2026-07-25.
  const WEEKDAY = '2026-07-24';
  const HOLIDAY = '2026-07-25';

  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note:
      'System 10 only. Symbol み = みなと南. Reject [19] / 高洲海浜公園 / unmarked 19 patterns. Nothing invented.',
    knownIds: { shinurayasu: SHINURAYASU, minatoMinami: null },
    expectedOutbound: EXPECTED_OUTBOUND,
    required: REQUIRED,
    weekdayDate: WEEKDAY,
    holidayDate: HOLIDAY,
    shinurayasuCourses: null,
    outboundWeekdaySamples: null,
    outboundHolidaySamples: null,
    minatoSearch: null,
    minatoCourses: null,
    inboundWeekdaySamples: null,
    inboundHolidaySamples: null,
    extraPatterns: {},
    confirmed: {},
    errors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await sampleTerminal(
      page,
      report,
      SHINURAYASU,
      classifyOutbound,
      ['10-minato-minami'],
      'shinurayasuCourses',
      WEEKDAY,
      'weekday',
    );
    report.outboundWeekdaySamples = report.shinurayasuCoursesSamples;

    await sampleTerminal(
      page,
      report,
      SHINURAYASU,
      classifyOutbound,
      ['10-minato-minami'],
      'shinurayasuHolidayCourses',
      HOLIDAY,
      'holiday',
    );
    report.outboundHolidaySamples = report.shinurayasuHolidayCoursesSamples;

    // Discover みなと南 busstop
    report.minatoSearch = await findBusstopId(page, 'みなと南');
    console.log(
      'SEARCH みなと南',
      (report.minatoSearch.hits || []).slice(0, 10).map((h) => h.id + ':' + h.text).join(' | '),
    );

    const outSample = report.confirmed['10-minato-minami'];
    const fromTrip = (outSample?.busstopLinks || []).filter((b) => /みなと南/.test(b.text || ''));
    const minatoCandidates = [];
    for (const b of fromTrip) if (b.id && !minatoCandidates.includes(b.id)) minatoCandidates.push(b.id);
    for (const h of report.minatoSearch.hits || []) {
      if (h.id && /みなと南/.test(h.text) && !minatoCandidates.includes(h.id)) minatoCandidates.push(h.id);
    }
    report.knownIds.minatoMinami = minatoCandidates[0] || null;
    console.log('minatoCandidates', minatoCandidates);

    for (const id of minatoCandidates.slice(0, 4)) {
      report.knownIds.minatoMinami = report.knownIds.minatoMinami || id;
      await sampleTerminal(
        page,
        report,
        id,
        classifyInbound,
        ['10-shinurayasu'],
        'minatoCourses',
        WEEKDAY,
        'weekday',
      );
      report.inboundWeekdaySamples = report.minatoCoursesSamples;
      if (report.confirmed['10-shinurayasu']) break;
    }

    if (report.knownIds.minatoMinami) {
      await sampleTerminal(
        page,
        report,
        report.knownIds.minatoMinami,
        classifyInbound,
        ['10-shinurayasu'],
        'minatoHolidayCourses',
        HOLIDAY,
        'holiday',
      );
      report.inboundHolidaySamples = report.minatoHolidayCoursesSamples;
    }

    report.missingRequired = REQUIRED.filter((k) => !report.confirmed[k]);
    report.summary = {
      confirmedKeys: Object.keys(report.confirmed),
      extras: Object.keys(report.extraPatterns),
      outboundMatchExpected: report.confirmed['10-minato-minami']?.nameChecks?.matchesExpectedOutbound || false,
      inboundStopCount: report.confirmed['10-shinurayasu']?.stopCount || null,
      route19RejectedSeen: Boolean(
        report.outboundWeekdaySamples?.weekday?.rejected?.['reject:route-19'] ||
          report.outboundHolidaySamples?.holiday?.rejected?.['reject:route-19'],
      ),
    };
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    await browser.close();
  }

  const outPath = path.join(OUT_DIR, '_navi_scrape_raw.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('wrote', outPath);
  console.log('confirmed', Object.keys(report.confirmed));
  console.log('extras', Object.keys(report.extraPatterns));
  console.log('missing', report.missingRequired);
  if (report.confirmed['10-minato-minami']) {
    console.log('OUT', report.confirmed['10-minato-minami'].stopNames.join(' → '));
  }
  if (report.confirmed['10-shinurayasu']) {
    console.log('IN', report.confirmed['10-shinurayasu'].stopNames.join(' → '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
