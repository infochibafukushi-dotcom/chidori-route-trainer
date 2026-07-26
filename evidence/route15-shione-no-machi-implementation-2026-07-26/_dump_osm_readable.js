'use strict';
/** Human-readable dump of the fetched route-15 OSM relations. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const S = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relations-summary.json'), 'utf8'));
const lines = [];

lines.push(`fetchedAt: ${S.fetchedAt}`);
lines.push(`line: ${S.lineName} / ${S.route}`);
lines.push('');
for (const r of S.relations) {
  lines.push('='.repeat(78));
  lines.push(`relation ${r.id}  ok=${r.ok}  source=${r.source || '-'}`);
  if (!r.ok) { lines.push(`  error: ${r.error}`); continue; }
  lines.push(`  name: ${r.name}`);
  lines.push(`  tags: ${JSON.stringify(r.tags)}`);
  lines.push(`  members: ${r.memberCount} (ways ${r.wayMemberCount}, platforms ${r.platformMemberCount}, stop-role ${r.stopRoleCount})`);
  lines.push(`  roles: ${JSON.stringify(r.memberRoles)}`);
  lines.push('  platforms:');
  (r.platformsDetail || []).forEach((p, i) => {
    lines.push(`    ${String(i + 1).padStart(2)} ${p.name || '(unnamed)'}  ${p.type}/${p.ref}  role=${p.role}  ${p.lat},${p.lon}`);
  });
  lines.push(`  highway tag counts: ${JSON.stringify(r.waysSummary.highway)}`);
  lines.push(`  access tag counts: ${JSON.stringify(r.waysSummary.access)}`);
  lines.push(`  bus tag counts: ${JSON.stringify(r.waysSummary.bus)}`);
  lines.push(`  psv tag counts: ${JSON.stringify(r.waysSummary.psv)}`);
  lines.push(`  ways with access/bus/psv (${r.waysSummary.waysWithAccessBusOrPsvCount}):`);
  for (const w of r.waysSummary.waysWithAccessBusOrPsv) {
    lines.push(`    way ${w.id} ${w.name || ''} highway=${w.highway} access=${w.access} bus=${w.bus} psv=${w.psv} vehicle=${w.vehicle} motor_vehicle=${w.motor_vehicle} oneway=${w.oneway}`);
  }
  lines.push(`  wayMemberIds: ${(r.wayMemberIds || []).join(',')}`);
  lines.push('');
}
lines.push('='.repeat(78));
lines.push('ref=15 probe (bbox 35.60,139.85,35.70,139.96):');
for (const p of S.refProbe || []) {
  lines.push(`  ${p.type} ${p.id} ${JSON.stringify(p.tags || p)}`);
}
lines.push('');
lines.push('name checks:');
for (const [id, c] of Object.entries(S.nameChecks || {})) {
  lines.push(`  ${id} (${c.stopCount} stops): ${c.allNames.join(' > ')}`);
  for (const h of c.hits) lines.push(`    ${h.found ? 'HIT ' : 'MISS'} ${h.needle}${h.matches.length ? ` -> ${h.matches.join('/')}` : ''}`);
}

fs.writeFileSync(path.join(OUT, '_osm_readable.txt'), `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
