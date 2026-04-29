import { sketch } from ".";

export function hasNativeMethod(target: any, method: string): boolean {
    try {
        return !!(target && target[method] && typeof target[method] === 'function');
    } catch (error) {
        return false;
    }
}

export function callNative<T>(target: any, method: string, fallback?: T, ...args): T {
    if (!hasNativeMethod(target, method)) return fallback;
    return target[method](...args);
}

export function getNative<T>(target: any, property: string, fallback?: T): T {
    try {
        if (!target || target[property] === undefined || target[property] === null) return fallback;
        return target[property];
    } catch (error) {
        return fallback;
    }
}

export function wrapDocument(document: any): Document {
    if (!document) return undefined;
    if ((sketch.Document as any).fromNative) return (sketch.Document as any).fromNative(document);
    if ((sketch.Document as any).from) return (sketch.Document as any).from(document);
    if ((sketch as any).fromNative) return (sketch as any).fromNative(document);
    return document;
}

export function wrapArtboard(artboard: any): Artboard {
    if (!artboard) return undefined;
    if ((sketch.Artboard as any).fromNative) return (sketch.Artboard as any).fromNative(artboard);
    if ((sketch.Artboard as any).from) return (sketch.Artboard as any).from(artboard);
    return artboard;
}

export function wrapLayer(layer: any): Layer {
    if (!layer) return undefined;
    if ((sketch as any).fromNative) return (sketch as any).fromNative(layer);
    if ((sketch.Layer as any).fromNative) return (sketch.Layer as any).fromNative(layer);
    if ((sketch.Layer as any).from) return (sketch.Layer as any).from(layer);
    return layer;
}

export function getChildLayers(layer: Layer): Layer[] {
    if (!layer) return [];
    if (layer.layers && layer.layers.length) return layer.layers;
    let nativeLayers = callNative<any>(layer.sketchObject, "layers", undefined);
    if (!nativeLayers) return [];
    let results: Layer[] = [];
    if (Array.isArray(nativeLayers)) {
        return nativeLayers.map(wrapLayer).filter(Boolean);
    }
    let count = hasNativeMethod(nativeLayers, "count") ? nativeLayers.count() : Number(nativeLayers.length) || 0;
    for (let i = 0; i < count; i++) {
        let nativeLayer = nativeLayers.objectAtIndex ? nativeLayers.objectAtIndex(i) : nativeLayers[i];
        let wrapped = wrapLayer(nativeLayer);
        if (wrapped) results.push(wrapped);
    }
    return results;
}

export function ensureDirectory(path: string) {
    NSFileManager.defaultManager()
        .createDirectoryAtPath_withIntermediateDirectories_attributes_error(path, true, nil, nil);
}

export function fileExists(path: string): boolean {
    return !!NSFileManager.defaultManager().fileExistsAtPath(path);
}
