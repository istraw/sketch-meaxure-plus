const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const source = fs.readFileSync('src/meaxure/export/layerData.ts', 'utf8') + '\nexport { getPreferredTextVisualRect, getMeasuredTextRect };';
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
const managerCode = ts.transpileModule(fs.readFileSync('src/meaxure/export/tempLayers.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
const manager = {exports:{}}; vm.runInNewContext(managerCode, manager);
const {tempLayers} = manager.exports;
let groups = [], fits = 0, fragments = 0, removed = 0;
class Rectangle { constructor(x,y,width,height) {Object.assign(this,{x,y,width,height});} }
class Group { constructor(options) {Object.assign(this,options); this.id = 'temp-'+groups.length; groups.push(this);} remove() {removed++;} }
const text = {text:'test',textBehaviour:1,style:{fontSize:10,lineHeight:10},
    sketchObject:{glyphBounds:()=>({origin:{x:0,y:0},size:{width:15,height:10}})},
    get fragments(){fragments++;return [{rect:{x:0,y:0,width:12,height:10}}];},
    duplicate:()=>({style:{},frame:{},adjustToFit(){fits++; this.frame = new Rectangle(0,0,16,10);}})};
const box = {exports:{},require:n=>{
    if(n==='../../sketch')return {sketch:{Group,Rectangle,Text:{Alignment:{},VerticalAlignment:{}}}};
    if(n==='./projectionHost')return {getProjectionHost:b=>b};
    if(n==='./tempLayers')return {tempLayers};
    if(n==='../../sketch/text')return {TextBehaviour:{autoWidth:0}};
    if(n==='../../sketch/compat')return {hasNativeMethod:(o,k)=>typeof o[k]==='function',callNative:(o,k)=>o[k]()};
    return {};
}};
vm.runInNewContext(code,box);
const frame = new Rectangle(0,0,20,10);
for(let i=0;i<1000;i++)assert.strictEqual(box.exports.getPreferredTextVisualRect(text,{},frame).width,15);
assert.strictEqual(groups.length,0,'valid glyph bounds must avoid document mutations');
assert.strictEqual(fragments,0,'unused fragment measurement must not run');
text.sketchObject.glyphBounds=()=>undefined;
for(let i=0;i<1000;i++)assert.strictEqual(box.exports.getPreferredTextVisualRect(text,{},frame).width,16);
assert.strictEqual(fits,1000);assert.strictEqual(removed,1000);
assert(groups.every(g=>!tempLayers.exists(g)), 'removed measurement groups must be released');
tempLayers.removeAll();assert.strictEqual(removed,1000,'final cleanup must not remove measured groups twice');
text.duplicate=()=>{throw Error('measurement failure');};
assert.strictEqual(box.exports.getPreferredTextVisualRect(text,{},frame).width,12);
assert.strictEqual(fragments,1);assert(groups.every(g=>!tempLayers.exists(g)));
console.log('PASS: 1000 glyph measurements create no temporary groups, 1000 fitted groups released, fragment fallback and failure cleanup');
