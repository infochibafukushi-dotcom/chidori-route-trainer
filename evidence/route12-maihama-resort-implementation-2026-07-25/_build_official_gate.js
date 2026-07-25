'use strict';
/**
 * Build official gate files for route 12 舞浜リゾート線 from _navi_scrape_raw.json.
 * Does NOT invent stop orders. Path implementation must wait for these files.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const rawPath = path.join(OUT, '_navi_scrape_raw.json');
if (!fs.existsSync(rawPath)) {
  console.error('Missing _navi_scrape_raw.json — run _scrape_navi_route12_all.js first');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const checkedAt = raw.scrapedAt || new Date().toISOString();
const checkedDate = checkedAt.slice(0, 10);

const BASE_CANDIDATES = [
  {
    key: '12-maihama-via-resort',
    from: '浦安駅入口',
    to: '舞浜駅',
    title: '舞浜駅行き（TDS・ホテル経由）',
  },
  {
    key: '12-urayasu-via-resort',
    from: '舞浜駅',
    to: '浦安駅入口',
    title: '浦安駅入口行き（ホテル・TDS経由）',
  },
];

const SHORT_TURN_CANDIDATES = [
  { key: '12-tds-maihama', from: '東京ディズニーシー', to: '舞浜駅' },
  { key: '12-tds-urayasu', from: '東京ディズニーシー', to: '浦安駅入口' },
  { key: '12-urayasu-tds', from: '浦安駅入口', to: '東京ディズニーシー' },
  { key: '12-maihama-tds', from: '舞浜駅', to: '東京ディズニーシー' },
  { key: '12-hotel-start', from: 'リゾートホテル', to: null },
  { key: '12-hotel-end', from: null, to: 'リゾートホテル' },
  { key: '12-undokoen-start', from: '運動公園', to: null },
  { key: '12-undokoen-end', from: null, to: '運動公園' },
];

function normalizeStopName(name) {
  return String(name || '')
    .replace(/東京ディズニーシー\s*[\(（]R[\)）]/gi, '東京ディズニーシー（Ｒ）')
    .replace(/東京ディズニーシー\s*[\(（]Ｒ[\)）]/g, '東京ディズニーシー（Ｒ）')
    .replace(/「東京ディズニーシー（Ｒ）」/g, '東京ディズニーシー（Ｒ）')
    .replace(/ベイサイドステーション/g, 'ベイサイド・ステーション')
    .replace(/\s+/g, ' ')
    .trim();
}

function romajiKeyFromName(name) {
  const n = normalizeStopName(name);
  if (/浦安駅入口/.test(n)) return 'urayasu';
  if (/舞浜駅/.test(n)) return 'maihama';
  if (/東京ディズニーシー/.test(n)) return 'tds';
  if (/リゾートホテルエリア・サウス|ヒルトン|グランドニッコー/.test(n)) return 'hotel-south';
  if (/リゾートホテルエリア・ノース|シェラトン|ホテルオークラ/.test(n)) return 'hotel-north';
  if (/リゾートホテル/.test(n)) return 'hotel';
  if (/ベイサイド・ステーション/.test(n)) return 'bayside';
  if (/運動公園/.test(n)) return 'undokoen';
  return 'other';
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

function proposeKey(trip) {
  const from = romajiKeyFromName(trip.stopNames?.[0]);
  const to = romajiKeyFromName(trip.stopNames?.[trip.stopNames.length - 1]);
  if (from === 'urayasu' && to === 'maihama') return '12-maihama-via-resort';
  if (from === 'maihama' && to === 'urayasu') return '12-urayasu-via-resort';
  return `12-${from}-${to}`;
}

function titleFor(fromName, toName) {
  const dep = normalizeStopName(fromName);
  const dest = normalizeStopName(toName);
  if (/浦安駅入口/.test(dep) && /舞浜駅/.test(dest)) {
    return '舞浜駅行き（TDS・ホテル経由）';
  }
  if (/舞浜駅/.test(dep) && /浦安駅入口/.test(dest)) {
    return '浦安駅入口行き（ホテル・TDS経由）';
  }
  return `${dest}行き（${dep}発）`;
}

function isBaseSystem(key) {
  return key === '12-maihama-via-resort' || key === '12-urayasu-via-resort';
}

function isShortTurnEndpoint(name) {
  const n = normalizeStopName(name);
  return (
    /東京ディズニーシー/.test(n) ||
    /リゾートホテル/.test(n) ||
    /ベイサイド・ステーション/.test(n) ||
    /運動公園/.test(n)
  );
}

function matchesShortCand(cand, system) {
  const dep = system.departure || '';
  const dest = system.destination || '';
  if (cand.key === '12-hotel-start') {
    return /リゾートホテル/.test(dep);
  }
  if (cand.key === '12-hotel-end') {
    return /リゾートホテル/.test(dest) && !/舞浜駅|浦安駅入口/.test(dest);
  }
  if (cand.key === '12-undokoen-start') {
    return /運動公園/.test(dep);
  }
  if (cand.key === '12-undokoen-end') {
    return /運動公園/.test(dest) && !/舞浜駅|浦安駅入口/.test(dest);
  }
  const fromOk =
    !cand.from ||
    dep.includes(cand.from.replace(/リゾートホテル/, '')) ||
    (cand.from === 'リゾートホテル' && /リゾートホテル/.test(dep)) ||
    (cand.from === '東京ディズニーシー' && /東京ディズニーシー/.test(dep)) ||
    dep === cand.from;
  const toOk =
    cand.to == null ||
    dest.includes(cand.to.replace(/リゾートホテル/, '')) ||
    (cand.to === 'リゾートホテル' && /リゾートホテル/.test(dest)) ||
    (cand.to === '東京ディズニーシー' && /東京ディズニーシー/.test(dest)) ||
    dest === cand.to;
  if (cand.from && cand.to) {
    const fromMatch =
      (cand.from === '東京ディズニーシー' && /東京ディズニーシー/.test(dep)) ||
      dep === cand.from ||
      (cand.from === 'リゾートホテル' && /リゾートホテル/.test(dep));
    const toMatch =
      (cand.to === '東京ディズニーシー' && /東京ディズニーシー/.test(dest)) ||
      dest === cand.to ||
      (cand.to === 'リゾートホテル' && /リゾートホテル/.test(dest));
    return fromMatch && toMatch;
  }
  return fromOk && toOk;
}

// --- official-all-trips.json ---
const allTrips = (raw.trips || [])
  .filter((t) => t.confirmed12)
  .map((t, idx) => ({
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
    confirmed12: true,
    routeNumber: '12',
    timetableSymbol: t.timetableSymbol || (/ホ/.test(t.cellText || '') ? 'ホ' : null),
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
    tripSignature: t.tripSignature,
    proposedSystemKey: t.proposedSystemKey,
  }));

fs.writeFileSync(
  path.join(OUT, 'official-all-trips.json'),
  JSON.stringify(
    {
      checkedAt,
      source: raw.source,
      knownIds: raw.knownIds,
      tripCount: allTrips.length,
      trips: allTrips,
    },
    null,
    2,
  ),
);

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
      departure: t.stopNames[0],
      destination: t.stopNames[t.stopNames.length - 1],
      departureBusstopId: t.departureBusstopId,
      destinationBusstopId: t.destinationBusstopId,
      berths: [],
      dayLabels: [],
      sampleUrls: [],
      courses: [],
      endpointPair: endpointPairKey(t),
      stopIdSeq: stopIdSeqKey(t),
      proposedSystemKey: proposeKey(t),
    };
  }
  const s = sigMap[sig];
  s.frequency += 1;
  if (t.berth && !s.berths.includes(t.berth)) s.berths.push(t.berth);
  if (t.dayLabel && !s.dayLabels.includes(t.dayLabel)) s.dayLabels.push(t.dayLabel);
  if (s.sampleUrls.length < 8) s.sampleUrls.push(t.sampleUrl);
  if (t.course && !s.courses.includes(t.course)) s.courses.push(t.course);
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

// --- same endpoint different stop orders ---
const byEndpoint = {};
for (const s of signatures) {
  const k = s.endpointPair;
  if (!byEndpoint[k]) byEndpoint[k] = [];
  byEndpoint[k].push(s);
}

const sameEndpointDifferentStopOrders = [];
for (const [pair, list] of Object.entries(byEndpoint)) {
  const uniqSeqs = new Map();
  for (const s of list) {
    const seq = s.stopIdSeq;
    if (!uniqSeqs.has(seq)) uniqSeqs.set(seq, s);
  }
  if (uniqSeqs.size > 1) {
    sameEndpointDifferentStopOrders.push({
      endpointPair: pair,
      departure: list[0].departure,
      destination: list[0].destination,
      variantCount: uniqSeqs.size,
      variants: [...uniqSeqs.values()].map((s) => ({
        tripSignature: s.tripSignature,
        frequency: s.frequency,
        stopNames: s.stopNames,
        stopIds: s.stopIds,
        sampleUrl: s.sampleUrls[0],
        course: s.courses[0] || null,
      })),
    });
  }
}

// --- confirmed systems (prefer highest frequency per key; only confirmed12 trips) ---
const confirmedByKey = new Map();
for (const s of signatures) {
  const key = proposeKey({
    stopNames: s.stopNames,
  });
  const entry = {
    proposedSystemKey: key,
    title: titleFor(s.departure, s.destination),
    departure: s.departure,
    destination: s.destination,
    stopNames: s.stopNames,
    stopIds: s.stopIds,
    idComplete: s.idComplete,
    berth: s.berths[0] || null,
    berths: s.berths,
    course: s.courses[0] || null,
    courses: s.courses,
    sampleUrl: s.sampleUrls[0],
    tripSignature: s.tripSignature,
    stopCount: s.stopNames.length,
    frequency: s.frequency,
    dayLabels: s.dayLabels,
    timetableSymbol: 'ホ',
    routeNumber: '12',
    isBase: isBaseSystem(key),
    isShortTurn:
      !isBaseSystem(key) &&
      (isShortTurnEndpoint(s.departure) || isShortTurnEndpoint(s.destination)),
  };
  const existing = confirmedByKey.get(key);
  if (!existing || entry.frequency > existing.frequency) {
    confirmedByKey.set(key, entry);
  }
}

const confirmedSystems = [...confirmedByKey.values()].sort((a, b) =>
  a.proposedSystemKey.localeCompare(b.proposedSystemKey),
);

// Short turns: only those proven by first/last stop (already in confirmedSystems if found)
const provenShortTurns = confirmedSystems.filter((c) => c.isShortTurn);

const unconfirmedShortTurns = [];
for (const cand of SHORT_TURN_CANDIDATES) {
  const hit = confirmedSystems.find((s) => matchesShortCand(cand, s));
  if (!hit) {
    unconfirmedShortTurns.push({
      candidateKey: cand.key,
      from: cand.from,
      to: cand.to,
      status: 'unconfirmed',
      note: '個別便の始発または終点として公式【１２系統】では未確認（中間停留所表示のみでは採用しない）',
    });
  }
}

// Base candidates missing?
const missingBase = [];
for (const cand of BASE_CANDIDATES) {
  if (!confirmedSystems.some((s) => s.proposedSystemKey === cand.key)) {
    missingBase.push({
      candidateKey: cand.key,
      from: cand.from,
      to: cand.to,
      status: 'missing',
      note: '基本候補だが今回の監査で【１２系統】個別便未確認',
    });
  }
}

const courseIds = [
  ...new Set(
    allTrips
      .map((t) => t.course)
      .filter(Boolean)
      .concat(raw.courseIdsSeen || []),
  ),
];

const tripCountByDayType = {};
for (const t of allTrips) {
  const k = t.dayLabel || 'unknown';
  tripCountByDayType[k] = (tripCountByDayType[k] || 0) + 1;
}

const rejectedRoute4Trips = (raw.rejected?.rejectedRoute4 || []).slice(0, 120);
const rejectedOtherTrips = (raw.rejected?.rejectedOther || []).slice(0, 50);

const candidates = {
  checkedAt,
  candidateCount: confirmedSystems.length + unconfirmedShortTurns.length + missingBase.length,
  confirmedSystems,
  rejectedRoute4Trips,
  rejectedOtherTrips,
  unconfirmedShortTurns,
  missingBaseCandidates: missingBase,
  sameEndpointDifferentStopOrders,
  provenShortTurns,
  courseIds,
  tripCountByDayType,
  knownIds: raw.knownIds,
  stats: {
    tripCount: allTrips.length,
    uniqueSignatures: signatures.length,
    rejectedRoute4Count: (raw.rejected?.rejectedRoute4 || []).length,
    unconfirmedTripCount: (raw.unconfirmedTrips || []).length,
  },
};

fs.writeFileSync(
  path.join(OUT, 'official-system-candidates.json'),
  JSON.stringify(candidates, null, 2),
);

// --- official-stop-orders.json ---
const systems = {};
for (const c of confirmedSystems) {
  systems[c.proposedSystemKey] = {
    title: c.title,
    departure: c.departure,
    destination: c.destination,
    berth: c.berth,
    timetableSymbol: c.timetableSymbol,
    routeNumber: '12',
    course: c.course,
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
      platformId: null,
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
      sourcePriority: [
        '京成バスナビ個別便通過時刻表（/stops?）',
        '京成バスナビ系統・行先凡例（ホ＝１２系統）',
      ],
      lineName: '舞浜リゾート線',
      systemNumber: '12',
      busstopIds: raw.knownIds || {},
      forbiddenRelationsUnlessConfirmed: [9983006, 18323875],
      note:
        '候補21停留所は補助資料。正本は個別便 stopNames。route-4（無印/ランド/ち/TDL）は除外。',
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
      systemNumber: '12',
      legends: [...legends],
      berthsSeen: raw.berthsSeen || [],
      timetableBerthNotes: berthNotes,
      notes: [
        '浦安駅入口 D：ホ＝【１２系統】TDS・リゾートホテル経由 舞浜駅',
        '浦安駅入口 D：無印＝【４系統】舞浜駅 — REJECT',
        '浦安駅入口 D：ランド＝【４系統】TDL — REJECT',
        '浦安駅入口 D：ち＝【４系統】千鳥車庫 — REJECT',
        '舞浜駅 04：復路（ホテル・TDS経由）浦安駅入口',
        'course IDは監査時点の再取得値を正本とする（0008200272 を盲信しない）',
        '個別便ページで 【１２系統】または [12] を確認したものだけ confirmedSystems に入れる',
      ],
    },
    null,
    2,
  ),
);

// --- official-source-summary.md ---
const lines = [];
lines.push('# 舞浜リゾート線（route-12）公式出典サマリ');
lines.push('');
lines.push('## 確認日時');
lines.push(checkedAt);
lines.push('');
lines.push('## 正本');
lines.push(
  '京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（`/stops?`）',
);
lines.push('');
lines.push('## 収集統計');
lines.push(`- 取得便数（confirmed12）: ${allTrips.length}`);
lines.push(`- unique trip signature: ${signatures.length}`);
lines.push(`- confirmedSystems: ${confirmedSystems.length}`);
lines.push(`- provenShortTurns: ${provenShortTurns.length}`);
lines.push(`- unconfirmedShortTurns: ${unconfirmedShortTurns.length}`);
lines.push(`- sameEndpointDifferentStopOrders: ${sameEndpointDifferentStopOrders.length}`);
lines.push(`- rejectedRoute4: ${(raw.rejected?.rejectedRoute4 || []).length}`);
lines.push(`- courseIds: ${courseIds.join(', ') || '(none)'}`);
lines.push(`- tripCountByDayType: ${JSON.stringify(tripCountByDayType)}`);
lines.push('');
lines.push('## busstop ID');
for (const [k, v] of Object.entries(raw.knownIds || {})) {
  lines.push(`- ${k}: \`${v || 'MISSING'}\``);
}
lines.push('');
lines.push('## 確認済み運行パターン（confirmedSystems）');
lines.push('');
lines.push('| systemKey | 始発 | 終点 | 停留所数 | のりば | course |');
lines.push('| --- | --- | --- | ---: | --- | --- |');
for (const c of confirmedSystems) {
  lines.push(
    `| ${c.proposedSystemKey} | ${c.departure} | ${c.destination} | ${c.stopCount} | ${c.berth || ''} | ${c.course || ''} |`,
  );
}
lines.push('');
for (const c of confirmedSystems) {
  lines.push(`### ${c.proposedSystemKey}`);
  lines.push(`- title: ${c.title}`);
  lines.push(`- tripSignature: \`${c.tripSignature}\``);
  lines.push(`- course: \`${c.course || ''}\``);
  lines.push(`- sample: ${c.sampleUrl}`);
  lines.push(`- stopIds: ${(c.stopIds || []).join(' > ')}`);
  lines.push(`- stops (${c.stopCount}): ${c.stopNames.join(' → ')}`);
  lines.push('');
}

lines.push('## 途中始発・途中止まり');
if (!provenShortTurns.length) {
  lines.push('（今回の監査では、始発または終点が TDS／ホテル／運動公園等の【１２系統】便は未検出）');
} else {
  for (const c of provenShortTurns) {
    lines.push(`- ${c.proposedSystemKey}: ${c.stopNames.join(' → ')}`);
  }
}
lines.push('');
lines.push('## 未確認ショートターン候補');
for (const u of unconfirmedShortTurns) {
  lines.push(`- ${u.candidateKey} (${u.from || '?'} → ${u.to || '?'})`);
}
lines.push('');

if (missingBase.length) {
  lines.push('## 欠落した基本候補');
  for (const m of missingBase) {
    lines.push(`- ${m.candidateKey}`);
  }
  lines.push('');
}

lines.push('## 同一始終点・別停留所順');
if (!sameEndpointDifferentStopOrders.length) {
  lines.push('（未検出）');
} else {
  for (const g of sameEndpointDifferentStopOrders) {
    lines.push(`### ${g.departure} → ${g.destination}（${g.variantCount} variants）`);
    for (const v of g.variants) {
      lines.push(`- freq=${v.frequency} course=${v.course || ''}`);
      lines.push(`  - ${v.stopNames.join(' → ')}`);
    }
    lines.push('');
  }
}

lines.push('## 乗り場');
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

lines.push('## 除外した他系統（route-4）');
lines.push('- 無印 / ランド / ち / 【４系統】 / 東京ディズニーランド / 千鳥車庫 → rejectedRoute4Trips');
lines.push('- relation 9983006 / 18323875 は route-12 正本禁止');
lines.push('');
lines.push('## ゲートファイル');
lines.push('- `official-all-trips.json`');
lines.push('- `official-trip-signatures.json`');
lines.push('- `official-system-candidates.json`');
lines.push('- `official-stop-orders.json`');
lines.push('- `official-symbols.json`');
lines.push('- `official-source-summary.md`');
lines.push('- `_navi_scrape_raw.json`');
lines.push('');
lines.push('## ゲート');
lines.push('本ファイル群が揃うまで path 実装を開始しない。');

fs.writeFileSync(path.join(OUT, 'official-source-summary.md'), lines.join('\n'), 'utf8');

console.log('Wrote official gate files');
console.log({
  trips: allTrips.length,
  signatures: signatures.length,
  confirmed: confirmedSystems.map((c) => ({
    key: c.proposedSystemKey,
    stops: c.stopCount,
    course: c.course,
  })),
  provenShortTurns: provenShortTurns.map((c) => c.proposedSystemKey),
  unconfirmedShortTurns: unconfirmedShortTurns.map((u) => u.candidateKey),
  rejectedRoute4: (raw.rejected?.rejectedRoute4 || []).length,
  courseIds,
  sameEndpoint: sameEndpointDifferentStopOrders.length,
});
