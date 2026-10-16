// Native integration check for the complete spec writer on a disposable copy.
const { sketch } = require('../src/sketch');
const { updateContext } = require('../src/meaxure/common/context');
const panel = require('../src/meaxure/panels/exportPanel');
const webview = require('../src/webviewPanel');
const helpers = require('../src/meaxure/helpers/helper');
const { getChildrenForExport } = require('../src/meaxure/export/layers');
const { exportSpecification } = require('../src/meaxure/export');
exports.run = function(path, output, options) {
    const fiber = require('sketch/async').createFiber();
    sketch.Document.open(path, async function(error, document) {
        if(error) { console.error(error); fiber.cleanup(); return; }
        const oldPanel=panel.exportPanel,oldWebview=webview.createWebviewPanel,oldResource=helpers.getResourcePath;
        const oldSave=sketch.UI.savePanel,oldShow=sketch.UI.showFiles;
        try {
            updateContext({document:document.sketchObject});
            const ids=options.boardIDs || [options.boardID];
            let layersCount=0;
            const selection=ids.map(id=>{
                const artboard=document.getLayerWithID(id);
                const [children,count]=getChildrenForExport(artboard);
                layersCount+=count;
                return {artboard,children};
            });
            panel.exportPanel=async()=>({selection,layersCount,advancedMode:true,byInfluence:!!options.byInfluence});
            webview.createWebviewPanel=()=>undefined;
            helpers.getResourcePath=()=>options.resources;
            sketch.UI.savePanel=()=>output;
            sketch.UI.showFiles=()=>{};
            await exportSpecification();
        } catch(error) { console.error(String(error)); }
        finally {
            panel.exportPanel=oldPanel;webview.createWebviewPanel=oldWebview;helpers.getResourcePath=oldResource;
            sketch.UI.savePanel=oldSave;sketch.UI.showFiles=oldShow;
            document.close();fiber.cleanup();
        }
    });
};
