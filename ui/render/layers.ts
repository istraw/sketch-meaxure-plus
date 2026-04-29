import { state, project } from "../common";
import { zoomSize, percentageSize, unitSize, getLayerRect } from "./helper";
import { SMType } from "../../src/meaxure/interfaces";

export var MapArtboardIDToIndex: { [key: string]: number } = undefined;
export function layers() {
    specLayers();
    flowLayers();
}

function specLayers() {
    let layersHTML = [];
    state.current.layers.forEach((layer, index) => {
        if (layer.type == SMType.group && !layer.isStackLayout) return;
        if (layer.type == SMType.group && layer.isStackLayout && !hasInspectableStackStyle(layer)) return;
        if (layer.type == SMType.hotspot) return;
        let rect = getLayerRect(layer);
        let sliceRangeRect = layer.type == SMType.slice ? (layer.rect || rect) : rect;
        let x = zoomSize(rect.x);
        let y = zoomSize(rect.y);
        let width = zoomSize(rect.width);
        let height = zoomSize(rect.height);
        let boxX = 0;
        let boxY = 0;
        let boxWidth = width;
        let boxHeight = height;
        let sliceRangeStyle = layer.type == SMType.slice ? [
            'left: ' + zoomSize(sliceRangeRect.x - rect.x) + 'px',
            'top: ' + zoomSize(sliceRangeRect.y - rect.y) + 'px',
            'width: ' + zoomSize(sliceRangeRect.width) + 'px',
            'height: ' + zoomSize(sliceRangeRect.height) + 'px'
        ].join('; ') : '';
        let classNames = ['layer'];
        classNames.push('layer-' + layer.objectID);
        if (layer.exportable && layer.exportable.length) classNames.push('slice-bounds');
        if (state.selectedIndex == index) classNames.push('selected');
        layersHTML.push([`
<div id="layer-${index}" 
    class="${classNames.join(' ')}" data-index="${index}" 
    style="left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;"
>
    <div class="layer-box"
        percentage-width="${percentageSize(rect.width, state.current.width)}" 
        percentage-height="${percentageSize(rect.height, state.current.height)}" 
        data-width="${unitSize(rect.width)}" 
        data-height="${unitSize(rect.height)}" 
        style="left: ${boxX}px; top: ${boxY}px; width: ${boxWidth}px; height: ${boxHeight}px;"
    >
        <em class="slice-range-frame" style="${sliceRangeStyle}"></em>
        <i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i>
        <b class="et h"></b><b class="er v"></b><b class="eb h"></b><b class="el v"></b>
    </div>
</div>`].join(''));
    });
    let layers = document.querySelector('#layers');
    layers.innerHTML = layersHTML.join('');
    layers.classList.toggle('show-slice-bounds', state.showSliceBounds);
}

function hasInspectableStackStyle(layer: any): boolean {
    return !!((layer.fills && layer.fills.length) || (layer.borders && layer.borders.length));
}

function flowLayers() {
    MapArtboardIDToIndex = project.artboards.reduce((p, c, i) => {
        p[c.objectID] = i;
        return p;
    }, { 'back': -1 });
    let layersHTML = [];
    state.current.layers.filter(layer => layer.flow && MapArtboardIDToIndex[layer.flow.targetId] !== undefined)
        .forEach((layer, index) => {
            let rect = getLayerRect(layer);
            let x = zoomSize(rect.x);
            let y = zoomSize(rect.y);
            let width = zoomSize(rect.width);
            let height = zoomSize(rect.height);
            let classNames = ['flow'];
            layersHTML.push([`
<div class="${classNames.join(' ')}"
    data-flow-target="${layer.flow.targetId}"
    style="left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;"
></div>`].join(''));
        });
    document.querySelector('#flows').innerHTML = layersHTML.join('');
}
