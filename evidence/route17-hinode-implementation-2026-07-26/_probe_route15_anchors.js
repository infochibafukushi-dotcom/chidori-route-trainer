'use strict';
/** Read-only probe of the route-15 template so the route-17 generator can target stable anchors. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const s = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), 'utf8');

console.log('--- head ---');
console.log(s.slice(0, s.indexOf('const SPEED_KMH = 20;') + 30));
console.log('--- anchors ---');
const anchors = [
  'const NAMES_15_TAKASU_SEASIDE',
  "const DEFAULT_SYSTEM_KEY = '15-takasu-seaside';",
  "const order = ['15-takasu-seaside', '15-shinurayasu'];",
  'shione-no-machi-15-',
  'shioneNoMachiLine-stop-image',
  'route.description',
  'route.sourcePolicy',
];
for (const a of anchors) console.log(JSON.stringify(a), '=>', s.includes(a));
console.log('--- shione-no-machi- occurrences ---');
console.log([...new Set(s.match(/shione-no-machi-[A-Za-z0-9_-]*/g) || [])].join('\n'));
console.log('--- shioneNoMachi occurrences ---');
console.log([...new Set(s.match(/[A-Za-z]*[Ss]hioneNoMachi[A-Za-z0-9_]*/g) || [])].join('\n'));
console.log('--- SHIONE occurrences ---');
console.log([...new Set(s.match(/SHIONE[A-Z0-9_]*/g) || [])].join('\n'));
console.log('--- 15- keys ---');
console.log([...new Set(s.match(/'15-[a-z-]+'/g) || [])].join('\n'));
console.log('--- description/sourcePolicy ---');
console.log((s.match(/route\.description = '[^']*'/) || [])[0]);
console.log((s.match(/route\.sourcePolicy = '[^']*'/) || [])[0]);
console.log('--- migrateStopId ---');
const mi = s.indexOf('function migrateStopId');
console.log(s.slice(mi, mi + 420));
