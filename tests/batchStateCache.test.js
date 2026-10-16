const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(file,imports,extra={}){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;const box={exports:{},require:n=>imports[n],...extra};vm.runInNewContext(code,box);return box.exports;}
const sketch={Types:{Artboard:'Artboard',SymbolMaster:'SymbolMaster',Text:'Text',Group:'Group',Shape:'Shape'}};
const states=load('src/meaxure/export/layerStates.ts',{'../../sketch':{sketch},'./tempLayers':{tempLayers:{exists:()=>false}}});
const board={id:'board',type:'Artboard'};let reads=0;
const parent={id:'parent',name:'parent',type:'Group',parent:board,hidden:false,exportFormats:[]};
const child=id=>({id,name:id,type:'Text',parent,isEmpty:false,hidden:false,locked:false});
Object.defineProperty(parent,'locked',{get(){reads++;return false;}});
let now=0;
const api=load('src/meaxure/export/session.ts',{'./layerStates':states,'../../../package.json':require('../package.json')},{Date:{now:()=>now},clearTimeout(){},setTimeout:fn=>{parent.hidden=true;setTimeout(fn,0);}});
(async()=>{
 const session=new api.ExportSession(()=>false,()=>{});
 for(let i=0;i<1000;i++)assert.strictEqual(states.getLayerStates(child('child'+i)).isHidden,false);
 assert.strictEqual(reads,1,'siblings in one synchronous batch reuse parent state');
 now=250;await session.checkpoint('next batch');
 assert.strictEqual(states.getLayerStates(child('next')).isHidden,true,'UI changes during a yield must be observed');
 assert.strictEqual(reads,2);
 parent.name='#meaxure-properties';states.clearLayerStateCache();
 assert.strictEqual(states.getLayerStates(child('marker child')).isMeaXure,true,'marker invalidation refreshes inherited flags');
 console.log('PASS: 1000 siblings reuse ancestry, yielded changes and marker invalidation are observed');
})().catch(e=>{console.error(e);process.exitCode=1;});
