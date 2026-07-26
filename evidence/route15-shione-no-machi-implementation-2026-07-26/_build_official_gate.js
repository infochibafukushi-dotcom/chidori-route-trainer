'use strict';
/**
 * Turn the gated navi signatures into the canonical evidence artifacts:
 *   official-stop-orders.json   (正本: 系統キー -> 公式停留所順)
 *   system-signatures.json      (便署名・符号・コースIDの一意性証明)
 *   official-sources.md         (出典一覧)
 *   route-pattern-summary.md    (運行パターン要約)
 *
 * Nothing here is invented: every stopNames array comes from a 個別便通過時刻表 whose
 * 凡例 resolves to 【１５系統】. 18系統（ゆ／た／★た）は ACCEPT されない。
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const GATE = JSON.parse(fs.readFileSync(path.join(OUT, '_signature_gate.json'), 'utf8'));
const OSM = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relations-summary.json'), 'utf8'));

/** departure>destination -> chidori systemKey. Derived from the accepted signatures, not guessed. */
const SYSTEM_BY_ENDPOINTS = {
  '新浦安駅>高洲海浜公園': {
    key: '15-takasu-seaside',
    title: '高洲海浜公園行き',
    directionGroup: 'outbound',
    relationId: 18419865,
  },
  '高洲海浜公園>新浦安駅': {
    key: '15-shinurayasu',
    title: '新浦安駅行き',
    directionGroup: 'inbound',
    relationId: 18419864,
  },
};

const SYSTEM_ORDER = ['15-takasu-seaside', '15-shinurayasu'];

const summaryOf = (names) => {
  const via = names.slice(1, -1).filter((n) => /東京学館前|高洲中央公園|潮音の街|入船橋/.test(n));
  return `${names[0]} → ${via.join(' → ')} → ${names[names.length - 1]}`;
};

/** The berth row at the ORIGIN stop that resolves the trip's 系統 (二段ゲートの決定打). */
const depRowOf = (s) => {
  const rows = s.departureBerthProof?.rows || [];
  return rows.find((r) => r.routeNumber === s.departureBerthRouteNumber) || rows[0] || null;
};

function main() {
  const accepted = GATE.signatures.filter((s) => s.verdict === 'ACCEPT-route15');
  const rejected = GATE.signatures.filter((s) => s.verdict !== 'ACCEPT-route15');

  const orders = {
    checkedAt: new Date().toISOString(),
    sourcePriority: [
      '京成バスナビ 個別便通過時刻表（/courses/timetables/**/stops?）',
      '京成バスナビ 時刻表凡例（符号→【Ｎ系統】）',
      'OSM route relation（道路形状・停留所座標）',
    ],
    lineName: '潮音の街線',
    systemNumber: '15',
    routeId: 'route-15',
    busstopIds: {},
    gatingRule:
      '(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定した。'
      + '新浦安駅のりばEは [15]/[18]/深夜バス、高洲北小学校のりば01/02は [10]/[15]/[19] を同一セルに混載し、'
      + '後者は凡例が不完全で19系統の便まで「無印…【１５系統】」に吸われる。'
      + 'そのため (B) 出発のりば（新浦安駅のりばE=15／のりばF=19、高洲海浜公園のりば03=15／のりば19=19）の凡例を決定打とし、'
      + '(B) が【１５系統】に解決し、かつ (A) が15以外に解決していない便のみ採用した。',
    systems: {},
    rejectedOtherRoutes: rejected.map((s) => {
      const dep = depRowOf(s);
      return {
        course: s.course,
        symbol: s.cellSymbols.join(','),
        legend: s.legendMatches.map((m) => m.line),
        routeNumber: s.departureBerthRouteNumber || s.legendRouteNumbers.join('/'),
        listingLegendRouteNumbers: s.legendRouteNumbers,
        departureBerth: dep?.berthLabel || null,
        departureBerthRouteNumber: s.departureBerthRouteNumber || null,
        departureBerthLegend: dep?.legendLine || null,
        departureBerthTimetableUrl: dep?.timetableUrl || null,
        stopCount: s.stopCount,
        departure: s.stopNames[0],
        destination: s.stopNames[s.stopNames.length - 1],
        stopNames: s.stopNames,
        sampleUrl: s.sampleUrls[0],
        reason: s.verdict,
      };
    }),
  };

  const signatures = {
    checkedAt: orders.checkedAt,
    routeId: 'route-15',
    systemNumber: '15',
    note: '各系統キーが公式停留所順として一意であることの証明。停留所ID列（busstop id）が主キー。',
    uniqueness: {},
    systems: {},
  };

  const seenSig = new Map();
  for (const s of accepted) {
    const endpoints = `${s.stopNames[0]}>${s.stopNames[s.stopNames.length - 1]}`;
    const def = SYSTEM_BY_ENDPOINTS[endpoints];
    if (!def) throw new Error(`unmapped accepted signature ${endpoints} (course ${s.course})`);
    if (orders.systems[def.key]) throw new Error(`duplicate accepted signature for ${def.key}`);
    const osmRel = OSM.relations.find((r) => r.id === def.relationId);
    const osmNames = osmRel?.platformNames || [];
    const osmMatch = osmNames.length === s.stopNames.length
      && osmNames.every((n, i) => n === s.stopNames[i]);
    const dep = depRowOf(s);

    orders.systems[def.key] = {
      title: def.title,
      summary: summaryOf(s.stopNames),
      directionGroup: def.directionGroup,
      departure: s.stopNames[0],
      destination: s.stopNames[s.stopNames.length - 1],
      berth: dep?.berthLabel || null,
      observedBerths: s.berth,
      departureBerthLegend: dep?.legendLine || null,
      departureBerthTimetableUrl: dep?.timetableUrl || null,
      timetableSymbol: (s.legendMatches[0]?.symbolRaw) || '無印',
      legendLine: s.legendMatches.map((m) => m.line)[0] || null,
      routeNumber: '15',
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

    for (let i = 0; i < s.stopNames.length; i++) {
      if (s.stopIds[i]) orders.busstopIds[`${def.key}|${s.stopNames[i]}`] = s.stopIds[i];
    }

    const sigKey = s.stopIds.join('>');
    if (seenSig.has(sigKey)) throw new Error(`duplicate stop-id signature for ${def.key} and ${seenSig.get(sigKey)}`);
    seenSig.set(sigKey, def.key);

    signatures.systems[def.key] = {
      course: s.course,
      timetableSymbol: (s.legendMatches[0]?.symbolRaw) || '無印',
      berth: dep?.berthLabel || null,
      observedBerths: s.berth,
      terminal: s.terminal,
      stopCount: s.stopCount,
      stopIdSignature: sigKey,
      stopNameSignature: s.stopNames.join('>'),
      legendProof: s.legendMatches.map((m) => m.line),
      departureBerthProof: {
        originStopName: s.departureBerthProof?.originStopName || null,
        busstopId: s.departureBerthProof?.busstopId || null,
        berthLabel: dep?.berthLabel || null,
        symbol: dep?.symbol || null,
        routeNumber: s.departureBerthRouteNumber || null,
        legendLine: dep?.legendLine || null,
        timetableUrl: dep?.timetableUrl || null,
      },
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
  if (Object.keys(orders.systems).length !== SYSTEM_ORDER.length) {
    throw new Error(`unexpected accepted system count ${Object.keys(orders.systems).length}`);
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
  src.push('# 潮音の街線（系統15 / route-15）公式出典');
  src.push('');
  src.push('調査日: 2026-07-26');
  src.push('');
  src.push('## 1. 京成バスナビ（最優先）');
  src.push('');
  src.push('ベースURL: https://transfer-cloud.navitime.biz/keiseibus-group');
  src.push('');
  src.push('| 用途 | URL |');
  src.push('| --- | --- |');
  src.push('| 新浦安駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619 |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    if (s.directionGroup !== 'inbound') continue;
    const depId = s.stopIds[0];
    if (depId) src.push(`| ${s.departure} のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=${depId} |`);
  }
  src.push('');
  src.push('### コース（時刻表）');
  src.push('');
  src.push('| 発地 | のりば | コース表示名 |');
  src.push('| --- | --- | --- |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    src.push(`| ${s.departure} | ${s.berth || '-'} | \`${(s.courseText || '').replace(/\|/g, '\\|')}\` |`);
  }
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
  src.push('### 時刻表凡例（系統の決め手・二段ゲート）');
  src.push('');
  src.push(orders.gatingRule);
  src.push('');
  src.push('| 系統キー | (A) 掲載凡例 | (B) 出発のりば | (B) 凡例 | (B) 出典URL |');
  src.push('| --- | --- | --- | --- | --- |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    src.push(`| \`${key}\` | ${(s.legendLine || '-').replace(/\|/g, '\\|')} | ${s.departure} のりば${s.berth} | ${(s.departureBerthLegend || '-').replace(/\|/g, '\\|')} | ${s.departureBerthTimetableUrl || '-'} |`);
  }
  src.push('');
  src.push('同じコースセル／同じ通過停留所に混載されるため除外した便:');
  src.push('');
  src.push('| コース | 符号 | (A) 掲載凡例の系統 | (B) 出発のりば | (B) が示す系統 | 停留所数 | 起点 → 終点 | 判定 |');
  src.push('| --- | --- | --- | --- | --- | ---: | --- | --- |');
  for (const r of orders.rejectedOtherRoutes) {
    src.push(`| ${r.course || '-'} | ${r.symbol} | ${r.listingLegendRouteNumbers.join('/') || '-'} | ${r.departure} のりば${r.departureBerth || '(未解決)'} | ${r.departureBerthRouteNumber || '-'} | ${r.stopCount} | ${r.departure} → ${r.destination} | ${r.reason} |`);
  }
  src.push('');
  src.push('補足:');
  src.push('');
  src.push('- `0008200292` / `0008200291`（14停留所・高洲四丁目経由）は高洲北小学校のりば01/02の掲載凡例では「無印…【１５系統】」に一致してしまうが、');
  src.push('  出発のりば（新浦安駅のりばF／高洲海浜公園のりば19）の凡例は【１９系統】である。よって route-15 には採用しない。');
  src.push('- `UNDECIDED-...` の3便は起点が アライプロバンス／みなと南／舞浜駅 で、15系統の起終点（新浦安駅・高洲海浜公園）ではない。');
  src.push('  出発停留所のbusstop idが取得できず (B) を解決できなかったため、系統を断定せず「不採用」とした（採用側には一切影響しない）。');
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
  src.push('bbox 35.60,139.85,35.70,139.96 の `ref=15` 探索で見つかった bus relation は上記2件のみ（route_master なし）。');
  src.push('');
  src.push('Overpass: `overpass.kumi.systems` 優先。504 時は `overpass-api.de`、さらに `api.openstreetmap.org/api/0.6/relation/<id>/full.json` にフォールバック。');
  src.push('');
  src.push('## 使用しなかったもの');
  src.push('');
  src.push('- Google Directions / Google Maps の経路推定（道路形状には一切使用しない）');
  src.push('- 既存route1〜12・route-14のpath・stops');
  src.push('- route-10 / route-18 / route-19（高洲・明海方面で走行区間が重なるが、停留所順・pathとも流用しない）');
  src.push('');
  fs.writeFileSync(path.join(OUT, 'official-sources.md'), `${src.join('\n')}\n`, 'utf8');

  // ---- route-pattern-summary.md ----
  const pat = [];
  pat.push('# 潮音の街線（系統15 / route-15）運行パターン');
  pat.push('');
  pat.push('確認日: 2026-07-26 ／ 出典: 京成バスナビ個別便通過時刻表');
  pat.push('');
  pat.push(`公式に確認できた運行パターンは **${SYSTEM_ORDER.length}系統**。`);
  pat.push('');
  pat.push('| systemKey | 方向 | 符号 | 起点 → 終点 | 停留所数 | 便数 | 出発のりば | OSM relation |');
  pat.push('| --- | --- | --- | --- | ---: | ---: | --- | ---: |');
  for (const key of SYSTEM_ORDER) {
    const s = orders.systems[key];
    pat.push(`| \`${key}\` | ${s.directionGroup} | ${s.timetableSymbol} | ${s.departure} → ${s.destination} | ${s.stopCount} | ${s.tripsObserved} | ${s.berth || '-'} | ${s.osmRelationId} |`);
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
    s.stopNames.forEach((n, i) => pat.push(`| ${i + 1} | ${n} | ${s.stopIds[i] || '(未取得)'} |`));
    pat.push('');
  }
  pat.push('## 系統間の関係と注意点');
  pat.push('');
  pat.push('- 往路と復路は停留所名の並びこそ逆順だが、**道路は別relation**（18419865 / 18419864）であり、往路pathの反転は禁止。');
  pat.push('- 中央分離帯のある道路が多く、往復で **のりばの位置（座標）が道路の反対側**になる。停留所座標は各方向のrelationのplatformを採用した。');
  pat.push('- 新浦安駅のりばEは [15] と [18]（および深夜バス）を同一コースセルに掲載する。凡例の符号でのみ系統を確定できる。');
  pat.push('  - `無印` = 【１５系統】東京学館前経由 高洲海浜公園行き ← 本ルートで採用');
  pat.push('  - `ゆ` = 【１８系統】夢海の街、高洲橋、潮音の街経由 高洲海浜公園行き ← 不採用');
  pat.push('  - `た` / `★た` = 【１８系統】夢海の街・潮音の街・高洲四丁目経由 高洲北小学校行き（深夜バス） ← 不採用');
  pat.push('- コース表示名に「高洲北小学校行」とあるが、これは同セルに載る18系統深夜便の行先。**15系統の終点は高洲海浜公園**。');
  pat.push('- 15系統は「高洲」に停まり、「高洲四丁目」「高洲二丁目」などは通らない。高洲四丁目経由の14停留所パターンは【１９系統】（出発のりばで確認済み）。');
  pat.push('- 高洲海浜公園は15系統の終端。往路は `platform_exit_only`、復路は `platform_entry_only` の別ノードで、位置も異なる。');
  pat.push('- route-10 / route-18 / route-19 は高洲・東京学館前付近で走行区間が重なるが、停留所順・pathとも流用していない。');
  pat.push('');
  fs.writeFileSync(path.join(OUT, 'route-pattern-summary.md'), `${pat.join('\n')}\n`, 'utf8');

  console.log('systems:', Object.keys(orders.systems).join(', '));
  console.log('uniqueness:', JSON.stringify(signatures.uniqueness));
  console.log('rejected:', orders.rejectedOtherRoutes.map((r) => `${r.symbol}=route${r.routeNumber}`).join(', '));
  console.log('wrote official-stop-orders.json, system-signatures.json, official-sources.md, route-pattern-summary.md');
}

main();
