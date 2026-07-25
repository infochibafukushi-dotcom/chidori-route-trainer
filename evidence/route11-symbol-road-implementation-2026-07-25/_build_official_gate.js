'use strict';
/**
 * Build official gate files for route 11 シンボルロード線 from _navi_scrape_raw.json.
 * Does NOT invent stop orders. Path implementation must wait for these files.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const rawPath = path.join(OUT, '_navi_scrape_raw.json');
if (!fs.existsSync(rawPath)) {
  console.error('Missing _navi_scrape_raw.json — run _scrape_navi_route11_all.js first');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const checkedAt = raw.scrapedAt || new Date().toISOString();
const checkedDate = checkedAt.slice(0, 10);

const EXPECTED_CANDIDATES = [
  { key: '11-urayasu-hinode', from: '浦安駅入口', to: '日の出南' },
  { key: '11-urayasu-sogo', from: '浦安駅入口', to: '総合公園' },
  { key: '11-urayasu-baypark', from: '浦安駅入口', to: 'ベイパーク' },
  { key: '11-shinurayasu-hinode', from: '新浦安駅', to: '日の出南' },
  { key: '11-shinurayasu-sogo', from: '新浦安駅', to: '総合公園' },
  { key: '11-shinurayasu-urayasu', from: '新浦安駅', to: '浦安駅入口' },
  { key: '11-hinode-urayasu', from: '日の出南', to: '浦安駅入口' },
  { key: '11-hinode-shinurayasu', from: '日の出南', to: '新浦安駅' },
  { key: '11-sogo-urayasu', from: '総合公園', to: '浦安駅入口' },
  { key: '11-sogo-shinurayasu', from: '総合公園', to: '新浦安駅' },
  { key: '11-baypark-shinurayasu', from: 'ベイパーク', to: '新浦安駅' },
  { key: '11-shinurayasu-nozomi-night', from: '新浦安駅', to: '望海の街', night: true },
  { key: '11-shinurayasu-baypark', from: '新浦安駅', to: 'ベイパーク' },
  { key: '11-baypark-urayasu', from: 'ベイパーク', to: '浦安駅入口' },
  { key: '11-sogo-hinode', from: '総合公園', to: '日の出南' },
  { key: '11-akemi5-start', from: '明海五丁目', to: null },
  { key: '11-nozomi-shinurayasu', from: '望海の街', to: '新浦安駅' },
  { key: '11-symbol-road-pc', from: 'シンボルロード', to: null },
];

function normalizeStopName(name) {
  return String(name || '')
    .replace(/シンボルロードパークシティ/g, 'シンボルロード・パークシティ')
    .replace(/\s+/g, ' ')
    .trim();
}

function romajiKeyFromName(name) {
  const n = normalizeStopName(name);
  if (/浦安駅入口/.test(n)) return 'urayasu';
  if (/新浦安駅/.test(n)) return 'shinurayasu';
  if (/日の出南/.test(n)) return 'hinode';
  if (/総合公園/.test(n)) return 'sogo';
  if (/ベイパーク/.test(n)) return 'baypark';
  if (/望海の街/.test(n)) return 'nozomi';
  if (/明海五丁目/.test(n)) return 'akemi5';
  if (/日の出公民館/.test(n)) return 'hinode-kominkan';
  if (/シンボルロード/.test(n)) return 'symbol-road-pc';
  return 'other';
}

function detectViaKey(stopNames) {
  const names = (stopNames || []).map(normalizeStopName);
  const hasKominkan = names.some((n) => /日の出公民館/.test(n));
  const hasAkemi5 = names.some((n) => /明海五丁目/.test(n));
  if (hasKominkan && hasAkemi5) return 'hinode-kominkan+akemi5';
  if (hasKominkan) return 'hinode-kominkan';
  if (hasAkemi5) return 'akemi5';
  return null;
}

function endpointPairKey(trip) {
  const a = romajiKeyFromName(trip.stopNames?.[0]);
  const b = romajiKeyFromName(trip.stopNames?.[trip.stopNames.length - 1]);
  return `${a}>${b}`;
}

function stopIdSeqKey(trip) {
  if (trip.idComplete && trip.stopIds?.every(Boolean)) return trip.stopIds.join('>');
  return (trip.stopNames || []).map(normalizeStopName).join('>');
}

function cleanBerth(b) {
  if (!b) return null;
  return (
    String(b)
      .replace(/\s*地図\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim() || null
  );
}

function titleFor(fromName, toName, night, viaKey) {
  const dest = normalizeStopName(toName);
  const dep = normalizeStopName(fromName);
  let t = `${dest}行き（${dep}発）`;
  if (night) t = `${dest}行き［深夜］（${dep}発）`;
  if (viaKey === 'hinode-kominkan') t += '・日の出公民館経由';
  if (viaKey === 'akemi5') t += '・明海五丁目経由';
  if (viaKey === 'hinode-kominkan+akemi5') t += '・日の出公民館・明海五丁目経由';
  return t;
}

function proposeKey(trip, viaNeeded) {
  const from = romajiKeyFromName(trip.stopNames?.[0]);
  const to = romajiKeyFromName(trip.stopNames?.[trip.stopNames.length - 1]);
  const via = viaNeeded ? detectViaKey(trip.stopNames) : null;
  if (trip.night) return `11-${from}-${to}-night`;
  if (via) return `11-${from}-${to}-via-${via}`;
  return `11-${from}-${to}`;
}

// --- official-all-trips.json ---
const allTrips = (raw.trips || []).map((t, idx) => ({
  index: idx,
  sampleUrl: t.sampleUrl,
  dayLabel: t.dayLabel,
  dayIso: t.dayIso,
  terminal: t.terminal,
  terminalId: t.terminalId,
  berth: cleanBerth(t.berth),
  cellText: t.cellText,
  courseText: t.courseText,
  legend: t.legend,
  heading: t.heading,
  systemNumberHint: t.systemNumberHint,
  confirmed11: t.confirmed11,
  night: !!t.night,
  departureBusstopId: t.departureBusstopId,
  destinationBusstopId: t.destinationBusstopId,
  course: t.course,
  courseSequence: t.courseSequence,
  stopNames: (t.stopNames || []).map(normalizeStopName),
  stopCount: t.stopCount,
  stops: t.stops,
  stopIds: t.stopIds,
  platformIds: t.platformIds,
  idComplete: !!t.idComplete,
  viaKey: detectViaKey(t.stopNames),
  tripSignature: t.tripSignature,
  proposedSystemKey: t.proposedSystemKey,
}));

fs.writeFileSync(path.join(OUT, 'official-all-trips.json'), JSON.stringify({
  checkedAt,
  source: raw.source,
  knownIds: raw.knownIds,
  tripCount: allTrips.length,
  trips: allTrips,
}, null, 2));

// --- official-trip-signatures.json ---
const sigMap = {};
for (const t of allTrips) {
  const sig = t.tripSignature;
  if (!sigMap[sig]) {
    sigMap[sig] = {
      tripSignature: sig,
      frequency: 0,
      stopNames: t.stopNames,
      stopIds: t.stopIds,
      idComplete: t.idComplete,
      night: t.night,
      viaKey: t.viaKey,
      departure: t.stopNames[0],
      destination: t.stopNames[t.stopNames.length - 1],
      departureBusstopId: t.departureBusstopId,
      destinationBusstopId: t.destinationBusstopId,
      berths: [],
      dayLabels: [],
      sampleUrls: [],
      endpointPair: endpointPairKey(t),
      stopIdSeq: stopIdSeqKey(t),
    };
  }
  const s = sigMap[sig];
  s.frequency += 1;
  if (t.berth && !s.berths.includes(t.berth)) s.berths.push(t.berth);
  if (t.dayLabel && !s.dayLabels.includes(t.dayLabel)) s.dayLabels.push(t.dayLabel);
  if (s.sampleUrls.length < 8) s.sampleUrls.push(t.sampleUrl);
}

const signatures = Object.values(sigMap).sort((a, b) => b.frequency - a.frequency);
fs.writeFileSync(
  path.join(OUT, 'official-trip-signatures.json'),
  JSON.stringify(
    {
      checkedAt,
      uniqueSignatureCount: signatures.length,
      signatures,
    },
    null,
    2,
  ),
);

// --- Group by endpoint pair → detect same-endpoint different routes ---
const byEndpoint = {};
for (const s of signatures) {
  const k = s.endpointPair;
  if (!byEndpoint[k]) byEndpoint[k] = [];
  byEndpoint[k].push(s);
}

const sameEndpointDifferentRoute = [];
const viaNeededPairs = new Set();
for (const [pair, list] of Object.entries(byEndpoint)) {
  const uniqSeqs = new Map();
  for (const s of list) {
    const seq = s.stopIdSeq;
    if (!uniqSeqs.has(seq)) uniqSeqs.set(seq, s);
  }
  if (uniqSeqs.size > 1) {
    viaNeededPairs.add(pair);
    sameEndpointDifferentRoute.push({
      endpointPair: pair,
      departure: list[0].departure,
      destination: list[0].destination,
      variantCount: uniqSeqs.size,
      variants: [...uniqSeqs.values()].map((s) => ({
        tripSignature: s.tripSignature,
        frequency: s.frequency,
        stopNames: s.stopNames,
        stopIds: s.stopIds,
        viaKey: s.viaKey,
        night: s.night,
        sampleUrl: s.sampleUrls[0],
      })),
    });
  }
}

// Confirm systems: prefer confirmed11 trips; require stopCount>=2
const confirmedByKey = new Map();
for (const s of signatures) {
  const pair = s.endpointPair;
  const needVia = viaNeededPairs.has(pair);
  // Build a representative trip-like object
  const tripLike = {
    stopNames: s.stopNames,
    night: s.night,
    idComplete: s.idComplete,
    stopIds: s.stopIds,
  };
  let key = proposeKey(tripLike, needVia);
  // Collapse via suffix when only one variant and via not needed
  if (!needVia && /-via-/.test(key) && !s.night) {
    key = key.replace(/-via-.+$/, '');
  }
  // Night nozomi special naming
  if (s.night && /望海の街/.test(s.destination) && /新浦安駅/.test(s.departure)) {
    key = '11-shinurayasu-nozomi-night';
  }

  const existing = confirmedByKey.get(key);
  const entry = {
    proposedSystemKey: key,
    title: titleFor(s.departure, s.destination, s.night, needVia ? s.viaKey : null),
    departure: s.departure,
    destination: s.destination,
    viaKey: needVia ? s.viaKey : s.viaKey || null,
    stopNames: s.stopNames,
    stopIds: s.stopIds,
    idComplete: s.idComplete,
    berth: s.berths[0] || null,
    berths: s.berths,
    night: s.night,
    sampleUrl: s.sampleUrls[0],
    tripSignature: s.tripSignature,
    stopCount: s.stopNames.length,
    frequency: s.frequency,
    dayLabels: s.dayLabels,
  };
  if (!existing || entry.frequency > existing.frequency) {
    confirmedByKey.set(key, entry);
  }
}

const confirmedSystems = [...confirmedByKey.values()].sort((a, b) =>
  a.proposedSystemKey.localeCompare(b.proposedSystemKey),
);

const lateNightSystems = confirmedSystems.filter((c) => c.night);

// Unconfirmed expected candidates
function matchesCandidate(cand, system) {
  if (cand.night && !system.night) return false;
  if (!cand.night && system.night && /nozomi/.test(cand.key)) return false;
  const fromOk =
    !cand.from ||
    system.departure === cand.from ||
    (cand.from === 'シンボルロード' && /シンボルロード/.test(system.departure));
  const toOk =
    cand.to == null ||
    system.destination === cand.to ||
    (cand.key === '11-akemi5-start' && /明海五丁目/.test(system.departure)) ||
    (cand.key === '11-symbol-road-pc' && /シンボルロード/.test(system.departure + system.destination));
  if (cand.key === '11-akemi5-start') return /明海五丁目/.test(system.departure);
  if (cand.key === '11-symbol-road-pc') {
    return /シンボルロード/.test(system.departure) || /シンボルロード/.test(system.destination);
  }
  if (cand.key === '11-shinurayasu-nozomi-night') {
    return system.night && /新浦安駅/.test(system.departure) && /望海の街/.test(system.destination);
  }
  return fromOk && toOk;
}

const unconfirmedCandidates = [];
for (const cand of EXPECTED_CANDIDATES) {
  const hit = confirmedSystems.find((s) => matchesCandidate(cand, s));
  if (!hit) {
    unconfirmedCandidates.push({
      candidateKey: cand.key,
      from: cand.from,
      to: cand.to,
      night: !!cand.night,
      status: 'unconfirmed',
      note: '公式個別便で系統11として確認できず',
    });
  }
}

const candidates = {
  candidateCount: confirmedSystems.length + unconfirmedCandidates.length,
  confirmedSystems,
  sameEndpointDifferentRoute,
  unconfirmedCandidates,
  lateNightSystems,
  rejectedRoute3Trips: (raw.rejected?.rejectedRoute3 || []).slice(0, 50),
  rejectedRoute18Trips: (raw.rejected?.rejectedRoute18 || []).slice(0, 50),
  rejectedRoute25Trips: (raw.rejected?.rejectedRoute25 || []).slice(0, 50),
  rejectedOtherTrips: (raw.rejected?.rejectedOther || []).slice(0, 50),
  knownIds: raw.knownIds,
  stats: raw.stats,
};

fs.writeFileSync(path.join(OUT, 'official-system-candidates.json'), JSON.stringify(candidates, null, 2));

// --- official-stop-orders.json ---
const systems = {};
for (const c of confirmedSystems) {
  systems[c.proposedSystemKey] = {
    title: c.title,
    departure: c.departure,
    destination: c.destination,
    viaKey: c.viaKey,
    berth: c.berth,
    night: c.night,
    naviBusstop: c.stopIds?.[0] || null,
    sourceUrl: c.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: c.stopCount,
    tripSignature: c.tripSignature,
    idComplete: c.idComplete,
    stopNames: c.stopNames,
    stopIds: c.stopIds,
    stops: c.stopNames.map((officialName, i) => ({
      officialName,
      busstopId: c.stopIds?.[i] || null,
      source: 'Keisei Bus Navi trip stop list (/stops?)',
      checkedDate,
    })),
  };
}

fs.writeFileSync(
  path.join(OUT, 'official-stop-orders.json'),
  JSON.stringify(
    {
      checkedAt,
      sourcePriority: ['京成バスナビ個別便通過時刻表（/stops?）', '京成バスナビ系統・行先凡例'],
      lineName: 'シンボルロード線',
      systemNumber: '11',
      busstopIds: raw.knownIds || {},
      forbiddenRelationUnlessConfirmed: 18419852,
      systems,
    },
    null,
    2,
  ),
);

// --- official-symbols.json ---
const legends = new Set();
const berthNotes = [];
for (const tt of raw.timetables || []) {
  for (const L of tt.legend || []) legends.add(L);
  if (tt.berth || tt.terminal) {
    berthNotes.push({
      terminal: tt.terminal,
      terminalId: tt.terminalId,
      berth: cleanBerth(tt.berth),
      dayLabel: tt.dayLabel,
      courseText: (tt.courseText || '').slice(0, 200),
      legend: tt.legend || [],
    });
  }
}

fs.writeFileSync(
  path.join(OUT, 'official-symbols.json'),
  JSON.stringify(
    {
      checkedAt,
      systemNumber: '11',
      legends: [...legends],
      berthsSeen: raw.berthsSeen || [],
      timetableBerthNotes: berthNotes,
      notes: [
        '新浦安駅 D：総合公園・日の出南方面（要ナビ確認）',
        '新浦安駅 H：消防本部前経由 浦安駅入口方面（要ナビ確認）',
        '浦安駅入口 B：新浦安駅・ベイパーク経由（要ナビ確認）',
        'ベイパーク 01/02・総合公園 02/04・日の出南 01 はナビ乗り場表記を正本とする',
        '系統3・18・25・10・19との同居時刻表では [11] / 【11系統】のみ採用',
      ],
    },
    null,
    2,
  ),
);

// --- official-source-summary.md ---
const lines = [];
lines.push('# シンボルロード線（route-11）公式出典サマリ');
lines.push('');
lines.push(`## 確認日時`);
lines.push(checkedAt);
lines.push('');
lines.push('## 正本');
lines.push('京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（`/stops?`）');
lines.push('');
lines.push('## 収集統計');
lines.push(`- 取得便数: ${allTrips.length}`);
lines.push(`- unique trip signature: ${signatures.length}`);
lines.push(`- confirmedSystems: ${confirmedSystems.length}`);
lines.push(`- sameEndpointDifferentRoute groups: ${sameEndpointDifferentRoute.length}`);
lines.push(`- lateNightSystems: ${lateNightSystems.length}`);
lines.push(`- unconfirmedCandidates: ${unconfirmedCandidates.length}`);
lines.push(`- rejected route3/18/25: ${candidates.rejectedRoute3Trips.length} / ${candidates.rejectedRoute18Trips.length} / ${candidates.rejectedRoute25Trips.length}`);
lines.push('');
lines.push('## busstop ID');
for (const [k, v] of Object.entries(raw.knownIds || {})) {
  lines.push(`- ${k}: \`${v || 'MISSING'}\``);
}
lines.push('');
lines.push('## 確認済み運行パターン（confirmedSystems）');
lines.push('');
lines.push('| systemKey | 始発 | 終点 | via | 深夜 | 停留所数 | のりば |');
lines.push('| --- | --- | --- | --- | --- | ---: | --- |');
for (const c of confirmedSystems) {
  lines.push(
    `| ${c.proposedSystemKey} | ${c.departure} | ${c.destination} | ${c.viaKey || ''} | ${c.night ? 'Y' : ''} | ${c.stopCount} | ${c.berth || ''} |`,
  );
}
lines.push('');
for (const c of confirmedSystems) {
  lines.push(`### ${c.proposedSystemKey}`);
  lines.push(`- title: ${c.title}`);
  lines.push(`- tripSignature: \`${c.tripSignature}\``);
  lines.push(`- sample: ${c.sampleUrl}`);
  lines.push(`- stops (${c.stopCount}): ${c.stopNames.join(' → ')}`);
  lines.push('');
}

lines.push('## 同一始終点・別経路');
if (!sameEndpointDifferentRoute.length) {
  lines.push('（今回のサンプルでは同一始終点で異なる停留所ID列は未検出）');
} else {
  for (const g of sameEndpointDifferentRoute) {
    lines.push(`### ${g.departure} → ${g.destination}（${g.variantCount} variants）`);
    for (const v of g.variants) {
      lines.push(`- via=${v.viaKey || '—'} night=${!!v.night} freq=${v.frequency}`);
      lines.push(`  - ${v.stopNames.join(' → ')}`);
    }
    lines.push('');
  }
}

lines.push('## 深夜便');
if (!lateNightSystems.length) {
  lines.push('（深夜区分の系統11便は未確認）');
} else {
  for (const c of lateNightSystems) {
    lines.push(`- ${c.proposedSystemKey}: ${c.stopNames.join(' → ')}`);
  }
}
lines.push('');

lines.push('## 未確認候補');
for (const u of unconfirmedCandidates) {
  lines.push(`- ${u.candidateKey} (${u.from || '?'} → ${u.to || '?'})`);
}
lines.push('');

lines.push('## 乗り場（ナビ course list）');
const berthByTerm = {};
for (const b of raw.berthsSeen || []) {
  const k = b.terminal;
  if (!berthByTerm[k]) berthByTerm[k] = new Set();
  berthByTerm[k].add(cleanBerth(b.berth));
}
for (const [term, set] of Object.entries(berthByTerm)) {
  lines.push(`- ${term}: ${[...set].filter(Boolean).join(', ')}`);
}
lines.push('');

lines.push('## 凡例（抜粋）');
[...legends].slice(0, 40).forEach((L) => lines.push(`- ${L}`));
lines.push('');

lines.push('## 除外した他系統');
lines.push('- 系統3・18・25（および10/19等）の便は rejected* に分類');
lines.push('- 高洲海浜公園終点は系統11非対象（relation 18419852 使用禁止）');
lines.push('');
lines.push('## 生データ');
lines.push('- `_navi_scrape_raw.json`');
lines.push('- `official-all-trips.json`');
lines.push('- `official-trip-signatures.json`');
lines.push('- `official-system-candidates.json`');
lines.push('');
lines.push('## ゲート');
lines.push('本ファイル群が揃うまで path 実装を開始しない。');

fs.writeFileSync(path.join(OUT, 'official-source-summary.md'), lines.join('\n'), 'utf8');

console.log('Wrote official gate files');
console.log({
  trips: allTrips.length,
  signatures: signatures.length,
  confirmed: confirmedSystems.map((c) => c.proposedSystemKey),
  sameEndpoint: sameEndpointDifferentRoute.length,
  lateNight: lateNightSystems.map((c) => c.proposedSystemKey),
  unconfirmed: unconfirmedCandidates.map((u) => u.candidateKey),
});
