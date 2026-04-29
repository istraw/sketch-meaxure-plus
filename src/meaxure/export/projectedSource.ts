import { SMRect } from "../interfaces";
import { context } from "../common/context";
import { callNative, wrapLayer, getChildLayers } from "../../sketch/compat";

let fallbackExportableLayerCache: { [key: string]: Layer[] } | undefined;

export function clearProjectedSourceCache() {
    fallbackExportableLayerCache = undefined;
}

export function getProjectedSourceId(layer: Layer): string | undefined {
    return layer ? (layer as any).__meaxureProjectedSourceID : undefined;
}

export function getProjectedSourceLayer(layer: Layer): Layer | undefined {
    let sourceId = getProjectedSourceId(layer);
    if (!context || !context.document) return undefined;
    let resolved: Layer | undefined;

    if (sourceId) {
        try {
            if (typeof (context.document as any).getLayerWithID == "function") {
                let found = (context.document as any).getLayerWithID(sourceId);
                if (found) resolved = found as Layer;
            }
        } catch (error) {
            // fall back to native document data lookup
        }

        if (!resolved) {
            try {
                let nativeDocument = context.sketchObject ? context.sketchObject.document : undefined;
                let nativeDocumentData = nativeDocument && nativeDocument.documentData ? nativeDocument.documentData() : undefined;
                let nativeLayer = nativeDocumentData
                    ? callNative<any>(nativeDocumentData, "layerWithID", undefined, sourceId)
                    : undefined;
                resolved = nativeLayer ? wrapLayer(nativeLayer) as Layer : undefined;
            } catch (error) {
                resolved = undefined;
            }
        }
    }

    if (isUsableProjectedSourceMatch(layer, resolved)) return resolved;
    return findFallbackProjectedSourceLayer(layer, resolved);
}

export function getLayerFrameRect(layer?: Layer): SMRect | undefined {
    if (!layer) return undefined;
    try {
        if (!layer.frame) return undefined;
        let rect = {
            x: Number(layer.frame.x),
            y: Number(layer.frame.y),
            width: Number(layer.frame.width),
            height: Number(layer.frame.height),
        };
        if (![rect.x, rect.y, rect.width, rect.height].every(value => isFinite(value))) return undefined;
        return rect;
    } catch (error) {
        return undefined;
    }
}

export function shouldPreferProjectedSourceSlice(layer: Layer, fallbackRect: SMRect, sourceLayer?: Layer): boolean {
    if (!layer || !fallbackRect || !sourceLayer) return false;
    let sourceRect = getLayerFrameRect(sourceLayer);
    if (!sourceRect) return false;
    if (!(sourceLayer.exportFormats && sourceLayer.exportFormats.length)) return false;

    let deltaWidth = fallbackRect.width - sourceRect.width;
    let deltaHeight = fallbackRect.height - sourceRect.height;
    if (deltaWidth <= 0 && deltaHeight <= 0) return false;

    // When a projected symbol slice is accidentally resolved to its wrapper group,
    // the exported frame usually grows by a small padding (for example 16 -> 24).
    // Keep legitimate large resizes untouched.
    let smallPaddingWidth = deltaWidth >= 0 && deltaWidth <= 8.5;
    let smallPaddingHeight = deltaHeight >= 0 && deltaHeight <= 8.5;
    return smallPaddingWidth && smallPaddingHeight;
}

function isUsableProjectedSourceMatch(layer?: Layer, sourceLayer?: Layer): boolean {
    if (!layer || !sourceLayer) return false;
    if (String(layer.name || "") != String(sourceLayer.name || "")) return false;
    if ((sourceLayer.exportFormats && sourceLayer.exportFormats.length)) return true;
    let sourceRect = getLayerFrameRect(sourceLayer);
    let layerRect = getLayerFrameRect(layer);
    if (!sourceRect || !layerRect) return false;
    return Math.abs(sourceRect.width - layerRect.width) < 0.01
        && Math.abs(sourceRect.height - layerRect.height) < 0.01;
}

function findFallbackProjectedSourceLayer(layer: Layer, resolved?: Layer): Layer | undefined {
    if (!layer || !context || !context.document || !context.document.pages) return resolved;
    let layerRect = getLayerFrameRect(layer);
    let layerName = String(layer.name || "");
    let cache = getFallbackExportableLayerCache();
    let candidates = cache[layerName] || [];

    if (!candidates.length) return resolved;
    let ranked = candidates
        .map(candidate => ({
            candidate,
            score: getLayerMatchScore(layerRect, getLayerFrameRect(candidate)),
        }))
        .sort((a, b) => a.score - b.score);
    return ranked[0] ? ranked[0].candidate : resolved;
}

function getFallbackExportableLayerCache(): { [key: string]: Layer[] } {
    if (fallbackExportableLayerCache) return fallbackExportableLayerCache;
    let cache: { [key: string]: Layer[] } = {};
    if (!context || !context.document || !context.document.pages) {
        fallbackExportableLayerCache = cache;
        return cache;
    }

    context.document.pages.forEach(page => {
        collectMatchingLayers(getChildLayers(page as any), cache);
    });
    fallbackExportableLayerCache = cache;
    return cache;
}

function collectMatchingLayers(layers: Layer[], cache: { [key: string]: Layer[] }) {
    (layers || []).forEach(layer => {
        if (!layer) return;
        if (layer.exportFormats && layer.exportFormats.length) {
            let name = String(layer.name || "");
            if (!cache[name]) cache[name] = [];
            cache[name].push(layer);
        }
        collectMatchingLayers(getChildLayers(layer as any), cache);
    });
}

function getLayerMatchScore(target?: SMRect, candidate?: SMRect): number {
    if (!target || !candidate) return Number.MAX_SAFE_INTEGER;
    return Math.abs(target.width - candidate.width)
        + Math.abs(target.height - candidate.height)
        + Math.abs(target.x - candidate.x) * 0.01
        + Math.abs(target.y - candidate.y) * 0.01;
}
