const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/sketch/text/textFragment.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
const box={exports:{},require:n=>n==='../compat'?{hasNativeMethod:(o,k)=>typeof o[k]==='function',callNative:(o,k,f,...a)=>o&&typeof o[k]==='function'?o[k](...a):f}:{}};
vm.runInNewContext(code,box);
let dictionaries=0;const fallback=()=>{dictionaries++;return {value:{attributes:[{},{}]}};};
for(const attributes of [[{}],[],{count:()=>3}]){
 const text={sketchObject:{attributedString:()=>({attributedStringAttributes:()=>attributes,treeAsDictionary:fallback})}};
 const expected=Array.isArray(attributes)?attributes.length:3;
 for(let i=0;i<10000;i++)assert.strictEqual(box.exports.getFragmentsCount(text),expected);
}
assert.strictEqual(dictionaries,0,'plain/rich/empty text counts must avoid dictionary serialization');
assert.strictEqual(box.exports.getFragmentsCount({sketchObject:{attributedString:()=>({treeAsDictionary:fallback})}}),2);
assert.strictEqual(dictionaries,1);
assert.strictEqual(box.exports.getFragmentsCount({sketchObject:{}}),0);
console.log('PASS: 30000 attributed range counts avoid serialization, legacy and empty layers fall back correctly');
