import { LayerData } from "../../../src/meaxure/interfaces";
import { project } from "../../common";
import { platforms, scales, preferences, dimensions, Platform } from "../../download/model";
import { SMDownloadSource } from "../../../src/meaxure/interfaces";
import { propertyType } from "./shared";
export function renderExportable(layerData: LayerData): string {
    if (!layerData.exportable || !layerData.exportable.length)
        return '';
    const sourceID=layerData.exportable.map(item=>item.sourceID).find(id=>id && project.downloadSources && project.downloadSources[id]);
    if(sourceID) return propertyType('EXPORTABLE',renderAssetControls(sourceID,project.downloadSources[sourceID]));
    var expHTML = [], path = 'assets/';
    expHTML.push('<ul class="exportable">');
    layerData.exportable.forEach(exportable => {
        var filePath = path + exportable.path;
        expHTML.push(
            '<li>',
            '<a href="' + filePath + '" target="_blank" data-format="' + exportable.format.toUpperCase() + '" data-download="' + exportable.path + '">',
            '<img src="' + filePath + '" alt="' + exportable.path + '">',
            exportable.path.replace('drawable-', ''),
            '</a>',
            '</li>'
        );
    });
    expHTML.push('</ul>');
    expHTML.push('<p class="exportable-hint">按(option)或(alt)点击即可下载；重新导出标注可选择平台、格式和倍数</p>');
    return propertyType('EXPORTABLE', expHTML.join(''));
}

function escape(value:string):string {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function renderAssetControls(id:string,source:SMDownloadSource):string {
    const p=preferences.platform;
    const format=source.format==='png'&&preferences.format==='svg'?'png':preferences.format;
    const isSVG=format==='svg';
    const rows=scales[p].map(item=>{
        let text='',disabled=isSVG;
        try {const size=dimensions(source,item.scale);text=size.width+' × '+size.height+' px';}
        catch(error) {disabled=true;text='尺寸过大';}
        if(source.maxScale && item.scale>source.maxScale) {disabled=true;text='超出素材精度';}
        return '<label class="asset-scale"><span><input type="checkbox" value="'+item.scale+'" '+
            (preferences.selected[p].includes(item.scale)&&!disabled?'checked ':'')+(disabled?'disabled ':'')+'>'+platforms[p]+' '+item.label+'</span><small>'+text+'</small></label>';
    }).join('');
    return '<div class="asset-export" data-source-id="'+escape(id)+'">'+
        '<div class="asset-preview"><img src="'+source.dataURL+'" alt="切图预览"></div>'+
        '<label class="asset-setting">平台<select class="asset-platform" aria-label="切图平台">'+
        (Object.keys(platforms) as Platform[]).map(key=>'<option value="'+key+'" '+(key===p?'selected':'')+'>'+platforms[key]+'</option>').join('')+'</select></label>'+
        '<fieldset class="asset-scales" '+(isSVG?'hidden disabled':'')+'><legend>下载尺寸</legend>'+rows+'</fieldset>'+
        '<label class="asset-setting">切图格式<select class="asset-format" aria-label="切图格式">'+
        ['png','webp','svg','jpg'].map(f=>'<option value="'+f+'" '+(f===format?'selected ':'')+(f==='svg'&&source.format!=='svg'?'disabled ':'')+'>'+(f==='webp'?'WebP':f.toUpperCase())+'</option>').join('')+'</select></label>'+
        '<p class="asset-help">'+(isSVG?'SVG 固定使用 1x 尺寸'+(source.containsBitmap?'，素材含位图内容。':'。'):format==='jpg'?'JPG 使用白色底色。':source.containsBitmap?'素材含位图，放大清晰度受原图限制。':'透明背景 · 根据所选倍数生成')+'</p>'+
        '<button type="button" class="asset-download">下载当前切图</button>'+
        '<p class="asset-status" role="status" aria-live="polite">'+(isSVG?'下载单个 SVG 文件':'多选尺寸将打包为 ZIP')+'</p></div>';
}
