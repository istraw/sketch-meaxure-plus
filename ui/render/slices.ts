import { project } from "../common";
import { unitSize, getLayerRect } from "./helper";

export function slices() {
    if (!project.slices) {
        return false;
    }
    var sliceListHTML = [];
    sliceListHTML.push('<ul class="asset-list">');
    project.slices.forEach(sliceLayer => {
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
    if (project.slices.length > 0) {
        document.querySelector('#slices').innerHTML = sliceListHTML.join('');
    }
}
