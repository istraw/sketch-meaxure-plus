const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
for(const file of fs.readdirSync(path.resolve(__dirname,'../tests')).filter(f=>f.endsWith('.test.js'))){
    const r=spawnSync(process.execPath,[path.resolve(__dirname,'../tests',file)],{stdio:'inherit'});
    if(r.status!==0)process.exit(r.status||1);
}
