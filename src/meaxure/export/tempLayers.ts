class TempLayersManager {
    private layers = new Map<string, Layer>();
    private removed = new WeakSet<Layer>();
    removeAll() {
        // Only remove layers owned by this export. A document-wide name sweep
        // is expensive and can delete user layers named with the same prefix.
        for (let layer of Array.from(this.layers.values()).reverse()) {
            try { this.remove(layer); } catch (error) { /* best-effort cleanup */ }
        }
        this.layers.clear();
        this.removed = new WeakSet<Layer>();
    }
    add(layer: Layer, hidden: boolean = true) {
        layer.name = '#tmp-' + layer.name;
        layer.hidden = hidden;
        this.layers.set(layer.id, layer);
    }
    remove(layer: Layer) {
        if (!layer || this.removed.has(layer)) return;
        let id = layer.id;
        layer.remove();
        this.layers.delete(id);
        this.removed.add(layer);
    }
    exists(para: string | Layer): boolean {
        return !!para && this.layers.has(typeof para === 'string' ? para : para.id);
    }
}
export let tempLayers = new TempLayersManager();
