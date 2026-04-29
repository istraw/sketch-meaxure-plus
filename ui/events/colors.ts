import { localize, state } from "../common";
import { message } from "../render/helper";

export function colorEvents() {
    let colors = document.querySelector('#colors');
    if (!colors) return;
    colors.addEventListener('click', async (event) => {
        let target = event.target as HTMLElement;
        let item = target && target.closest ? target.closest('.color-list li') as HTMLElement : undefined;
        if (!item) return;
        let raw = item.dataset.color;
        if (!raw) return;
        let color = JSON.parse(decodeURI(raw));
        let value = getCopyableColorValue(color);
        if (!value) return;

        let copied = await copyText(value);
        if (!copied) {
            message(localize('Copy failed'));
            return;
        }
        item.classList.add('copied');
        setTimeout(() => item.classList.remove('copied'), 400);
        message(`${localize('Copied color')}: ${value}`);
    });
}

export function getCopyableColorValue(color): string {
    if (!color) return '';
    if (state.colorFormat === 'color-hex') {
        return (color['color-hex'] || '').split(' ')[0];
    }
    return color[state.colorFormat] || color['css-rgba'] || color['rgba-hex'] || '';
}

export async function copyText(value: string): Promise<boolean> {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (error) { }

    let textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (error) {
        copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
}
