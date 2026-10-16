const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
function load(file, imports) {
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const sandbox = { exports: {}, require: name => imports[name] };
    vm.runInNewContext(source, sandbox);
    return sandbox.exports;
}
const compat = load('src/sketch/compat.ts', { '.': { sketch: {} } });
let reads = 0;
const children = [{}];
assert.strictEqual(compat.getChildLayers({ get layers() { reads++; return children; } }), children);
assert.strictEqual(reads, 1, 'SDK child getter should run once');
let nativeReads = 0;
compat.getChildLayers({ layers: [], sketchObject: { layers() { nativeReads++; return []; } } });
assert.strictEqual(nativeReads, 0, 'an empty group must not be fetched again');
let scans = 0;
let instanceExpansions = 0;
const candidate = { id: 'source', name: 'asset', exportFormats: [{}], frame: { x: 0, y: 0, width: 10, height: 10 }, layers: [] };
const instance = { id: 'symbol', type: 'SymbolInstance', name: 'symbol', exportFormats: [],
    get layers() { instanceExpansions++; throw Error('virtual instance tree must not be expanded'); } };
const page = { get layers() { scans++; return [candidate, instance]; } };
const context = { document: { pages: [page], getLayerWithID: () => undefined } };
const projected = load('src/meaxure/export/projectedSource.ts', {
    '../common/context': { context },
    '../../sketch/compat': compat,
});
assert.strictEqual(projected.getProjectedSourceLayer(candidate), undefined);
assert.strictEqual(scans, 0, 'ordinary layers must not scan the document');
const projection = { name: 'asset', __meaxureProjectedSourceID: 'missing', frame: candidate.frame };
assert.strictEqual(projected.getProjectedSourceLayer(projection), candidate);
assert.strictEqual(projected.getProjectedSourceLayer(projection), candidate);
assert.strictEqual(scans, 1, 'projected fallback index must be built once');
assert.strictEqual(instanceExpansions, 0);
projected.clearProjectedSourceCache();
projected.getProjectedSourceLayer(projection);
assert.strictEqual(scans, 2, 'new export must refresh the document index');
console.log('PASS: one child read, empty groups, ordinary layers, projected fallback, virtual symbols, cache reset');
