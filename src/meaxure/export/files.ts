// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { SMExportFormat, SliceNativeExportOptions } from "../interfaces";
import { sketch } from "../../sketch";
import { ensureDirectory, fileExists, hasNativeMethod } from "../../sketch/compat";
import { toJSString } from "../helpers/helper";
export function exportImage(layer: Layer, format: ExportFormat | SMExportFormat, path: string, name: string, nativeOptions?: SliceNativeExportOptions) {
    let exportInfo = getExportFileInfo(format, name);
    let relativeFileName = exportInfo.fileName;
    let savePath = [path, "/", relativeFileName].join("");
    let outputPath = getParentDirectory(savePath);
    let fileName = getBaseName(savePath);

    ensureDirectory(outputPath);

    let exported = nativeOptions && isSketchExportFormat(format)
        ? exportImageWithNativeRequest(layer, savePath, nativeOptions)
        : false;

    if (!exported) {
        if (isSketchExportFormat(format)) {
            sketch.export(layer, {
                output: outputPath,
                exportFormats: [format],
                filename: fileName,
                overwriting: true,
                suffixing: false,
            });
        } else {
            sketch.export(layer, {
                output: outputPath,
                formats: format.format,
                scales: String(format.scale),
                filename: fileName,
                overwriting: true,
                suffixing: false,
            });
        }
    }

    if (fileExists(savePath)) {
        return savePath;
    }

    let bufferFormat = toBufferExportFormat(format);
    if (bufferFormat && exportImageBufferToFile(layer, bufferFormat, savePath)) {
        return savePath;
    }

    throw new Error(`Exported image not found at path: ${savePath}`);
}

function getParentDirectory(path: string): string {
    let index = path.lastIndexOf("/");
    return index >= 0 ? path.slice(0, index) : path;
}

function getBaseName(path: string): string {
    let index = path.lastIndexOf("/");
    return index >= 0 ? path.slice(index + 1) : path;
}

function exportImageWithNativeRequest(layer: Layer, savePath: string, nativeOptions: SliceNativeExportOptions): boolean {
    let request = getNativeExportRequestAt(layer, nativeOptions.requestIndex);
    if (!request) return false;

    try {
        if (nativeOptions.requestRect && hasNativeMethod(request, "setRect")) {
            request.setRect(CGRectMake(
                nativeOptions.requestRect.x,
                nativeOptions.requestRect.y,
                nativeOptions.requestRect.width,
                nativeOptions.requestRect.height
            ));
        }
        if (typeof nativeOptions.shouldTrim == "boolean" && hasNativeMethod(request, "setShouldTrim")) {
            request.setShouldTrim(nativeOptions.shouldTrim);
        }

        if (typeof MSExportManager !== "undefined" && hasNativeMethod(MSExportManager, "shared")) {
            let manager = MSExportManager.shared();
            if (manager && hasNativeMethod(manager, "dataForRequest")) {
                let data = manager.dataForRequest(request);
                if (data && hasNativeMethod(data, "writeToFile_atomically")) {
                    data.writeToFile_atomically(savePath, true);
                    return fileExists(savePath);
                }
            }
        }

        if (typeof MSExporter !== "undefined" && hasNativeMethod(MSExporter, "exporterForRequest_colorSpace")) {
            let exporter = MSExporter.exporterForRequest_colorSpace(request, nil);
            if (exporter && hasNativeMethod(exporter, "data")) {
                let data = exporter.data();
                if (data && hasNativeMethod(data, "writeToFile_atomically")) {
                    data.writeToFile_atomically(savePath, true);
                    return fileExists(savePath);
                }
            }
        }
    } catch (error) {
        return false;
    }

    return false;
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

export function exportImageToBuffer(layer: Layer, format: SMExportFormat): Buffer {
    return sketch.export(layer, {
        output: null,
        formats: format.format,
        scales: format.scale.toString(),
    }) as Buffer;
}

function toBufferExportFormat(format: ExportFormat | SMExportFormat): SMExportFormat | undefined {
    if (!format) return undefined;
    if (isSketchExportFormat(format)) {
        return {
            format: format.fileFormat,
            scale: Number(format.scale) || 1,
            prefix: format.prefix || "",
            suffix: format.suffix || "",
        };
    }
    return {
        format: format.format,
        scale: Number(format.scale) || 1,
        prefix: format.prefix || "",
        suffix: format.suffix || "",
    };
}

function exportImageBufferToFile(layer: Layer, format: SMExportFormat, savePath: string): boolean {
    try {
        let buffer = exportImageToBuffer(layer, format);
        if (!buffer || !(buffer as any).toString) return false;
        let data = NSData.alloc().initWithBase64EncodedString_options((buffer as any).toString('base64'), 0);
        if (!data || !hasNativeMethod(data, "writeToFile_atomically")) return false;
        ensureDirectory(getParentDirectory(savePath));
        data.writeToFile_atomically(savePath, true);
        return fileExists(savePath);
    } catch (error) {
        return false;
    }
}

export function writeFile(options) {

    options = Object.assign({
        content: "Type something!",
        path: toJSString(NSTemporaryDirectory()),
        fileName: "temp.txt"
    }, options)
    let content = NSString.stringWithString(options.content),
        savePathName = [];

    ensureDirectory(options.path);

    savePathName.push(
        options.path,
        "/",
        options.fileName
    );
    let savePath = savePathName.join("");

    content.writeToFile_atomically_encoding_error(savePath, false, 4, null);
}

function isSketchExportFormat(format: ExportFormat | SMExportFormat): format is ExportFormat {
    return !!format && typeof (format as ExportFormat).fileFormat == "string";
}

function getExportFileInfo(format: ExportFormat | SMExportFormat, name: string) {
    if (isSketchExportFormat(format)) {
        return {
            fileName: [
                format.prefix || "",
                name,
                format.suffix || "",
                ".",
                format.fileFormat
            ].join(""),
        };
    }
    return {
        fileName: [
            format.prefix || "",
            name,
            format.suffix || "",
            ".",
            format.format
        ].join(""),
    };
}

export function buildTemplate(content: string, data: object) {
    return content.replace("'{{data}}'", JSON.stringify(data));
}
