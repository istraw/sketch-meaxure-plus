const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const SMType = { text: 'text', slice: 'slice', shape: 'shape', group: 'group', hotspot: 'hotspot' };
const rect = { x: 34, y: 592, width: 80, height: 80 };
const state = { zoom: 1, current: { layers: [
    { type: 'slice', rect, exportable: [{ path: 'icon.png' }] },
    { type: 'shape', rect },
    { type: 'shape', rect: { x: 58, y: 616, width: 32, height: 32 } },
    { type: 'group', rect },
    { type: 'hotspot', rect }
] } };
const listeners = {}, inspected = [];
const imports = {
    '../common': { state, project: { resolution: 2 } },
    './helper': {
        getIndex: el => el.index, getEventTarget: () => false,
        mouseoutLayer() {}, selectedLayer() {},
        removeSelected() { state.selectedIndex = undefined; }
    },
    '../render/inspector': { inspector() { inspected.push(state.selectedIndex); } },
    './distance': { hideDistance() {} },
    '../../src/meaxure/interfaces': { SMType }, './panMode': { panMode: false },
    '../render/helper': { getLayerRect: layer => layer.displayRect || layer.rect }
};
const box = { exports: {}, require: name => imports[name], document: {
    body: { addEventListener(type, listener) { listeners[type] = listener; } },
    querySelector: () => ({ getBoundingClientRect: () => ({ left: 100, top: 50 }) })
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('ui/events/layerEvents.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 }
}).outputText, box);
box.exports.layerEvents();
function click(index = 1, clientX = 134, clientY = 366) {
    listeners.click({ clientX, clientY, target: { index, classList: { contains: c => c === 'layer' } } });
    return state.selectedIndex;
}
assert.strictEqual(click(), 0, 'first click must select the slice over its overlapping ellipse');
assert.strictEqual(click(), 2, 'second click selects the smaller artwork');
assert.strictEqual(click(), 1, 'third click reaches the ellipse rather than resetting to the DOM target');
assert.strictEqual(click(), 0, 'repeated clicks cycle all inspectable hits');
assert.deepStrictEqual(inspected, [0, 2, 1, 0], 'each selection updates the inspector');
listeners.click({ target: { classList: { contains: () => false } } });
assert.strictEqual(click(), 0, 'clearing selection restores slice priority');
assert.strictEqual(click(1, 120, 350), 0, 'moving to another point starts a new selection');
state.current.layers.push({ type: 'text', rect });
listeners.click({ target: { classList: { contains: () => false } } });
assert.strictEqual(click(), 5, 'text retains its existing priority over slices');
console.log('PASS: overlapping slices select before shapes, cycle through all hits, reset after movement/clearing and preserve text priority at 2x resolution');
