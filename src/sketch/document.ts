// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { sketch } from ".";
import { callNative } from "./compat";

declare module 'sketch/sketch' {
    namespace _Sketch {
        interface Document {
            filePath: string;
            fileName: string;
        }
    }
}

export function extendDocument() {
    let prototype = sketch.Document.prototype
    Object.defineProperty(prototype, "filePath", {
        get: function () {
            let sketchObject = this.sketchObject;
            let fileURL = callNative<any>(sketchObject, "fileURL", undefined);
            return fileURL ? fileURL.path().stringByDeletingLastPathComponent() : "~";
        }
    });
    Object.defineProperty(prototype, "fileName", {
        get: function () {
            let sketchObject = this.sketchObject;
            let displayName = callNative<any>(sketchObject, "displayName", undefined);
            return displayName ? displayName.stringByDeletingPathExtension() : "Untitled";
        }
    });
}
