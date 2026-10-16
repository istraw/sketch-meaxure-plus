// Sketch's overridesForExpandedLayer rebuilds and filters the entire overrides
// array on every call. Index one immutable view for each symbol export instead.
type IndexedOverride = SymbolInstance["overrides"][number];
let indices = new WeakMap<SymbolInstance, Map<string, IndexedOverride[]>>();

export function clearSymbolOverrideIndex(instance: SymbolInstance) {
    indices.delete(instance);
}

export function getIndexedExpandedOverrides(instance: SymbolInstance, layer: Layer): IndexedOverride[] {
    let ancestry = (layer as any)._detachedSymbolAncestry;
    let objectIDs = ancestry ? ancestry.objectIDs() : [];
    // Match Sketch 2026.3's own path calculation. Preserve the SDK fallback if
    // another version exposes a different ancestry representation.
    if (!Array.isArray(objectIDs)) {
        return (instance as any).overridesForExpandedLayer(layer) || [];
    }
    let path = objectIDs.concat(layer.id).join("/");
    let index = indices.get(instance);
    if (!index) {
        index = new Map<string, IndexedOverride[]>();
        let overrides = instance.overrides || [];
        for (let override of overrides) {
            let key = String(override.path);
            let items = index.get(key);
            if (!items) {
                items = [];
                index.set(key, items);
            }
            items.push(override);
        }
        indices.set(instance, index);
    }
    return index.get(path) || [];
}
