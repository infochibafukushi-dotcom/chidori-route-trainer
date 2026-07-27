'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const sandbox = {
  window: {},
  document: { getElementById: () => null, querySelector: () => null, addEventListener: () => {}, body: { appendChild: () => {} }, head: { appendChild: () => {} } },
  localStorage: { getItem: () => null, setItem: () => {} },
  console,
  routeState: { routeId: 'route-23', direction: 'outbound' },
  page: 'routes',
  setTimeout: () => {},
  stopEditor: () => {},
};
sandbox.window = sandbox;
for (const f of ['urayasu-higashi-danchi-line-23-platforms-v1.js', 'urayasu-higashi-danchi-line-23-path-v1.js', 'urayasu-higashi-danchi-line-23-path-policy-v1.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox);
}
try {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'urayasu-higashi-danchi-line-23-route-v1.js'), 'utf8'), sandbox);
  console.log('API', Object.keys(sandbox.window.URAYASU_HIGASHI_DANCHI_LINE_23_ROUTE_V1 || {}));
} catch (e) {
  console.error('LOAD FAIL', e);
}
