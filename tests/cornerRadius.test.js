const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(path,imports){const box={exports:{},require:n=>imports[n]||{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,box);return box.exports;}
const Types={ShapePath:'ShapePath',Shape:'Shape',Group:'Group',Artboard:'Artboard',SymbolMaster:'SymbolMaster',Text:'Text'};
const compat={hasNativeMethod:(o,k)=>!!o&&typeof o[k]==='function',callNative:(o,k,f)=>o&&typeof o[k]==='function'?o[k]():f};
const {getLayerRadius}=load('src/meaxure/helpers/styles.ts',{'../../sketch':{sketch:{Types}},'../../sketch/compat':compat});
function modern(type,values){return {type,style:{sketchObject:{corners:()=>({radii:()=>({count:()=>values.length,objectAtIndex:i=>values[i]})})}},get radius(){throw Error('modern corners must bypass the removed legacy API');}};}
for(const type of ['ShapePath','Shape','Group','Artboard'])assert.deepStrictEqual(Array.from(getLayerRadius(modern(type,[8]))),[8]);
assert.deepStrictEqual(Array.from(getLayerRadius(modern('ShapePath',[2,4,6,8]))),[2,4,6,8]);
assert.deepStrictEqual(Array.from(getLayerRadius(modern('ShapePath',[0]))),[0]);
assert.strictEqual(getLayerRadius(modern('Text',[8])),undefined);
assert.strictEqual(getLayerRadius(modern('ShapePath',[])),undefined);
assert.strictEqual(getLayerRadius(modern('ShapePath',[-1])),undefined);
assert.strictEqual(getLayerRadius({type:'Group',style:{sketchObject:{corners:()=>undefined}}}),undefined);
assert.deepStrictEqual(Array.from(getLayerRadius({type:'ShapePath',style:{sketchObject:{}},radius:[6,6,6,6]})),[6,6,6,6]);
assert.strictEqual(getLayerRadius({type:'ShapePath',style:{sketchObject:{corners(){throw Error('old bridge');}}},radius:[NaN]}),undefined);
const {renderProperties}=load('ui/render/inspector/properties.ts',{'../../common':{localize:s=>s},'../helper':{unitSize:v=>(v/2)+'pt',getLayerRect:l=>l.rect},'./shared':{propertyType:(_,html)=>html}});
const layer={rect:{x:24,y:513,width:436,height:88},opacity:1};
assert(renderProperties({...layer,radius:[8]}).includes('value="4pt"'));
assert(renderProperties({...layer,radius:[8,8,8,8]}).includes('value="4pt"'));
assert(renderProperties({...layer,radius:[2,4,6,8]}).includes('value="1pt / 2pt / 3pt / 4pt"'));
for(const radius of [undefined,[],[NaN],[Infinity],[-1]])assert(!renderProperties({...layer,radius}).includes('id="radius"'));
console.log('PASS: modern native corners, frame/group radii, legacy fallback, zero/mixed radii, invalid values, and 2x unit conversion');
