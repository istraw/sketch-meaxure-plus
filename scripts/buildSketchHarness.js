const webpack = require('webpack');
const path = require('path');
webpack({
    mode:'development',devtool:false,target:'web',entry:path.resolve('tests/sketchHarness.js'),
    output:{path:'/tmp/meaxure-performance',filename:'harness.js',library:'MeaxureHarness',libraryTarget:'var'},
    resolve:{extensions:['.js','.ts']},
    module:{rules:[{test:/\.ts$/,use:{loader:'ts-loader',options:{transpileOnly:true}}}]},
    externals:[function(context,request,cb){if (/^sketch($|\/)/.test(request))return cb(null,'commonjs '+request);cb();}],
},(error,stats)=>{if(error||stats.hasErrors()){console.error(error||stats.toString({all:false,errors:true}));process.exitCode=1;}else console.log('Built /tmp/meaxure-performance/harness.js');});
