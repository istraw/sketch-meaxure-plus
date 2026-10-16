const exportBuild = require('../../../package.json').version;
import { clearLayerStateCache } from './layerStates';

export class ExportCancelled extends Error {
    code = 'MEAXURE_EXPORT_CANCELLED';
    constructor() { super('Export cancelled'); }
}
export function isExportCancelled(error: any): boolean {
    return !!error && error.code === 'MEAXURE_EXPORT_CANCELLED';
}

export class ExportSession {
    private lastYield = Date.now();
    private lastReport = 0;
    yieldCount = 0;
    yieldMilliseconds = 0;
    readonly startedAt = Date.now();
    processed = 0;
    currentLayer = '';
    slowLayers: { name: string; milliseconds: number }[] = [];
    phases: { [name: string]: { count: number; milliseconds: number } } = {};
    constructor(private cancelled: () => boolean, private report: (session: ExportSession) => void) { clearLayerStateCache(); }
    checkpoint(name: string): Promise<void> | void {
        if (this.cancelled()) throw new ExportCancelled();
        this.currentLayer = name;
        if (Date.now() - this.lastReport >= 250) {
            this.report(this);
            this.lastReport = Date.now();
        }
        // Each yield also lets Sketch rebuild its canvas/layer list after
        // temporary model changes. Batch up to 250 ms of work between yields.
        if (Date.now() - this.lastYield >= 250) {
            let started = Date.now();
            return new Promise<void>(resolve => {
                // Sketch retains fired timer fiber handles until explicitly
                // cleared. Release each completed yield in long exports.
                const timer = setTimeout(() => { clearTimeout(timer); resolve(); }, 0);
            }).then(() => {
                // Native/UI changes can occur while the run loop is yielded. Reuse
                // ancestry within a synchronous batch, then refresh before resuming.
                clearLayerStateCache();
                this.yieldCount++;
                this.yieldMilliseconds += Date.now() - started;
                this.lastYield = Date.now();
                if (this.cancelled()) throw new ExportCancelled();
            });
        }
        if (this.cancelled()) throw new ExportCancelled();
    }
    record(name: string, started: number) {
        this.processed++;
        let milliseconds = Date.now() - started;
        if (milliseconds < 100) return;
        this.slowLayers.push({ name, milliseconds });
        this.slowLayers.sort((a, b) => b.milliseconds - a.milliseconds);
        this.slowLayers.length = Math.min(this.slowLayers.length, 30);
    }
    summary(status: string) {
        return { build: exportBuild, status, elapsedMs: Date.now() - this.startedAt,
            processed: this.processed, currentLayer: this.currentLayer, slowLayers: this.slowLayers, phases: this.phases,
            yieldCount: this.yieldCount, yieldMilliseconds: this.yieldMilliseconds };
    }
}

let activeSession: ExportSession;
export function setExportSession(session?: ExportSession) { activeSession = session; }
export function checkpointLayer(name: string): Promise<void> | void {
    if (activeSession) return activeSession.checkpoint(name);
}
export function recordLayer(name: string, started: number) {
    if (activeSession) activeSession.record(name, started);
}
export function measureExportPhase<T>(name: string, work: () => T): T {
    let started = Date.now();
    try { return work(); } finally {
        if (activeSession) {
            let phase = activeSession.phases[name] || (activeSession.phases[name] = { count: 0, milliseconds: 0 });
            phase.count++;
            phase.milliseconds += Date.now() - started;
        }
    }
}
export async function measureExportPhaseAsync<T>(name: string, work: () => Promise<T>, started: number = Date.now()): Promise<T> {
    try { return await work(); } finally {
        if (activeSession) {
            let phase = activeSession.phases[name] || (activeSession.phases[name] = { count: 0, milliseconds: 0 });
            phase.count++;
            phase.milliseconds += Date.now() - started;
        }
    }
}
