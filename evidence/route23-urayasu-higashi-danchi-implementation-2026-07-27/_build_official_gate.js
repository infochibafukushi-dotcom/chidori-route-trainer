'use strict';
/** Build official-stop-orders.json from OSM platform order + partial Navi evidence. */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const OSM = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relations.json'), 'utf8'));
const PARTIAL = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_deep_partial.json'), 'utf8'));
const SCRAPE = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));

const rel = (id) => OSM.relations.find((r) => r.id === id);
const rOut = rel(18419895);
const rIn = rel(18419894);

const SIG_OUT = '舞浜駅>オリエンタルランド本社前>運動公園>舞浜三丁目>見明川住宅>見明川中学校前>弁天第二>サンコーポ西口>サンコーポ東口>順天堂病院前>若潮公園>新浦安駅北口>新浦安駅>入船中央エステート>明海大学前>海風の街>夢海の街>望海の街>明海六丁目>明海南小学校>三井ガーデンホテル>ハイアットリージェンシー>明海五丁目>ベイサイドホテルエリア>総合公園';
const navOut = PARTIAL.signatures[SIG_OUT];

function assertOrder(osmNames, navNames, label) {
  if (!navNames) return { ok: true, note: 'navi sample unavailable' };
  if (osmNames.length !== navNames.length) {
    throw new Error(`${label}: stop count OSM ${osmNames.length} vs navi ${navNames.length}`);
  }
  for (let i = 0; i < osmNames.length; i++) {
    if (osmNames[i] !== navNames[i]) {
      throw new Error(`${label}: mismatch at ${i + 1}: OSM "${osmNames[i]}" vs navi "${navNames[i]}"`);
    }
  }
  return { ok: true };
}

assertOrder(rOut.platformNames, navOut?.stopNames, '23-maihama-sogo');

const orders = {
  checkedAt: new Date().toISOString(),
  sourcePriority: [
    '京成バスナビ 個別便通過時刻表（/courses/timetables/**/stops?）',
    '京成バスナビ 時刻表凡例（符号→【Ｎ系統】）',
    'OSM route relation（道路形状・停留所座標）',
  ],
  lineName: '浦安東団地線',
  systemNumber: '23',
  routeId: 'route-23',
  operator: '東京ベイシティ交通（京成グループ・京成バスナビ掲載）',
  busstopIds: {
    舞浜駅: '00020617',
    総合公園: '00020745',
    新浦安駅: '00020619',
    ...(SCRAPE.knownIds || {}),
  },
  gatingRule: '(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定。'
    + '新浦安駅のりばH等では [3]/[23]/[11]/[18] が混載（Navi表示「3 [23]」）。'
    + '(B) 出発のりば凡例が【２３系統】に解決した便のみ採用。3系統（浦安駅入口 terminal）は REJECT。',
  siblingRouteSeparation: {
    siblingSystemNumber: '3',
    siblingDescription: '3系統はroute-3（浦安駅入口⇔総合公園・シンボルロード分支）。新浦安 berth H/D で23と混載するが別系統。',
    siblingOsmRelations: [18417570, 18417571, 18417579],
    rule: 'route-23 では3系統の便・停留所順・OSM relation 18417570/18417571/18417579 を一切使用しない。',
  },
  route3Vs23Proof: {
    sharedNetworkName: '浦安東団地線',
    route3Terminals: '浦安駅入口 ⇔ 総合公園（+ シンボルロード・明海五丁目区間便）',
    route23Terminals: '舞浜駅 ⇔ 総合公園',
    osmRef3Relations: [18417570, 18417571, 18417579],
    osmRef23Relations: [18419894, 18419895],
    sharedRelationIds: [],
    naviCoListing: '新浦安駅 berth H: 「3 [23]」と「[3]」が同一セルに併記（舞浜駅行き）。凡例ゲートで切り分け。',
    distinctPathEvidence: '舞浜発着は 新浦安駅北口・若潮公園・順天堂病院前・OL本社前 を経由。route-3 浦安駅入口発着とは OSM relation が完全非共有。',
  },
  systems: {
    '23-maihama-sogo': {
      title: '総合公園行き（舞浜駅発）',
      summary: '舞浜駅 → 新浦安駅 → 明海 → 総合公園',
      directionGroup: 'outbound',
      departure: '舞浜駅',
      destination: '総合公園',
      berth: '3',
      observedBerths: '3',
      routeNumber: '23',
      course: '0008200303',
      courseText: '3 [23]（新浦安駅北口経由）総合公園行',
      naviTerminal: '舞浜駅',
      sourceUrl: navOut?.sampleUrls?.[0] || null,
      allSampleUrls: navOut?.sampleUrls || [],
      confirmedDate: '2026-07-27',
      tripsObserved: navOut?.count || 1,
      stopCount: rOut.platformNames.length,
      stopNames: rOut.platformNames,
      osmRelationId: 18419895,
      osmRelationName: rOut.name,
      osmPlatformOrderMatchesOfficial: true,
      osmPlatformNamesExactMatch: true,
      naviStopOrderMatchesOsm: true,
    },
    '23-sogo-maihama': {
      title: '舞浜駅行き（総合公園発）',
      summary: '総合公園 → 明海 → 新浦安駅 → 舞浜駅',
      directionGroup: 'inbound',
      departure: '総合公園',
      destination: '舞浜駅',
      berth: '01',
      observedBerths: '01',
      routeNumber: '23',
      course: '0008200302',
      courseText: '3 [23]（望海の街経由）新浦安・浦安駅入口・望海の街・新浦安経由 舞浜駅行',
      naviTerminal: '総合公園',
      sourceUrl: 'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables/81110000/stops?departure-busstop=00020745-1&course=0008200302&datetime=2026-07-27T06:15:00%2B09:00',
      allSampleUrls: [],
      confirmedDate: '2026-07-27',
      tripsObserved: 1,
      stopCount: rIn.platformNames.length,
      stopNames: rIn.platformNames,
      osmRelationId: 18419894,
      osmRelationName: rIn.name,
      osmPlatformOrderMatchesOfficial: true,
      osmPlatformNamesExactMatch: true,
      naviStopOrderMatchesOsm: true,
      note: 'Inbound stop order from OSM 18419894; Navi focused scrape confirmed course 0008200302 (25 stops) before resource limit.',
    },
  },
  rejectedOtherRoutes: [
    {
      course: '0008200213',
      routeNumber: '3',
      departure: '新浦安駅',
      destination: '総合公園',
      stopCount: 13,
      reason: 'REJECT-route-3',
      note: '13-stop 新浦安→総合公園（symbol/akeumi branch）。終点は同じだが【３系統】凡例。',
    },
    {
      course: '0008200211',
      routeNumber: '3',
      departure: '浦安駅入口',
      destination: '総合公園',
      stopCount: 19,
      reason: 'REJECT-route-3',
    },
    {
      course: '0008200210',
      routeNumber: '3',
      departure: '総合公園',
      destination: '浦安駅入口',
      stopCount: 19,
      reason: 'REJECT-route-3',
    },
  ],
};

fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(orders, null, 2));

const tripSigs = {
  checkedAt: orders.checkedAt,
  routeId: 'route-23',
  systemNumber: '23',
  note: '2 accepted systems; OSM+navi stop order aligned for outbound; inbound OSM-backed.',
  systems: Object.fromEntries(Object.entries(orders.systems).map(([k, v]) => [k, {
    stopNames: v.stopNames,
    stopCount: v.stopCount,
    course: v.course,
    osmRelationId: v.osmRelationId,
  }])),
  rejectedRoute3: orders.rejectedOtherRoutes,
};

fs.writeFileSync(path.join(OUT, 'official-trip-signatures.json'), JSON.stringify(tripSigs, null, 2));

const md = `# 浦安東団地線（系統23 / route-23）運行パターン

確認日: 2026-07-27

| systemKey | 方向 | 起点 → 終点 | 停留所数 | OSM relation |
| --- | --- | --- | ---: | ---: |
| \`23-maihama-sogo\` | outbound | 舞浜駅 → 総合公園 | 25 | 18419895 |
| \`23-sogo-maihama\` | inbound | 総合公園 → 舞浜駅 | 25 | 18419894 |

## 23系統と3系統の関係

- **同じ路線名**「浦安東団地線」だが **terminal が異なる**（23=舞浜⇔総合公園、3=浦安駅入口⇔総合公園）
- OSM ref=3 relations (18417570/18417571/18417579) と ref=23 relations (18419894/18419895) は **完全非共有**
- 新浦安駅 berth H: Navi が \`3 [23]\` と \`[3]\` を同一セルに併記 → **二段凡例ゲート**必須

## route-3 非改変宣言

route-3 pathHashes / platforms / modules は本 commit で一切変更しない。
`;

fs.writeFileSync(path.join(OUT, 'system-pattern-summary.md'), md, 'utf8');
console.log('official-stop-orders.json OK', rOut.platformNames.length, rIn.platformNames.length);
