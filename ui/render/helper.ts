import { project, state } from "../common";
import { LayerData, SMRect, SMType } from "../../src/meaxure/interfaces";

export function zoomSize(size: number) {
    return size * state.zoom / project.resolution;
}

export function percentageSize(size: number, size2: number) {
    return (Math.round(size / size2 * 1000) / 10) + "%";
}

export function unitSize(value: number, isText?: boolean) {
    // logic point
    let pt = value / project.resolution;
    // convert to display value
    let sz = Math.round(pt * state.scale * 100) / 100;
    let units = state.unit.split("/");
    let unit = units[0];
    if (units.length > 1 && isText) {
        unit = units[1];
    }
    return sz + unit;
}

export function getLayerRect(layer: LayerData): SMRect {
    if (!layer) return undefined;
    if (layer.type == SMType.slice && layer.displayRect) {
        if (isUsableSliceDisplayRect(layer.rect, layer.displayRect)) return layer.displayRect;
    }
    return layer.rect;
}

function isUsableSliceDisplayRect(rect: SMRect, displayRect: SMRect): boolean {
    if (!rect || !displayRect) return false;
    let threshold = Math.max(rect.width, rect.height, 1) * 4 + 1;
    return Math.abs(displayRect.x - rect.x) <= threshold
        && Math.abs(displayRect.y - rect.y) <= threshold;
}

let msgTimeout;
export function message(msg) {
    let message = document.querySelector('#message') as HTMLDivElement;
    message.innerText = msg;
    message.style.display = 'inherit';
    if (msgTimeout) {
        clearTimeout(msgTimeout);
        msgTimeout = undefined;
    }
    msgTimeout = setTimeout(() => message.style.display = 'none', 1000);
}
