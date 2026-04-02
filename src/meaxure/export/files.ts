// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { SMExportFormat } from "../interfaces";
import { sketch } from "../../sketch";
import { ensureDirectory, fileExists } from "../../sketch/compat";
import { context } from "../common/context";
import { toJSString } from "../helpers/helper";

export function exportImage(layer: Layer, format: SMExportFormat, path: string, name: string) {
    ensureDirectory(path);
    let fileName = [
        format.prefix || "",
        name,
        format.suffix || "",
        ".",
        format.format
    ].join("");
    let savePath = [path, "/", fileName].join("");

    sketch.export(layer, {
        output: path,
        formats: format.format,
        scales: String(format.scale),
        filename: fileName,
        overwriting: true,
        suffixing: false,
    });

    if (!fileExists(savePath)) {
        throw new Error(`Exported image not found at path: ${savePath}`);
    }
    return savePath;
}

export function exportImageToBuffer(layer: Layer, format: SMExportFormat): Buffer {
    return sketch.export(layer, {
        output: null,
        formats: format.format,
        scales: format.scale.toString(),
    }) as Buffer;
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

export function buildTemplate(content: string, data: object) {
    return content.replace("'{{data}}'", JSON.stringify(data));
}
