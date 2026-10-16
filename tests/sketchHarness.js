// Run only against a disposable .sketch copy. Built by buildSketchHarness.js.
const { sketch } = require('../src/sketch');
const { updateContext } = require('../src/meaxure/common/context');
const runtime = require('../src/meaxure/export');
const { getLayerData } = require('../src/meaxure/export/layerData');
const { getChildrenForExport, LayerPlaceholder } = require('../src/meaxure/export/layers');
const { clearNativeExportRequestCache } = require('../src/meaxure/export/nativeRequest');
const { clearSliceCache, getCollectedDownloadSources } = require('../src/meaxure/export/slice');
const { clearMaskStack } = require('../src/meaxure/export/mask');
const { clearTintStack } = require('../src/meaxure/export/tint');
const { tempLayers } = require('../src/meaxure/export/tempLayers');
const { ExportSession, setExportSession, isExportCancelled } = require('../src/meaxure/export/session');
const { clearLayerStateCache } = require('../src/meaxure/export/layerStates');
const { closeProjectionHost } = require('../src/meaxure/export/projectionHost');
const { beginExportActivity } = require('../src/meaxure/export/activity');
const { exportImage, writeFile } = require('../src/meaxure/export/files');
exports.run = function (path, output, limit, options = {}) {
    const fiber = require('sketch/async').createFiber();
    const endActivity = beginExportActivity();
    const started = Date.now();
    function save(value) { writeFile({path: output, fileName:'harness-status.json', content:JSON.stringify(value,null,2)}); }
    save({stage:'opening'});
    sketch.Document.open(path, async function(error, document) {
        if (error) { save({error:String(error)}); endActivity(); fiber.cleanup(); return; }
        let session;
        let lastCancelCheck = 0;
        let cancelled = false;
        try {
            updateContext({document:document.sketchObject});
            runtime.assetsPath = output + '/assets';
            runtime.savePath = output;
            clearSliceCache();
            let count = 0;
            let outputCount = 0;
            const boardTimings = [];
            session = new ExportSession(() => {
                if (Date.now() - lastCancelCheck > 250) {
                    cancelled = require('../src/sketch/compat').fileExists(output + '/cancel');
                    lastCancelCheck = Date.now();
                }
                return cancelled;
            }, s => save({stage:'processing', count, ...s.summary('running')}));
            setExportSession(session);
            const page = document.pages.find(p => p.name === '页面 1') || document.pages[0];
            let allBoards = page.layers.filter(l => l.type === sketch.Types.Artboard || l.type === sketch.Types.Group);
            if (options.boardID) allBoards = allBoards.filter(l => l.id === options.boardID);
            if (options.boardIDs) allBoards = allBoards.filter(l => options.boardIDs.includes(l.id));
            if (options.firstRows) {
                const rows = Array.from(new Set(allBoards.map(b => b.frame.y))).sort((a,b)=>a-b).slice(0, options.firstRows);
                allBoards = allBoards.filter(b => rows.includes(b.frame.y)).sort((a,b)=>a.frame.y-b.frame.y || a.frame.x-b.frame.x);
            }
            const boards = allBoards.slice(options.startBoard || 0, options.boardCount ? (options.startBoard || 0) + options.boardCount : undefined);
            save({stage:'enumerating',boards:boards.length});
            for (const artboard of boards) {
                const boardStarted = Date.now();
                const sourceRootCount = artboard.layers.length;
                clearMaskStack();clearTintStack();
                const data = {layers:[],notes:[]};
                const [layers] = getChildrenForExport(artboard);
                for (const layer of layers) {
                    if (limit && count >= limit) break;
                    clearNativeExportRequestCache();
                    save({stage:'layer', count, id:layer.id, name:layer.name, type:layer.type, elapsedMs:Date.now()-started});
                    const pending = getLayerData(artboard,layer,data,!!options.byInfluence);
                    if (pending) await pending;
                    count++;

                }
                outputCount += data.layers.length;
                writeFile({path:output,fileName:'data-'+artboard.id+'.json',content:JSON.stringify(data)});
                if (limit && count >= limit) break;
                if (!options.skipImages) exportImage(artboard,{format:'png',scale:options.previewScale || 0.25},output+'/preview',artboard.id);
                boardTimings.push({id:artboard.id,name:artboard.name,milliseconds:Date.now()-boardStarted,sourceRootCount,finalSourceRootCount:artboard.layers.length,records:data.layers.length});
                clearNativeExportRequestCache();clearMaskStack();clearTintStack();clearLayerStateCache();
            }
            writeFile({path:output,fileName:'download-sources.json',content:JSON.stringify(getCollectedDownloadSources())});
            save({stage:'complete',count,outputCount,...session.summary('complete'),totalMs:Date.now()-started,boardTimings});
        } catch(error) { const status=isExportCancelled(error)?'cancelled':'failed'; save({stage:status,error:String(error),stack:error.stack, ...(session ? session.summary(status) : {})}); }
        finally { setExportSession();clearLayerStateCache();clearNativeExportRequestCache();tempLayers.removeAll();closeProjectionHost();document.close();endActivity();fiber.cleanup(); }
    });
};
