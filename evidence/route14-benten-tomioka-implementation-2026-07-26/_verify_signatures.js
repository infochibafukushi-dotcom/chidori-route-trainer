'use strict';
/**
 * Gate every candidate signature against the timetable legend (符号→【Ｎ系統】).
 * 千鳥車庫 berth 02 merges [2]/[4]/[6]/[14] into one course cell, so course text alone
 * is NOT proof of route 14. Each trip must map to a legend line that says 【１４系統】.
 *
 * Output: _signature_gate.json  (machine) and official-stop-orders.json input material.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const HOST = 'https://transfer-cloud.navitime.biz';
const DEEP = JSON.parse(fs.readFileSync(path.join(OUT_DIR, '_navi_deep_raw.json'), 'utf8'));

const toAscii = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

/** Symbol prefix of a timetable cell, e.g. "19ち" -> "ち", "05い" -> "い", "37" -> "" (無印). */
function cellSymbol(cellText) {
  const t = String(cellText || '').trim();
  const m = t.match(/^\d{1,2}\s*(.*)$/);
  return m ? m[1].trim() : t;
}

/** Parse legend lines of the form "ち…【１４系統】...千鳥車庫行き" */
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

async function bodyOf(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => document.body.innerText);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  // Legend per course-sequence, re-read fresh so we have the authoritative text.
  const ttByCourse = {};
  for (const tt of DEEP.timetables) {
    const m = String(tt.url).match(/course-sequence=(\d+)-/);
    const cs = m ? m[1] : tt.url;
    if (!ttByCourse[cs]) ttByCourse[cs] = { courseSequence: cs, url: tt.url, terminal: tt.terminal, berth: tt.berth, courseText: tt.courseText, legend: tt.legend };
  }

  const result = {
    checkedAt: new Date().toISOString(),
    policy: '各便は「時刻表凡例の符号→【Ｎ系統】」で系統を判定する。コース名に[14]が含まれるだけでは不十分（千鳥車庫のりば02は[2]/[4]/[6]/[14]混載）。',
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
    // A trip's 系統 comes from the legend of the timetable page it was listed on,
    // not from its own course id (one timetable hosts several courses/symbols).
    const legendRows = parseLegend(trip?.legend || []);

    const symbols = [...new Set((sig.cellTexts || []).map(cellSymbol))];
    const legendMatches = [];
    for (const s of symbols) {
      const rows = legendRows.filter((r) => r.symbol === s);
      for (const r of rows) legendMatches.push({ symbol: s || '(無印)', ...r });
    }
    const routeNumbers = [...new Set(legendMatches.map((r) => r.routeNumber))];

    // Independent proof: open one trip page and look for 【Ｎ系統】 in the body.
    let bodyRouteNumbers = [];
    let bodySnippet = null;
    try {
      const body = await bodyOf(page, sig.sampleUrls[0]);
      bodySnippet = body.slice(0, 1500);
      bodyRouteNumbers = [...new Set([...toAscii(body).matchAll(/【\s*(\d{1,2})\s*系統\s*】/g)].map((m) => m[1]))];
    } catch (e) {
      bodySnippet = `ERROR ${e.message || e}`;
    }

    const isRoute14 = routeNumbers.length === 1 && routeNumbers[0] === '14';
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
      legendRouteNumbers: routeNumbers,
      tripPageRouteNumbers: bodyRouteNumbers,
      verdict: isRoute14 ? 'ACCEPT-route14' : (routeNumbers.length ? `REJECT-route-${routeNumbers.join('/')}` : 'UNDECIDED-no-legend-match'),
      stopNames: sig.stopNames,
      stopIds: sig.stopIds,
      platformIds: sig.platformIds,
      idComplete: sig.idComplete,
      departureTimes: sig.departureTimes,
      dayLabels: sig.dayLabels,
      sampleUrls: sig.sampleUrls,
      bodySnippet,
    });
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, '_signature_gate.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log('wrote _signature_gate.json');
  for (const s of result.signatures) {
    console.log(s.verdict, '| stops', s.stopCount, '| course', s.course, '| symbols', s.cellSymbols.join(','), '| legend', s.legendRouteNumbers.join('/'), '| body', s.tripPageRouteNumbers.join('/'));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
