'use strict';
/**
 * Build official-stop-orders.json, official-trip-variants.json,
 * and official-source-summary.md from raw Navi scrapes (系統6 市役所線).
 * Does not invent — only copies transcribed trip stop sequences.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const raw = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));

const checkedAt = raw.scrapedAtChidoriFix || raw.scrapedAt || new Date().toISOString();
const checkedDate = checkedAt.slice(0, 10);

function stopObjs(names, source) {
  return names.map((officialName) => ({
    officialName,
    source,
    checkedDate,
  }));
}

function cleanBerth(b) {
  if (!b) return null;
  return String(b)
    .replace(/\s*地図\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
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
  '6-maihama',
  '6-chidori',
  '6-urayasu-maihama',
  '6-tokai',
  '6-urayasu-chidori',
];
const missing = required.filter((k) => !conf[k] || !(conf[k].stopNames || []).length);
if (missing.length) {
  console.error('MISSING confirmed patterns — refuse to invent:', missing.join(', '));
  process.exit(1);
}

const outMaihama = conf['6-maihama'];
const outChidori = conf['6-chidori'];
const inUrayasuMaihama = conf['6-urayasu-maihama'];
const inTokai = conf['6-tokai'];
const inUrayasuChidori = conf['6-urayasu-chidori'];

const OUT_SRC =
  'Keisei Bus Navi trip stop list (浦安駅入口 course-sequence=0008200238-1)';
const IN_MAIHAMA_SRC =
  'Keisei Bus Navi trip stop list (舞浜駅 busstop=00020617 course-sequence=0008200237-1)';
const IN_CHIDORI_SRC =
  'Keisei Bus Navi trip stop list (千鳥車庫 busstop=00020620 course-sequence=0008200207-1 / course=0008200241 mark 市)';

const berthOut = cleanBerth(outMaihama.berth || raw.outbound?.berth);
const berthMaihama = cleanBerth(inUrayasuMaihama.berth || raw.inboundMaihama?.berth);
const berthChidori = cleanBerth(inUrayasuChidori.berth || raw.inboundChidori?.berth);

const systems = {
  '6-maihama': {
    title: '舞浜駅行き',
    directionGroup: 'outbound',
    departure: '浦安駅入口',
    destination: '舞浜駅',
    timetableSymbol: '無印',
    berth: berthOut,
    naviBusstop: '00020739',
    courseSequence: courseSeqFromUrl(raw.outbound?.timetableUrl) || '0008200238-1',
    course: courseFromUrl(outMaihama.sampleUrl) || '0008200238',
    source: OUT_SRC,
    sourceUrl: outMaihama.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: outMaihama.stopCount,
    stops: stopObjs(outMaihama.stopNames, OUT_SRC),
    stopNames: outMaihama.stopNames,
  },
  '6-chidori': {
    title: '千鳥車庫行き',
    directionGroup: 'outbound',
    departure: '浦安駅入口',
    destination: '千鳥車庫',
    timetableSymbol: 'ち',
    berth: berthOut,
    naviBusstop: '00020739',
    courseSequence: courseSeqFromUrl(raw.outbound?.timetableUrl) || '0008200238-1',
    course: courseFromUrl(outChidori.sampleUrl) || '0008200242',
    source: OUT_SRC,
    sourceUrl: outChidori.sampleUrl,
    confirmedDate: checkedDate,
    note:
      '時刻表セル標記「ち」。凡例原文: ち…【６系統】千鳥車庫行き（千鳥北方面には行きません）。',
    stopCount: outChidori.stopCount,
    stops: stopObjs(outChidori.stopNames, OUT_SRC),
    stopNames: outChidori.stopNames,
  },
  '6-urayasu-maihama': {
    title: '浦安駅入口行き（舞浜駅発）',
    directionGroup: 'inbound',
    departure: '舞浜駅',
    destination: '浦安駅入口',
    timetableSymbol: '無印',
    berth: berthMaihama,
    naviBusstop: '00020617',
    courseSequence: courseSeqFromUrl(raw.inboundMaihama?.timetableUrl) || '0008200237-1',
    course: courseFromUrl(inUrayasuMaihama.sampleUrl) || '0008200237',
    source: IN_MAIHAMA_SRC,
    sourceUrl: inUrayasuMaihama.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: inUrayasuMaihama.stopCount,
    stops: stopObjs(inUrayasuMaihama.stopNames, IN_MAIHAMA_SRC),
    stopNames: inUrayasuMaihama.stopNames,
  },
  '6-tokai': {
    title: '東海大浦安高校前行き',
    directionGroup: 'inbound',
    departure: '舞浜駅',
    destination: '東海大浦安高校前',
    timetableSymbol: 'と',
    berth: berthMaihama,
    naviBusstop: '00020617',
    courseSequence: courseSeqFromUrl(raw.inboundMaihama?.timetableUrl) || '0008200237-1',
    course: courseFromUrl(inTokai.sampleUrl) || '0008200239',
    source: IN_MAIHAMA_SRC,
    sourceUrl: inTokai.sampleUrl,
    confirmedDate: checkedDate,
    note: '時刻表セル標記「と」。終点表示は「東海大浦安高校前」（「東海大浦安高校入口」ではない）。',
    stopCount: inTokai.stopCount,
    stops: stopObjs(inTokai.stopNames, IN_MAIHAMA_SRC),
    stopNames: inTokai.stopNames,
  },
  '6-urayasu-chidori': {
    title: '浦安駅入口行き（千鳥車庫発）',
    directionGroup: 'inbound',
    departure: '千鳥車庫',
    destination: '浦安駅入口',
    timetableSymbol: '市',
    berth: berthChidori,
    naviBusstop: '00020620',
    courseSequence: courseSeqFromUrl(raw.inboundChidori?.timetableUrl) || '0008200207-1',
    course: courseFromUrl(inUrayasuChidori.sampleUrl) || '0008200241',
    source: IN_CHIDORI_SRC,
    sourceUrl: inUrayasuChidori.sampleUrl,
    confirmedDate: checkedDate,
    note:
      '千鳥車庫共有時刻表の標記「市」。凡例は「市役所入口経由」と書くが、通過時刻表の停留所名は「市役所前」。無印は【２系統】新浦安駅北口経由のため混同注意。',
    stopCount: inUrayasuChidori.stopCount,
    stops: stopObjs(inUrayasuChidori.stopNames, IN_CHIDORI_SRC),
    stopNames: inUrayasuChidori.stopNames,
  },
};

const official = {
  checkedAt,
  sourcePriority: [
    '京成バスナビ個別便通過時刻表（/stops?）',
    '京成バスナビ系統・行先凡例',
  ],
  lineName: '市役所線',
  systemNumber: '6',
  systems,
};

fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(official, null, 2));

const variants = {
  checkedAt,
  source: 'https://transfer-cloud.navitime.biz/keiseibus-group',
  outbound: {
    busstop: '00020739',
    busstopName: '浦安駅入口',
    berth: berthOut,
    courseSequence: systems['6-maihama'].courseSequence,
    timetableUrl: raw.outbound?.timetableUrl,
    legend: raw.outbound?.legend || [],
    samples: {
      '6-maihama': {
        cellText: outMaihama.cellText,
        sampleUrl: outMaihama.sampleUrl,
        course: systems['6-maihama'].course,
        stopNames: outMaihama.stopNames,
        stopCount: outMaihama.stopCount,
        rawStops: outMaihama.stops,
        nameChecks: outMaihama.nameChecks,
      },
      '6-chidori': {
        cellText: outChidori.cellText,
        sampleUrl: outChidori.sampleUrl,
        course: systems['6-chidori'].course,
        stopNames: outChidori.stopNames,
        stopCount: outChidori.stopCount,
        rawStops: outChidori.stops,
        nameChecks: outChidori.nameChecks,
      },
    },
  },
  inboundMaihama: {
    busstop: '00020617',
    busstopName: '舞浜駅',
    berth: berthMaihama,
    courseSequence: systems['6-urayasu-maihama'].courseSequence,
    timetableUrl: raw.inboundMaihama?.timetableUrl,
    legend: raw.inboundMaihama?.legend || [],
    samples: {
      '6-urayasu-maihama': {
        cellText: inUrayasuMaihama.cellText,
        sampleUrl: inUrayasuMaihama.sampleUrl,
        course: systems['6-urayasu-maihama'].course,
        stopNames: inUrayasuMaihama.stopNames,
        stopCount: inUrayasuMaihama.stopCount,
        rawStops: inUrayasuMaihama.stops,
        nameChecks: inUrayasuMaihama.nameChecks,
      },
      '6-tokai': {
        cellText: inTokai.cellText,
        sampleUrl: inTokai.sampleUrl,
        course: systems['6-tokai'].course,
        stopNames: inTokai.stopNames,
        stopCount: inTokai.stopCount,
        rawStops: inTokai.stops,
        nameChecks: inTokai.nameChecks,
      },
    },
  },
  inboundChidori: {
    busstop: '00020620',
    busstopName: '千鳥車庫',
    berth: berthChidori,
    courseSequence: systems['6-urayasu-chidori'].courseSequence,
    timetableUrl: raw.inboundChidori?.timetableUrl,
    legend: raw.inboundChidori?.legend || [],
    samples: {
      '6-urayasu-chidori': {
        cellText: inUrayasuChidori.cellText,
        sampleUrl: inUrayasuChidori.sampleUrl,
        course: systems['6-urayasu-chidori'].course,
        stopNames: inUrayasuChidori.stopNames,
        stopCount: inUrayasuChidori.stopCount,
        rawStops: inUrayasuChidori.stops,
        nameChecks: inUrayasuChidori.nameChecks,
      },
    },
  },
  nameDistinctionNotes: raw.nameDistinctionNotes || [],
};

fs.writeFileSync(path.join(OUT, 'official-trip-variants.json'), JSON.stringify(variants, null, 2));

function row(key, title, dir, sym, sample) {
  const n = sample.stopCount;
  const a = sample.stopNames[0];
  const b = sample.stopNames[n - 1];
  return `| ${key} | ${title} | ${dir} | ${sym} | ${n} | ${a} → ${b} |`;
}

const legendOut = (raw.outbound?.legend || []).map((l) => `- ${l}`).join('\n') || '- （取得なし）';
const legendMai = (raw.inboundMaihama?.legend || []).map((l) => `- ${l}`).join('\n') || '- （取得なし）';
const legendChi = (raw.inboundChidori?.legend || []).map((l) => `- ${l}`).join('\n') || '- （取得なし）';

const md = `# 市役所線（route-6）公式出典サマリ

## 確認日
${checkedDate}

## 正本
京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（\`/stops?\`）

## 運行パターン（5）— いずれも現行運行を確認

| systemKey | 公式行先 | 方向 | 凡例 | 停留所数 | 発→着 |
| --- | --- | --- | --- | ---: | --- |
${row('6-maihama', '舞浜駅行き', 'outbound', '無印', outMaihama)}
${row('6-chidori', '千鳥車庫行き', 'outbound', 'ち', outChidori)}
${row('6-urayasu-maihama', '浦安駅入口行き（舞浜駅発）', 'inbound', '無印', inUrayasuMaihama)}
${row('6-tokai', '東海大浦安高校前行き', 'inbound', 'と', inTokai)}
${row('6-urayasu-chidori', '浦安駅入口行き（千鳥車庫発）', 'inbound', '市', inUrayasuChidori)}

## ナビ根拠（のりば・course）

| systemKey | busstop | のりば | course-sequence / course |
| --- | --- | --- | --- |
| 6-maihama / 6-chidori | 浦安駅入口 \`00020739\` | ${berthOut || '—'} | \`${systems['6-maihama'].courseSequence}\` / \`${systems['6-maihama'].course}\`・\`${systems['6-chidori'].course}\` |
| 6-urayasu-maihama / 6-tokai | 舞浜駅 \`00020617\` | ${berthMaihama || '—'} | \`${systems['6-urayasu-maihama'].courseSequence}\` / \`${systems['6-urayasu-maihama'].course}\`・\`${systems['6-tokai'].course}\` |
| 6-urayasu-chidori | 千鳥車庫 \`00020620\` | ${berthChidori || '—'} | \`${systems['6-urayasu-chidori'].courseSequence}\`（共有） / \`${systems['6-urayasu-chidori'].course}\`（市） |

## のりば・凡例（原文）

### 浦安駅入口（outbound）
${legendOut}

### 舞浜駅（inbound）
${legendMai}

### 千鳥車庫（inbound・共有時刻表）
${legendChi}

## 停留所名の区別（重要）

| 項目 | 結果 |
| --- | --- |
| 市役所前 | **全パターンの通過時刻表で \`市役所前\` を確認**（6-tokai は短絡のため非経由） |
| 市役所入口・郵便局前 | **系統6の通過時刻表には出現せず**（12/4系統側の表記） |
| 東海大浦安高校入口 | 往路・復路の経由停留所として出現 |
| 東海大浦安高校前 | 経由＋ \`6-tokai\` の終点。\`入口\` とは別停留所 |
| 千鳥北 | \`6-chidori\` は経由せず。凡例も「千鳥北方面には行きません」 |

### 凡例と通過時刻表の表記差
千鳥車庫時刻表の凡例は「市…【６系統】**市役所入口**経由」と書くが、個別便の通過時刻表停留所名は **\`市役所前\`**。正本は通過時刻表の表示名とする。

## expected との差分・注意
- 想定の5パターンはすべてナビ上で現行確認できた（欠番なし）。
- \`6-chidori\` は標記「ち」。千鳥北方面には行かない（凡例原文どおり）。
- \`6-urayasu-chidori\` は標記「**市**」。同じ千鳥車庫のりばの**無印は【２系統】**（新浦安駅北口経由）なので混同禁止。
- 往路（浦安駅入口発）は 市役所前・東海大浦安高校入口・東海大浦安高校前 経由。\`6-chidori\` は運動公園の次が千鳥車庫（オリエンタルランド本社前・舞浜駅は経由しない）。
- 表示名はナビ表記をそのまま採用。

## 生データ
- \`_navi_scrape_raw.json\` — 浦安駅入口／舞浜駅／千鳥車庫スクレイプ
- \`_navi_chidori_shi_probe.json\` — 千鳥車庫「市」標記の再取得
- \`official-trip-variants.json\` — サンプル便URL・凡例・生停留所
`;

fs.writeFileSync(path.join(OUT, 'official-source-summary.md'), md);

console.log('wrote official-stop-orders.json');
console.log('wrote official-trip-variants.json');
console.log('wrote official-source-summary.md');
for (const [k, v] of Object.entries(systems)) {
  console.log(
    k,
    v.stopCount,
    v.stopNames[0],
    '→',
    v.stopNames[v.stopNames.length - 1],
    `(${v.timetableSymbol})`
  );
}
