const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const loaded=[],drawn=[];
const svgURL='data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64');
const pngURL='data:image/png;base64,'+Buffer.from('native pixels').toString('base64');
let parsedSVG;
const box={exports:{},require:()=>({dimensions:(source,scale)=>({width:source.width*scale,height:source.height*scale})}),
    Blob,Uint8Array,TextDecoder,setTimeout,clearTimeout,atob,
    Image:class {set src(url){loaded.push(url);this.onload();}},
    DOMParser:class {parseFromString(svg){parsedSVG=svg;return {querySelector:()=>null,documentElement:{setAttribute(){}}};}},
    XMLSerializer:class {serializeToString(){return parsedSVG;}},
    document:{createElement:()=>({getContext:()=>({drawImage:(...args)=>drawn.push(args),fillRect(){}}),toBlob:callback=>callback(new Blob(['pixels'],{type:'image/png'}))})}
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('ui/download/encode.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}
}).outputText,box);
(async()=>{
    const source={width:20,height:30,format:'png',dataURL:pngURL,svgDataURL:svgURL,maxScale:4};
    await box.exports.encodeAsset(source,3,'png');
    assert.deepStrictEqual(loaded,[pngURL],'raster encoding must never load the SVG');
    assert.deepStrictEqual(drawn[0].slice(1),[0,0,60,90]);
    const svg=await box.exports.encodeAsset({...source,maxScale:0.5},1,'svg');
    assert.strictEqual(await svg.text(),'<svg/>','SVG must use its separate source without a raster scale limit');
    await assert.rejects(box.exports.encodeAsset(source,5,'png'),/4x/);
    await assert.rejects(box.exports.encodeAsset({...source,svgDataURL:undefined},1,'svg'),/SVG/);
    await box.exports.encodeAsset({...source,format:'svg',dataURL:svgURL,svgDataURL:undefined},1,'svg');
    console.log('PASS: bitmap encoding uses native PNG, separate SVG remains available, old sources and scale limits are supported');
})().catch(error=>{console.error(error);process.exitCode=1;});
