'use strict';
/**
 * Nail down the 深夜バス（★） / 短縮（新浦安駅発着・高洲北小学校止まり）separation for route-18.
 *
 * The gate merged courses 0008200289 and 0008200290 into one 16-stop signature. Both must be
 * read straight off the departure-berth timetable so we can state, from the source, which
 * symbol each course carries and whether ★ (deep-night, double fare) is a separate course
 * with the same stop order — never inferred.
 *
 * Dumps, per departure berth timetable, every trip cell with its symbol, course id and
 * departure time, plus the full legend, for weekday / saturday / sunday.
 *
 * Output: _night_shortturn_probe.json / _night_shortturn_probe.txt
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = __dirname;
const HOST = 'https://transfer-cloud.navitime.biz';
const BASE = `${HOST}/keiseibus-group`;

const DATES = [
  { iso: '2026-07-27', label: 'weekday' },
  { iso: '2026-08-01', label: 'saturday' },
  { iso: '2026-08-02', label: 'sunday-holiday' },
];

/** Departure berths that host the accepted route-18 courses. */
const TARGETS = [
  { label: '新浦安駅 のりばE', busstop: '00020619', courseSequence: '0008200278-1' },
  { label: '高洲海浜公園 のりば03', busstop: '00020855', courseSequence: '0008200277-1' },
  { label: '浦安駅入口 のりば11', busstop: '00020739', courseSequence: '0008200211-1' },
];

/** Courses the legend gate accepted for route-18, plus the sibling course sharing berth E. */
const ROUTE18_COURSES = ['0008200285', '0008200286', '0008200287', '0008200288', '0008200289', '0008200290'];
const ROUTE15_COURSES = ['0008200277', '0008200278'];

const toAscii = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

function cellSymbol(cellText) {
  const t = String(cellText || '').trim();
  const m = t.match(/^\d{1,2}\s*(.*)$/);
  return m ? m[1].trim() : t;
}

function parseLegend(legend) {
  const rows = [];
  for (const line of legend || []) {
    const m = String(line).match(/^(.*?)(?:…|･･･|\.\.\.)\s*【\s*([０-９0-9]+)\s*系統\s*】\s*(.*)$/);
    if (!m) continue;
    rows.push({
      symbol: m[1].trim() === '無印' ? '' : m[1].trim(),
      symbolRaw: m[1].trim(),
      routeNumber: toAscii(m[2]),
      description: m[3].trim(),
      line: String(line),
    });
  }
  return rows;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  const out = {
    checkedAt: new Date().toISOString(),
    purpose: '深夜バス（★）と短縮便（新浦安駅発着／高洲北小学校止まり）の系統・符号・コースを出発のりばの時刻表から直読みする。',
    route18Courses: ROUTE18_COURSES,
    route15CoursesSharingBerth: ROUTE15_COURSES,
    berths: [],
  };

  for (const target of TARGETS) {
    for (const day of DATES) {
      const url = `${BASE}/courses/timetables?busstop=${target.busstop}&course-sequence=${target.courseSequence}&datetime=${day.iso}T05:00`;
      console.log('TT', target.label, day.label);
      let info;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(1000);
        info = await page.evaluate(() => {
          const body = document.body.innerText;
          const legend = [];
          body.split(/\n/).forEach((line) => {
            const t = line.trim();
            if (!t) return;
            if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
            if (/…|･･･/.test(t) && /系統|行き|止まり|経由/.test(t) && !legend.includes(t)) legend.push(t);
          });
          const trips = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
            const href = a.getAttribute('href') || '';
            const cell = a.closest('td, li, div') || a.parentElement;
            const row = a.closest('tr');
            return {
              href,
              course: (href.match(/course=(\d+)/) || [])[1] || null,
              cellText: (cell ? (cell.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 40),
              hour: row ? (row.querySelector('th')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 10) : null,
            };
          });
          return { legend: [...new Set(legend)].slice(0, 60), trips };
        });
      } catch (e) {
        out.berths.push({ ...target, dayLabel: day.label, url, error: String(e.message || e) });
        continue;
      }

      const legendParsed = parseLegend(info.legend);
      const byCourse = {};
      for (const t of info.trips) {
        if (!t.course) continue;
        const sym = cellSymbol(t.cellText);
        if (!byCourse[t.course]) byCourse[t.course] = { course: t.course, symbols: {}, tripCount: 0, samples: [] };
        const entry = byCourse[t.course];
        entry.tripCount += 1;
        entry.symbols[sym || '(無印)'] = (entry.symbols[sym || '(無印)'] || 0) + 1;
        if (entry.samples.length < 40) entry.samples.push({ hour: t.hour, cellText: t.cellText, symbol: sym || '(無印)' });
      }
      for (const entry of Object.values(byCourse)) {
        entry.legendBySymbol = Object.keys(entry.symbols).map((s) => {
          const sym = s === '(無印)' ? '' : s;
          const row = legendParsed.find((r) => r.symbol === sym);
          return { symbol: s, routeNumber: row?.routeNumber || null, legendLine: row?.line || null };
        });
        entry.isRoute18Course = ROUTE18_COURSES.includes(entry.course);
      }

      out.berths.push({
        ...target, dayLabel: day.label, url,
        legendRaw: info.legend,
        legendParsed,
        tripTotal: info.trips.length,
        courses: Object.values(byCourse).sort((a, b) => a.course.localeCompare(b.course)),
      });
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, '_night_shortturn_probe.json'), JSON.stringify(out, null, 2), 'utf8');

  const lines = [];
  for (const b of out.berths) {
    lines.push(`=== ${b.label} / ${b.dayLabel} ===`);
    if (b.error) { lines.push(`  ERROR ${b.error}`); continue; }
    lines.push('  legend:');
    for (const r of b.legendParsed) lines.push(`    ${r.symbolRaw} -> 系統${r.routeNumber} : ${r.description}`);
    for (const c of b.courses) {
      const tag = c.isRoute18Course ? 'ROUTE18' : '';
      lines.push(`  course ${c.course} ${tag} trips ${c.tripCount} symbols ${JSON.stringify(c.symbols)}`);
      for (const l of c.legendBySymbol) lines.push(`      符号${l.symbol} -> 系統${l.routeNumber || '(凡例なし)'} : ${l.legendLine || '-'}`);
      lines.push(`      hours: ${c.samples.map((s) => `${s.hour}:${s.cellText}`).join(' | ')}`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT, '_night_shortturn_probe.txt'), `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
