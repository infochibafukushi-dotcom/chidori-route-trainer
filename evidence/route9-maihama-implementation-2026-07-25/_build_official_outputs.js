'use strict';
/**
 * Build official-stop-orders.json, official-trip-variants.json,
 * official-symbols.json, and official-source-summary.md from raw Navi scrapes (系統9 舞浜線).
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
const required = [
  '9-maihama',
  '9-rosetown',
  '9-urayasu',
  '9-tokai',
  '9-maihama-tokai',
  '9-urayasu-rosetown',
];
const missing = required.filter((k) => !conf[k] || !(conf[k].stopNames || []).length);

const outMaihama = conf['9-maihama'];
const outRose = conf['9-rosetown'];
const inUrayasu = conf['9-urayasu'];
const inTokai = conf['9-tokai'];
const tokaiToMaihama = conf['9-maihama-tokai'];
const roseToUrayasu = conf['9-urayasu-rosetown'];

const OUT_SRC =
  'Keisei Bus Navi trip stop list (浦安駅入口 course-sequence=0008200244-1)';
const IN_MAIHAMA_SRC =
  'Keisei Bus Navi trip stop list (舞浜駅 busstop=00020617 course-sequence=0008200243-1)';
const TOKAI_SRC = tokaiToMaihama
  ? `Keisei Bus Navi trip stop list (東海大浦安高校入口 busstop=${tokaiToMaihama.terminalId})`
  : 'Keisei Bus Navi trip stop list (東海大浦安高校入口)';
const ROSE_SRC = roseToUrayasu
  ? `Keisei Bus Navi trip stop list (京成ローズタウン busstop=${roseToUrayasu.terminalId})`
  : 'Keisei Bus Navi trip stop list (京成ローズタウン)';

const berthOut = cleanBerth(outMaihama?.berth || raw.outboundSamples?.primary?.berth);
const berthMaihama = cleanBerth(inUrayasu?.berth || raw.inboundMaihamaSamples?.primary?.berth);

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
    nameChecks: v.nameChecks,
  };
}

const systems = {};
const maybe = [
  [
    '9-maihama',
    {
      title: '舞浜駅行き',
      directionGroup: 'outbound',
      departure: '浦安駅入口',
      destination: '舞浜駅',
      timetableSymbol: '無印',
      berth: berthOut,
      naviBusstop: '00020739',
      courseSequence: courseSeqFromUrl(raw.outboundSamples?.primary?.timetableUrl) || '0008200244-1',
      source: OUT_SRC,
    },
  ],
  [
    '9-rosetown',
    {
      title: '京成ローズタウン行き',
      directionGroup: 'outbound',
      departure: '浦安駅入口',
      destination: '京成ローズタウン',
      timetableSymbol: 'ロ',
      berth: berthOut,
      naviBusstop: '00020739',
      courseSequence: courseSeqFromUrl(raw.outboundSamples?.primary?.timetableUrl) || '0008200244-1',
      source: OUT_SRC,
      note: '時刻表セル標記「ロ」。',
    },
  ],
  [
    '9-urayasu',
    {
      title: '浦安駅入口行き（舞浜駅発）',
      directionGroup: 'inbound',
      departure: '舞浜駅',
      destination: '浦安駅入口',
      timetableSymbol: '無印',
      berth: berthMaihama,
      naviBusstop: '00020617',
      courseSequence:
        courseSeqFromUrl(raw.inboundMaihamaSamples?.primary?.timetableUrl) || '0008200243-1',
      source: IN_MAIHAMA_SRC,
    },
  ],
  [
    '9-tokai',
    {
      title: '東海大浦安高校入口行き',
      directionGroup: 'inbound',
      departure: '舞浜駅',
      destination: '東海大浦安高校入口',
      timetableSymbol: 'と',
      berth: berthMaihama,
      naviBusstop: '00020617',
      courseSequence:
        courseSeqFromUrl(raw.inboundMaihamaSamples?.primary?.timetableUrl) || '0008200243-1',
      source: IN_MAIHAMA_SRC,
      note: '時刻表セル標記「と」。終点は「東海大浦安高校入口」（「東海大浦安高校前」ではない）。',
    },
  ],
  [
    '9-maihama-tokai',
    {
      title: '舞浜駅行き（東海大浦安高校入口発）',
      directionGroup: 'inbound',
      departure: '東海大浦安高校入口',
      destination: '舞浜駅',
      timetableSymbol: '無印',
      naviBusstop: raw.knownIds?.tokaiEntrance || null,
      courseSequence: courseSeqFromUrl(raw.tokaiEntranceSamples?.primary?.timetableUrl),
      source: TOKAI_SRC,
    },
  ],
  [
    '9-urayasu-rosetown',
    {
      title: '浦安駅入口行き（京成ローズタウン発）',
      directionGroup: 'inbound',
      departure: '京成ローズタウン',
      destination: '浦安駅入口',
      timetableSymbol: '無印',
      naviBusstop: raw.knownIds?.rosetown || null,
      courseSequence: courseSeqFromUrl(raw.rosetownSamples?.primary?.timetableUrl),
      source: ROSE_SRC,
    },
  ],
];

for (const [key, base] of maybe) {
  const entry = systemEntry(key, base);
  if (entry) systems[key] = entry;
}

const official = {
  checkedAt,
  sourcePriority: ['京成バスナビ個別便通過時刻表（/stops?）', '京成バスナビ系統・行先凡例'],
  lineName: '舞浜線',
  systemNumber: '9',
  missingRequired: missing,
  expectedMaihamaCheck: raw.expectedMaihamaCheck || null,
  busstopIds: raw.knownIds || {},
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
    lateNight: !!v.lateNight,
  };
}

const variants = {
  checkedAt,
  source: raw.source,
  missingRequired: missing,
  outbound: {
    busstop: '00020739',
    busstopName: '浦安駅入口',
    berth: berthOut,
    courseSequence: systems['9-maihama']?.courseSequence || '0008200244-1',
    timetableUrl: raw.outboundSamples?.primary?.timetableUrl,
    legend: raw.outboundSamples?.primary?.legend || [],
    samples: {
      '9-maihama': sampleBlock('9-maihama'),
      '9-rosetown': sampleBlock('9-rosetown'),
    },
    lateNightSamples: {
      '9-rosetown': raw.lateNight?.['9-rosetown']?.sample || null,
    },
  },
  inboundMaihama: {
    busstop: '00020617',
    busstopName: '舞浜駅',
    berth: berthMaihama,
    courseSequence: systems['9-urayasu']?.courseSequence || '0008200243-1',
    timetableUrl: raw.inboundMaihamaSamples?.primary?.timetableUrl,
    legend: raw.inboundMaihamaSamples?.primary?.legend || [],
    samples: {
      '9-urayasu': sampleBlock('9-urayasu'),
      '9-tokai': sampleBlock('9-tokai'),
    },
    lateNightSamples: {
      '9-tokai': raw.lateNight?.['9-tokai']?.sample || null,
    },
  },
  inboundTokaiEntrance: {
    busstop: raw.knownIds?.tokaiEntrance,
    busstopName: '東海大浦安高校入口',
    timetableUrl: raw.tokaiEntranceSamples?.primary?.timetableUrl,
    legend: raw.tokaiEntranceSamples?.primary?.legend || [],
    samples: {
      '9-maihama-tokai': sampleBlock('9-maihama-tokai'),
    },
  },
  inboundRoseTown: {
    busstop: raw.knownIds?.rosetown,
    busstopName: '京成ローズタウン',
    timetableUrl: raw.rosetownSamples?.primary?.timetableUrl,
    legend: raw.rosetownSamples?.primary?.legend || [],
    samples: {
      '9-urayasu-rosetown': sampleBlock('9-urayasu-rosetown'),
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
        note: 'No independent systemKey — documented only',
      },
    ])
  ),
};

fs.writeFileSync(path.join(OUT, 'official-trip-variants.json'), JSON.stringify(variants, null, 2));

const symbols = {
  checkedAt,
  lineName: '舞浜線',
  systemNumber: '9',
  symbols: {
    無印: {
      meaning: '舞浜駅行き / 浦安駅入口行き（方向による）',
      systems: ['9-maihama', '9-urayasu', '9-maihama-tokai', '9-urayasu-rosetown'].filter((k) => conf[k]),
    },
    ロ: {
      meaning: '京成ローズタウン行き',
      systems: ['9-rosetown'].filter((k) => conf[k]),
    },
    と: {
      meaning: '東海大浦安高校入口行き（高校前ではない）',
      systems: ['9-tokai'].filter((k) => conf[k]),
    },
    '★ロ': {
      serviceType: 'late-night',
      sameAs: 'ロ',
      sameSystemKey: '9-rosetown',
      sameStopOrder: raw.lateNight?.['9-rosetown']?.sameStopOrder ?? null,
      present: !!raw.lateNight?.['9-rosetown'],
    },
    '★と': {
      serviceType: 'late-night',
      sameAs: 'と',
      sameSystemKey: '9-tokai',
      sameStopOrder: raw.lateNight?.['9-tokai']?.sameStopOrder ?? null,
      present: !!raw.lateNight?.['9-tokai'],
    },
  },
  legends: {
    outbound: raw.outboundSamples?.primary?.legend || [],
    inboundMaihama: raw.inboundMaihamaSamples?.primary?.legend || [],
    inboundRoseTown: raw.rosetownSamples?.primary?.legend || [],
    inboundTokaiEntrance: raw.tokaiEntranceSamples?.primary?.legend || [],
  },
};

fs.writeFileSync(path.join(OUT, 'official-symbols.json'), JSON.stringify(symbols, null, 2));

function row(key, title, dir, sym, sample) {
  if (!sample) return `| ${key} | ${title} | ${dir} | ${sym} | — | — |`;
  const n = sample.stopCount;
  const a = sample.stopNames[0];
  const b = sample.stopNames[n - 1];
  return `| ${key} | ${title} | ${dir} | ${sym} | ${n} | ${a} → ${b} |`;
}

const legendOut = (raw.outboundSamples?.primary?.legend || []).map((l) => `- ${l}`).join('\n') || '- （取得なし）';
const legendMai = (raw.inboundMaihamaSamples?.primary?.legend || []).map((l) => `- ${l}`).join('\n') || '- （取得なし）';

const extraLines = Object.entries(raw.extraPatterns || {})
  .map(([k, v]) => `- \`${k}\`: ${v.stopNames?.[0]} → ${v.stopNames?.[v.stopNames.length - 1]} (${v.stopCount} stops) — **独立始発便なし/要確認**`)
  .join('\n');

const md = `# 舞浜線（route-9）公式出典サマリ

## 確認日
${checkedDate}

## 正本
京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（\`/stops?\`）

## 運行パターン — ナビ確認結果

| systemKey | 公式行先 | 方向 | 凡例 | 停留所数 | 発→着 |
| --- | --- | --- | --- | ---: | --- |
${row('9-maihama', '舞浜駅行き', 'outbound', '無印', outMaihama)}
${row('9-rosetown', '京成ローズタウン行き', 'outbound', 'ロ', outRose)}
${row('9-urayasu', '浦安駅入口行き（舞浜駅発）', 'inbound', '無印', inUrayasu)}
${row('9-tokai', '東海大浦安高校入口行き', 'inbound', 'と', inTokai)}
${row('9-maihama-tokai', '舞浜駅行き（高校入口発）', 'inbound', '無印', tokaiToMaihama)}
${row('9-urayasu-rosetown', '浦安駅入口行き（ローズタウン発）', 'inbound', '無印', roseToUrayasu)}

${missing.length ? `\n**未取得（MISSING）:** ${missing.join(', ')}\n` : ''}

## 深夜便（別 systemKey にしない）

| 記号 | 対応 | 停留所順同一 |
| --- | --- | --- |
| ★ロ / [深夜] | 9-rosetown | ${raw.lateNight?.['9-rosetown']?.sameStopOrder == null ? '未確認' : raw.lateNight['9-rosetown'].sameStopOrder ? '同一' : '差異あり'} |
| ★と / [深夜] | 9-tokai | ${raw.lateNight?.['9-tokai']?.sameStopOrder == null ? '未確認' : raw.lateNight['9-tokai'].sameStopOrder ? '同一' : '差異あり'} |

## ナビ根拠（のりば・course）

| 端点 | busstop | のりば | course-sequence |
| --- | --- | --- | --- |
| 浦安駅入口 outbound | \`00020739\` | ${berthOut || '—'} | \`${systems['9-maihama']?.courseSequence || '0008200244-1'}\` |
| 舞浜駅 inbound | \`00020617\` | ${berthMaihama || '—'} | \`${systems['9-urayasu']?.courseSequence || '0008200243-1'}\` |
| 京成ローズタウン | \`${raw.knownIds?.rosetown || '—'}\` | — | ${courseSeqFromUrl(raw.rosetownSamples?.primary?.timetableUrl) || '—'} |
| 東海大浦安高校入口 | \`${raw.knownIds?.tokaiEntrance || '—'}\` | — | ${courseSeqFromUrl(raw.tokaiEntranceSamples?.primary?.timetableUrl) || '—'} |

## のりば・凡例（原文）

### 浦安駅入口（outbound）
${legendOut}

### 舞浜駅（inbound）
${legendMai}

## expected 9-maihama 検証

想定: ${(raw.expectedMaihamaStops || []).join(' → ')}

${raw.expectedMaihamaCheck ? `- exactMatch: ${raw.expectedMaihamaCheck.exactMatch}\n- prefixMatch: ${raw.expectedMaihamaCheck.prefixMatch}` : '- 未検証'}

## 追加探索（独立 systemKey なし）

${extraLines || '- 該当なし / 未検出'}

## 生データ
- \`_navi_scrape_raw.json\`
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
