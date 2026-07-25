'use strict';
/**
 * Supplement scrape: 系統10 inbound みなと南 → 新浦安駅
 * Uses confirmed outbound trip to recover みなと南 busstop id (link text is often generic).
 * Reject [19] / 高洲海浜公園 / 浦安南高校. Require 【１０系統】 when present on trip page.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const RAW_PATH = path.join(OUT_DIR, '_navi_scrape_raw.json');
const SUPPLEMENT_PATH = path.join(OUT_DIR, '_navi_inbound_supplement.json');
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const WEEKDAY = '2026-07-24';
const HOLIDAY = '2026-07-25';

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

function isMinatoStart(name) {
  return /^みなと南(（鉄鋼団地）)?$/.test(name || '');
}

function hasRoute10Mark(cell) {
  return /\[10\]|【\s*[１０10]\s*系統\s*】/.test(cell || '');
}

function hasRoute19Mark(cell) {
  return /\[19\]|【\s*[１９19]\s*系統\s*】/.test(cell || '');
}

function looksLikeOtherSystem(cell) {
  if (hasRoute10Mark(cell)) return false;
  if (hasRoute19Mark(cell)) return true;
  return /\[(?:2|3|4|5|6|9|11|12|14|15|16|17|18|20|22|23|24|25|37|38)\]/.test(cell || '');
}

/** Course list filter: want [10] / 新浦安駅行き / 東京学館; NOT [19] / 高洲海浜公園 alone. */
function isInboundRoute10CourseText(text) {
  const t = text || '';
  if (/\[19\]/.test(t) && !/\[10\]/.test(t)) return false;
  if (/高洲海浜公園/.test(t) && !/\[10\]/.test(t) && !/新浦安駅/.test(t)) return false;
  if (/\[10\]/.test(t)) return true;
  if (/新浦安駅/.test(t) && /東京学館/.test(t)) return true;
  if (/新浦安駅/.test(t) && /みなと|鉄鋼|高洲/.test(t) && !/高洲海浜公園/.test(t)) return true;
  return false;
}

function classifyInbound(cellText, stopNames, systemNumberHint) {
  const cell = cellText || '';
  const names = normalizeStopNames(stopNames);
  const first = names[0] || '';
  const last = names[names.length - 1] || '';

  if (names.some((n) => /高洲海浜公園|浦安南高校/.test(n))) return 'reject:route-19-stops';
  if (hasRoute19Mark(cell) && !hasRoute10Mark(cell)) return 'reject:route-19';
  if (looksLikeOtherSystem(cell) && !hasRoute10Mark(cell)) return null;

  if (systemNumberHint && !/^10$|^１０$/.test(systemNumberHint)) {
    return `reject:sys-${systemNumberHint}`;
  }

  if (!isMinatoStart(first)) return null;
  if (!/^新浦安駅$/.test(last)) return null;

  // Prefer explicit system-10 confirmation when available
  if (systemNumberHint && /^10$|^１０$/.test(systemNumberHint)) return '10-shinurayasu';
  if (hasRoute10Mark(cell) || /【\s*[１０10]\s*系統\s*】/.test(cell)) return '10-shinurayasu';
  // Accept when trip page body already checked for system hint separately (null = unavailable)
  if (!systemNumberHint) return '10-shinurayasu:needs-system-confirm';
  return '10-shinurayasu';
}

function isExactReverse(inbound, outbound) {
  if (!inbound?.length || !outbound?.length) return false;
  if (inbound.length !== outbound.length) return false;
  const rev = [...outbound].reverse();
  return inbound.every((n, i) => n === rev[i]);
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
    bodyHasSystem10: false,
    bodyHasSystem19: false,
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
    out.bodySnippet = data.body.slice(0, 4000);
    out.busstopLinks = data.busstopLinks;
    const sys = (data.body.match(/【\s*([０-９0-9]+)\s*系統\s*】/) || [])[1];
    out.systemNumberHint = sys || null;
    out.bodyHasSystem10 = /【\s*[１０10]\s*系統\s*】|\[10\]/.test(data.body);
    out.bodyHasSystem19 = /【\s*[１９19]\s*系統\s*】|\[19\]/.test(data.body);
    if (sys && !/^10$|^１０$/.test(sys)) {
      out.errors.push(`systemNumberHint=${sys} (not 10)`);
    }
  } catch (e) {
    out.errors.push(String(e.message || e));
  }
  return out;
}

async function listCourses(page, busstopId) {
  const coursesUrl = `${BASE}/courses?busstop=${busstopId}`;
  await page.goto(coursesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    h: (document.querySelector('h1,h2')?.innerText || '').slice(0, 200),
    bodySnippet: document.body.innerText.slice(0, 4000),
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
    .filter((l) => isInboundRoute10CourseText(l.text))
    .map((c) => ({ ...c, absHref: absUrl(c.href) }));
  const route19suspect = pageInfo.links
    .filter((l) => /\[19\]|高洲海浜公園/.test(l.text || '') && !isInboundRoute10CourseText(l.text))
    .map((c) => ({ ...c, absHref: absUrl(c.href) }));
  return {
    busstopId,
    coursesUrl,
    title: pageInfo.title,
    heading: pageInfo.h,
    bodySnippet: pageInfo.bodySnippet,
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
      if (hits.length) return { searchUrl: u, word, hits };
    } catch (_) {}
  }
  return { searchUrl: null, word, hits: [] };
}

function withDayParam(url, dayIso) {
  try {
    const u = new URL(url);
    if (dayIso) u.searchParams.set('datetime', `${dayIso}T12:00`);
    return u.toString();
  } catch (_) {
    return url;
  }
}

async function scrapeTimetable(page, timetableUrl, label, options = {}) {
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
      if ((/…|･･･|\.\.\./.test(t) || /無印/.test(t) || /み/.test(t)) && /系統|行き|止まり|みなと|高洲|新浦安/.test(t)) {
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
    if (/\[10\]/.test(c)) score += 25;
    if (/み/.test(c)) score += 15;
    if (/新浦安|東京学館|みなと|鉄鋼/.test(c)) score += 8;
    if (/\[19\]|高洲海浜公園|浦安南高校/.test(c)) score -= 40;
    return { ...l, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, 60);
  const seen = new Set();

  for (const link of picks) {
    const trip = await scrapeTrip(page, link.absHref, link);
    if (trip.stopNames.length < 2) continue;

    let cls = classifyInbound(link.cellText, trip.stopNames, trip.systemNumberHint);
    // Promote needs-system-confirm when body shows system 10 markers
    if (cls === '10-shinurayasu:needs-system-confirm' && trip.bodyHasSystem10 && !trip.bodyHasSystem19) {
      cls = '10-shinurayasu';
    } else if (cls === '10-shinurayasu:needs-system-confirm' && trip.bodyHasSystem10) {
      // Mixed 10/19 on page — still OK if stop list is clean (already checked)
      cls = '10-shinurayasu';
    } else if (cls === '10-shinurayasu:needs-system-confirm') {
      // No system confirmation available — keep as provisional but do not promote to confirmed
      cls = 'provisional:10-shinurayasu-no-sys';
    }

    // Require system 10 confirmation when available in page body
    if (cls === '10-shinurayasu' && trip.systemNumberHint && !/^10$|^１０$/.test(trip.systemNumberHint)) {
      cls = `reject:sys-${trip.systemNumberHint}`;
    }

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
      bodyHasSystem10: trip.bodyHasSystem10,
      bodyHasSystem19: trip.bodyHasSystem19,
      errors: trip.errors,
      weekdayHint: options.weekdayHint || null,
    };

    if (String(key).startsWith('reject:')) {
      if (!result.rejected[key]) result.rejected[key] = sample;
      console.log('REJECT', key, trip.stopNames[0], '→', trip.stopNames[trip.stopNames.length - 1]);
      continue;
    }
    if (seen.has(key)) continue;
    result.sampled[key] = sample;
    seen.add(key);
    console.log('GOT', key, trip.stopNames.length, trip.stopNames[0], '→', trip.stopNames[trip.stopNames.length - 1]);
    if (seen.has('10-shinurayasu')) break;
  }
  return result;
}

function pairStopIdsFromOutbound(confirmed) {
  const names = confirmed.stopNames || [];
  const links = confirmed.busstopLinks || [];
  // Prefer links whose href date matches trip; take unique sequential ids after breadcrumb
  const sequenced = [];
  const seen = new Set();
  for (const link of links) {
    if (!link.id) continue;
    // Keep order of first occurrence of each id in trip stop list region
    if (seen.has(link.id)) continue;
    // Skip early breadcrumb duplicates of origin when we already have shinurayasu
    seen.add(link.id);
    sequenced.push(link);
  }
  // Heuristic: last N unique ids where N === stop count, else zip by index after dropping first 2 breadcrumb-ish
  let stopLinks = sequenced;
  if (sequenced.length >= names.length) {
    stopLinks = sequenced.slice(sequenced.length - names.length);
  } else if (links.length >= names.length + 2) {
    // breadcrumb (2) + per-stop links
    stopLinks = links.slice(2, 2 + names.length);
  }

  const paired = names.map((name, i) => ({
    stopName: name,
    id: stopLinks[i]?.id || null,
    text: stopLinks[i]?.text || null,
    href: stopLinks[i]?.href || null,
  }));
  return paired;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));
  const outbound = raw.confirmed?.['10-minato-minami'];
  if (!outbound?.sampleUrl) {
    throw new Error('confirmed[10-minato-minami] missing — run outbound scrape first');
  }

  const report = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    note:
      'Inbound supplement for system 10 only. Classify 10-shinurayasu when first=みなと南(（鉄鋼団地）)? last=新浦安駅 and no 高洲海浜公園/浦安南高校. Require 【１０系統】 when present.',
    weekdayDate: WEEKDAY,
    holidayDate: HOLIDAY,
    outboundSampleUrl: outbound.sampleUrl,
    outboundStopNames: outbound.stopNames,
    pairedFromOutbound: null,
    searches: {},
    candidates: [],
    candidateCourses: {},
    weekdaySamples: {},
    holidaySamples: {},
    confirmed: null,
    provisional: null,
    exactReverseOfOutbound: null,
    errors: [],
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // Refresh outbound trip page to collect busstop ids
    console.log('Refreshing outbound trip', outbound.sampleUrl);
    const tripFresh = await scrapeTrip(page, outbound.sampleUrl, { from: 'confirmed-outbound' });
    const paired = pairStopIdsFromOutbound({
      stopNames: tripFresh.stopNames.length ? tripFresh.stopNames : outbound.stopNames,
      busstopLinks: tripFresh.busstopLinks.length ? tripFresh.busstopLinks : outbound.busstopLinks,
    });
    report.pairedFromOutbound = paired;
    report.outboundTripRefresh = {
      stopNames: tripFresh.stopNames,
      systemNumberHint: tripFresh.systemNumberHint,
      bodyHasSystem10: tripFresh.bodyHasSystem10,
      title: tripFresh.title,
    };

    const fromOutbound = paired.filter((p) => isMinatoStart(p.stopName) || /鉄鋼団地入口/.test(p.stopName));
    console.log(
      'Paired みなと/鉄鋼:',
      fromOutbound.map((p) => `${p.stopName}=${p.id}`).join(' | '),
    );

    // Search busstops
    for (const word of ['みなと南', 'みなと南（鉄鋼団地）', '鉄鋼団地入口']) {
      report.searches[word] = await findBusstopId(page, word);
      console.log(
        'SEARCH',
        word,
        (report.searches[word].hits || []).slice(0, 8).map((h) => `${h.id}:${h.text}`).join(' | ') || '(none)',
      );
    }

    const candidateIds = [];
    const addCand = (id, reason) => {
      if (!id) return;
      if (!candidateIds.find((c) => c.id === id)) candidateIds.push({ id, reason });
    };
    for (const p of paired) {
      if (isMinatoStart(p.stopName)) addCand(p.id, `outbound-pair:${p.stopName}`);
    }
    for (const word of ['みなと南', 'みなと南（鉄鋼団地）']) {
      for (const h of report.searches[word]?.hits || []) {
        if (/みなと南/.test(h.text || '')) addCand(h.id, `search:${word}`);
      }
    }
    // Steel entry fallback after minato candidates
    for (const p of paired) {
      if (/鉄鋼団地入口/.test(p.stopName)) addCand(p.id, 'outbound-pair:鉄鋼団地入口');
    }
    for (const h of report.searches['鉄鋼団地入口']?.hits || []) {
      if (/鉄鋼団地入口/.test(h.text || '')) addCand(h.id, 'search:鉄鋼団地入口');
    }

    report.candidates = candidateIds;
    console.log('candidates', candidateIds);

    for (const cand of candidateIds.slice(0, 6)) {
      const courses = await listCourses(page, cand.id);
      report.candidateCourses[cand.id] = {
        reason: cand.reason,
        heading: courses.heading,
        coursesUrl: courses.coursesUrl,
        route10: courses.route10,
        route19suspect: courses.route19suspect,
        allCount: courses.all.length,
      };
      console.log(
        `courses@${cand.id}`,
        'route10=',
        courses.route10.length,
        courses.route10.map((c) => `${c.berth}:${c.text.slice(0, 100)}`).join(' || '),
      );

      for (const course of courses.route10.slice(0, 4)) {
        for (const [dayIso, dayLabel] of [
          [WEEKDAY, 'weekday'],
          [HOLIDAY, 'holiday'],
        ]) {
          const url = withDayParam(course.absHref, dayIso);
          console.log('timetable', dayLabel, cand.id, course.berth, url);
          const sampled = await scrapeTimetable(page, url, `${cand.id}/${course.berth}/${dayLabel}`, {
            weekdayHint: dayLabel,
          });
          const bucket = dayLabel === 'weekday' ? report.weekdaySamples : report.holidaySamples;
          const key = `${cand.id}/${course.berth}`;
          if (!bucket[key]) {
            bucket[key] = { ...sampled, berth: course.berth, courseText: course.text, busstopId: cand.id };
          } else {
            for (const [k, v] of Object.entries(sampled.sampled || {})) {
              if (!bucket[key].sampled[k]) bucket[key].sampled[k] = v;
            }
            for (const [k, v] of Object.entries(sampled.rejected || {})) {
              if (!bucket[key].rejected[k]) bucket[key].rejected[k] = v;
            }
          }

          const hit = bucket[key].sampled['10-shinurayasu'];
          if (hit && !report.confirmed) {
            report.confirmed = {
              ...hit,
              terminalId: cand.id,
              terminalLabel: courses.heading?.split('\n')[0] || cand.id,
              berth: course.berth,
              timetableUrl: url,
              legend: sampled.legend,
              courseText: course.text,
              candidateReason: cand.reason,
            };
            report.exactReverseOfOutbound = isExactReverse(
              hit.stopNames,
              outbound.stopNames || report.outboundStopNames,
            );
            console.log('CONFIRMED 10-shinurayasu', hit.stopNames.join(' → '));
            console.log('exactReverseOfOutbound', report.exactReverseOfOutbound);
          }
          const prov = bucket[key].sampled['provisional:10-shinurayasu-no-sys'];
          if (prov && !report.provisional) {
            report.provisional = {
              ...prov,
              terminalId: cand.id,
              berth: course.berth,
              timetableUrl: url,
              courseText: course.text,
              candidateReason: cand.reason,
            };
          }
        }
        if (report.confirmed) break;
      }
      if (report.confirmed) break;
    }
  } catch (e) {
    report.errors.push(String(e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    await browser.close();
  }

  fs.writeFileSync(SUPPLEMENT_PATH, JSON.stringify(report, null, 2));
  console.log('wrote', SUPPLEMENT_PATH);

  // Merge into raw if confirmed
  if (report.confirmed) {
    raw.confirmed = raw.confirmed || {};
    raw.confirmed['10-shinurayasu'] = report.confirmed;
    raw.knownIds = raw.knownIds || {};
    raw.knownIds.minatoMinami = report.confirmed.terminalId;
    raw.inboundSupplement = {
      scrapedAt: report.scrapedAt,
      supplementPath: '_navi_inbound_supplement.json',
      exactReverseOfOutbound: report.exactReverseOfOutbound,
      candidates: report.candidates,
    };
    raw.inboundWeekdaySamples = report.weekdaySamples;
    raw.inboundHolidaySamples = report.holidaySamples;
    raw.missingRequired = (raw.required || ['10-minato-minami', '10-shinurayasu']).filter(
      (k) => !raw.confirmed[k],
    );
    raw.summary = {
      ...(raw.summary || {}),
      confirmedKeys: Object.keys(raw.confirmed),
      inboundStopCount: report.confirmed.stopCount,
      inboundExactReverseOfOutbound: report.exactReverseOfOutbound,
    };
    raw.errors = [...(raw.errors || []), ...report.errors];
    fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2));
    console.log('merged into', RAW_PATH);
  } else {
    console.log('NOT CONFIRMED — raw file not updated with 10-shinurayasu');
    // Still attach supplement pointer / searches for debugging without inventing confirmed inbound
    raw.inboundSupplementAttempt = {
      scrapedAt: report.scrapedAt,
      supplementPath: '_navi_inbound_supplement.json',
      candidates: report.candidates,
      searches: Object.fromEntries(
        Object.entries(report.searches).map(([k, v]) => [k, { searchUrl: v.searchUrl, hitCount: (v.hits || []).length }]),
      ),
      confirmed: false,
      provisional: report.provisional
        ? {
            stopNames: report.provisional.stopNames,
            sampleUrl: report.provisional.sampleUrl,
            systemNumberHint: report.provisional.systemNumberHint,
          }
        : null,
      errors: report.errors,
    };
    fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2));
    console.log('wrote attempt metadata into raw (no confirmed inbound)');
  }

  if (report.confirmed) {
    console.log('IN', report.confirmed.stopNames.join(' → '));
    console.log(
      JSON.stringify(
        {
          sampleUrl: report.confirmed.sampleUrl,
          berth: report.confirmed.berth,
          cellText: report.confirmed.cellText,
          systemNumberHint: report.confirmed.systemNumberHint,
          exactReverseOfOutbound: report.exactReverseOfOutbound,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
