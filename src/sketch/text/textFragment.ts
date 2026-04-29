// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { sketch } from "..";
import { callNative, hasNativeMethod } from "../compat";

export interface TextFragment {
    length: number;
    location: number;
    text: string;
    style: Style;
    defaultLineHeight: number;
}
export function getFragmentsCount(layer: Layer): number {
    let attributedString = callNative<any>(layer.sketchObject, "attributedString", undefined);
    if (!attributedString) return 0;
    let fragments: any[] = attributedString.treeAsDictionary().value.attributes;
    return fragments.length;
}
export function getFragments(layer: Layer): TextFragment[] {
    let TextMSAttributedString = callNative<any>(layer.sketchObject, "attributedString", undefined);
    if (!TextMSAttributedString) return [];
    let fragments: any[] = TextMSAttributedString.treeAsDictionary().value.attributes;
    let nativeFragments = getNativeFragments(TextMSAttributedString);
    let results: TextFragment[] = [];
    let styleStr = JSON.stringify(layer.style);

    let styleBase = JSON.parse(styleStr) as Style;
    if (styleBase.fontAxes) {
        // fontAxes issue: https://github.com/sketch-hq/SketchAPI/issues/810
        styleBase.fontAxes = Object.assign({}, <FontAxes>{
            id: styleBase.fontAxes.id,
            min: styleBase.fontAxes.min,
            max: styleBase.fontAxes.max,
            value: styleBase.fontAxes.value
        })
    } else {
        // bypass Sketch API evaluating Object.keys() on null fontAxes
        delete styleBase.fontAxes;
    }
    styleStr = JSON.stringify(styleBase);

    for (let i = 0; i < fragments.length; i++) {
        let fragment = fragments[i];
        let nativeFragment = nativeFragments[i];
        let styleBase = JSON.parse(styleStr) as Style;
        let fontFamily = (fragment.NSFont && fragment.NSFont.family) ?
            String(fragment.NSFont.family) :
            layer.style.fontFamily;
        let fontSize = (fragment.NSFont && fragment.NSFont.attributes && fragment.NSFont.attributes.NSFontSizeAttribute) ?
            Number(fragment.NSFont.attributes.NSFontSizeAttribute) :
            layer.style.fontSize;
        let nativeAttributedString = callNative<any>(TextMSAttributedString, "attributedString", undefined);
        let fontWeight = nativeAttributedString && nativeAttributedString.fontAttributesInRange ?
            NSFontManager.sharedFontManager().weightOfFont(nativeAttributedString.fontAttributesInRange(NSMakeRange(fragment.location, fragment.length)).NSFont) :
            layer.style.fontWeight;
        let textColor = getFragmentTextColor(fragment, nativeFragment, layer.style.textColor);
        results.push(<TextFragment>{
            location: fragment.location,
            length: fragment.length,
            text: fragment.text,
            style: Object.assign(styleBase, <Style>{
                textColor: textColor,
                fontSize: fontSize,
                fontFamily: fontFamily,
                fontWeight: fontWeight,
                textStrikethrough: fragment.NSStrikethrough ? 'single' : null,
                textUnderline: fragment.NSUnderline ? 'single' : null,
            }),
            // cannot use layer.style.getDefaultLineHeight()
            // because we need every different default line height of fragment
            // not the whole style default.
            defaultLineHeight: getDefaultLineHeightForFont(fontFamily, fontSize),
        });
    }
    return results;
}

function getNativeFragments(textMSAttributedString: any): any[] {
    let attributes = callNative<any>(textMSAttributedString, "attributedStringAttributes", undefined);
    if (!attributes || !attributes.length) return [];
    return Array.from(attributes);
}

function getFragmentTextColor(fragment: any, nativeFragment: any, fallbackColor: string): string {
    let nativeColor = getNativeFragmentColor(nativeFragment);
    if (nativeColor) return nativeColor;
    if (fragment.MSAttributedStringColorAttribute && fragment.MSAttributedStringColorAttribute.value) {
        return parseColor(fragment.MSAttributedStringColorAttribute.value);
    }
    return parseColor(fallbackColor || '#000000FF');
}

function getNativeFragmentColor(nativeFragment: any): string | undefined {
    if (!nativeFragment || !nativeFragment.attributeDictionary) return undefined;
    let attributes = nativeFragment.attributeDictionary();
    if (!attributes) return undefined;
    let color = attributes["MSAttributedStringColorAttribute"];
    return normalizeNativeColor(color);
}

function normalizeNativeColor(color: any): string | undefined {
    if (!color) return undefined;
    if (typeof color === 'string') return parseColor(color);
    let directValue = readNativeColorValue(color);
    if (directValue) return parseColor(directValue);
    return undefined;
}

function readNativeColorValue(color: any): string | undefined {
    let candidates = [
        "value",
        "hexValue",
        "SVGString",
        "svgString",
        "immutableModelObject"
    ];
    for (let method of candidates) {
        if (hasNativeMethod(color, method)) {
            let value = callNative<any>(color, method, undefined);
            if (!value || value === color) continue;
            if (typeof value === 'string') return value;
            let nested = readNativeColorValue(value);
            if (nested) return nested;
        }
        if (color[method] && typeof color[method] === 'string') return color[method];
    }
    let desc = String(color);
    let match = desc.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([^)]+\)/);
    return match ? match[0] : undefined;
}

/**
 * parse MSAttributedStringColorAttribute to rgba-hex, e.g.: `#808080FF`
 * @param color can be `#808080`, `rgba(128,128,128,0.10)`
 */
function parseColor(color: string): string {
    color = new String(color).toString();
    if (color.startsWith('#')) return color + 'FF';
    let values = color.substring(5, color.length - 1).split(',').map(Number);
    values[3] = values[3] * 255;
    let red = (values[0] < 16 ? '0' : '') + values[0].toString(16);
    let green = (values[1] < 16 ? '0' : '') + values[1].toString(16);
    let blue = (values[2] < 16 ? '0' : '') + values[2].toString(16);
    let alpha = (values[3] < 16 ? '0' : '') + values[3].toString(16);
    color = '#' + red + green + blue + alpha;
    return color.toLocaleUpperCase();
}
function getDefaultLineHeightForFont(fontFamily, size) {
    let font = NSFont.fontWithName_size(fontFamily, size);
    let lm = NSLayoutManager.alloc().init();
    return lm.defaultLineHeightForFont(font);
}
