interface TreeCache { roots: Layer[]; children: Map<string, Layer[]>; }
let trees = new WeakMap<SymbolInstance, Map<string, TreeCache>>();
export function clearSymbolTreeCache(instance: SymbolInstance) { trees.delete(instance); }
function getTree(instance: SymbolInstance, kind: string, load: () => Layer[]): TreeCache {
    let scopes = trees.get(instance);
    if (!scopes) { scopes = new Map(); trees.set(instance, scopes); }
    let tree = scopes.get(kind);
    if (!tree) { tree = { roots: load() || [], children: new Map() }; scopes.set(kind, tree); }
    return tree;
}
export function getCachedSymbolRoots(instance: SymbolInstance, kind: string, load: () => Layer[]): Layer[] {
    return getTree(instance, kind, load).roots;
}
export function getCachedSymbolLayer(instance: SymbolInstance, kind: string, load: () => Layer[], children: (layer: Layer) => Layer[], path: string): Layer | undefined {
    if (!/^\d+(\/\d+)*$/.test(path)) return undefined;
    let tree = getTree(instance, kind, load);
    let parts = path.split('/');
    let siblings = tree.roots;
    let prefix = '';
    let layer: Layer;
    for (let i = 0; i < parts.length; i++) {
        layer = siblings[Number(parts[i])];
        if (!layer) return undefined;
        if (i === parts.length - 1) return layer;
        prefix += (prefix ? '/' : '') + parts[i];
        let cached = tree.children.get(prefix);
        if (!cached) { cached = children(layer); tree.children.set(prefix, cached); }
        siblings = cached;
    }
    return layer;
}
