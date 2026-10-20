const fs=require('fs'),vm=require('vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('ui/common.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}
}).outputText;
const box={exports:{},navigator:{language:'en-US'}};
vm.runInNewContext(code,box);
const common=box.exports;
const languages=Object.fromEntries(['en','zh-cn','zh-tw'].map(lang=>[lang,JSON.parse(fs.readFileSync('resources/i18n/'+lang+'.json','utf8'))]));
function setLanguage(language,extra={}) {common.init({language,languages,unit:'px',resolution:1,...extra});}
setLanguage('zh-cn');
module.exports={common,setLanguage,languages};
