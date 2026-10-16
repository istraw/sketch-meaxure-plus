import { LayerStates } from "../interfaces";
import { sketch } from "../../sketch";
import { tempLayers } from "./tempLayers";

let states = new Map<string, LayerStates>();
export function clearLayerStateCache() { states.clear(); }
function emptyStates(): LayerStates {
    return { isHidden: false, isLocked: false, isInSlice: false, isMeaXure: false, isEmptyText: false, isInShapeGroup: false };
}
// Parent getters produce new Sketch wrappers. Reuse inherited booleans during
// one synchronous batch, including its projected Symbol children. The session
// invalidates the cache after yielding; marker renames also invalidate it.
export function getLayerStates(layer: Layer): LayerStates {
    let chain: { layer: Layer; parent: Layer }[] = [];
    let active = new Set<string>();
    let inherited = emptyStates();
    let current = layer;
    while (current.type != sketch.Types.Artboard && current.type != sketch.Types.SymbolMaster) {
        let cached = states.get(current.id);
        if (cached) { inherited = cached; break; }
        if (active.has(current.id)) throw new Error('Cyclic layer ancestry: ' + current.name);
        active.add(current.id);
        let parent = current.parent as Layer;
        if (!parent) throw new Error('Layer has no artboard or Symbol master ancestor: ' + current.name);
        chain.push({ layer: current, parent });
        current = parent;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
        let item = chain[i];
        let node = item.layer;
        inherited = {
            isMeaXure: inherited.isMeaXure || node.name.startsWith('#meaxure-'),
            isInShapeGroup: inherited.isInShapeGroup || item.parent.type == sketch.Types.Shape,
            isHidden: inherited.isHidden || (node.hidden && !tempLayers.exists(node)),
            isLocked: inherited.isLocked || node.locked,
            isInSlice: inherited.isInSlice || (item.parent.type == sketch.Types.Group && item.parent.exportFormats.length > 0),
            isEmptyText: inherited.isEmptyText || (node.type == sketch.Types.Text && (node as Text).isEmpty),
        };
        states.set(node.id, inherited);
    }
    return inherited;
}
