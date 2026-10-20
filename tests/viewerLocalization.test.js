const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const {common,setLanguage,languages}=require('./viewerLanguage');
function load(file,imports,extra={}) {
    const box={exports:{},require:name=>{assert(name in imports,name);return imports[name]},...extra};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
        compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}
    }).outputText,box);
    return box.exports;
}
const model=load('ui/download/model.ts',{'../common':common});
const asset=load('ui/render/inspector/exportable.ts',{'../../common':common,'../../download/model':model,'./shared':{propertyType:(_,html)=>html}});
const app={innerHTML:''};
const noop=()=>{};
const render=load('ui/render/index.ts',{
    '../common':common,'./artboards':{artboards:noop},'./slices':{slices:noop},'./colors':{colors:noop},
    './unit':{unit:noop},'./zoom':{zoom:noop},'../events':{events:noop},'../events/navigate':{navigateByURLHash:noop}
},{document:{querySelector:()=>app}});
const source={name:'icon',width:20,height:30,format:'png',dataURL:'data:image/png;base64,AA==',svgDataURL:'data:image/svg+xml;base64,AA==',maxScale:1,containsBitmap:false};
// Reuse the same modules across repeated language changes, including region codes.
for(const [code,english] of [['en-US',true],['zh-CN',false],['en',true],['zh-Hans',false]]) {
    const data={language:code,languages,unit:'px',downloadSources:{icon:source}};
    render.render(data);
    assert(app.innerHTML.includes(english?'Slice bounds':'切片范围'));
    for(const format of ['png','svg','jpg']) {
        model.preferences.format=format;
        for(const containsBitmap of [false,true]) {
            const html=asset.renderAssetControls('icon',{...source,containsBitmap});
            if(english) {
                assert(!/[\p{Script=Han}]/u.test(html),format+' must contain no hardcoded Chinese');
                assert(html.includes('Platform')&&html.includes('Download asset'));
            } else assert(html.includes('平台')&&html.includes('下载当前切图'));
        }
    }
    const legacy=asset.renderExportable({exportable:[{path:'icon.png',format:'png'}]});
    assert(legacy.includes(english?'Option/Alt-click':'按 Option'));
    assert.throws(()=>model.dimensions({width:99999,height:99999},4),english?/Choose a smaller scale/:/较小倍数/);
    assert.throws(()=>model.filename('icon','android',9,'png'),english?/Unsupported Android/:/Android 密度/);
    assert.strictEqual(common.localize('Generating %@x…',3),english?'Generating 3x…':'正在生成 3x…');
    assert.strictEqual(common.localize('Source supports up to %@x',4),english?'Source supports up to 4x':'素材源仅支持到 4x');
}
// Keep new interface strings in all supported dictionaries and out of TS literals.
for(const file of ['ui/render/index.ts','ui/render/inspector/exportable.ts','ui/download/model.ts','ui/download/encode.ts','ui/events/inspector.ts']) {
    const source=fs.readFileSync(file,'utf8');
    assert(!/[\p{Script=Han}]/u.test(source),file+' contains untranslated Chinese');
    for(const match of source.matchAll(/localize\(['"]([^'"]+)['"]/g)) {
        for(const lang of ['en','zh-cn','zh-tw']) {
            // Older labels use English fallback; new download labels must exist in all dictionaries.
            if(lang==='en'&&!languages.en[match[1]]) continue;
            assert(languages[lang][match[1]],lang+': '+match[1]);
        }
    }
}
console.log('PASS: repeated English/Chinese language changes update header, asset controls, help, legacy downloads and parameterized errors');
