// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { sketch } from "..";
import { callNative, getChildLayers, hasNativeMethod } from "../compat";
import { alignLayers, alignLayersByPosition } from "./alignment";
import { Edge, EdgeVertical } from "./alignment";
import { getResizingConstraint, setResizingConstraint } from "./resizingConstraint";

declare module 'sketch/sketch' {
    namespace _Sketch {
        interface Layer {
            frameInfluence: Rectangle;
            shouldBreakMaskChain: boolean;
            hasClippingMask: boolean;
            CSSAttributes: string[];
            resizingConstraint: number;
            getAllChildren(): Layer[];
            alignTo(
                target: Layer | Rectangle,
                horizontal?: { from: Edge, to: Edge } | boolean,
                vertical?: { from: EdgeVertical, to: EdgeVertical } | boolean
            ): void;
            alignToByPostion(target: Layer | Rectangle, position: Edge | EdgeVertical): void;
        }
    }
}

export function extendLayer() {
    let target = sketch.Layer.prototype
    Object.defineProperty(target, "frameInfluence", {
        get: function () {
            let parent: Layer;
            if ((this as Layer).type == sketch.Types.Page) {
                return new sketch.Rectangle(0, 0, 0, 0);
            } else {
                parent = (this as Layer).parent as Group;
            }
            let parentAbsoluteRect = hasNativeMethod(parent.sketchObject, "absoluteRect") ?
                callNative<any>(parent.sketchObject, "absoluteRect", undefined) :
                undefined;
            let parentRect = parentAbsoluteRect ?
                parentAbsoluteRect.rect() :
                NSMakeRect(parent.frame.x, parent.frame.y, parent.frame.width, parent.frame.height);
            let influenceCGRect = hasNativeMethod(this.sketchObject, "absoluteInfluenceRect") ?
                callNative<any>(this.sketchObject, "absoluteInfluenceRect", undefined) :
                undefined;
            if (!influenceCGRect) {
                let absoluteRect = callNative<any>(this.sketchObject, "absoluteRect", undefined);
                influenceCGRect = absoluteRect ? absoluteRect.rect() : NSMakeRect(this.frame.x, this.frame.y, this.frame.width, this.frame.height);
            }
            return new sketch.Rectangle(
                influenceCGRect.origin.x - parentRect.origin.x,
                influenceCGRect.origin.y - parentRect.origin.y,
                influenceCGRect.size.width,
                influenceCGRect.size.height,
            );
        }
    });
    Object.defineProperty(target, "shouldBreakMaskChain", {
        get: function (): boolean {
            return !!callNative(this.sketchObject, "shouldBreakMaskChain", false);
        }
    });
    Object.defineProperty(target, "hasClippingMask", {
        get: function (): boolean {
            return !!callNative(this.sketchObject, "hasClippingMask", false);
        }
    });
    Object.defineProperty(target, "CSSAttributes", {
        get: function () {
            let layerCSSAttributes = callNative<any>(this.sketchObject, "CSSAttributes", []);
            let css = [];
            if (layerCSSAttributes && layerCSSAttributes.count) {
                for (let i = 0; i < layerCSSAttributes.count(); i++) {
                    let attribute = new String(layerCSSAttributes[i]).toString();
                    css.push(attribute);
                }
            }
            if (this.sketchObject.font && this.sketchObject.font()) {
                const fontWeightCss = `font-weight: ${AppKitWeightToCssWeightIndex[Number(NSFontManager.sharedFontManager().weightOfFont(this.sketchObject.font()))]};`;
                css.push(fontWeightCss);
            } else if (this.style && this.style.fontWeight) {
                css.push(`font-weight: ${this.style.fontWeight};`);
            }
            return css;
        }
    });
    Object.defineProperty(target, "resizingConstraint", {
        get: function (): number {
            return getResizingConstraint(this);
        },
        set: function (value: number) {
            setResizingConstraint(this, value);
        }
    });
    target.getAllChildren = function (): Layer[] {
        let layers: Layer[] = [];
        enumLayers(this);
        function enumLayers(layer: Layer) {
            getChildLayers(layer).forEach(l => enumLayers(l));
            layers.push(layer)
        }
        return layers;
    }
    target.alignTo = function (
        target: Layer | Rectangle,
        horizontal?: { from: Edge, to: Edge } | boolean,
        vertical?: { from: EdgeVertical, to: EdgeVertical } | boolean
    ) {
        alignLayers(this, target, horizontal, vertical);
    };
    target.alignToByPostion = function (target: Layer | Rectangle, position: Edge | EdgeVertical) {
        alignLayersByPosition(this, target, position);
    };
}

const AppKitWeightToCssWeightIndex = [100, 100, 100, 200, 300, 400, 500, 500, 600, 700, 800, 900, 900, 900, 900, 900];
