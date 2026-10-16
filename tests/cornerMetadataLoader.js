// Test-only bundle transform: reuse production traversal/geometry while
// collecting corners, without re-rendering assets or reconstructing text.
module.exports=function(source){
    if(!this.resourcePath.endsWith('/meaxure/export/layerData.ts'))return source;
    const replacements=[
        ["safeLayerStep(layer, 'get styles', () => getLayerStyles(artboard, layer, layerType, layerRect, layerData, symbolLayer));","layerData.radius = safeValue(layer, 'get radius', () => getLayerRadius(layer), undefined);"],
        ["safeLayerStep(layer, 'apply tint', () => applyTint(layer, layerData));",''],
        ["safeLayerStep(layer, 'get slice', () => getSlice(layer, layerData, symbolLayer));",''],
        ['const pending = getTextFragment(artboard, layer as Text, data);','const pending: Promise<void> | void = undefined;'],
    ];
    for(const [before,after] of replacements){if(!source.includes(before))throw Error('Corner metadata harness no longer matches production traversal');source=source.replace(before,after);}
    return source;
};
