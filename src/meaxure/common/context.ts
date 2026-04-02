// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { sketch } from "../../sketch";
import { wrapArtboard, wrapDocument } from "../../sketch/compat";
import { ConfigsMaster } from "./config";
import { MeaxureStyles } from "../meaxureStyles";

interface Context {
    document: any;
    selection: any;
    scriptPath: string;
    script?: string;
}

export interface SMContext {
    sketchObject: Context;
    document: Document;
    selection: Selection;
    page: Page;
    artboard: Artboard;
    configs: ConfigsMaster;
    meaxureStyles: MeaxureStyles;
}

export let context: SMContext = undefined;

export function updateContext(ctx?: Context) {
    if (!ctx && !context) throw new Error("Context not initialized");
    let notInitilized = context === undefined;
    // initialized the context
    if (!context && ctx) {
        // logger.debug("initContextRunOnce");
        initContextRunOnce();
    }

    // logger.debug("Update context");
    if (ctx) context.sketchObject = ctx;
    // current document either from ctx or NSDocumentController
    let document = (ctx ? ctx.document : undefined) || NSDocumentController.sharedDocumentController().currentDocument();
    if (notInitilized || document != context.sketchObject.document) {
        // properties updates only when document change
        // logger.debug("Update target document");
        context.sketchObject.document = document;
        context.document = wrapDocument(context.sketchObject.document);
        context.configs = new ConfigsMaster(document);
    }
    if (document) {
        // properties always need to update
        context.page = context.document.selectedPage;
        context.selection = context.document.selectedLayers;
        context.artboard = getCurrentContainer(context.page, context.selection);
        context.meaxureStyles = new MeaxureStyles(context.document);
    }
    return context;
}

function initContextRunOnce() {
    context = <SMContext>{};
}

function getCurrentContainer(page: Page, selection: Selection): Artboard {
    if (!page || !selection || !selection.layers || selection.layers.length <= 0) {
        return undefined;
    }

    let selectedContainer = selection.layers
        .map(layer => {
            if (!layer) return undefined;
            if (layer.type == sketch.Types.Artboard || layer.type == sketch.Types.SymbolMaster) {
                return layer;
            }
            return layer.getParentArtboard ? layer.getParentArtboard() : undefined;
        })
        .find(Boolean);

    if (selectedContainer) return selectedContainer as Artboard;

    let nativePage = page.sketchObject;
    if (nativePage && nativePage.currentArtboard) {
        let nativeArtboard = nativePage.currentArtboard();
        if (nativeArtboard) {
            return wrapArtboard(nativeArtboard);
        }
    }
    return undefined;
}
