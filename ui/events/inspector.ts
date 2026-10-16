import { renderAssetControls } from "../render/inspector/exportable";
import { preferences, Platform, AssetFormat, filename, downloadScales } from "../download/model";
import { encodeAsset, downloadBlob } from "../download/encode";
import { zipFiles } from "../download/zip";
import { project } from "../common";
import { state } from "../common";
import { colors } from "../render/colors";
import { localize } from "../common";
import { message } from "../render/helper";
import { eventDelegate } from "./delegate";
import { copyText, getCopyableColorValue } from "./colors";

export function inspectorEvents() {
    assetDownloadEvents();
    let formats = ['color-hex', 'argb-hex', 'css-rgba', 'css-hsla', 'ui-color'];
    let inspector = document.querySelector('#inspector') as HTMLElement;
    eventDelegate(inspector, 'click', '.color > label:first-child', function (event) {
        let current = formats.indexOf(state.colorFormat)
        let next = (current + 1) % formats.length;
        state.colorFormat = formats[next];
        document.querySelectorAll('.color input[data-color]').forEach((i: HTMLInputElement) => {
            let colors = JSON.parse(decodeURI(i.dataset.color));
            i.value = colors[state.colorFormat];
        })
        colors();
    });
    eventDelegate(inspector, 'click', '.color input[data-color]', async function (event) {
        event.stopPropagation();
        let input = this as HTMLInputElement;
        let color = JSON.parse(decodeURI(input.dataset.color));
        let value = getCopyableColorValue(color);
        let copied = await copyText(value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        input.select();
        message(`${localize('Copied color')}: ${value}`);
    });
    eventDelegate(inspector, 'click', '.color .color-name input[data-copy-value]', async function (event) {
        event.stopPropagation();
        let input = this as HTMLInputElement;
        let value = input.dataset.copyValue || input.value;
        let copied = await copyText(value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        input.select();
        message(`${localize('Copied content')}: ${value}`);
    });
    eventDelegate(inspector, 'click', 'textarea#content', async function (event) {
        let textarea = this as HTMLTextAreaElement;
        let copied = await copyText(textarea.value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        textarea.select();
        message(`${localize('Copied content')}: ${textarea.value}`);
    });
    eventDelegate(inspector, 'click', '.exportable a', function (event: MouseEvent) {
        if (!event.altKey) return;
        event.preventDefault();
        let link = this as HTMLAnchorElement;
        let downloadLink = document.createElement('a');
        downloadLink.href = link.href;
        downloadLink.download = link.dataset.download || '';
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    });
    eventDelegate(inspector, 'dblclick', 'input, textarea', function (event) {
        (this as HTMLInputElement).select();
    });
}

function assetDownloadEvents() {
    eventDelegate('#inspector','change','.asset-platform, .asset-format, .asset-scale input',function(){
        const panel=this.closest('.asset-export') as HTMLElement;
        const source=project.downloadSources[panel.dataset.sourceId];
        if(this.classList.contains('asset-platform')) preferences.platform=(this as HTMLSelectElement).value as Platform;
        else if(this.classList.contains('asset-format')) preferences.format=(this as HTMLSelectElement).value as AssetFormat;
        else preferences.selected[preferences.platform]=Array.from(panel.querySelectorAll('.asset-scale input:checked')).map((input:HTMLInputElement)=>Number(input.value));
        // Keep the native select/input mounted and focused. Replacing the
        // whole panel during a select change can send remaining key events to
        // unrelated viewer controls (notably the global unit picker).
        const updated=document.createElement('div');
        updated.innerHTML=renderAssetControls(panel.dataset.sourceId,source);
        if(this.classList.contains('asset-platform') || this.classList.contains('asset-format')) {
            panel.querySelector('.asset-scales').replaceWith(updated.querySelector('.asset-scales'));
        }
        panel.querySelector('.asset-help').textContent=updated.querySelector('.asset-help').textContent;
        panel.querySelector('.asset-status').textContent=updated.querySelector('.asset-status').textContent;
    });
    eventDelegate('#inspector','click','.asset-download',async function(){
        const button=this as HTMLButtonElement,panel=button.closest('.asset-export') as HTMLElement;
        const source=project.downloadSources[panel.dataset.sourceId];
        const platform=preferences.platform,format=(panel.querySelector('.asset-format') as HTMLSelectElement).value as AssetFormat;
        const selected=downloadScales(format,Array.from(panel.querySelectorAll('.asset-scale input:checked:not(:disabled)')).map((i:HTMLInputElement)=>Number(i.value)));
        const status=panel.querySelector('.asset-status') as HTMLElement;
        if(!selected.length){status.textContent='请至少选择一个尺寸';return;}
        const controls=Array.from(panel.querySelectorAll('input,select,button')) as (HTMLInputElement|HTMLSelectElement|HTMLButtonElement)[];
        const wasDisabled=controls.map(c=>c.disabled);
        controls.forEach(c=>c.disabled=true);
        try {
            const files:{name:string;bytes:Uint8Array}[]=[];
            for(const scale of selected) {
                status.textContent='正在生成 '+scale+'x…';
                const blob=await encodeAsset(source,scale,format);
                files.push({name:filename(source.name,platform,scale,format),bytes:new Uint8Array(await blob.arrayBuffer())});
            }
            if(files.length===1 && (platform!=='android' || format==='svg')) {
                downloadBlob(new Blob([files[0].bytes]),files[0].name);
            } else {
                downloadBlob(zipFiles(files),filename(source.name,platform,1,'png').split('/').pop().replace(/\.png$/,'')+'-'+platform+'-'+format+'.zip');
            }
            status.textContent='已生成下载文件';
        } catch(error) {status.textContent=error.message || '下载失败，请选择其他格式重试';}
        finally {controls.forEach((c,i)=>c.disabled=wasDisabled[i]);}
    });
}
