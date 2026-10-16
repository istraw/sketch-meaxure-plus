const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(file,imports={}){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;const box={exports:{},require:n=>imports[n]||{}};vm.runInNewContext(code,box);return box.exports;}
const {tempLayers}=load('src/meaxure/export/tempLayers.ts');
const trees=load('src/meaxure/export/symbolTreeCache.ts');
let serial=0,removed=0,copies=0;
class Rectangle{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}changeBasis(){return this;}}
class Group{constructor(o){this.id='copy'+serial++;this.type='Group';this.layers=[];this.exportFormats=[];Object.assign(this,o);}set parent(p){this._parent=p;p.layers.push(this);}get parent(){return this._parent;}remove(){removed++;this.parent.layers=this.parent.layers.filter(l=>l!==this);}}
function source(name,frame,children=[]){const l={id:'source'+serial++,name,type:children.length?'Group':'ShapePath',frame,layers:children,duplicate(){throw Error('immutable SDK duplicate must not be used')}};l.sketchObject={newMutableCounterpart(){return {copy(){copies++;return copied(l);}}}};return l;}
function copied(l){const g=new Group({name:l.name,frame:l.frame});g.type=l.type;for(const c of l.layers){const n=copied(c);n.parent=g;}return g;}
const root=source('root',new Rectangle(2,3,40,50),[source('leaf',new Rectangle(4,5,10,11))]);
const instance={name:'symbol',frame:new Rectangle(100,200,40,50),expandedLayers:[root]};
const Types={Group:'Group',Shape:'Shape',SymbolInstance:'SymbolInstance'};
const layers=load('src/meaxure/export/layers.ts',{'../../sketch':{sketch:{Types}},'../../sketch/compat':{getChildLayers:l=>l.layers||[],callNative:(o,k,f)=>o&&typeof o[k]==='function'?o[k]():f},'./tint':{getTintInfo:l=>l.tint}});
const imports={'./layerData':{hasStackLayoutMetadata:l=>!!(l&&l.stackLayout)},'./projectionHost':{getProjectionHost:b=>b,releaseProjectionRenderLayers(){},closeProjectionHost(){}},'./layers':layers,'../../sketch':{sketch:{Group,Rectangle,Types}},'./tempLayers':{tempLayers},'./symbolTreeCache':trees,'./symbolDebug':{pushSymbolDebug(){}},'./session':{measureExportPhase:(_,fn)=>fn()},'../../sketch/compat':{hasNativeMethod:(o,k)=>!!o&&typeof o[k]==='function',wrapLayer:o=>o,getChildLayers:l=>l.layers||[],callNative:(o,k,f)=>o&&typeof o[k]==='function'?o[k]():f}};
const code=ts.transpileModule(fs.readFileSync('src/meaxure/export/symbol.ts','utf8')+'\nexport { createExpandedProjectedSymbolGroup, flattenProjectedChildren };',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
const box={exports:{},require:n=>imports[n]||{}};vm.runInNewContext(code,box);
const board={layers:[]};const result=box.exports.createExpandedProjectedSymbolGroup(instance,board);
assert(result);assert.strictEqual(copies,1);const container=result.layers[0];assert.strictEqual(container.name,'tmp-instance-symbol');
const projected=container.layers[0],leaf=projected.layers[0];
assert.deepStrictEqual({...leaf.__meaxureProjectedRect},{x:106,y:208,width:10,height:11});assert.strictEqual(leaf.__meaxureProjectedSourceID,root.layers[0].id);assert.notStrictEqual(leaf.id,root.layers[0].id);assert.strictEqual(root.frame.x,2);assert.strictEqual(root.layers[0].frame.x,4);
tempLayers.remove(result);assert.strictEqual(board.layers.length,0);
const broken=source('broken',new Rectangle(0,0,1,1));broken.sketchObject.newMutableCounterpart=()=>{throw Error('copy unavailable')};instance.expandedLayers=[root,broken];trees.clearSymbolTreeCache(instance);
assert.strictEqual(box.exports.createExpandedProjectedSymbolGroup(instance,board),undefined);assert.strictEqual(board.layers.length,0,'partial projection must be removed before fallback');tempLayers.removeAll();assert.strictEqual(removed,2);
console.log('PASS: resolved immutable tree copied with fresh IDs, nested coordinates and container preserved, source untouched, partial failure cleaned');

const pruningHost={layers:[{id:'hidden',name:'hidden',type:'Group',hidden:true,__meaxureContainsNote:false,layers:[{id:'discarded'}]},{id:'note-parent',name:'hidden notes',type:'Group',hidden:true,__meaxureContainsNote:true,exportFormats:[],layers:[{id:'note',name:'#meaxure-note-test',type:'Group',exportFormats:[],__meaxureContainsNote:true,layers:[]}]},{id:'shape',type:'Shape',__meaxureContainsNote:false,layers:[{id:'path'}]},{id:'slice',type:'Group',exportFormats:[{}],__meaxureContainsNote:false,layers:[{id:'slice-child'}]}]};
assert.deepStrictEqual(Array.from(box.exports.flattenProjectedChildren(pruningHost),l=>l.id),['hidden','note','note-parent','shape','slice']);
console.log('PASS: hidden/shape/slice descendants pruned, hidden note subtrees retained');
