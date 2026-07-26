'use strict';
/** Enumerate the route-15 template identifiers the route-18 generator must rewrite. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const s = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-route-v1.js'), 'utf8').replace(/\r\n/g, '\n');

const needles = [
  'shione-no-machi-15-', 'shione-no-machi-', 'shioneNoMachiLine', 'ShioneNoMachi', 'SHIONE_NO_MACHI',
  'route15StopEditor', 'openRoute15StopEditor', '潮音の街線', 'route-15', 'NAMES_15_',
  '15-takasu-seaside', '15-shinurayasu', '明海交差点', '入船橋', '東京学館', '高洲',
];
for (const n of needles) {
  const count = s.split(n).length - 1;
  console.log(String(count).padStart(4), '|', n);
}

console.log('\n=== lines with shione-no-machi- ===');
s.split('\n').forEach((l, i) => { if (l.includes('shione-no-machi-')) console.log(i + 1, l.trim().slice(0, 170)); });

console.log('\n=== lines with route.description / route.sourcePolicy / const order = [ ===');
s.split('\n').forEach((l, i) => { if (/route\.description|route\.sourcePolicy|const order = \[/.test(l)) console.log(i + 1, l.trim().slice(0, 300)); });

console.log('\n=== lines with shioneNoMachiLine ===');
s.split('\n').forEach((l, i) => { if (l.includes('shioneNoMachiLine')) console.log(i + 1, l.trim().slice(0, 170)); });

console.log('\n=== lines with ShioneNoMachi ===');
s.split('\n').forEach((l, i) => { if (/ShioneNoMachi/.test(l)) console.log(i + 1, l.trim().slice(0, 170)); });

console.log('\n=== lines with 東京学館 or 高洲 outside NAMES arrays ===');
s.split('\n').forEach((l, i) => {
  if (/東京学館|高洲/.test(l) && !/^\s*"/.test(l)) console.log(i + 1, l.trim().slice(0, 200));
});

console.log('\n=== path-policy template ===');
const pol = fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-path-policy-v1.js'), 'utf8').replace(/\r\n/g, '\n');
console.log(pol.split('\n').slice(0, 30).join('\n'));

console.log('\n=== css template ===');
console.log(fs.readFileSync(path.join(ROOT, 'shione-no-machi-line-stop-images-v1.css'), 'utf8').replace(/\r\n/g, '\n'));
