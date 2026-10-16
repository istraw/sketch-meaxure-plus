import { SMDownloadSource } from '../../src/meaxure/interfaces';
import { AssetFormat, dimensions } from './model';
export async function encodeAsset(source:SMDownloadSource,scale:number,format:AssetFormat):Promise<Blob> {
    const size=dimensions(source,format==='svg'?1:scale);
    if(source.maxScale && scale>source.maxScale) throw new Error('素材源仅支持到 '+source.maxScale+'x');
    if(format==='svg') {
        if(source.format!=='svg') throw new Error('此素材没有 SVG 源，请选择 PNG、WebP 或 JPG');
        const raw=atob(source.dataURL.split(',')[1]);
        const svg=new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
        const document=new DOMParser().parseFromString(svg,'image/svg+xml');
        if(document.querySelector('parsererror')) throw new Error('SVG 源无法解析');
        const root=document.documentElement;
        root.setAttribute('width',String(size.width));root.setAttribute('height',String(size.height));
        return new Blob([new XMLSerializer().serializeToString(document)],{type:'image/svg+xml'});
    }
    const image=await loadImage(source.dataURL);
    const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
    try {
        const context=canvas.getContext('2d');
        if(!context) throw new Error('浏览器无法创建图片');
        if(format==='jpg') {context.fillStyle='#ffffff';context.fillRect(0,0,size.width,size.height);}
        context.drawImage(image,0,0,size.width,size.height);
        const type=format==='jpg'?'image/jpeg':'image/'+format;
        const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败')),type,0.95));
        if(blob.type!==type) throw new Error('此浏览器不支持 '+format.toUpperCase()+' 编码，请选择其他格式');
        return blob;
    } finally {canvas.width=0;canvas.height=0;}
}
function loadImage(url:string):Promise<HTMLImageElement> {
    return new Promise((resolve,reject)=>{
        const image=new Image();
        const timeout=setTimeout(()=>reject(new Error('素材源读取超时，请重试')),20000);
        image.onload=()=>{clearTimeout(timeout);resolve(image);};
        image.onerror=()=>{clearTimeout(timeout);reject(new Error('素材源无法读取'));};
        image.src=url;
    });
}
export function downloadBlob(blob:Blob,name:string) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;link.style.display='none';document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
}
