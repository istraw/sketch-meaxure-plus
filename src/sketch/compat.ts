import { sketch } from ".";

export function hasNativeMethod(target: any, method: string): boolean {
    return !!(target && target[method] && typeof target[method] === 'function');
}

export function callNative<T>(target: any, method: string, fallback?: T, ...args): T {
    if (!hasNativeMethod(target, method)) return fallback;
    return target[method](...args);
}

export function getNative<T>(target: any, property: string, fallback?: T): T {
    if (!target || target[property] === undefined || target[property] === null) return fallback;
    return target[property];
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

export function ensureDirectory(path: string) {
    NSFileManager.defaultManager()
        .createDirectoryAtPath_withIntermediateDirectories_attributes_error(path, true, nil, nil);
}

export function fileExists(path: string): boolean {
    return !!NSFileManager.defaultManager().fileExistsAtPath(path);
}
