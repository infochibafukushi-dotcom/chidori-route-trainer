'use strict';
/**
 * Static sanity checks on the six generated route-18 files before they are wired into the app:
 * syntax parses, globals are the AKEMI_TAKASU_LINE_* set, no sibling-route leaks, official stop
 * order is reproduced verbatim, and ©山本信勝 is untouched wherever the template carried it.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT = __dirname;
const ROOT = path.resolve(__dirname, '..', '..');
const ORDERS = JSON.parse(fs.readFileSync(path.join(OUT, 'official-stop-orders.json'), 'utf8'));
const BUILD = JSON.parse(fs.readFileSync(path.join(OUT, '_build_summary.json'), 'utf8'));

const FILES = [
  'akemi-takasu-line-platforms-v1.js',
  'akemi-takasu-line-path-v1.js',
  'akemi-takasu-line-path-policy-v1.js',
  'akemi-takasu-line-stop-images-v1.js',
  'akemi-takasu-line-stop-images-v1.css',
  'akemi-takasu-line-route-v1.js',
];

const SYSTEM_ORDER = [
  '18-takasu-seaside',
  '18-urayasu-eki-iriguchi',
  '18-takasu-kita-shogakko',
  '18-takasu-seaside-from-shinurayasu',
  '18-shinurayasu-from-takasu',
];

const SIBLING_LEAK_TOKENS = [
  'SHIONE_NO_MACHI', 'shioneNoMachiLine', 'ShioneNoMachi', 'shione-no-machi-', '潮音の街線',
  'HINODE_LINE', 'hinodeLine', 'hinode17Line', 'hinode-line',
  '18419865', '18419864', '18381771', '18381770', '18381757', '18381756',
  '18352883', '18352884', '18419852', '18417570', '18417571', '18417579', '18419894', '18419895',
];
/** Route-18 legitimately names 15系統 in prose, so relation ids are the only hard ban in comments. */
const SIBLING_STOPS_EXACT = [
  '明海交差点', '入船橋', '高洲', 'みなと南', '浦安南高校', '特別養護老人ホーム',
  'ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館', '日の出南', '新浦安温泉',
  '総合公園', 'ベイサイドホテルエリア', '望海の街', '明海五丁目', 'ハイアットリージェンシー',
  '三井ガーデンホテル', '明海南小学校', '明海六丁目',
];

const report = { checkedAt: new Date().toISOString(), files: [], checks: [], blockers: [], warnings: [] };
const check = (name, pass, detail) => {
  report.checks.push({ name, pass, detail: detail ?? null });
  if (!pass) report.blockers.push(`${name}${detail ? `: ${detail}` : ''}`);
  return pass;
};

// ---- files exist, are UTF-8, and are not empty ----
const sources = {};
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { check(`${f} exists`, false); continue; }
  const buf = fs.readFileSync(p);
  const text = buf.toString('utf8');
  sources[f] = text.replace(/\r\n/g, '\n');
  report.files.push({
    file: f,
    bytes: buf.length,
    replacementChars: (text.match(/\uFFFD/g) || []).length,
    crlf: text.includes('\r\n'),
  });
  check(`${f} is valid UTF-8 (no U+FFFD)`, !(text.match(/\uFFFD/g) || []).length);
}

// ---- syntax parses ----
for (const f of FILES.filter((x) => x.endsWith('.js'))) {
  try {
    new vm.Script(sources[f], { filename: f });
    check(`${f} parses`, true);
  } catch (e) {
    check(`${f} parses`, false, String(e.message || e));
  }
}

// ---- no sibling leaks ----
// The leading comment block deliberately names route-15's relations as forbidden ("NEVER reuse"),
// so leak detection runs against the executable body only. CSS has no such header.
const bodyOf = (f, text) => {
  if (f.endsWith('.css')) return text;
  const i = text.indexOf('(() => {');
  return i < 0 ? text : text.slice(i);
};
for (const f of FILES) {
  const body = bodyOf(f, sources[f] || '');
  const hits = SIBLING_LEAK_TOKENS.filter((t) => body.includes(t));
  check(`${f} body has no sibling identifier/relation leak`, hits.length === 0, hits.join(', '));
}
// The header prose may name sibling relations, but only as an explicit prohibition.
for (const f of FILES.filter((x) => x.endsWith('.js'))) {
  const header = (sources[f] || '').slice(0, (sources[f] || '').indexOf('(() => {') + 1);
  const named = SIBLING_LEAK_TOKENS.filter((t) => /^\d+$/.test(t) && header.includes(t));
  if (named.length) {
    check(`${f} header names sibling relations only as a prohibition`,
      /NEVER reuse|流用は禁止|流用禁止|対象外/.test(header), named.join(', '));
  }
}

// ---- evaluate the banks + route module in a minimal window sandbox ----
const sandbox = { window: {}, document: undefined, console: { log() {}, warn() {}, error() {} }, localStorage: undefined };
sandbox.window.window = sandbox.window;
for (const f of ['akemi-takasu-line-platforms-v1.js', 'akemi-takasu-line-path-v1.js', 'akemi-takasu-line-path-policy-v1.js', 'akemi-takasu-line-stop-images-v1.js']) {
  vm.createContext(sandbox);
  new vm.Script(sources[f], { filename: f }).runInContext(sandbox);
}

const platforms = sandbox.window.AKEMI_TAKASU_LINE_PLATFORMS_V1;
const pathBank = sandbox.window.AKEMI_TAKASU_LINE_PATH_V1;
const policy = sandbox.window.AKEMI_TAKASU_LINE_PATH_POLICY_V1;
const images = sandbox.window.AKEMI_TAKASU_LINE_STOP_IMAGES_V1;

check('AKEMI_TAKASU_LINE_PLATFORMS_V1 defined', Boolean(platforms));
check('AKEMI_TAKASU_LINE_PATH_V1 defined', Boolean(pathBank));
check('AKEMI_TAKASU_LINE_PATH_POLICY_V1 defined', Boolean(policy));
check('AKEMI_TAKASU_LINE_STOP_IMAGES_V1 defined', Boolean(images));
check('stop image bank starts empty (no fabricated images)', Object.keys(images?.images || {}).length === 0,
  `${Object.keys(images?.images || {}).length} entries`);

check('platforms bank has exactly the five systems', JSON.stringify(Object.keys(platforms || {}).sort()) === JSON.stringify([...SYSTEM_ORDER].sort()),
  Object.keys(platforms || {}).join(','));
check('path bank has exactly the five systems', JSON.stringify(Object.keys(pathBank || {}).sort()) === JSON.stringify([...SYSTEM_ORDER].sort()),
  Object.keys(pathBank || {}).join(','));

// ---- every official stop has a platform, and no extra platforms exist ----
for (const key of SYSTEM_ORDER) {
  const official = ORDERS.systems[key].stopNames;
  const bank = platforms?.[key] || {};
  const missing = official.filter((n) => !bank[n]);
  const extra = Object.keys(bank).filter((n) => !official.includes(n));
  check(`${key}: every official stop has a platform`, missing.length === 0, missing.join(','));
  check(`${key}: no extra platforms`, extra.length === 0, extra.join(','));
  check(`${key}: platform coords are finite`, Object.values(bank).every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
  const siblingHit = SIBLING_STOPS_EXACT.filter((n) => Object.keys(bank).includes(n));
  check(`${key}: no sibling-exclusive stop in platforms`, siblingHit.length === 0, siblingHit.join(','));

  const entry = pathBank?.[key];
  const officialRel = ORDERS.systems[key].osmRelationId;
  check(`${key}: path relationId matches official`, entry?.relationId === officialRel,
    `${entry?.relationId} vs ${officialRel}`);
  if (officialRel == null) {
    check(`${key}: composed system has compositionRelations`, Array.isArray(entry?.compositionRelations) && entry.compositionRelations.length >= 2,
      JSON.stringify(entry?.compositionRelations));
    check(`${key}: official order documents osmPathComposition`, Boolean(ORDERS.systems[key].osmPathComposition));
  }
  check(`${key}: pathHash matches build summary`, entry?.pathHash === BUILD.systems[key].pathHash);
  check(`${key}: pathPoints count matches build summary`, entry?.pathPoints?.length === BUILD.systems[key].pathPoints,
    `${entry?.pathPoints?.length} vs ${BUILD.systems[key].pathPoints}`);
  check(`${key}: path points all finite`, (entry?.pathPoints || []).every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
  check(`${key}: policy minPathPoints satisfied`, (entry?.pathPoints?.length || 0) >= (policy?.minPathPointsFor?.(key) ?? 0),
    `${entry?.pathPoints?.length} >= ${policy?.minPathPointsFor?.(key)}`);
}

const hashes = SYSTEM_ORDER.map((k) => pathBank?.[k]?.pathHash);
check('path hashes are distinct', new Set(hashes).size === hashes.length, hashes.join(','));

// ---- route module: stop order arrays reproduce the official order verbatim ----
const routeSrc = sources['akemi-takasu-line-route-v1.js'];
for (const key of SYSTEM_ORDER) {
  const names = ORDERS.systems[key].stopNames;
  const arr = names.map((n) => `    "${n}"`).join(',\n');
  check(`${key}: route module contains the official stop array verbatim`, routeSrc.includes(arr));
  check(`${key}: route module declares the system`, routeSrc.includes(`'${key}'`));
  const rel = ORDERS.systems[key].osmRelationId;
  if (rel != null) {
    check(`${key}: route module carries relationId ${rel}`, routeSrc.includes(String(rel)));
  } else {
    check(`${key}: composed system has relationId null in route module`,
      new RegExp(`'${key}'[\\s\\S]*?relationId: null`).test(routeSrc));
  }
}
check("route module ROUTE_ID is route-18", routeSrc.includes("const ROUTE_ID = 'route-18';"));
check("route module DISPLAY_CODE is 18", routeSrc.includes("const DISPLAY_CODE = '18';"));
check('route module exposes AKEMI_TAKASU_LINE_ROUTE_V1', routeSrc.includes('window.AKEMI_TAKASU_LINE_ROUTE_V1'));
check('route module documents verified short-turn composition', /composition|のりばE|のりばX/.test(routeSrc));
check('deferredNoOsmSource is empty', (ORDERS.deferredNoOsmSource || []).length === 0,
  String((ORDERS.deferredNoOsmSource || []).length));
check('route module documents the ★た deep-night variant', routeSrc.includes('★た'));

// ---- css class is namespaced ----
const css = sources['akemi-takasu-line-stop-images-v1.css'];
check('css uses akemiTakasuLine-stop-image', css.includes('.akemiTakasuLine-stop-image'));
check('css does not reuse route-15/17 classes', !css.includes('shioneNoMachiLine-stop-image') && !css.includes('hinode17Line-stop-image'));

// ---- ©山本信勝 must survive wherever the template had it ----
const templateFiles = {
  'akemi-takasu-line-route-v1.js': 'shione-no-machi-line-route-v1.js',
  'akemi-takasu-line-path-policy-v1.js': 'shione-no-machi-line-path-policy-v1.js',
  'akemi-takasu-line-stop-images-v1.css': 'shione-no-machi-line-stop-images-v1.css',
};
for (const [gen, tpl] of Object.entries(templateFiles)) {
  const tplHas = fs.readFileSync(path.join(ROOT, tpl), 'utf8').includes('©山本信勝');
  const genHas = sources[gen].includes('©山本信勝');
  check(`${gen}: ©山本信勝 preserved from ${tpl}`, tplHas ? genHas : true, `template=${tplHas} generated=${genHas}`);
}
const repoCopyrightFiles = fs.readdirSync(ROOT)
  .filter((f) => /\.(js|css|html)$/.test(f))
  .filter((f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').includes('©山本信勝'); } catch { return false; } });
report.copyrightFiles = repoCopyrightFiles;

fs.writeFileSync(path.join(OUT, '_verify_generated_report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log('files:');
for (const f of report.files) console.log(' ', f.file, f.bytes, 'bytes | U+FFFD', f.replacementChars, '| CRLF', f.crlf);
console.log(`checks: ${report.checks.filter((c) => c.pass).length}/${report.checks.length} pass`);
for (const c of report.checks.filter((x) => !x.pass)) console.log('  FAIL', c.name, c.detail || '');
console.log('©山本信勝 present in', repoCopyrightFiles.length, 'root files:', repoCopyrightFiles.join(', '));
if (report.blockers.length) { console.error('BLOCKERS', report.blockers); process.exit(1); }
console.log('all static checks pass');
