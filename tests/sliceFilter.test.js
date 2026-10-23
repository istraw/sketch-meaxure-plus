const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const state = { currentPageSlicesOnly: false };
const asset = id => ({ objectID: id, name: id, rect: { width: 20, height: 20 }, exportable: [{ path: id + '.png' }] });
const project = { slices: [asset('shared'), asset('first'), asset('second'), { ...asset('empty'), exportable: [] }] };
const list = { innerHTML: '' };
const filter = { addEventListener(type, listener) { this[type] = listener; } };
const doc = { querySelector: selector => selector === '#slice-list' ? list : selector === '#current-page-slices-only' ? filter : null };
function load(file, imports) {
    const box = { exports: {}, require: name => imports[name], document: doc };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 }
    }).outputText, box);
    return box.exports;
}
const common = { state, project, localize: text => text };
const render = load('ui/render/slices.ts', { '../common': common, './helper': { unitSize: n => n + 'px', getLayerRect: l => l.rect } });
render.slices();
assert(list.innerHTML.includes('slice-first') && list.innerHTML.includes('slice-second'));
assert(!list.innerHTML.includes('slice-empty'));
const events = load('ui/events/slices.ts', {
    '../common': common, './helper': {}, '../render/helper': {}, './delegate': { eventDelegate() {} }, '../render/slices': render
});
events.sliceEvents();
state.current = { layers: [asset('shared'), asset('first'), asset('first')] };
filter.checked = true;
filter.change.call(filter);
assert.strictEqual(state.currentPageSlicesOnly, true);
assert(list.innerHTML.includes('slice-shared') && list.innerHTML.includes('slice-first'));
assert(!list.innerHTML.includes('slice-second'));
assert.strictEqual((list.innerHTML.match(/id="slice-first"/g) || []).length, 1);
state.current = { layers: [asset('shared'), asset('second')] };
render.slices();
assert(list.innerHTML.includes('slice-shared') && list.innerHTML.includes('slice-second'));
assert(!list.innerHTML.includes('slice-first'));
state.current = { layers: [] };
render.slices();
assert(list.innerHTML.includes('No slices on current page'));
filter.checked = false;
filter.change.call(filter);
assert(list.innerHTML.includes('slice-first') && list.innerHTML.includes('slice-second'));
project.slices = undefined;
render.slices();
assert(list.innerHTML.includes('No slices added!'));
assert(fs.readFileSync('ui/events/navigate.ts', 'utf8').includes('if (state.currentPageSlicesOnly) slices();'));
console.log('PASS: slice filter toggles, follows current artboard, retains shared assets, deduplicates instances and clears empty lists');
