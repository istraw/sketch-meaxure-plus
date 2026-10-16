// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { ArtboardData } from "../interfaces"; import { sketch } from "../../sketch";
import { stopwatch } from ".";
import { getLayerData } from "./layerData";
import { TextFragment } from "../../sketch/text/textFragment";
import { Edge, EdgeVertical } from "../../sketch/layer/alignment";
import { tempLayers } from "./tempLayers";
import { getProjectionHost } from "./projectionHost";

export function getTextFragment(artboard: Artboard, layer: Text, data: ArtboardData): Promise<void> | void {
    if ((layer as any).__meaxureFragmentText) return;
    if (layer.type != sketch.Types.Text || layer.getFragmentsCount() < 2) return;
    return exportTextFragments(artboard, layer, data);
}

async function exportTextFragments(artboard: Artboard, layer: Text, data: ArtboardData) {
    let fragments = layer.getFragments();
    // stopwatch.tik('get text fragments');
    let offsetFragmentsY = 0;
    let textFrame = layer.frame;
    let heightIfSingleLine = layer.style.lineHeight || Math.max(...fragments.map(f => f.defaultLineHeight));
    let lines: TextFragment[][];
    if (textFrame.height > heightIfSingleLine) {
        // only getFragmentsByLines when multi-line
        lines = getFragmentsByLines(layer, fragments);
    } else {
        lines = [fragments];
    }
    const singleLine = lines.length === 1 && lines[0] != null;
    let exportHost = getProjectionHost(artboard);
    let alignmentTarget = layer.frame.changeBasis({ from: layer.parent as Group, to: artboard });
    let textGroup: Group = new sketch.Group({ parent: exportHost });
    tempLayers.add(textGroup);

    try {
        for (let frags of lines) {
            if (frags == null) {
                // it's a new paragraph
                offsetFragmentsY += layer.style.paragraphSpacing;
                continue;
            }
            let offsetFragmentsX = 0;
            let lineGroup = new sketch.Group({ parent: textGroup });
            lineGroup.frame.x = 0;
            lineGroup.frame.y = offsetFragmentsY;
            let currentLineHeight = layer.style.lineHeight || Math.max(...frags.map(f => f.defaultLineHeight));
            for (let fragment of frags) {
                fragment.style.fills.forEach(fill => {
                    // https://github.com/qjebbs/sketch-meaxure/issues/2
                    // https://github.com/sketch-hq/SketchAPI/issues/726
                    if (fill.pattern && fill.pattern.image === null) fill.pattern.image = undefined;
                });
                let subText = new sketch.Text({ text: fragment.text, parent: lineGroup });
                subText.style = fragment.style;
                applyFragmentTextStyle(subText, fragment);
                // Reconstructing a mixed-font string can produce a different
                // default line height from the saved design container. Keep the
                // source's automatic line height and container for single lines.
                subText.style.lineHeight = singleLine ? layer.style.lineHeight : currentLineHeight;
                (subText as any).__meaxureFragmentText = true;
                (subText as any).__meaxureFragmentLineHeight = singleLine ? textFrame.height : currentLineHeight;
                subText.frame = new sketch.Rectangle(
                    offsetFragmentsX,
                    0,
                    subText.frame.width,
                    singleLine ? textFrame.height : currentLineHeight
                );
                offsetFragmentsX += subText.frame.width;
            }
            lineGroup.adjustToFit();
            offsetFragmentsY += currentLineHeight;
        }
        switch (layer.style.alignment) {
            case sketch.Text.Alignment.center:
                for (let line of textGroup.layers) {
                    line.alignTo(
                        alignmentTarget,
                        { from: Edge.center, to: Edge.center },
                        false
                    )
                }
                break;
            case sketch.Text.Alignment.right:
                for (let line of textGroup.layers) {
                    line.alignTo(
                        alignmentTarget,
                        { from: Edge.right, to: Edge.right },
                        false
                    )
                }
                break;
            default:
                break;
        }
        textGroup.adjustToFit();
        switch (layer.style.verticalAlignment) {
            case sketch.Text.VerticalAlignment.top:
                textGroup.alignTo(
                    alignmentTarget,
                    { from: Edge.left, to: Edge.left },
                    { from: EdgeVertical.top, to: EdgeVertical.top },
                )
                break;
            case sketch.Text.VerticalAlignment.center:
                textGroup.alignTo(
                    alignmentTarget,
                    { from: Edge.left, to: Edge.left },
                    { from: EdgeVertical.middle, to: EdgeVertical.middle },
                )
                break;
            case sketch.Text.VerticalAlignment.bottom:
                textGroup.alignTo(
                    alignmentTarget,
                    { from: Edge.left, to: Edge.left },
                    { from: EdgeVertical.bottom, to: EdgeVertical.bottom },
                )
                break;
            default:
                break;
        }
        // stopwatch.tik('create temp texts for fragments');
        for (let text of sketch.find<Text>('Text', textGroup)) {
            let frame = text.frame.changeBasis({ from: text.parent as Group, to: exportHost });
            let lineHeight = (text as any).__meaxureFragmentLineHeight || text.style.lineHeight || frame.height;
            let verticalInset = Math.max(0, lineHeight - frame.height) / 2;
            (text as any).__meaxureProjectedRect = {
                x: frame.x,
                y: singleLine ? alignmentTarget.y : frame.y - verticalInset,
                width: frame.width,
                height: lineHeight,
            };
            const pending = getLayerData(exportHost, text, data, false);
            if (pending) await pending;
        }
    } finally { tempLayers.remove(textGroup); }
}
function getFragmentsByLines(layer: Text, fragments: TextFragment[]): TextFragment[][] {
    let svg = (
        sketch.export(layer, { output: false, formats: 'svg' }) as Buffer
    ).toString();
    let lines = getFragmentLinesFromSVG(svg);
    let fragmentsByLines: TextFragment[][] = [];
    let currentFragment: TextFragment = undefined;
    let isPrevNewLine: boolean = false;
    for (let line of lines) {
        let lineFragments = [];
        for (let element of line.elements) {
            if (!currentFragment) currentFragment = fragments.shift();
            while (
                currentFragment.text.startsWith('\r') || // new line
                currentFragment.text.startsWith('\n') || // new paragraph
                currentFragment.text.startsWith('\u2028') // a LINE SEPARATOR, new line
            ) {
                let count = 1;
                if (currentFragment.text.startsWith('\r\n')) {
                    count = 2;
                }
                // if currentFragment.text start with \n, it creates a new line, which doesn't appear in svg.
                // so just push a null (presents a new paragraph) for it, and split the fragment
                let leftPart: TextFragment;
                [leftPart, currentFragment] = splitFragment(currentFragment, count);
                if (isPrevNewLine) fragmentsByLines.push([]);
                // push a null to represent a new paragraph
                if (leftPart.text === '\n' || leftPart.text === '\r\n') fragmentsByLines.push(null);
                if (!currentFragment) currentFragment = fragments.shift();
                isPrevNewLine = true;
            }
            if (element.length == currentFragment.text.length) {
                // push and process next fragment
                lineFragments.push(currentFragment);
                currentFragment = undefined;
            } else {
                // element is short than fragment, fragment wrapped
                let leftPart: TextFragment;
                // console.log(`split "${currentFragment.text}" (${currentFragment.length}) for ${element}`);
                [leftPart, currentFragment] = splitFragment(currentFragment, element.length);
                lineFragments.push(leftPart);
            }
            isPrevNewLine = false;
        }
        fragmentsByLines.push(lineFragments);
    }
    return fragmentsByLines;
}
function splitFragment(fragment: TextFragment, length: number): [TextFragment, TextFragment] {
    let left = Object.assign({}, fragment);
    left.length = length
    left.text = fragment.text.substr(0, length);
    fragment.text = fragment.text.substring(length);
    fragment.location += length;
    fragment.length -= length;
    if (fragment.length < 0) throw new Error('splitFragment: fragment splitted to negtive length');
    if (!fragment.length) fragment = undefined;
    return [left, fragment];
}

function getFragmentLinesFromSVG(svg: string) {
    const REG_TSPAN = /<tspan x="(.+?)" y="(.+?)".*?>(.+?)<\/tspan>/g
    let curY = undefined;
    let lines: { elements: string[] }[] = [];
    let lineElements: string[] = [];
    let execArray: RegExpExecArray;
    while (execArray = REG_TSPAN.exec(svg)) {
        let x = parseFloat(execArray[1]);
        let y = parseFloat(execArray[2]);
        let text = execArray[3].replace(/&[#0-9a-z]+;/ig, " ");
        if (curY === undefined) {
            curY = y;
        } else if (curY !== y) {
            // next line now
            lines.push({
                elements: lineElements,
            });
            lineElements = [text];
            curY = y;
            continue;
        }
        // current line
        lineElements.push(text);
    }
    // push the last line
    lines.push({
        elements: lineElements,
    });
    return lines;
}

function applyFragmentTextStyle(subText: Text, fragment: TextFragment) {
    // Re-apply text color explicitly. On recent Sketch versions, assigning the
    // whole style object may keep the font settings but silently drop rich-text
    // fragment colors when the temp text layer is created programmatically.
    if (fragment.style && fragment.style.textColor) {
        subText.style.textColor = fragment.style.textColor;
    }
}
