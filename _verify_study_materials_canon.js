/**
 * 正本文の title / blocks(type,text) 完全一致照合
 * node _verify_study_materials_canon.js
 *
 * study-materials-data.js を変更していないことの回帰用。
 * スナップショットは現行正本文から生成した固定期待値。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const dataPath = path.join(__dirname, 'study-materials-data.js');
const snapshotPath = path.join(__dirname, 'study-materials-canon-snapshot.json');
const EXPECTED_SHA256 = '58f8c03de96034d7ca535087de0df1643b599bfc66cd71649ffd44b4ace427c6';

const code = fs.readFileSync(dataPath);
const sha = crypto.createHash('sha256').update(code).digest('hex');
if (sha !== EXPECTED_SHA256) {
  console.error('SHA256 MISMATCH for study-materials-data.js');
  console.error(' expected', EXPECTED_SHA256);
  console.error(' actual  ', sha);
  process.exit(1);
}

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

if (!fs.existsSync(snapshotPath)) {
  fs.writeFileSync(snapshotPath, JSON.stringify(actual, null, 2) + '\n', 'utf8');
  console.log('SNAPSHOT CREATED', snapshotPath);
}

const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const actualJson = JSON.stringify(actual);
const expectedJson = JSON.stringify(canonize(expected));

if (actualJson !== expectedJson) {
  console.error('CANON JSON MISMATCH');
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    const a = actual[i];
    const e = expected[i];
    if (!a || !e) {
      console.error(' length/id mismatch at', i, { actual: a && a.id, expected: e && e.id });
      continue;
    }
    if (a.title !== e.title) console.error(' title', a.id, { expected: e.title, actual: a.title });
    const n = Math.max(a.blocks.length, e.blocks.length);
    for (let j = 0; j < n; j++) {
      const ab = a.blocks[j];
      const eb = e.blocks[j];
      if (!ab || !eb || ab.type !== eb.type || ab.text !== eb.text) {
        console.error(' block', a.id, j, { expected: eb, actual: ab });
      }
    }
  }
  process.exit(1);
}

console.log('OK canon snapshot match', {
  sha256: sha,
  materials: actual.length,
  blocks: actual.reduce((n, m) => n + m.blocks.length, 0),
});
process.exit(0);
