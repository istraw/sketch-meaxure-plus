import { hasNativeMethod } from "../../sketch/compat";

declare const NSActivityUserInitiatedAllowingIdleSystemSleep: number;

// Keep user-requested asynchronous exports from being treated as idle work.
// End the activity on every completion/error/cancellation path.
export function beginExportActivity(): () => void {
    try {
        if (typeof NSProcessInfo == 'undefined' || typeof NSActivityUserInitiatedAllowingIdleSystemSleep == 'undefined') return () => {};
        let process = NSProcessInfo.processInfo();
        if (!hasNativeMethod(process, 'beginActivityWithOptions_reason') || !hasNativeMethod(process, 'endActivity')) return () => {};
        let activity = process.beginActivityWithOptions_reason(NSActivityUserInitiatedAllowingIdleSystemSleep, 'Exporting Sketch specifications');
        return () => {
            if (!activity) return;
            let token = activity;
            activity = undefined;
            process.endActivity(token);
        };
    } catch (error) { return () => {}; }
}
