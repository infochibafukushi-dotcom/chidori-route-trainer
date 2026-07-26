'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const out = {};
for (const [key, sys] of Object.entries(BUILD.systems)) {
  const order = ORDERS.systems[key];
  out[key] = {
    relationId: sys.relationId,
    composition: sys.composition,
    compositionMeta: sys.compositionMeta,
    platformByIndex: Boolean(order?.platformByIndex),
    stopNames: order.stopNames,
    platformDists: (sys.platformDists || []).map((p, index) => ({ ...p, index })),
    osmPlatformOrderMatchesOfficial: (sys.orderIssues || []).length === 0 && !(sys.missingPlatforms || []).length,
  };
}
fs.writeFileSync(path.join(OUT, 'osm-platform-mapping.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('wrote osm-platform-mapping.json');
