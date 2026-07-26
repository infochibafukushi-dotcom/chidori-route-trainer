'use strict';
/**
 * Turn the gated signatures into the authoritative route-18 artefacts.
 *
 * Input : _signature_gate.json (2段凡例ゲート済み) + _navi_deep_raw.json
 *         + osm-relations-summary.json + _night_shortturn_probe.json
 * Output: official-stop-orders.json / official-trip-signatures.json / system-signatures.json
 *         / route-pattern-summary.md / system-pattern-summary.md / official-sources.md
 *
 * Only signatures with verdict ACCEPT-route18 can become systems, and a system is only produced
 * when a dedicated `ref=18` OSM relation exists whose platform order matches the navi stop order.
 * Accepted-but-unsourced patterns land in `deferredNoOsmSource` — they are never synthesised by
 * slicing a longer relation.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const GATE = readJson('_signature_gate.json');
const DEEP = readJson('_navi_deep_raw.json');
const OSM = readJson('osm-relations-summary.json');
const NIGHT = readJson('_night_shortturn_probe.json');

const ROUTE_NUM = '18';
const CONFIRMED_DATE = '2026-07-26';

/** systemKey assignment is driven by (departure, destination, course, OSM relation), never by guesswork. */
const SYSTEM_BY_COURSE = {
  '0008200286': {
    key: '18-takasu-seaside',
    directionGroup: 'outbound',
    title: '高洲海浜公園行き（浦安駅入口発）',
    osmRelationId: 18352908,
  },
  '0008200285': {
    key: '18-urayasu-eki-iriguchi',
    directionGroup: 'inbound',
    title: '浦安駅入口行き（高洲海浜公園発）',
    osmRelationId: 18352907,
  },
  '0008200289': {
    key: '18-takasu-kita-shogakko',
    directionGroup: 'night-shortturn',
    title: '高洲北小学校行き（新浦安駅発・夜間／深夜）',
    osmRelationId: 18417590,
  },

  /**
   * 新浦安駅発着の短縮便2本。専用の ref=18 relation は OSM に存在しないが、
   * route-18 自身の relation だけで道路形状を構成できることを実データで証明したため実装する。
   * 証拠は _shortturn_join_analysis.json / _rotary_order_analysis.json /
   * _shinurayasu_berth_probe.json / _turn_restriction_probe.json。
   */
  '0008200288': {
    key: '18-takasu-seaside-from-shinurayasu',
    directionGroup: 'outbound-shortturn',
    title: '高洲海浜公園行き（新浦安駅発）',
    subsequenceOfRelation: 18352908,
    composition: {
      kind: 'verified-berth-departure + verified-join',
      prefixRelation: 18417590,
      suffixRelation: 18352908,
      joinNode: 288796885,
      departurePlatform: { nodeId: 8415001161, berth: 'E', attestedBy: [18417590, 18352908] },
      proof: [
        '新浦安駅の platform node は 18417590（のりばE始発の夜間便）でも 18352908（通し便）でも'
          + '同一の 8415001161（local_ref=E）。通し便自身がのりばEに入る系統なので、のりばEからの発車形状は'
          + 'route-18 自身の relation に存在する。',
        '18417590 の way member 列 [0..20] は 18352908 の way member 列 [26..46] と'
          + 'way ID・順序ともに完全一致（21 way）。したがって「のりばE発車後の道路」は2つのrelationで同一。',
        '両者は way 1338975833 の終端ノード 288796885（潮音の街の先）で分岐する。'
          + '18417590 は 26359698（高洲八丁目方面）、18352908 は 1342409929（高洲海浜公園）へ進む。',
        'よって path = 18417590 の way[0..20]（のりばE→合流ノード） + 18352908 の 1342409929'
          + '（合流ノード→高洲海浜公園）で構成でき、これは 18352908 のノード列 index 103 以降と一致する。',
        'バスナビの所要時間も裏付けになる: 新浦安駅→入船中央エステート は通し便 0008200286・'
          + '夜間便 0008200289・短縮便 0008200288 のいずれも 1分で同一。',
      ],
    },
  },
  '0008200287': {
    key: '18-shinurayasu-from-takasu',
    directionGroup: 'inbound-shortturn',
    title: '新浦安駅行き（高洲海浜公園発）',
    subsequenceOfRelation: 18352907,
    composition: {
      kind: 'verified-join + attested-alighting-berth',
      prefixRelation: 18352907,
      suffixRelation: 18352908,
      joinNode: 288384935,
      arrivalPlatform: { nodeId: 8415001163, berth: 'X', note: '降車専用', attestedBy: 'OSMで新浦安駅を終点とする15 relation の全てが platform_exit_only でこのノードを使用' },
      proof: [
        '出発のりばは通し便 0008200285 と同じ 高洲海浜公園 のりば03 で、platform node も同一。'
          + '第1〜8停留所は 18352907 の platform と完全同一なので、前半は route-18 自身の relation で確定する。',
        '終点は 新浦安駅 のりばX（node 8415001163・note=降車専用・operator に東京ベイシティ交通を含む）。'
          + 'OSM上で新浦安駅を終点とする bus relation は15本あり、その全て（ref=15の高洲海浜公園発 18419864、'
          + 'ref=11の高洲海浜公園発 18419852、ref=19の高洲海浜公園発 18381770、ref=10/14/16/17/22/38/5/1-1/1-3/浦安03 を含む）'
          + 'が最終 platform として role=platform_exit_only でこのノードを使う。例外は0本。',
        'のりばXへ至るロータリー道路は route-18 自身の relation 18352908 に含まれる'
          + '（18352908 のノード列 index 80 の node 1312776534 がのりばXから 5.3m）。'
          + 'ロータリーの走行順は 進入 → のりばX → A → B → C → D → E → F → G → 退出。',
        '合流ノード 288384935 は 18352907（index 53・入船中央エステートの直後）と'
          + '18352908（index 73・ロータリー進入 way 720406629 の始点）が共有する実ノード。',
        'ロータリー進入 way 720406629 は access=yes / oneway=yes、'
          + 'のりばXに接する way 906161755 は access=permit だが bus=yes。'
          + '当該ノード群・way群に turn restriction relation は 0件（_turn_restriction_probe.json）。',
        'バスナビの所要時間も裏付けになる: 入船中央エステート→新浦安駅 は通し便 0008200285 が4分、'
          + '短縮便 0008200287 は6分。短縮便の方が長いので、のりばHで切り詰めた形状ではない。',
      ],
    },
  },
};

const SYSTEM_ORDER = [
  '18-takasu-seaside',
  '18-urayasu-eki-iriguchi',
  '18-takasu-kita-shogakko',
  '18-takasu-seaside-from-shinurayasu',
  '18-shinurayasu-from-takasu',
];

/**
 * Accepted route-18 patterns with no usable OSM road source. Empty since 2026-07-26:
 * both 新浦安駅 short-turns were resolved with route-18's own relations (see `composition`).
 */
const DEFERRED_BY_COURSE = {};

const BUSSTOP_IDS = DEEP.discoveredBusstopIds || {};

const normalizeKey = (name) => String(name || '')
  .normalize('NFKC')
  .replace(/（.*?）|\(.*?\)/g, '')
  .replace(/[\s　・･「」『』]/g, '');

const VIA_HINTS = /消防本部前|明海大学前|夢海の街|高洲橋|高洲中央公園|潮音の街|高洲四丁目|東京学館前/;

function summaryLine(stopNames) {
  const first = stopNames[0];
  const last = stopNames[stopNames.length - 1];
  const via = stopNames.slice(1, -1).filter((n) => VIA_HINTS.test(n));
  return [first, ...via, last].join(' → ');
}

function osmFor(relationId) {
  return (OSM.relations || []).find((r) => r.id === relationId && r.ok !== false) || null;
}

/** Is `short` a contiguous run inside `long`? Returns the 1-based start index or -1. */
function contiguousSubsequenceStart(shortNames, longNames) {
  const s = shortNames.map(normalizeKey);
  const l = longNames.map(normalizeKey);
  for (let i = 0; i + s.length <= l.length; i++) {
    if (s.every((n, j) => n === l[i + j])) return i + 1;
  }
  return -1;
}

/** Per-course symbol / trip-count facts read straight off the departure-berth timetables. */
function nightFacts() {
  const byCourse = {};
  for (const b of NIGHT.berths || []) {
    for (const c of b.courses || []) {
      if (!c.isRoute18Course) continue;
      if (!byCourse[c.course]) byCourse[c.course] = { course: c.course, berths: [], symbols: {}, legendLines: new Set(), hours: [] };
      const e = byCourse[c.course];
      const tag = `${b.label} / ${b.dayLabel}`;
      if (!e.berths.includes(tag)) e.berths.push(tag);
      for (const [sym, n] of Object.entries(c.symbols)) e.symbols[sym] = Math.max(e.symbols[sym] || 0, n);
      for (const l of c.legendBySymbol) if (l.legendLine) e.legendLines.add(l.legendLine);
      if (!e.hours.length) e.hours = c.samples.map((s) => s.hour);
    }
  }
  return Object.fromEntries(Object.entries(byCourse).map(([k, v]) => [k, {
    ...v, legendLines: [...v.legendLines],
  }]));
}

function main() {
  const accepted = GATE.signatures.filter((s) => s.verdict === `ACCEPT-route${ROUTE_NUM}`);
  const rejected = GATE.signatures.filter((s) => s.verdict !== `ACCEPT-route${ROUTE_NUM}`);
  const nightByCourse = nightFacts();

  const busstopIds = {};
  for (const s of accepted) {
    s.stopNames.forEach((n, i) => {
      const fromSig = s.stopIds?.[i] ? String(s.stopIds[i]).split('-')[0] : null;
      const id = fromSig || BUSSTOP_IDS[n] || null;
      if (id) busstopIds[n] = id;
    });
  }

  const systems = {};
  const tripSignatures = [];
  const deferred = [];

  for (const sig of accepted) {
    const def = SYSTEM_BY_COURSE[sig.course];
    const defer = DEFERRED_BY_COURSE[sig.course];
    if (!def && !defer) {
      throw new Error(`accepted signature with unmapped course ${sig.course}: ${sig.stopNames.join('>')}`);
    }
    const depProofRow = (sig.departureBerthProof?.rows || [])[0] || {};

    if (defer) {
      const parent = osmFor(defer.subsequenceOf);
      const start = parent ? contiguousSubsequenceStart(sig.stopNames, parent.platformNames || []) : -1;
      deferred.push({
        verdict: sig.verdict,
        routeNumber: ROUTE_NUM,
        course: sig.course,
        allCourses: sig.allCourses,
        courseText: sig.courseText,
        departure: sig.stopNames[0],
        destination: sig.stopNames[sig.stopNames.length - 1],
        stopCount: sig.stopCount,
        stopNames: sig.stopNames,
        stopIds: sig.stopNames.map((n) => busstopIds[n] || null),
        tripsObserved: sig.tripCount,
        departureTimesObserved: sig.departureTimes,
        timetableSymbol: depProofRow.symbol || sig.cellSymbols.join(','),
        listingSymbols: sig.cellSymbols,
        departureBerth: depProofRow.berthLabel || null,
        departureBerthLegend: depProofRow.legendLine || null,
        departureBerthTimetableUrl: depProofRow.timetableUrl || null,
        sampleUrls: sig.sampleUrls,
        osmRelationId: null,
        contiguousSubsequenceOfRelation: defer.subsequenceOf,
        contiguousSubsequenceStartIndex: start,
        contiguousSubsequenceVerified: start > 0,
        notImplementedReason: defer.reason,
      });
      continue;
    }

    const parentId = def.osmRelationId || def.subsequenceOfRelation;
    const osm = osmFor(parentId);
    if (!osm) throw new Error(`${def.key}: OSM relation ${parentId} not fetched`);

    const osmNames = osm.platformNames || [];
    let orderMatches;
    let exactMatch;
    const differences = [];
    let subsequenceStart = null;

    if (def.composition) {
      // 短縮便: navi の停留所順が親relationの platform 列の連続部分列であることを要求する。
      subsequenceStart = contiguousSubsequenceStart(sig.stopNames, osmNames);
      orderMatches = subsequenceStart > 0;
      const slice = subsequenceStart > 0 ? osmNames.slice(subsequenceStart - 1, subsequenceStart - 1 + sig.stopNames.length) : [];
      exactMatch = slice.length === sig.stopNames.length && slice.every((n, i) => n === sig.stopNames[i]);
      for (let i = 0; i < sig.stopNames.length; i++) {
        if (slice[i] !== sig.stopNames[i]) differences.push({ index: i, navi: sig.stopNames[i] ?? null, osm: slice[i] ?? null });
      }
      if (!orderMatches) {
        throw new Error(`${def.key}: navi stop order is not a contiguous subsequence of relation ${parentId} platforms`);
      }
    } else {
      orderMatches = osmNames.length === sig.stopNames.length
        && osmNames.every((n, i) => normalizeKey(n) === normalizeKey(sig.stopNames[i]));
      exactMatch = osmNames.length === sig.stopNames.length
        && osmNames.every((n, i) => n === sig.stopNames[i]);
      for (let i = 0; i < Math.max(osmNames.length, sig.stopNames.length); i++) {
        if (osmNames[i] !== sig.stopNames[i]) differences.push({ index: i, navi: sig.stopNames[i] ?? null, osm: osmNames[i] ?? null });
      }
      if (!orderMatches) throw new Error(`${def.key}: OSM platform order does not match navi order: ${JSON.stringify(differences)}`);
    }

    const fareVariants = sig.allCourses.map((c) => ({
      course: c,
      symbols: Object.keys(nightByCourse[c]?.symbols || {}),
      legendLines: nightByCourse[c]?.legendLines || [],
      departureHoursObserved: nightByCourse[c]?.hours || [],
      isDeepNightDoubleFare: Object.keys(nightByCourse[c]?.symbols || {}).some((s) => s.includes('★')),
    }));

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
      // Stage B (departure-berth) is the decisive symbol. The listing berth may show the trip
      // mid-route under a different symbol, or under none at all.
      timetableSymbol: depProofRow.symbol || sig.cellSymbols.join(','),
      departureBerthSymbol: depProofRow.symbol || null,
      listingSymbols: sig.cellSymbols,
      legendLine: (sig.legendMatches[0] || {}).line || null,
      routeNumber: ROUTE_NUM,
      course: sig.course,
      allCourses: sig.allCourses,
      fareVariants,
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
      stopIds: sig.stopNames.map((n) => busstopIds[n] || null),
      route18CharacteristicStopsPresent: sig.route18CharacteristicStopsPresent,
      siblingExclusiveStopsPresent: sig.siblingExclusiveStopsPresent,
      osmRelationId: def.osmRelationId || null,
      osmRelationName: def.osmRelationId ? osm.name : null,
      osmPlatformOrderMatchesOfficial: orderMatches,
      osmPlatformNamesExactMatch: exactMatch,
      osmNameDifferences: differences,
      // 短縮便のみ: 親relationとの関係と、道路形状の構成方法・その根拠
      osmSubsequenceOfRelation: def.composition ? def.subsequenceOfRelation : null,
      osmSubsequenceStartIndex: subsequenceStart,
      osmPathComposition: def.composition || null,
    };

    tripSignatures.push({
      systemKey: def.key,
      verdict: sig.verdict,
      routeNumber: ROUTE_NUM,
      course: sig.course,
      allCourses: sig.allCourses,
      fareVariants,
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
      stopIds: sig.stopNames.map((n) => busstopIds[n] || null),
      platformIds: sig.platformIds,
      idComplete: sig.idComplete,
      sampleUrls: sig.sampleUrls,
      route18CharacteristicStopsPresent: sig.route18CharacteristicStopsPresent,
      siblingExclusiveStopsPresent: sig.siblingExclusiveStopsPresent,
    });
  }

  for (const key of SYSTEM_ORDER) {
    if (!systems[key]) throw new Error(`expected system ${key} was not produced by the gate`);
  }

  const rejectedOtherRoutes = rejected.map((s) => {
    const row = (s.departureBerthProof?.rows || [])[0] || {};
    const n = s.departureBerthRouteNumber;
    return {
      verdict: s.verdict,
      resolvedRouteNumber: n,
      reason: n
        ? `出発のりばの凡例が【${n}系統】に解決したため route-18 から除外`
        : '出発のりばの凡例に符号が無く【１８系統】と確定できないため route-18 から除外',
      departureBerth: row.berthLabel || null,
      departureBerthLegendLine: row.legendLine || null,
      listingLegendLines: s.legendMatches.map((m) => m.line),
      course: s.course,
      courseText: s.courseText,
      tripsObserved: s.tripCount,
      stopCount: s.stopCount,
      stopNames: s.stopNames,
      siblingExclusiveStopsPresent: s.siblingExclusiveStopsPresent,
      route18CharacteristicStopsPresent: s.route18CharacteristicStopsPresent,
      sampleUrls: s.sampleUrls,
    };
  });

  const orders = {
    checkedAt: new Date().toISOString(),
    sourcePriority: '京成バスナビ（keiseibus-group）個別便通過時刻表 > OSM。停留所順は必ず前者。',
    lineName: '明海・高洲線',
    systemNumber: ROUTE_NUM,
    routeId: 'route-18',
    operator: '東京ベイシティ交通',
    busstopIds,
    gatingRule: GATE.policy,
    siblingRouteSeparation: '15系統は同じ「新浦安駅 のりばE」に完全同一のコース名で混載される。'
      + '符号のみが決定打で、無印=15系統（明海交差点・入船橋・東京学館前・高洲 経由）、'
      + 'ゆ/た/★た=18系統（明海大学前・海風の街・夢海の街・高洲橋 経由）。'
      + '18系統固有の停留所は 明海大学前 / 海風の街 / 夢海の街 / 高洲橋。'
      + '15系統固有の停留所は 明海交差点 / 入船橋。'
      + '19系統は 高洲四丁目 経由だが 浦安南高校 / 特別養護老人ホーム を通り、10系統は みなと南 を通る。'
      + '11/3/23系統は 新浦安駅 のりばH で 18系統と混載されるが、ベイパーク / ベイモール / '
      + 'シンボルロードパークシティ / 日の出公民館 / 総合公園 / ベイサイドホテルエリア / 望海の街 / 明海五丁目 側へ分岐する。',
    osmSourcingRule: '1系統 = 1 OSM relation を原則とする。専用relationが無いパターンは'
      + 'deferredNoOsmSource に記録する。例外: route-18 自身の relation だけで道路形状を'
      + '構成できることが実データで証明された場合のみ、検証済み composition（のりばE始発／'
      + 'のりばX降車）を許可する。blind mid-station slice は禁止。',
    systems,
    deferredNoOsmSource: deferred,
    rejectedOtherRoutes,
  };

  fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(orders, null, 2), 'utf8');

  fs.writeFileSync(path.join(OUT, 'official-trip-signatures.json'), JSON.stringify({
    checkedAt: GATE.checkedAt,
    routeNumber: ROUTE_NUM,
    siblingRouteNumbers: GATE.siblingRouteNumbers,
    policy: GATE.policy,
    acceptedCount: accepted.length,
    implementedCount: tripSignatures.length,
    deferredCount: deferred.length,
    rejectedCount: rejected.length,
    accepted: tripSignatures,
    deferredNoOsmSource: deferred,
    rejected: rejectedOtherRoutes,
    timetableLegends: GATE.timetableLegends,
  }, null, 2), 'utf8');

  fs.writeFileSync(path.join(OUT, 'system-signatures.json'), JSON.stringify({
    checkedAt: GATE.checkedAt,
    routeId: 'route-18',
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
        departureBerthSymbol: s.departureBerthSymbol,
        listingSymbols: s.listingSymbols,
        departureBerthLegend: s.departureBerthLegend,
        course: s.course,
        allCourses: s.allCourses,
        fareVariants: s.fareVariants,
        tripsObserved: s.tripsObserved,
        stopCount: s.stopCount,
        stopNames: s.stopNames,
        stopIds: s.stopIds,
        osmRelationId: s.osmRelationId,
        osmRelationName: s.osmRelationName,
        osmPlatformOrderMatchesOfficial: s.osmPlatformOrderMatchesOfficial,
      }];
    })),
    deferredNoOsmSource: deferred.map((d) => ({
      departure: d.departure,
      destination: d.destination,
      course: d.course,
      stopCount: d.stopCount,
      tripsObserved: d.tripsObserved,
      timetableSymbol: d.timetableSymbol,
      contiguousSubsequenceOfRelation: d.contiguousSubsequenceOfRelation,
      contiguousSubsequenceStartIndex: d.contiguousSubsequenceStartIndex,
      notImplementedReason: d.notImplementedReason,
    })),
  }, null, 2), 'utf8');

  // ---- route-pattern-summary.md ----
  const md = [];
  md.push('# 明海・高洲線（系統18 / route-18）運行パターン', '');
  md.push(`確認日: ${CONFIRMED_DATE} ／ 出典: 京成バスナビ個別便通過時刻表 + OpenStreetMap`, '');
  md.push(`凡例ゲートを通過した18系統の運行パターンは **${accepted.length}種**。`);
  md.push(`そのうち **${SYSTEM_ORDER.length}系統** を実装した`
    + '（専用 relation 3本＋検証済み composition の短縮便 2本）。', '');
  md.push('| systemKey | 方向 | 符号 | 起点 → 終点 | 停留所数 | 便数 | 出発のりば | OSM relation / composition |');
  md.push('| --- | --- | --- | --- | ---: | ---: | --- | --- |');
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    const src = s.osmRelationId
      || (s.osmPathComposition
        ? `composed ${s.osmPathComposition.prefixRelation}+${s.osmPathComposition.suffixRelation}`
        : '-');
    md.push(`| \`${k}\` | ${s.directionGroup} | ${s.timetableSymbol} | ${s.departure} → ${s.destination} | ${s.stopCount} | ${s.tripsObserved} | ${s.berth} | ${src} |`);
  }
  md.push('');
  if (deferred.length) {
    md.push('| 未実装（道路ソース無し） | 符号 | 起点 → 終点 | 停留所数 | 便数 |');
    md.push('| --- | --- | --- | ---: | ---: |');
    for (const d of deferred) {
      md.push(`| course \`${d.course}\` | ${d.timetableSymbol} | ${d.departure} → ${d.destination} | ${d.stopCount} | ${d.tripsObserved} |`);
    }
  } else {
    md.push('未実装（deferredNoOsmSource）: **0件** — 新浦安駅発着短縮便は検証済み composition で実装済み。');
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
  md.push('');
  md.push('## 夜間・深夜の短縮便の切り分け（最重要）', '');
  md.push('18系統は日中の通し便（浦安駅入口発着）と、夜間以降の短縮便が**別コース**として掲載される。');
  md.push('短縮便は3種あり、それぞれ扱いが異なる。', '');
  md.push('| # | パターン | コース | 符号 | 便数 | 時間帯 | 道路出典 | 実装 |');
  md.push('| ---: | --- | --- | --- | ---: | --- | --- | --- |');
  {
    const night = systems['18-takasu-kita-shogakko'];
    const nightHours = night.departureTimesObserved;
    md.push(`| 1 | 新浦安駅 → 高洲北小学校（16停留所） | ${night.allCourses.join(' / ')} | ${night.fareVariants.map((v) => v.symbols.join('')).join(' / ')} | ${night.tripsObserved} | ${nightHours[0]}〜${nightHours[nightHours.length - 1]} | 18417590 | **実装** |`);
    const outShort = systems['18-takasu-seaside-from-shinurayasu'];
    const inShort = systems['18-shinurayasu-from-takasu'];
    if (outShort) {
      const h = outShort.departureTimesObserved;
      md.push(`| 2 | 新浦安駅 → 高洲海浜公園（9停留所） | ${outShort.course} | ${outShort.timetableSymbol} | ${outShort.tripsObserved} | ${h[0]}〜${h[h.length - 1]} | composed 18417590+18352908 | **実装** |`);
    }
    if (inShort) {
      const h = inShort.departureTimesObserved;
      md.push(`| 3 | 高洲海浜公園 → 新浦安駅（9停留所） | ${inShort.course} | ${inShort.timetableSymbol} | ${inShort.tripsObserved} | ${h[0]}〜${h[h.length - 1]} | composed 18352907+18352908→X | **実装** |`);
    }
    deferred.forEach((d, i) => {
      const h = d.departureTimesObserved;
      md.push(`| ${i + 2} | ${d.departure} → ${d.destination}（${d.stopCount}停留所） | ${d.course} | ${d.timetableSymbol} | ${d.tripsObserved} | ${h[0]}〜${h[h.length - 1]} | なし | 未実装 |`);
    });
  }
  md.push('');
  md.push('### 1. 高洲北小学校止まり（実装済み・`18-takasu-kita-shogakko`）', '');
  md.push('新浦安駅 のりばE の凡例に、**同一の停留所順に対して2つの符号**が並ぶ。', '');
  for (const v of systems['18-takasu-kita-shogakko'].fareVariants) {
    md.push(`- course \`${v.course}\`／符号 **${v.symbols.join('') || '(無印)'}**`
      + `／${v.isDeepNightDoubleFare ? '**深夜バス（運賃倍額）**' : '通常運賃'}`
      + `／発車時刻 ${v.departureHoursObserved.join(', ')}`);
    for (const l of v.legendLines) md.push(`  - 凡例: ${l}`);
  }
  md.push('');
  md.push('`た` と `★た` は**停留所順・経由地・行先がすべて同一**で、違いは発車時刻と運賃のみ。');
  md.push('したがって2コースを1系統（`18-takasu-kita-shogakko`）に統合し、`allCourses` と `fareVariants` に');
  md.push('両方を記録した。★のみを別systemに分けることはしていない（道路も停留所順も同一のため）。', '');
  md.push('この系統は 潮音の街 から先が通し便と分岐する点が本質で、通し便が向かう 高洲海浜公園 には行かず、');
  md.push('高洲八丁目 → 高洲四丁目 → 高洲三丁目 → 高洲西児童公園 → 順天堂大学入口 → 高洲二丁目 → 東京学館前 →');
  md.push('高洲北小学校 と進む。**独立した OSM relation 18417590 を持つため、通し便のpathからの切り出しではない。**', '');
  md.push('### 2. 新浦安駅 → 高洲海浜公園（実装済み・`18-takasu-seaside-from-shinurayasu`）', '');
  {
    const s = systems['18-takasu-seaside-from-shinurayasu'];
    if (s) {
      md.push(`- course \`${s.course}\`／符号 **${s.timetableSymbol}**／${s.tripsObserved}便／9停留所`);
      md.push(`- のりば **${s.berth}** の凡例: ${s.departureBerthLegend}`);
      md.push('- pathSource: 検証済み composition（18417590 way[0..20] ≡ 18352908 way[26..46]、その後 18352908 の残りで高洲海浜公園へ）');
      md.push('- 出発 platform は 18417590 と 18352908 で同一の node 8415001161（local_ref=E）');
      md.push('- blind mid-station slice ではない（のりばE始発を OSM 上で証明したうえで接合）');
    }
  }
  md.push('');
  md.push('### 3. 高洲海浜公園 → 新浦安駅（実装済み・`18-shinurayasu-from-takasu`）', '');
  {
    const s = systems['18-shinurayasu-from-takasu'];
    if (s) {
      md.push(`- course \`${s.course}\`／符号 **${s.timetableSymbol}**／${s.tripsObserved}便／9停留所`);
      md.push(`- 出発のりば **${s.berth}** の凡例: ${s.departureBerthLegend}`);
      md.push('- pathSource: 18352907 接頭（合流 node 288384935 まで）＋ 18352908 ロータリー way → 降車専用のりばX');
      md.push('- 終点は のりばH ではなく node 8415001163（local_ref=X・降車専用）。通し便の切り詰めではない');
      md.push('- バスナビ所要時間: 入船中央エステート→新浦安駅 は通し4分・短縮6分（形状差の裏付け）');
    }
  }
  md.push('');
  md.push('## 15系統との切り分け（新浦安駅 のりばE 混載）', '');
  md.push('のりばE のコースセルは 15系統と18系統で**完全に同一の文言**を共有する。', '');
  md.push('```');
  md.push(systems['18-takasu-kita-shogakko'].courseText);
  md.push('```');
  md.push('');
  md.push('コース名だけでは系統を判定できず、凡例の符号のみが決定打となる。', '');
  md.push('| 符号 | 系統 | 行先 | 経由 |');
  md.push('| --- | --- | --- | --- |');
  {
    const berthE = (NIGHT.berths || []).find((b) => b.label.includes('のりばE') && b.dayLabel === 'weekday');
    for (const r of (berthE?.legendParsed || [])) {
      md.push(`| ${r.symbolRaw} | ${r.routeNumber}系統 | ${r.description} | — |`);
    }
  }
  md.push('');
  md.push('| | 18系統 | 15系統 |');
  md.push('| --- | --- | --- |');
  md.push('| 路線名 | 明海・高洲線 | 潮音の街線 |');
  md.push('| 新浦安駅 のりば | E（短縮便）／通し便は途中停車 | E |');
  md.push('| 符号 | ゆ / た / ★た / う | 無印 |');
  md.push('| 経由 | 明海大学前・海風の街・夢海の街・高洲橋 | 明海交差点・入船橋・東京学館前・高洲 |');
  md.push('| 固有の停留所 | 明海大学前 / 海風の街 / 夢海の街 / 高洲橋 | 明海交差点 / 入船橋 |');
  md.push('| OSM relation | 18352908 / 18352907 / 18417590 | 18419865 / 18419864 |');
  md.push('');
  md.push('高洲海浜公園 のりば03 でも 15系統（無印）と18系統（う／ゆ）が混載される。こちらも凡例で分離した。', '');
  md.push('## 19系統・10系統との切り分け', '');
  md.push('- **19系統**: 高洲四丁目 は18系統の深夜便と共通だが、19系統は 浦安南高校 / 特別養護老人ホーム を経由する。');
  md.push('  今回ゲートを通過した18系統の便に これらの停留所は1つも現れない。');
  md.push('- **10系統**: みなと南 を経由する。18系統の全パターンに みなと南 は現れない。');
  md.push('- ゲートで除外した便のうち 19系統・10系統に解決したものは無く、除外の実体は 15 / 11 / 3 / 23系統だった。', '');
  md.push('## 往路・復路の関係', '');
  md.push('- `18-takasu-seaside`（浦安駅入口→高洲海浜公園）と `18-urayasu-eki-iriguchi`（高洲海浜公園→浦安駅入口）は');
  md.push('  **停留所名の並びが完全な逆順**（15停留所、経由地の増減なし）。');
  md.push('- ただし **道路は別relation**（18352908 / 18352907）であり、往路pathの反転による復路生成は禁止。');
  md.push('- 中央分離帯のある区間が多く、往復で のりばの座標が道路の反対側になる。停留所座標は各方向の');
  md.push('  relation の platform ノードをそれぞれ採用した。');
  md.push('');
  if (rejectedOtherRoutes.length) {
    md.push('## ゲートで除外した便', '');
    md.push('| 除外 | 便数 | 起点 → 終点 | 出発のりば | 凡例 |');
    md.push('| --- | ---: | --- | --- | --- |');
    for (const r of rejectedOtherRoutes) {
      md.push(`| ${r.verdict} | ${r.tripsObserved} | ${r.stopNames[0]} → ${r.stopNames[r.stopNames.length - 1]} | ${(r.departureBerth || '-').slice(0, 12)} | ${r.departureBerthLegendLine || '-'} |`);
    }
    md.push('');
  }
  md.push('## 注意点', '');
  md.push('- 事業者は東京ベイシティ交通。京成バスナビ（keiseibus-group）に掲載されるが、京成バス本体の系統18ではない。');
  md.push('- `高洲橋` `夢海の街` `海風の街` `明海大学前` は18系統の識別に使える経由地。ただし `海風の街` と');
  md.push('  `明海大学前` は 11系統・3系統・16系統・17系統も通るため、単独では18系統を確定できない。');
  md.push('- `高洲中央公園` `潮音の街` は15系統とも共通。`高洲橋` `夢海の街` の有無が15系統との決定的な差。');
  md.push('- 停留所画像は生成していない（捏造禁止）。バンクは空。');
  md.push('');
  fs.writeFileSync(path.join(OUT, 'route-pattern-summary.md'), md.join('\n'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'system-pattern-summary.md'), md.join('\n'), 'utf8');

  // ---- official-sources.md ----
  const src = [];
  src.push('# route-18 明海・高洲線 一次情報ソース', '');
  src.push(`確認日: ${CONFIRMED_DATE}`, '');
  src.push('## 1. 京成バスナビ（正本）', '');
  src.push('停留所順は **すべて個別便通過時刻表（`/stops?`）から読み取った実データ**であり、推測は一切していない。', '');
  const listedStops = ['新浦安駅', '浦安駅入口', '高洲海浜公園', '高洲北小学校', '潮音の街', '夢海の街', '明海大学前', '高洲橋'];
  for (const n of listedStops) {
    if (busstopIds[n] || BUSSTOP_IDS[n]) {
      src.push(`- ${n} 系統・時刻表一覧: https://transfer-cloud.navitime.biz/keiseibus-group/courses?busstop=${busstopIds[n] || BUSSTOP_IDS[n]}`);
    }
  }
  src.push('');
  src.push('### 2段凡例ゲート', '');
  src.push(GATE.policy, '');
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
    if (s.allCourses.length > 1) {
      src.push('- 運賃・時間帯の別コース:');
      for (const v of s.fareVariants) {
        src.push(`  - \`${v.course}\` 符号 ${v.symbols.join('') || '(無印)'}`
          + `／${v.isDeepNightDoubleFare ? '深夜バス（運賃倍額）' : '通常運賃'}`
          + `／${v.departureHoursObserved.join(', ')}`);
      }
    }
    src.push('');
  }
  src.push('### 凡例ゲートは通過したが未実装のパターン（道路ソース無し）', '');
  if (!deferred.length) {
    src.push('なし。新浦安駅発着の短縮便2本は検証済み composition で実装済み'
      + '（`18-takasu-seaside-from-shinurayasu` / `18-shinurayasu-from-takasu`）。', '');
  }
  for (const d of deferred) {
    src.push(`- **${d.departure} → ${d.destination}**（${d.stopCount}停留所・${d.tripsObserved}便・course \`${d.course}\`・符号 ${d.timetableSymbol}）`);
    src.push(`  - のりば ${d.departureBerth} の凡例: ${d.departureBerthLegend}`);
    src.push(`  - のりば時刻表: ${d.departureBerthTimetableUrl}`);
    src.push(`  - 停留所順: ${d.stopNames.join(' > ')}`);
    src.push(`  - relation ${d.contiguousSubsequenceOfRelation} の第${d.contiguousSubsequenceStartIndex}停留所からの連続部分列と一致`);
    src.push(`  - 未実装の理由: ${d.notImplementedReason}`);
    src.push(`  - サンプル: ${d.sampleUrls[0]}`);
  }
  src.push('');
  src.push('### ゲートで除外した便', '');
  if (rejectedOtherRoutes.length) {
    for (const r of rejectedOtherRoutes) {
      src.push(`- **${r.verdict}** ${r.stopNames[0]} → ${r.stopNames[r.stopNames.length - 1]}（${r.tripsObserved}便・course \`${r.course}\`）`);
      src.push(`  - 出発のりば ${r.departureBerth || '-'} の凡例: ${r.departureBerthLegendLine || '-'}`);
      src.push(`  - 掲載時刻表の凡例: ${r.listingLegendLines.join(' / ') || '(なし)'}`);
      src.push(`  - 他系統固有停留所: ${JSON.stringify(r.siblingExclusiveStopsPresent)}`);
      src.push(`  - サンプル: ${r.sampleUrls[0]}`);
    }
  } else {
    src.push('- なし');
  }
  src.push('');
  src.push('## 2. OpenStreetMap（座標・道路形状のみ）', '');
  src.push('Overpass（overpass.kumi.systems 優先／overpass-api.de・api.openstreetmap.org へフォールバック）で');
  src.push('`ref=18` の bus relation を bbox から**探索して**取得した（ID決め打ちではない）。', '');
  src.push('| relation | name | way members | platform members |');
  src.push('| ---: | --- | ---: | ---: |');
  for (const r of (OSM.relations || [])) {
    src.push(`| ${r.id} | ${r.name} | ${r.wayMemberCount ?? '-'} | ${r.platformMemberCount ?? '-'} |`);
  }
  src.push('');
  src.push(`探索で見つかった \`ref=18\` relation は上記${(OSM.relations || []).length}件のみ。`);
  src.push('さらに 夢海の街 / 高洲橋 の platform を含む relation を名称非依存で総当りしたが（`platformProbe`）、');
  src.push('新たな `ref=18` relation は見つからなかった。', '');
  src.push('| navi パターン | OSM relation |');
  src.push('| --- | --- |');
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    src.push(`| ${s.departure} → ${s.destination}（${s.stopCount}停留所） | ${s.osmRelationId} |`);
  }
  for (const d of deferred) {
    src.push(`| ${d.departure} → ${d.destination}（${d.stopCount}停留所） | **なし（未実装）** |`);
  }
  src.push('');
  src.push('### 分離ガード（兄弟系統の relation）', '');
  src.push('同じ bbox の `ref=15` / `ref=19` / `ref=10` / `ref=25` relation も記録したが、');
  src.push('route-18 の geometry には**一切使用していない**。', '');
  for (const ref of ['15', '19', '10', '25']) {
    const probe = OSM[`refProbe${ref}`] || [];
    src.push(`- ref=${ref}:`);
    for (const p of probe) if (p.id) src.push(`  - ${p.id} ${p.tags?.name || ''}`);
    if (!probe.length) src.push('  - (取得なし)');
  }
  src.push('');
  src.push('## 3. 使用していない情報源', '');
  src.push('- Google Directions / Roads API（道路形状の生成に不使用）');
  src.push('- route-15 の `shione-no-machi-line-*` モジュール、path、停留所配列（流用していない）');
  src.push('- route-1〜17 の path / hash / 停留所（一切変更していない）');
  src.push('- 停留所画像（捏造なし。バンクは空で生成）');
  src.push('');
  fs.writeFileSync(path.join(OUT, 'official-sources.md'), src.join('\n'), 'utf8');

  console.log('accepted', accepted.length, '| implemented', tripSignatures.length, '| deferred', deferred.length, '| rejected', rejected.length);
  for (const k of SYSTEM_ORDER) {
    const s = systems[k];
    console.log(k, '|', s.stopCount, 'stops | rel', s.osmRelationId, '| osmOrderMatch', s.osmPlatformOrderMatchesOfficial, '| exactNames', s.osmPlatformNamesExactMatch, '| courses', s.allCourses.join('/'));
    if (!s.osmPlatformNamesExactMatch) console.log('   NAME DIFF', JSON.stringify(s.osmNameDifferences));
  }
  for (const d of deferred) {
    console.log('DEFERRED', d.course, d.departure, '->', d.destination, '| subsequence of', d.contiguousSubsequenceOfRelation, 'at', d.contiguousSubsequenceStartIndex, '| verified', d.contiguousSubsequenceVerified);
  }
  console.log('wrote official-stop-orders.json / official-trip-signatures.json / system-signatures.json / route-pattern-summary.md / system-pattern-summary.md / official-sources.md');
}

main();
