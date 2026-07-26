'use strict';
/** Inspect timetable legends, follow-up course lists and per-signature evidence. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const GATE = JSON.parse(fs.readFileSync(path.join(OUT, '_signature_gate.json'), 'utf8'));
const DEEP = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_deep_raw.json'), 'utf8'));
const lines = [];

lines.push('== FOLLOW-UP COURSE LISTS ==');
for (const [name, f] of Object.entries(DEEP.followUps || {})) {
  lines.push(`  ${name} busstop=${f.busstopId} ${f.coursesUrl || ''}`);
  lines.push(`    note: ${f.note || '-'}`);
  lines.push(`    all courses (${(f.courses || []).length}):`);
  for (const c of f.courses || []) lines.push(`      berth=${c.berth} | ${c.text}`);
  lines.push(`    route15-marked courses (${(f.route15Courses || []).length}):`);
  for (const c of f.route15Courses || []) lines.push(`      berth=${c.berth} | ${c.text}`);
}
lines.push('');
lines.push('== TIMETABLES VISITED (deep) ==');
for (const tt of DEEP.timetables || []) {
  lines.push(`  terminal=${tt.terminal} berth=${tt.berth} day=${tt.dayLabel} links=${tt.tripLinkCount}`);
  lines.push(`    course: ${tt.courseText}`);
  lines.push(`    url: ${tt.url}`);
  for (const l of tt.legend || []) lines.push(`    legend: ${l}`);
}
lines.push('');
lines.push('== SIGNATURE DETAIL ==');
for (const s of GATE.signatures) {
  lines.push('-'.repeat(70));
  lines.push(`${s.verdict} | stops ${s.stopCount} | trips ${s.tripCount} | terminal ${s.terminal} | berth ${s.berth}`);
  lines.push(`  course ${s.course} / seq ${s.courseSequence}`);
  lines.push(`  courseText: ${s.courseText}`);
  lines.push(`  cellSymbols: ${s.cellSymbols.join(' , ')}`);
  lines.push(`  legendRouteNumbers: ${s.legendRouteNumbers.join('/')}`);
  lines.push(`  dayLabels: ${(s.dayLabels || []).join(',')}`);
  lines.push(`  stops: ${s.stopNames.join(' > ')}`);
  lines.push(`  ids:   ${(s.stopIds || []).join(',')}`);
  lines.push(`  sampleUrl: ${s.sampleUrls[0]}`);
  lines.push('  legendRaw:');
  for (const l of s.legendRaw || []) lines.push(`    ${l}`);
  lines.push('  bodySnippet:');
  lines.push(String(s.bodySnippet || '').split('\n').slice(0, 40).map((x) => `    | ${x}`).join('\n'));
}

fs.writeFileSync(path.join(OUT, '_gate_readable.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log('wrote _gate_readable.txt');
