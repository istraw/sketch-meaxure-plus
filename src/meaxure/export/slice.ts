// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { getNativeExportRequestAt } from "./nativeRequest";
import { SMExportable, LayerData, SMExportFormat, SMRect, SliceNativeExportOptions, SMDownloadSource } from "../interfaces";
import { assetsPath } from ".";
import { context } from "../common/context";
import { exportImage, exportImageToBuffer } from "./files";
import { sketch } from "../../sketch";
import { getProjectedSourceLayer } from "./projectedSource";
import { hasNativeMethod } from "../../sketch/compat";
import { getProjectionRenderLayer, releaseOrdinarySliceRenderLayer } from "./projectionHost";

let downloadSources: { [id: string]: SMDownloadSource } = {};
let sourceContents = new Map<string, string>();
export function getCollectedDownloadSources() { return downloadSources; }
let slices = [];
let sliceCache: { [key: string]: SMExportable[] } = {}
let sliceDebugs: any[] = [];

export function clearSliceCache(): void {
    downloadSources = {};
    sourceContents.clear();
    slices = [];
    sliceCache = {};
    sliceDebugs = [];
}
export function getCollectedSlices(): any[] {
    return slices;
}
export function getSliceDebugs(): any[] {
    return sliceDebugs;
}
export function getSlice(layer: Layer, layerData: LayerData, symbolLayer: Layer) {
    let sliceID = layer.id;
    let sliceName = layer.name;
    let formats: ExportFormat[];
    let exportLayer = layer;
    let sourceLayer: Layer = undefined;
    if (layer.exportFormats.length > 0) {
        formats = layer.exportFormats;
        sourceLayer = getProjectedSourceLayer(layer);
        if (symbolLayer) {
            sliceID = symbolLayer.id;
            sliceName = symbolLayer.name;
        }
    } else if (layer.type == sketch.Types.SymbolInstance) {
        let layerMaster = (layer as SymbolInstance).master;
        // symbol instance of none, #4
        if (!layerMaster) return;
        if (!layerMaster.exportFormats.length) return;
        formats = layerMaster.exportFormats;
        sliceID = layerMaster.id
        sliceName = layerMaster.name
    }
    if (!formats) return;
    // Transparent instances still expose exportable descendants. Rendering
    // those descendants produces blank assets and can overwrite a visible
    // instance's file with the same name later in the traversal.
    if (hasTransparentExportAncestor(layer)) return;
    layerData.objectID = sliceID;
    // export it, if haven't yet
    if (!sliceCache[sliceID]) {
        try {
            // A Slice renders scene pixels. Its visible render copy preserves
            // the containing content without unrelated ancestor backgrounds.
            exportLayer = getProjectionRenderLayer(layer);
            NSFileManager.defaultManager()
                .createDirectoryAtPath_withIntermediateDirectories_attributes_error(assetsPath, true, nil, nil);
            sliceCache[sliceID] = layerData.exportable = getExportable(exportLayer, formats, layer.name, sourceLayer);
            slices.push({
                name: sliceName,
                objectID: sliceID,
                rect: layerData.rect,
                displayRect: layerData.displayRect,
                exportable: layerData.exportable
            })
        } catch (error) {
            sliceDebugs.push({
                stage: "get-slice-failed",
                name: sliceName,
                objectID: sliceID,
                sourceLayer: sourceLayer ? sourceLayer.name : undefined,
                error: String(error),
            });
            throw error;
        } finally {
            releaseOrdinarySliceRenderLayer(layer);
        }
    } else if (sliceCache[sliceID]) {
        layerData.exportable = sliceCache[sliceID];
    }
}
function hasTransparentExportAncestor(layer: Layer): boolean {
    let seen = new Set<Layer>();
    let current = layer;
    while (current && !seen.has(current)) {
        seen.add(current);
        if (current.style && Number(current.style.opacity) === 0) return true;
        current = current.parent as Layer;
    }
    return false;
}

function getExportable(layer: Layer, formats: ExportFormat[], outputName: string, sourceLayer?: Layer): SMExportable[] {
    let exportable = [];
    for (let [index, format] of formats.entries()) {
        let exportFormat = parseExportFormat(format, layer);
        let prefix = exportFormat.prefix || "",
            suffix = exportFormat.suffix || "";
        let nativeOptions = getSliceNativeExportOptions(layer, sourceLayer, index);
        try {
            exportImage(
                layer,
                format,
                assetsPath,
                outputName,
                nativeOptions
            );
        } catch (error) {
            if (!nativeOptions) throw error;
            sliceDebugs.push({
                stage: "native-export-fallback",
                name: outputName,
                requestIndex: index,
                sourceLayer: sourceLayer ? sourceLayer.name : undefined,
                error: String(error),
            });
            exportImage(
                layer,
                format,
                assetsPath,
                outputName
            );
        }

        exportable.push({
            name: outputName,
            format: exportFormat.format,
            path: prefix + outputName + suffix + "." + exportFormat.format
        });
    }

    // Keep a self-contained source so offline browsers can resize/encode it
    // without drawing file:// images into a tainted canvas.
    try {
        let sourceID = collectDownloadSource(layer, outputName);
        exportable.forEach(item => item.sourceID = sourceID);
    } catch (error) {
        sliceDebugs.push({stage:'download-source-unavailable',name:outputName,error:String(error)});
    }
    return exportable;
}

function collectDownloadSource(layer: Layer, name: string): string {
    const resolution = Number(context.configs.resolution) || 1;
    let format: 'svg' | 'png' = 'svg';
    let buffer: Buffer;
    let width = layer.frame.width, height = layer.frame.height;
    let maxScale: number;
    let containsBitmap = false;
    try {
        buffer = exportImageToBuffer(layer, {format:'svg',scale:1,prefix:'',suffix:''});
        let svg = buffer.toString('utf8');
        if (!/<svg[\s>]/i.test(svg)) throw new Error('SVG source unavailable');
        const box = /viewBox=["']\s*[-\d.e+]+[ ,]+[-\d.e+]+[ ,]+([\d.e+]+)[ ,]+([\d.e+]+)\s*["']/i.exec(svg);
        if (box) { width = Number(box[1]); height = Number(box[2]); }
        containsBitmap = /<image[\s>]/i.test(svg);
    } catch (error) {
        format = 'png';
        containsBitmap = true;
        maxScale = 4;
        try { buffer = exportImageToBuffer(layer, {format:'png',scale:4/resolution,prefix:'',suffix:''}); }
        catch (error) {
            maxScale = 1;
            buffer = exportImageToBuffer(layer, {format:'png',scale:1/resolution,prefix:'',suffix:''});
        }
    }
    const dataURL = 'data:image/' + (format == 'svg' ? 'svg+xml' : 'png') + ';base64,' + buffer.toString('base64');
    const key = JSON.stringify([name,width/resolution,height/resolution,dataURL]);
    let id = sourceContents.get(key);
    if (!id) {
        id = 'source-' + Object.keys(downloadSources).length;
        sourceContents.set(key,id);
        downloadSources[id] = {name,width:width/resolution,height:height/resolution,dataURL,format,containsBitmap,maxScale};
    }
    return id;
}

export function getSliceNativeExportOptions(layer: Layer, sourceLayer?: Layer, requestIndex: number = 0, fallbackRect?: SMRect): SliceNativeExportOptions | undefined {
    let projectedRequest = getNativeExportRequestAt(layer, requestIndex);
    let projectedRect = getNativeRequestRect(projectedRequest) || fallbackRect;
    if (!projectedRequest && !projectedRect) return undefined;

    let requestRect = projectedRect;
    let shouldTrim = hasNativeMethod(projectedRequest, "shouldTrim") ? !!projectedRequest.shouldTrim() : undefined;

    // Native requests use the renderer's document coordinates. Master frames
    // are parent-relative, and projected metadata is artboard-relative; neither
    // can be substituted here without moving the crop away from the pixels.
    // The projected request already includes instance resizing and overrides.
    if (shouldTrim === undefined && sourceLayer) {
        let sourceRequest = getNativeExportRequestAt(sourceLayer, requestIndex);
        if (hasNativeMethod(sourceRequest, "shouldTrim")) shouldTrim = !!sourceRequest.shouldTrim();
    }

    return {
        requestIndex,
        requestRect,
        shouldTrim,
    };
}

function getNativeRequestRect(request: any): SMRect | undefined {
    if (!request || !hasNativeMethod(request, "rect")) return undefined;
    return nativeRectToSMRect(request.rect());
}

function nativeRectToSMRect(value: any): SMRect | undefined {
    if (!value) return undefined;

    let cgRect = getNativeCGRect(value);
    let x = getNativeRectStructNumber(cgRect, "origin", "x");
    let y = getNativeRectStructNumber(cgRect, "origin", "y");
    let width = getNativeRectStructNumber(cgRect, "size", "width");
    let height = getNativeRectStructNumber(cgRect, "size", "height");
    if ([x, y, width, height].every(item => isFinite(item))) {
        return { x, y, width, height };
    }

    x = getNativeRectNumber(value, "x");
    y = getNativeRectNumber(value, "y");
    width = getNativeRectNumber(value, "width");
    height = getNativeRectNumber(value, "height");
    if (![x, y, width, height].every(item => isFinite(item))) return undefined;
    return { x, y, width, height };
}

function getNativeCGRect(value: any): any {
    if (!value) return value;
    try {
        if (hasNativeMethod(value, "rect")) {
            return value.rect();
        }
    } catch (error) {
        // Sketch may bridge CGRect as a native struct that throws on dynamic member lookup.
    }
    return value;
}

function getNativeRectNumber(target: any, key: string): number {
    try {
        if (!target) return NaN;
        let value = target[key];
        if (typeof value == "function") return Number(value.call(target));
        return Number(value);
    } catch (error) {
        return NaN;
    }
}

function getNativeRectStructNumber(target: any, parentKey: string, key: string): number {
    try {
        if (!target) return NaN;
        let parent = target[parentKey];
        if (!parent) return NaN;
        let value = parent[key];
        if (typeof value == "function") return Number(value.call(parent));
        return Number(value);
    } catch (error) {
        return NaN;
    }
}

function parseExportFormat(format: ExportFormat, layer: Layer): SMExportFormat {
    let scale = 1;
    let numberReg = /\d+(\.\d+)?/i;
    let sizeNumber = parseFloat(numberReg.exec(format.size)[0]);
    if (format.size.endsWith('x')) {
        scale = sizeNumber / context.configs.resolution;
    } else if (format.size.endsWith('h') || format.size.endsWith('height')) {
        scale = sizeNumber / layer.frame.height;
    } else if (format.size.endsWith('w') || format.size.endsWith('width') || format.size.endsWith('px')) {
        scale = sizeNumber / layer.frame.width;
    }
    return {
        scale: scale,
        suffix: format.suffix ? format.suffix : "",
        prefix: format.prefix ? format.prefix : "",
        format: format.fileFormat,
    }
}
