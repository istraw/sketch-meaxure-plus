// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { getNativeExportRequestAt, assertExportLayerHasDocument } from "./nativeRequest";
import { SMExportFormat, SliceNativeExportOptions } from "../interfaces";
import { sketch } from "../../sketch";
import { ensureDirectory, fileExists, hasNativeMethod } from "../../sketch/compat";
import { getExportScale, validateExportSize } from "./exportSize";
import { toJSString } from "../helpers/helper";
export function exportImage(layer: Layer, format: ExportFormat | SMExportFormat, path: string, name: string, nativeOptions?: SliceNativeExportOptions) {
    assertExportLayerHasDocument(layer);
    let frame = nativeOptions && nativeOptions.requestRect || layer.frame;
    let scale = isSketchExportFormat(format) ? getExportScale(format.size, layer.frame.width, layer.frame.height) : Number(format.scale);
    validateExportSize(Number(frame.width), Number(frame.height), scale, isSketchExportFormat(format) ? format.fileFormat : format.format);
    let exportInfo = getExportFileInfo(format, name);
    let relativeFileName = exportInfo.fileName;
    let savePath = [path, "/", relativeFileName].join("");
    let outputPath = getParentDirectory(savePath);
    let fileName = getBaseName(savePath);

    ensureDirectory(outputPath);

    let exported = nativeOptions && isSketchExportFormat(format)
        ? exportImageWithNativeRequest(layer, savePath, nativeOptions, scale)
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

    let bufferFormat = toBufferExportFormat(format, layer);
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

function exportImageWithNativeRequest(layer: Layer, savePath: string, nativeOptions: SliceNativeExportOptions, scale: number): boolean {
    let request = getNativeExportRequestAt(layer, nativeOptions.requestIndex);
    if (!request) return false;

    try {
        if (hasNativeMethod(request, "setScale")) request.setScale(scale);
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

        if (typeof MSSelfContainedHighLevelExporter !== "undefined") {
            // Use the exporter and document color space paired with modern requests.
            if (!hasNativeMethod(request, "immutableDocument")) return false;
            let colorSpace = (NSColorSpace as any).colorSpaceForSketchColorSpace(request.immutableDocument().colorSpace()).CGColorSpace();
            let exporter = (MSExporter as any).exporterForRequest_colorSpace_options(request, colorSpace, 0);
            let data = exporter.dataAndReturnError(null);
            if (!data) return false;
            data.writeToFile_atomically(savePath, true);
            return fileExists(savePath);
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

export function exportImageToBuffer(layer: Layer, format: SMExportFormat): Buffer {
    assertExportLayerHasDocument(layer);
    validateExportSize(Number(layer.frame.width), Number(layer.frame.height), Number(format.scale), format.format);
    return sketch.export(layer, {
        output: false,
        formats: format.format,
        scales: format.scale.toString(),
    }) as Buffer;
}

function toBufferExportFormat(format: ExportFormat | SMExportFormat, layer: Layer): SMExportFormat | undefined {
    if (!format) return undefined;
    if (isSketchExportFormat(format)) {
        return {
            format: format.fileFormat,
            scale: getExportScale(format.size, layer.frame.width, layer.frame.height),
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
