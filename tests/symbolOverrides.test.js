const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/meaxure/export/symbolOverrides.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(source, sandbox);
const api = sandbox.exports;
let reads = 0;
let fallbacks = 0;
const all = Array.from({ length: 3000 }, (_, i) => ({ path: `nested/${i}`, value: i }));
all.push({ path: 'nested/9', value: 'second-property' }, { path: '9', value: 'root' });
const instance = {
    get overrides() { reads++; return all; },
    overridesForExpandedLayer() { fallbacks++; return ['fallback']; },
};
for (let i = 0; i < 3000; i++) {
    const layer = { id: String(i), _detachedSymbolAncestry: { objectIDs: () => ['nested'] } };
    const actual = api.getIndexedExpandedOverrides(instance, layer);
    const expected = all.filter(item => item.path === `nested/${i}`);
    assert.deepStrictEqual(Array.from(actual), expected);
}
assert.strictEqual(reads, 1, 'all 3000 child queries should read the override array once');
assert.strictEqual(api.getIndexedExpandedOverrides(instance, { id: '9' })[0].value, 'root');
assert.strictEqual(api.getIndexedExpandedOverrides(instance, { id: 'missing' }).length, 0);
assert.strictEqual(fallbacks, 0);
assert.deepStrictEqual(api.getIndexedExpandedOverrides(instance, { id: '9', _detachedSymbolAncestry: { objectIDs: () => ({}) } }), ['fallback']);
api.clearSymbolOverrideIndex(instance);
api.getIndexedExpandedOverrides(instance, { id: '9' });
assert.strictEqual(reads, 2, 'a new export must rebuild the index');
console.log('PASS: 3000 child queries, identical SDK matches, duplicate properties, nested paths, fallback, cleanup');
