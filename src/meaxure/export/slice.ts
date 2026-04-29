// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { SMExportable, LayerData, SMExportFormat, SMRect, SliceNativeExportOptions } from "../interfaces";
import { assetsPath } from ".";
import { context } from "../common/context";
import { exportImage } from "./files";
import { sketch } from "../../sketch";
import { getProjectedSourceLayer, getLayerFrameRect } from "./projectedSource";
import { hasNativeMethod } from "../../sketch/compat";

let slices = [];
let sliceCache: { [key: string]: SMExportable[] } = {}
let sliceDebugs: any[] = [];

export function clearSliceCache(): void {
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
    layerData.objectID = sliceID;
    // export it, if haven't yet
    if (!sliceCache[sliceID]) {
        try {
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
        }
    } else if (sliceCache[sliceID]) {
        layerData.exportable = sliceCache[sliceID];
    }
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

    return exportable;
}

export function getSliceNativeExportOptions(layer: Layer, sourceLayer?: Layer, requestIndex: number = 0, fallbackRect?: SMRect): SliceNativeExportOptions | undefined {
    let projectedRequest = getNativeExportRequestAt(layer, requestIndex);
    let projectedRect = getNativeRequestRect(projectedRequest) || fallbackRect;
    if (!projectedRequest && !projectedRect) return undefined;

    let requestRect = projectedRect;
    let shouldTrim = hasNativeMethod(projectedRequest, "shouldTrim") ? !!projectedRequest.shouldTrim() : undefined;

    if (sourceLayer) {
        let sourceRequest = getNativeExportRequestAt(sourceLayer, requestIndex);
        let sourceFrame = getLayerFrameRect(sourceLayer);
        let sourceRequestRect = getNativeRequestRect(sourceRequest);
        let projectedSourceFrame = getProjectedSourceFrameRect(layer, sourceFrame);
        let translatedRect = translateSourceRequestRect(projectedSourceFrame, sourceFrame, sourceRequestRect);
        if (!translatedRect && projectedSourceFrame) {
            translatedRect = projectedSourceFrame;
        }
        if (translatedRect) requestRect = translatedRect;
        if (sourceRequest && hasNativeMethod(sourceRequest, "shouldTrim")) {
            shouldTrim = !!sourceRequest.shouldTrim();
        }
    }

    return {
        requestIndex,
        requestRect,
        shouldTrim,
    };
}

function getNativeExportRequestAt(layer: Layer, requestIndex: number = 0): any {
    let nativeLayer = layer ? (layer as any).sketchObject : undefined;
    if (!nativeLayer || typeof MSExportRequest === "undefined") return undefined;
    try {
        let requests = MSExportRequest.exportRequestsFromExportableLayer(nativeLayer);
        if (!requests) return undefined;
        if (typeof requests.objectAtIndex == "function") {
            return requests.count() > requestIndex ? requests.objectAtIndex(requestIndex) : undefined;
        }
        if (Array.isArray(requests)) return requests[requestIndex];
        return requests[requestIndex];
    } catch (error) {
        return undefined;
    }
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

function translateSourceRequestRect(projectedRect?: SMRect, sourceFrame?: SMRect, sourceRequestRect?: SMRect): SMRect | undefined {
    if (!projectedRect || !sourceFrame || !sourceRequestRect) return undefined;
    let nextRect = {
        x: projectedRect.x + (sourceRequestRect.x - sourceFrame.x),
        y: projectedRect.y + (sourceRequestRect.y - sourceFrame.y),
        width: sourceRequestRect.width,
        height: sourceRequestRect.height,
    };
    if (![nextRect.x, nextRect.y, nextRect.width, nextRect.height].every(value => isFinite(value))) return undefined;
    if (nextRect.width <= 0 || nextRect.height <= 0) return undefined;
    return nextRect;
}

function getProjectedSourceFrameRect(layer: Layer, sourceFrame?: SMRect): SMRect | undefined {
    if (!layer || !sourceFrame) return undefined;
    let parentRect = getProjectedAbsoluteRect(layer.parent as Layer);
    if (!parentRect) return undefined;
    let scale = getProjectedParentScale(layer);
    let nextRect = {
        x: parentRect.x + sourceFrame.x * scale.x,
        y: parentRect.y + sourceFrame.y * scale.y,
        width: sourceFrame.width * scale.x,
        height: sourceFrame.height * scale.y,
    };
    if (![nextRect.x, nextRect.y, nextRect.width, nextRect.height].every(value => isFinite(value))) return undefined;
    return nextRect;
}

function getProjectedParentScale(layer: Layer): { x: number, y: number } {
    let projectedParent = layer ? layer.parent as Layer : undefined;
    let sourceLayer = getProjectedSourceLayer(layer);
    let sourceParent = sourceLayer ? sourceLayer.parent as Layer : undefined;
    let projectedParentFrame = getLayerFrameRect(projectedParent);
    let sourceParentFrame = getLayerFrameRect(sourceParent);
    return {
        x: getSafeScale(projectedParentFrame ? projectedParentFrame.width : NaN, sourceParentFrame ? sourceParentFrame.width : NaN),
        y: getSafeScale(projectedParentFrame ? projectedParentFrame.height : NaN, sourceParentFrame ? sourceParentFrame.height : NaN),
    };
}

function getSafeScale(value: number, base: number): number {
    if (!isFinite(value) || !isFinite(base) || !base) return 1;
    let scale = value / base;
    return isFinite(scale) && scale > 0 ? scale : 1;
}

function getProjectedAbsoluteRect(layer?: Layer): SMRect | undefined {
    if (!layer) {
        return {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };
    }

    let projectedRect = (layer as any).__meaxureProjectedRect as SMRect | undefined;
    if (projectedRect) return projectedRect;

    let frame = getLayerFrameRect(layer);
    if (!frame) return undefined;

    let parentRect = getProjectedAbsoluteRect(layer.parent as Layer);
    if (!parentRect) return undefined;
    return {
        x: parentRect.x + frame.x,
        y: parentRect.y + frame.y,
        width: frame.width,
        height: frame.height,
    };
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
