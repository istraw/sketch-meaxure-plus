class TempLayersManager {
    private _layers: Layer[] = [];
    private _idMap: { [key: string]: boolean } = {};
    constructor() { }
    removeAll() {
        for (let tmp of this._layers) {
            try {
                if (tmp) tmp.remove();
            } catch (error) {
                // ignore temp cleanup errors
            }
        }
        this._layers = [];
        this._idMap = {};
    }
    add(layer: Layer) {
        layer.name = '#tmp-' + layer.name;
        layer.hidden = true;
        this._layers.push(layer);
        this._idMap[layer.id] = true;
    }
    exists(layerID: string): boolean;
    exists(layer: Layer): boolean;
    exists(para: string | Layer): boolean {
        let id = (typeof para == 'string') ? para : para.id;
        return this._idMap[id];
    }

    purgeByNamePrefix(document: Document, prefix: string = '#tmp-') {
        if (!document || !document.pages) return;
        document.pages.forEach(page => {
            sweep(page);
        });

        function sweep(layer: any) {
            let children = layer.layers ? Array.from(layer.layers) : [];
            children.forEach((child: any) => sweep(child));
            if (layer !== document && layer.name && String(layer.name).startsWith(prefix)) {
                try {
                    layer.remove();
                } catch (error) {
                    // ignore best-effort cleanup failures
                }
            }
        }
    }
}

export let tempLayers = new TempLayersManager();
