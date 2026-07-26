'use strict';
/**
 * Gate every candidate signature against the timetable legend (符号→【Ｎ系統】).
 * 2段ゲート: (A) listing legend, (B) departure-berth legend (決定打).
 * Route-20 (千鳥線) must be REJECTed even when sharing 千鳥車庫 berth 02 (mixed with route-20).
 *
 * Output: _signature_gate.json / _signatures_dump.txt
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const ROUTE_NUM = '22';
const SIBLING_ROUTE = '20';
const DEEP = JSON.parse(fs.readFileSync(path.join(OUT_DIR, '_navi_deep_raw.json'), 'utf8'));

const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAscii = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

function cellSymbol(cellText) {
  const t = String(cellText || '').trim();
  const m = t.match(/^\d{1,2}\s*(.*)$/);
  if (m) return m[1].trim();
  if (/^\[循環\]/.test(t)) return '循環';
  if (/^\[20\s*直通\]/.test(t) || /^20\s*直通/.test(t)) return '直通';
  return t.slice(0, 20);
}

function parseLegend(legend) {
  const rows = [];
  for (const line of legend || []) {
    const m = String(line).match(/^(.*?)(?:…|･･･|\.\.\.)\s*【\s*([０-９0-9]+)\s*系統\s*】\s*(.*)$/);
    if (!m) continue;
    rows.push({
      symbolRaw: m[1].trim(),
      symbol: m[1].trim() === '無印' ? '' : m[1].trim(),
      routeNumber: toAscii(m[2]),
      description: m[3].trim(),
      line: String(line),
    });
  }
  return rows;
}

async function coursesOf(page, busstopId) {
  await page.goto(`${BASE}/courses?busstop=${busstopId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1100);
  const raw = await page.evaluate(() => [...document.querySelectorAll('a[href*="course-sequence"], a[href*="course="]')].map((a) => {
    const tr = a.closest('tr');
    const cell = tr && tr.querySelector('th, td');
    return {
      href: a.getAttribute('href'),
      text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null,
    };
  }));
  const seen = new Set();
  const list = [];
  for (const c of raw) {
    const abs = absUrl(c.href);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    list.push({ ...c, berthLabel: String(c.berth || '').replace(/\s*地図\s*/g, ' ').trim().slice(0, 40) || null, absHref: abs });
  }
  return list;
}

async function timetableInfo(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
      if (/…|･･･/.test(t) && /系統|行き|止まり|経由|循環|急行|直通/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href') || '';
      const cell = a.closest('td, li, div') || a.parentElement;
      return { href, cellText: (cell ? (cell.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 80) };
    });
    return { legend: [...new Set(legend)].slice(0, 80), tripLinks };
  });
}

const berthCache = new Map();

async function berthsOf(page, busstopId) {
  if (berthCache.has(busstopId)) return berthCache.get(busstopId);
  const out = [];
  let courses = [];
  try { courses = await coursesOf(page, busstopId); } catch (_) {
    berthCache.set(busstopId, out);
    return out;
  }
  for (const c of courses) {
    let info;
    try {
      info = await timetableInfo(page, `${c.absHref}${c.absHref.includes('?') ? '&' : '?'}datetime=2026-07-27T05:00`);
    } catch (_) { continue; }
    const symbolsByCourse = {};
    for (const l of info.tripLinks) {
      const cid = (String(l.href).match(/course=(\d+)/) || [])[1];
      if (!cid) continue;
      const sym = cellSymbol(l.cellText);
      if (!symbolsByCourse[cid]) symbolsByCourse[cid] = new Set();
      symbolsByCourse[cid].add(sym);
    }
    out.push({
      berthLabel: c.berthLabel,
      courseText: c.text,
      timetableUrl: c.absHref,
      legendRaw: info.legend,
      legendParsed: parseLegend(info.legend),
      courseIds: Object.keys(symbolsByCourse),
      symbolsByCourse: Object.fromEntries(Object.entries(symbolsByCourse).map(([k, v]) => [k, [...v]])),
    });
    console.log('  berth', busstopId, c.berthLabel, 'courses', Object.keys(symbolsByCourse).join(','));
  }
  berthCache.set(busstopId, out);
  return out;
}

async function departureBerthProof(page, busstopId, courseId) {
  if (!busstopId || !courseId) return { resolved: false, reason: 'departure busstop or course unknown' };
  const berths = await berthsOf(page, busstopId);
  const hosting = berths.filter((b) => b.courseIds.includes(String(courseId)));
  if (!hosting.length) return { resolved: false, reason: 'no berth timetable at the departure stop lists this course', busstopId, courseId };
  const rows = [];
  for (const b of hosting) {
    for (const sym of b.symbolsByCourse[String(courseId)] || []) {
      const row = b.legendParsed.find((r) => r.symbol === sym);
      rows.push({
        berthLabel: b.berthLabel,
        courseText: b.courseText,
        timetableUrl: b.timetableUrl,
        symbol: sym || '(無印)',
        routeNumber: row?.routeNumber || null,
        legendLine: row?.line || null,
      });
    }
  }
  const numbers = [...new Set(rows.map((r) => r.routeNumber).filter(Boolean))];
  return {
    resolved: numbers.length === 1,
    routeNumbers: numbers,
    routeNumber: numbers.length === 1 ? numbers[0] : null,
    rows,
    busstopId,
    courseId,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  const ttByCourse = {};
  for (const tt of DEEP.timetables) {
    const m = String(tt.url).match(/course-sequence=(\d+)-/);
    const cs = m ? m[1] : tt.url;
    if (!ttByCourse[cs]) ttByCourse[cs] = { courseSequence: cs, url: tt.url, terminal: tt.terminal, berth: tt.berth, courseText: tt.courseText, legend: tt.legend };
  }

  const result = {
    checkedAt: new Date().toISOString(),
    routeNumber: ROUTE_NUM,
    siblingRouteNumber: SIBLING_ROUTE,
    policy: '(A) 掲載時刻表の凡例 と (B) 出発のりばの時刻表の凡例 の二段で系統を判定する。'
      + '千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載されるため、(B) 出発のりば凡例を決定打とする。',
    timetableLegends: {},
    signatures: [],
  };

  for (const [cs, tt] of Object.entries(ttByCourse)) {
    const rows = parseLegend(tt.legend);
    result.timetableLegends[cs] = {
      terminal: tt.terminal, berth: tt.berth, courseText: tt.courseText, url: tt.url,
      legendRaw: tt.legend, legendParsed: rows,
      routeNumbersPresent: [...new Set(rows.map((r) => r.routeNumber))],
    };
  }

  for (const [sigKey, sig] of Object.entries(DEEP.signatures)) {
    const trip = DEEP.trips.find((t) => t.stopNames.join('>') === sigKey);
    const cs = trip?.courseSequence || (trip?.course ? `${trip.course}` : null);
    const legendRows = parseLegend(trip?.legend || []);

    const symbols = [...new Set((sig.cellTexts || []).map(cellSymbol))];
    const legendMatches = [];
    for (const s of symbols) {
      for (const r of legendRows.filter((r) => r.symbol === s)) legendMatches.push({ symbol: s || '(無印)', ...r });
    }
    const listingRouteNumbers = [...new Set(legendMatches.map((r) => r.routeNumber))];

    const depBusstopId = (sig.stopIds || [])[0] || DEEP.discoveredBusstopIds[sig.stopNames[0]] || null;
    console.log('departure-berth proof for course', trip?.course, 'origin', sig.stopNames[0], 'dep', depBusstopId);
    const depProof = await departureBerthProof(page, depBusstopId ? String(depBusstopId).split('-')[0] : null, trip?.course);
    depProof.originStopName = sig.stopNames[0];
    depProof.listingBusstopId = trip?.departureBusstopId || null;

    const depIs20 = depProof.resolved && depProof.routeNumber === ROUTE_NUM;
    const listingContradicts = listingRouteNumbers.length > 0 && !listingRouteNumbers.includes(ROUTE_NUM);
    let verdict;
    if (depIs20 && !listingContradicts) verdict = `ACCEPT-route${ROUTE_NUM}`;
    else if (depProof.resolved && depProof.routeNumber === SIBLING_ROUTE) verdict = `REJECT-route-${SIBLING_ROUTE}`;
    else if (depProof.resolved && depProof.routeNumber !== ROUTE_NUM) verdict = `REJECT-route-${depProof.routeNumber}`;
    else if (listingRouteNumbers.length) verdict = `REJECT-route-${listingRouteNumbers.join('/')}`;
    else verdict = 'UNDECIDED-no-legend-match';

    result.signatures.push({
      stopCount: sig.stopCount,
      tripCount: sig.count,
      terminal: sig.terminal,
      berth: (sig.berths || []).join(','),
      course: trip?.course || null,
      courseSequence: cs,
      courseText: trip?.courseText || null,
      cellSymbols: symbols.map((s) => s || '(無印)'),
      legendRaw: trip?.legend || [],
      legendMatches,
      legendRouteNumbers: listingRouteNumbers,
      departureBusstopId: depBusstopId,
      departureBerthProof: depProof,
      departureBerthRouteNumber: depProof.routeNumber || null,
      verdict,
      stopNames: sig.stopNames,
      stopIds: sig.stopIds,
      platformIds: sig.platformIds,
      idComplete: sig.idComplete,
      departureTimes: sig.departureTimes,
      dayLabels: sig.dayLabels,
      sampleUrls: sig.sampleUrls,
    });
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, '_signature_gate.json'), JSON.stringify(result, null, 2), 'utf8');

  const lines = [];
  for (const s of result.signatures) {
    lines.push(`${s.verdict} | stops ${s.stopCount} | trips ${s.tripCount} | terminal ${s.terminal} | berth ${s.berth} | course ${s.course} | symbols ${s.cellSymbols.join(',')} | listing ${s.legendRouteNumbers.join('/') || '-'} | depBerth ${s.departureBerthRouteNumber || '-'}`);
    lines.push(`    ${s.stopNames.join(' > ')}`);
    for (const r of (s.departureBerthProof?.rows || [])) {
      lines.push(`    departure berth: ${r.berthLabel} 符号${r.symbol} -> 系統${r.routeNumber || '?'} : ${r.legendLine || '-'}`);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, '_signatures_dump.txt'), `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
  console.log('wrote _signature_gate.json / _signatures_dump.txt');
}

main().catch((e) => { console.error(e); process.exit(1); });
