const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/meaxure/export/index.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
async function scenario(mode) {
    const events=[], diagnostics=[]; let flag=false, close;
    const board={id:'board',name:'board',parent:{id:'page',name:'page'},index:0,frame:{width:100,height:100}};
    const selected={selection:[{artboard:board,children:[{name:'one'},{name:'two'}]}],layersCount:2,advancedMode:false};
    const imports={
        '../panels/exportPanel':{exportPanel:async()=>mode==='dismiss'?null:selected},
        '../../sketch':{sketch:{Settings:{sessionVariable:()=>flag,setSessionVariable:(_,v)=>{flag=v;events.push('flag:'+v)}},UI:{savePanel:()=>'/tmp/mock',message:()=>{},showFiles:()=>{}}}},
        '../common/language':{localize:s=>s,getAllLanguage:()=>[],getLangCode:()=> 'en'},
        '../common/context':{context:{document:{fileName:'test'},configs:{resolution:1}}},
        '../../webviewPanel':{createWebviewPanel:()=>({onClose:fn=>{close=fn},show(){},postMessage(){},close(){events.push('close')}})},
        '../helpers/helper':{newStopwatch:()=>({restart(){},elpased:()=>1}),getResourcePath:()=>'',toSlug:s=>s,toHTMLEncode:s=>s,emojiToEntities:s=>s},
        './files':{writeFile:o=>{if(o.fileName==='export-diagnostics.json')diagnostics.push(JSON.parse(o.content))},buildTemplate:()=>'',exportImageToBuffer:()=>{events.push('preview');return Buffer.from('')}},
        '../common/logger':{logger:{log(){}}},'../interfaces':{SMType:{slice:'slice'}},
        './layerData':{getLayerData:(_,l)=>{if(mode.startsWith('sync')){events.push('start:'+l.name);if(mode==='sync-skip')throw Error('bad sync layer');if(mode==='sync-cancel'){const e=Error();e.code='MEAXURE_EXPORT_CANCELLED';throw e;}events.push('end:'+l.name);return;}return (async()=>{events.push('start:'+l.name);await new Promise(r=>setTimeout(r,1));if(mode==='cancel'){const e=Error();e.code='MEAXURE_EXPORT_CANCELLED';throw e;}if(mode==='skip')throw Error('bad layer');events.push('end:'+l.name)})();}},
        './slice':{clearSliceCache(){},getCollectedSlices:()=>[],getCollectedDownloadSources:()=>({})},'./mask':{clearMaskStack(){}},'./tint':{clearTintStack(){}},'./colors':{getDocumentColors:()=>[]},
        './activity':{beginExportActivity:()=>()=>{}},'./projectionHost':{closeProjectionHost(){}},'./tempLayers':{tempLayers:{removeAll(){events.push('cleanup')}}},'./layers':{LayerPlaceholder:class{}},'./projectedSource':{clearProjectedSourceCache(){}},
        './layerStates':{clearLayerStateCache(){}},'./nativeRequest':{clearNativeExportRequestCache(){}},'sketch/async':{createFiber:()=>({cleanup(){events.push('fiber')}})},
    };
    const sessionCode=ts.transpileModule(fs.readFileSync('src/meaxure/export/session.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
    const sb={exports:{},setTimeout,require:n=>{if(n==='./layerStates')return {clearLayerStateCache(){}};assert.strictEqual(n,'../../../package.json');return require('../package.json');}};vm.runInNewContext(sessionCode,sb);imports['./session']=sb.exports;
    const box={exports:{},require:n=>{assert(n in imports,'unmocked '+n);return imports[n]},NSString:{stringWithContentsOfFile_encoding_error:()=>''},nil:null};
    vm.runInNewContext(code,box);await box.exports.exportSpecification();assert.strictEqual(flag,false);
    if(mode==='dismiss'){assert.deepStrictEqual(events,[]);return;}
    assert.strictEqual(diagnostics.at(-1).build,require('../package.json').version);
    assert.deepStrictEqual(events.slice(-4),['cleanup','flag:false','close','fiber']);
    assert.strictEqual(diagnostics.at(-1).status,mode.endsWith('cancel')?'cancelled':mode.endsWith('skip')?'complete-with-warnings':'complete');
    if(mode==='complete'||mode==='sync')assert(events.indexOf('end:one')<events.indexOf('start:two') && events.indexOf('end:two')<events.indexOf('preview'));
    if(mode.endsWith('cancel'))assert(!events.includes('start:two') && !events.includes('preview'));
    if(mode.endsWith('skip'))assert.strictEqual(diagnostics.at(-1).warnings.length,2);
}
(async()=>{for(const mode of ['complete','cancel','skip','dismiss','sync','sync-skip','sync-cancel'])await scenario(mode);console.log('PASS: async export order, cancellation propagation, warning diagnostics, cleanup, dismissed panel isolation');})().catch(e=>{console.error(e);process.exitCode=1});
