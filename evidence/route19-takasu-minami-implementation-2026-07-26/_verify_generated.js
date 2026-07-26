'use strict';
/**
 * Static verification for generated route-19 modules (no browser).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const EXPECTED_SYSTEMS = ['19-takasu-seaside', '19-shinurayasu'];
const SIBLING_RELATIONS = ['18419865', '18419864', '18352908', '18352907', '18417590', '18381757', '18381756'];
const SIBLING_EXCLUSIVE_STOPS = ['潮音の街', '高洲中央公園', '高洲', '夢海の街', '高洲橋', '海風の街', '明海大学前', 'みなと南'];
const OWN_RELATIONS = ['18381771', '18381770'];

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(ok ? 'OK' : 'FAIL', label, detail || '');
  if (!ok) failures.push(`${label}${detail ? ': ' + detail : ''}`);
};

function loadRoot(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

const files = {
  platforms: loadRoot('takasu-minami-line-platforms-v1.js'),
  path: loadRoot('takasu-minami-line-path-v1.js'),
  policy: loadRoot('takasu-minami-line-path-policy-v1.js'),
  route: loadRoot('takasu-minami-line-route-v1.js'),
  images: loadRoot('takasu-minami-line-stop-images-v1.js'),
  css: loadRoot('takasu-minami-line-stop-images-v1.css'),
  loader: loadRoot('route-assets-loader.js'),
  sw: loadRoot('service-worker.js'),
  index: loadRoot('index.html'),
};

check('CACHE v111', /CACHE_NAME = 'chidori-route-map-v111'/.test(files.sw));
check('index loader v111', /route-assets-loader\.js\?v=111/.test(files.index));
check('SW loader v111', /route-assets-loader\.js\?v=111/.test(files.sw));
check('PACKS route-19', /'route-19'\s*:/.test(files.loader) && /takasu-minami-line-route-v1\.js\?v=111/.test(files.loader));
check('globals platforms', /TAKASU_MINAMI_LINE_PLATFORMS_V1/.test(files.platforms));
check('globals path', /TAKASU_MINAMI_LINE_PATH_V1/.test(files.path));
check('globals policy', /TAKASU_MINAMI_LINE_PATH_POLICY_V1/.test(files.policy));
check('globals route', /TAKASU_MINAMI_LINE_ROUTE_V1/.test(files.route));
check('globals images', /TAKASU_MINAMI_LINE_STOP_IMAGES_V1/.test(files.images));
check('ROUTE_ID', /ROUTE_ID = 'route-19'/.test(files.route));
check('©山本信勝 untouched in app.js', loadRoot('app.js').includes('©山本信勝'));

for (const key of EXPECTED_SYSTEMS) {
  const names = ORDERS.systems[key].stopNames;
  check(`${key} in route module`, files.route.includes(`'${key}'`));
  for (const n of names) check(`${key} has stop ${n}`, files.route.includes(`"${n}"`));
  const bank = BUILD.systems[key];
  check(`${key} build present`, !!bank);
  check(`${key} pathHash`, !!bank?.pathHash && /^[a-f0-9]{64}$/.test(bank.pathHash));
  check(`${key} osm relation`, String(ORDERS.systems[key].osmRelationId) === String(bank?.relationId));
}

for (const rel of SIBLING_RELATIONS) {
  check(`platforms no sibling rel ${rel}`, !files.platforms.includes(rel));
  check(`path no sibling rel ${rel}`, !files.path.includes(rel));
}
for (const rel of OWN_RELATIONS) {
  check(`path mentions own rel ${rel}`, files.path.includes(rel));
}

// Exact sibling exclusive stop names must not appear as quoted stop entries in data region
const dataStart = files.route.indexOf('const NAMES_19_TAKASU_SEASIDE');
const dataEnd = files.route.indexOf("const DEFAULT_SYSTEM_KEY = '19-takasu-seaside';");
const dataRegion = files.route.slice(dataStart, dataEnd);
for (const n of SIBLING_EXCLUSIVE_STOPS) {
  check(`no exclusive stop ${n}`, !dataRegion.includes(`"${n}"`) && !dataRegion.includes(`'${n}'`));
}

check('pathHash distinct', BUILD.pathHashDistinct === true);
check('no blockers', !BUILD.blockers?.length, JSON.stringify(BUILD.blockers || []));
check('not exact reverse', BUILD.reverseChecks?.[0]?.isExactReverse === false);

const report = {
  checkedAt: new Date().toISOString(),
  failures,
  pathHashes: Object.fromEntries(EXPECTED_SYSTEMS.map((k) => [k, BUILD.systems[k]?.pathHash])),
  ok: failures.length === 0,
};
fs.writeFileSync(path.join(OUT, '_verify_generated_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
