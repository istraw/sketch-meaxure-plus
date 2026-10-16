import { hasNativeMethod } from "../../sketch/compat";

let requestCache: { layer: any; requests: any }[] = [];

export function clearNativeExportRequestCache() {
    requestCache = [];
}

// Sketch 2026.3's legacy request builder can crash inside SketchRendering.
// Native access violations cannot be caught by JavaScript try/catch.
export function assertExportLayerHasDocument(layer: Layer): void {
    let nativeLayer = layer && layer.sketchObject;
    if (!nativeLayer || !hasNativeMethod(nativeLayer, "documentData") || !nativeLayer.documentData()) {
        throw new Error("Cannot export a layer that is not attached to a Sketch document");
    }
}

export function getNativeExportRequestAt(layer: Layer, requestIndex: number = 0): any {
    if (!layer || requestIndex < 0) return undefined;
    try {
        assertExportLayerHasDocument(layer);
        let nativeLayer: any = layer.sketchObject;
        let cached = requestCache.find(entry => entry.layer === nativeLayer);
        let requests: any;
        if (cached) {
            requests = cached.requests;
        } else if (typeof MSSelfContainedHighLevelExporter !== "undefined") {
            // Match the request builder used by Sketch's bundled JavaScript API.
            // Never fall back to the legacy builder on this Sketch generation.
            let formats = nativeLayer.exportOptions().exportFormats();
            let immutableFormats = [];
            for (let i = 0; i < formats.count(); i++) {
                immutableFormats.push(formats.objectAtIndex(i).immutableModelObject());
            }
            if (!immutableFormats.length) return undefined;
            let exporter = (MSSelfContainedHighLevelExporter as any).alloc().initWithOptions({});
            if (!hasNativeMethod(exporter, "exportRequestsForLayer_inRect_exportFormats")) return undefined;
            requests = exporter.exportRequestsForLayer_inRect_exportFormats(nativeLayer, CGRectNull, immutableFormats);
        } else {
            if (typeof MSExportRequest === "undefined") return undefined;
            requests = MSExportRequest.exportRequestsFromExportableLayer(nativeLayer);
        }
        if (!requests) return undefined;
        if (!cached) {
            // Requests retain immutable document snapshots. Keep only a small
            // working set, and clear it between top-level layer tasks.
            requestCache.push({ layer: nativeLayer, requests });
            if (requestCache.length > 4) requestCache.shift();
        }
        if (hasNativeMethod(requests, "count")) {
            return requests.count() > requestIndex ? requests.objectAtIndex(requestIndex) : undefined;
        }
        return requests[requestIndex];
    } catch (error) {
        return undefined;
    }
}
