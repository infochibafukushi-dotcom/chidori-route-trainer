'use strict';
/**
 * Turn the gated navi signatures into the canonical evidence artifacts:
 *   official-stop-orders.json   (正本: 系統キー -> 公式停留所順)
 *   system-signatures.json      (便署名・符号・コースIDの一意性証明)
 *   official-sources.md         (出典一覧)
 *   route-pattern-summary.md    (運行パターン要約)
 *
 * Nothing here is invented: every stopNames array comes from a 個別便通過時刻表.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const GATE = JSON.parse(fs.readFileSync(path.join(OUT, '_signature_gate.json'), 'utf8'));
const OSM = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relations-summary.json'), 'utf8'));

/** course id -> chidori systemKey. Derived from the accepted signatures, not guessed. */
const SYSTEM_BY_COURSE = {
  '0008200274': {
    key: '14-maihama',
    title: '舞浜駅行き',
    summary: '新浦安駅 → 順天堂病院前 → 中央公園 → 弁天中央 → 運動公園 → 舞浜駅',
    directionGroup: 'outbound',
    relationId: 18323926,
    timetableSymbol: '無印',
    berth: '14',
  },
  '0008200276': {
    key: '14-chidori-garage',
    title: '千鳥車庫行き',
    summary: '新浦安駅 → 順天堂病院前 → 中央公園 → 弁天中央 → 運動公園 → 千鳥車庫',
    directionGroup: 'outbound',
    relationId: 18419877,
    timetableSymbol: 'ち',
    berth: '14',
  },
  '0008200273': {
    key: '14-shinurayasu-maihama',
    title: '新浦安駅行き（舞浜駅発）',
    summary: '舞浜駅 → 運動公園 → 弁天中央 → 中央公園 → 順天堂病院前 → 新浦安駅',
    directionGroup: 'inbound',
    relationId: 9983017,
    timetableSymbol: '無印',
    berth: '14',
  },
  '0008200275': {
    key: '14-shinurayasu-chidori',
    title: '新浦安駅行き（千鳥車庫発）',
    summary: '千鳥車庫 → 運動公園 → 弁天中央 → 中央公園 → 順天堂病院前 → 新浦安駅',
    directionGroup: 'inbound',
    relationId: 18419876,
    timetableSymbol: 'し',
    berth: '02',
  },
};

const SYSTEM_ORDER = ['14-maihama', '14-chidori-garage', '14-shinurayasu-maihama', '14-shinurayasu-chidori'];

function main() {
  const accepted = GATE.signatures.filter((s) => s.verdict === 'ACCEPT-route14');
  const rejected = GATE.signatures.filter((s) => s.verdict !== 'ACCEPT-route14');

  const orders = {
    checkedAt: new Date().toISOString(),
    sourcePriority: [
      '京成バスナビ 個別便通過時刻表（/courses/timetables/**/stops?）',
      '京成バスナビ 時刻表凡例（符号→【Ｎ系統】）',
      'OSM route relation（道路形状・停留所座標）',
    ],
    lineName: '弁天・富岡線',
    systemNumber: '14',
    routeId: 'route-14',
    busstopIds: {
      shinurayasu: '00020619',
      shinurayasuKitaguchi: '00020668',
      maihama: '00020617',
      chidoriGarage: '00020620',
      chuoKoen: '00020633',
      bentenChuo: '00020685',
      juntendo: '00020875',
      undokoen: '00020746',
    },
    gatingRule:
      '千鳥車庫のりば02のコース名は[2]/[4]/[6]/[14]混載のため、コース名だけでは系統を確定できない。'
      + '各便は時刻表凡例の符号（無印／ち／し／南小／市）が指す【Ｎ系統】で判定した。',
    systems: {},
    rejectedOtherRoutes: rejected.map((s) => ({
      course: s.course,
      symbol: s.cellSymbols.join(','),
      legend: s.legendMatches.map((m) => m.line),
      routeNumber: s.legendRouteNumbers.join('/'),
      stopCount: s.stopCount,
      stopNames: s.stopNames,
      sampleUrl: s.sampleUrls[0],
      reason: s.verdict,
    })),
  };

  const signatures = {
    checkedAt: orders.checkedAt,
    routeId: 'route-14',
    systemNumber: '14',
    note: '各系統キーが公式停留所順として一意であることの証明。停留所ID列（busstop id）が主キー。',
    uniqueness: {},
    systems: {},
  };

  const seenSig = new Map();
  for (const s of accepted) {
    const def = SYSTEM_BY_COURSE[s.course];
    if (!def) throw new Error(`unmapped accepted course ${s.course}`);
    const osmRel = OSM.relations.find((r) => r.id === def.relationId);
    const osmNames = osmRel?.platformNames || [];
    const osmMatch = osmNames.length === s.stopNames.length
      && osmNames.every((n, i) => n === s.stopNames[i]);

    orders.systems[def.key] = {
      title: def.title,
      summary: def.summary,
      directionGroup: def.directionGroup,
      departure: s.stopNames[0],
      destination: s.stopNames[s.stopNames.length - 1],
      berth: def.berth,
      timetableSymbol: def.timetableSymbol,
      legendLine: s.legendMatches.map((m) => m.line)[0] || null,
      routeNumber: '14',
      course: s.course,
      courseText: s.courseText,
      naviTerminal: s.terminal,
      sourceUrl: s.sampleUrls[0],
      allSampleUrls: s.sampleUrls,
      confirmedDate: '2026-07-26',
      tripsObserved: s.tripCount,
      departureTimesObserved: s.departureTimes,
      stopCount: s.stopCount,
      idComplete: s.idComplete,
      stopNames: s.stopNames,
      stopIds: s.stopIds,
      osmRelationId: def.relationId,
      osmRelationName: osmRel?.name || null,
      osmPlatformOrderMatchesOfficial: osmMatch,
    };

    const sigKey = s.stopIds.join('>');
    if (seenSig.has(sigKey)) throw new Error(`duplicate stop-id signature for ${def.key} and ${seenSig.get(sigKey)}`);
    seenSig.set(sigKey, def.key);

    signatures.systems[def.key] = {
      course: s.course,
      timetableSymbol: def.timetableSymbol,
      berth: def.berth,
      terminal: s.terminal,
      stopCount: s.stopCount,
      stopIdSignature: sigKey,
      stopNameSignature: s.stopNames.join('>'),
      legendProof: s.legendMatches.map((m) => m.line),
      tripsObserved: s.tripCount,
      dayLabels: s.dayLabels,
      sampleUrls: s.sampleUrls,
      osmRelationId: def.relationId,
      osmPlatformOrderMatchesOfficial: osmMatch,
    };
  }

  for (const key of SYSTEM_ORDER) {
    if (!orders.systems[key]) throw new Error(`missing expected system ${key}`);
  }
  signatures.uniqueness = {
    systemCount: Object.keys(signatures.systems).length,
    allStopIdSignaturesDistinct: new Set(Object.values(signatures.systems).map((v) => v.stopIdSignature)).size
      === Object.keys(signatures.systems).length,
    allStopNameSignaturesDistinct: new Set(Object.values(signatures.systems).map((v) => v.stopNameSignature)).size
      === Object.keys(signatures.systems).length,
    osmAllMatch: Object.values(signatures.systems).every((v) => v.osmPlatformOrderMatchesOfficial),
  };

  fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(orders, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'system-signatures.json'), JSON.stringify(signatures, null, 2), 'utf8');

  // ---- official-sources.md ----
  const src = [];
  src.push('# 弁天・富岡線（系統14 / route-14）公式出典');
  src.push('');
  src.push(`調査日: 2026-07-26`);
  src.push('');
  src.push('## 1. 京成バスナビ（最優先）');
  src.push('');
  src.push('ベースURL: https://transfer-cloud.navitime.biz/keiseibus-group');
  src.push('');
  src.push('| 用途 | URL |');
  src.push('| --- | --- |');
  src.push('| 新浦安駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619 |');
  src.push('| 舞浜駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020617 |');
  src.push('| 千鳥車庫 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020620 |');
  src.push('');
  src.push('### コース（時刻表）');
  src.push('');
  src.push('| 発地 | のりば | コース表示名 |');
  src.push('| --- | --- | --- |');
  src.push('| 新浦安駅 | 14 | `[14]（順天堂病院前・弁天中央経由）舞浜駅・千鳥車庫行` |');
  src.push('| 舞浜駅 | 14 | `[14]（弁天中央経由）新浦安駅行` |');
  src.push('| 千鳥車庫 | 02 | `[14]/[2]/[4]/[6]` 混載セル（凡例で系統判定が必須） |');
  src.push('');
  src.push('### 個別便通過時刻表（停留所順の正本）');
  src.push('');
  src.push('| 系統キー | 符号 | コース | 便数 | 出典URL |');
  src.push('| --- | --- | --- | ---: | --- |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    src.push(`| \`${key}\` | ${s.timetableSymbol} | ${s.course} | ${s.tripsObserved} | ${s.sourceUrl} |`);
  }
  src.push('');
  src.push('### 時刻表凡例（系統の決め手）');
  src.push('');
  for (const key of SYSTEM_ORDER) {
    src.push(`- \`${key}\` ← ${orders.systems[key].legendLine}`);
  }
  src.push('');
  src.push('千鳥車庫のりば02では同じコースセルに他系統が混載されるため、凡例で除外した便:');
  src.push('');
  src.push('| 符号 | 凡例 | 系統 | 停留所数 |');
  src.push('| --- | --- | --- | ---: |');
  for (const r of orders.rejectedOtherRoutes) {
    src.push(`| ${r.symbol} | ${(r.legend[0] || '').replace(/\|/g, '\\|')} | ${r.routeNumber} | ${r.stopCount} |`);
  }
  src.push('');
  src.push('## 2. OSM route relations（道路形状・停留所座標）');
  src.push('');
  src.push('| relation | name | way members | platforms | 公式順と一致 |');
  src.push('| ---: | --- | ---: | ---: | --- |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    const rel = OSM.relations.find((r) => r.id === s.osmRelationId);
    src.push(`| ${s.osmRelationId} | ${s.osmRelationName} | ${rel?.wayMemberCount ?? '?'} | ${rel?.platformMemberCount ?? '?'} | ${s.osmPlatformOrderMatchesOfficial ? 'YES' : 'NO'} |`);
  }
  src.push('');
  src.push('Overpass: `overpass.kumi.systems` 優先。504 時は `api.openstreetmap.org/api/0.6/relation/<id>/full.json` にフォールバック。');
  src.push('');
  src.push('## 3. 旧baycityページ');
  src.push('');
  src.push('今回は不使用。京成バスナビとOSMのみで全4系統が確定したため参照不要。');
  src.push('');
  src.push('## 使用しなかったもの');
  src.push('');
  src.push('- Google Directions / Google Maps の経路推定（道路形状には一切使用しない）');
  src.push('- 既存route1〜12のpath・stops（route-14では流用しない）');
  src.push('');
  fs.writeFileSync(path.join(OUT, 'official-sources.md'), `${src.join('\n')}\n`, 'utf8');

  // ---- route-pattern-summary.md ----
  const pat = [];
  pat.push('# 弁天・富岡線（系統14 / route-14）運行パターン');
  pat.push('');
  pat.push('確認日: 2026-07-26 ／ 出典: 京成バスナビ個別便通過時刻表');
  pat.push('');
  pat.push('公式に確認できた運行パターンは **4系統**。');
  pat.push('');
  pat.push('| systemKey | 方向 | 符号 | 起点 → 終点 | 停留所数 | 便数 | OSM relation |');
  pat.push('| --- | --- | --- | --- | ---: | ---: | ---: |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    pat.push(`| \`${key}\` | ${s.directionGroup} | ${s.timetableSymbol} | ${s.departure} → ${s.destination} | ${s.stopCount} | ${s.tripsObserved} | ${s.osmRelationId} |`);
  }
  pat.push('');
  pat.push('## 停留所順（正本）');
  pat.push('');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    pat.push(`### \`${key}\` — ${s.title}（${s.stopCount}停留所）`);
    pat.push('');
    pat.push('| # | 停留所 | busstop id |');
    pat.push('| ---: | --- | --- |');
    s.stopNames.forEach((n, i) => pat.push(`| ${i + 1} | ${n} | ${s.stopIds[i]} |`));
    pat.push('');
  }
  pat.push('## 系統間の関係');
  pat.push('');
  pat.push('- `14-maihama` と `14-chidori-garage` は 新浦安駅→運動公園 まで同一（17停留所）。終点のみ 舞浜駅 / 千鳥車庫 に分岐する。');
  pat.push('  ただし **path は 18323926 / 18419877 の別relationから個別に生成** し、片方を切り詰めて流用しない。');
  pat.push('- `14-shinurayasu-maihama` と `14-shinurayasu-chidori` は 運動公園→新浦安駅 が同一。起点のみ 舞浜駅 / 千鳥車庫。');
  pat.push('- 往路と復路は停留所名の並びこそ逆順だが、**道路は別relation**（9983017 / 18419876）であり、往路pathの反転は禁止。');
  pat.push('- 千鳥車庫行きの凡例には「千鳥北方面には行きません」と明記されており、20系統（千鳥線）とは別物。');
  pat.push('');
  fs.writeFileSync(path.join(OUT, 'route-pattern-summary.md'), `${pat.join('\n')}\n`, 'utf8');

  console.log('systems:', Object.keys(orders.systems).join(', '));
  console.log('uniqueness:', JSON.stringify(signatures.uniqueness));
  console.log('rejected:', orders.rejectedOtherRoutes.map((r) => `${r.symbol}=route${r.routeNumber}`).join(', '));
  console.log('wrote official-stop-orders.json, system-signatures.json, official-sources.md, route-pattern-summary.md');
}

main();
