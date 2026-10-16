import { SMDownloadSource } from '../../src/meaxure/interfaces';
export type Platform = 'ios' | 'android' | 'web';
export type AssetFormat = 'png' | 'webp' | 'svg' | 'jpg';
export const platforms = {ios:'iOS',android:'Android',web:'Web'};
export const scales = {
    ios:[{scale:1,label:'@1x'},{scale:2,label:'@2x'},{scale:3,label:'@3x'}],
    android:[{scale:1,label:'mdpi'},{scale:1.5,label:'hdpi'},{scale:2,label:'xhdpi'},{scale:3,label:'xxhdpi'},{scale:4,label:'xxxhdpi'}],
    web:[{scale:1,label:'@1x'},{scale:2,label:'@2x'},{scale:3,label:'@3x'}],
};
export const preferences: {platform:Platform;format:AssetFormat;selected:{[platform:string]:number[]}} = {
    platform:'ios',format:'png',selected:{ios:[1,2,3],android:[1,1.5,2,3,4],web:[1,2,3]},
};
export function downloadScales(format:AssetFormat,selected:number[]):number[] {
    return format==='svg'?[1]:selected;
}
export function dimensions(source: SMDownloadSource, scale: number) {
    const width=Math.max(1,Math.round(source.width*scale));
    const height=Math.max(1,Math.round(source.height*scale));
    if (!isFinite(width) || !isFinite(height) || width*height>64000000 || width>16384 || height>16384) throw new Error('尺寸过大，请选择较小倍数');
    return {width,height};
}
export function filename(name:string, platform:Platform, scale:number, format:AssetFormat):string {
    name = name.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/^\.+/,'').trim() || 'asset';
    if(format==='svg') return name+'.svg';
    if(platform==='android') {
        name=name.toLowerCase().replace(/[^a-z0-9_]/g,'_');
        if(!/^[a-z]/.test(name)) name='asset_'+name;
        const density=scales.android.find(item=>item.scale===scale);
        if(!density) throw new Error('不支持的 Android 密度');
        return 'drawable-'+density.label+'/'+name+'.'+format;
    }
    return name+(scale===1?'':'@'+scale+'x')+'.'+format;
}
