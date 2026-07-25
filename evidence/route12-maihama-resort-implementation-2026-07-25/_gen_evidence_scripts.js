const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const R10 = path.resolve(__dirname, '..', 'route10-takasu-implementation-2026-07-25');
const R11 = path.resolve(__dirname, '..', 'route11-symbol-road-implementation-2026-07-25');
const SYSTEMS = ['12-maihama-via-resort', '12-urayasu-via-resort'];

function adapt(src) {
  let s = src;
  const pairs = [
    ['route-11', 'route-12'],
    ['route-10', 'route-12'],
    ['シンボルロード線', '舞浜リゾート線'],
    ['高洲線', '舞浜リゾート線'],
    ['SYMBOL_ROAD_LINE_', 'MAIHAMA_RESORT_LINE_'],
    ['TAKASU_LINE_', 'MAIHAMA_RESORT_LINE_'],
    ['symbol-road-line-', 'maihama-resort-line-'],
    ['takasu-line-', 'maihama-resort-line-'],
    ['symbol-road-line', 'maihama-resort-line'],
    ['takasu-line', 'maihama-resort-line'],
    ["'11-urayasu-hinode'", "'12-maihama-via-resort'"],
    ["'11-urayasu-sogo-via-hinode-kominkan'", "'12-urayasu-via-resort'"],
    ["'10-minato-minami'", "'12-maihama-via-resort'"],
    ["'10-shinurayasu'", "'12-urayasu-via-resort'"],
    ['chidori-route-map-v73', 'chidori-route-map-v74'],
    ['chidori-route-map-v72', 'chidori-route-map-v74'],
    ['hokuei-no-uturn-v17.js?v=73', 'hokuei-no-uturn-v17.js?v=74'],
    ['hokuei-no-uturn-v17.js?v=72', 'hokuei-no-uturn-v17.js?v=74'],
    ['nocache=r11', 'nocache=r12'],
    ['nocache=r10', 'nocache=r12'],
    ['messageHasSymbolRoadBanner', 'messageHasMaihamaResortBanner'],
    ['messageHasTakasuBanner', 'messageHasMaihamaResortBanner'],
    ['シンボルロード線の走行データを確認できません', '舞浜リゾート線の走行データを確認できません'],
    ['高洲線の走行データを確認できません', '舞浜リゾート線の走行データを確認できません'],
  ];
  for (const [a, b] of pairs) s = s.split(a).join(b);
  return s;
}

// continuous drive from r10 (simpler 2 systems)
{
  let s = fs.readFileSync(path.join(R10, '_continuous_drive.js'), 'utf8');
  s = adapt(s);
  s = s.replace(/const SYSTEMS = \[[\s\S]*?\];/, `const SYSTEMS = ${JSON.stringify(SYSTEMS, null, 2)};`);
  s = s.replace('PORT = 8820', 'PORT = 8840');
  fs.writeFileSync(path.join(OUT, '_continuous_drive.js'), s);
  console.log('continuous_drive');
}

// pathhash
{
  let s = fs.readFileSync(path.join(R10, '_pathhash_integrity_test.js'), 'utf8');
  s = adapt(s);
  s = s.replace(/const SYSTEMS = \[[\s\S]*?\];/, `const SYSTEMS = ${JSON.stringify(SYSTEMS, null, 2)};`);
  s = s.replace('PORT = 8819', 'PORT = 8839');
  fs.writeFileSync(path.join(OUT, '_pathhash_integrity_test.js'), s);
  console.log('pathhash');
}

// regression from r11
{
  let s = fs.readFileSync(path.join(R11, '_regression_report.js'), 'utf8');
  s = s
    .replace('routes 1–10', 'routes 1–11')
    .replace('after route-11 add', 'after route-12 add')
    .replace(
      "note: 'Compare path banks vs git HEAD. Route-11 is new (no HEAD baseline required).'",
      "note: 'Compare path banks vs git HEAD. Route-12 is new (no HEAD baseline required).'",
    );
  if (!s.includes('symbol-road-line-path-v1.js')) {
    s = s.replace(
      /const banks = \[/,
      `const banks = [\n  ['シンボルロード線 route-11', 'symbol-road-line-path-v1.js', 'SYMBOL_ROAD_LINE_PATH_V1'],`,
    );
  }
  // Replace new section for route-12
  if (s.includes('シンボルロード線 route-11 (new)')) {
    s = s.replace(/\/\/ Symbol road new[\s\S]*?report\.pass = allOk && report\.routes\['シンボルロード線 route-11 \(new\)'\]\.ok;/,
`// Maihama resort new
const resort = loadWindow('maihama-resort-line-path-v1.js', 'MAIHAMA_RESORT_LINE_PATH_V1');
const resortKeys = ${JSON.stringify(SYSTEMS)};
const resortOk = resortKeys.every((k) => Boolean(resort?.[k]));
report.routes['舞浜リゾート線 route-12 (new)'] = {
  ok: resortOk,
  systems: resortKeys.map((k) => ({ key: k, present: Boolean(resort?.[k]), pathHash: resort?.[k]?.pathHash || null })),
};
report.pass = allOk && report.routes['舞浜リゾート線 route-12 (new)'].ok;`);
  }
  fs.writeFileSync(path.join(OUT, '_regression_report.js'), s);
  console.log('regression');
}

// pwa from r11
{
  let s = fs.readFileSync(path.join(R11, '_pwa_offline_report.js'), 'utf8');
  s = adapt(s);
  fs.writeFileSync(path.join(OUT, '_pwa_offline_report.js'), s);
  console.log('pwa');
}

// geometry from r10 if exists
for (const name of ['_geometry_intersection_report.js', '_render_shots.js']) {
  const srcPath = path.join(R10, name);
  if (!fs.existsSync(srcPath)) {
    const alt = path.join(R11, name);
    if (fs.existsSync(alt)) {
      let s = adapt(fs.readFileSync(alt, 'utf8'));
      fs.writeFileSync(path.join(OUT, name), s);
      console.log('copied', name, 'from r11');
    } else console.log('missing', name);
  } else {
    let s = adapt(fs.readFileSync(srcPath, 'utf8'));
    fs.writeFileSync(path.join(OUT, name), s);
    console.log('copied', name, 'from r10');
  }
}
