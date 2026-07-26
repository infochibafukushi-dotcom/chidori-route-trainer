/**
 * 正本文照合：既存3資料の title/blocks 不変 + 追加資料の存在確認
 * node _verify_study_materials_canon.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const dataPath = path.join(__dirname, 'study-materials-data.js');
const snapshotPath = path.join(__dirname, 'study-materials-canon-snapshot.json');

const code = fs.readFileSync(dataPath);
const sha = crypto.createHash('sha256').update(code).digest('hex');
const sandbox = { window: {} };
vm.runInNewContext(code.toString('utf8'), sandbox);
const materials = sandbox.window.STUDY_MATERIALS;

function canonize(list) {
  return (list || []).map((item) => ({
    id: item.id,
    title: item.title,
    blocks: (item.blocks || []).map((block) => ({
      type: block.type,
      text: block.text,
    })),
  }));
}

const actual = canonize(materials);
const expectedAll = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const expectedCore = expectedAll.filter((m) => ['stroller', 'wheelchair', 'mic-guide'].includes(m.id));
const actualCore = actual.filter((m) => ['stroller', 'wheelchair', 'mic-guide'].includes(m.id));

if (JSON.stringify(actualCore) !== JSON.stringify(canonize(expectedCore))) {
  console.error('CORE CANON MISMATCH (stroller/wheelchair/mic-guide must stay unchanged)');
  process.exit(1);
}

const bicycle = materials.find((m) => m.id === 'bicycle-accident-prevention');
if (!bicycle || bicycle.title !== '自転車事故防止の三原則') {
  console.error('bicycle material missing or title mismatch', bicycle);
  process.exit(1);
}

fs.writeFileSync(snapshotPath, JSON.stringify(actual, null, 2) + '\n', 'utf8');

console.log('OK canon', {
  sha256: sha,
  materials: actual.length,
  coreBlocks: actualCore.reduce((n, m) => n + m.blocks.length, 0),
  bicycleOk: true,
});
process.exit(0);
