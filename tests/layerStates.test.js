const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const Types={Artboard:'Artboard',SymbolMaster:'SymbolMaster',Shape:'Shape',Group:'Group',Text:'Text'};
const source=ts.transpileModule(fs.readFileSync('src/meaxure/export/layerStates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
const box={exports:{},require:n=>n==='../../sketch'?{sketch:{Types}}:{tempLayers:{exists:l=>!!l.owned}}};vm.runInNewContext(source,box);const api=box.exports;
function legacy(layer){let s={isHidden:false,isLocked:false,isInSlice:false,isMeaXure:false,isEmptyText:false,isInShapeGroup:false};while(layer.type!==Types.Artboard&&layer.type!==Types.SymbolMaster){const p=layer.parent;if(!s.isMeaXure)s.isMeaXure=layer.name.startsWith('#meaxure-');if(!s.isInShapeGroup)s.isInShapeGroup=p.type===Types.Shape;if(!s.isHidden)s.isHidden=layer.hidden&&!layer.owned;if(!s.isLocked)s.isLocked=layer.locked;if(!s.isInSlice)s.isInSlice=p.type===Types.Group&&p.exportFormats.length>0;if(!s.isEmptyText)s.isEmptyText=layer.type===Types.Text&&layer.isEmpty;layer=p;}return s;}
let seed=10;function rng(n){seed=(seed*1664525+1013904223)>>>0;return seed%n;}
const root={id:'root',type:Types.Artboard,hidden:true,locked:true},nodes=[root];
for(let i=0;i<3000;i++){const node={id:String(i),name:rng(15)?'layer':'#meaxure-layer',type:['Group','Shape','Text'][rng(3)],parent:nodes[rng(nodes.length)],hidden:rng(5)===0,locked:rng(9)===0,owned:rng(7)===0,isEmpty:rng(4)===0,exportFormats:rng(6)?[]:[{}]};nodes.push(node);}
for(const node of nodes.slice(1))assert.deepStrictEqual({...api.getLayerStates(node)},legacy(node));
api.clearLayerStateCache();let parentReads=0;const group={id:'shared',type:Types.Group,name:'group',hidden:false,locked:false,exportFormats:[],get parent(){parentReads++;return root}};
for(let i=0;i<10000;i++)api.getLayerStates({id:'leaf'+i,name:'text',type:Types.Text,hidden:false,locked:false,isEmpty:false,parent:group});
assert.strictEqual(parentReads,1);api.clearLayerStateCache();group.hidden=true;assert(api.getLayerStates({...group,id:'new',parent:group}).isHidden);
api.clearLayerStateCache();const cycle={id:'cycle',name:'cycle',type:Types.Group};cycle.parent=cycle;assert.throws(()=>api.getLayerStates(cycle),/Cyclic/);
console.log('PASS: 3000 varied ancestry results match prior behavior, 10000 sibling queries share one parent read, reset observes changes, cycles fail safely');
