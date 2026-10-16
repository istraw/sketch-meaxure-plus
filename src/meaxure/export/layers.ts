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
export function getChildrenForExport(layer: Layer, shouldDescend?: (layer: Layer) => boolean): [(Layer | LayerPlaceholder)[], number] {
    let layers: (Layer | LayerPlaceholder)[] = [];
    let count = 0;
    let active = new Set<any>();
    let stack = [{ layer, exiting: false }];
    while (stack.length) {
        let item = stack.pop();
        let current = item.layer;
        let key = current.id || current;
        if (item.exiting) {
            active.delete(key);
            count++;
            layers.push(current);
            continue;
        }
        if (active.has(key)) throw new Error("Cyclic layer hierarchy: " + current.name);
        active.add(key);
        let tint = getTintInfo(current);
        if (tint) layers.push(tint);
        stack.push({ layer: current, exiting: true });
        if (current.type != sketch.Types.SymbolInstance && (shouldDescend ? shouldDescend(current) : shouldDescendSource(current))) {
            let children = getChildLayers(current);
            for (let i = children.length - 1; i >= 0; i--) {
                stack.push({ layer: children[i], exiting: false });
            }
        }
    }
    return [layers, count];
}

function shouldDescendSource(layer: Layer): boolean {
    // Shape children are paths, never independent annotations or note Groups.
    if (sketch.Types.Shape && layer.type == sketch.Types.Shape) return false;
    const excluded = layer.hidden || layer.locked
        || (sketch.Types.Group && layer.type == sketch.Types.Group && layer.exportFormats.length > 0)
        || /^#meaxure-/.test(layer.name || '');
    if (!excluded) return true;
    // Notes bypass the usual visibility/lock/slice filters. Only prune a
    // subtree after confirming that it cannot contain a note, including old
    // marker names that will be normalized during export.
    const pending = [layer];
    const seen = new Set<any>();
    while (pending.length) {
        const current = pending.pop();
        const key = current.id || current;
        if (seen.has(key)) continue;
        seen.add(key);
        if (/^(#meaxure-note-|#note|NOTE#)/.test(current.name || '')) return true;
        if (current.type == sketch.Types.SymbolInstance || (sketch.Types.Shape && current.type == sketch.Types.Shape)) continue;
        pending.push(...getChildLayers(current));
    }
    return false;
}
