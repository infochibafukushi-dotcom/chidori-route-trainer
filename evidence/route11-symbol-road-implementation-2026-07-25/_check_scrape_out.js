'use strict';
const fs = require('fs');
const p = '_navi_scrape_partial.json';
const r = '_navi_scrape_raw.json';
for (const f of [p, r]) {
  if (!fs.existsSync(f)) {
    console.log(f, 'MISSING');
    continue;
  }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(
    f,
    'trips',
    (j.trips || []).length,
    'sigs',
    Object.keys(j.tripSignatures || {}).length,
    'flush',
    j.partialFlushReason || '-',
    'at',
    j.scrapedAt || j.partialFlushAt,
  );
  console.log(
    'keys',
    (j.trips || []).map((t) => t.proposedSystemKey).join(', '),
  );
  console.log('knownIds', JSON.stringify(j.knownIds));
}
