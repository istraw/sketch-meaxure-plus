const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const slice = objectID => ({ objectID, exportable: [{ path: objectID + '.png' }] });
const project = { artboards: [
    { layers: [slice('shared'), slice('first')] },
    { layers: [slice('shared'), slice('second'), slice('second')] },
    { layers: [] }
] };
const state = { artboardIndex: 0, current: project.artboards[0], currentPageSlicesOnly: false };
const listeners = {}, navigations = [], selections = [], messages = [];
const viewer = { scrollLeft: 0, scrollTop: 0, clientWidth: 800, clientHeight: 600 };
const panel = { active: false }, filter = { addEventListener() {} };
const elements = project.artboards.map(board => board.layers.map((layer, index) => ({
    dataset: { index: String(index) }, clientWidth: 20, clientHeight: 20,
    getBoundingClientRect: () => ({ left: 200, top: 150 })
})));
function load(file, imports) {
    const box = { exports: {}, require: name => imports[name], document: {
        querySelector(selector) {
            if (selector === '#current-page-slices-only') return filter;
            if (selector === '.screen-viewer') return viewer;
            if (selector.startsWith('#layer-')) return elements[state.artboardIndex][Number(selector.slice(7))];
            return null;
        }
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 }
    }).outputText, box);
    return box.exports;
}
const selection = load('ui/events/layerEvents.ts', {
    '../common': { state, project },
    './helper': { mouseoutLayer() {}, selectedLayer() {} },
    '../render/inspector': { inspector() { panel.active = true; panel.layer = state.current.layers[state.selectedIndex]; } },
    './distance': { hideDistance() {} }, '../../src/meaxure/interfaces': {}, './panMode': {}, '../render/helper': {}
});
const api = load('ui/events/slices.ts', {
    '../common': { state, project, localize: text => text },
    '../render/helper': { message: text => messages.push(text) },
    './delegate': { eventDelegate(parent, event, selector, listener) { listeners[event] = listener; } },
    '../render/slices': { slices() {} },
    './navigate': { gotoArtboard(index) { navigations.push(index); state.artboardIndex = index; state.current = project.artboards[index]; state.selectedIndex = undefined; panel.active = false; } },
    './layerEvents': { selectLayerByIndex(index) { selections.push(index); selection.selectLayerByIndex(index); } }
});
api.sliceEvents();
function click(id) {
    let stopped = false;
    listeners.click.call({ dataset: { objectid: id } }, { stopPropagation() { stopped = true; } });
    assert(stopped, 'sidebar click must not clear selection after navigation');
}
click('second');
assert.deepStrictEqual(navigations, [1]);
assert.strictEqual(state.selectedIndex, 1);
assert(panel.active && panel.layer.objectID === 'second', 'right panel must show the selected slice');
assert(viewer.scrollTop !== 0, 'slice must be brought into view');
click('shared');
assert.deepStrictEqual(navigations, [1], 'prefer an instance on the current artboard');
assert.strictEqual(state.selectedIndex, 0);
click('first');
assert.deepStrictEqual(navigations, [1, 0]);
assert.strictEqual(panel.layer.objectID, 'first');
state.artboardIndex = 2; state.current = project.artboards[2];
click('shared');
assert.deepStrictEqual(navigations, [1, 0, 0], 'use first containing artboard if several contain the slice');
assert.strictEqual(messages.length, 0, 'valid cross-artboard slices must not show an error');
click('missing');
assert.strictEqual(messages.length, 1, 'orphaned old exports fail safely');
assert.deepStrictEqual(selections, [1, 0, 1, 0]);
console.log('PASS: cross-artboard slices navigate, select exact instance and open inspector; current/shared slices stay local; missing slices fail safely');
