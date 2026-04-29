// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { toHTMLEncode } from "../helpers/helper";
import { getTintInfo, TintInfo } from "./tint";
import { getChildLayers } from "../../sketch/compat";
import { sketch } from "../../sketch";

export enum LayerPlaceholderType {
    Tint,
}
export class LayerPlaceholder {
    private _type: LayerPlaceholderType;
    private _value: Object;
    static fromTint(tint: TintInfo): LayerPlaceholder {
        let h = new LayerPlaceholder();
        h._type = LayerPlaceholderType.Tint;
        h._value = tint;
        return h;
    }
    getValue<T>(): T {
        return this._value as T;
    }
    getType(): LayerPlaceholderType {
        return this._type;
    }
}
// getChildrenForExport gets all children of the layer for export, it makes sure:
// 1. Order: children first, then their parent
// 2. Tint placeholder: insert it when parent group contains tint. Because according to 
// the order above, we met the parent last.
export function getChildrenForExport(layer: Layer): [(Layer | LayerPlaceholder)[], number] {
    let layers: (Layer | LayerPlaceholder)[] = [];
    let count = 0;
    enumLayers(layer);
    function enumLayers(layer: Layer) {
        let t = getTintInfo(layer)
        if (t) {
            layers.push(t)
        }
        // Symbol instances are exported via `getSymbol`, so walking their live
        // children here causes nested symbol content to be exported twice.
        if (layer.type != sketch.Types.SymbolInstance) {
            getChildLayers(layer).forEach(l => enumLayers(l));
        }
        count++;
        layers.push(layer)
    }
    return [layers, count];
}
