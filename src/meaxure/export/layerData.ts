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
import { getSlice } from "./slice";
import { makeNote } from "./note";
import { getSymbol } from "./symbol";
import { applyTint, pushTintStack, TintInfo, updateTintStackBeforeLayer } from "./tint";
import { stopwatch } from ".";
import { getFlow } from "./flow";
import { tempLayers } from "./tempLayers";
import { renameIfIsMarker } from "../helpers/renameOldMarkers";
import { LayerPlaceholder, LayerPlaceholderType } from "./layers";
import { logger } from "../common/logger";
import { callNative } from "../../sketch/compat";

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
    data.layers.push(layerData);
    safeLayerStep(layer, 'get flow', () => getFlow(layer, layerData));
    // stopwatch.tik('getFlow');
    if (layerType == SMType.hotspot) {
        return;
    }
    // stopwatch.tik('prepare layer data');
    safeLayerStep(layer, 'get styles', () => getLayerStyles(layer, layerType, layerData));
    // stopwatch.tik('getLayerStyles');
    safeLayerStep(layer, 'apply tint', () => applyTint(layer, layerData));
    // stopwatch.tik('applyTint');
    safeLayerStep(layer, 'get slice', () => getSlice(layer, layerData, symbolLayer));
    // stopwatch.tik('getSlice');
    if (layerData.type == SMType.symbol) {
        safeLayerStep(layer, 'get symbol', () => getSymbol(artboard, layer as SymbolInstance, layerData, data, byInfluence));
    }
    safeLayerStep(layer, 'get text fragment', () => getTextFragment(artboard, layer as Text, data));
    // stopwatch.tik('getTextFragment');
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

function getLayerStyles(layer: Layer, layerType: SMType, layerData: LayerData) {
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
        layerData.color = parseColor(text.style.textColor);
        layerData.fontSize = text.style.fontSize;
        layerData.fontFace = text.style.fontFamily;
        layerData.textAlign = text.style.alignment;
        layerData.letterSpacing = text.style.kerning || 0;
        layerData.lineHeight = text.style.lineHeight;
    }
    layerData.css = safeValue(layer, 'get css', () => layer.CSSAttributes.filter(attr => !/\/\*/.test(attr)), []);
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
    let layerFrame: Rectangle;
    if (byInfluence && layer.type != sketch.Types.Text) {
        // export the influence rect.(include the area of shadows and outside borders...)
        layerFrame = layer.frameInfluence.changeBasis({ from: layer.parent as Group, to: artboard });
    } else {
        // export the default rect.
        layerFrame = layer.frame.changeBasis({ from: layer.parent as Group, to: artboard });
    }
    return {
        x: layerFrame.x,
        y: layerFrame.y,
        width: layerFrame.width,
        height: layerFrame.height,
    }
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
