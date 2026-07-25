'use strict';
const fs = require('fs');
const path = require('path');
const srcDir = path.join(__dirname, '..', 'route9-maihama-implementation-2026-07-25');
const dstDir = __dirname;

function adapt(name, extraRepls = []) {
  let s = fs.readFileSync(path.join(srcDir, name), 'utf8');
  const repls = [
    [/route-9/g, 'route-10'],
    [/route9/g, 'route10'],
    [/舞浜線/g, '高洲線'],
    [/MAIHAMA_LINE/g, 'TAKASU_LINE'],
    [/maihama-line/g, 'takasu-line'],
    [/maihamaLine/g, 'takasuLine'],
    [/messageHasMaihamaBanner/g, 'messageHasTakasuBanner'],
    [/8809/g, '8819'],
    [/8810/g, '8820'],
    [/8811/g, '8821'],
    [/r9pathhash/g, 'r10pathhash'],
    [/r9drive/g, 'r10drive'],
    [/r9ui/g, 'r10ui'],
    [/r9uisp/g, 'r10uisp'],
    ...extraRepls,
  ];
  for (const [a, b] of repls) s = s.replace(a, b);
  fs.writeFileSync(path.join(dstDir, name), s);
  console.log('wrote', name);
}

adapt('_pathhash_integrity_test.js', [
  [
    /const SYSTEMS = \[[\s\S]*?\];/,
    "const SYSTEMS = [\n  '10-minato-minami',\n  '10-shinurayasu',\n];",
  ],
  [/'9-maihama'/g, "'10-minato-minami'"],
]);

adapt('_continuous_drive.js', [
  [
    /const SYSTEMS = \[[\s\S]*?\];/,
    "const SYSTEMS = [\n  '10-minato-minami',\n  '10-shinurayasu',\n];",
  ],
]);

// Geometry: adapt then fix SYSTEMS and VISUAL lists
{
  let s = fs.readFileSync(path.join(srcDir, '_geometry_intersection_report.js'), 'utf8');
  s = s
    .replace(/route-9/g, 'route-10')
    .replace(/舞浜線/g, '高洲線')
    .replace(/MAIHAMA_LINE/g, 'TAKASU_LINE')
    .replace(/maihama-line/g, 'takasu-line');
  s = s.replace(
    /const SYSTEMS = \[[\s\S]*?\];/,
    "const SYSTEMS = [\n  '10-minato-minami',\n  '10-shinurayasu',\n];",
  );
  s = s.replace(
    /const VISUAL_Z19_BY_SYSTEM = \{[\s\S]*?\};/,
    `const VISUAL_Z19_BY_SYSTEM = {
  '10-minato-minami': [
    '10-minato-shinurayasu-start-z19.png',
    '10-minato-meikai-crossing-z19.png',
    '10-minato-irifunebashi-z19.png',
    '10-minato-gakkan-z19.png',
    '10-minato-takasu4-branch-z20.png',
    '10-minato-steel-entry-z19.png',
    '10-minato-arai-z19.png',
    '10-minato-minato2-z19.png',
    '10-minato-minato-end-z19.png',
  ],
  '10-shinurayasu': [
    '10-shinurayasu-minato-start-z19.png',
    '10-shinurayasu-steel-entry-z19.png',
    '10-shinurayasu-takasu4-z20.png',
    '10-shinurayasu-gakkan-z19.png',
    '10-shinurayasu-irifunebashi-z19.png',
    '10-shinurayasu-station-entry-z19.png',
    '10-shinurayasu-station-end-z19.png',
  ],
};`,
  );
  fs.writeFileSync(path.join(dstDir, '_geometry_intersection_report.js'), s);
  console.log('wrote _geometry_intersection_report.js');
}

console.log('adapt core done');
