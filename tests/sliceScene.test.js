const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
let clone,removed=0,fail=false;const images=[];
const formats=[{size:'2x',fileFormat:'png',suffix:'@2x'},{size:'3x',fileFormat:'png',suffix:'@3x'}];
const sourceBoard={id:'original'};const layer={id:'projected',name:'icon',type:'Slice',frame:{width:24,height:24},__meaxureProjectedRect:{x:30,y:40,width:24,height:24},exportFormats:formats,hidden:false,sketchObject:{copy:()=>{clone={id:'copy',exportFormats:formats};return clone}}};
const imports={'../../sketch':{sketch:{Types:{Slice:'Slice'},Slice:class{constructor(o){Object.assign(this,o);this.id='copy';clone=this;}},Rectangle:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height})}}}},'./projectionHost':{releaseOrdinarySliceRenderLayer(){},getProjectionRenderLayer:()=>{clone={id:'copy',parent:sourceBoard,frame:layer.frame,exportFormats:formats};return clone}},'./tempLayers':{tempLayers:{add:(l,h)=>{assert.strictEqual(h,false)},remove:()=>removed++}},'.':{assetsPath:'/tmp/mock'},'../common/context':{context:{configs:{resolution:1}}},'./projectedSource':{getProjectedSourceLayer:()=>undefined},'../../sketch/compat':{wrapLayer:o=>o,hasNativeMethod:(o,k)=>!!o&&typeof o[k]==='function'},'./nativeRequest':{getNativeExportRequestAt:l=>({rect:()=>l===layer?{origin:{x:30,y:40},size:{width:24,height:24}}:{origin:{x:999,y:999},size:{width:24,height:24}},shouldTrim:()=>false})},'./files':{exportImage:(l,f,p,n,opts)=>{images.push({l,f,opts});if(fail)throw Error('failed')}}};
const code=ts.transpileModule(fs.readFileSync('src/meaxure/export/slice.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;const box={exports:{},require:n=>imports[n],NSFileManager:{defaultManager:()=>({createDirectoryAtPath_withIntermediateDirectories_attributes_error(){}})},nil:null};vm.runInNewContext(code,box);const data={rect:layer.__meaxureProjectedRect};box.exports.getSlice(layer,data);
assert.strictEqual(clone.parent,sourceBoard);assert.deepStrictEqual(Array.from(clone.exportFormats,f=>f.size),['2x','3x']);assert(images.every(x=>x.l===clone&&x.opts.requestRect.x===999&&x.opts.requestRect.y===999));assert.strictEqual(data.objectID,'projected');assert.strictEqual(images[1].f.size,'3x');
box.exports.clearSliceCache();fail=true;assert.throws(()=>box.exports.getSlice(layer,{rect:data.rect}));
console.log('PASS: Slice renders original scene with projected region and 2x/3x formats, identity preserved, errors propagate to scoped cleanup');

// Master frame coordinates are local, whereas native crops include the board
// offset. The old source translation pushed this crop to an empty scene area.
const sourceParent={frame:{x:20,y:30,width:80,height:80}};
const source={frame:{x:4,y:6,width:24,height:24},parent:sourceParent};
const projected={frame:{x:8,y:12,width:48,height:48},parent:{frame:{x:100,y:100,width:160,height:160},__meaxureProjectedRect:{x:100,y:100,width:160,height:160}}};
imports['./projectedSource'].getLayerFrameRect=l=>l&&l.frame;
imports['./projectedSource'].getProjectedSourceLayer=()=>source;
const reads=[];
imports['./nativeRequest'].getNativeExportRequestAt=(l,i)=>{
    reads.push({l,i});
    return {rect:()=>l===source?{x:1024,y:2036,width:24,height:24}:{x:1108,y:2112,width:48,height:48},shouldTrim:()=>false};
};
for(const i of [0,1]) {
    const options=box.exports.getSliceNativeExportOptions(projected,source,i);
    assert.deepStrictEqual({...options.requestRect},{x:1108,y:2112,width:48,height:48},'crop must retain native document coordinates and instance scale');
    assert.strictEqual(options.requestIndex,i);
}
assert(reads.every(r=>r.l===projected),'resolved request must not be replaced by a master request');
console.log('PASS: nonzero board/master offsets and resized instances preserve native crop coordinates across scales');

box.exports.clearSliceCache();
fail=false;
const beforeTransparent=images.length;
const invisible={id:'invisible-instance',style:{opacity:0}};
box.exports.getSlice({...layer,id:'invisible-slice',parent:invisible},{rect:data.rect});
assert.strictEqual(images.length,beforeTransparent,'transparent descendants must not overwrite visible assets');
assert.strictEqual(box.exports.getCollectedSlices().length,0,'blank slices must not enter the asset index');
invisible.style.opacity=0.5;
box.exports.getSlice({...layer,id:'dimmed-slice',parent:invisible},{rect:data.rect});
assert.strictEqual(images.length,beforeTransparent+2,'partial opacity must still export');
console.log('PASS: fully transparent ancestors cannot overwrite same-named assets; partial opacity is preserved');

// Raster downloads and previews use native PNG pixels even when SVG succeeds.
// Actual PNG crop dimensions, rather than the SVG viewBox, define logical 1x.
imports['../common/context'].context.configs.resolution=2;
const sourceFormats=[];
let failHighResolution=false,failSVG=false;
imports['./files'].exportImageToBuffer=(layer,format)=>{
    sourceFormats.push(format);
    if(format.format==='png') {
        if(failHighResolution && format.scale===2) throw Error('too large');
        const png=Buffer.alloc(24);
        Buffer.from('89504e470d0a1a0a','hex').copy(png);
        png.writeUInt32BE(40*format.scale,16);png.writeUInt32BE(40*format.scale,20);
        return png;
    }
    if(failSVG) throw Error('SVG unavailable');
    return Buffer.from('<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h40v40z"/></svg>');
};
box.exports.clearSliceCache();
const customData={rect:data.rect};
box.exports.getSlice(layer,customData);
const sourceID=customData.exportable[0].sourceID;
const downloadSource=box.exports.getCollectedDownloadSources()[sourceID];
assert.strictEqual(downloadSource.width,20);
assert.strictEqual(downloadSource.height,20);
assert.strictEqual(downloadSource.format,'png');
assert.strictEqual(downloadSource.maxScale,4);
assert.strictEqual(sourceFormats[0].format,'png');
assert.strictEqual(sourceFormats[0].scale,2);
assert.strictEqual(downloadSource.containsBitmap,false);
assert(downloadSource.dataURL.startsWith('data:image/png;base64,'));
assert(downloadSource.svgDataURL.startsWith('data:image/svg+xml;base64,'));
assert.strictEqual(customData.exportable[1].sourceID,sourceID);
box.exports.clearSliceCache();
assert.strictEqual(Object.keys(box.exports.getCollectedDownloadSources()).length,0);
failHighResolution=true;failSVG=true;
const fallbackData={rect:data.rect};
box.exports.getSlice(layer,fallbackData);
const fallback=box.exports.getCollectedDownloadSources()[fallbackData.exportable[0].sourceID];
assert.strictEqual(fallback.width,20);
assert.strictEqual(fallback.maxScale,1);
assert.strictEqual(fallback.format,'png');
assert.strictEqual(fallback.svgDataURL,undefined);
console.log('PASS: native PNG is primary even with SVG available; crop dimensions, optional SVG, 1x fallback and cleanup are preserved');
