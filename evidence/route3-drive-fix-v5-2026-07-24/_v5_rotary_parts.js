'use strict';
/**
 * Split 新浦安駅 rotary way sequence into:
 * 進入 / 乗り場接続 / ロータリー周回 / 退出 / 本線復帰
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const seq = JSON.parse(fs.readFileSync(path.join(OUT, 'shinurayasu-rotary-way-sequence.json'), 'utf8'));
const ways = seq.orderedWaySequence || [];

function pack(list) {
  if (!list.length) return null;
  return {
    wayIds: list.map((w) => w.wayId),
    start: list[0].startCoord,
    end: list.at(-1).endCoord,
    ways: list.map((w) => ({
      wayId: w.wayId,
      highway: w.tags?.highway || null,
      oneway: w.tags?.oneway || w.oneway || null,
      access: w.tags?.access || null,
      bus: w.tags?.bus || null,
      name: w.tags?.name || null,
      start: w.startCoord,
      end: w.endCoord,
    })),
  };
}

const entry = ways.filter((w) => w.roleHint === 'entry');
const service = ways.filter((w) => w.roleHint === 'service');
const loop = ways.filter((w) => w.roleHint === 'loop_or_bay');
const exit = ways.filter((w) => w.roleHint === 'exit_or_return');

// Heuristic split of loop_or_bay:
 // first bus=yes / access=permit ways until full loop 369356245 = 乗り場接続
 // 369356245 and subsequent loop ways until exit = 周回
const bayConnect = [];
const loopOnly = [];
let seenFullLoop = false;
for (const w of loop) {
  if (w.wayId === 369356245) seenFullLoop = true;
  if (!seenFullLoop) bayConnect.push(w);
  else loopOnly.push(w);
}

// exit_or_return: first tertiary/service exit vs Symbol Road return
const exitOnly = [];
const returnMain = [];
for (const w of exit) {
  const hw = w.tags?.highway;
  if (hw === 'secondary' || (w.tags?.name && String(w.tags.name).includes('シンボル'))) {
    returnMain.push(w);
  } else if (returnMain.length || exitOnly.length > 2) {
    // after first couple exit service ways, secondary = 本線復帰
    if (hw === 'secondary' || hw === 'tertiary' && w.tags?.ref) returnMain.push(w);
    else if (returnMain.length) returnMain.push(w);
    else exitOnly.push(w);
  } else {
    exitOnly.push(w);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  note: 'Roles derived from orderedWaySequence roleHint + way 369356245 as full-loop anchor',
  parts: {
    進入path: pack([...entry, ...service]),
    乗り場接続path: pack(bayConnect),
    ロータリー周回path: pack(loopOnly),
    退出path: pack(exitOnly.length ? exitOnly : exit.slice(0, Math.max(1, exit.length - 1))),
    本線復帰path: pack(returnMain.length ? returnMain : exit.slice(-1)),
  },
  platformDists_m: seq.pathSpan?.platformDists_m || null,
  anyMidpointHitsGrass: seq.anyMidpointHitsGrass ?? null,
};

fs.writeFileSync(path.join(OUT, 'shinurayasu-rotary-parts.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  進入: report.parts.進入path?.wayIds,
  乗り場: report.parts.乗り場接続path?.wayIds,
  周回: report.parts.ロータリー周回path?.wayIds,
  退出: report.parts.退出path?.wayIds,
  本線復帰: report.parts.本線復帰path?.wayIds,
}, null, 2));
