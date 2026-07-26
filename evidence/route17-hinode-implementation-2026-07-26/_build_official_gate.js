'use strict';
/**
 * Turn the gated signatures into the authoritative route-17 artefacts.
 *
 * Input : _signature_gate.json (2段凡例ゲート済み) + _navi_deep_raw.json + osm-relations-summary.json
 * Output: official-stop-orders.json / official-trip-signatures.json / system-signatures.json
 *         / route-pattern-summary.md / official-sources.md
 *
 * Only signatures with verdict ACCEPT-route17 become systems. Everything else is recorded
 * under rejectedOtherRoutes with the legend line that rejected it.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const GATE = JSON.parse(fs.readFileSync(path.join(OUT, '_signature_gate.json'), 'utf8'));
const DEEP = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_deep_raw.json'), 'utf8'));
const OSM = JSON.parse(fs.readFileSync(path.join(OUT, 'osm-relations-summary.json'), 'utf8'));

const ROUTE_NUM = '17';
const CONFIRMED_DATE = '2026-07-26';

/** systemKey assignment is driven by (departure, destination, course), never by guesswork. */
const SYSTEM_BY_COURSE = {
  '0008200282': {
    key: '17-hinode-nanachome',
    directionGroup: 'outbound',
    title: '日の出七丁目行き',
    osmRelationId: 18396569,
  },
  '0008200283': {
    key: '17-baycity-urayasu',
    directionGroup: 'outbound',
    title: 'ベイシティ浦安行き',
    osmRelationId: 18396583,
  },
  '0008200281': {
    key: '17-shinurayasu',
    directionGroup: 'inbound',
    title: '新浦安駅行き',
    osmRelationId: 18396568,
  },
};

const SYSTEM_ORDER = ['17-hinode-nanachome', '17-baycity-urayasu', '17-shinurayasu'];

const normalizeKey = (name) => String(name || '')
  .normalize('NFKC')
  .replace(/（.*?）|\(.*?\)/g, '')
  .replace(/[\s　・･「」『』]/g, '');

function summaryLine(stopNames) {
  const first = stopNames[0];
  const last = stopNames[stopNames.length - 1];
  const via = stopNames.slice(1, -1).filter((n) => /東京電力|日の出東|順天堂大学|プラウド新浦安パークマリーナ|日の出西/.test(n));
  return [first, ...via, last].join(' → ');
}

function osmFor(relationId) {
  return (OSM.relations || []).find((r) => r.id === relationId && r.ok) || null;
}

function main() {
  const accepted = GATE.signatures.filter((s) => s.verdict === `ACCEPT-route${ROUTE_NUM}`);
  const rejected = GATE.signatures.filter((s) => s.verdict !== `ACCEPT-route${ROUTE_NUM}`);

  const busstopIds = {};
  for (const s of accepted) {
    s.stopNames.forEach((n, i) => {
      if (s.stopIds?.[i]) busstopIds[n] = String(s.stopIds[i]).split('-')[0];
    });
  }

  const systems = {};
  const tripSignatures = [];

  for (const sig of accepted) {
    const def = SYSTEM_BY_COURSE[sig.course];
    if (!def) throw new Error(`accepted signature with unmapped course ${sig.course}: ${sig.stopNames.join('>')}`);
    const osm = osmFor(def.osmRelationId);
    if (!osm) throw new Error(`${def.key}: OSM relation ${def.osmRelationId} not fetched`);

    const osmNames = osm.platformNames || [];
    const orderMatches = osmNames.length === sig.stopNames.length
      && osmNames.every((n, i) => normalizeKey(n) === normalizeKey(sig.stopNames[i]));
    const exactMatch = osmNames.length === sig.stopNames.length
      && osmNames.every((n, i) => n === sig.stopNames[i]);
    const differences = [];
    for (let i = 0; i < Math.max(osmNames.length, sig.stopNames.length); i++) {
      if (osmNames[i] !== sig.stopNames[i]) differences.push({ index: i, navi: sig.stopNames[i] ?? null, osm: osmNames[i] ?? null });
    }

    const depProofRow = (sig.departureBerthProof?.rows || [])[0] || {};

    systems[def.key] = {
      title: def.title,
      summary: summaryLine(sig.stopNames),
      directionGroup: def.directionGroup,
      departure: sig.stopNames[0],
      destination: sig.stopNames[sig.stopNames.length - 1],
      berth: depProofRow.berthLabel ? String(depProofRow.berthLabel).match(/^\S+/)?.[0] || depProofRow.berthLabel : null,
      observedBerths: sig.berth,
      departureBerthLegend: depProofRow.legendLine || null,
      departureBerthTimetableUrl: depProofRow.timetableUrl || null,
      timetableSymbol: sig.cellSymbols.join(','),
      legendLine: (sig.legendMatches[0] || {}).line || null,
      routeNumber: ROUTE_NUM,
      course: sig.course,
      allCourses: sig.allCourses,
      courseText: sig.courseText,
      naviTerminal: sig.terminal,
      sourceUrl: sig.sampleUrls[0],
      allSampleUrls: sig.sampleUrls,
      confirmedDate: CONFIRMED_DATE,
      tripsObserved: sig.tripCount,
      departureTimesObserved: sig.departureTimes,
      stopCount: sig.stopCount,
      idComplete: sig.idComplete,
      stopNames: sig.stopNames,
      stopIds: (sig.stopIds || []).map((x) => (x ? String(x).split('-')[0] : null)),
      route16ExclusiveStopsPresent: sig.route16ExclusiveStopsPresent,
      osmRelationId: def.osmRelationId,
      osmRelationName: osm.name,
      osmPlatformOrderMatchesOfficial: orderMatches,
      osmPlatformNamesExactMatch: exactMatch,
      osmNameDifferences: differences,
    };

    tripSignatures.push({
      systemKey: def.key,
      verdict: sig.verdict,
      routeNumber: ROUTE_NUM,
      course: sig.course,
      allCourses: sig.allCourses,
      courseSequence: sig.courseSequence,
      courseText: sig.courseText,
      departureBerth: depProofRow.berthLabel || null,
      departureBerthLegendLine: depProofRow.legendLine || null,
      departureBerthRouteNumber: sig.departureBerthRouteNumber,
      listingLegendLines: sig.legendMatches.map((m) => m.line),
      listingLegendRouteNumbers: sig.legendRouteNumbers,
      tripPageRouteNumbers: sig.tripPageRouteNumbers,
      timetableSymbols: sig.cellSymbols,
      tripsObserved: sig.tripCount,
      dayLabels: sig.dayLabels,
      stopCount: sig.stopCount,
      stopNames: sig.stopNames,
      stopIds: sig.stopIds,
      platformIds: sig.platformIds,
      idComplete: sig.idComplete,
      sampleUrls: sig.sampleUrls,
      route17ExclusiveStopsPresent: sig.route17ExclusiveStopsPresent,
      route16ExclusiveStopsPresent: sig.route16ExclusiveStopsPresent,
    });
  }

  for (const key of SYSTEM_ORDER) {
    if (!systems[key]) throw new Error(`expected system ${key} was not produced by the gate`);
  }

  const rejectedOtherRoutes = rejected.map((s) => ({
    verdict: s.verdict,
    resolvedRouteNumber: s.departureBerthRouteNumber,
    reason: `出発のりばの凡例が【${s.departureBerthRouteNumber}系統】に解決したため route-17 から除外`,
    departureBerth: (s.departureBerthProof?.rows || [])[0]?.berthLabel || null,
    departureBerthLegendLine: (s.departureBerthProof?.rows || [])[0]?.legendLine || null,
    listingLegendLines: s.legendMatches.map((m) => m.line),
    course: s.course,
    courseText: s.courseText,
    tripsObserved: s.tripCount,
    stopCount: s.stopCount,
    stopNames: s.stopNames,
    route16ExclusiveStopsPresent: s.route16ExclusiveStopsPresent,
    sampleUrls: s.sampleUrls,
  }));

  const orders = {
    checkedAt: new Date().toISOString(),
    sourcePriority: '京成バスナビ（keiseibus-group）個別便通過時刻表 > OSM。停留所順は必ず前者。',
    lineName: '日の出線',
    systemNumber: ROUTE_NUM,
    routeId: 'route-17',
    operator: '東京ベイシティ交通',
    busstopIds,
    gatingRule: GATE.policy,
    siblingRouteSeparation: '16系統（プラウド新浦安パークマリーナ・海風の街経由）は同じ「日の出線」名称で 日の出七丁目 発着も共通。'
      + '新浦安駅では 16=のりばC / 17=のりば17、日の出七丁目では 16=のりば01 / 17=のりば17 に分かれる。'
      + '17系統固有の停留所は 日の出保育園入口 / 東京電力 / 日の出小学校 / 日の出東 / アールフォーラム / 順天堂大学・日の出 東口。'
      + '16系統固有の停留所は 海風の街。',
    systems,
    rejectedOtherRoutes,
  };

  fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(orders, null, 2), 'utf8');

  fs.writeFileSync(path.join(OUT, 'official-trip-signatures.json'), JSON.stringify({
    checkedAt: GATE.checkedAt,
    routeNumber: ROUTE_NUM,
    siblingRouteNumber: GATE.siblingRouteNumber,
    policy: GATE.policy,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    accepted: tripSignatures,
    rejected: rejectedOtherRoutes,
    timetableLegends: GATE.timetableLegends,
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(OUT, 'system-signatures.json'), JSON.stringify({
    checkedAt: GATE.checkedAt,
    routeId: 'route-17',
    systemNumber: ROUTE_NUM,
    systems: Object.fromEntries(SYSTEM_ORDER.map((k) => {
      const s = systems[k];
      return [k, {
        directionGroup: s.directionGroup,
        title: s.title,
        departure: s.departure,
        destination: s.destination,
        berth: s.berth,
        timetableSymbol: s.timetableSymbol,
        departureBerthLegend: s.departureBerthLegend,
        course: s.course,
        allCourses: s.allCourses,
        tripsObserved: s.tripsObserved,
        stopCount: s.stopCount,
        stopNames: s.stopNames,
        stopIds: s.stopIds,
        osmRelationId: s.osmRelationId,
        osmRelationName: s.osmRelationName,
        osmPlatformOrderMatchesOfficial: s.osmPlatformOrderMatchesOfficial,
      }];
    })),
  }, null, 2), 'utf8');

  // ---- route-pattern-summary.md ----
  const md = [];
  md.push('# 日の出線（系統17 / route-17）運行パターン', '');
  md.push(`確認日: ${CONFIRMED_DATE} ／ 出典: 京成バスナビ個別便通過時刻表`, '');
  md.push(`公式に確認できた運行パターンは **${SYSTEM_ORDER.length}系統**。`, '');
  md.push('| systemKey | 方向 | 符号 | 起点 → 終点 | 停留所数 | 便数 | 出発のりば | OSM relation |');
  md.push('| --- | --- | --- | --- | ---: | ---: | --- | ---: |');
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    md.push(`| \`${k}\` | ${s.directionGroup} | ${s.timetableSymbol} | ${s.departure} → ${s.destination} | ${s.stopCount} | ${s.tripsObserved} | ${s.berth} | ${s.osmRelationId} |`);
  }
  md.push('', '## 停留所順（正本）', '');
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    md.push(`### \`${k}\` — ${s.title}（${s.stopCount}停留所）`, '');
    md.push('| # | 停留所 | busstop id |');
    md.push('| ---: | --- | --- |');
    s.stopNames.forEach((n, i) => md.push(`| ${i + 1} | ${n} | ${s.stopIds[i] || '-'} |`));
    md.push('');
  }
  md.push('## 凡例（出発のりばの時刻表）', '');
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    md.push(`- \`${k}\`：のりば **${s.berth}**／符号 **${s.timetableSymbol}** → ${s.departureBerthLegend}`);
  }
  md.push('', '## 17系統と16系統の切り分け（最重要）', '');
  md.push('| | 17系統 | 16系統 |');
  md.push('| --- | --- | --- |');
  md.push('| 路線名 | 日の出線 | 日の出線（同名） |');
  md.push('| 新浦安駅 のりば | 17 | C |');
  md.push('| 日の出七丁目 のりば | 17 | 01 |');
  md.push('| 符号 | 無印 / ベ / ★ベ（深夜） | 無印 |');
  md.push('| 経由 | 日の出東・東京電力 | プラウド新浦安パークマリーナ・海風の街 |');
  md.push('| 固有の停留所 | 日の出保育園入口 / 東京電力 / 日の出小学校 / 日の出東 / アールフォーラム / 順天堂大学・日の出 東口 | 海風の街 |');
  md.push('| OSM relation | 18396569 / 18396583 / 18396568 | 18396563 / 18396562 |');
  md.push('');
  md.push('両系統とも 日の出七丁目 を発着し、`17-baycity-urayasu` は 日の出西・順天堂大学・日の出 正門・');
  md.push('プラウド新浦安パークマリーナ・日の出中学校・ベイシティ浦安 を16系統と共有するため、');
  md.push('**コース名や中間停留所ののりばでは分離できない**。出発停留所ののりば凡例まで遡って初めて系統が一意に決まる。');
  md.push('');
  if (rejectedOtherRoutes.length) {
    md.push('## ゲートで除外した便', '');
    md.push('| 除外 | 便数 | 起点 → 終点 | 出発のりば | 凡例 |');
    md.push('| --- | ---: | --- | --- | --- |');
    for (const r of rejectedOtherRoutes) {
      md.push(`| ${r.verdict} | ${r.tripsObserved} | ${r.stopNames[0]} → ${r.stopNames[r.stopNames.length - 1]} | ${r.departureBerth || '-'} | ${r.departureBerthLegendLine || '-'} |`);
    }
    md.push('');
    md.push('この便は 海風の街 を経由する16系統の復路であり、プラウド新浦安パークマリーナ のりば02 の時刻表に');
    md.push('17系統と混載されていた。出発停留所（日の出七丁目）のりば01 の凡例が【１６系統】に解決したため除外した。');
    md.push('');
  }
  md.push('## 往路・復路の関係', '');
  md.push('- `17-hinode-nanachome`（新浦安駅→日の出七丁目）と `17-shinurayasu`（日の出七丁目→新浦安駅）は');
  md.push('  **停留所名の並びが完全な逆順**（10停留所、経由地の増減なし）。');
  md.push('- ただし **道路は別relation**（18396569 / 18396568）であり、往路pathの反転による復路生成は禁止。');
  md.push('- `17-baycity-urayasu` は 順天堂大学・日の出 東口 の先で 日の出七丁目 へは向かわず、日の出西 →');
  md.push('  順天堂大学・日の出 正門 → プラウド新浦安パークマリーナ → 日の出中学校 → ベイシティ浦安 と進む14停留所の別系統。');
  md.push('- ベイシティ浦安 発の [17] 公開便コースは存在しない（バスナビの courses 一覧に該当なし）。');
  md.push('  したがって「ベイシティ浦安 → 新浦安駅」は route-17 には実装しない。');
  md.push('');
  md.push('## 注意点', '');
  md.push('- 事業者は東京ベイシティ交通。京成バスナビ（keiseibus-group）に掲載されるが、京成バス本体の系統17ではない。');
  md.push('- OSM表記 `順天堂大学・日の出東口` / `順天堂大学・日の出正門` に対し、バスナビ表記は');
  md.push('  `順天堂大学・日の出 東口` / `順天堂大学・日の出 正門`（半角空白あり）。正本はバスナビ表記。');
  md.push('- `ベ` と `★ベ` は同一停留所順（course 0008200283 / 0008200284）。★は深夜バス（運賃倍額）。');
  md.push('');
  fs.writeFileSync(path.join(OUT, 'route-pattern-summary.md'), md.join('\n'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'system-pattern-summary.md'), md.join('\n'), 'utf8');

  // ---- official-sources.md ----
  const src = [];
  src.push('# route-17 日の出線 一次情報ソース', '');
  src.push(`確認日: ${CONFIRMED_DATE}`, '');
  src.push('## 1. 京成バスナビ（正本）', '');
  src.push('停留所順は **すべて個別便通過時刻表（`/stops?`）から読み取った実データ**であり、推測は一切していない。', '');
  src.push('- 新浦安駅 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619');
  src.push('- 日の出七丁目 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020866');
  src.push('- ベイシティ浦安 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020734');
  src.push('- 日の出東 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020656');
  src.push('- 東京電力 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020642');
  src.push('');
  src.push('### 採用した系統と出発のりばの凡例', '');
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    src.push(`#### \`${k}\` — ${s.departure} → ${s.destination}（${s.stopCount}停留所・${s.tripsObserved}便）`, '');
    src.push(`- コース: \`${s.course}\`${s.allCourses.length > 1 ? `（同一停留所順の別コース: ${s.allCourses.filter((c) => c !== s.course).join(', ')}）` : ''}`);
    src.push(`- コース名: ${s.courseText}`);
    src.push(`- 出発のりば: **${s.berth}**／符号 **${s.timetableSymbol}**`);
    src.push(`- のりば凡例: ${s.departureBerthLegend}`);
    src.push(`- のりば時刻表: ${s.departureBerthTimetableUrl}`);
    src.push(`- 個別便サンプル: ${s.sourceUrl}`);
    src.push(`- 停留所順: ${s.stopNames.join(' > ')}`);
    src.push('');
  }
  src.push('### ゲートで除外した便', '');
  if (rejectedOtherRoutes.length) {
    for (const r of rejectedOtherRoutes) {
      src.push(`- **${r.verdict}** ${r.stopNames[0]} → ${r.stopNames[r.stopNames.length - 1]}（${r.tripsObserved}便・course \`${r.course}\`）`);
      src.push(`  - 出発のりば ${r.departureBerth} の凡例: ${r.departureBerthLegendLine}`);
      src.push(`  - 掲載時刻表の凡例: ${r.listingLegendLines.join(' / ')}`);
      src.push(`  - 16系統固有停留所: ${r.route16ExclusiveStopsPresent.join(', ') || '(なし)'}`);
      src.push(`  - サンプル: ${r.sampleUrls[0]}`);
    }
  } else {
    src.push('- なし');
  }
  src.push('');
  src.push('## 2. OpenStreetMap（座標・道路形状のみ）', '');
  src.push('Overpass（overpass.kumi.systems 優先／api.openstreetmap.org へフォールバック）で `ref=17` の');
  src.push('bus relation を bbox 35.60,139.85,35.70,139.96 から**探索して**取得した（ID決め打ちではない）。', '');
  src.push('| relation | name | way members | platform members |');
  src.push('| ---: | --- | ---: | ---: |');
  for (const r of (OSM.relations || []).filter((x) => x.ok)) {
    src.push(`| ${r.id} | ${r.name} | ${r.wayMemberCount} | ${r.platformMemberCount} |`);
  }
  src.push('');
  src.push('探索で見つかった `ref=17` relation は上記3件のみで、バスナビで確定した3系統と1対1で対応する。', '');
  src.push('### 分離ガード（route-16 relation）', '');
  src.push('同じ bbox の `ref=16` relation も記録したが、route-17 の geometry には**一切使用していない**。', '');
  for (const p of (OSM.refProbe16 || [])) {
    if (p.id) src.push(`- ${p.id} ${p.tags?.name || ''}`);
  }
  src.push('');
  src.push('## 3. 使用していない情報源', '');
  src.push('- Google Directions / Roads API（道路形状の生成に不使用）');
  src.push('- route-16 の `hinode-line-*` モジュール、path、停留所配列（読み取りも流用もしていない）');
  src.push('- 停留所画像（捏造なし。バンクは空で生成）');
  src.push('');
  fs.writeFileSync(path.join(OUT, 'official-sources.md'), src.join('\n'), 'utf8');

  console.log('accepted', accepted.length, 'rejected', rejected.length);
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    console.log(k, '|', s.stopCount, 'stops | rel', s.osmRelationId, '| osmOrderMatch', s.osmPlatformOrderMatchesOfficial, '| exactNames', s.osmPlatformNamesExactMatch);
    if (!s.osmPlatformOrderMatchesOfficial) console.log('   DIFF', JSON.stringify(s.osmNameDifferences));
  }
  console.log('wrote official-stop-orders.json / official-trip-signatures.json / system-signatures.json / route-pattern-summary.md / system-pattern-summary.md / official-sources.md');
}

main();
