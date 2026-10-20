import { LayerData } from "../../../src/meaxure/interfaces";
import { project, localize } from "../../common";
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
    expHTML.push('<p class="exportable-hint">'+localize('Option/Alt-click to download. Re-export specs to choose platforms, formats and scales.')+'</p>');
    return propertyType('EXPORTABLE', expHTML.join(''));
}

function escape(value:string):string {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function renderAssetControls(id:string,source:SMDownloadSource):string {
    const p=preferences.platform;
    const hasSVG=!!source.svgDataURL || source.format==='svg';
    const format=!hasSVG&&preferences.format==='svg'?'png':preferences.format;
    const isSVG=format==='svg';
    const rows=scales[p].map(item=>{
        let text='',disabled=isSVG;
        try {const size=dimensions(source,item.scale);text=size.width+' × '+size.height+' px';}
        catch(error) {disabled=true;text=localize("Image too large");}
        if(source.maxScale && item.scale>source.maxScale) {disabled=true;text=localize("Exceeds source resolution");}
        return '<label class="asset-scale"><span><input type="checkbox" value="'+item.scale+'" '+
            (preferences.selected[p].includes(item.scale)&&!disabled?'checked ':'')+(disabled?'disabled ':'')+'>'+platforms[p]+' '+item.label+'</span><small>'+text+'</small></label>';
    }).join('');
    return '<div class="asset-export" data-source-id="'+escape(id)+'">'+
        '<div class="asset-preview"><img src="'+source.dataURL+'" alt="'+localize('Asset preview')+'"></div>'+
        '<label class="asset-setting">'+localize('Platform')+'<select class="asset-platform" aria-label="'+localize('Asset platform')+'">'+
        (Object.keys(platforms) as Platform[]).map(key=>'<option value="'+key+'" '+(key===p?'selected':'')+'>'+platforms[key]+'</option>').join('')+'</select></label>'+
        '<fieldset class="asset-scales" '+(isSVG?'hidden disabled':'')+'><legend>'+localize('Download sizes')+'</legend>'+rows+'</fieldset>'+
        '<label class="asset-setting">'+localize('Asset format')+'<select class="asset-format" aria-label="'+localize('Asset format')+'">'+
        ['png','webp','svg','jpg'].map(f=>'<option value="'+f+'" '+(f===format?'selected ':'')+(f==='svg'&&!hasSVG?'disabled ':'')+'>'+(f==='webp'?'WebP':f.toUpperCase())+'</option>').join('')+'</select></label>'+
        '<p class="asset-help">'+(isSVG?localize(source.containsBitmap?'SVG uses a fixed 1x size and contains bitmap content.':'SVG uses a fixed 1x size.'):format==='jpg'?localize("JPG uses a white background."):source.containsBitmap?localize("Contains bitmap content; enlargement is limited by the original resolution."):localize("Transparent background · Generated at selected scales"))+'</p>'+
        '<button type="button" class="asset-download">'+localize('Download asset')+'</button>'+
        '<p class="asset-status" role="status" aria-live="polite">'+(isSVG?localize("Download a single SVG file"):localize("Multiple sizes are packaged as ZIP"))+'</p></div>';
}
