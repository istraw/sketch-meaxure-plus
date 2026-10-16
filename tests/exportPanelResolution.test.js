const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/meaxure/panels/exportPanel.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText;
function setup(resolution=2) {
    const callbacks={},writes=[];let close;
    const configs={units:'pt',byInfluence:false,get resolution(){return resolution},set resolution(value){writes.push(value);resolution=value}};
    const board={id:'board',type:'Artboard',name:'board',frame:{x:0,y:0,width:100,height:100}};
    const page={id:'page',name:'Page',layers:[board]};
    const panel={onDidReceiveMessage:(name,fn)=>callbacks[name]=fn,onClose:fn=>close=fn,show(){},close(){close()}};
    const imports={
        '../common/context':{context:{configs,selection:{length:0,layers:[]},document:{pages:[page],selectedPage:page}}},
        '../../webviewPanel':{createWebviewPanel:()=>panel},'../helpers/helper':{getResourcePath:()=>'/tmp'},
        '../common/language':{getLanguage:()=>({})},'../../sketch':{sketch:{Types:{Artboard:'Artboard',SymbolMaster:'SymbolMaster'}}},
        '../export/layers':{getChildrenForExport:()=>[[board],1]},
    };
    const box={exports:{},require:n=>{assert(n in imports,n);return imports[n]}};vm.runInNewContext(code,box);
    const result=box.exports.exportPanel();
    return {callbacks,writes,result,cancel:()=>close(),configs};
}
(async()=>{
    let p=setup();assert.strictEqual(p.callbacks.init().resolution,2);assert.strictEqual(p.callbacks.init().units,'pt');
    p.callbacks.sort({order:'alphabet',reverse:false,resolution:3});assert.deepStrictEqual(p.writes,[]);
    p.cancel();assert.strictEqual(await p.result,undefined);assert.deepStrictEqual(p.writes,[]);
    p=setup(1.25);assert.strictEqual(p.callbacks.init().resolution,1.25);
    p.callbacks.submit({selection:{board:true},resolution:3,exportOption:true});
    assert.strictEqual((await p.result).selection.length,1);assert.deepStrictEqual(p.writes,[3]);
    p=setup(2);
    for(const value of [0,-1,NaN,Infinity,null,''])assert.throws(()=>p.callbacks.submit({selection:{board:true},resolution:value}),/Invalid export resolution/);
    assert.deepStrictEqual(p.writes,[]);
    p.callbacks.submit({selection:{board:true},resolution:1.5});await p.result;assert.deepStrictEqual(p.writes,[1.5]);
    p=setup(4);p.callbacks.submit({selection:{board:true}});await p.result;assert.deepStrictEqual(p.writes,[4],'older cached panels keep the configured value');
    p=setup(2);p.callbacks.submit({selection:{},resolution:3});await p.result;assert.deepStrictEqual(p.writes,[]);
    console.log('PASS: export resolution initializes from settings, persists only on selected-board submit, preserves cancel/sort/custom values, rejects invalid input');
})().catch(error=>{console.error(error);process.exitCode=1});
