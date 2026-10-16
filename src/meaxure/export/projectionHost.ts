import { sketch } from "../../sketch";
import { wrapDocument, wrapLayer, getChildLayers } from "../../sketch/compat";
import { context } from "../common/context";
import { logger } from "../common/logger";
import { tempLayers } from "./tempLayers";

let scratch: Document;
let hosts = new Map<string, Artboard>();
let hostIds = new Set<string>();
let sources = new Map<string, Artboard>();
let unavailable = false;
let renderCopies = new Map<string, { root: Layer; owner: Layer; layers: Map<string, Layer> }>();

// Keep temporary model mutations out of the visible source document. Layers
// remain attached to a real document, which the native renderer requires.
export function getProjectionHost(source: Artboard): Artboard {
    if (hostIds.has(source.id)) return source;
    if (unavailable) return source;
    try {
        if (!scratch) {
            let error = MOPointer.alloc().init();
            // `openUntitledDocumentAndDisplay(false)` still registers the
            // document with Sketch, which can expose it as a tab on updates.
            // Create an unregistered document with no window controllers.
            let native = NSDocumentController.sharedDocumentController()
                .makeUntitledDocumentOfType_error(context.document.sketchObject.fileType(), error);
            if (!native || error.value()) throw new Error('Cannot create hidden export document');
            scratch = wrapDocument(native);
            scratch.colorSpace = context.document.colorSpace;
            let targetData = native.documentData();
            let sourceData = context.document.sketchObject.documentData();
            // Copy shared definitions with their IDs so resolved layers retain
            // their style names and linked colors in the temporary document.
            for (let type of [1, 2]) {
                let definitions = type == 1 ? context.document.sharedLayerStyles : context.document.sharedTextStyles;
                let copies = [];
                for (let definition of definitions) {
                    let original = definition.sketchObject;
                    let copy = original.copy();
                    copy.setObjectID(original.objectID());
                    copies.push(copy);
                }
                targetData.sharedObjectContainerOfType(type).addSharedObjects(copies);
            }
            let swatches = sourceData.sharedSwatches().objects();
            let copies = [];
            for (let i = 0; i < swatches.count(); i++) {
                let original = swatches.objectAtIndex(i);
                let copy = original.copy();
                copy.setObjectID(original.objectID());
                copies.push(copy);
            }
            targetData.sharedSwatches().addSharedObjects(copies);
        }
        let host = hosts.get(source.id);
        if (!host) {
            let frame = source.frame;
            host = new sketch.Artboard({
                parent: scratch.pages[0],
                name: '#tmp-export-host',
                frame: new sketch.Rectangle(frame.x, frame.y, frame.width, frame.height),
            });
            host.background.enabled = false;
            host.background.includedInExport = false;
            hosts.set(source.id, host);
            hostIds.add(host.id);
            sources.set(host.id, source);
        }
        return host;
    } catch (error) {
        closeProjectionHost();
        unavailable = true;
        logger.log(3, 'Use source document for temporary export layers.', error);
        return source;
    }
}

export function getProjectionSourceArtboard(layer: Layer): Artboard | undefined {
    let board = layer.getParentArtboard();
    return board ? sources.get(board.id) : undefined;
}

export function getProjectionRenderLayer(layer: Layer): Layer {
    let source = getProjectionSourceArtboard(layer);
    let root = layer;
    let renderParent: Artboard;
    if (source) {
        let host = layer.getParentArtboard();
        renderParent = host;
        while (root.parent && root.parent.id != host.id) root = root.parent as Layer;
    } else {
        // Detach/manual projections (including influence-bounds exports and
        // rotated instances) live directly in the source container. They have
        // no scratch artboard mapping, but still have a hidden owned root.
        let current = layer;
        let ownedRoot: Layer;
        while (current) {
            if (tempLayers.exists(current)) ownedRoot = current;
            current = current.parent as Layer;
        }
        if (ownedRoot && ownedRoot.parent) {
            root = ownedRoot;
            source = root.parent as Artboard;
            renderParent = getProjectionHost(source);
        } else {
            if (layer.type != sketch.Types.Slice || !layer.parent) return layer;
            // Ordinary document slices need the same isolation as projections.
            // Find their board (older documents can use a top-level Group).
            let board = layer.getParentArtboard() as Layer;
            if (!board) {
                board = layer;
                while (board.parent && board.parent.type != sketch.Types.Page) board = board.parent as Layer;
            }
            if (layer.parent.id == board.id) return layer;
            root = layer;
            while (root.parent && root.parent.id != board.id) root = root.parent as Layer;
            renderParent = getProjectionHost(board as Artboard);
            if (renderParent.id == board.id) return layer;
        }
    }
    // A nested Slice belongs to its containing group. Rendering the entire
    // projected Symbol also crops unrelated navigation/board backgrounds into
    // an otherwise transparent icon. Retain its ancestry for transforms and
    // opacity, but exclude sibling branches above the containing group.
    const scope = layer.type == sketch.Types.Slice ? layer.parent as Layer : root;
    const key = root.id + ':' + scope.id;
    const branch = new Set<string>();
    for (let current = scope; current; current = current.parent as Layer) {
        branch.add(current.id);
        if (current.id == root.id) break;
    }
    let entry = renderCopies.get(key);
    if (!entry) {
        let copy = wrapLayer(root.sketchObject.copy());
        // Render inside the windowless document too. Attaching this visible
        // copy to the source makes each export snapshot the large design and
        // invalidates its canvas even though the pixels live in this subtree.
        copy.parent = renderParent;
        // A Slice renders scene pixels, so its whole temporary ancestry must
        // be visible. The projection root itself is hidden for bookkeeping.
        tempLayers.add(copy, false);
        copy.name = root.name;
        let layers = new Map<string, Layer>();
        let stack: [Layer, Layer][] = [[root, copy]];
        try {
            while (stack.length) {
                let [original, cloned] = stack.pop();
                layers.set(original.id, cloned);
                for (let key of ['__meaxureProjectedRect', '__meaxureProjectedSourceID', '__meaxureProjectedPath']) {
                    (cloned as any)[key] = (original as any)[key];
                }
                let children = getChildLayers(original);
                let copied = getChildLayers(cloned);
                if (children.length != copied.length) throw new Error('Render copy changed child count');
                for (let i = 0; i < children.length; i++) {
                    if (original.id != scope.id && branch.has(original.id) && !branch.has(children[i].id)) {
                        copied[i].remove();
                    } else stack.push([children[i], copied[i]]);
                }
            }
            entry = { root: copy, owner: root, layers };
            renderCopies.set(key, entry);
        } catch (error) {
            tempLayers.remove(copy);
            throw error;
        }
    }
    // Different scopes can overlap. Only the current scene may contribute
    // pixels to a Slice's native request or its embedded SVG source.
    for (let scene of Array.from(renderCopies.values())) scene.root.hidden = scene !== entry;
    return entry.layers.get(layer.id) || layer;
}

export function releaseProjectionRenderLayers(root?: Layer) {
    if (!root) return;
    for (let [key, entry] of Array.from(renderCopies.entries())) {
        if (entry.owner.id != root.id) continue;
        tempLayers.remove(entry.root);
        renderCopies.delete(key);
    }
}

export function releaseOrdinarySliceRenderLayer(layer: Layer) {
    for (let [key, entry] of Array.from(renderCopies.entries())) {
        if (!entry.layers.has(layer.id) || tempLayers.exists(entry.owner)) continue;
        tempLayers.remove(entry.root);
        renderCopies.delete(key);
    }
}

export function closeProjectionHost() {
    let document = scratch;
    scratch = undefined;
    hosts.clear();
    hostIds.clear();
    sources.clear();
    for (let entry of Array.from(renderCopies.values())) {
        if (tempLayers.exists(entry.root)) tempLayers.remove(entry.root);
    }
    renderCopies.clear();
    unavailable = false;
    if (document) document.close();
}
