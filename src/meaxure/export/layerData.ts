// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { ArtboardData, LayerData, SMType, LayerStates } from "../interfaces";
import { sketch } from "../../sketch";
import { toHTMLEncode, emojiToEntities } from "../helpers/helper";
import { getTextFragment } from "./textFragment";
import { applyMasks, updateMaskStackBeforeLayer } from "./mask";
import { getLayerRadius, getBordersFromStyle, getFillsFromStyle, getShadowsFromStyle, parseColor } from "../helpers/styles";
import { SMRect } from "../interfaces";
import { getSlice, getSliceNativeExportOptions } from "./slice";
import { makeNote } from "./note";
import { getSymbol } from "./symbol";
import { applyTint, pushTintStack, TintInfo, updateTintStackBeforeLayer } from "./tint";
import { stopwatch } from ".";
import { getFlow } from "./flow";
import { tempLayers } from "./tempLayers";
import { renameIfIsMarker } from "../helpers/renameOldMarkers";
import { LayerPlaceholder, LayerPlaceholderType } from "./layers";
import { logger } from "../common/logger";
import { callNative, hasNativeMethod } from "../../sketch/compat";
import { getChildLayers } from "../../sketch/compat";
import { context } from "../common/context";
import { TextBehaviour } from "../../sketch/text";
import { getProjectedSourceLayer, getLayerFrameRect, shouldPreferProjectedSourceSlice } from "./projectedSource";

export function getLayerData(artboard: Artboard, layer: Layer | LayerPlaceholder, data: ArtboardData, byInfluence: boolean, symbolLayer?: Layer) {
    if (layer instanceof LayerPlaceholder) {
        dealWithPlaceholder(layer);
        return;
    }
    // compatible with meaxure markers
    safeLayerStep(layer, 'rename marker', () => renameIfIsMarker(layer));
    // stopwatch.tik('before updateMaskStackBeforeLayer');
    safeLayerStep(layer, 'update mask stack', () => updateMaskStackBeforeLayer(layer));
    safeLayerStep(layer, 'update tint stack', () => updateTintStackBeforeLayer(layer));
    getLayerData2(artboard, layer, data, byInfluence, symbolLayer)
    // stopwatch.tik('update stack');
}

function dealWithPlaceholder(p: LayerPlaceholder) {
    switch (p.getType()) {
        case LayerPlaceholderType.Tint:
            pushTintStack(p.getValue<TintInfo>());
            break;
        default:
            throw ("unknown LayerPlaceholder type: " + p.getType())
    }
}

function getLayerData2(artboard: Artboard, layer: Layer, data: ArtboardData, byInfluence: boolean, symbolLayer?: Layer) {
    // stopwatch.tik('updateMaskStackBeforeLayer');
    let layerRect = getSMRect(layer, artboard, byInfluence);
    layerRect = applyMasks(layer, layerRect, artboard);
    if (!layerRect) {
        return;
    }
    // stopwatch.tik('applyMasks');
    let note = makeNote(layer, artboard, symbolLayer);
    if (note) {
        data.notes.push(note);
        return;
    }
    // stopwatch.tik('make notes');
    let layerStates = getLayerStates(layer);
    // stopwatch.tik('getLayerStates');
    if (!isExportable(layer) ||
        layerStates.isHidden ||
        (layerStates.isLocked && layer.type != sketch.Types.Slice) ||
        layerStates.isEmptyText ||
        layerStates.isInSlice ||
        layerStates.isMeaXure ||
        layerStates.isInShapeGroup) {
        return;
    }

    let layerType = getSMType(layer);
    // stopwatch.tik('get layerType');

    let layerData = <LayerData>{
        objectID: symbolLayer ? symbolLayer.id : layer.id,
        type: layerType,
        isStackLayout: safeValue(layer, 'get stack layout state', () => isStackLayout(layer), false),
        name: toHTMLEncode(emojiToEntities(layer.name)),
        rect: layerRect,
    };
    if (layerType == SMType.text) {
        layerData.displayRect = safeValue(layer, 'get display rect', () => getDisplayRect(layer as Text, artboard, layerRect), layerRect);
    } else if (layerType == SMType.slice) {
        let sliceRect = safeValue(layer, 'get slice display rect', () => getSliceDisplayRect(layer, layerRect), layerRect);
        if (shouldUseDisplayRectAsSliceBounds(layer, layerRect, sliceRect)) {
            layerData.rect = sliceRect;
        }
        layerData.displayRect = sliceRect;
    }
    data.layers.push(layerData);
    safeLayerStep(layer, 'get flow', () => getFlow(layer, layerData));
    // stopwatch.tik('getFlow');
    if (layerType == SMType.hotspot) {
        return;
    }
    // stopwatch.tik('prepare layer data');
    safeLayerStep(layer, 'get styles', () => getLayerStyles(artboard, layer, layerType, layerRect, layerData, symbolLayer));
    // stopwatch.tik('getLayerStyles');
    safeLayerStep(layer, 'apply tint', () => applyTint(layer, layerData));
    // stopwatch.tik('applyTint');
    safeLayerStep(layer, 'get slice', () => getSlice(layer, layerData, symbolLayer));
    // stopwatch.tik('getSlice');
    if (layerData.type == SMType.symbol) {
        let symbolProjected = safeValue(layer, 'get symbol', () => getSymbol(artboard, layer as SymbolInstance, layerData, data, byInfluence), false);
        if (symbolProjected) {
            let index = data.layers.indexOf(layerData);
            if (index >= 0) data.layers.splice(index, 1);
            return;
        }
        safeLayerStep(layer, 'expand detached symbol children', () => exportDetachedSymbolChildren(artboard, layer, data, byInfluence));
    }
    safeLayerStep(layer, 'get text fragment', () => getTextFragment(artboard, layer as Text, data));
    // stopwatch.tik('getTextFragment');
}

function exportDetachedSymbolChildren(artboard: Artboard, layer: Layer, data: ArtboardData, byInfluence: boolean) {
    if (layer.type != sketch.Types.SymbolInstance) return;
    if ((layer as SymbolInstance).master) return;
    getChildLayers(layer).forEach(child => getLayerData(artboard, child, data, byInfluence));
}

function getSMType(layer: Layer): SMType {
    if (layer.exportFormats.length > 0) return SMType.slice;
    let master = (layer as SymbolInstance).master;
    if (master && master.exportFormats.length) return SMType.slice;
    if (isStackLayout(layer)) return SMType.group;
    if (layer.type == sketch.Types.Text) return SMType.text;
    if (layer.type == sketch.Types.SymbolInstance) return SMType.symbol;
    if (layer.type == sketch.Types.Group) return SMType.group;
    if (layer.type == sketch.Types.HotSpot) return SMType.hotspot;
    return SMType.shape;
}

function getLayerStyles(artboard: Artboard, layer: Layer, layerType: SMType, layerRect: SMRect, layerData: LayerData, symbolLayer?: Layer) {
    if (layerType != SMType.slice) {
        let layerStyle = layer.style;
        layerData.shadows = safeValue(layer, 'get shadows', () => getShadowsFromStyle(layerStyle), []);
        layerData.rotation = safeValue(layer, 'get rotation', () => layer.transform.rotation, 0);
        layerData.opacity = safeValue(layer, 'get opacity', () => layerStyle.opacity, 1);
        layerData.radius = safeValue(layer, 'get radius', () => getLayerRadius(layer), undefined);
        layerData.borders = safeValue(layer, 'get borders', () => getBordersFromStyle(layerStyle), []);
        layerData.fills = safeValue(layer, 'get fills', () => getFillsFromStyle(layerStyle), []);
        let sharedStyle = safeValue(layer, 'get shared style', () => (layer as ShapePath).sharedStyle, undefined);
        layerData.styleName = sharedStyle ? sharedStyle.name : '';
    }
    if (layerType == "text") {
        let text = layer as Text;
        layerData.content = toHTMLEncode(emojiToEntities(text.text));
        layerData.color = safeValue(layer, 'get text color', () => getTextColor(text), parseColor(text.style.textColor));
        layerData.fontSize = text.style.fontSize;
        layerData.fontFace = text.style.fontFamily;
        layerData.textAlign = text.style.alignment;
        layerData.letterSpacing = text.style.kerning || 0;
        layerData.lineHeight = text.style.lineHeight;
    }
    layerData.css = safeValue(layer, 'get css', () => layer.CSSAttributes.filter(attr => !/\/\*/.test(attr)), []);
}

function getTextColor(text: Text) {
    let fillColor = text.style.fills
        .find(fill => fill.enabled && fill.fillType === sketch.Style.FillType.Color && fill.color)
        ?.color;
    return parseColor(fillColor || text.style.textColor);
}

function isStackLayout(layer: Layer): boolean {
    if (layer.type != sketch.Types.Group) return false;
    if (hasOfficialStackLayout(layer)) return true;
    let nativeLayer = (layer as any).sketchObject;
    let groupLayout = callNative<any>(nativeLayer, 'groupLayout', undefined);
    if (!groupLayout) return false;
    if (groupLayout.isInferredLayout && groupLayout.isInferredLayout()) return true;
    if (groupLayout.isOrInheritsInferredLayout && groupLayout.isOrInheritsInferredLayout()) return true;
    if (groupLayout.nearestInferredGroupLayout && groupLayout.nearestInferredGroupLayout()) return true;
    if (groupLayout.topmostInferredGroupLayout && groupLayout.topmostInferredGroupLayout()) return true;
    return false;
}

function hasOfficialStackLayout(layer: Layer): boolean {
    let stackLayout = safeValue(layer, 'read stackLayout', () => (layer as any).stackLayout, undefined);
    if (stackLayout) return true;
    // `stackLayout` is the official API in Sketch 2025.1+, while older files may
    // still surface layout information only via the native groupLayout bridge.
    return false;
}
function getSMRect(layer: Layer, artboard: Artboard, byInfluence: boolean): SMRect {
    let projectedRect = (layer as any).__meaxureProjectedRect as SMRect | undefined;
    let layerFrame: Rectangle;
    if (projectedRect) {
        layerFrame = new sketch.Rectangle(
            projectedRect.x,
            projectedRect.y,
            projectedRect.width,
            projectedRect.height
        );
        if (layer.type == sketch.Types.Slice) {
            return roundRectToGrid({
                x: projectedRect.x,
                y: projectedRect.y,
                width: projectedRect.width,
                height: projectedRect.height,
            });
        }
        if (layer.type != sketch.Types.Text) {
            return normalizeRect({
                x: projectedRect.x,
                y: projectedRect.y,
                width: projectedRect.width,
                height: projectedRect.height,
            });
        }
        // Projected symbol snapshots already carry the resolved Sketch frame.
        // Keep it as-is instead of expanding it outward again, otherwise auto-width
        // centered labels (like tab text) gain an extra pixel in width/offset.
        return normalizeRect({
            x: projectedRect.x,
            y: projectedRect.y,
            width: projectedRect.width,
            height: projectedRect.height,
        });
    } else if (byInfluence && layer.type != sketch.Types.Text) {
        // export the influence rect.(include the area of shadows and outside borders...)
        layerFrame = layer.frameInfluence.changeBasis({ from: layer.parent as Group, to: artboard });
    } else {
        // export the default rect.
        layerFrame = layer.frame.changeBasis({ from: layer.parent as Group, to: artboard });
    }
    if (layer.type == sketch.Types.Text) {
        if (shouldUseTextFrameRect(layer as Text)) {
            // Sketch documents store the design-time text container in `Text.frame`.
            // When lineHeight is automatic (`style.lineHeight == null` in the official
            // API), measuring glyph/fragments shrinks the annotation box to the ink
            // bounds, which makes 14pt containers show up as 10pt in exports.
            return normalizeRect({
                x: layerFrame.x,
                y: layerFrame.y,
                width: layerFrame.width,
                height: layerFrame.height,
            });
        }
        let visualRect = getPreferredTextVisualRect(layer as Text, artboard, layerFrame);
        if (visualRect) return snapRectToGrid(visualRect);
    }
    let rect = {
        x: layerFrame.x,
        y: layerFrame.y,
        width: layerFrame.width,
        height: layerFrame.height,
    };
    if (layer.type == sketch.Types.Slice) return roundRectToGrid(rect);
    return layer.type == sketch.Types.Text ? snapRectToGrid(rect) : rect;
}

function getMeasuredTextRect(text: Text, artboard: Artboard, layerFrame: Rectangle): SMRect | undefined {
    if (!shouldMeasureTextByFit(text, layerFrame)) return undefined;

    let tempGroup = new sketch.Group({
        parent: artboard,
        name: "#tmp-measure-text",
        frame: new sketch.Rectangle(0, 0, 0, 0),
    });
    tempLayers.add(tempGroup);

    try {
        let measured = text.duplicate() as Text;
        measured.parent = tempGroup;
        measured.frame = new sketch.Rectangle(layerFrame.x, layerFrame.y, layerFrame.width, layerFrame.height);
        measured.textBehaviour = TextBehaviour.autoWidth;
        if (typeof measured.adjustToFit === "function") measured.adjustToFit();
        alignMeasuredText(measured, layerFrame, text);
        return {
            x: measured.frame.x,
            y: measured.frame.y,
            width: measured.frame.width,
            height: measured.frame.height,
        };
    } catch (error) {
        return undefined;
    } finally {
        safeRemove(tempGroup);
    }
}

function getPreferredTextVisualRect(text: Text, artboard: Artboard, layerFrame: Rectangle): SMRect | undefined {
    let candidates = [
        getGlyphBoundsRect(text, layerFrame),
        getMeasuredTextRect(text, artboard, layerFrame),
        getTextFragmentRect(text, layerFrame),
    ].filter(Boolean);

    for (let candidate of candidates) {
        if (isReasonableTextVisualRect(text, layerFrame, candidate)) return candidate;
    }
    return undefined;
}

function isReasonableTextVisualRect(text: Text, layerFrame: Rectangle, rect: SMRect): boolean {
    if (!rect) return false;
    if (![rect.x, rect.y, rect.width, rect.height].every(value => isFinite(value))) return false;
    if (rect.width <= 0 || rect.height <= 0) return false;

    let fontSize = text.style ? text.style.fontSize : undefined;
    let baseLineHeight = text.style ? text.style.lineHeight : undefined;
    let lineCount = Math.max(1, String(text.text || "").split(/\r\n|\r|\n|\u2028/).length);
    let expectedHeight = (baseLineHeight || fontSize || layerFrame.height || 0) * lineCount;
    if (!expectedHeight || !isFinite(expectedHeight) || expectedHeight <= 0) {
        expectedHeight = Math.max(layerFrame.height, rect.height);
    }

    let maxHeight = Math.max(expectedHeight * 1.6, layerFrame.height + Math.max(4, expectedHeight * 0.25));
    let maxWidth = Math.max(layerFrame.width * 2, rect.width);
    let minX = layerFrame.x - Math.max(4, layerFrame.width * 0.5);
    let maxX = layerFrame.x + layerFrame.width + Math.max(4, layerFrame.width * 0.5);
    let minY = layerFrame.y - Math.max(4, expectedHeight * 0.5);
    let maxY = layerFrame.y + layerFrame.height + Math.max(4, expectedHeight * 0.5);

    return rect.height <= maxHeight
        && rect.width <= maxWidth
        && rect.x >= minX
        && rect.x <= maxX
        && rect.y >= minY
        && rect.y <= maxY;
}

function getGlyphBoundsRect(text: Text, layerFrame: Rectangle): SMRect | undefined {
    if (!shouldMeasureTextByFit(text, layerFrame)) return undefined;

    let nativeText = (text as any).sketchObject;
    if (!nativeText || !hasNativeMethod(nativeText, "glyphBounds")) return undefined;

    try {
        let glyphBounds = callNative<any>(nativeText, "glyphBounds", undefined);
        if (!glyphBounds || !glyphBounds.origin || !glyphBounds.size) return undefined;

        let x = Number(glyphBounds.origin.x);
        let y = Number(glyphBounds.origin.y);
        let width = Number(glyphBounds.size.width);
        let height = Number(glyphBounds.size.height);
        if (![x, y, width, height].every(value => isFinite(value))) return undefined;
        if (width <= 0 || height <= 0) return undefined;

        return {
            x: layerFrame.x + x,
            y: layerFrame.y + y,
            width,
            height,
        };
    } catch (error) {
        return undefined;
    }
}

function captureTextBoundsDebug(artboard: Artboard, text: Text, layerRect: SMRect, symbolLayer?: Layer) {
    if (!shouldCaptureTextBoundsDebug(text, layerRect)) return;

    let rawFrame = text.frame.changeBasis({ from: text.parent as Group, to: artboard });
    let projectedRect = (text as any).__meaxureProjectedRect as SMRect | undefined;
    let glyphBounds = getNativeRect(text, "glyphBounds");
    let capHeightBounds = getNativeRect(text, "capHeightBounds");
    let xHeightBounds = getNativeRect(text, "xHeightBounds");
    let drawingPoint = getDrawingPoint(text);
    let fragmentsRect = getTextFragmentRect(text, rawFrame);
    let measuredRect = getMeasuredTextRect(text, artboard, rawFrame);

    pushTextBoundsDebug({
        artboard: artboard.name,
        layerName: text.name,
        symbolLayerName: symbolLayer ? symbolLayer.name : undefined,
        content: text.text,
        textBehaviour: (text as any).textBehaviour,
        alignment: text.style ? text.style.alignment : undefined,
        fontSize: text.style ? text.style.fontSize : undefined,
        lineHeight: text.style ? text.style.lineHeight : undefined,
        frame: rectToJSON(rawFrame),
        exportedRect: rectToJSON(layerRect),
        projectedRect: projectedRect ? rectToJSON(projectedRect) : undefined,
        glyphBounds: glyphBounds ? rectToJSON(glyphBounds) : undefined,
        capHeightBounds: capHeightBounds ? rectToJSON(capHeightBounds) : undefined,
        xHeightBounds: xHeightBounds ? rectToJSON(xHeightBounds) : undefined,
        drawingPoint: drawingPoint,
        fragmentsRect: fragmentsRect ? rectToJSON(fragmentsRect) : undefined,
        measuredRect: measuredRect ? rectToJSON(measuredRect) : undefined,
        parentName: text.parent ? text.parent.name : undefined,
    });
}

function shouldCaptureTextBoundsDebug(text: Text, layerRect: SMRect): boolean {
    if (!text || !text.text) return false;
    let targetTexts = {
        "近一月": true,
        "近三月": true,
        "近半年": true,
        "近一年": true,
        "今年": true,
        "自定义": true,
        "2022-03-12": true,
    };
    if (targetTexts[text.text]) return true;
    return layerRect.y >= 300 && layerRect.y <= 340 && text.name == "TXT";
}

function shouldUseTextFrameRect(text: Text): boolean {
    if (!text) return false;
    if (isTempProjectedSymbolText(text)) return true;
    if (isTempFragmentText(text)) return true;
    return !text.style || text.style.lineHeight === null || text.style.lineHeight === undefined;
}

function getNativeRect(text: Text, method: string): Rectangle | undefined {
    let nativeText = (text as any).sketchObject;
    if (!nativeText || !hasNativeMethod(nativeText, method)) return undefined;
    let value = callNative<any>(nativeText, method, undefined);
    if (!value || !value.origin || !value.size) return undefined;
    let x = Number(value.origin.x);
    let y = Number(value.origin.y);
    let width = Number(value.size.width);
    let height = Number(value.size.height);
    if (![x, y, width, height].every(item => isFinite(item))) return undefined;
    return new sketch.Rectangle(x, y, width, height);
}

function getDrawingPoint(text: Text): { x: number, y: number } | undefined {
    let nativeText = (text as any).sketchObject;
    if (!nativeText || !hasNativeMethod(nativeText, "drawingPointForText")) return undefined;
    let point = callNative<any>(nativeText, "drawingPointForText", undefined);
    if (!point) return undefined;
    let x = Number(point.x);
    let y = Number(point.y);
    if (![x, y].every(item => isFinite(item))) return undefined;
    return { x, y };
}

function rectToJSON(rect: { x: number, y: number, width: number, height: number }) {
    if (!rect) return undefined;
    return {
        x: normalizeNumber(rect.x),
        y: normalizeNumber(rect.y),
        width: normalizeNumber(rect.width),
        height: normalizeNumber(rect.height),
    };
}

function shouldMeasureTextByFit(text: Text, layerFrame: Rectangle): boolean {
    if (!text || !text.text) return false;
    if (/[\r\n\u2028]/.test(text.text)) return false;
    let lineHeight = text.style.lineHeight || text.style.fontSize || layerFrame.height;
    if (!lineHeight || !isFinite(lineHeight)) return false;
    return layerFrame.height <= lineHeight * 1.5;
}

function alignMeasuredText(measured: Text, layerFrame: Rectangle, original: Text) {
    let alignment = original.style ? original.style.alignment : undefined;
    let verticalAlignment = original.style ? original.style.verticalAlignment : undefined;
    let x = layerFrame.x;
    let y = layerFrame.y;

    switch (alignment) {
        case sketch.Text.Alignment.center:
            x = layerFrame.x + (layerFrame.width - measured.frame.width) / 2;
            break;
        case sketch.Text.Alignment.right:
            x = layerFrame.x + layerFrame.width - measured.frame.width;
            break;
        default:
            x = layerFrame.x;
            break;
    }

    switch (verticalAlignment) {
        case sketch.Text.VerticalAlignment.center:
            y = layerFrame.y + (layerFrame.height - measured.frame.height) / 2;
            break;
        case sketch.Text.VerticalAlignment.bottom:
            y = layerFrame.y + layerFrame.height - measured.frame.height;
            break;
        default:
            y = layerFrame.y;
            break;
    }

    measured.frame = new sketch.Rectangle(x, y, measured.frame.width, measured.frame.height);
}

function getTextFragmentRect(text: Text, layerFrame: Rectangle): SMRect | undefined {
    let fragments = (text as any).fragments as { rect?: SMRect }[] | undefined;
    if (!fragments || !fragments.length) return undefined;

    let rects = fragments
        .map(fragment => fragment && fragment.rect)
        .filter(Boolean)
        .filter(rect => isFinite(rect.x) && isFinite(rect.y) && isFinite(rect.width) && isFinite(rect.height));
    if (!rects.length) return undefined;

    let minX = Math.min(...rects.map(rect => rect.x));
    let minY = Math.min(...rects.map(rect => rect.y));
    let maxX = Math.max(...rects.map(rect => rect.x + rect.width));
    let maxY = Math.max(...rects.map(rect => rect.y + rect.height));

    return {
        x: layerFrame.x + minX,
        y: layerFrame.y + minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function safeRemove(layer?: Layer) {
    try {
        if (layer) layer.remove();
    } catch (error) {
        // ignore cleanup errors
    }
}

function snapRectToGrid(rect: SMRect): SMRect {
    let step = getDesignGridStep();
    let x1 = snapDown(rect.x, step);
    let y1 = snapDown(rect.y, step);
    let x2 = snapUp(rect.x + rect.width, step);
    let y2 = snapUp(rect.y + rect.height, step);
    return {
        x: normalizeNumber(x1),
        y: normalizeNumber(y1),
        width: normalizeNumber(Math.max(step, x2 - x1)),
        height: normalizeNumber(Math.max(step, y2 - y1)),
    };
}

function getDesignGridStep(): number {
    let resolution = context && context.configs ? context.configs.resolution : 1;
    if (!resolution || !isFinite(resolution) || resolution <= 0) return 1;
    return 1 / resolution;
}

function snapDown(value: number, step: number): number {
    return Math.floor(value / step) * step;
}

function snapUp(value: number, step: number): number {
    return Math.ceil(value / step) * step;
}

function normalizeNumber(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function normalizeRect(rect: SMRect): SMRect {
    return {
        x: normalizeNumber(rect.x),
        y: normalizeNumber(rect.y),
        width: normalizeNumber(rect.width),
        height: normalizeNumber(rect.height),
    };
}

function roundRectToGrid(rect: SMRect): SMRect {
    let step = getDesignGridStep();
    return {
        x: normalizeNumber(Math.round(rect.x / step) * step),
        y: normalizeNumber(Math.round(rect.y / step) * step),
        width: normalizeNumber(Math.round(rect.width / step) * step),
        height: normalizeNumber(Math.round(rect.height / step) * step),
    };
}

function getDisplayRect(text: Text, artboard: Artboard, fallbackRect: SMRect): SMRect {
    if (!isTempProjectedSymbolText(text)) return fallbackRect;
    let projectedRect = (text as any).__meaxureProjectedRect as SMRect | undefined;
    let rawFrame = projectedRect
        ? new sketch.Rectangle(projectedRect.x, projectedRect.y, projectedRect.width, projectedRect.height)
        : text.frame.changeBasis({ from: text.parent as Group, to: artboard });
    let visualRect = getPreferredTextVisualRect(text, artboard, rawFrame);
    if (visualRect) return snapRectToGrid(visualRect);
    return fallbackRect;
}

function getSliceDisplayRect(layer: Layer, fallbackRect: SMRect): SMRect {
    let aliasRect = getSliceAliasSymbolRect(layer, fallbackRect);
    if (aliasRect) return normalizeRect(aliasRect);

    let sourceLayer = getProjectedSourceLayer(layer);
    let sourceDisplayRect = getProjectedSourceDisplayRect(layer, sourceLayer);
    if (sourceDisplayRect && shouldPreferProjectedSourceSlice(layer, fallbackRect, sourceLayer)) {
        return normalizeRect(sourceDisplayRect);
    }
    let nativeOptions = getSliceNativeExportOptions(layer, sourceLayer, 0, fallbackRect);
    if (sourceLayer && nativeOptions && nativeOptions.requestRect) {
        let requestRect = normalizeRect(nativeOptions.requestRect);
        if (isValidSliceDisplayRectCandidate(fallbackRect, requestRect)) {
            return requestRect;
        }
    }

    let nativeLayer = (layer as any).sketchObject;
    if (!nativeLayer || typeof MSExportRequest === "undefined" || typeof MSSliceTrimming === "undefined") {
        return nativeOptions && nativeOptions.requestRect ? normalizeRect(nativeOptions.requestRect) : fallbackRect;
    }

    let request = getPrimaryExportRequest(nativeLayer);
    if (!request) {
        return nativeOptions && nativeOptions.requestRect ? normalizeRect(nativeOptions.requestRect) : fallbackRect;
    }

    let ancestry = hasNativeMethod(request, "layerAncestry") ? request.layerAncestry() : undefined;
    if (!ancestry) {
        return nativeOptions && nativeOptions.requestRect ? normalizeRect(nativeOptions.requestRect) : fallbackRect;
    }

    let shouldTrim = typeof nativeOptions?.shouldTrim == "boolean"
        ? nativeOptions.shouldTrim
        : hasNativeMethod(request, "shouldTrim") ? !!request.shouldTrim() : false;
    let candidates: SMRect[] = [];

    if (nativeOptions && nativeOptions.requestRect) {
        candidates.push(normalizeRect(nativeOptions.requestRect));
    }

    let requestRect = nativeValueToRect(hasNativeMethod(request, "rect") ? request.rect() : undefined);
    if (requestRect) candidates.push(requestRect);

    let ancestryRect = getNativeSliceRect("rectForLayerAncestry_withTrimming", ancestry, shouldTrim);
    if (ancestryRect) candidates.push(ancestryRect);

    if (!shouldTrim) {
        let safeRect = getNativeSliceRect("safeRectForLayerAncestry", ancestry);
        if (safeRect) candidates.push(safeRect);
    }

    let trimmedRect = getNativeSliceRect("trimmedRectForLayerAncestry", ancestry);
    if (trimmedRect) candidates.push(trimmedRect);

    let bestRect = pickBestSliceDisplayRect(fallbackRect, candidates);
    return bestRect || fallbackRect;
}

function getProjectedSourceDisplayRect(layer: Layer, sourceLayer?: Layer): SMRect | undefined {
    if (!layer || !sourceLayer) return undefined;
    let sourceFrame = getLayerFrameRect(sourceLayer);
    if (!sourceFrame) return undefined;
    let parentRect = getProjectedAbsoluteRect(layer.parent as Layer);
    if (!parentRect) return undefined;
    let scale = getProjectedParentScale(layer, sourceLayer);
    return normalizeRect({
        x: parentRect.x + sourceFrame.x * scale.x,
        y: parentRect.y + sourceFrame.y * scale.y,
        width: sourceFrame.width * scale.x,
        height: sourceFrame.height * scale.y,
    });
}

function getProjectedParentScale(layer: Layer, sourceLayer: Layer): { x: number, y: number } {
    let projectedParent = layer ? layer.parent as Layer : undefined;
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

function shouldUseDisplayRectAsSliceBounds(layer: Layer, fallbackRect: SMRect, displayRect: SMRect): boolean {
    if (!displayRect) return false;
    let aliasRect = getSliceAliasSymbolRect(layer, fallbackRect);
    if (!aliasRect) return false;
    return Math.abs(aliasRect.x - displayRect.x) < 0.01
        && Math.abs(aliasRect.y - displayRect.y) < 0.01
        && Math.abs(aliasRect.width - displayRect.width) < 0.01
        && Math.abs(aliasRect.height - displayRect.height) < 0.01;
}

function getSliceAliasSymbolRect(layer: Layer, fallbackRect: SMRect): SMRect | undefined {
    if (!layer) return undefined;
    let siblingRect = getSameNamedSliceSiblingRect(layer, fallbackRect);
    if (siblingRect) return siblingRect;
    let current = layer.parent as Layer;
    while (current) {
        if (isSameNamedSliceAlias(layer, current, fallbackRect)) {
            let rect = getProjectedAbsoluteRect(current);
            if (rect) return rect;
        }
        current = current.parent as Layer;
    }
    return undefined;
}

function getSameNamedSliceSiblingRect(layer: Layer, fallbackRect: SMRect): SMRect | undefined {
    if (!layer || !fallbackRect) return undefined;
    let parent = layer.parent as Layer;
    if (!parent) return undefined;
    let siblings = getChildLayers(parent);
    if (!siblings || !siblings.length) return undefined;

    let fallbackDistance = Math.max(fallbackRect.width, fallbackRect.height, 1) + 0.01;
    let matched: { rect: SMRect, distance: number }[] = [];
    siblings.forEach(sibling => {
        if (!sibling || sibling === layer) return;
        if (!isSameNamedSliceSiblingAlias(layer, sibling, fallbackRect)) return;
        let rect = getProjectedAbsoluteRect(sibling);
        if (!rect) return;

        let dx = Math.abs(rect.x - fallbackRect.x);
        let dy = Math.abs(rect.y - fallbackRect.y);
        if (dx > fallbackDistance || dy > fallbackDistance) return;
        matched.push({
            rect,
            distance: dx + dy,
        });
    });

    if (!matched.length) return undefined;
    matched.sort((a, b) => a.distance - b.distance);
    return matched[0].rect;
}

function isSameNamedSliceSiblingAlias(layer: Layer, sibling: Layer, fallbackRect: SMRect): boolean {
    if (!layer || !sibling || !fallbackRect) return false;
    if (String(layer.name || "") != String(sibling.name || "")) return false;
    if (sibling.type != sketch.Types.Group && sibling.type != sketch.Types.SymbolInstance) return false;

    let rect = getProjectedAbsoluteRect(sibling);
    if (!rect) return false;
    if (Math.abs(rect.width - fallbackRect.width) >= 0.01) return false;
    if (Math.abs(rect.height - fallbackRect.height) >= 0.01) return false;

    let siblingSource = getProjectedSourceLayer(sibling);
    if (siblingSource && String(siblingSource.name || "") != String(layer.name || "")) return false;
    return true;
}

function isSameNamedSliceAlias(layer: Layer, current: Layer, fallbackRect: SMRect): boolean {
    if (!layer || !current || !fallbackRect) return false;
    if (String(layer.name || "") != String(current.name || "")) return false;
    if (current.type != sketch.Types.Group && current.type != sketch.Types.SymbolInstance) return false;
    let rect = getProjectedAbsoluteRect(current);
    if (!rect) return false;
    return Math.abs(rect.width - fallbackRect.width) < 0.01
        && Math.abs(rect.height - fallbackRect.height) < 0.01;
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
    if (projectedRect) return normalizeRect(projectedRect);

    try {
        if (layer.frame) {
            let parentRect = getProjectedAbsoluteRect(layer.parent as Layer);
            if (!parentRect) return undefined;
            return normalizeRect({
                x: parentRect.x + Number(layer.frame.x),
                y: parentRect.y + Number(layer.frame.y),
                width: Number(layer.frame.width),
                height: Number(layer.frame.height),
            });
        }
    } catch (error) {
        return undefined;
    }
    return undefined;
}

function getPrimaryExportRequest(nativeLayer: any): any {
    try {
        let requests = MSExportRequest.exportRequestsFromExportableLayer(nativeLayer);
        if (!requests) return undefined;
        if (typeof requests.count == "function") return requests.count() > 0 ? requests.objectAtIndex(0) : undefined;
        if (Array.isArray(requests)) return requests[0];
        return requests[0];
    } catch (error) {
        return undefined;
    }
}

function getNativeSliceRect(method: string, ancestry: any, ...args: any[]): SMRect | undefined {
    if (!ancestry || !hasNativeMethod(MSSliceTrimming, method)) return undefined;
    try {
        let nativeRect = (MSSliceTrimming as any)[method](ancestry, ...args);
        return nativeValueToRect(nativeRect);
    } catch (error) {
        return undefined;
    }
}

function nativeValueToRect(value: any): SMRect | undefined {
    if (!value) return undefined;

    let cgRect = getNativeCGRect(value);
    let x = getNativeRectStructNumber(cgRect, "origin", "x");
    let y = getNativeRectStructNumber(cgRect, "origin", "y");
    let width = getNativeRectStructNumber(cgRect, "size", "width");
    let height = getNativeRectStructNumber(cgRect, "size", "height");
    if ([x, y, width, height].every(item => isFinite(item))) {
        return normalizeRect({ x, y, width, height });
    }

    x = getNativeRectNumber(value, "x");
    y = getNativeRectNumber(value, "y");
    width = getNativeRectNumber(value, "width");
    height = getNativeRectNumber(value, "height");
    if (![x, y, width, height].every(item => isFinite(item))) return undefined;
    return normalizeRect({ x, y, width, height });
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

function pickBestSliceDisplayRect(fallbackRect: SMRect, candidates: SMRect[]): SMRect | undefined {
    let valid = candidates
        .filter(Boolean)
        .filter(candidate => isValidSliceDisplayRectCandidate(fallbackRect, candidate));
    if (!valid.length) return undefined;

    let fallbackArea = Math.max(0, fallbackRect.width) * Math.max(0, fallbackRect.height);
    let smaller = valid
        .filter(candidate => rectArea(candidate) <= fallbackArea + 0.01)
        .sort((a, b) => rectArea(b) - rectArea(a));

    if (smaller.length) return smaller[0];
    return valid.sort((a, b) => rectArea(a) - rectArea(b))[0];
}

function isValidSliceDisplayRectCandidate(fallbackRect: SMRect, candidate: SMRect): boolean {
    if (!candidate) return false;
    if (![candidate.x, candidate.y, candidate.width, candidate.height].every(item => isFinite(item))) return false;
    if (candidate.width <= 0 || candidate.height <= 0) return false;

    let tolerance = Math.max(4, getDesignGridStep() * 8);
    let maxX = fallbackRect.x + fallbackRect.width + tolerance;
    let maxY = fallbackRect.y + fallbackRect.height + tolerance;
    let minX = fallbackRect.x - tolerance;
    let minY = fallbackRect.y - tolerance;
    let candidateX2 = candidate.x + candidate.width;
    let candidateY2 = candidate.y + candidate.height;

    return candidate.x >= minX
        && candidate.y >= minY
        && candidateX2 <= maxX
        && candidateY2 <= maxY;
}

function rectArea(rect: SMRect): number {
    return Math.max(0, rect.width || 0) * Math.max(0, rect.height || 0);
}

function isTempProjectedSymbolText(layer: Layer): boolean {
    let current = layer ? layer.parent as Group : undefined;
    while (current) {
        if (tempLayers.exists(current) && String(current.name || "").indexOf("#tmp-symbol-") >= 0) {
            return true;
        }
        current = current.parent as Group;
    }
    return false;
}

function isTempFragmentText(layer: Layer): boolean {
    return !!(layer as any).__meaxureFragmentText;
}

function isExportable(layer: Layer) {
    if (isStackLayout(layer)) return true;
    return layer.type == sketch.Types.Text ||
        layer.type == sketch.Types.Group ||
        layer.type == sketch.Types.Shape ||
        layer.type == sketch.Types.ShapePath ||
        layer.type == sketch.Types.Image ||
        layer.type == sketch.Types.Slice ||
        layer.type == sketch.Types.SymbolInstance ||
        layer.type == sketch.Types.HotSpot
}
function getLayerStates(layer: Layer): LayerStates {
    let isHidden = false;
    let isLocked = false;
    let isInSlice = false;
    let isEmptyText = false;
    let isMeaXure = false;
    let isInShapeGroup = false;

    while (layer.type != sketch.Types.Artboard && layer.type != sketch.Types.SymbolMaster) {
        let parent = layer.parent as Group;
        if (!isMeaXure) isMeaXure = layer.name.startsWith('#meaxure-');
        // if parents is shape, this is in shape group
        if (!isInShapeGroup) isInShapeGroup = parent.type == sketch.Types.Shape;
        if (!isHidden) isHidden = layer.hidden && !tempLayers.exists(layer);
        if (!isLocked) isLocked = layer.locked;
        if (!isInSlice) isInSlice = parent.type == sketch.Types.Group && parent.exportFormats.length > 0;
        if (!isEmptyText) isEmptyText = layer.type == sketch.Types.Text && (layer as Text).isEmpty
        layer = parent;
    }
    return {
        isHidden: isHidden,
        isLocked: isLocked,
        isInSlice: isInSlice,
        isMeaXure: isMeaXure,
        isEmptyText: isEmptyText,
        isInShapeGroup: isInShapeGroup
    }
}

function safeLayerStep(layer: Layer, step: string, fn: () => void) {
    try {
        fn();
    } catch (error) {
        logger.log(3, `Skip step "${step}" for layer "${layer.name}".`, error);
    }
}

function safeValue<T>(layer: Layer, step: string, fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch (error) {
        logger.log(3, `Use fallback for step "${step}" on layer "${layer.name}".`, error);
        return fallback;
    }
}
