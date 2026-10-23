import { project, state } from "../common";
import { message } from "../render/helper";
import { localize } from "../common";
import { eventDelegate } from "./delegate";
import { slices as renderSlices } from "../render/slices";
import { gotoArtboard } from "./navigate";
import { selectLayerByIndex } from "./layerEvents";

export function sliceEvents() {
    sliceBoundsSwitchEvents();
    let slices = document.querySelector('#slices') as HTMLDivElement;
    let filter = document.querySelector('#current-page-slices-only') as HTMLInputElement;
    filter.checked = state.currentPageSlicesOnly;
    filter.addEventListener('change', function () {
        state.currentPageSlicesOnly = this.checked;
        renderSlices();
    });
    eventDelegate(slices, 'mouseover', 'li', function (event) {
        document.querySelectorAll('.layer-' + this.dataset.objectid)
            .forEach(div => div.classList.add('has-slice'));
    });
    eventDelegate(slices, 'mouseout', 'li', function (event) {
        document.querySelectorAll('.has-slice')
            .forEach(div => div.classList.remove('has-slice'));
    });
    eventDelegate(slices, 'click', 'li', function (event) {
        event.stopPropagation();
        const objectID = this.dataset.objectid;
        const findSliceIndex = (artboard: typeof state.current) => artboard.layers.findIndex(layer =>
            layer.objectID === objectID && layer.exportable && layer.exportable.length > 0);
        let layerIndex = state.current ? findSliceIndex(state.current) : -1;
        if (layerIndex < 0) {
            const artboardIndex = project.artboards.findIndex(artboard => findSliceIndex(artboard) >= 0);
            if (artboardIndex >= 0) {
                gotoArtboard(artboardIndex);
                layerIndex = findSliceIndex(state.current);
            }
        }
        if (layerIndex < 0) {
            message(localize('The slice not in current artboard.'));
            return;
        }
        selectLayerByIndex(layerIndex);
        const instance = document.querySelector('#layer-' + layerIndex) as HTMLDivElement;
        if (!instance) return;
        let offsets = instance.getBoundingClientRect()
        let viewer = document.querySelector('.screen-viewer') as HTMLDivElement;
        let scrolls = {
            left: viewer.scrollLeft,
            top: viewer.scrollTop,
        };
        let sizes = {
            width: instance.clientWidth,
            height: instance.clientHeight
        };
        let viewerSizes = {
            width: viewer.clientWidth,
            height: viewer.clientHeight
        };
        viewer.scrollLeft = (offsets.left + scrolls.left) - ((viewerSizes.width - sizes.width) / 2);
        viewer.scrollTop = (offsets.top + scrolls.top - 60) - ((viewerSizes.height - sizes.height) / 2);
    });
}

function sliceBoundsSwitchEvents() {
    let input = document.querySelector('#show-slice-bounds') as HTMLInputElement;
    if (!input) return;
    input.checked = state.showSliceBounds;
    input.addEventListener('change', function () {
        state.showSliceBounds = this.checked;
        let layers = document.querySelector('#layers');
        if (!layers) return;
        layers.classList.toggle('show-slice-bounds', state.showSliceBounds);
    });
}
