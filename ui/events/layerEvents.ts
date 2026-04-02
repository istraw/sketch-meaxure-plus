import { project, state } from "../common";
import { getIndex, mouseoutLayer, selectedLayer, removeSelected, getEventTarget } from "./helper";
import { inspector } from "../render/inspector";
import { distance, hideDistance } from "./distance";
import { SMRect, SMType } from "../../src/meaxure/interfaces";
import { panMode } from "./panMode";

let lastHitSignature = '';

export function layerEvents() {
    document.body.addEventListener('click', function (event) {
        if (panMode) return;
        if (getEventTarget(document.body, event, 'header, #inspector, .navbar')) {
            event.stopPropagation();
            return;
        }
        let target = event.target as HTMLElement;
        if (target.classList.contains('layer') || target.classList.contains('slice-layer')) {
            var selected = (!target.classList.contains('slice-layer')) ?
                target :
                document.querySelector('.layer-' + target.dataset.objectid) as HTMLElement;
            if (target.classList.contains('slice-layer')) {
                selectLayerByIndex(getIndex(selected));
                return;
            }
            let nextIndex = getNextHitLayerIndex(event as MouseEvent, getIndex(selected));
            selectLayerByIndex(nextIndex);
            return;
        }
        lastHitSignature = '';
        removeSelected();
    });
    document.body.addEventListener('mousemove', function (event) {
        if (panMode) return;
        mouseoutLayer();
        hideDistance();
        let target = event.target as HTMLElement;
        if (target.classList.contains('screen-viewer') || target.classList.contains('screen-viewer-inner')) {
            state.tempTargetRect = getEdgeRect(event);
            state.targetIndex = undefined;
            distance();
        } else if (target.classList.contains('layer')) {
            state.targetIndex = getIndex(event.target as HTMLElement);
            state.tempTargetRect = undefined;
            mouseoverLayer();
            distance();
        } else {
            state.tempTargetRect = undefined;
        }
    });
}

function selectLayerByIndex(index: number) {
    state.selectedIndex = index;
    hideDistance();
    mouseoutLayer();
    selectedLayer();
    inspector();
}

function getNextHitLayerIndex(event: MouseEvent, fallbackIndex: number): number {
    let point = getClickPoint(event);
    if (!point) return fallbackIndex;

    let hitIndices = state.current.layers
        .map((layer, index) => ({ layer, index }))
        .filter(item => item.layer
            && !(item.layer.type == SMType.group && !item.layer.isStackLayout)
            && !(item.layer.type == SMType.group && item.layer.isStackLayout && !hasInspectableStackStyle(item.layer))
            && item.layer.type != SMType.hotspot
            && containsPoint(item.layer.rect, point))
        .sort((a, b) => compareHitLayer(a.layer, b.layer, a.index, b.index))
        .map(item => item.index);

    if (!hitIndices.length) return fallbackIndex;
    if (hitIndices.length === 1) {
        lastHitSignature = buildHitSignature(point, hitIndices);
        return hitIndices[0];
    }

    let signature = buildHitSignature(point, hitIndices);
    if (signature !== lastHitSignature || state.selectedIndex === undefined) {
        lastHitSignature = signature;
        return hitIndices[0];
    }

    let currentPos = hitIndices.indexOf(state.selectedIndex);
    if (currentPos < 0) {
        lastHitSignature = signature;
        return hitIndices[0];
    }
    return hitIndices[(currentPos + 1) % hitIndices.length];
}

function getClickPoint(event: MouseEvent) {
    let screen = document.querySelector('#screen') as HTMLElement;
    if (!screen) return undefined;
    let rect = screen.getBoundingClientRect();
    let x = (event.clientX - rect.left) * project.resolution / state.zoom;
    let y = (event.clientY - rect.top) * project.resolution / state.zoom;
    return { x, y };
}

function containsPoint(rect: SMRect, point: { x: number, y: number }): boolean {
    return point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height;
}

function buildHitSignature(point: { x: number, y: number }, hitIndices: number[]): string {
    return `${Math.round(point.x)}:${Math.round(point.y)}:${hitIndices.join(',')}`;
}

function compareHitLayer(a: any, b: any, aIndex: number, bIndex: number): number {
    let priorityDiff = getLayerClickPriority(a) - getLayerClickPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return bIndex - aIndex;
}

function getLayerClickPriority(layer: any): number {
    if (layer.type === SMType.group) return layer.isStackLayout ? 1 : 3;
    if (layer.type === SMType.slice) return 0;
    return 2;
}

function hasInspectableStackStyle(layer: any): boolean {
    return !!((layer.fills && layer.fills.length) || (layer.borders && layer.borders.length));
}
function mouseoverLayer() {
    if (state.targetIndex && state.selectedIndex == state.targetIndex) return false;
    var target = document.querySelector('#layer-' + state.targetIndex) as HTMLElement;
    target.classList.add('hover');
    let rv = (document.querySelector('#rv') as HTMLElement);
    rv.style.left = target.offsetLeft + 'px';
    rv.style.width = target.offsetWidth + 'px';
    let rh = (document.querySelector('#rh') as HTMLElement);
    rh.style.top = target.offsetTop + 'px';
    rh.style.height = target.offsetHeight + 'px';
    (document.querySelector('#rulers') as HTMLElement).style.display = '';
}

function getEdgeRect(event: MouseEvent): SMRect {
    let screen = document.querySelector('#screen') as HTMLElement;
    let rect = screen.getBoundingClientRect();
    let x = (event.pageX - rect.left) / state.zoom;
    let y = (event.pageY - rect.top) / state.zoom;
    let width = 10;
    let height = 10;
    let xScope = (x >= 0 && x <= state.current.width);
    let yScope = (y >= 0 && y <= state.current.height);
    // left and top
    if (x <= 0 && y <= 0) {
        x = -10;
        y = -10;
    }
    // right and top
    else if (x >= state.current.width && y <= 0) {
        x = state.current.width;
        y = -10;
    }
    // right and bottom
    else if (x >= state.current.width && y >= state.current.height) {
        x = state.current.width;
        y = state.current.height;
    }
    // left and bottom
    else if (x <= 0 && y >= state.current.height) {
        x = -10;
        y = state.current.height;
    }
    // top
    else if (y <= 0 && xScope) {
        x = 0;
        y = -10;
        width = state.current.width;
    }
    // right
    else if (x >= state.current.width && yScope) {
        x = state.current.width;
        y = 0;
        height = state.current.height;
    }
    // bottom
    else if (y >= state.current.height && xScope) {
        x = 0;
        y = state.current.height;
        width = state.current.width;
    }
    // left
    else if (x <= 0 && yScope) {
        x = -10;
        y = 0;
        height = state.current.height;
    }
    if (xScope && yScope) {
        x = 0;
        y = 0;
        width = state.current.width;
        height = state.current.height;
    }
    return {
        x: x,
        y: y,
        width: width,
        height: height,
    }
}
