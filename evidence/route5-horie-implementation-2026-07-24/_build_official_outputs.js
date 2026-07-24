'use strict';
/**
 * Build official-stop-orders.json, official-trip-variants.json,
 * and official-source-summary.md from raw Navi scrapes.
 * Does not invent — only copies transcribed trip stop sequences.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const outboundRaw = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_scrape_raw.json'), 'utf8'));
const inboundRaw = JSON.parse(fs.readFileSync(path.join(OUT, '_navi_inbound_raw.json'), 'utf8'));

const checkedAt = inboundRaw.scrapedAt || outboundRaw.scrapedAt || new Date().toISOString();
const checkedDate = checkedAt.slice(0, 10);

function stopObjs(names, source) {
  return names.map((officialName) => ({
    officialName,
    source,
    checkedDate,
  }));
}

const outShin = outboundRaw.outbound.sampled['5-shinurayasu'];
const outNtt = outboundRaw.outbound.sampled['5-ntt'];
const inUrayasu = inboundRaw.confirmed['5-urayasu'];
const inTokai = inboundRaw.confirmed['5-tokai'];
const inHigashino = inboundRaw.confirmed['5-higashino-chuo'];

const OUT_SRC =
  'Keisei Bus Navi trip stop list (浦安駅入口 course-sequence=0008200228-1 / 0008200229)';
const IN_SRC =
  'Keisei Bus Navi trip stop list (新浦安駅 busstop=00020619 course-sequence=0008200227-1)';

const systems = {
  '5-shinurayasu': {
    title: '新浦安駅行き',
    directionGroup: 'outbound',
    departure: '浦安駅入口',
    destination: '新浦安駅',
    timetableSymbol: '無印',
    berth: 'E',
    naviBusstop: '00020739',
    courseSequence: '0008200228-1',
    course: '0008200228',
    source: OUT_SRC,
    sourceUrl: outShin.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: outShin.stopCount,
    stops: stopObjs(outShin.stopNames, OUT_SRC),
    stopNames: outShin.stopNames,
  },
  '5-ntt': {
    title: 'ＮＴＴ浦安前行き',
    directionGroup: 'outbound',
    departure: '浦安駅入口',
    destination: 'ＮＴＴ浦安前',
    timetableSymbol: 'Ｎ',
    berth: 'E',
    naviBusstop: '00020739',
    courseSequence: '0008200228-1',
    course: '0008200229',
    source: OUT_SRC,
    sourceUrl: outNtt.sampleUrl,
    confirmedDate: checkedDate,
    note: '時刻表セル標記「Ｎ」。通過時刻表の course は 0008200229（新浦安駅行の共有時刻表上）。',
    stopCount: outNtt.stopCount,
    stops: stopObjs(outNtt.stopNames, OUT_SRC),
    stopNames: outNtt.stopNames,
  },
  '5-urayasu': {
    title: '浦安駅入口行き',
    directionGroup: 'inbound',
    departure: '新浦安駅',
    destination: '浦安駅入口',
    timetableSymbol: '無印',
    berth: 'A',
    naviBusstop: '00020619',
    courseSequence: '0008200227-1',
    course: '0008200227',
    source: IN_SRC,
    sourceUrl: inUrayasu.sampleUrl,
    confirmedDate: checkedDate,
    note:
      '復路は往路の単純逆順ではない。終点手前は 堀江一丁目→豊受神社→神明裏→浦安駅入口（往路の 南小入口・堀江三丁目・フラワー通り 経由ではない）。',
    stopCount: inUrayasu.stopCount,
    stops: stopObjs(inUrayasu.stopNames, IN_SRC),
    stopNames: inUrayasu.stopNames,
  },
  '5-tokai': {
    title: '東海大浦安高校前行き',
    directionGroup: 'inbound',
    departure: '新浦安駅',
    destination: '東海大浦安高校前',
    timetableSymbol: 'と',
    berth: 'A',
    naviBusstop: '00020619',
    courseSequence: '0008200227-1',
    course: '0008200230',
    source: IN_SRC,
    sourceUrl: inTokai.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: inTokai.stopCount,
    stops: stopObjs(inTokai.stopNames, IN_SRC),
    stopNames: inTokai.stopNames,
  },
  '5-higashino-chuo': {
    title: '東野中央行き',
    directionGroup: 'inbound',
    departure: '新浦安駅',
    destination: '東野中央',
    timetableSymbol: '中央',
    berth: 'A',
    naviBusstop: '00020619',
    courseSequence: '0008200227-1',
    course: '0008200235',
    source: IN_SRC,
    sourceUrl: inHigashino.sampleUrl,
    confirmedDate: checkedDate,
    stopCount: inHigashino.stopCount,
    stops: stopObjs(inHigashino.stopNames, IN_SRC),
    stopNames: inHigashino.stopNames,
  },
};

const official = {
  checkedAt,
  sourcePriority: [
    '京成バスナビ個別便通過時刻表（/stops?）',
    '京成バスナビ系統・行先凡例',
  ],
  lineName: '堀江線',
  systemNumber: '5',
  systems,
};

fs.writeFileSync(path.join(OUT, 'official-stop-orders.json'), JSON.stringify(official, null, 2));

const variants = {
  checkedAt,
  source: 'https://transfer-cloud.navitime.biz/keiseibus-group',
  outbound: {
    busstop: '00020739',
    busstopName: '浦安駅入口',
    berth: 'E',
    courseSequence: '0008200228-1',
    timetableUrl: outboundRaw.outbound.timetableUrl,
    legend: outboundRaw.outbound.legend,
    samples: {
      '5-shinurayasu': {
        cellText: outShin.cellText,
        sampleUrl: outShin.sampleUrl,
        course: '0008200228',
        stopNames: outShin.stopNames,
        stopCount: outShin.stopCount,
        rawStops: outShin.stops,
      },
      '5-ntt': {
        cellText: outNtt.cellText,
        sampleUrl: outNtt.sampleUrl,
        course: '0008200229',
        stopNames: outNtt.stopNames,
        stopCount: outNtt.stopCount,
        rawStops: outNtt.stops,
      },
    },
  },
  inbound: {
    busstop: '00020619',
    busstopName: '新浦安駅',
    berth: 'A',
    courseSequence: '0008200227-1',
    timetableUrl:
      inboundRaw.terminalsTried['00020619']?.lastTimetable?.url ||
      'https://transfer-cloud.navitime.biz/keiseibus-group/courses/timetables?busstop=00020619&course-sequence=0008200227-1',
    legend: inboundRaw.terminalsTried['00020619']?.lastTimetable?.legend || [],
    samples: {
      '5-urayasu': {
        cellText: inUrayasu.cellText,
        sampleUrl: inUrayasu.sampleUrl,
        course: '0008200227',
        stopNames: inUrayasu.stopNames,
        stopCount: inUrayasu.stopCount,
        rawStops: inUrayasu.stops,
      },
      '5-tokai': {
        cellText: inTokai.cellText,
        sampleUrl: inTokai.sampleUrl,
        course: '0008200230',
        stopNames: inTokai.stopNames,
        stopCount: inTokai.stopCount,
        rawStops: inTokai.stops,
      },
      '5-higashino-chuo': {
        cellText: inHigashino.cellText,
        sampleUrl: inHigashino.sampleUrl,
        course: '0008200235',
        stopNames: inHigashino.stopNames,
        stopCount: inHigashino.stopCount,
        rawStops: inHigashino.stops,
      },
    },
  },
  stopIdMapFromOutboundTrip: inboundRaw.stopIdMap,
};

fs.writeFileSync(path.join(OUT, 'official-trip-variants.json'), JSON.stringify(variants, null, 2));

const md = `# 堀江線（route-5）公式出典サマリ

## 確認日
${checkedDate}

## 正本
京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（\`/stops?\`）

## 運行パターン（5）— いずれも現行運行を確認

| systemKey | 公式行先 | 方向 | 凡例 | 停留所数 | 発→着 | ナビ根拠 |
| --- | --- | --- | --- | ---: | --- | --- |
| 5-shinurayasu | 新浦安駅行き | outbound | 無印 | ${outShin.stopCount} | 浦安駅入口 → 新浦安駅 | 浦安駅入口のりばE・course-sequence=0008200228-1 |
| 5-ntt | ＮＴＴ浦安前行き | outbound | Ｎ | ${outNtt.stopCount} | 浦安駅入口 → ＮＴＴ浦安前 | 同上共有時刻表・course=0008200229 |
| 5-urayasu | 浦安駅入口行き | inbound | 無印 | ${inUrayasu.stopCount} | 新浦安駅 → 浦安駅入口 | 新浦安駅(00020619)のりばA・course-sequence=0008200227-1 |
| 5-tokai | 東海大浦安高校前行き | inbound | と | ${inTokai.stopCount} | 新浦安駅 → 東海大浦安高校前 | 同上・course=0008200230 |
| 5-higashino-chuo | 東野中央行き | inbound | 中央 | ${inHigashino.stopCount} | 新浦安駅 → 東野中央 | 同上・course=0008200235 |

## のりば・凡例（原文）

### 浦安駅入口（outbound・のりば E）
- 無印…【５系統】東海大浦安高校前、東野二丁目経由　新浦安駅行き
- Ｎ…【５系統】東海大浦安高校前、東野二丁目経由　ＮＴＴ浦安前止まり

### 新浦安駅（inbound・のりば A）
- 無印…【５系統】東野二丁目、東海大浦安高校前経由　浦安駅入口行き
- と…【５系統】東海大浦安高校前止まり
- 中央…【５系統】東野中央止まり

## expected との差分・注意
- 想定の5パターンはすべてナビ上で現行確認できた（欠番なし）。
- **往復は同一経路の逆順ではない。** 往路（浦安駅入口発）は フラワー通り・堀江三丁目・南小入口 経由。復路（新浦安駅発）終点手前は **堀江一丁目・豊受神社・神明裏** 経由で浦安駅入口へ入る。
- 表示名はナビ表記をそのまま採用（例: \`ＮＴＴ浦安前\` の全角Ｎ）。
- 新浦安駅の busstop id は \`00020619\`（outbound 通過時刻表の最終停留所リンクから確定）。

## 生データ
- \`_navi_scrape_raw.json\` — 浦安駅入口側スクレイプ
- \`_navi_inbound_raw.json\` — 新浦安駅側スクレイプ
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
