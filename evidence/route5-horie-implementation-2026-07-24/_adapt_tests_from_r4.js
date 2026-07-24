'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const srcIntegrity = fs.readFileSync(
  path.join(root, 'evidence/route4-tomioka-implementation-2026-07-24/_pathhash_integrity_test.js'),
  'utf8',
);
const srcDrive = fs.readFileSync(
  path.join(root, 'evidence/route4-tomioka-implementation-2026-07-24/_continuous_drive.js'),
  'utf8',
);
const srcShots = fs.readFileSync(
  path.join(root, 'evidence/route4-tomioka-implementation-2026-07-24/_render_shots.js'),
  'utf8',
);

function adaptIntegrity(src) {
  return src
    .replace(/8791/g, '8801')
    .replace(
      /\[[\s\n]*'4-maihama',[\s\n]*'4-tdl',[\s\n]*'4-chidori',[\s\n]*'4-urayasu-maihama',[\s\n]*'4-urayasu-tdl',[\s\n]*'4-urayasu-chidori',?[\s\n]*\]/,
      "[\n  '5-shinurayasu',\n  '5-ntt',\n  '5-urayasu',\n  '5-tokai',\n  '5-higashino-chuo',\n]",
    )
    .replace(/TOMIOKA_/g, 'HORIE_')
    .replace(/tomioka/g, 'horie')
    .replace(/route-4/g, 'route-5')
    .replace(/4-tdl/g, '5-shinurayasu')
    .replace(/富岡線/g, '堀江線')
    .replace(/nocache=pathhash/g, 'nocache=r5pathhash');
}

function adaptDrive(src) {
  return src
    .replace(/8772/g, '8802')
    .replace(
      /\[[\s\n]*'4-maihama',[\s\n]*'4-tdl',[\s\n]*'4-chidori',[\s\n]*'4-urayasu-maihama',[\s\n]*'4-urayasu-tdl',[\s\n]*'4-urayasu-chidori',?[\s\n]*\]/,
      "[\n  '5-shinurayasu',\n  '5-ntt',\n  '5-urayasu',\n  '5-tokai',\n  '5-higashino-chuo',\n]",
    )
    .replace(/TOMIOKA_/g, 'HORIE_')
    .replace(/tomioka-route-v1\.js/g, 'horie-route-v1.js')
    .replace(/tomioka/g, 'horie')
    .replace(/route-4/g, 'route-5')
    .replace(/nocache=r4/g, 'nocache=r5')
    .replace(/ui-pc-route4\.png/g, 'ui-pc-route5.png')
    .replace(/ui-sp390-route4\.png/g, 'ui-sp390-route5.png')
    .replace(/regression\.route3/g, 'regression.route3')
    .replace(/selectOption\('#routeSelect', 'route-3'\)/, "selectOption('#routeSelect', 'route-3')")
    // also capture route-4 hashes in regression
    .replace(
      /report\.regression\.route2 = await page\.evaluate/,
      `report.regression.route4 = await page.evaluate(() => {
      const r = data.routes.find((x) => x.id === 'route-4');
      const out = {};
      for (const [k, s] of Object.entries(r?.systems || {})) {
        out[k] = { path: s.path?.length, pathHash: s.pathHash, resolvedVersion: s.resolvedVersion, stops: s.stops?.length };
      }
      return out;
    });
    await page.selectOption('#routeSelect', 'route-2');
    await page.waitForTimeout(800);
    report.regression.route2 = await page.evaluate`,
    );
}

const outDir = path.join(root, 'evidence/route5-horie-implementation-2026-07-24');
fs.writeFileSync(path.join(outDir, '_pathhash_integrity_test.js'), adaptIntegrity(srcIntegrity));
fs.writeFileSync(path.join(outDir, '_continuous_drive.js'), adaptDrive(srcDrive));
console.log('wrote integrity + continuous drive');
