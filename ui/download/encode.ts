import { localize } from "../common";
import { SMDownloadSource } from '../../src/meaxure/interfaces';
import { AssetFormat, dimensions } from './model';
export async function encodeAsset(source:SMDownloadSource,scale:number,format:AssetFormat):Promise<Blob> {
    const size=dimensions(source,format==='svg'?1:scale);
    if(format!=='svg' && source.maxScale && scale>source.maxScale) throw new Error(localize('Source supports up to %@x',source.maxScale));
    if(format==='svg') {
        const svgURL=source.svgDataURL || (source.format==='svg' ? source.dataURL : undefined);
        if(!svgURL) throw new Error(localize("No SVG source available. Choose PNG, WebP or JPG."));
        const raw=atob(svgURL.split(',')[1]);
        const svg=new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
        const document=new DOMParser().parseFromString(svg,'image/svg+xml');
        if(document.querySelector('parsererror')) throw new Error(localize("Unable to parse SVG source"));
        const root=document.documentElement;
        root.setAttribute('width',String(size.width));root.setAttribute('height',String(size.height));
        return new Blob([new XMLSerializer().serializeToString(document)],{type:'image/svg+xml'});
    }
    const image=await loadImage(source.dataURL);
    const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
    try {
        const context=canvas.getContext('2d');
        if(!context) throw new Error(localize("Unable to create an image in this browser"));
        if(format==='jpg') {context.fillStyle='#ffffff';context.fillRect(0,0,size.width,size.height);}
        context.drawImage(image,0,0,size.width,size.height);
        const type=format==='jpg'?'image/jpeg':'image/'+format;
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(localize("Image generation failed"))),type,0.95));
        if(blob.type!==type) throw new Error(localize('This browser cannot encode %@. Choose another format.',format.toUpperCase()));
        return blob;
    } finally {canvas.width=0;canvas.height=0;}
}
function loadImage(url:string):Promise<HTMLImageElement> {
    return new Promise((resolve,reject)=>{
        const image=new Image();
        const timeout=setTimeout(()=>reject(new Error(localize("Source loading timed out. Try again."))),20000);
        image.onload=()=>{clearTimeout(timeout);resolve(image);};
        image.onerror=()=>{clearTimeout(timeout);reject(new Error(localize("Unable to load asset source")));};
        image.src=url;
    });
}
export function downloadBlob(blob:Blob,name:string) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;link.style.display='none';document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
}
