import { project, state, localize } from "../common";
import { unitSize, getLayerRect } from "./helper";

export function slices() {
    const currentSliceIDs = new Set(state.current && state.current.layers
        .filter(layer => layer.exportable && layer.exportable.length > 0)
        .map(layer => layer.objectID));
    const visibleSlices = (project.slices || []).filter(sliceLayer =>
        sliceLayer.exportable.length > 0 &&
        (!state.currentPageSlicesOnly || currentSliceIDs.has(sliceLayer.objectID)));
    var sliceListHTML = [];
    sliceListHTML.push('<ul class="asset-list">');
    visibleSlices.forEach(sliceLayer => {
        if (sliceLayer.exportable.length > 0) {
            let rect = getLayerRect(sliceLayer as any);
            var asset = JSON.parse(JSON.stringify(sliceLayer.exportable)).pop();
            sliceListHTML.push(
                '<li id="slice-' + sliceLayer.objectID + '" class="slice-layer" data-objectId="' + sliceLayer.objectID + '">',
                '<picture><img src="' + 'assets/' + asset.path + '" alt=""></picture>',
                '<div>',
                '<h3>' + sliceLayer.name + '</h3>',
                '<small>' + unitSize(rect.width) + ' × ' + unitSize(rect.height) + '</small>',
                '</div>',
                '</li>');
        }
    });
    sliceListHTML.push('</ul>');
    document.querySelector('#slice-list').innerHTML = visibleSlices.length > 0
        ? sliceListHTML.join('')
        : `<div class="empty">${localize(state.currentPageSlicesOnly ? 'No slices on current page' : 'No slices added!')}</div>`;
}
