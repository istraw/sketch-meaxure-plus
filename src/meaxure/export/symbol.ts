// Copyright 2020 Jebbs. All rights reserved.
// Use of this source code is governed by the MIT
// license that can be found in the LICENSE file.

import { LayerData, ArtboardData, SMType } from "../interfaces";
import { getLayerData } from "./layerData";
import { tempLayers } from "./tempLayers";
import { getChildrenForExport, LayerPlaceholder } from "./layers";
import { pushSymbolDebug } from "./symbolDebug";
import { sketch } from "../../sketch";
import { getChildLayers } from "../../sketch/compat";
import { callNative } from "../../sketch/compat";
import { hasNativeMethod } from "../../sketch/compat";
import { wrapLayer } from "../../sketch/compat";
import { TextBehaviour } from "../../sketch/text";

interface ExpandedLayerSnapshot {
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    hidden: boolean;
    text?: string;
    fontSize?: number;
    lineHeight?: number;
    kerning?: number;
    preserveLocalTextLayout?: boolean;
}

interface ExpandedSnapshotMap {
    byId: { [key: string]: ExpandedLayerSnapshot };
    byPath: { [key: string]: ExpandedLayerSnapshot };
    bySignature: { [key: string]: ExpandedLayerSnapshot };
}

interface ApplyExpandedSnapshotOptions {
    applyRect?: boolean;
    applyTextMetrics?: boolean;
    applyHidden?: boolean;
}

export function getSymbol(artboard: Artboard, layer: SymbolInstance, layerData: LayerData, data: ArtboardData, byInfluence: boolean): boolean {
    if (layerData.type != SMType.symbol) return false;

    pushSymbolDebug({
        symbol: layer.name,
        artboard: artboard.name,
        stage: "enter",
    });

    let tempGroup: Group = undefined;
    try {
        tempGroup = createProjectedSymbolGroup(layer, artboard);
        let exportLayers = flattenProjectedChildren(tempGroup);

        pushSymbolDebug({
            symbol: layer.name,
            artboard: artboard.name,
            stage: "projected",
            projectedCount: exportLayers.length,
            projectedPreview: exportLayers
                .filter(item => !(item instanceof LayerPlaceholder))
                .slice(0, 20)
                .map((item: Layer) => `${item.type}:${item.name}`),
        });

        exportLayers.forEach(projectedLayer => {
            getLayerData(artboard, projectedLayer, data, byInfluence);
        });
        return true;
    } catch (error) {
        pushSymbolDebug({
            symbol: layer.name,
            artboard: artboard.name,
            stage: "failed",
            error: String(error),
        });
        throw error;
    } finally {
        safeRemove(tempGroup);
    }
}

export function debugDumpProjectedSymbol(instance: SymbolInstance, artboard: Artboard): any {
    let projected: Group = undefined;
    try {
        projected = createProjectedSymbolGroup(instance, artboard);
        return dumpLayerTreeForDebug(projected);
    } finally {
        safeRemove(projected);
    }
}

function createProjectedSymbolGroup(instance: SymbolInstance, artboard: Artboard): Group {
    let detachedProjection = createDetachedProjectedSymbolGroup(instance, artboard);
    if (detachedProjection) return detachedProjection;

    let expandedProjection = createExpandedProjectedSymbolGroup(instance, artboard);
    if (expandedProjection) return expandedProjection;

    let manualError: any = undefined;
    try {
        return createProjectedSymbolGroupFromMaster(instance, artboard);
    } catch (error) {
        manualError = error;
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "manual-projection-failed",
            error: String(error),
        });
    }

    throw manualError || new Error(`Unable to project symbol ${instance.name}`);
}

function createExpandedProjectedSymbolGroup(instance: SymbolInstance, artboard: Artboard): Group | undefined {
    let expandedLayers = getExpandedLayers(instance);
    if (!expandedLayers || !expandedLayers.length) return undefined;
    try {
        let instanceRect = getInstanceArtboardRect(instance, artboard);
        let tempGroup = new sketch.Group({
            parent: artboard,
            name: `#tmp-symbol-${instance.name}`,
            frame: new sketch.Rectangle(
                instanceRect.x,
                instanceRect.y,
                instanceRect.width,
                instanceRect.height
            ),
        });
        tempLayers.add(tempGroup);

        let projectedChildren: Layer[] = [];
        expandedLayers.forEach((expandedLayer: Layer, layerIndex: number) => {
            let projected = duplicateExpandedLayerTree(
                expandedLayer,
                tempGroup,
                instanceRect.x,
                instanceRect.y,
                String(layerIndex)
            );
            if (projected) projectedChildren.push(projected);
        });
        if (!projectedChildren.length) {
            safeRemove(tempGroup);
            return undefined;
        }

        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "expanded-direct",
            expandedCount: expandedLayers.length,
        });

        return tempGroup;
    } catch (error) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "expanded-projection-failed",
            error: String(error),
        });
        return undefined;
    }
}

function getExpandedLayers(instance: SymbolInstance): Layer[] | undefined {
    try {
        let expandedLayers = (instance as any).expandedLayers as Layer[] | undefined;
        if (!expandedLayers || !expandedLayers.length) return undefined;
        return expandedLayers;
    } catch (error) {
        return undefined;
    }
}

function duplicateExpandedLayerTree(source: Layer, parent: Group, absoluteX: number, absoluteY: number, path: string): Layer | undefined {
    try {
        let duplicated = source.duplicate() as Layer;
        duplicated.parent = parent;
        duplicated.frame = source.frame.offset(0, 0);
        setProjectedSourceId(duplicated, source);
        setProjectedPath(duplicated, path);
        setProjectedRect(duplicated, {
            x: absoluteX + source.frame.x,
            y: absoluteY + source.frame.y,
            width: source.frame.width,
            height: source.frame.height,
        });

        syncExpandedChildren(duplicated, source, absoluteX + source.frame.x, absoluteY + source.frame.y, path);
        return duplicated;
    } catch (error) {
        return undefined;
    }
}

function syncExpandedChildren(projected: Layer, source: Layer, absoluteX: number, absoluteY: number, path: string) {
    let projectedChildren = getChildLayers(projected);
    let sourceChildren = getChildLayers(source);
    let count = Math.min(projectedChildren.length, sourceChildren.length);
    for (let i = 0; i < count; i++) {
        let projectedChild = projectedChildren[i];
        let sourceChild = sourceChildren[i];
        if (!projectedChild || !sourceChild) continue;

        projectedChild.frame = sourceChild.frame.offset(0, 0);
        setProjectedSourceId(projectedChild, sourceChild);
        setProjectedPath(projectedChild, `${path}/${i}`);
        setProjectedRect(projectedChild, {
            x: absoluteX + sourceChild.frame.x,
            y: absoluteY + sourceChild.frame.y,
            width: sourceChild.frame.width,
            height: sourceChild.frame.height,
        });
        syncExpandedChildren(
            projectedChild,
            sourceChild,
            absoluteX + sourceChild.frame.x,
            absoluteY + sourceChild.frame.y,
            `${path}/${i}`
        );
    }
}

function createDetachedProjectedSymbolGroup(instance: SymbolInstance, artboard: Artboard): Group | undefined {
    let instanceRect = getInstanceArtboardRect(instance, artboard);
    let hostGroup: Group = undefined;
    try {
        hostGroup = new sketch.Group({
            parent: artboard,
            name: `#tmp-symbol-${instance.name}`,
            frame: new sketch.Rectangle(
                instanceRect.x,
                instanceRect.y,
                instanceRect.width,
                instanceRect.height
            ),
        });
        tempLayers.add(hostGroup);

        let detached = detachProjectedSymbolIntoHost(instance, artboard, hostGroup, instanceRect);
        if (!detached) {
            throw new Error(`Detach returned empty group for ${instance.name}`);
        }
        syncDetachedExportablesWithExpandedLayers(instance, detached as Group, artboard);

        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "project-start",
            master: instance.master ? instance.master.name : undefined,
            masterChildCount: getChildLayers(detached).length,
            strategy: "detach-recursive",
        });

        return hostGroup;
    } catch (error) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "detach-failed",
            error: String(error),
        });
        safeRemove(hostGroup);
        return undefined;
    }
}

function detachProjectedSymbolIntoHost(
    instance: SymbolInstance,
    artboard: Artboard,
    hostGroup: Group,
    instanceRect: Rectangle
): Layer | undefined {
    let detachedInPlace = detachProjectedSymbolFromSourceInstance(instance, artboard, hostGroup, instanceRect);
    if (detachedInPlace) return detachedInPlace;

    let tempInstance = createTempSymbolInstance(instance, hostGroup, instanceRect);
    mirrorSymbolOverrides(instance, tempInstance);
    if (typeof tempInstance.resizeWithSmartLayout === "function") {
        tempInstance.resizeWithSmartLayout();
    }

    let detached = tempInstance.detach({ recursively: true });
    ensureDetachProjectionHasUpdated(tempInstance);
    ensureDetachProjectionHasUpdated(detached as any);
    if (detached && detached.parent !== hostGroup) detached.parent = hostGroup;
    return detached as Layer | undefined;
}

function detachProjectedSymbolFromSourceInstance(
    instance: SymbolInstance,
    artboard: Artboard,
    hostGroup: Group,
    instanceRect: Rectangle
): Layer | undefined {
    let tempInstance: SymbolInstance = undefined;
    let detached: Layer = undefined;
    try {
        tempInstance = instance.duplicate() as SymbolInstance;
        if (!tempInstance) return undefined;
        tempInstance.name = `tmp-instance-${instance.name}`;
        tempInstance.parent = instance.parent;
        tempInstance.frame = instance.frame.offset(0, 0);

        detached = tempInstance.detach({ recursively: true }) as Layer;
        if (!detached) return undefined;

        ensureDetachProjectionHasUpdated(tempInstance);
        ensureDetachProjectionHasUpdated(detached);

        let detachedRect = detached.frame.changeBasis({
            from: detached.parent as Group,
            to: artboard,
        });
        detached.parent = hostGroup;
        detached.frame = new sketch.Rectangle(
            detachedRect.x - instanceRect.x,
            detachedRect.y - instanceRect.y,
            detachedRect.width,
            detachedRect.height
        );
        return detached;
    } catch (error) {
        safeRemove(detached);
        safeRemove(tempInstance);
        return undefined;
    }
}

function syncDetachedExportablesWithExpandedLayers(instance: SymbolInstance, detached: Group, artboard: Artboard) {
    if (!detached) return;
    normalizeDetachedSymbolGroupFrames(instance, detached, artboard);

    let expandedLayers = getExpandedLayers(instance);
    if (!expandedLayers || !expandedLayers.length) return;

    let expandedSnapshot = getExpandedLayerSnapshot(instance, artboard);
    if (!expandedSnapshot) return;

    let detachedChildren = getChildLayers(detached);
    let count = Math.min(detachedChildren.length, expandedLayers.length);
    for (let i = 0; i < count; i++) {
        annotateDetachedLayerTree(instance, detachedChildren[i], expandedLayers[i], String(i));
    }

    applyExpandedLayerRectsForExportableLayers(detachedChildren, expandedSnapshot);
}

function normalizeDetachedSymbolGroupFrames(instance: SymbolInstance, detached: Group, artboard: Artboard) {
    let queue = [detached as Layer];
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;

        let detachedFrame = getDetachedSymbolOriginalFrame(layer);
        if (detachedFrame) {
            normalizeDetachedSymbolLayerFrame(instance, layer, detachedFrame, artboard);
        }

        queue.push(...getChildLayers(layer));
    }
}

function normalizeDetachedSymbolLayerFrame(instance: SymbolInstance, layer: Layer, detachedFrame: Rectangle, artboard: Artboard) {
    let currentFrame = layer.frame ? cloneRect(layer.frame) : undefined;
    if (!currentFrame) return;
    if (framesEqual(currentFrame, detachedFrame)) return;

    let scaleX = safeScale(detachedFrame.width, currentFrame.width);
    let scaleY = safeScale(detachedFrame.height, currentFrame.height);
    scaleLayerTree(getChildLayers(layer), scaleX, scaleY);
    layer.frame = cloneRect(detachedFrame);

    pushSymbolDebug({
        symbol: instance.name,
        artboard: artboard.name,
        stage: "detach-frame-normalized",
        child: `${layer.type}:${layer.name}`,
        from: {
            x: currentFrame.x,
            y: currentFrame.y,
            width: currentFrame.width,
            height: currentFrame.height,
        },
        to: {
            x: detachedFrame.x,
            y: detachedFrame.y,
            width: detachedFrame.width,
            height: detachedFrame.height,
        },
        scaleX,
        scaleY,
    });
}

function getDetachedSymbolOriginalFrame(layer: Layer): Rectangle | undefined {
    if (!layer) return undefined;
    let nativeLayer = (layer as any).sketchObject;
    if (!nativeLayer) return undefined;

    let userInfo = callNative<any>(nativeLayer, "userInfo", undefined);
    let detachInfo = getNativeMapValue(userInfo, "com.sketch.detach");
    let symbolInstanceInfo = getNativeMapValue(detachInfo, "symbolInstance");
    let frameValue = getNativeMapValue(symbolInstanceInfo, "frame");
    return nativeRectToRectangle(frameValue);
}

function annotateDetachedLayerTree(instance: SymbolInstance, detachedLayer: Layer, expandedLayer: Layer, path: string) {
    if (!detachedLayer || !expandedLayer) return;

    setProjectedPath(detachedLayer, path);
    let sourceId = getPreferredProjectedSourceId(instance, detachedLayer, expandedLayer, path);
    if (sourceId) setProjectedSourceIdValue(detachedLayer, sourceId);

    let detachedChildren = getChildLayers(detachedLayer);
    let expandedChildren = getExpandedChildLayers(expandedLayer);
    let count = Math.min(detachedChildren.length, expandedChildren.length);
    for (let i = 0; i < count; i++) {
        annotateDetachedLayerTree(instance, detachedChildren[i], expandedChildren[i], `${path}/${i}`);
    }
}

function ensureDetachProjectionHasUpdated(layer: Layer | SymbolInstance | Group) {
    if (!layer) return;
    let nativeLayer = (layer as any).sketchObject;
    if (!nativeLayer) return;
    try {
        if (hasNativeMethod(nativeLayer, "ensureDetachHasUpdated")) {
            nativeLayer.ensureDetachHasUpdated();
        }
    } catch (error) {
        // keep exporting if this Sketch build exposes a different detach refresh path
    }
}

function createTempSymbolInstance(instance: SymbolInstance, parent: Group, instanceRect: Rectangle): SymbolInstance {
    let tempInstance: SymbolInstance = undefined;
    try {
        tempInstance = instance.duplicate() as SymbolInstance;
        (tempInstance as any).__meaxureDuplicatedFromSource = true;
    } catch (error) {
        tempInstance = undefined;
    }

    if (!tempInstance) {
        tempInstance = instance.master && typeof instance.master.createNewInstance === "function"
            ? instance.master.createNewInstance()
            : new sketch.SymbolInstance({
                symbolId: instance.symbolId,
            });
    }

    tempInstance.parent = parent;
    tempInstance.name = `tmp-instance-${instance.name}`;
    tempInstance.frame = new sketch.Rectangle(
        0,
        0,
        instanceRect.width,
        instanceRect.height
    );

    try {
        tempInstance.style = instance.style;
    } catch (error) {
        // keep exporting even if a specific symbol style cannot be mirrored
    }

    try {
        tempInstance.transform.rotation = instance.transform.rotation;
        tempInstance.transform.flippedHorizontally = instance.transform.flippedHorizontally;
        tempInstance.transform.flippedVertically = instance.transform.flippedVertically;
    } catch (error) {
        // keep exporting even if transforms are not available on this Sketch build
    }

    return tempInstance;
}

function mirrorSymbolOverrides(source: SymbolInstance, target: SymbolInstance) {
    if ((target as any).__meaxureDuplicatedFromSource) return;
    if (!source.overrides || !source.overrides.length) return;
    applyMirroredOverrides(source, target, override => override.property == "symbolID");
    if (typeof target.resizeWithSmartLayout === "function") {
        target.resizeWithSmartLayout();
    }
    applyMirroredOverrides(source, target, override => override.property != "symbolID");
}

function applyMirroredOverrides(source: SymbolInstance, target: SymbolInstance, predicate: (override: Override) => boolean) {
    let sourceOverrides = source.overrides
        .filter(override => !override.isDefault)
        .filter(override => override.editable !== false)
        .filter(predicate);
    if (!sourceOverrides.length) return;

    sourceOverrides.forEach(sourceOverride => {
        let targetOverrides = target.overrides || [];
        let targetOverride = findMatchingOverride(sourceOverride, targetOverrides);
        if (!targetOverride) return;
        try {
            target.setOverrideValue(targetOverride, sourceOverride.value as any);
        } catch (error) {
            try {
                (targetOverride as any).value = sourceOverride.value;
            } catch (setError) {
                pushSymbolDebug({
                    symbol: source.name,
                    artboard: source.getParentArtboard() ? source.getParentArtboard().name : "",
                    stage: "override-mirror-failed",
                    target: `${targetOverride.property}:${targetOverride.path}`,
                    value: String(sourceOverride.value || ""),
                    error: String(setError),
                });
            }
        }
    });
}

function findMatchingOverride(sourceOverride: Override, targetOverrides: Override[]): Override | undefined {
    if (!targetOverrides || !targetOverrides.length) return undefined;

    let exact = targetOverrides.find(targetOverride => getOverrideKey(targetOverride) == getOverrideKey(sourceOverride));
    if (exact) return exact;

    let byId = targetOverrides.find(targetOverride => targetOverride.id == sourceOverride.id);
    if (byId) return byId;

    let byPath = targetOverrides.find(targetOverride =>
        targetOverride.property == sourceOverride.property &&
        targetOverride.path == sourceOverride.path
    );
    if (byPath) return byPath;

    let affectedLayerID = sourceOverride.affectedLayer ? sourceOverride.affectedLayer.id : "";
    return targetOverrides.find(targetOverride =>
        targetOverride.property == sourceOverride.property &&
        (!!targetOverride.affectedLayer ? targetOverride.affectedLayer.id : "") == affectedLayerID
    );
}

function getOverrideKey(override: Override): string {
    let affectedLayerID = override && override.affectedLayer ? override.affectedLayer.id : "";
    return `${override.path}|${override.property}|${affectedLayerID}`;
}

function createProjectedSymbolGroupFromMaster(instance: SymbolInstance, artboard: Artboard, presetExpandedSnapshot?: ExpandedSnapshotMap): Group {
    let master = instance.master;
    if (!master) throw new Error(`Missing symbol master for ${instance.name}`);

    let instanceRect = getInstanceArtboardRect(instance, artboard);
    let scaleX = safeScale(instanceRect.width, master.frame.width);
    let scaleY = safeScale(instanceRect.height, master.frame.height);
    let expandedSnapshot = presetExpandedSnapshot || getExpandedLayerSnapshot(instance, artboard);
    let overrideFrameSnapshot = getOverrideFrameSnapshot(instance, artboard, scaleX, scaleY);

    let tempGroup = new sketch.Group({
        parent: artboard,
        name: `#tmp-symbol-${instance.name}`,
        frame: new sketch.Rectangle(
            instanceRect.x,
            instanceRect.y,
            instanceRect.width,
            instanceRect.height
        ),
    });
    tempLayers.add(tempGroup);
    setProjectedRect(tempGroup, {
        x: instanceRect.x,
        y: instanceRect.y,
        width: instanceRect.width,
        height: instanceRect.height,
    });

    pushSymbolDebug({
        symbol: instance.name,
        artboard: artboard.name,
        stage: "project-start",
        master: master.name,
        masterChildCount: getChildLayers(master).length,
        strategy: "manual",
    });
    if (expandedSnapshot) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "expanded-layers",
            expandedCount: Object.keys(expandedSnapshot.byId).length,
        });
    } else if (overrideFrameSnapshot) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "override-frames",
            overrideCount: Object.keys(overrideFrameSnapshot.byId).length,
        });
    }

    let duplicatedChildren: Layer[] = [];
    getChildLayers(master).forEach((child, childIndex) => {
        let duplicated = projectLayer(child, tempGroup, instance, artboard, String(childIndex));
        if (duplicated) duplicatedChildren.push(duplicated);
    });

    if (!duplicatedChildren.length) {
        throw new Error(`Unable to project any child layer from symbol master ${master.name}`);
    }

    let duplicatedById = collectLayerMap(duplicatedChildren);
    try {
        applyOverrides(instance, duplicatedById);
    } catch (error) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "apply-overrides-failed",
            error: String(error),
        });
        throw error;
    }
    try {
        scaleLayerTree(duplicatedChildren, scaleX, scaleY, overrideFrameSnapshot);
        if (expandedSnapshot) {
            // Sketch exposes expanded layers as the resolved post-layout tree. We
            // trust it for container geometry, but keep text/slice sizing on the
            // existing export path because those two types are more sensitive to
            // measurement differences across Sketch builds.
            applyExpandedLayerRectsForContainerLayers(duplicatedChildren, expandedSnapshot);
            applyExpandedSnapshotForNestedSymbolSubtrees(duplicatedChildren, expandedSnapshot);
            applyExpandedLayerSnapshot(duplicatedChildren, expandedSnapshot, {
                applyRect: false,
                applyTextMetrics: false,
                applyHidden: true,
            });
        }
        if (overrideFrameSnapshot) {
            // `Override.getFrame()` is the official resolved geometry for expanded
            // layers, so prefer it whenever Sketch provides it.
            applyExpandedLayerSnapshot(duplicatedChildren, overrideFrameSnapshot, {
                applyRect: true,
                applyTextMetrics: true,
                applyHidden: true,
            });
        }
    } catch (error) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "scale-tree-failed",
            error: String(error),
        });
        throw error;
    }

    return tempGroup;
}

function flattenProjectedChildren(tempGroup: Group): (Layer | LayerPlaceholder)[] {
    let result: (Layer | LayerPlaceholder)[] = [];
    getChildLayers(tempGroup).forEach(child => {
        let [layers] = getChildrenForExport(child);
        result.push(...layers);
    });
    return result;
}

function collectLayerMap(roots: Layer[]): { [key: string]: Layer } {
    let map: { [key: string]: Layer } = {};
    let queue = roots.slice();
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;
        map[getProjectedSourceId(layer) || layer.id] = layer;
        queue.push(...getChildLayers(layer));
    }
    return map;
}

function projectLayer(layer: Layer, parent: Group, rootInstance: SymbolInstance, artboard: Artboard, path: string): Layer | undefined {
    if (isSymbolInstanceLayer(layer)) {
        if (layer.type != sketch.Types.SymbolInstance) {
            pushSymbolDebug({
                symbol: rootInstance.name,
                artboard: artboard.name,
                stage: "nested-symbol-symbollike",
                child: `${layer.type}:${layer.name}`,
                nativeClass: getNativeLayerClassName(layer),
            });
        }
        return projectNestedSymbol(layer, parent, rootInstance, artboard, path);
    }
    try {
        let duplicated = layer.duplicate() as Layer;
        duplicated.parent = parent;
        duplicated.frame = layer.frame.offset(0, 0);
        setProjectedSourceId(duplicated, layer);
        setProjectedPath(duplicated, path);
        syncProjectedChildrenFromSource(duplicated, layer, rootInstance, artboard, path);
        return duplicated;
    } catch (error) {
        pushSymbolDebug({
            symbol: rootInstance.name,
            artboard: artboard.name,
            stage: "duplicate-child-failed",
            child: `${layer.type}:${layer.name}`,
            error: String(error),
        });
        return undefined;
    }
}

function syncProjectedChildrenFromSource(
    projected: Layer,
    source: Layer,
    rootInstance: SymbolInstance,
    artboard: Artboard,
    path: string
) {
    let sourceChildren = getChildLayers(source);
    if (!sourceChildren.length) return;

    getChildLayers(projected).forEach(child => safeRemove(child));
    sourceChildren.forEach((child, childIndex) => {
        projectLayer(child, projected as any as Group, rootInstance, artboard, `${path}/${childIndex}`);
    });
}

function projectNestedSymbol(layer: Layer, parent: Group, rootInstance: SymbolInstance, artboard: Artboard, path: string): Layer | undefined {
    let master = getLayerSymbolMaster(layer);
    let expandedLayer = getExpandedLayerAtPath(rootInstance, path);
    pushSymbolDebug({
        symbol: rootInstance.name,
        artboard: artboard.name,
        stage: "nested-symbol-enter",
        child: `${layer.type}:${layer.name}`,
        master: master ? master.name : undefined,
    });
    if (!master) {
        pushSymbolDebug({
            symbol: rootInstance.name,
            artboard: artboard.name,
            stage: "nested-symbol-missing-master",
            child: `${layer.type}:${layer.name}`,
        });
        return undefined;
    }

    let container = new sketch.Group({
        parent,
        name: layer.name,
        frame: new sketch.Rectangle(
            layer.frame.x,
            layer.frame.y,
            layer.frame.width,
            layer.frame.height
        ),
    });
    setProjectedSourceId(container, layer);
    setProjectedPath(container, path);
    (container as any).__meaxureProjectedNestedSymbol = true;

    let nestedChildren: Layer[] = [];
    getChildLayers(master).forEach((child, childIndex) => {
        let projected = projectLayer(child, container, rootInstance, artboard, `${path}/${childIndex}`);
        if (projected) nestedChildren.push(projected);
    });

    if (!nestedChildren.length) {
        safeRemove(container);
        pushSymbolDebug({
            symbol: rootInstance.name,
            artboard: artboard.name,
            stage: "nested-symbol-empty",
            child: `${layer.type}:${layer.name}`,
            master: master.name,
        });
        return undefined;
    }

    let scaleX = safeScale(layer.frame.width, master.frame.width);
    let scaleY = safeScale(layer.frame.height, master.frame.height);
    scaleLayerTree(nestedChildren, scaleX, scaleY);
    if (expandedLayer) {
        syncProjectedTreeWithExpandedLayer(rootInstance, container, expandedLayer);
    }
    pushSymbolDebug({
        symbol: rootInstance.name,
        artboard: artboard.name,
        stage: "nested-symbol-projected",
        child: `${layer.type}:${layer.name}`,
        master: master.name,
        projectedCount: nestedChildren.length,
    });

    return container;
}

function getExpandedLayerAtPath(instance: SymbolInstance, path: string): Layer | undefined {
    let expandedLayers = getExpandedLayers(instance);
    if (!expandedLayers || !expandedLayers.length) return undefined;
    let indexes = String(path || "")
        .split("/")
        .filter(Boolean)
        .map(part => Number(part))
        .filter(part => isFinite(part) && part >= 0);
    if (!indexes.length) return undefined;

    let current = expandedLayers[indexes[0]];
    for (let i = 1; current && i < indexes.length; i++) {
        current = getExpandedChildLayers(current)[indexes[i]];
    }
    return current;
}

function getMasterLayerAtPath(instance: SymbolInstance, path: string): Layer | undefined {
    let master = instance ? instance.master : undefined;
    if (!master) return undefined;
    let indexes = String(path || "")
        .split("/")
        .filter(Boolean)
        .map(part => Number(part))
        .filter(part => isFinite(part) && part >= 0);
    if (!indexes.length) return undefined;

    let current = getChildLayers(master)[indexes[0]];
    for (let i = 1; current && i < indexes.length; i++) {
        current = getChildLayers(current)[indexes[i]];
    }
    return current;
}

function getPreferredProjectedSourceId(instance: SymbolInstance, projectedLayer: Layer, expandedLayer: Layer, path?: string): string | undefined {
    let expandedSourceId = getExpandedLayerSourceId(instance, expandedLayer);
    let masterLayer = getMasterLayerAtPath(instance, path || "");
    if (shouldUseMasterSourceForProjectedLayer(projectedLayer, masterLayer)) {
        return masterLayer.id;
    }
    return expandedSourceId || (masterLayer ? masterLayer.id : undefined);
}

function shouldUseMasterSourceForProjectedLayer(projectedLayer?: Layer, masterLayer?: Layer): boolean {
    if (!projectedLayer || !masterLayer) return false;
    let projectedExportable = !!(projectedLayer.exportFormats && projectedLayer.exportFormats.length);
    let masterExportable = !!(masterLayer.exportFormats && masterLayer.exportFormats.length);
    return projectedLayer.type == sketch.Types.Slice
        || masterLayer.type == sketch.Types.Slice
        || projectedExportable
        || masterExportable;
}

function syncProjectedTreeWithExpandedLayer(instance: SymbolInstance, projected: Layer, expanded: Layer) {
    if (!projected || !expanded) return;
    let expandedSourceId = getPreferredProjectedSourceId(instance, projected, expanded, getProjectedPath(projected));
    if (expandedSourceId) setProjectedSourceIdValue(projected, expandedSourceId);

    let projectedChildren = getChildLayers(projected);
    let expandedChildren = getExpandedChildLayers(expanded);
    let count = Math.min(projectedChildren.length, expandedChildren.length);
    for (let i = 0; i < count; i++) {
        syncProjectedTreeWithExpandedLayer(instance, projectedChildren[i], expandedChildren[i]);
    }
}

function isSymbolInstanceLayer(layer: Layer): layer is SymbolInstance {
    if (!layer) return false;
    if (layer.type == sketch.Types.SymbolInstance) return true;

    try {
        if ((layer as any).master || (layer as any).symbolId || (layer as any).symbolID) return true;
    } catch (error) {
        // ignore wrapper access failures and keep checking via native APIs
    }

    let nativeLayer = (layer as any).sketchObject;
    if (!nativeLayer) return false;

    let className = getNativeLayerClassName(layer);
    if (className && /SymbolInstance/i.test(className)) return true;

    let nativeMaster = callNative<any>(nativeLayer, "symbolMaster", undefined) || callNative<any>(nativeLayer, "master", undefined);
    if (nativeMaster) return true;

    let symbolId = callNative<any>(nativeLayer, "symbolID", undefined) || callNative<any>(nativeLayer, "symbolId", undefined);
    return !!symbolId;
}

function getLayerSymbolMaster(layer: Layer): SymbolMaster | undefined {
    if (!layer) return undefined;
    try {
        let master = (layer as any).master as SymbolMaster | undefined;
        if (master) return master;
    } catch (error) {
        // fall back to native bridge for immutable symbol children
    }

    let nativeLayer = (layer as any).sketchObject;
    if (!nativeLayer) return undefined;
    let nativeMaster = callNative<any>(nativeLayer, "symbolMaster", undefined) || callNative<any>(nativeLayer, "master", undefined);
    if (!nativeMaster) return undefined;
    return wrapLayer(nativeMaster) as SymbolMaster;
}

function getNativeLayerClassName(layer: Layer): string | undefined {
    let nativeLayer = layer ? (layer as any).sketchObject : undefined;
    if (!nativeLayer || !hasNativeMethod(nativeLayer, "class")) return undefined;
    try {
        return String(nativeLayer.class());
    } catch (error) {
        return undefined;
    }
}

function applyOverrides(instance: SymbolInstance, duplicatedById: { [key: string]: Layer }) {
    if (!instance.overrides || !instance.overrides.length) return;
    let pendingLayouts: Group[] = [];
    instance.overrides.forEach(override => {
        if (override.isDefault) return;
        if (!override.affectedLayer) return;

        let target = duplicatedById[override.affectedLayer.id];
        if (!target) return;

        if (override.property == "stringValue" && target.type == sketch.Types.Text) {
            try {
                applyTextOverride(target as Text, String(override.value || ""));
                collectPendingLayouts(target, pendingLayouts);
            } catch (error) {
                pushSymbolDebug({
                    symbol: instance.name,
                    artboard: instance.getParentArtboard() ? instance.getParentArtboard().name : "",
                    stage: "override-text-failed",
                    target: `${target.type}:${target.name}`,
                    value: String(override.value || ""),
                    error: String(error),
                });
                throw error;
            }
            return;
        }
        if (override.property == "symbolID" && target.type == sketch.Types.SymbolInstance && override.value) {
            try {
                (target as SymbolInstance).symbolId = String(override.value);
                (target as SymbolInstance).resizeWithSmartLayout();
                collectPendingLayouts(target, pendingLayouts);
            } catch (error) {
                pushSymbolDebug({
                    symbol: instance.name,
                    artboard: instance.getParentArtboard() ? instance.getParentArtboard().name : "",
                    stage: "override-symbol-failed",
                    target: `${target.type}:${target.name}`,
                    value: String(override.value || ""),
                    error: String(error),
                });
            }
        }
    });
    applyPendingLayouts(instance, pendingLayouts);
}

function applyTextOverride(target: Text, value: string) {
    let oldFrame = cloneRect(target.frame);
    let oldFixedWidth = safeTextFixedWidth(target);

    target.text = value;

    if (!oldFixedWidth && typeof target.adjustToFit === "function") {
        target.adjustToFit();
        return;
    }

    let nextFrame = cloneRect(target.frame);
    let alignment = target.style ? target.style.alignment : undefined;
    let verticalAlignment = target.style ? target.style.verticalAlignment : undefined;
    let nextX = oldFrame.x;
    let nextY = oldFrame.y;

    switch (alignment) {
        case sketch.Text.Alignment.center:
            nextX = oldFrame.x + (oldFrame.width - nextFrame.width) / 2;
            break;
        case sketch.Text.Alignment.right:
            nextX = oldFrame.x + oldFrame.width - nextFrame.width;
            break;
        default:
            nextX = oldFrame.x;
            break;
    }

    switch (verticalAlignment) {
        case sketch.Text.VerticalAlignment.center:
            nextY = oldFrame.y + (oldFrame.height - nextFrame.height) / 2;
            break;
        case sketch.Text.VerticalAlignment.bottom:
            nextY = oldFrame.y + oldFrame.height - nextFrame.height;
            break;
        default:
            nextY = oldFrame.y;
            break;
    }

    target.frame = new sketch.Rectangle(
        nextX,
        nextY,
        nextFrame.width,
        nextFrame.height
    );
}

function safeTextFixedWidth(target: Text): boolean {
    if (typeof (target as any).fixedWidth == "boolean") return !!(target as any).fixedWidth;
    let textBehaviour = (target as any).textBehaviour;
    return textBehaviour === TextBehaviour.fixedSize || textBehaviour === "fixedSize";
}

function collectPendingLayouts(layer: Layer, pendingLayouts: Group[]) {
    let current = layer ? layer.parent as Group : undefined;
    while (current) {
        if (hasRefreshableLayout(current)) pendingLayouts.push(current);
        current = current.parent as Group;
    }
}

function hasRefreshableLayout(group: Group): boolean {
    if (isProjectedNestedSymbolContainer(group)) return true;
    let stackLayout = getStackLayout(group);
    if (stackLayout && typeof stackLayout.apply === "function") return true;
    return hasNativeInferredLayout(group);
}

function applyPendingLayouts(instance: SymbolInstance, pendingLayouts: Group[]) {
    if (!pendingLayouts.length) return;
    let unique = dedupeGroups(pendingLayouts);
    unique
        .sort((a, b) => getLayerDepth(b) - getLayerDepth(a))
        .forEach(group => {
            let methods: string[] = [];
            if (resizeProjectedNestedSymbolContainer(group)) methods.push("nested.adjustToFit");
            if (applyOfficialStackLayout(group)) methods.push("stack.apply");
            methods.push(...applyNativeInferredLayout(group));
            if (methods.length) {
                pushSymbolDebug({
                    symbol: instance.name,
                    artboard: instance.getParentArtboard() ? instance.getParentArtboard().name : "",
                    stage: "layout-refresh",
                    group: group.name,
                    methods,
                });
            }
        });
}

function dedupeGroups(groups: Group[]): Group[] {
    let map: { [key: string]: Group } = {};
    groups.forEach(group => {
        if (!group) return;
        map[group.id] = group;
    });
    return Object.keys(map).map(key => map[key]);
}

function getLayerDepth(layer: Layer): number {
    let depth = 0;
    let current = layer;
    while (current && current.parent) {
        depth++;
        current = current.parent as Group;
    }
    return depth;
}

function getStackLayout(group: Group): any {
    if (!group) return undefined;
    let stackLayout = (group as any).stackLayout;
    if (stackLayout) return stackLayout;
    return callNative<any>((group as any).sketchObject, "stackLayout", undefined);
}

function isProjectedNestedSymbolContainer(group: Group): boolean {
    return !!(group && (group as any).__meaxureProjectedNestedSymbol);
}

function resizeProjectedNestedSymbolContainer(group: Group): boolean {
    if (!isProjectedNestedSymbolContainer(group)) return false;
    try {
        let oldFrame = cloneRect(group.frame);
        if (typeof (group as any).adjustToFit !== "function") return false;
        (group as any).adjustToFit();
        return !framesEqual(oldFrame, group.frame);
    } catch (error) {
        return false;
    }
}

function applyOfficialStackLayout(group: Group): boolean {
    let stackLayout = getStackLayout(group);
    if (!stackLayout || typeof stackLayout.apply !== "function") return false;
    try {
        stackLayout.apply();
        return true;
    } catch (error) {
        return false;
    }
}

function hasNativeInferredLayout(group: Group): boolean {
    let nativeGroup = group ? (group as any).sketchObject : undefined;
    if (!nativeGroup) return false;
    if (hasNativeMethod(nativeGroup, "hasInferredLayout") && nativeGroup.hasInferredLayout()) return true;

    let groupLayout = callNative<any>(nativeGroup, "groupLayout", undefined);
    if (!groupLayout) return false;
    if (hasNativeMethod(groupLayout, "isInferredLayout") && groupLayout.isInferredLayout()) return true;
    if (hasNativeMethod(groupLayout, "isOrInheritsInferredLayout") && groupLayout.isOrInheritsInferredLayout()) return true;
    if (hasNativeMethod(groupLayout, "nearestInferredGroupLayout") && groupLayout.nearestInferredGroupLayout()) return true;
    if (hasNativeMethod(groupLayout, "topmostInferredGroupLayout") && groupLayout.topmostInferredGroupLayout()) return true;
    return false;
}

function applyNativeInferredLayout(group: Group): string[] {
    let methods: string[] = [];
    if (!hasNativeInferredLayout(group)) return methods;

    let nativeGroup = group ? (group as any).sketchObject : undefined;
    let nativeGroupLayout = nativeGroup ? callNative<any>(nativeGroup, "groupLayout", undefined) : undefined;

    try {
        if (nativeGroup && hasNativeMethod(nativeGroup, "legacyFixGeometryWithOptions")) {
            nativeGroup.legacyFixGeometryWithOptions(0);
            methods.push("group.legacyFixGeometry");
        }
    } catch (error) {
        // ignore and keep trying other layout refresh methods
    }

    try {
        if (nativeGroupLayout && hasNativeMethod(nativeGroupLayout, "doFixGeometryWithOptions")) {
            nativeGroupLayout.doFixGeometryWithOptions(0);
            methods.push("layout.fixGeometry");
        }
    } catch (error) {
        // ignore and keep exporting
    }

    return methods;
}

function cloneRect(rect: Rectangle): Rectangle {
    return new sketch.Rectangle(rect.x, rect.y, rect.width, rect.height);
}

function framesEqual(a: Rectangle, b: Rectangle): boolean {
    return Math.abs(a.x - b.x) < 0.001
        && Math.abs(a.y - b.y) < 0.001
        && Math.abs(a.width - b.width) < 0.001
        && Math.abs(a.height - b.height) < 0.001;
}

function scaleLayerTree(
    roots: Layer[],
    scaleX: number,
    scaleY: number,
    snapshot?: ExpandedSnapshotMap | { [key: string]: ExpandedLayerSnapshot }
) {
    let queue = roots.slice();
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;

        let expanded = snapshot ? getExpandedSnapshotForLayer(snapshot as any, layer) : undefined;
        let preserveLocalTextLayout = layer.type == sketch.Types.Text && !!(expanded && expanded.preserveLocalTextLayout);

        if (!preserveLocalTextLayout) {
            layer.frame = new sketch.Rectangle(
                layer.frame.x * scaleX,
                layer.frame.y * scaleY,
                layer.frame.width * scaleX,
                layer.frame.height * scaleY
            );
        }

        if (layer.type == sketch.Types.Text && !preserveLocalTextLayout) {
            let text = layer as Text;
            try {
                text.style.fontSize = text.style.fontSize * scaleY;
                if (text.style.lineHeight) text.style.lineHeight = text.style.lineHeight * scaleY;
                if (typeof text.style.kerning == "number") text.style.kerning = text.style.kerning * scaleX;
            } catch (error) {
                // keep exporting even if a specific text style cannot be scaled
            }
        }

        queue.push(...getChildLayers(layer));
    }
}

function getExpandedLayerSnapshot(instance: SymbolInstance, artboard: Artboard): ExpandedSnapshotMap | undefined {
    try {
        let expandedLayers = getExpandedLayers(instance);
        if (!expandedLayers || !expandedLayers.length) return undefined;

        let instanceRect = getInstanceArtboardRect(instance, artboard);
        let snapshot: ExpandedSnapshotMap = {
            byId: {},
            byPath: {},
            bySignature: {},
        };

        expandedLayers.forEach((layer: Layer, layerIndex: number) => {
            collectExpandedLayerSnapshot(instance, layer, instanceRect.x, instanceRect.y, snapshot, String(layerIndex));
        });

        return (Object.keys(snapshot.byId).length || Object.keys(snapshot.byPath).length) ? snapshot : undefined;
    } catch (error) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "expanded-layers-failed",
            error: String(error),
        });
        return undefined;
    }
}

function getOverrideFrameSnapshot(instance: SymbolInstance, artboard: Artboard, scaleX: number, scaleY: number): ExpandedSnapshotMap | undefined {
    try {
        let expandedSnapshot = getExpandedOverrideFrameSnapshot(instance, artboard, scaleX, scaleY);
        if (expandedSnapshot) return expandedSnapshot;
        if (!instance.overrides || !instance.overrides.length) return undefined;
        let instanceRect = getInstanceArtboardRect(instance, artboard);
        let snapshot: ExpandedSnapshotMap = {
            byId: {},
            byPath: {},
            bySignature: {},
        };
        let preserveLocalTextLayout = shouldPreserveLocalTextLayout(scaleX, scaleY);

        instance.overrides.forEach(override => {
            if (!override || !override.affectedLayer) return;
            let frame = getOverrideFrame(override);
            if (!frame) return;

            let existing = snapshot.byId[override.affectedLayer.id];
            let item: ExpandedLayerSnapshot = {
                rect: {
                    x: instanceRect.x + frame.x,
                    y: instanceRect.y + frame.y,
                    width: frame.width,
                    height: frame.height,
                },
                hidden: !!override.affectedLayer.hidden,
            };
            if (override.affectedLayer.type == sketch.Types.Text) {
                let text = override.affectedLayer as Text;
                item.text = text.text;
                item.fontSize = text.style ? text.style.fontSize : undefined;
                item.lineHeight = text.style ? text.style.lineHeight : undefined;
                item.kerning = text.style ? text.style.kerning : undefined;
                item.preserveLocalTextLayout = preserveLocalTextLayout;
            }

            snapshot.byId[override.affectedLayer.id] = mergeExpandedLayerSnapshot(existing, item);
        });

        return Object.keys(snapshot.byId).length ? snapshot : undefined;
    } catch (error) {
        pushSymbolDebug({
            symbol: instance.name,
            artboard: artboard.name,
            stage: "override-frames-failed",
            error: String(error),
        });
        return undefined;
    }
}

function getExpandedOverrideFrameSnapshot(
    instance: SymbolInstance,
    artboard: Artboard,
    scaleX: number,
    scaleY: number
): ExpandedSnapshotMap | undefined {
    let expandedLayers = getExpandedLayers(instance);
    if (!expandedLayers || !expandedLayers.length) return undefined;

    let instanceRect = getInstanceArtboardRect(instance, artboard);
    let preserveLocalTextLayout = shouldPreserveLocalTextLayout(scaleX, scaleY);
    let snapshot: ExpandedSnapshotMap = {
        byId: {},
        byPath: {},
        bySignature: {},
    };

    expandedLayers.forEach((layer, index) => {
        collectExpandedOverrideFrameSnapshot(
            instance,
            layer,
            instanceRect,
            snapshot,
            preserveLocalTextLayout,
            String(index),
            0,
            0
        );
    });
    return (Object.keys(snapshot.byId).length || Object.keys(snapshot.byPath).length) ? snapshot : undefined;
}

function collectExpandedOverrideFrameSnapshot(
    instance: SymbolInstance,
    layer: Layer,
    instanceRect: Rectangle,
    snapshot: ExpandedSnapshotMap,
    preserveLocalTextLayout: boolean,
    path: string,
    originX: number,
    originY: number,
    parentName?: string
) {
    if (!layer) return;
    let overrides = getOverridesForExpandedLayer(instance, layer);
    let overrideFrame = overrides
        .map(override => ({ override, frame: getOverrideFrame(override) }))
        .find(item => !!item.frame);

    if (overrideFrame && overrideFrame.override && overrideFrame.override.affectedLayer) {
        let affectedLayer = overrideFrame.override.affectedLayer;
        let existing = snapshot.byId[affectedLayer.id];
        let item: ExpandedLayerSnapshot = {
            rect: {
                x: instanceRect.x + originX + overrideFrame.frame.x,
                y: instanceRect.y + originY + overrideFrame.frame.y,
                width: overrideFrame.frame.width,
                height: overrideFrame.frame.height,
            },
            hidden: !!affectedLayer.hidden,
        };
        if (affectedLayer.type == sketch.Types.Text) {
            let text = affectedLayer as Text;
            item.text = text.text;
            item.fontSize = text.style ? text.style.fontSize : undefined;
            item.lineHeight = text.style ? text.style.lineHeight : undefined;
            item.kerning = text.style ? text.style.kerning : undefined;
            item.preserveLocalTextLayout = preserveLocalTextLayout;
        }
        snapshot.byId[affectedLayer.id] = mergeExpandedLayerSnapshot(existing, item);
        snapshot.byPath[path] = mergeExpandedLayerSnapshot(snapshot.byPath[path], item);
        let signature = getLayerSignatureFromMeta(parentName || "", getExpandedLayerType(layer), getExpandedLayerName(layer));
        snapshot.bySignature[signature] = mergeExpandedLayerSnapshot(snapshot.bySignature[signature], item);
    }

    let layerFrame = getExpandedLayerFrame(layer);
    let childOriginX = originX + (layerFrame ? layerFrame.x : 0);
    let childOriginY = originY + (layerFrame ? layerFrame.y : 0);
    getExpandedChildLayers(layer).forEach((child, index) => {
        collectExpandedOverrideFrameSnapshot(
            instance,
            child,
            instanceRect,
            snapshot,
            preserveLocalTextLayout,
            `${path}/${index}`,
            childOriginX,
            childOriginY,
            getExpandedLayerName(layer)
        );
    });
}

function getOverridesForExpandedLayer(instance: SymbolInstance, layer: Layer): Override[] {
    try {
        if (typeof (instance as any).overridesForExpandedLayer !== "function") return [];
        let overrides = (instance as any).overridesForExpandedLayer(layer) as Override[] | undefined;
        return overrides || [];
    } catch (error) {
        return [];
    }
}

function mergeExpandedLayerSnapshot(existing: ExpandedLayerSnapshot | undefined, next: ExpandedLayerSnapshot): ExpandedLayerSnapshot {
    if (!existing) return next;
    return {
        rect: next.rect || existing.rect,
        hidden: next.hidden,
        text: next.text !== undefined ? next.text : existing.text,
        fontSize: typeof next.fontSize == "number" ? next.fontSize : existing.fontSize,
        lineHeight: typeof next.lineHeight == "number" ? next.lineHeight : existing.lineHeight,
        kerning: typeof next.kerning == "number" ? next.kerning : existing.kerning,
        preserveLocalTextLayout: next.preserveLocalTextLayout || existing.preserveLocalTextLayout,
    };
}

function shouldPreserveLocalTextLayout(scaleX: number, scaleY: number): boolean {
    return Math.abs(scaleY - 1) < 0.01 && Math.abs(scaleX - scaleY) > 0.01;
}

function getOverrideFrame(override: Override): Rectangle | undefined {
    let rawFrame: any = undefined;
    try {
        if (typeof (override as any).getFrame === "function") {
            rawFrame = (override as any).getFrame();
        }
    } catch (error) {
        rawFrame = undefined;
    }
    if (!rawFrame) return undefined;

    let x = Number(rawFrame.x);
    let y = Number(rawFrame.y);
    let width = Number(rawFrame.width);
    let height = Number(rawFrame.height);
    if (![x, y, width, height].every(value => isFinite(value))) return undefined;
    return new sketch.Rectangle(x, y, width, height);
}

function collectExpandedLayerSnapshot(instance: SymbolInstance, layer: Layer, originX: number, originY: number, snapshot: ExpandedSnapshotMap, path: string, parentName?: string) {
    let layerFrame = getExpandedLayerFrame(layer);
    if (!layer || !layerFrame) return;
    let rect = {
        x: originX + layerFrame.x,
        y: originY + layerFrame.y,
        width: layerFrame.width,
        height: layerFrame.height,
    };
    let item: ExpandedLayerSnapshot = {
        rect,
        hidden: isExpandedLayerHidden(layer),
    };
    if (layer.type == sketch.Types.Text) {
        let text = layer as Text;
        item.text = text.text;
        if (text.style) {
            item.fontSize = text.style.fontSize;
            item.lineHeight = text.style.lineHeight;
            item.kerning = text.style.kerning;
        }
    }
    let key = getExpandedLayerSourceId(instance, layer);
    snapshot.byId[key] = mergeExpandedLayerSnapshot(snapshot.byId[key], item);
    snapshot.byPath[path] = mergeExpandedLayerSnapshot(snapshot.byPath[path], item);
    let signature = getLayerSignatureFromMeta(parentName || "", getExpandedLayerType(layer), getExpandedLayerName(layer));
    snapshot.bySignature[signature] = mergeExpandedLayerSnapshot(snapshot.bySignature[signature], item);

    getExpandedChildLayers(layer).forEach((child, childIndex) => {
        collectExpandedLayerSnapshot(instance, child, rect.x, rect.y, snapshot, `${path}/${childIndex}`, getExpandedLayerName(layer));
    });
}

function getExpandedLayerSourceId(instance: SymbolInstance, layer: Layer): string {
    try {
        if (typeof (instance as any).overridesForExpandedLayer === "function") {
            let overrides = (instance as any).overridesForExpandedLayer(layer) as Override[] | undefined;
            let override = overrides && overrides.find(item => item && item.affectedLayer && item.affectedLayer.id);
            if (override && override.affectedLayer && override.affectedLayer.id) {
                return override.affectedLayer.id;
            }
        }
    } catch (error) {
        // fallback to expanded layer id when this Sketch build cannot resolve overrides
    }
    return layer.id;
}

function getExpandedLayerFrame(layer: Layer): Rectangle | undefined {
    if (!layer) return undefined;
    try {
        if (layer.frame) {
            return new sketch.Rectangle(layer.frame.x, layer.frame.y, layer.frame.width, layer.frame.height);
        }
    } catch (error) {
        // Fall back to the native MSRect/CGRect bridge for expanded layer snapshots.
    }

    let nativeLayer = (layer as any).sketchObject;
    if (!nativeLayer) return undefined;
    let nativeFrame = callNative<any>(nativeLayer, "frame", undefined);
    let rect = nativeFrame ? nativeRectToRectangle(nativeFrame) : undefined;
    if (rect) return rect;

    let nativeRect = callNative<any>(nativeLayer, "rect", undefined);
    return nativeRectToRectangle(nativeRect);
}

function nativeRectToRectangle(value: any): Rectangle | undefined {
    if (!value) return undefined;
    let cgRect = getNativeCGRect(value);
    let x = getNativeStructNumber(cgRect, "origin", "x");
    let y = getNativeStructNumber(cgRect, "origin", "y");
    let width = getNativeStructNumber(cgRect, "size", "width");
    let height = getNativeStructNumber(cgRect, "size", "height");
    if ([x, y, width, height].every(item => isFinite(item))) {
        return new sketch.Rectangle(x, y, width, height);
    }

    x = getNativeNumber(value, "x");
    y = getNativeNumber(value, "y");
    width = getNativeNumber(value, "width");
    height = getNativeNumber(value, "height");
    if (![x, y, width, height].every(item => isFinite(item))) return undefined;
    return new sketch.Rectangle(x, y, width, height);
}

function getNativeNumber(target: any, key: string): number {
    try {
        if (!target) return NaN;
        let value = getNativeMapValue(target, key);
        if (typeof value == "function") return Number(value.call(target));
        return Number(value);
    } catch (error) {
        return NaN;
    }
}

function getNativeStructNumber(target: any, parentKey: string, key: string): number {
    try {
        if (!target) return NaN;
        let parent = getNativeMapValue(target, parentKey);
        if (!parent) return NaN;
        let value = getNativeMapValue(parent, key);
        if (typeof value == "function") return Number(value.call(parent));
        return Number(value);
    } catch (error) {
        return NaN;
    }
}

function getNativeMapValue(target: any, key: string): any {
    if (!target) return undefined;
    try {
        if (hasNativeMethod(target, "objectForKey")) {
            let value = target.objectForKey(key);
            if (value !== undefined && value !== null) return value;
        }
    } catch (error) {
        // ignore native dictionary lookup failures and keep trying other bridges
    }
    try {
        if (hasNativeMethod(target, "valueForKey")) {
            let value = target.valueForKey(key);
            if (value !== undefined && value !== null) return value;
        }
    } catch (error) {
        // ignore KVC lookup failures and fall back to direct access
    }
    try {
        return target[key];
    } catch (error) {
        return undefined;
    }
}

function getNativeCGRect(value: any): any {
    if (!value) return value;
    try {
        if (hasNativeMethod(value, "rect")) {
            return value.rect();
        }
    } catch (error) {
        // ignore native struct bridge errors and use the value directly
    }
    return value;
}

function getExpandedChildLayers(layer: Layer): Layer[] {
    let nativeLayer = layer ? (layer as any).sketchObject : undefined;
    if (!nativeLayer) return [];
    let nativeChildren = callNative<any>(nativeLayer, "layers", undefined);
    if (!nativeChildren) return [];

    let count = hasNativeMethod(nativeChildren, "count")
        ? Number(nativeChildren.count())
        : Number(nativeChildren.length) || 0;
    let results: Layer[] = [];
    for (let i = 0; i < count; i++) {
        let nativeChild = nativeChildren.objectAtIndex ? nativeChildren.objectAtIndex(i) : nativeChildren[i];
        let wrapped = wrapLayer(nativeChild);
        if (wrapped) results.push(wrapped);
    }
    return results;
}

function isExpandedLayerHidden(layer: Layer): boolean {
    if (!layer) return false;
    let nativeLayer = (layer as any).sketchObject;
    if (nativeLayer && hasNativeMethod(nativeLayer, "isVisible")) {
        try {
            return !nativeLayer.isVisible();
        } catch (error) {
            // fall back to wrapper hidden state
        }
    }
    return !!layer.hidden;
}

function getExpandedLayerName(layer: Layer): string {
    if (!layer) return "";
    try {
        return String(layer.name || "");
    } catch (error) {
        return "";
    }
}

function getExpandedLayerType(layer: Layer): string {
    if (!layer) return "";
    try {
        return String(layer.type || "");
    } catch (error) {
        return "";
    }
}

function applyExpandedLayerSnapshot(
    roots: Layer[],
    snapshot: ExpandedSnapshotMap | { [key: string]: ExpandedLayerSnapshot },
    options?: ApplyExpandedSnapshotOptions
) {
    let applyRect = options && options.applyRect === false ? false : true;
    let applyTextMetrics = options && options.applyTextMetrics === false ? false : true;
    let applyHidden = options && options.applyHidden === false ? false : true;
    let queue = roots.slice();
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;

        let expanded = getExpandedSnapshotForLayer(snapshot, layer);
        if (expanded) {
            if (applyRect) {
                let projectedRect = expanded.rect;
                if (expanded.preserveLocalTextLayout && layer.type == sketch.Types.Text) {
                    projectedRect = {
                        x: expanded.rect.x,
                        y: expanded.rect.y,
                        width: layer.frame.width,
                        height: layer.frame.height,
                    };
                }
                setProjectedRect(layer, projectedRect);
                syncLayerFrameToProjectedRect(layer, projectedRect);
            }
            if (applyHidden) {
                layer.hidden = expanded.hidden;
            }
            if (applyTextMetrics && layer.type == sketch.Types.Text && !expanded.preserveLocalTextLayout) {
                let text = layer as Text;
                if (expanded.text !== undefined) text.text = expanded.text;
                try {
                    if (typeof expanded.fontSize == "number") text.style.fontSize = expanded.fontSize;
                    if (typeof expanded.lineHeight == "number") text.style.lineHeight = expanded.lineHeight;
                    if (typeof expanded.kerning == "number") text.style.kerning = expanded.kerning;
                } catch (error) {
                    // keep exporting even if a specific text style cannot be synced
                }
            }
        }

        queue.push(...getChildLayers(layer));
    }
}

function applyExpandedLayerRectsForContainerLayers(
    roots: Layer[],
    snapshot: ExpandedSnapshotMap | { [key: string]: ExpandedLayerSnapshot }
) {
    let queue = roots.slice();
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;

        let expanded = getExpandedSnapshotForLayer(snapshot, layer);
        if (expanded && layer.type != sketch.Types.Text && layer.type != sketch.Types.Slice) {
            setProjectedRect(layer, expanded.rect);
            syncLayerFrameToProjectedRect(layer, expanded.rect);
            layer.hidden = expanded.hidden;
        }

        queue.push(...getChildLayers(layer));
    }
}

function applyExpandedLayerRectsForExportableLayers(
    roots: Layer[],
    snapshot: ExpandedSnapshotMap | { [key: string]: ExpandedLayerSnapshot }
) {
    let queue = roots.slice();
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;

        let expanded = getExpandedSnapshotForLayer(snapshot, layer);
        let hasExportFormats = !!(layer.exportFormats && layer.exportFormats.length);
        if (expanded && (layer.type == sketch.Types.Slice || hasExportFormats)) {
            setProjectedRect(layer, expanded.rect);
            syncLayerFrameToProjectedRect(layer, expanded.rect);
            layer.hidden = expanded.hidden;
        }

        queue.push(...getChildLayers(layer));
    }
}

function applyExpandedSnapshotForNestedSymbolSubtrees(
    roots: Layer[],
    snapshot: ExpandedSnapshotMap | { [key: string]: ExpandedLayerSnapshot }
) {
    let queue = roots.slice();
    while (queue.length) {
        let layer = queue.shift();
        if (!layer) continue;

        if (isInsideProjectedNestedSymbol(layer) && layer.type != sketch.Types.Slice) {
            let expanded = getExpandedSnapshotForLayer(snapshot, layer);
            if (expanded) {
                let projectedRect = expanded.rect;
                if (expanded.preserveLocalTextLayout && layer.type == sketch.Types.Text) {
                    projectedRect = {
                        x: expanded.rect.x,
                        y: expanded.rect.y,
                        width: layer.frame.width,
                        height: layer.frame.height,
                    };
                }
                setProjectedRect(layer, projectedRect);
                syncLayerFrameToProjectedRect(layer, projectedRect);
                layer.hidden = expanded.hidden;

                if (layer.type == sketch.Types.Text) {
                    let text = layer as Text;
                    if (expanded.text !== undefined) text.text = expanded.text;
                    try {
                        if (typeof expanded.fontSize == "number") text.style.fontSize = expanded.fontSize;
                        if (typeof expanded.lineHeight == "number") text.style.lineHeight = expanded.lineHeight;
                        if (typeof expanded.kerning == "number") text.style.kerning = expanded.kerning;
                    } catch (error) {
                        // keep exporting even if a specific text style cannot be synced
                    }
                }
            }
        }

        queue.push(...getChildLayers(layer));
    }
}

function isInsideProjectedNestedSymbol(layer: Layer): boolean {
    let current = layer;
    while (current) {
        if (isProjectedNestedSymbolContainer(current as Group)) return true;
        current = current.parent as Layer;
    }
    return false;
}

function syncLayerFrameToProjectedRect(layer: Layer, projectedRect: ExpandedLayerSnapshot["rect"]) {
    if (!layer || !projectedRect) return;
    let parent = layer.parent as Layer;
    let parentRect = getLayerAbsoluteRect(parent);
    if (!parentRect) return;

    let nextFrame = new sketch.Rectangle(
        projectedRect.x - parentRect.x,
        projectedRect.y - parentRect.y,
        projectedRect.width,
        projectedRect.height
    );
    if (![nextFrame.x, nextFrame.y, nextFrame.width, nextFrame.height].every(value => isFinite(value))) return;
    layer.frame = nextFrame;
}

function getLayerAbsoluteRect(layer?: Layer): ExpandedLayerSnapshot["rect"] | undefined {
    if (!layer) return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    };

    let projectedRect = (layer as any).__meaxureProjectedRect as ExpandedLayerSnapshot["rect"] | undefined;
    if (projectedRect) return projectedRect;
    if (!layer.frame) return undefined;

    let parentRect = getLayerAbsoluteRect(layer.parent as Layer);
    if (!parentRect) return undefined;
    return {
        x: parentRect.x + layer.frame.x,
        y: parentRect.y + layer.frame.y,
        width: layer.frame.width,
        height: layer.frame.height,
    };
}

function getExpandedSnapshotForLayer(snapshot: ExpandedSnapshotMap | { [key: string]: ExpandedLayerSnapshot }, layer: Layer): ExpandedLayerSnapshot | undefined {
    if (!snapshot) return undefined;
    let sourceId = getProjectedSourceId(layer) || layer.id;
    if ((snapshot as ExpandedSnapshotMap).byId) {
        let map = snapshot as ExpandedSnapshotMap;
        return map.byId[sourceId] || map.byPath[getProjectedPath(layer)] || map.bySignature[getLayerSignature(layer)];
    }
    return (snapshot as { [key: string]: ExpandedLayerSnapshot })[sourceId];
}

function safeScale(value: number, base: number): number {
    if (!base || !isFinite(base)) return 1;
    let scale = value / base;
    if (!isFinite(scale) || scale <= 0) return 1;
    return scale;
}

function setProjectedSourceId(layer: Layer, source: Layer) {
    if (!layer || !source) return;
    (layer as any).__meaxureProjectedSourceID = source.id;
}

function setProjectedSourceIdValue(layer: Layer, sourceId: string) {
    if (!layer || !sourceId) return;
    (layer as any).__meaxureProjectedSourceID = sourceId;
}

function getProjectedSourceId(layer: Layer): string | undefined {
    return layer ? (layer as any).__meaxureProjectedSourceID : undefined;
}

function setProjectedPath(layer: Layer, path: string) {
    if (!layer) return;
    (layer as any).__meaxureProjectedPath = path;
}

function getProjectedPath(layer: Layer): string | undefined {
    return layer ? (layer as any).__meaxureProjectedPath : undefined;
}

function getLayerSignature(layer: Layer): string {
    let parent = layer && layer.parent ? layer.parent as Layer : undefined;
    let parentName = parent && parent.type != sketch.Types.Artboard && parent.type != sketch.Types.SymbolMaster
        && !isTempProjectedSymbolHost(parent)
        ? parent.name
        : "";
    return getLayerSignatureFromMeta(parentName, layer ? layer.type : "", layer ? layer.name : "");
}

function isTempProjectedSymbolHost(layer?: Layer): boolean {
    if (!layer) return false;
    let name = String(layer.name || "");
    return name.indexOf("#tmp-symbol-") === 0 || name.indexOf("#tmp-#tmp-symbol-") === 0;
}

function getLayerSignatureFromMeta(parentName: string, layerType: string, layerName: string): string {
    return `${parentName}|${layerType || ""}|${layerName || ""}`;
}

function setProjectedRect(layer: Layer, rect: ExpandedLayerSnapshot["rect"]) {
    if (!layer || !rect) return;
    (layer as any).__meaxureProjectedRect = rect;
}

function getInstanceArtboardRect(instance: SymbolInstance, artboard: Artboard): Rectangle {
    let projectedRect = (instance as any).__meaxureProjectedRect as ExpandedLayerSnapshot["rect"] | undefined;
    if (projectedRect) {
        return new sketch.Rectangle(
            projectedRect.x,
            projectedRect.y,
            projectedRect.width,
            projectedRect.height
        );
    }
    return instance.frame.changeBasis({ from: instance.parent as Group, to: artboard });
}

function safeRemove(layer?: Layer) {
    try {
        if (layer) layer.remove();
    } catch (error) {
        // ignore cleanup errors
    }
}

function dumpLayerTreeForDebug(layer: Layer): any {
    if (!layer) return undefined;
    return {
        name: String(layer.name || ""),
        type: String(layer.type || ""),
        frame: layer.frame ? {
            x: Number(layer.frame.x),
            y: Number(layer.frame.y),
            width: Number(layer.frame.width),
            height: Number(layer.frame.height),
        } : undefined,
        projectedRect: (layer as any).__meaxureProjectedRect || undefined,
        projectedSourceId: getProjectedSourceId(layer),
        projectedPath: getProjectedPath(layer),
        exportFormats: layer.exportFormats ? layer.exportFormats.length : 0,
        layers: getChildLayers(layer).map(child => dumpLayerTreeForDebug(child)),
    };
}
