'use strict';
/**
 * 高洲四丁目経由の14停留所パターン（course 0008200292 / 0008200291）が
 * 【１５系統】なのか【１９系統】なのかを、出発のりばの時刻表凡例で確定させる。
 *
 * 背景:
 *   高洲北小学校 のりば01/02 の時刻表は同一セルに [10]/[15]/[19] を混載するが、
 *   凡例には「無印…【１５系統】東京学館前経由 高洲海浜公園行き」と
 *   「み…【１０系統】…」しか無く、19系統に符号が割り当てられていない。
 *   つまりこのページの「無印」は 15 と 19 を区別できない（凡例が不完全）。
 *
 * 判定方法:
 *   便の「出発停留所ののりば」を特定し、そののりばのコースセル／凡例を読む。
 *     - 新浦安駅 のりばE  … [15]/[18]（15系統の新浦安駅発はここだけ）
 *     - 新浦安駅 のりばF  … [10]/[19]（東京学館前・高洲四丁目経由）
 *     - 高洲海浜公園 のりば03 … [15]/[18]
 *     - 高洲海浜公園 のりば19 … [19]（高洲四丁目・東京学館前経由）新浦安駅行
 *   そのうえで、14停留所パターンの便が どののりばの時刻表に載るか を実際に確認する。
 *
 * Output: _probe_takasu4chome_variant.json / _probe_takasu4chome_variant.txt
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT_DIR = __dirname;
const BASE = 'https://transfer-cloud.navitime.biz/keiseibus-group';
const HOST = 'https://transfer-cloud.navitime.biz';
const GATE = JSON.parse(fs.readFileSync(path.join(OUT_DIR, '_signature_gate.json'), 'utf8'));

const absUrl = (h) => (!h ? null : h.startsWith('http') ? h : HOST + h);
const toAscii = (s) => String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30));

const TARGET_COURSES = ['0008200292', '0008200291'];
const BUSSTOPS = [
  { label: '新浦安駅', id: '00020619' },
  { label: '高洲海浜公園', id: '00020855' },
];

function parseLegend(legend) {
  const rows = [];
  for (const line of legend || []) {
    const m = String(line).match(/^(.*?)(?:…|･･･|\.\.\.)\s*【\s*([０-９0-9]+)\s*系統\s*】\s*(.*)$/);
    if (!m) continue;
    rows.push({ symbolRaw: m[1].trim(), symbol: m[1].trim() === '無印' ? '' : m[1].trim(), routeNumber: toAscii(m[2]), description: m[3].trim(), line: String(line) });
  }
  return rows;
}

async function coursesOf(page, busstopId) {
  await page.goto(`${BASE}/courses?busstop=${busstopId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  return page.evaluate(() => [...document.querySelectorAll('a[href*="course-sequence"], a[href*="course="]')].map((a) => {
    const tr = a.closest('tr');
    const cell = tr && tr.querySelector('th, td');
    return {
      href: a.getAttribute('href'),
      text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      berth: cell ? (cell.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) : null,
    };
  }));
}

async function timetableInfo(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);
  return page.evaluate(() => {
    const body = document.body.innerText;
    const legend = [];
    body.split(/\n/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      if (/【\s*[０-９0-9]+\s*系統\s*】/.test(t) && !legend.includes(t)) legend.push(t);
      if (/\[\d{1,2}\]/.test(t) && !legend.includes(t)) legend.push(t);
      if (/…|･･･/.test(t) && /系統|行き|止まり|経由/.test(t) && !legend.includes(t)) legend.push(t);
    });
    const tripLinks = [...document.querySelectorAll('a[href*="/stops?"]')].map((a) => {
      const href = a.getAttribute('href') || '';
      const cell = a.closest('td, li, div') || a.parentElement;
      return { href, cellText: (cell ? (cell.innerText || '') : '').replace(/\s+/g, ' ').trim().slice(0, 60) };
    });
    return { legend: [...new Set(legend)].slice(0, 60), tripLinks, heading: (document.querySelector('h1,h2')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) };
  });
}

async function main() {
  const out = {
    checkedAt: new Date().toISOString(),
    question: '高洲四丁目経由の14停留所パターン（course 0008200292 / 0008200291）は15系統か19系統か',
    targetCourses: TARGET_COURSES,
    targetSignatures: GATE.signatures
      .filter((s) => TARGET_COURSES.includes(String(s.course)))
      .map((s) => ({ course: s.course, verdict: s.verdict, terminal: s.terminal, berth: s.berth, stopNames: s.stopNames, sampleUrl: s.sampleUrls[0] })),
    busstops: {},
    conclusion: null,
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    locale: 'ja-JP',
  });
  const page = await context.newPage();

  try {
    for (const bs of BUSSTOPS) {
      const raw = await coursesOf(page, bs.id);
      const seen = new Set();
      const courses = [];
      for (const c of raw) {
        const abs = absUrl(c.href);
        if (!abs || seen.has(abs)) continue;
        seen.add(abs);
        courses.push({ ...c, absHref: abs });
      }
      const entry = { busstopId: bs.id, coursesUrl: `${BASE}/courses?busstop=${bs.id}`, courses: [], };
      for (const c of courses) {
        const info = await timetableInfo(page, `${c.absHref}${c.absHref.includes('?') ? '&' : '?'}datetime=2026-07-27T05:00`);
        const hostsTarget = info.tripLinks.filter((l) => TARGET_COURSES.some((cc) => String(l.href).includes(`course=${cc}`)));
        entry.courses.push({
          berth: c.berth,
          courseText: c.text,
          timetableUrl: c.absHref,
          legendRaw: info.legend,
          legendParsed: parseLegend(info.legend),
          tripLinkCount: info.tripLinks.length,
          hostsTargetCourseCount: hostsTarget.length,
          hostsTargetCourses: [...new Set(hostsTarget.map((l) => (String(l.href).match(/course=(\d+)/) || [])[1]))],
          targetCellSymbols: [...new Set(hostsTarget.map((l) => (l.cellText.match(/^\d{1,2}\s*(.*)$/) || [])[1] || '(無印)'))].slice(0, 8),
        });
        console.log(bs.label, 'berth', c.berth, 'links', info.tripLinks.length, 'target', hostsTarget.length);
      }
      out.busstops[bs.label] = entry;
    }
  } catch (e) {
    out.error = String(e.message || e);
    console.error(e);
  } finally {
    await browser.close();
  }

  // Which berth hosts each target course, and what does that berth's legend say?
  const findings = [];
  for (const [label, entry] of Object.entries(out.busstops)) {
    for (const c of entry.courses) {
      if (!c.hostsTargetCourseCount) continue;
      findings.push({
        busstop: label,
        berth: c.berth,
        courseText: c.courseText,
        hostsTargetCourses: c.hostsTargetCourses,
        targetCellSymbols: c.targetCellSymbols,
        legendForSymbols: c.targetCellSymbols.map((sym) => {
          const s = sym === '(無印)' ? '' : sym;
          const row = c.legendParsed.find((r) => r.symbol === s);
          return { symbol: sym, routeNumber: row?.routeNumber || null, line: row?.line || null };
        }),
        legendRaw: c.legendRaw,
      });
    }
  }
  out.findings = findings;
  const routeNumbers = [...new Set(findings.flatMap((f) => f.legendForSymbols.map((x) => x.routeNumber)).filter(Boolean))];
  out.conclusion = {
    berthsHostingTargetCourses: findings.map((f) => `${f.busstop} のりば${f.berth}`),
    resolvedRouteNumbers: routeNumbers,
    isRoute15: routeNumbers.length === 1 && routeNumbers[0] === '15',
  };

  fs.writeFileSync(path.join(OUT_DIR, '_probe_takasu4chome_variant.json'), JSON.stringify(out, null, 2), 'utf8');

  const lines = [];
  lines.push(out.question);
  lines.push('');
  for (const [label, entry] of Object.entries(out.busstops)) {
    lines.push(`== ${label} (${entry.busstopId}) ==`);
    for (const c of entry.courses) {
      lines.push(`  のりば${c.berth} | links=${c.tripLinkCount} | 対象course便=${c.hostsTargetCourseCount} ${c.hostsTargetCourses.join(',')}`);
      lines.push(`    course: ${c.courseText}`);
      for (const l of c.legendRaw) lines.push(`    legend: ${l}`);
      if (c.hostsTargetCourseCount) lines.push(`    対象便の符号: ${c.targetCellSymbols.join(' , ')}`);
    }
    lines.push('');
  }
  lines.push('== FINDINGS ==');
  for (const f of findings) {
    lines.push(`  ${f.busstop} のりば${f.berth} hosts ${f.hostsTargetCourses.join(',')}`);
    for (const x of f.legendForSymbols) lines.push(`    符号 ${x.symbol} -> 系統 ${x.routeNumber || '(凡例なし)'} : ${x.line || '-'}`);
  }
  lines.push('');
  lines.push(`CONCLUSION: ${JSON.stringify(out.conclusion)}`);
  fs.writeFileSync(path.join(OUT_DIR, '_probe_takasu4chome_variant.txt'), `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
