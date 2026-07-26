'use strict';
/** Readable dump of the discovery scrape: searches, courses per terminal, signatures. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const R = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));
const lines = [];

lines.push(`scrapedAt: ${R.scrapedAt}`);
lines.push(`stats: ${JSON.stringify(R.stats)}`);
lines.push('');
lines.push('== SEARCHES ==');
for (const [word, s] of Object.entries(R.searches || {})) {
  lines.push(`  ${word}: ${s.hits.length} hits (${s.searchUrl || 'no url'})`);
  for (const h of (s.hits || []).slice(0, 8)) lines.push(`     ${h.id} ${h.text}`);
}
lines.push('');
lines.push('== TERMINALS / COURSES ==');
for (const [k, t] of Object.entries(R.terminals || {})) {
  lines.push(`  [${k}] ${t.label} busstop=${t.busstopId} (${t.coursesUrl})`);
  lines.push(`     all courses: ${t.all.length}, route15: ${t.route15.length}`);
  for (const c of t.all) {
    const mark = (t.route15 || []).some((x) => x.absHref === c.absHref) ? '*15*' : '    ';
    lines.push(`     ${mark} berth=${c.berthLetter} | ${c.text}`);
  }
}
lines.push('');
lines.push('== TIMETABLE LEGENDS ==');
for (const tt of R.timetables || []) {
  lines.push(`  ${tt.terminal} ${tt.dayLabel} berth=${tt.berth} links=${tt.tripLinkCount}`);
  for (const l of tt.legend || []) lines.push(`     ${l}`);
}
lines.push('');
lines.push('== SIGNATURES (discovery) ==');
for (const [, v] of Object.entries(R.tripSignatures || {})) {
  lines.push(`  ${v.proposedSystemKey} | stops ${v.stopNames.length} | count ${v.count} | courses ${v.courses.join(',')} | berths ${v.berths.join(',')}`);
  lines.push(`     ${v.stopNames.join(' > ')}`);
  lines.push(`     ids: ${(v.stopIds || []).join(',')}`);
  lines.push(`     url: ${v.sampleUrls[0]}`);
}
lines.push('');
lines.push('== UNCONFIRMED ==');
for (const u of R.unconfirmedTrips || []) lines.push(`  ${u.reason} | ${u.stopNames.join(' > ')}`);
lines.push('');
lines.push('== REJECTED (other routes) ==');
for (const r of (R.rejected?.rejectedOther || []).slice(0, 40)) {
  lines.push(`  ${r.reason} | ${(r.stopNames || []).join(' > ')} | ${r.cellText || ''}`);
}

fs.writeFileSync(path.join(OUT, '_courses_dump.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log('wrote _courses_dump.txt');
