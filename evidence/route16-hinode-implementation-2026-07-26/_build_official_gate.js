'use strict';
/**
 * Turn the gated navi signatures into the canonical evidence artifacts:
 *   official-stop-orders.json   (正本: 系統キー -> 公式停留所順)
 *   system-signatures.json      (便署名・符号・コースIDの一意性証明)
 *   official-sources.md         (出典一覧)
 *   route-pattern-summary.md    (運行パターン要約)
 *
 * Nothing here is invented: every stopNames array comes from a 個別便通過時刻表 whose
 * 出発のりば凡例 resolves to 【１６系統】。17系統（符号ベ・日の出東経由）は ACCEPT されない。
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const GATE = JSON.parse(fs.readFileSync(path.join(OUT, '_signature_gate.json'), 'utf8'));
const OSM = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relations-summary.json'), 'utf8'));

/** departure>destination -> chidori systemKey. Derived from the accepted signatures, not guessed. */
const SYSTEM_BY_ENDPOINTS = {
  '新浦安駅>日の出七丁目': {
    key: '16-hinode-nanachome',
    title: '日の出七丁目行き',
    directionGroup: 'outbound',
    relationId: 18396563,
  },
  '日の出七丁目>新浦安駅': {
    key: '16-shinurayasu',
    title: '新浦安駅行き',
    directionGroup: 'inbound',
    relationId: 18396562,
  },
};

const SYSTEM_ORDER = ['16-hinode-nanachome', '16-shinurayasu'];

/** OSM relations that belong to route 17 (日の出東経由). Recorded so non-use is provable. */
const ROUTE17_RELATIONS = [18396568, 18396569, 18396583];

/** Navi writes 「順天堂大学・日の出 正門」, OSM writes 「順天堂大学・日の出正門」. Compare on a normalized key. */
const normalizeKey = (s) => String(s || '')
  .normalize('NFKC')
  .replace(/（.*?）|\(.*?\)/g, '')
  .replace(/[\s　・･「」『』]/g, '');

const summaryOf = (names) => {
  const via = names.slice(1, -1).filter((n) => /海風の街|ベイシティ浦安|プラウド新浦安パークマリーナ|順天堂大学/.test(n));
  return `${names[0]} → ${via.join(' → ')} → ${names[names.length - 1]}`;
};

/** The berth row at the ORIGIN stop that resolves the trip's 系統 (二段ゲートの決定打). */
const depRowOf = (s) => {
  const rows = s.departureBerthProof?.rows || [];
  return rows.find((r) => r.routeNumber === s.departureBerthRouteNumber) || rows[0] || null;
};

function main() {
  const accepted = GATE.signatures.filter((s) => s.verdict === 'ACCEPT-route16');
  const rejected = GATE.signatures.filter((s) => s.verdict !== 'ACCEPT-route16');

  const orders = {
    checkedAt: new Date().toISOString(),
    sourcePriority: [
      '京成バスナビ 個別便通過時刻表（/courses/timetables/**/stops?）',
      '京成バスナビ 時刻表凡例（符号→【Ｎ系統】）',
      'OSM route relation（道路形状・停留所座標）',
    ],
    lineName: '日の出線',
    systemNumber: '16',
    routeId: 'route-16',
    operator: '東京ベイシティ交通（京成グループ・京成バスナビ掲載）',
    busstopIds: {},
    gatingRule:
      '(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定した。'
      + '16系統と17系統はどちらも「日の出線」を名乗り、どちらも 日の出七丁目 を発着し、'
      + '日の出西／順天堂大学・日の出 正門／プラウド新浦安パークマリーナ／日の出中学校／ベイシティ浦安 を共有する。'
      + 'そのためコース名・中間停留所ののりばだけでは 16/17 を分離できない。'
      + '(B) 出発のりば（新浦安駅のりばC＝16／日の出七丁目のりば01＝16）の凡例を決定打とし、'
      + '(B) が【１６系統】に解決し、かつ (A) が16以外に解決していない便のみ採用した。',
    siblingRouteSeparation: {
      siblingSystemNumber: '17',
      siblingDescription: '17系統は「日の出東経由（東京電力経由）」。日の出保育園入口・東京電力・日の出小学校・日の出東・アールフォーラム・順天堂大学・日の出 東口 を通る。',
      siblingOsmRelations: ROUTE17_RELATIONS,
      rule: 'route-16 では17系統の便・停留所順・OSM relationを一切使用しない。',
    },
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
    routeId: 'route-16',
    systemNumber: '16',
    note: '各系統キーが公式停留所順として一意であることの証明。停留所ID列（busstop id）が主キー。17系統との分離証跡を含む。',
    uniqueness: {},
    systems: {},
    rejectedSiblingRoute17: orders.rejectedOtherRoutes.filter((r) => r.routeNumber === '17'),
  };

  const seenSig = new Map();
  for (const s of accepted) {
    const endpoints = `${s.stopNames[0]}>${s.stopNames[s.stopNames.length - 1]}`;
    const def = SYSTEM_BY_ENDPOINTS[endpoints];
    if (!def) throw new Error(`unmapped accepted signature ${endpoints} (course ${s.course})`);
    if (orders.systems[def.key]) throw new Error(`duplicate accepted signature for ${def.key}`);
    if (ROUTE17_RELATIONS.includes(def.relationId)) throw new Error(`${def.key} points at a route-17 relation`);
    const osmRel = OSM.relations.find((r) => r.id === def.relationId);
    const osmNames = osmRel?.platformNames || [];
    const osmExact = osmNames.length === s.stopNames.length
      && osmNames.every((n, i) => n === s.stopNames[i]);
    const osmMatch = osmNames.length === s.stopNames.length
      && osmNames.every((n, i) => normalizeKey(n) === normalizeKey(s.stopNames[i]));
    const nameDiffs = osmNames
      .map((n, i) => ({ index: i, osm: n, navi: s.stopNames[i] || null }))
      .filter((d) => d.osm !== d.navi);
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
      routeNumber: '16',
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
      osmPlatformNamesExactMatch: osmExact,
      osmNameDifferences: nameDiffs,
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
      osmPlatformNamesExactMatch: osmExact,
    };
  }

  for (const key of SYSTEM_ORDER) {
    if (!orders.systems[key]) throw new Error(`missing expected system ${key}`);
  }
  if (Object.keys(orders.systems).length !== SYSTEM_ORDER.length) {
    throw new Error(`unexpected accepted system count ${Object.keys(orders.systems).length}`);
  }
  // No accepted system may contain a stop that only exists on route 17.
  const ROUTE17_ONLY_STOPS = ['東京電力', '日の出東', '日の出小学校', '日の出保育園入口', 'アールフォーラム', '東口'];
  for (const key of SYSTEM_ORDER) {
    const bad = orders.systems[key].stopNames.filter((n) => ROUTE17_ONLY_STOPS.some((x) => n.includes(x)));
    if (bad.length) throw new Error(`${key}: route-17-only stops leaked in: ${bad.join(',')}`);
  }

  signatures.uniqueness = {
    systemCount: Object.keys(signatures.systems).length,
    allStopIdSignaturesDistinct: new Set(Object.values(signatures.systems).map((v) => v.stopIdSignature)).size
      === Object.keys(signatures.systems).length,
    allStopNameSignaturesDistinct: new Set(Object.values(signatures.systems).map((v) => v.stopNameSignature)).size
      === Object.keys(signatures.systems).length,
    osmAllMatch: Object.values(signatures.systems).every((v) => v.osmPlatformOrderMatchesOfficial),
    route17StopsAbsent: true,
  };

  fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(orders, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'system-signatures.json'), JSON.stringify(signatures, null, 2), 'utf8');

  // ---- official-sources.md ----
  const src = [];
  src.push('# 日の出線（系統16 / route-16）公式出典');
  src.push('');
  src.push('調査日: 2026-07-26');
  src.push('');
  src.push('事業者: 東京ベイシティ交通（京成グループ）。京成バスナビ（keiseibus-group）に掲載される。');
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
  src.push('### 除外した便（17系統との分離）');
  src.push('');
  src.push('| コース | 符号 | (A) 掲載凡例の系統 | (B) 出発のりば | (B) が示す系統 | 停留所数 | 起点 → 終点 | 判定 |');
  src.push('| --- | --- | --- | --- | --- | ---: | --- | --- |');
  for (const r of orders.rejectedOtherRoutes) {
    src.push(`| ${r.course || '-'} | ${r.symbol} | ${r.listingLegendRouteNumbers.join('/') || '-'} | ${r.departure} のりば${r.departureBerth || '(未解決)'} | ${r.departureBerthRouteNumber || '-'} | ${r.stopCount} | ${r.departure} → ${r.destination} | ${r.reason} |`);
  }
  src.push('');
  src.push('補足:');
  src.push('');
  src.push('- 17系統（符号 `ベ`）は プラウド新浦安パークマリーナ のりば02 の時刻表に16系統と同居して現れる。');
  src.push('  中間停留所の凡例だけでは分離できないため、出発停留所（新浦安駅）ののりば凡例まで遡って【１７系統】と確定した。');
  src.push('- 17系統だけが通る停留所: 日の出保育園入口 / 東京電力 / 日の出小学校 / 日の出東 / アールフォーラム / 順天堂大学・日の出 東口。');
  src.push('  これらが採用側の停留所順に混入していないことを `_build_official_gate.js` で機械的に検査している。');
  src.push('- 16系統には 日の出南小学校 / 日航東京(日航浦安) は現れない。公式便で一度も観測されていない。');
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
  src.push('表記差: OSMは「順天堂大学・日の出正門」、バスナビは「順天堂大学・日の出 正門」（全角スペースなしの半角空白）。');
  src.push('正規化キー（空白・中黒を除去）で一致を確認しており、停留所は同一。アプリの停留所名はバスナビ表記を正本とする。');
  src.push('');
  src.push('### 使用しない relation（17系統）');
  src.push('');
  src.push('| relation | name |');
  src.push('| ---: | --- |');
  for (const p of (OSM.refProbe17 || [])) {
    if (!p.id) continue;
    src.push(`| ${p.id} | ${p.tags?.name || '-'} |`);
  }
  src.push('');
  src.push('bbox 35.60,139.85,35.70,139.96 の `ref=16` 探索で見つかった bus relation は 18396563 / 18396562 の2件のみ（route_master なし）。');
  src.push('');
  src.push('Overpass: `overpass.kumi.systems` 優先。504 時は `overpass-api.de`、さらに `api.openstreetmap.org/api/0.6/relation/<id>/full.json` にフォールバック。');
  src.push('');
  src.push('## 使用しなかったもの');
  src.push('');
  src.push('- Google Directions / Google Maps の経路推定（道路形状には一切使用しない）');
  src.push('- 既存route1〜12・route-14・route-15のpath・stops');
  src.push('- route-17（日の出東経由）の便・停留所順・OSM relation（18396568 / 18396569 / 18396583）');
  src.push('');
  fs.writeFileSync(path.join(OUT, 'official-sources.md'), `${src.join('\n')}\n`, 'utf8');

  // ---- route-pattern-summary.md ----
  const pat = [];
  pat.push('# 日の出線（系統16 / route-16）運行パターン');
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
  pat.push('## 往路・復路の関係');
  pat.push('');
  pat.push('- 停留所名の並びは **完全な逆順**（10停留所、経由地の増減なし）。');
  pat.push('- ただし **道路は別relation**（18396563 / 18396562）であり、往路pathの反転による復路生成は禁止。');
  pat.push('- のりばのノードIDと座標は往復で別。新浦安駅は往路 `platform_entry_only` / 復路 `platform_exit_only`、');
  pat.push('  日の出七丁目は往路 `platform_exit_only` / 復路 `platform_entry_only`。');
  pat.push('- 復路の凡例は「プラウド新浦安パークマリーナ・**海風の街**経由 新浦安駅行き」で、海風の街は往復とも経由する。');
  pat.push('');
  pat.push('## 16系統と17系統の切り分け（最重要）');
  pat.push('');
  pat.push('| | 16系統 | 17系統 |');
  pat.push('| --- | --- | --- |');
  pat.push('| 路線名 | 日の出線 | 日の出線（同名） |');
  pat.push('| 新浦安駅 のりば | C | 17 |');
  pat.push('| 符号 | 無印 | ベ / ★ベ（深夜バス） |');
  pat.push('| 経由 | プラウド新浦安パークマリーナ・海風の街 | 日の出東・東京電力 |');
  pat.push('| 固有の停留所 | 海風の街 | 日の出保育園入口 / 東京電力 / 日の出小学校 / 日の出東 / アールフォーラム / 順天堂大学・日の出 東口 |');
  pat.push('| OSM relation | 18396563 / 18396562 | 18396568 / 18396569 / 18396583 |');
  pat.push('');
  pat.push('両系統とも 日の出七丁目 を発着し、日の出西・順天堂大学・日の出 正門・プラウド新浦安パークマリーナ・');
  pat.push('日の出中学校・ベイシティ浦安 を共有するため、**コース名や中間停留所ののりばでは分離できない**。');
  pat.push('出発停留所ののりば凡例まで遡って初めて系統が一意に決まる。');
  pat.push('');
  pat.push('## 個別確認項目');
  pat.push('');
  pat.push('| 項目 | 結果 |');
  pat.push('| --- | --- |');
  pat.push('| 海風の街経由の有無 | **あり**（往復とも。復路の凡例に「海風の街経由」と明記） |');
  pat.push('| 日航浦安（日航東京）方向 | 16系統では**経由しない**（公式便に出現せず） |');
  pat.push('| 日の出中学校周辺 | 往復とも停車。ベイシティ浦安↔プラウド新浦安パークマリーナ間 |');
  pat.push('| 順天堂大学・日の出正門 | 往復とも停車。「日の出 東口」は17系統のみで16系統には無い |');
  pat.push('| 日の出南小学校 | 16系統では**通らない**（公式便に出現せず） |');
  pat.push('| 日の出七丁目 折返し | 折返しではなく、往復それぞれ独立したrelation。往路は降車専用ノード、復路は乗車専用ノードで座標が異なる |');
  pat.push('| ベイシティ浦安 の方向別のりば | 往路 node 6813929333 / 復路 node 1312616418 の別ノード |');
  pat.push('');
  pat.push('## 注意点');
  pat.push('');
  pat.push('- 事業者は東京ベイシティ交通。京成バスナビ（keiseibus-group）に掲載されるが、京成バス本体の系統16ではない。');
  pat.push('- route-11（シンボルロード線）は日の出公民館付近で走行区間が重なるが、停留所順・pathとも流用していない。');
  pat.push('');
  fs.writeFileSync(path.join(OUT, 'route-pattern-summary.md'), `${pat.join('\n')}\n`, 'utf8');

  console.log('systems:', Object.keys(orders.systems).join(', '));
  console.log('uniqueness:', JSON.stringify(signatures.uniqueness));
  console.log('rejected:', orders.rejectedOtherRoutes.map((r) => `${r.symbol}=route${r.routeNumber}`).join(', '));
  console.log('wrote official-stop-orders.json, system-signatures.json, official-sources.md, route-pattern-summary.md');
}

main();
