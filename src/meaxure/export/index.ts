// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { exportPanel } from "../panels/exportPanel";
import { sketch } from "../../sketch";
import { localize, getAllLanguage, getLangCode } from "../common/language";
import { context } from "../common/context";
import { createWebviewPanel } from "../../webviewPanel";
import { toHTMLEncode, newStopwatch, toSlug, emojiToEntities, getResourcePath } from "../helpers/helper";
import { writeFile, buildTemplate, exportImage, exportImageToBuffer } from "./files";
import { logger } from "../common/logger";
import { ExportData, ArtboardData, LayerData, SMType } from "../interfaces";
import { getLayerData } from "./layerData";
import { clearSliceCache, getCollectedSlices } from "./slice";
import { clearMaskStack } from "./mask";
import { getDocumentColors } from "./colors";
import { clearTintStack } from "./tint";
import { tempLayers } from "./tempLayers";
import { LayerPlaceholder } from "./layers";
import { clearProjectedSourceCache } from "./projectedSource";

export let savePath: string;
export let assetsPath: string;
export let stopwatch = newStopwatch();
let skippedLayers: string[] = [];
let exportWarnings: string[] = [];

export async function exportSpecification() {
    const RUNNING_FLAG_KEY = "com.istraw.sketch-meaxure-plus.exporting"
    if (sketch.Settings.sessionVariable<boolean>(RUNNING_FLAG_KEY)) {
        sketch.UI.message(localize('Please wait for former task to exit'));
        return;
    }
    let processingPanel;
    let cancelled = false;
    try {
        let results = await exportPanel();
        if (!results) return;
        if (results.selection.length <= 0) return false;
        let document = context.document;
        savePath = sketch.UI.savePanel(
            localize("Export spec"),
            localize("Export to:"),
            localize("Export"),
            true,
            document.fileName
        );
        if (!savePath) return;
        assetsPath = savePath + "/assets";

        sketch.Settings.setSessionVariable<boolean>(RUNNING_FLAG_KEY, true);
        stopwatch.restart();
        skippedLayers = [];
        exportWarnings = [];
        clearMaskStack();
        clearTintStack();
        clearSliceCache();
        clearProjectedSourceCache();
        processingPanel = safeValue(() => createWebviewPanel({
            url: getResourcePath() + "/panel/processing.html",
            width: 304,
            height: 104,
        }), undefined);
        if (processingPanel) {
            processingPanel.onClose(() => cancelled = true);
            safeCall(() => processingPanel.show());
        }
        let template = safeValue(
            () => NSString.stringWithContentsOfFile_encoding_error(getResourcePath() + "/template.html", 4, nil),
            ""
        );
        let data: ExportData = {
            resolution: context.configs.resolution,
            unit: context.configs.units,
            language: getLangCode(),
            colorFormat: context.configs.format,
            artboards: [],
            slices: [],
            colors: safeValue(() => getDocumentColors(document), []),
            languages: getAllLanguage(),
        };

        let layerIndex = 0;
        for (let i = 0; i < results.selection.length; i++) {
            let select = results.selection[i];
            let artboard = select.artboard;
            let page = artboard.parent as Page;
            let fileName = toSlug(page.name + ' ' + (artboard.index + 1) + ' ' + artboard.name);
            data.artboards[i] = <ArtboardData>{
                notes: [],
                layers: [],
            };
            data.artboards[i].pageName = toHTMLEncode(emojiToEntities(page.name));
            data.artboards[i].pageObjectID = page.id;
            data.artboards[i].name = toHTMLEncode(emojiToEntities(artboard.name));
            data.artboards[i].slug = fileName
            data.artboards[i].objectID = artboard.id;
            data.artboards[i].width = artboard.frame.width;
            data.artboards[i].height = artboard.frame.height;
            data.artboards[i].flowStartPoint = artboard.flowStartPoint;
            for (let layer of select.children) {
                layerIndex++;
                if (cancelled) {
                    sketch.UI.message(localize('Cancelled by user'));
                    return;
                }
                let taskError: Error;
                await getLayerTask(artboard, layer, data.artboards[i], results.byInfluence)
                    .catch(err => taskError = err);
                if (taskError) {
                    let layerName = layer instanceof LayerPlaceholder ? '[placeholder]' : layer.name;
                    skippedLayers.push(layerName);
                    exportWarnings.push(`Skipped layer: ${layerName}`);
                    logger.log(3, `Skip layer "${layerName}" during export.`, taskError);
                    continue;
                }
                if (processingPanel) {
                    safeCall(() => processingPanel.postMessage('process', {
                        percentage: Math.round(layerIndex / results.layersCount * 100),
                        text: localize("Processing layer %@ of %@", layerIndex, results.layersCount)
                    }));
                }
            }
            normalizeArtboardSliceAliasRects(data.artboards[i]);
            safeCall(() => {
                if (results.advancedMode) {
                    exportArtboardAdvanced(artboard, data, savePath, i);
                } else {
                    exportArtboard(artboard, data, i, savePath, template);
                }
            }, () => {
                skippedLayers.push(artboard.name);
                exportWarnings.push(`Skipped artboard export output: ${artboard.name}`);
            });
        }
        data.slices = safeValue(() => getCollectedSlices(), []);

        let selectingPath = savePath;
        if (results.advancedMode) {
            safeCall(() => writeFile({
                content: buildTemplate(template, data),
                path: savePath,
                fileName: "index.html"
            }));
            safeCall(() => writeFile({
                content: '<meta http-equiv="refresh" content="0;url=index.html#p">',
                path: savePath,
                fileName: "proto.html"
            }));
            selectingPath = savePath + "/index.html";
        }
        safeCall(() => sketch.UI.showFiles([selectingPath]));
        if (skippedLayers.length > 0) {
            sketch.UI.message(localize("Export complete! Takes %@ seconds", stopwatch.elpased() / 1000) + ` (${skippedLayers.length} layer(s) skipped)`);
        } else {
            sketch.UI.message(localize("Export complete! Takes %@ seconds", stopwatch.elpased() / 1000));
        }
    } finally {
        tempLayers.removeAll();
        safeCall(() => tempLayers.purgeByNamePrefix(context.document));
        sketch.Settings.setSessionVariable<boolean>(RUNNING_FLAG_KEY, false);
        if (processingPanel) {
            safeCall(() => processingPanel.close());
        }
    }
    // let statistics = stopwatch.statistics()
    // sketch.UI.alert('statistics', Object.keys(statistics).map(key => `${key}: ${statistics[key] / 1000}s`).join('\n'))
}

function safeCall(fn: Function, onError?: Function) {
    try {
        return fn();
    } catch (error) {
        logger.log(3, 'Ignore export step error.', error);
        if (onError) onError(error);
    }
}

function safeValue<T>(fn: () => T, fallback: T): T {
    try {
        return fn();
    } catch (error) {
        logger.log(3, 'Use export fallback value.', error);
        return fallback;
    }
}

function getLayerTask(artboard: Artboard, layer: Layer | LayerPlaceholder, data: ArtboardData, byInfluence: boolean, symbolLayer?: Layer): Promise<boolean> {
    return new Promise<true>((resolve, reject) => {
        try {
            getLayerData(artboard, layer, data, byInfluence, symbolLayer)
        } catch (error) {
            reject(error)
            return;
        }
        resolve(true);
    });
}

function exportArtboardAdvanced(artboard: Artboard, data: ExportData, savePath: string, i: number) {
    // data.artboards[artboardIndex].imagePath = "preview/" + objectID + ".png";
    data.artboards[i].imagePath = "preview/" + encodeURI(data.artboards[i].slug) + ".png";
    data.artboards[i].imageIconPath = "preview/icons/" + encodeURI(data.artboards[i].slug) + ".png";
    try {
        exportImage(
            artboard,
            {
                format: 'png',
                // always export @2x (logic points * 2)
                // if design resolution @2x, we export as is (scale=1)
                // if design resolution @4x, we export half size (scale=0.5)
                scale: 2 / data.resolution,
                prefix: "",
                suffix: "",
            },
            savePath + "/preview", data.artboards[i].slug
        );

        exportImage(artboard, {
            format: 'png',
            scale: 128 / Math.max(data.artboards[i].width, data.artboards[i].height),
            prefix: "",
            suffix: "",
        }, savePath + "/preview/icons", data.artboards[i].slug);
    } catch (error) {
        logger.log(3, `Fallback to inline artboard image for "${artboard.name}".`, error);
        exportWarnings.push(`Inline image fallback: ${artboard.name}`);
        let imageBase64 = exportImageToBuffer(
            artboard,
            {
                format: 'png',
                scale: 2 / data.resolution,
                prefix: "",
                suffix: "",
            }
        ).toString('base64');
        data.artboards[i].imageBase64 = 'data:image/png;base64,' + imageBase64;
        delete data.artboards[i].imagePath;
        delete data.artboards[i].imageIconPath;
    }

    writeFile({
        content: "<meta http-equiv=\"refresh\" content=\"0;url=../index.html#" + i + "\">",
        path: savePath + "/links",
        fileName: data.artboards[i].slug + ".html"
    });
}

function exportArtboard(artboard: Artboard, exportData: ExportData, index: number, savePath: string, template: string) {
    let data = JSON.parse(JSON.stringify(exportData.artboards[index]));
    let imageBase64 = exportImageToBuffer(
        artboard,
        {
            format: 'png',
            // always export @2x (logic points * 2)
            // if design resolution @2x, we export as is (scale=1)
            // if design resolution @4x, we export half size (scale=0.5)
            scale: 2 / exportData.resolution,
            prefix: "",
            suffix: "",
        }
    ).toString('base64');

    data.imageBase64 = 'data:image/png;base64,' + imageBase64;
    let newData = <ExportData>{
        resolution: exportData.resolution,
        unit: exportData.unit,
        colorFormat: exportData.colorFormat,
        artboards: [data],
        slices: [],
        colors: [],
        languages: exportData.languages,
    };

    writeFile({
        content: buildTemplate(template, newData),
        path: savePath,
        fileName: data.slug + ".html"
    });
}

function normalizeArtboardSliceAliasRects(artboard: ArtboardData) {
    if (!artboard || !artboard.layers || !artboard.layers.length) return;

    let nonSliceByName = artboard.layers.reduce((map, layer) => {
        if (!layer || layer.type == SMType.slice || !layer.rect) return map;
        if (!map[layer.name]) map[layer.name] = [];
        map[layer.name].push(layer);
        return map;
    }, {} as { [key: string]: LayerData[] });

    artboard.layers.forEach(layer => {
        if (!layer || layer.type != SMType.slice || !layer.rect) return;
        let candidates = nonSliceByName[layer.name];
        if (!candidates || !candidates.length) return;

        let threshold = Math.max(layer.rect.width, layer.rect.height, 1) + 0.01;
        let match = candidates
            .filter(candidate => isSameSliceAliasSize(layer.rect, candidate.rect))
            .map(candidate => ({
                candidate,
                dx: Math.abs(candidate.rect.x - layer.rect.x),
                dy: Math.abs(candidate.rect.y - layer.rect.y),
            }))
            .filter(item => item.dx <= threshold && item.dy <= threshold)
            .sort((a, b) => (a.dx + a.dy) - (b.dx + b.dy))[0];

        if (!match) return;
        layer.rect = cloneRect(match.candidate.rect);
        layer.displayRect = cloneRect(match.candidate.rect);
    });
}

function isSameSliceAliasSize(a?: SMRect, b?: SMRect): boolean {
    if (!a || !b) return false;
    return Math.abs(a.width - b.width) < 0.01
        && Math.abs(a.height - b.height) < 0.01;
}

function cloneRect(rect: SMRect): SMRect {
    return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    };
}
