'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const auditedAt = new Date().toISOString();
const auditedDate = auditedAt.slice(0, 10);

const REMOVE = new Set([
  '11-shinurayasu-symbol-road-pc',
  '11-shinurayasu-symbol-road-pc-night',
  '11-urayasu-akemi5',
  '11-urayasu-sogo-via-akemi5',
]);

const audit = JSON.parse(fs.readFileSync(path.join(dir, '_audit_trip_samples.json'), 'utf8'));
for (const r of audit.results) {
  if (r.systemKey === '11-baypark-shinurayasu' && r.ok === true) {
    r.ok = false;
    r.notes =
      'NOT ADD as distinct system: 【11系統】 yes but fullFirst=総合公園 — mid-board of 11-sogo-shinurayasu, not baypark terminus start';
    r.verdict = 'NOT_ADD_MIDBOARD';
  }
}
fs.writeFileSync(path.join(dir, '_audit_trip_samples.json'), JSON.stringify(audit, null, 2), 'utf8');

const preferredSogo = audit.results.find((r) => r.systemKey === '11-sogo-urayasu' && r.preferredSample);

const cand = JSON.parse(fs.readFileSync(path.join(dir, 'official-system-candidates.json'), 'utf8'));
const removedTrips = [];

cand.confirmedSystems = cand.confirmedSystems.filter((c) => {
  if (REMOVE.has(c.proposedSystemKey)) {
    removedTrips.push({
      proposedSystemKey: c.proposedSystemKey,
      sampleUrl: c.sampleUrl,
      stopNames: c.stopNames,
      reason: 'audit-reopen: trip page 【3系統】 (or route3 pattern), not 11',
      auditedAt,
    });
    return false;
  }
  return true;
});

const sogo = cand.confirmedSystems.find((c) => c.proposedSystemKey === '11-sogo-urayasu');
if (sogo && preferredSogo) {
  sogo.sampleUrl = preferredSogo.sampleUrl;
  sogo.stopNames = preferredSogo.actualStopNames;
  sogo.stopCount = preferredSogo.actualStopNames.length;
  sogo.idComplete = true;
  sogo.stopIds = [
    '00020745',
    '00020681',
    '00020735',
    '00020736',
    '00020856',
    '00020652',
    '00020848',
    '00020713',
    '00020663',
    '00020619',
    '00020670',
    '00020845',
    '00020877',
    '00020666',
    '00020623',
    '00020739',
  ];
  sogo.berth = '01';
  sogo.berths = ['01'];
  sogo.tripSignature =
    '11|00020745-1|00020739|' +
    sogo.stopIds.join('>') +
    '|' +
    '>'.repeat(sogo.stopIds.length - 1) +
    '|regular';
  sogo.auditNote = 'sample upgraded to 総合公園 departure; confirmed 【11系統】 ' + auditedDate;
}

cand.sameEndpointDifferentRoute = (cand.sameEndpointDifferentRoute || [])
  .map((g) => {
    g.variants = (g.variants || []).filter((v) => v.viaKey !== 'akemi5');
    g.variantCount = g.variants.length;
    return g;
  })
  .filter((g) => g.variantCount > 1);

cand.lateNightSystems = (cand.lateNightSystems || []).filter((c) => !REMOVE.has(c.proposedSystemKey));
cand.rejectedRoute3 = [...(cand.rejectedRoute3 || []), ...removedTrips];

cand.unconfirmedCandidates = (cand.unconfirmedCandidates || []).map((u) => {
  if (u.candidateKey === '11-shinurayasu-urayasu') {
    return {
      ...u,
      status: 'unconfirmed',
      note: '監査再オープン: H/[11]時刻表上で新浦安駅始発→浦安駅入口の【11系統】便は未確認（多くは総合公園始発の通過）',
    };
  }
  if (u.candidateKey === '11-baypark-shinurayasu') {
    return {
      ...u,
      status: 'unconfirmed',
      note: '監査再オープン: ベイパーク発として独立始発の【11系統】は未確認。観測は総合公園発11の中間乗車（=11-sogo-shinurayasuの部分）',
    };
  }
  if (u.candidateKey === '11-shinurayasu-nozomi-night') {
    return {
      ...u,
      status: 'rejected-route3',
      note: '監査再オープン: ★シ/シ深夜は【3系統】シンボルロード・パークシティ行き（望海経由）。11の望海止まりではない',
    };
  }
  return u;
});

cand.candidateCount = cand.confirmedSystems.length;
cand.stats = {
  ...(cand.stats || {}),
  auditAt: auditedAt,
  confirmedAfterAudit: cand.confirmedSystems.length,
  removedFalsePositives: [...REMOVE],
  addedSystems: [],
};
cand.audit = {
  auditedAt,
  remove: [...REMOVE],
  keepSuspicious: ['11-sogo-urayasu'],
  add: [],
  evidenceFile: '_audit_trip_samples.json',
};

fs.writeFileSync(path.join(dir, 'official-system-candidates.json'), JSON.stringify(cand, null, 2), 'utf8');

const orders = JSON.parse(fs.readFileSync(path.join(dir, 'official-stop-orders.json'), 'utf8'));
orders.checkedAt = auditedAt;
for (const k of REMOVE) delete orders.systems[k];
if (sogo && orders.systems['11-sogo-urayasu']) {
  const o = orders.systems['11-sogo-urayasu'];
  o.sourceUrl = sogo.sampleUrl;
  o.stopNames = sogo.stopNames;
  o.stopIds = sogo.stopIds;
  o.stopCount = sogo.stopCount;
  o.idComplete = true;
  o.tripSignature = sogo.tripSignature;
  o.berth = sogo.berth;
  o.confirmedDate = auditedDate;
  o.naviBusstop = '00020745';
}
orders.systemKeys = Object.keys(orders.systems).sort();
orders.confirmedCount = orders.systemKeys.length;
orders.auditNote =
  '2026-07-25 audit: removed 4 route-3 false positives; upgraded 11-sogo-urayasu sample';
fs.writeFileSync(path.join(dir, 'official-stop-orders.json'), JSON.stringify(orders, null, 2), 'utf8');

const keys = cand.confirmedSystems.map((c) => c.proposedSystemKey).sort();
const lines = [];
lines.push('# シンボルロード線（route-11）公式出典サマリ');
lines.push('');
lines.push('## 確認日時');
lines.push(auditedAt + '（監査再オープン反映）');
lines.push('');
lines.push('## 正本');
lines.push('京成バスナビ（transfer-cloud.navitime.biz/keiseibus-group）の個別便通過時刻表（`/stops?`）');
lines.push('');
lines.push('## 収集統計');
lines.push('- confirmedSystems: ' + cand.confirmedSystems.length);
lines.push('- sameEndpointDifferentRoute groups: ' + (cand.sameEndpointDifferentRoute || []).length);
lines.push('- lateNightSystems: ' + (cand.lateNightSystems || []).length);
lines.push('- unconfirmedCandidates: ' + (cand.unconfirmedCandidates || []).length);
lines.push('- rejected route3 (incl. audit): ' + (cand.rejectedRoute3 || []).length);
lines.push('');
lines.push('## 監査結果（2026-07-25 Playwright再オープン）');
lines.push('### REMOVE（系統3誤分類）');
lines.push('- `11-shinurayasu-symbol-road-pc` — trip page 【3系統】（シ）。望海/明海五丁目経由でシンボル止まり');
lines.push('- `11-shinurayasu-symbol-road-pc-night` — 同上パターン（★シ）。系統11ではない');
lines.push('- `11-urayasu-akemi5` — trip page 【3系統】 浦安駅入口→明海五丁目');
lines.push('- `11-urayasu-sogo-via-akemi5` — trip page 【3系統】 浦安駅入口→総合公園（望海/明海五丁目経由）');
lines.push('');
lines.push('### KEEP（疑義あったが11確認）');
lines.push('- `11-sogo-urayasu` — 【11系統】総合公園→浦安駅入口。サンプルを総合公園発に更新');
lines.push('');
lines.push('### ADD');
lines.push('- なし');
lines.push('- `11-shinurayasu-urayasu`: H/[11]上で新浦安始発→浦安の【11】未確認');
lines.push('- `11-baypark-shinurayasu`: 独立始発未確認（総合公園発11の中間乗車のみ）');
lines.push('- `11-shinurayasu-nozomi-night`: ★シは【3系統】シンボル行き');
lines.push('');
lines.push('## busstop ID');
for (const [k, v] of Object.entries(cand.knownIds || {})) {
  lines.push('- ' + k + ': `' + v + '`');
}
lines.push('');
lines.push('## 確認済み運行パターン（confirmedSystems）');
lines.push('');
lines.push('| systemKey | 始発 | 終点 | via | 深夜 | 停留所数 | のりば |');
lines.push('| --- | --- | --- | --- | --- | ---: | --- |');
const sorted = [...cand.confirmedSystems].sort((a, b) =>
  a.proposedSystemKey.localeCompare(b.proposedSystemKey),
);
for (const c of sorted) {
  lines.push(
    '| ' +
      c.proposedSystemKey +
      ' | ' +
      c.departure +
      ' | ' +
      c.destination +
      ' | ' +
      (c.viaKey || '') +
      ' | ' +
      (c.night ? 'Y' : '') +
      ' | ' +
      c.stopCount +
      ' | ' +
      (c.berth || '') +
      ' |',
  );
}
lines.push('');
for (const c of sorted) {
  lines.push('### ' + c.proposedSystemKey);
  lines.push('- title: ' + c.title);
  lines.push('- tripSignature: `' + c.tripSignature + '`');
  lines.push('- sample: ' + c.sampleUrl);
  lines.push('- stops (' + c.stopCount + '): ' + (c.stopNames || []).join(' → '));
  lines.push('');
}
lines.push('## 未確認候補');
for (const u of cand.unconfirmedCandidates || []) {
  lines.push(
    '- ' + u.candidateKey + ' (' + (u.from || '?') + ' → ' + (u.to || '?') + ') — ' + u.note,
  );
}
lines.push('');
lines.push('## 除外した他系統');
lines.push('- 監査で【3系統】と確定した便は rejectedRoute3 へ移動');
lines.push('- 高洲海浜公園終点は系統11非対象（relation 18419852 使用禁止）');
lines.push('');
lines.push('## 生データ');
lines.push('- `_audit_trip_samples.json`');
lines.push('- `_navi_scrape_raw.json`');
lines.push('- `official-all-trips.json`');
lines.push('- `official-trip-signatures.json`');
lines.push('- `official-system-candidates.json`');
lines.push('');
lines.push('## ゲート');
lines.push('本ファイル群が揃うまで path 実装を開始しない。');
lines.push('');

fs.writeFileSync(path.join(dir, 'official-source-summary.md'), lines.join('\n'), 'utf8');

console.log('confirmedSystems:', cand.confirmedSystems.length);
console.log('keys:');
keys.forEach((k) => console.log(' ', k));
console.log('removed:', [...REMOVE].join(', '));
console.log('stop-orders count:', orders.systemKeys.length);
console.log('stop-orders keys match:', JSON.stringify(orders.systemKeys) === JSON.stringify(keys));
