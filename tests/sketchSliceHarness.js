// Run in Sketch's Run Script after bundling; creates and closes its own document.
const { sketch } = require('../src/sketch');
const { updateContext } = require('../src/meaxure/common/context');
const { getProjectionHost, getProjectionRenderLayer, closeProjectionHost } = require('../src/meaxure/export/projectionHost');
const { getSlice, clearSliceCache, getCollectedSlices, getSliceNativeExportOptions } = require('../src/meaxure/export/slice');
const { clearNativeExportRequestCache } = require('../src/meaxure/export/nativeRequest');
const { tempLayers } = require('../src/meaxure/export/tempLayers');
const { exportImage, writeFile } = require('../src/meaxure/export/files');
const runtime = require('../src/meaxure/export');
exports.run = function(output, options = {}) {
    let document;
    const results = [];
    try {
        document = new sketch.Document();
        updateContext({document: document.sketchObject});
        runtime.assetsPath = output;
        clearSliceCache();
        const Container = options.sourceGroup ? sketch.Group : sketch.Artboard;
        const board = new Container({parent:document.pages[0],frame:new sketch.Rectangle(1000,2000,300,300)});
        const master = new sketch.Group({parent:board,name:'master',frame:new sketch.Rectangle(20,30,80,80)});
        const formats = [{size:'2x',fileFormat:'png',suffix:'@2x'},{size:'3x',fileFormat:'png',suffix:'@3x'},{size:'1x',fileFormat:'svg'}];
        const source = new sketch.Slice({parent:master,name:'fixture',frame:new sketch.Rectangle(4,6,24,24),exportFormats:formats});
        const host = options.direct ? board : getProjectionHost(board);
        const root = new sketch.Group({parent:host,name:'projection',frame:new sketch.Rectangle(100,100,80,80)});
        tempLayers.add(root);
        new sketch.ShapePath({parent:root,frame:new sketch.Rectangle(4,6,24,24),style:{fills:['#FF0000']}});
        const slice = new sketch.Slice({parent:root,name:'fixture',frame:new sketch.Rectangle(4,6,24,24),exportFormats:formats});
        slice.__meaxureProjectedSourceID = source.id;
        slice.__meaxureProjectedRect = {x:104,y:106,width:24,height:24};
        getSlice(slice,{rect:slice.__meaxureProjectedRect});
        root.style.opacity = 0;
        clearSliceCache();
        getSlice(slice,{rect:slice.__meaxureProjectedRect});
        if (getCollectedSlices().length) throw new Error('Transparent instance entered slice index');
        root.style.opacity = 1;
        const render = getProjectionRenderLayer(slice);
        results.push({stage:'render',hidden:render.parent.hidden,options:getSliceNativeExportOptions(render, source)});
        // Control reproduces the former hidden-scene behavior.
        render.parent.hidden = true;
        clearNativeExportRequestCache();
        exportImage(render, formats[0], output, 'hidden-control', getSliceNativeExportOptions(render));
        render.parent.hidden = false;
        clearNativeExportRequestCache();
        exportImage(render, formats[0], output, 'visible-control', getSliceNativeExportOptions(render));
        // Control reproduces translating a document crop using a local master frame.
        const sourceOptions = getSliceNativeExportOptions(source);
        const wrongCrop = {...getSliceNativeExportOptions(render), requestRect:{
            x: 1104 + sourceOptions.requestRect.x - source.frame.x,
            y: 2106 + sourceOptions.requestRect.y - source.frame.y,
            width:24,height:24,
        }};
        exportImage(render, formats[0], output, 'offset-control', wrongCrop);
        results.push({stage:'complete'});
    } catch(error) { results.push({stage:'failed',error:String(error),stack:error.stack}); }
    finally {
        clearNativeExportRequestCache();
        tempLayers.removeAll();
        closeProjectionHost();
        if(document) document.close();
        writeFile({path:output,fileName:'result.json',content:JSON.stringify(results,null,2)});
    }
};
