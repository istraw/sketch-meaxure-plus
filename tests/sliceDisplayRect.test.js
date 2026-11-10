const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const source = fs.readFileSync('src/meaxure/export/layerData.ts', 'utf8') + '\nexport {getSliceDisplayRect};';
let nativeRect, ancestry = false, projectedSource;
const request = { rect: () => nativeRect, layerAncestry: () => ancestry, shouldTrim: () => false };
const imports = {
    '../../sketch': { sketch: { Types: { Slice: 'Slice' } } },
    '../../sketch/compat': { getChildLayers: () => [], hasNativeMethod: (o, k) => !!o && typeof o[k] === 'function' },
    '../common/context': { context: { configs: { resolution: 1 } } },
    './projectedSource': { getProjectedSourceLayer: () => projectedSource, getLayerFrameRect: () => undefined },
    './nativeRequest': { getNativeExportRequestAt: () => request },
    './slice': { getSliceNativeExportOptions: () => ({ requestRect: nativeRect, shouldTrim: false }) }
};
const box = { exports: {}, require: name => imports[name] || {} };
vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 }
}).outputText, box);
const rect = { x: 17, y: 296, width: 40, height: 40 };
const layer = { type: 'Slice', name: '自选' };
const plain = value => JSON.parse(JSON.stringify(value));
for (const origin of [{ x: 79, y: 30 }, { x: 1000, y: 2000 }, { x: -400, y: -600 }]) {
    const board = { frame: { ...origin, width: 375, height: 812 } };
    nativeRect = { ...rect, x: rect.x + origin.x, y: rect.y + origin.y };
    for (const nativeTrimming of [false, true]) {
        if (nativeTrimming) {
            box.MSExportRequest = {};
            box.MSSliceTrimming = { rectForLayerAncestry_withTrimming: () => nativeRect };
            ancestry = {};
        } else {
            delete box.MSExportRequest; delete box.MSSliceTrimming; ancestry = false;
        }
        for (const projected of [false, true]) {
            projectedSource = projected ? {} : undefined;
            assert.deepStrictEqual(plain(box.exports.getSliceDisplayRect(layer, rect, board)), rect,
                'native document coordinates must become artboard-relative for ordinary and projected slices');
        }
    }
    projectedSource = undefined;
    nativeRect = { x: origin.x + 20, y: origin.y + 300, width: 32, height: 30 };
    assert.deepStrictEqual(plain(box.exports.getSliceDisplayRect(layer, rect, board)), { x: 20, y: 300, width: 32, height: 30 },
        'native trimming must survive coordinate conversion');
    nativeRect = { x: 99999, y: 99999, width: 40, height: 40 };
    assert.deepStrictEqual(plain(box.exports.getSliceDisplayRect(layer, rect, board)), rect,
        'unusable renderer coordinates must fall back to the measured frame');
}
console.log('PASS: real UBS slice offset, distant/negative board origins, projected slices, native trimming and invalid-request fallback');
