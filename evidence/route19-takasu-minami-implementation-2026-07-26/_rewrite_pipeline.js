'use strict';
/**
 * One-shot rewriter: adapt copied route-18 pipeline scripts for route-19 高洲南線.
 * Run once from evidence/route19-takasu-minami-implementation-2026-07-26/
 */
const fs = require('fs');
const path = require('path');
const OUT = __dirname;

function rewrite(file, transforms) {
  const p = path.join(OUT, file);
  let src = fs.readFileSync(p, 'utf8');
  for (const [from, to] of transforms) {
    if (typeof from === 'string') {
      if (!src.includes(from)) console.warn(`WARN missing string in ${file}: ${from.slice(0, 80)}`);
      src = src.split(from).join(to);
    } else {
      const next = src.replace(from, to);
      if (next === src) console.warn(`WARN regex no-match in ${file}: ${from}`);
      src = next;
    }
  }
  fs.writeFileSync(p, src, 'utf8');
  console.log('rewrote', file, src.length);
}

// --- deep scrape ---
rewrite('_scrape_navi_route19_deep.js', [
  ['route-18 course timetables', 'route-19 course timetables'],
  ['高洲北小学校止まり、\n * 浦安駅入口発着', '短turn / 日祝のみ / 深夜 variants'],
  [`新浦安駅のりばE のセルは [15]/[18]/[深夜] を同一セルに混載し、しかも 15 と 18 の
 * コース名文言が完全に同一（「高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行」）。
 * のりばH のセルは [11]/[18]/[23]/[3] 混載。高洲側のりばでは [10]/[15]/[19] も混載される。
 * ここでは候補を広く拾い、系統確定は _verify_signatures.js の凡例ゲート（符号→【Ｎ系統】）に委ねる。
 *
 * Also discovers 浦安駅入口 / 高洲海浜公園 / 高洲北小学校 / 潮音の街 / 夢海の街 の busstop id を
 * 確定便から取得し、それぞれの course 一覧を [18] で走査して復路・別発着パターンを拾う。`,
   `新浦安駅のりばF のセルは [10]/[19] を同一セルに混載する（「（東京学館前・高洲四丁目経由）高洲海浜公園・みなと南…」）。
 * 高洲海浜公園のりばでは [10]/[15]/[18]/[19] も混載される。
 * ここでは候補を広く拾い、系統確定は _verify_signatures.js の凡例ゲート（符号→【Ｎ系統】）に委ねる。
 *
 * Also discovers 高洲海浜公園 / 東京学館前 / 高洲四丁目 / 浦安南高校 の busstop id を
 * 確定便から取得し、それぞれの course 一覧を [19] で走査して復路・別発着パターンを拾う。`],
  ["const ROUTE_NUM = '18';", "const ROUTE_NUM = '19';"],
  ["const SIBLING_ROUTES = ['15', '19', '10', '25', '11', '23', '3'];", "const SIBLING_ROUTES = ['10', '15', '18', '25'];"],
  [`const FOLLOW_UP_STOPS = [
  '浦安駅入口',
  '高洲海浜公園',
  '高洲北小学校',
  '潮音の街',
  '夢海の街',
  '高洲橋',
  '明海大学前',
];`, `const FOLLOW_UP_STOPS = [
  '高洲海浜公園',
  '東京学館前',
  '高洲四丁目',
  '浦安南高校',
  '特別養護老人ホーム',
  '高洲八丁目',
];`],
  [/\/\\\[18\\\]\|【\\s\*18\\s\*系統\\s\*】/g, '/\\[19\\]|【\\s*19\\s*系統\\s*】'],
  ["lineName: '明海・高洲線'", "lineName: '高洲南線'"],
  ["note: 'Exhaustive per-course trip enumeration. Every /stops? link on each route-18 candidate timetable is opened. '\n    + '15系統は新浦安駅のりばEで18系統と同一セル・同一文言のコース名を共有するため、凡例ゲートで最終判定する。'",
   "note: 'Exhaustive per-course trip enumeration. Every /stops? link on each route-19 candidate timetable is opened. '\n    + '10系統は新浦安駅のりばFで19系統と同一セルを共有するため、凡例ゲートで最終判定する。'"],
  ['route18: all.filter', 'route19: all.filter'],
  ['for (const c of term.route18 || [])', 'for (const c of term.route19 || [])'],
  ['out.followUps[stopName].route18Courses', 'out.followUps[stopName].route19Courses'],
  ['c.route18.map', 'c.route19.map'],
  ['if (!c.route18.length)', 'if (!c.route19.length)'],
  ['発の[18]公開便コースは見つからなかった。', '発の[19]公開便コースは見つからなかった。'],
  ['for (const course of c.route18)', 'for (const course of c.route19)'],
  ["reason: 'no-18-evidence'", "reason: 'no-19-evidence'"],
]);

// --- verify signatures ---
rewrite('_verify_signatures.js', [
  ["const ROUTE_NUM = '18';", "const ROUTE_NUM = '19';"],
  ["const SIBLING_ROUTES = ['15', '19', '10', '25', '11', '23', '3', '16', '5', '14', '22', '24', '38'];",
   "const SIBLING_ROUTES = ['10', '15', '18', '25', '11', '23', '3', '16', '5', '14', '22', '24', '38'];"],
  [`const SIBLING_EXCLUSIVE_STOPS = {
  15: ['明海交差点', '入船橋'],
  19: ['浦安南高校特養ホーム'],
  10: ['みなと南', 'みなと第二', 'アライプロバンス', '鉄鋼団地入口'],
  25: ['サンコーポ東口', 'サンコーポ西口', '若潮公園', '新浦安駅北口'],
  '3/23': ['ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館', '総合公園', 'ベイサイドホテルエリア'],
};
/** route-18 characteristic stops per navi legend. Used only as a cross-check, never as the gate. */
const ROUTE18_CHARACTERISTIC_STOPS = ['夢海の街', '高洲橋', '海風の街', '明海大学前'];`,
   `const SIBLING_EXCLUSIVE_STOPS = {
  10: ['みなと南', 'みなと第二', 'アライプロバンス', '鉄鋼団地入口'],
  15: ['明海交差点', '入船橋', '潮音の街', '高洲中央公園'],
  18: ['夢海の街', '高洲橋', '海風の街', '明海大学前'],
  25: ['サンコーポ東口', 'サンコーポ西口', '若潮公園', '新浦安駅北口'],
  '3/23': ['ベイパーク', 'ベイモール', 'シンボルロードパークシティ', '日の出公民館', '総合公園', 'ベイサイドホテルエリア'],
};
/** route-19 characteristic stops per navi legend. Used only as a cross-check, never as the gate. */
const ROUTE19_CHARACTERISTIC_STOPS = ['浦安南高校', '特別養護老人ホーム', '東京学館前', '高洲四丁目'];`],
  ['★route-18 固有の危険:', '★route-19 固有の危険:'],
  [`新浦安駅のりばE のセルは
 *     「15 [15]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行
 *       18 [18]高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行  [深夜]…（同文）」
 *   と 15系統 と 18系統 を同一セル・完全同一文言で混載する。コース名では絶対に分離できない。
 *   のりばH は [11]/[18]/[23]/[3]、高洲海浜公園／高洲北小学校のりばは [10]/[15]/[19] を混載する。
 *   したがって出発停留所ののりば凡例まで遡り、符号（ゆ／た／う／無印…）→【Ｎ系統】で判定する。
 *
 * ACCEPT 条件: (B) が 18 に解決し、(A) が 18 以外に解決していないこと。`,
   `新浦安駅のりばF のセルは [10] と [19] を同一セルに混載する。
 *   高洲海浜公園のりばは [10]/[15]/[18]/[19] を混載する。
 *   したがって出発停留所ののりば凡例まで遡り、符号→【Ｎ系統】で判定する。
 *
 * ACCEPT 条件: (B) が 19 に解決し、(A) が 19 以外に解決していないこと。`],
  [`policy: '(A) 掲載時刻表の凡例 と (B) 出発のりばの時刻表の凡例 の二段で系統を判定する。'
      + '新浦安駅のりばEは [15] と [18] を同一セル・完全同一文言（「高洲海浜公園(潮音の街・高洲四丁目経由)高洲北小学校行」）で混載し、'
      + 'のりばHは [11]/[18]/[23]/[3]、高洲海浜公園・高洲北小学校のりばは [10]/[15]/[19] を混載するため、'
      + '(B) 出発のりばの凡例（符号→【Ｎ系統】）を決定打とする。',`,
   `policy: '(A) 掲載時刻表の凡例 と (B) 出発のりばの時刻表の凡例 の二段で系統を判定する。'
      + '新浦安駅のりばFは [10] と [19] を同一セルで混載し、'
      + '高洲海浜公園のりばは [10]/[15]/[18]/[19] を混載するため、'
      + '(B) 出発のりばの凡例（符号→【Ｎ系統】）を決定打とする。',`],
  ['route18CharacteristicStopsPresent: ROUTE18_CHARACTERISTIC_STOPS.filter((n) => sig.stopNames.includes(n)),',
   'route19CharacteristicStopsPresent: ROUTE19_CHARACTERISTIC_STOPS.filter((n) => sig.stopNames.includes(n)),'],
  ['| route18-characteristic: ${s.route18CharacteristicStopsPresent.join(\',\') || \'(none)\'}`',
   '| route19-characteristic: ${s.route19CharacteristicStopsPresent.join(\',\') || \'(none)\'}`'],
]);

console.log('done deep+verify rewrite');
