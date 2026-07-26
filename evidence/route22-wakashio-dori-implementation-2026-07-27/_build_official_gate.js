'use strict';
/**
 * Turn gated navi signatures into canonical evidence artifacts for route-22.
 * Input: _signature_gate.json, _navi_deep_raw.json, osm-relations.json
 * Output: official-stop-orders.json, official-trip-signatures.json,
 *         official-sources.md, system-pattern-summary.md
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const GATE = readJson('_signature_gate.json');
const DEEP = readJson('_navi_deep_raw.json');
const OSM = readJson('osm-relations.json');

const ROUTE_NUM = '22';
const CONFIRMED_DATE = '2026-07-27';

/** Map accepted endpoint pairs + path hints to systemKey and OSM relation. Assigned from accepted data only. */
function inferSystemKey(s) {
  const dep = s.stopNames[0];
  const dest = s.stopNames[s.stopNames.length - 1];
  if (dep === '新浦安駅' && dest === '千鳥車庫') {
    return { key: '22-shinurayasu-chidori-garage', directionGroup: 'outbound', osmRelationId: 18396547, title: '千鳥車庫行き（新浦安駅発・千鳥東経由）' };
  }
  if (dep === '千鳥車庫' && dest === '新浦安駅') {
    return { key: '22-chidori-garage-shinurayasu', directionGroup: 'inbound', osmRelationId: 18396546, title: '新浦安駅行き（千鳥車庫発・順天堂病院前経由）' };
  }
  return { key: `22-unmapped-${dep}-${dest}`.replace(/[^a-z0-9-]/gi, '-'), directionGroup: 'unknown', osmRelationId: null, title: `${dep} → ${dest}` };
}

const normalizeKey = (s) => String(s || '')
  .normalize('NFKC')
  .replace(/（.*?）|\(.*?\)/g, '')
  .replace(/[\s　・･「」『』]/g, '');

const depRowOf = (s) => {
  const rows = s.departureBerthProof?.rows || [];
  return rows.find((r) => r.routeNumber === s.departureBerthRouteNumber) || rows[0] || null;
};

function osmFor(id) {
  return (OSM.relations || []).find((r) => r.id === id && r.ok !== false) || null;
}

function main() {
  const accepted = GATE.signatures.filter((s) => s.verdict === `ACCEPT-route${ROUTE_NUM}`);
  const rejected = GATE.signatures.filter((s) => s.verdict !== `ACCEPT-route${ROUTE_NUM}`);

  const orders = {
    checkedAt: new Date().toISOString(),
    sourcePriority: [
      '京成バスナビ 個別便通過時刻表（/courses/timetables/**/stops?）',
      '京成バスナビ 時刻表凡例（符号→【Ｎ系統】）',
      'OSM route relation（道路形状・停留所座標）',
    ],
    lineName: '若潮通り線',
    systemNumber: ROUTE_NUM,
    routeId: 'route-22',
    operator: '東京ベイシティ交通（京成グループ・京成バスナビ掲載）',
    busstopIds: { ...(DEEP.discoveredBusstopIds || {}), ...(readJson('_navi_scrape_raw.json').knownIds || {}) },
    gatingRule: '(A) 便が載っていた時刻表の凡例 と (B) 便の出発停留所ののりばの時刻表の凡例 の二段で系統を判定。'
      + '千鳥車庫のりば02等では [20]/[22]/[2]/[4]/[14] が混載されるため、(B) 出発のりば凡例が【２０系統】に解決した便のみ採用。'
      + '22系統（22千鳥東 / 若潮通り線）は REJECT。',
    siblingRouteSeparation: {
      siblingSystemNumber: '20',
      siblingDescription: '20系統は千鳥線（舞浜方面）。千鳥車庫のりば02等で22系統と混載するが別系統。',
      siblingOsmRelations: (OSM.refProbe20 || []).map((r) => r.id).filter(Boolean),
      rule: 'route-22 では22系統の便・停留所順・OSM relationを一切使用しない。',
    },
    systems: {},
    rejectedOtherRoutes: rejected.map((s) => {
      const dep = depRowOf(s);
      return {
        course: s.course,
        symbol: s.cellSymbols.join(','),
        legend: s.legendMatches.map((m) => m.line),
        routeNumber: s.departureBerthRouteNumber || s.legendRouteNumbers.join('/'),
        departureBerth: dep?.berthLabel || null,
        stopCount: s.stopCount,
        departure: s.stopNames[0],
        destination: s.stopNames[s.stopNames.length - 1],
        stopNames: s.stopNames,
        sampleUrl: s.sampleUrls[0],
        reason: s.verdict,
      };
    }),
  };

  const tripSigs = {
    checkedAt: orders.checkedAt,
    routeId: 'route-22',
    systemNumber: ROUTE_NUM,
    note: '各系統キーが公式停留所順として一意であることの証明。',
    uniqueness: {},
    systems: {},
    rejectedSiblingRoute22: orders.rejectedOtherRoutes.filter((r) => String(r.reason).includes('22')),
  };

  const seenSig = new Map();
  const systemOrder = [];

  for (const s of accepted) {
    const def = inferSystemKey(s);
    if (orders.systems[def.key]) {
      // Same key with identical stop sequence is OK (merge trip counts)
      const existing = orders.systems[def.key];
      if (existing.stopNames.join('>') !== s.stopNames.join('>')) {
        throw new Error(`conflicting stop order for ${def.key}`);
      }
      existing.tripsObserved += s.tripCount;
      existing.allSampleUrls.push(...s.sampleUrls.filter((u) => !existing.allSampleUrls.includes(u)).slice(0, 3));
      continue;
    }
    systemOrder.push(def.key);

    const osmRel = def.osmRelationId ? osmFor(def.osmRelationId) : null;
    const osmNames = osmRel?.platformNames || [];
    const osmMatch = osmNames.length === s.stopNames.length
      && osmNames.every((n, i) => normalizeKey(n) === normalizeKey(s.stopNames[i]));
    const osmExact = osmNames.length === s.stopNames.length && osmNames.every((n, i) => n === s.stopNames[i]);
    const dep = depRowOf(s);

    orders.systems[def.key] = {
      title: def.title,
      summary: `${s.stopNames[0]} → ${s.stopNames[s.stopNames.length - 1]}`,
      directionGroup: def.directionGroup,
      departure: s.stopNames[0],
      destination: s.stopNames[s.stopNames.length - 1],
      berth: dep?.berthLabel || null,
      observedBerths: s.berth,
      departureBerthLegend: dep?.legendLine || null,
      departureBerthTimetableUrl: dep?.timetableUrl || null,
      timetableSymbol: (s.legendMatches[0]?.symbolRaw) || s.cellSymbols[0] || '無印',
      legendLine: s.legendMatches.map((m) => m.line)[0] || null,
      routeNumber: ROUTE_NUM,
      course: s.course,
      courseText: s.courseText,
      naviTerminal: s.terminal,
      sourceUrl: s.sampleUrls[0],
      allSampleUrls: s.sampleUrls,
      confirmedDate: CONFIRMED_DATE,
      tripsObserved: s.tripCount,
      departureTimesObserved: s.departureTimes,
      stopCount: s.stopCount,
      idComplete: s.idComplete,
      stopNames: s.stopNames,
      stopIds: s.stopIds,
      osmRelationId: def.osmRelationId,
      osmRelationName: osmRel?.name || null,
      osmPlatformOrderMatchesOfficial: osmMatch,
      osmPlatformNamesExactMatch: osmExact,
    };

    for (let i = 0; i < s.stopNames.length; i++) {
      if (s.stopIds[i]) orders.busstopIds[`${def.key}|${s.stopNames[i]}`] = s.stopIds[i];
    }

    const sigKey = s.stopNames.join('>');
    if (seenSig.has(sigKey)) throw new Error(`duplicate stop-name signature for ${def.key}`);
    seenSig.set(sigKey, def.key);

    tripSigs.systems[def.key] = {
      course: s.course,
      timetableSymbol: (s.legendMatches[0]?.symbolRaw) || s.cellSymbols[0] || '無印',
      berth: dep?.berthLabel || null,
      terminal: s.terminal,
      stopCount: s.stopCount,
      stopIdSignature: s.stopIds.join('>'),
      stopNameSignature: sigKey,
      legendProof: s.legendMatches.map((m) => m.line),
      departureBerthProof: {
        originStopName: s.departureBerthProof?.originStopName || null,
        busstopId: s.departureBerthProof?.busstopId || null,
        berthLabel: dep?.berthLabel || null,
        routeNumber: s.departureBerthRouteNumber || null,
        legendLine: dep?.legendLine || null,
        timetableUrl: dep?.timetableUrl || null,
      },
      tripsObserved: s.tripCount,
      dayLabels: s.dayLabels,
      sampleUrls: s.sampleUrls,
      osmRelationId: def.osmRelationId,
      osmPlatformOrderMatchesOfficial: osmMatch,
    };
  }

  tripSigs.uniqueness = {
    systemCount: Object.keys(tripSigs.systems).length,
    acceptedSignatureCount: accepted.length,
    rejectedSignatureCount: rejected.length,
    allStopIdSignaturesDistinct: new Set(Object.values(tripSigs.systems).map((v) => v.stopIdSignature)).size
      === Object.keys(tripSigs.systems).length,
  };

  fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(orders, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, 'official-trip-signatures.json'), JSON.stringify(tripSigs, null, 2), 'utf8');

  // official-sources.md
  const src = [];
  src.push('# 若潮通り線（系統22 / route-22 / 22千鳥東）公式出典');
  src.push('');
  src.push(`調査日: ${CONFIRMED_DATE}`);
  src.push('');
  src.push('事業者: 東京ベイシティ交通（京成グループ）。京成バスナビ（keiseibus-group）に掲載される。');
  src.push('');
  src.push('## 1. 京成バスナビ（最優先）');
  src.push('');
  src.push('ベースURL: https://transfer-cloud.navitime.biz/keiseibus-group');
  src.push('');
  src.push('| 用途 | URL |');
  src.push('| --- | --- |');
  src.push('| 舞浜駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020617 |');
  src.push('| 千鳥車庫 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020620 |');
  src.push('| 新浦安駅 のりば・系統一覧 | https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=00020619 |');
  src.push('');
  src.push('### 採用した運行パターン');
  src.push('');
  src.push('| systemKey | 符号 | 起点 → 終点 | 停留所数 | 便数 | 出典URL |');
  src.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const key of systemOrder) {
    const s = orders.systems[key];
    src.push(`| \`${key}\` | ${s.timetableSymbol} | ${s.departure} → ${s.destination} | ${s.stopCount} | ${s.tripsObserved} | ${s.sourceUrl} |`);
  }
  src.push('');
  src.push('### 二段凡例ゲート');
  src.push('');
  src.push(orders.gatingRule);
  src.push('');
  src.push('### 除外した便（20系統等）');
  src.push('');
  src.push('| コース | 符号 | 系統 | 起点 → 終点 | 判定 |');
  src.push('| --- | --- | --- | --- | --- |');
  for (const r of orders.rejectedOtherRoutes.slice(0, 30)) {
    src.push(`| ${r.course || '-'} | ${r.symbol} | ${r.routeNumber || '-'} | ${r.departure} → ${r.destination} | ${r.reason} |`);
  }
  src.push('');
  src.push('## 2. OSM route relations');
  src.push('');
  src.push('| relation | name | platforms | 公式順一致 |');
  src.push('| ---: | --- | ---: | --- |');
  for (const key of systemOrder) {
    const s = orders.systems[key];
    if (!s.osmRelationId) continue;
    const rel = osmFor(s.osmRelationId);
    src.push(`| ${s.osmRelationId} | ${s.osmRelationName || '-'} | ${rel?.platformMemberCount ?? '?'} | ${s.osmPlatformOrderMatchesOfficial ? 'YES' : 'NO'} |`);
  }
  src.push('');
  src.push('## 使用しなかったもの');
  src.push('');
  src.push('- Google Directions / Google Maps の経路推定');
  src.push('- route-20（千鳥線）の便・OSM relation');
  src.push('');
  fs.writeFileSync(path.join(OUT, 'official-sources.md'), `${src.join('\n')}\n`, 'utf8');

  // system-pattern-summary.md
  const pat = [];
  pat.push('# 若潮通り線（系統22 / route-22 / 22千鳥東）運行パターン');
  pat.push('');
  pat.push(`確認日: ${CONFIRMED_DATE} ／ 出典: 京成バスナビ個別便通過時刻表`);
  pat.push('');
  pat.push(`公式に確認できた運行パターンは **${systemOrder.length}系統**（accepted signatures: ${accepted.length}）。`);
  pat.push('');
  pat.push('| systemKey | 方向 | 符号 | 起点 → 終点 | 停留所数 | 便数 | OSM relation |');
  pat.push('| --- | --- | --- | --- | ---: | ---: | ---: |');
  for (const key of systemOrder) {
    const s = orders.systems[key];
    pat.push(`| \`${key}\` | ${s.directionGroup} | ${s.timetableSymbol} | ${s.departure} → ${s.destination} | ${s.stopCount} | ${s.tripsObserved} | ${s.osmRelationId || '-'} |`);
  }
  pat.push('');
  pat.push('## 停留所順（正本）');
  pat.push('');
  for (const key of systemOrder) {
    const s = orders.systems[key];
    pat.push(`### \`${key}\` — ${s.title}（${s.stopCount}停留所）`);
    pat.push('');
    pat.push('| # | 停留所 | busstop id |');
    pat.push('| ---: | --- | --- |');
    s.stopNames.forEach((n, i) => pat.push(`| ${i + 1} | ${n} | ${s.stopIds[i] || '(未取得)'} |`));
    pat.push('');
  }
  pat.push('## 22系統と20系統の切り分け');
  pat.push('');
  pat.push('| | 22系統 | 20系統 |');
  pat.push('| --- | --- | --- |');
  pat.push('| 路線名 | 若潮通り線（22千鳥東） | 千鳥線 |');
  pat.push('| 新浦安駅 | [20]は掲載なし（2026-07-27確認） | のりばB |');
  pat.push('| 千鳥車庫のりば02 | [20]/[22]/[2]/[4]/[14]混載 | 同セルに22あり |');
  pat.push('| 判定 | 出発のりば凡例→【２０系統】 | 出発のりば凡例→【２２系統】 |');
  pat.push('');
  fs.writeFileSync(path.join(OUT, 'system-pattern-summary.md'), `${pat.join('\n')}\n`, 'utf8');

  console.log('systems:', systemOrder.join(', '));
  console.log('accepted:', accepted.length, 'rejected:', rejected.length);
  console.log('wrote official-stop-orders.json, official-trip-signatures.json, official-sources.md, system-pattern-summary.md');
}

main();
