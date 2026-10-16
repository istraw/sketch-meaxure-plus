const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const Types={Slice:'Slice',Group:'Group',Artboard:'Artboard',Page:'Page'};
let serial=0;const owned=new Set();
function node(name,type='Group',parent) {
    const l={id:String(++serial),name,type,parent,layers:[],hidden:false,background:{enabled:true,includedInExport:true},
        remove(){if(this.parent)this.parent.layers=this.parent.layers.filter(c=>c!==this);},
        getParentArtboard(){for(let p=this.parent;p;p=p.parent)if(p.type===Types.Artboard)return p;}};
    if(parent)parent.layers.push(l);
    l.sketchObject={copy(){
        function clone(original,parent){const c=node(original.name,original.type,parent);c.fill=original.fill;original.layers.forEach(child=>clone(child,c));return c;}
        return clone(l);
    }};
    return l;
}
const page=node('scratch','Page'),doc={pages:[page],close(){}};
const native={documentData:()=>({sharedObjectContainerOfType:()=>({addSharedObjects(){}}),sharedSwatches:()=>({addSharedObjects(){}})})};
const source=node('source','Artboard');source.frame={x:100,y:200,width:750,height:1624};
const imports={
    '../../sketch':{sketch:{Types,Artboard:class{constructor(o){const l=node(o.name,'Artboard',o.parent);l.frame=o.frame;return l;}},Rectangle:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}}}},
    '../../sketch/compat':{wrapDocument:()=>doc,wrapLayer:l=>l,getChildLayers:l=>l.layers.slice()},
    '../common/context':{context:{document:{colorSpace:'SRGB',sharedLayerStyles:[],sharedTextStyles:[],sketchObject:{fileType:()=>'',documentData:()=>({sharedSwatches:()=>({objects:()=>({count:()=>0})})})}}}},
    '../common/logger':{logger:{log(){}}},
    './tempLayers':{tempLayers:{add(l,hidden=true){owned.add(l);l.hidden=hidden;},exists:l=>owned.has(l),remove(l){owned.delete(l);l.remove();}}}
};
const box={exports:{},require:n=>imports[n],MOPointer:{alloc:()=>({init:()=>({value:()=>null})})},NSDocumentController:{sharedDocumentController:()=>({makeUntitledDocumentOfType_error:()=>native})}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/meaxure/export/projectionHost.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText,box);
const api=box.exports,host=api.getProjectionHost(source);
assert.strictEqual(host.background.enabled,false);assert.strictEqual(host.background.includedInExport,false);
const root=node('navigation','Group',host);owned.add(root);root.hidden=true;
node('unrelated white navigation background','Group',root).fill='#FFFFFF';
const icon=node('icon container','Group',root);node('intentional white icon detail','Group',icon).fill='#FFFFFF';
node('arrow','Group',icon).fill='#333333';const slice=node('refresh','Slice',icon);
const other=node('other icon','Group',root);node('blue','Group',other).fill='#0088FF';const second=node('second','Slice',other);
const whole=api.getProjectionRenderLayer(icon);const wholeRoot=whole.parent;
assert.strictEqual(wholeRoot.layers.length,3);
const rendered=api.getProjectionRenderLayer(slice),scene=rendered.parent.parent;
assert.strictEqual(scene.layers.length,1,'exclude backgrounds outside the containing group');
assert.strictEqual(rendered.parent.layers.length,3,'preserve all local artwork, including white fills');
assert.strictEqual(rendered.parent.layers[0].fill,'#FFFFFF');
assert.strictEqual(wholeRoot.hidden,true,'a previous full scene must not bleed into a scoped slice');
assert.strictEqual(scene.hidden,false);assert.strictEqual(root.layers.length,3,'source hierarchy stays intact');
const otherRendered=api.getProjectionRenderLayer(second);
assert.strictEqual(scene.hidden,true);assert.strictEqual(otherRendered.parent.parent.hidden,false);
assert.strictEqual(api.getProjectionRenderLayer(slice),rendered,'scopes reuse their render copy');
api.releaseProjectionRenderLayers(root);
assert.strictEqual(host.layers.length,1,'release all scene scopes with their owning projection');
// The same treatment applies to a regular slice, without retaining its scene.
const sourcePage=node('source page','Page'),ordinaryBoard=node('ordinary board','Group',sourcePage);ordinaryBoard.frame=source.frame;
const navigation=node('ordinary navigation','Group',ordinaryBoard);node('white bar','Group',navigation);
const ordinaryIcon=node('ordinary icon','Group',navigation);node('arrow','Group',ordinaryIcon);const ordinarySlice=node('ordinary slice','Slice',ordinaryIcon);
const isolated=api.getProjectionRenderLayer(ordinarySlice);assert.notStrictEqual(isolated,ordinarySlice);
assert.strictEqual(isolated.parent.parent.layers.length,1);const ordinaryScene=isolated.parent.parent;
api.releaseOrdinarySliceRenderLayer(ordinarySlice);assert(!ordinaryScene.parent.layers.includes(ordinaryScene));
assert.strictEqual(navigation.layers.length,2);api.closeProjectionHost();
console.log('PASS: nested slices exclude external backgrounds, retain white artwork and ancestry, isolate overlapping scenes, and clean ordinary/projected copies');
