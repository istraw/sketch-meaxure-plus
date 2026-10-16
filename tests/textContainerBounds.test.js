const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const source=fs.readFileSync('src/meaxure/export/layerData.ts','utf8')+'\nexport {getSMRect,getDisplayRect};';
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2015}}).outputText;
class Rectangle {constructor(x,y,width,height){Object.assign(this,{x,y,width,height});} changeBasis(){return this;}}
const box={exports:{},require:n=>n==='../../sketch'?{sketch:{Types:{Text:'Text'},Rectangle}}:{}};
vm.runInNewContext(code,box);
for(const content of ['可买','可用','其他文字']) {
    for(const lineHeight of [32,null]) {
        const frame=new Rectangle(24,762,52,32);
        const text={type:'Text',text:content,frame,style:{lineHeight,fontSize:26},
            sketchObject:{glyphBounds(){throw Error('annotation must not measure ink');}}};
        const rect=box.exports.getSMRect(text,{},true);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(rect)),{x:24,y:762,width:52,height:32});
        assert.strictEqual(box.exports.getDisplayRect(text,{},rect),rect,'viewer box must match the exported dimensions');
        text.__meaxureProjectedRect={x:124,y:862,width:52,height:32};
        const projected=box.exports.getSMRect(text,{},false);
        assert.deepStrictEqual(JSON.parse(JSON.stringify(projected)),text.__meaxureProjectedRect);
        assert.strictEqual(box.exports.getDisplayRect(text,{},projected),projected,'projected symbol text must preserve its box too');
    }
}
console.log('PASS: 32px text containers preserved with explicit/automatic line heights and projected viewer boxes');
