const assert = require('assert'), fs = require('fs'), vm = require('vm'), ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/meaxure/export/textFragment.ts','utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}
}).outputText;
let output = [], removed = 0;
class Rectangle {
    constructor(x,y,width,height) { Object.assign(this,{x,y,width,height}); }
    changeBasis({from,to}) {
        let x=this.x,y=this.y;
        for(let p=from;p && p!==to;p=p.parent){x+=p.frame.x;y+=p.frame.y;}
        return new Rectangle(x,y,this.width,this.height);
    }
}
class Group {
    constructor({parent}) {this.parent=parent;this.layers=[];this.frame=new Rectangle(0,0,0,0);if(parent)parent.layers.push(this);}
    adjustToFit() {}
    alignTo(target) {this.frame.x=target.x;this.frame.y=target.y;}
}
class Text {
    constructor({text,parent}) {this.type='Text';this.text=text;this.parent=parent;this.frame=new Rectangle(0,0,text==='999'?43:26,47);parent.layers.push(this);}
}
Text.Alignment={center:'center',right:'right'};Text.VerticalAlignment={top:'top',center:'center',bottom:'bottom'};
const sketch = {Types:{Text:'Text'},Text,Group,Rectangle,
    find:(_,g)=>g.layers.flatMap(l=>l instanceof Text?[l]:sketch.find(_,l))};
const box={exports:{},require:n=>{
    if(n==='../../sketch')return {sketch};
    if(n==='./projectionHost')return {getProjectionHost:b=>b};
    if(n==='./tempLayers')return {tempLayers:{add(){},remove(){removed++;}}};
    if(n==='../../sketch/layer/alignment')return {Edge:{},EdgeVertical:{}};
    if(n==='./layerData')return {getLayerData:async(_,l)=>output.push({text:l.text,rect:l.__meaxureProjectedRect,lineHeight:l.style.lineHeight})};
    return {};
}};
vm.runInNewContext(code,box);
(async()=>{
    const getTextFragment=box.exports.getTextFragment;
    assert.strictEqual(getTextFragment({}, {type:'Shape'}, {}), undefined);
    assert.strictEqual(getTextFragment({}, {type:'Text',getFragmentsCount:()=>1}, {}), undefined);
    assert.strictEqual(getTextFragment({}, {type:'Text',__meaxureFragmentText:true}, {}), undefined);
    for(const lineHeight of [null,40]) {
        output=[];
        const host={layers:[]};
        const layer={type:'Text',parent:host,frame:new Rectangle(84,862,69,37),
            style:{lineHeight,verticalAlignment:'top'},getFragmentsCount:()=>2,
            getFragments:()=>['999','股'].map(text=>({text,defaultLineHeight:47,style:{fills:[],textColor:'#333333FF'}}))};
        await box.exports.getTextFragment(host,layer,{layers:[]});
        assert.strictEqual(output.length,2);
        assert(output.every(l=>l.rect.height===37 && l.rect.y===862), 'saved 37px container must survive a reconstructed 47px default height');
        assert(output.every(l=>l.lineHeight===lineHeight), 'preserve automatic or explicit source line height');
        assert.strictEqual(output[0].rect.x,84);assert.strictEqual(output[1].rect.x,127);
    }
    assert.strictEqual(removed,2,'temporary fragment groups are released');
    console.log('PASS: mixed-font fragments preserve 37px design height, position and source line height');
})().catch(e=>{console.error(e);process.exitCode=1;});
