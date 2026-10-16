import { localize } from "../../common";
import { LayerData } from "../../../src/meaxure/interfaces";
import { unitSize, getLayerRect } from "../helper";
import { propertyType } from "./shared";
export function renderProperties(layerData: LayerData): string {
    let rect = getLayerRect(layerData);
    let position = [
        '<div class="item" data-label="' + localize('Position') + ':">',
        '<label data-label="' + localize('X') + '"><input id="position-x" type="text" value="' + unitSize(rect.x) + '" readonly="readonly"></label>',
        '<label data-label="' + localize('Y') + '"><input id="position-y" type="text" value="' + unitSize(rect.y) + '" readonly="readonly"></label>',
        '</div>'
    ].join('');
    let size = [
        '<div class="item" data-label="' + localize('Size') + ':">',
        '<label data-label="' + localize('Width') + '"><input id="size-width" type="text" value="' + unitSize(rect.width) + '" readonly="readonly"></label>',
        '<label data-label="' + localize('Height') + '"><input id="size-height" type="text" value="' + unitSize(rect.height) + '" readonly="readonly"></label>',
        '</div>'
    ].join('');
    let opacity = (typeof layerData.opacity == 'number') ? [
        '<div class="item" data-label="' + localize('Opacity') + ':">',
        '<label><input id="opacity" type="text" value="' + Math.round(layerData.opacity * 10000) / 100 + '%" readonly="readonly"></label>',
        '<label></label>',
        '</div>'
    ].join('') : '';
    const radii = layerData.radius;
    const hasRadius = radii && radii.length && radii.every(value => typeof value === 'number' && isFinite(value) && value >= 0);
    const mixedRadius = hasRadius && radii.some(value => value !== radii[0]);
    let radius = hasRadius ? [
        '<div class="item" data-label="' + localize('Radius') + ':">',
        '<label><input id="radius" aria-label="' + localize('Radius') + '" type="text" value="' +
            (mixedRadius ? radii.map(value => unitSize(value)).join(' / ') : unitSize(radii[0])) + '" readonly="readonly"></label>',
        mixedRadius ? '' : '<label></label>',
        '</div>'
    ].join('') : '';
    let styleName = (layerData.styleName) ? [
        '<div class="item" data-label="' + localize('Style') + ':">',
        '<label><input id="styleName" type="text" value="' + layerData.styleName + '" readonly="readonly"></label>',
        '</div>'
    ].join('') : '';
    return propertyType('PROPERTIES', [position, size, opacity, radius, styleName].join(''));
}
