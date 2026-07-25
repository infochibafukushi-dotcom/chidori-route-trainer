'use strict';
/**
 * Build official-stop-orders.json, official-trip-variants.json,
 * official-symbols.json, and official-source-summary.md from raw Navi scrapes (系統10 高洲線).
 *
 * IMPORTANT: 時刻表「み」= 10系統みなと南行き。無印 = 19系統高洲海浜公園行き（本実装対象外）。
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const raw = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));

const checkedAt = raw.scrapedAt || new Date().toISOString();
const checkedDate = checkedAt.slice(0, 10);

function stopObjs(names, source) {
  return (names || []).map((officialName) => ({
    officialName,
    source,
    checkedDate,
  }));
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

function courseFromUrl(url) {
  const m = (url || '').match(/[?&]course=(\d+)/);
  return m ? m[1] : null;
}

function courseSeqFromUrl(url) {
  const m = (url || '').match(/course-sequence=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const conf = raw.confirmed || {};
const required = ['10-minato-minami', '10-shinurayasu'];
const missing = required.filter((k) => !conf[k] || !(conf[k].stopNames || []).length);

const outMinato = conf['10-minato-minami'];
const inShin = conf['10-shinurayasu'];

const OUT_SRC =
  'Keisei Bus Navi trip stop list (新浦安駅 busstop=00020619 course-sequence=0008200254-1 / symbol み)';
const IN_SRC =
  'Keisei Bus Navi trip stop list (みなと南 busstop=00020640 course=0008200253 / [10])';

const berthOut = cleanBerth(outMinato?.berth);
const berthIn = cleanBerth(inShin?.berth);

function systemEntry(key, base) {
  if (!conf[key]) return null;
  const v = conf[key];
  return {
    ...base,
    berth: base.berth || cleanBerth(v.berth),
    naviBusstop: v.terminalId || base.naviBusstop,
    course: courseFromUrl(v.sampleUrl) || base.course || null,
    sourceUrl: v.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: v.stopCount,
    stops: stopObjs(v.stopNames, base.source),
    stopNames: v.stopNames,
    nameChecks: v.nameChecks || null,
    cellText: v.cellText || null,
    bodyHasSystem10: v.bodyHasSystem10,
    bodyHasSystem19: v.bodyHasSystem19,
  };
}

const systems = {};
const maybe = [
  [
    '10-minato-minami',
    {
      title: 'みなと南（鉄鋼団地）行き',
      directionGroup: 'outbound',
      departure: '新浦安駅',
      destination: 'みなと南',
      timetableSymbol: 'み',
      berth: berthOut,
      naviBusstop: '00020619',
      courseSequence:
        courseSeqFromUrl(raw.shinurayasuCourses?.route10?.[0]?.absHref)
        || courseSeqFromUrl(outMinato?.timetableUrl)
        || '0008200254-1',
      source: OUT_SRC,
      note:
        '時刻表セル標記「み」。【１０系統】みなと南（鉄鋼団地）行き。無印は【１９系統】高洲海浜公園行きで本実装対象外。',
    },
  ],
  [
    '10-shinurayasu',
    {
      title: '新浦安駅行き',
      directionGroup: 'inbound',
      departure: 'みなと南',
      destination: '新浦安駅',
      timetableSymbol: '無印(10)',
      berth: berthIn,
      naviBusstop: '00020640',
      courseSequence: courseSeqFromUrl(inShin?.timetableUrl) || null,
      source: IN_SRC,
      note:
        'みなと南発・[10]（東京学館前経由）新浦安駅行。OSM platform名「みなと南（鉄鋼団地）」は公式名「みなと南」に正規化。',
    },
  ],
];

for (const [key, base] of maybe) {
  const entry = systemEntry(key, base);
  if (entry) systems[key] = entry;
}

const expectedOutbound = raw.expectedOutbound || [
  '新浦安駅',
  '入船中央エステート',
  '明海交差点',
  '入船橋',
  '高洲北小学校',
  '東京学館前',
  '高洲二丁目',
  '順天堂大学入口',
  '高洲西児童公園',
  '高洲三丁目',
  '高洲四丁目',
  '鉄鋼団地入口',
  'アライプロバンス',
  'みなと第二',
  'みなと南',
];

const actualOut = outMinato?.stopNames || [];
const expectedCheck = {
  expected: expectedOutbound,
  actual: actualOut,
  exactMatch: JSON.stringify(expectedOutbound) === JSON.stringify(actualOut),
  prefixMatch: expectedOutbound.every((n, i) => actualOut[i] === n),
};

const inboundReverseCheck = {
  outbound: actualOut,
  inbound: inShin?.stopNames || [],
  exactReverse:
    actualOut.length > 0
    && JSON.stringify([...actualOut].reverse()) === JSON.stringify(inShin?.stopNames || []),
};

const official = {
  checkedAt,
  sourcePriority: ['京成バスナビ個別便通過時刻表（/stops?）', '京成バスナビ系統・行先凡例'],
  lineName: '高洲線',
  systemNumber: '10',
  missingRequired: missing,
  expectedOutboundCheck: expectedCheck,
  inboundReverseCheck,
  busstopIds: raw.knownIds || {
    shinurayasu: '00020619',
    minatoMinami: '00020640',
  },
  osmNameNormalization: {
    'みなと南（鉄鋼団地）': 'みなと南',
    note: 'OSM platform end name maps to official Navi name みなと南',
  },
  route19Separation: {
    symbol10: 'み',
    symbol19: '無印',
    forbiddenStops: ['高洲海浜公園', '浦安南高校'],
    forbiddenRelations: [18381771, 18381770],
    note: 'F乗り場に10と19が同居。み=10みなと南、無印=19高洲海浜公園。混同禁止。',
  },
  systems,
};

fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(official, null, 2));

function sampleBlock(key) {
  const v = conf[key];
  if (!v) return null;
  return {
    cellText: v.cellText,
    sampleUrl: v.sampleUrl,
    course: courseFromUrl(v.sampleUrl),
    stopNames: v.stopNames,
    stopCount: v.stopCount,
    rawStops: v.stops,
    nameChecks: v.nameChecks,
    bodyHasSystem10: v.bodyHasSystem10,
    bodyHasSystem19: v.bodyHasSystem19,
    lateNight: !!v.lateNight,
  };
}

const variants = {
  checkedAt,
  source: raw.source,
  missingRequired: missing,
  outbound: {
    busstop: '00020619',
    busstopName: '新浦安駅',
    berth: berthOut,
    courseSequence: systems['10-minato-minami']?.courseSequence || '0008200254-1',
    timetableUrl: outMinato?.timetableUrl || raw.outboundWeekdaySamples?.weekday?.timetableUrl,
    legend: raw.outboundWeekdaySamples?.weekday?.legend || outMinato?.legend || [],
    samples: {
      '10-minato-minami': sampleBlock('10-minato-minami'),
    },
  },
  inboundMinato: {
    busstop: '00020640',
    busstopName: 'みなと南',
    berth: berthIn,
    courseSequence: systems['10-shinurayasu']?.courseSequence,
    timetableUrl: inShin?.timetableUrl,
    legend: inShin?.legend || [],
    samples: {
      '10-shinurayasu': sampleBlock('10-shinurayasu'),
    },
  },
  extraPatterns: Object.fromEntries(
    Object.entries(raw.extraPatterns || {}).map(([k, v]) => [
      k,
      {
        cellText: v.cellText,
        sampleUrl: v.sampleUrl,
        stopNames: v.stopNames,
        stopCount: v.stopCount,
        note: 'No independent systemKey — documented only / not confirmed as short-turn',
      },
    ]),
  ),
  rejectedRoute19: {
    note: '無印 = 19系統 高洲海浜公園行き。本実装では取得・混入しない。',
    legendLines: (raw.outboundWeekdaySamples?.weekday?.legend || []).filter((l) =>
      /１９|19|無印|高洲海浜/.test(l),
    ),
  },
};

fs.writeFileSync(path.join(OUT, 'official-trip-variants.json'), JSON.stringify(variants, null, 2));

const symbols = {
  checkedAt,
  lineName: '高洲線',
  systemNumber: '10',
  symbols: {
    み: {
      meaning: '【１０系統】東京学館前・高洲四丁目経由 みなと南（鉄鋼団地）行き',
      systems: ['10-minato-minami'].filter((k) => conf[k]),
      berth: 'F',
    },
    '無印(10)': {
      meaning: 'みなと南発 [10] 新浦安駅行き（復路）。新浦安駅F乗り場の無印とは別物。',
      systems: ['10-shinurayasu'].filter((k) => conf[k]),
      berth: '01',
      note: '復路は系統番号[10]で識別。F乗り場の無印は19系統。',
    },
    無印: {
      meaning: '【１９系統】高洲海浜公園行き — route-10 対象外',
      systems: [],
      forbiddenForRoute10: true,
      note: '新浦安駅F乗り場の無印。高洲海浜公園・浦安南高校方面。絶対に10として扱わない。',
    },
  },
  legends: {
    outboundShinurayasuF: raw.outboundWeekdaySamples?.weekday?.legend || [],
    inboundMinato: inShin?.legend || [],
  },
  separationNote:
    '10「み」vs 19無印: 同一F乗り場に同居。みのみ実装。高洲海浜公園・浦安南高校は含めない。',
};

fs.writeFileSync(path.join(OUT, 'official-symbols.json'), JSON.stringify(symbols, null, 2));

function row(key, title, dir, sym, sample) {
  if (!sample) return `| ${key} | ${title} | ${dir} | ${sym} | — | — |`;
  const n = sample.stopCount;
  const a = sample.stopNames[0];
  const b = sample.stopNames[n - 1];
  return `| ${key} | ${title} | ${dir} | ${sym} | ${n} | ${a} → ${b} |`;
}

const legendOut = (raw.outboundWeekdaySamples?.weekday?.legend || [])
  .map((l) => `- ${l}`)
  .join('\n') || '- （取得なし）';

const md = `# 高洲線（route-10）公式出典サマリ

## 確認日
${checkedDate}

## 正本
京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（\`/stops?\`）

## 10「み」vs 19無印（最重要）

新浦安駅 **F乗り場** の時刻表に 10系統と 19系統が同居します。

| 記号 | 系統 | 行先 | 本実装 |
| --- | ---: | --- | --- |
| **み** | **10** | みなと南（鉄鋼団地） | ✅ 対象 |
| 無印 | 19 | 高洲海浜公園（浦安南高校・特養ホーム経由） | ❌ 対象外 |

- 禁止停留所: 高洲海浜公園 / 浦安南高校
- 禁止 OSM relation: \`18381771\` / \`18381770\`（route-19）
- 使用 OSM: master \`18381758\`, outbound \`18381757\`, inbound \`18381756\`

## 運行パターン — ナビ確認結果

| systemKey | 公式行先 | 方向 | 凡例 | 停留所数 | 発→着 |
| --- | --- | --- | --- | ---: | --- |
${row('10-minato-minami', 'みなと南（鉄鋼団地）行き', 'outbound', 'み', outMinato)}
${row('10-shinurayasu', '新浦安駅行き', 'inbound', '[10]', inShin)}

${missing.length ? `\n**未取得（MISSING）:** ${missing.join(', ')}\n` : ''}

短絡・途中止まりの独立 systemKey はナビで確認できず、**追加していません**。

## ナビ根拠（のりば・course）

| 端点 | busstop | のりば | course / course-sequence |
| --- | --- | --- | --- |
| 新浦安駅 outbound | \`00020619\` | ${berthOut || 'F'} | \`${systems['10-minato-minami']?.course || '0008200254'}\` / \`${systems['10-minato-minami']?.courseSequence || '0008200254-1'}\` |
| みなと南 inbound | \`00020640\` | ${berthIn || '01'} | \`${systems['10-shinurayasu']?.course || '0008200253'}\` |

## のりば・凡例（原文・新浦安駅F）

${legendOut}

## expected 10-minato-minami 検証

想定: ${expectedOutbound.join(' → ')}

- exactMatch: ${expectedCheck.exactMatch}
- prefixMatch: ${expectedCheck.prefixMatch}

## 復路 vs 往路逆順

- exactReverse of outbound: ${inboundReverseCheck.exactReverse}
- （復路はみなと南発の個別便で確定。逆順コピーは正本にしない）

## OSM 名称正規化

- OSM platform: \`みなと南（鉄鋼団地）\` → 公式名 \`みなと南\`

## キャッシュバージョン

- 本実装は **chidori-route-map-v72**（\`?v=72\`）で出荷する。
- v71 はホーム再設計（cac96c9 以降）で既使用のため、route-10 は v72 に繰り上げ。

## 生データ
- \`_navi_scrape_raw.json\`
- \`_navi_inbound_supplement.json\`
- \`official-trip-variants.json\`
- \`official-symbols.json\`
`;

fs.writeFileSync(path.join(OUT, 'official-source-summary.md'), md);

console.log('wrote official-stop-orders.json');
console.log('wrote official-trip-variants.json');
console.log('wrote official-symbols.json');
console.log('wrote official-source-summary.md');
if (missing.length) {
  console.error('MISSING confirmed patterns:', missing.join(', '));
  process.exitCode = 1;
}
for (const [k, v] of Object.entries(systems)) {
  console.log(k, v.stopCount, v.stopNames[0], '→', v.stopNames[v.stopNames.length - 1], `(${v.timetableSymbol})`);
}
console.log('expected exactMatch', expectedCheck.exactMatch);
console.log('inbound exactReverse', inboundReverseCheck.exactReverse);
