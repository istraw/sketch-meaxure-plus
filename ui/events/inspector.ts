import { state } from "../common";
import { colors } from "../render/colors";
import { localize } from "../common";
import { message } from "../render/helper";
import { eventDelegate } from "./delegate";
import { copyText, getCopyableColorValue } from "./colors";

export function inspectorEvents() {
    let formats = ['color-hex', 'argb-hex', 'css-rgba', 'css-hsla', 'ui-color'];
    let inspector = document.querySelector('#inspector') as HTMLElement;
    eventDelegate(inspector, 'click', '.color > label:first-child', function (event) {
        let current = formats.indexOf(state.colorFormat)
        let next = (current + 1) % formats.length;
        state.colorFormat = formats[next];
        document.querySelectorAll('.color input[data-color]').forEach((i: HTMLInputElement) => {
            let colors = JSON.parse(decodeURI(i.dataset.color));
            i.value = colors[state.colorFormat];
        })
        colors();
    });
    eventDelegate(inspector, 'click', '.color input[data-color]', async function (event) {
        event.stopPropagation();
        let input = this as HTMLInputElement;
        let color = JSON.parse(decodeURI(input.dataset.color));
        let value = getCopyableColorValue(color);
        let copied = await copyText(value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        input.select();
        message(`${localize('Copied color')}: ${value}`);
    });
    eventDelegate(inspector, 'click', '.color .color-name input[data-copy-value]', async function (event) {
        event.stopPropagation();
        let input = this as HTMLInputElement;
        let value = input.dataset.copyValue || input.value;
        let copied = await copyText(value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        input.select();
        message(`${localize('Copied content')}: ${value}`);
    });
    eventDelegate(inspector, 'click', 'textarea#content', async function (event) {
        let textarea = this as HTMLTextAreaElement;
        let copied = await copyText(textarea.value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        textarea.select();
        message(`${localize('Copied content')}: ${textarea.value}`);
    });
    eventDelegate(inspector, 'click', '.exportable a', function (event: MouseEvent) {
        if (!event.altKey) return;
        event.preventDefault();
        let link = this as HTMLAnchorElement;
        let downloadLink = document.createElement('a');
        downloadLink.href = link.href;
        downloadLink.download = link.dataset.download || '';
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    });
    eventDelegate(inspector, 'dblclick', 'input, textarea', function (event) {
        (this as HTMLInputElement).select();
    });
}
