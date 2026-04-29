// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { SMRect } from "../interfaces";
import { getIntersection } from "../helpers/helper";

interface MaskStackData {
    mask: Layer,
    stopAt: Layer,
    rect: SMRect,
}
let maskStack: MaskStackData[] = [];

export function clearMaskStack(): void {
    maskStack = [];
}
export function updateMaskStackBeforeLayer(layer: Layer) {
    // This function depends on the enumerate order of layers.
    // It requires the enumeration order from bottom layer to up, 
    // children first siblings later, which is same to mask influence direction.
    // So we firstly meet the mask layer, then it's influenced siblings and their children.

    // check if masks still applies
    validateMasks(layer);
    tryAddMask(layer);
}
export function applyMasks(layer: Layer, layerRect: SMRect, artboard: Artboard): SMRect {
    // if (maskStack.length) logger.debug(`${layer.name} has clip mask of ${maskStack.reduce((p, c) => p += c.mask.name + ',', '')}`)
    for (let mask of maskStack) {
        // caculate intersection of layer and mask, as the clipped frame of the layer
        layerRect = getIntersection(mask.rect, layerRect);
    }
    // Layer rects are exported in artboard-local coordinates, so use an explicit
    // local artboard rect here instead of `changeBasis()`. On recent Sketch
    // versions that conversion can return page-space coordinates and clip away
    // the whole top portion of the artboard.
    layerRect = getIntersection({
        x: 0,
        y: 0,
        width: artboard.frame.width,
        height: artboard.frame.height,
    }, layerRect);
    return layerRect;
}
function validateMasks(layer: Layer) {
    if (!maskStack.length) return;
    // Remove masks once we leave the sibling range they can affect.
    // Newer Sketch versions don't always enumerate layers in the exact
    // sequence this exporter originally assumed, so relying only on a
    // single `stopAt` sentinel can leave a top-level mask active for
    // unrelated siblings and clip whole regions away.
    for (let i = maskStack.length - 1; i >= 0; i--) {
        let m = maskStack[i];
        if (layer.id === m.stopAt.id || !maskAffectsLayer(m, layer)) {
            maskStack.pop();
            continue;
        }
        break;
    }
}

function maskAffectsLayer(maskData: MaskStackData, layer: Layer): boolean {
    let mask = maskData.mask;
    if (!mask || !mask.parent) return false;

    let siblingAtMaskParent = getAncestorAtParent(layer, mask.parent as Group);
    if (!siblingAtMaskParent) return false;
    if (siblingAtMaskParent.id === mask.id) return false;
    if (siblingAtMaskParent.index <= mask.index) return false;

    let stopAt = maskData.stopAt;
    if (!stopAt || stopAt.id === (mask.parent as Layer).id) return true;
    if (siblingAtMaskParent.parent !== stopAt.parent) return true;
    return siblingAtMaskParent.index < stopAt.index;
}

function getAncestorAtParent(layer: Layer, parent: Group): Layer | undefined {
    let current: Layer = layer;
    while (current && current.parent) {
        if (current.parent.id === parent.id) return current;
        current = current.parent as Layer;
    }
    return undefined;
}
function tryAddMask(layer: Layer) {
    if (!layer.hasClippingMask) {
        return
    }
    // find a mask, keep in stack. 
    let stopAt: Layer;
    let sibilings = (layer.parent as Group).layers;
    for (let i = layer.index + 1; i < sibilings.length; i++) {
        if (sibilings[i].shouldBreakMaskChain) {
            stopAt = sibilings[i];
            break;
        }
    }
    if (!stopAt) stopAt = layer.parent as Layer;
    // console.log(`find mask ${layer.name} will stop at layer ${stopAt.name}`);
    maskStack.push({
        mask: layer,
        stopAt: stopAt,
        rect: layer.frame.changeBasis({
            from: layer.parent as Group,
            to: layer.getParentArtboard(),
        })
    });
}
