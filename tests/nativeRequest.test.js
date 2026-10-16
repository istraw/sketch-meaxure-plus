const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/meaxure/export/nativeRequest.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
}).outputText;
const hasNativeMethod = (target, method) => !!target && typeof target[method] === 'function';
let legacyCalls = 0;
let modernCalls = 0;
let modernFails = false;
const request = {};
const exporter = {
    exportRequestsForLayer_inRect_exportFormats() {
        modernCalls++;
        if (modernFails) throw new Error('request unavailable');
        return [request];
    },
};
const globals = {
    exports: {},
    require: () => ({ hasNativeMethod }),
    CGRectNull: {},
    MSSelfContainedHighLevelExporter: { alloc: () => ({ initWithOptions: () => exporter }) },
    MSExportRequest: {
        exportRequestsFromExportableLayer() {
            legacyCalls++;
            return { count: () => 1, objectAtIndex: () => request };
        },
    },
};
vm.runInNewContext(source, globals);
const api = globals.exports;
const layer = document => ({ sketchObject: {
    documentData: () => document,
    exportOptions: () => ({ exportFormats: () => ({
        count: () => 1,
        objectAtIndex: () => ({ immutableModelObject: () => ({}) }),
    }) }),
} });
assert.strictEqual(api.getNativeExportRequestAt(layer(null)), undefined);
assert.strictEqual(modernCalls, 0, 'orphan must never reach the native builder');
assert.throws(() => api.assertExportLayerHasDocument(layer(null)), /not attached/);
assert.strictEqual(api.getNativeExportRequestAt(layer({})), request);
assert.strictEqual(api.getNativeExportRequestAt(layer({}), 1), undefined);
const reusedLayer = layer({});
api.clearNativeExportRequestCache();
const previousCalls = modernCalls;
api.getNativeExportRequestAt(reusedLayer);
api.getNativeExportRequestAt(reusedLayer);
assert.strictEqual(modernCalls, previousCalls + 1, 'geometry and export must reuse one snapshot');
api.clearNativeExportRequestCache();
api.getNativeExportRequestAt(reusedLayer);
assert.strictEqual(modernCalls, previousCalls + 2, 'next task must refresh its snapshot');
modernFails = true;
assert.strictEqual(api.getNativeExportRequestAt(layer({})), undefined);
assert.strictEqual(legacyCalls, 0, 'modern failures must never fall back to the crashing legacy API');
delete globals.MSSelfContainedHighLevelExporter;
assert.strictEqual(api.getNativeExportRequestAt(layer({})), request);
assert.strictEqual(legacyCalls, 1, 'older Sketch versions retain their request builder');
console.log('PASS: orphan protection, modern requests, indexing, safe failure, legacy compatibility');
