const assert=require('assert'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(file,imports,globals={}) {
    const box={exports:{},require:name=>{assert(name in imports,name);return imports[name]},...globals};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
        compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}
    }).outputText,box);
    return box.exports;
}
let system='zh-Hans-CN',documentLanguage='en',documentOpen=true;
const language=load('src/meaxure/common/language.ts',{
    '../helpers/helper':{getResourcePath:()=> 'resources'},
    '../../sketch':{sketch:{Settings:{documentSettingForKey:()=>documentLanguage}}}
},{
    NSUserDefaults:{standardUserDefaults:()=>({objectForKey:()=>({count:()=>system?1:0,objectAtIndex:()=>system})})},
    NSDocumentController:{sharedDocumentController:()=>({currentDocument:()=>documentOpen?{}:null})},
    NSFileManager:{defaultManager:()=>({fileExistsAtPath:fs.existsSync})},
    NSString:{stringWithContentsOfFile_encoding_error:path=>fs.readFileSync(path,'utf8')},nil:null
});
function menu(items){return {numberOfItems:()=>items.length,itemAtIndex:i=>items[i]};}
function item(title,children) {return {value:title,title(){return this.value;},setTitle(value){this.value=value;},submenu:()=>children};}
const toolbar=item('Toolbar'),settings=item('Settings'),exportItem=item('Spec Export');
const home=item('Home'),help=item('Help',menu([home]));
const plugin=item('Sketch MeaXure Plus ',menu([toolbar,settings,exportItem,help]));
const oldExport=item('Spec Export');
const legacy=item('Sketch MeaXure',menu([oldExport]));
const main=menu([legacy,item('Plugins',menu([plugin]))]);
const menus=load('src/meaxure/common/menuLocalization.ts',{'./language':language},{NSApp:{mainMenu:()=>main}});
assert.strictEqual(language.getLangCode(),'en','document language still controls exports');
menus.localizePluginMenu();
assert.strictEqual(toolbar.value,'工具栏');
assert.strictEqual(exportItem.value,'导出标注');
assert.strictEqual(settings.value,'设置');
assert.strictEqual(home.value,'主页');
assert.strictEqual(oldExport.value,'Spec Export','other installed plugins must remain untouched');
system='en-US';documentLanguage='zh-cn';
menus.localizePluginMenu();
assert.strictEqual(toolbar.value,'Toolbar','translated toolbar must switch back');
assert.strictEqual(exportItem.value,'Spec Export');
assert.strictEqual(help.value,'Help');
assert.strictEqual(language.getLangCode(),'zh-cn');
documentOpen=false;
for(const [code,expected] of [['zh_CN','zh-cn'],['zh-SG','zh-cn'],['zh-Hant-HK','zh-tw'],['zh-TW','zh-tw'],['en-GB','en'],['fr-FR','en'],['','en']]) {
    system=code;
    assert.strictEqual(language.getSystemLangCode(),expected,code);
    menus.localizePluginMenu();
    assert.strictEqual(exportItem.value,language.localizeSystem('Spec Export'));
}
const manifest=JSON.parse(fs.readFileSync('src/manifest.json','utf8'));
const actions=manifest.commands.find(c=>c.identifier==='commandInit').handlers.actions;
assert.strictEqual(actions.Startup,'commandInit');
assert.strictEqual(actions.OpenDocument,'commandInit');
assert.strictEqual(manifest.commands.find(c=>c.identifier==='commandInit').scope,'application');
// Startup can run before NSMenuItems exist. The command models and menu
// description must already be localized for every subsequent menu rebuild.
const commandModels=['Toolbar','Spec Export','Settings'].map(value=>({
    value,name(){return this.value;},setValue_forKey(value,key){assert.strictEqual(key,'name');this.value=value;}
}));
const pluginModel={
    description:{title:'Sketch MeaXure Plus',items:['commandToolbar',{title:'Help',items:['linkHome']}]},
    commands:()=>({allValues:()=>({count:()=>commandModels.length,objectAtIndex:i=>commandModels[i]})}),
    menuDescription(){return this.description;},setMenuDescription(value){this.description=value;}
};
const startupMenus=load('src/meaxure/common/menuLocalization.ts',{'./language':language},{
    NSApp:{mainMenu:()=>null},nil:null,
    NSJSONSerialization:{dataWithJSONObject_options_error:JSON.stringify},
    NSString:{alloc:()=>({initWithData_encoding:data=>data})}
});
system='zh-Hans-CN';
startupMenus.localizePluginMenu(pluginModel);
assert.deepStrictEqual(commandModels.map(c=>c.value),['工具栏','导出标注','设置']);
assert.strictEqual(pluginModel.description.items[1].title,'帮助');
system='en-US';
startupMenus.localizePluginMenu(pluginModel);
assert.deepStrictEqual(commandModels.map(c=>c.value),['Toolbar','Spec Export','Settings']);
assert.strictEqual(pluginModel.description.items[1].title,'Help');
// Rebuilding menu items must use translated definitions even before a document
// or a live application menu exists.
system='zh-Hans-CN';
startupMenus.localizePluginMenu(pluginModel);
for(let rebuild=0;rebuild<3;rebuild++) {
    const rebuilt=commandModels.map(c=>item(c.name()));
    assert.deepStrictEqual(rebuilt.map(i=>i.value),['工具栏','导出标注','设置']);
}
assert.strictEqual(manifest.commands.find(c=>c.identifier==='commandInit').handlers.run,'commandInit');
const indexImports={};
for(const match of fs.readFileSync('src/index.ts','utf8').matchAll(/from ["']([^"']+)["']/g)) indexImports[match[1]]={};
let initializedPlugin;
indexImports['./meaxure/common/menuLocalization']={localizePluginMenu:p=>{initializedPlugin=p;}};
indexImports['./meaxure/common/context']={updateContext:()=>{throw new Error('Startup must work without a document');}};
const commands=load('src/index.ts',indexImports);
for(const ctx of [{plugin:pluginModel},{command:{pluginBundle:()=>pluginModel}}]) {
    initializedPlugin=undefined;
    assert.strictEqual(commands.commandInit(ctx),false);
    assert.strictEqual(initializedPlugin,pluginModel);
}
// Persisted definitions must survive a full bundle reload and switch back
// when the system language changes. Unchanged startup must not rewrite the file.
let disk=JSON.stringify(manifest),writes=0;
pluginModel.url=()=>({path:()=>'/installed/plugin.sketchplugin'});
const persistentMenus=load('src/meaxure/common/menuLocalization.ts',{'./language':language},{
    NSApp:{mainMenu:()=>null},nil:null,
    NSJSONSerialization:{dataWithJSONObject_options_error:JSON.stringify},
    NSString:{
        alloc:()=>({initWithData_encoding:data=>data}),
        stringWithContentsOfFile_encoding_error:()=>disk,
        stringWithString:content=>({writeToFile_atomically_encoding_error(){disk=content;writes++;return true;}})
    }
});
system='zh-Hans-CN';
persistentMenus.localizePluginMenu(pluginModel);
assert.strictEqual(JSON.parse(disk).commands[0].name,'工具栏');
assert.strictEqual(JSON.parse(disk).menu.items.slice(-1)[0].title,'帮助');
assert.strictEqual(writes,1);
persistentMenus.localizePluginMenu(pluginModel);
assert.strictEqual(writes,1,'unchanged initialization must not trigger reload loops');
system='en-US';
persistentMenus.localizePluginMenu(pluginModel);
assert.strictEqual(JSON.parse(disk).commands[0].name,'Toolbar');
assert.strictEqual(JSON.parse(disk).menu.items.slice(-1)[0].title,'Help');
assert.strictEqual(writes,2);
assert.strictEqual(JSON.parse(disk).commands[0].identifier,manifest.commands[0].identifier);
assert.strictEqual(JSON.parse(disk).commands[0].shortcut,manifest.commands[0].shortcut);
console.log('PASS: menu follows system language across startup and bundle reloads; document settings and other plugins remain independent');
