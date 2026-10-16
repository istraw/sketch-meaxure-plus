# Full-document export follow-up, 2026-10-15

## Scope and changes shipped in 2026.3.13

The user's most recent export was cancelled after 103.586 seconds and 3,037 processed layers. Its text-fragment phase reported 939 calls and 30.447 seconds. That phase included no-op asynchronous calls for non-text and plain-text layers; elapsed asynchronous phase time can also include native run-loop work.

The shipped changes keep ordinary layer processing synchronous, await only genuine pending work, batch checkpoints at 250 ms, explicitly clear completed timer handles, and render projected slice copies in the existing windowless scratch document. Synchronous errors, asynchronous errors, cancellation, warnings, and temporary-layer cleanup retain their existing behavior. Same-named assets with different overrides are not combined by name.

## Verification and limits

- `npm test`, `npm run build`, and `git diff --check` pass.
- The installed plugin is version 2026.3.13. Every built plugin file matches its installed copy, and the Chinese design-scale label remains `设计倍率`.
- All native export tests used `/tmp/meaxure-speed-2026-10-15/source-copy.sketch`. Its SHA-256 still matches the saved original 大宗交易.sketch after testing.
- A three-board baseline contains 814 annotation records. Both the synchronous-path candidate and isolated-render candidate match every non-object-ID field and all 11 PNG previews/assets in size and exact RGBA pixels.
- Sequential three-board wall times were noisy: baseline 27.335 seconds, intermediate synchronous candidate 26.722 seconds, isolated-render candidate 29.430 seconds. These do **not** establish an end-to-end speedup percentage. The slice phase decreased from 2.435 to 1.492 seconds in the isolated-render sample; other phases and run-loop waits varied.
- A longer candidate run wrote 62 complete board JSON files containing 15,574 records before a separate scheduling experiment crashed Sketch. All 24 PNG assets inspected before interruption had nonempty alpha. This is **not** a completed 71-board acceptance test or a valid full-export timing.
- The first eight completed candidate board JSON files match the baseline's 2,031 records after excluding generated object IDs. Comparing their asset directory with a later full-run directory is not valid for every file: later boards overwrite some same-named red icons with blue variants. The equal-prefix three-board image comparison is used for pixel verification instead.

## Rejected scheduling experiment

A main-thread `NSOperationQueue.addOperationWithBlock` callback was tried as an alternative to timer-based yielding. Sketch crashed with `EXC_BAD_ACCESS` in `_Block_copy` / `NSBlockOperation main`. This bridge is unsafe for this use and was removed completely; the installed bundle contains no `NSOperationQueue` experiment. Crash report: `~/Library/Logs/DiagnosticReports/Sketch-2026-10-16-000326.ips`.

The experimental probe also interrupted the long-running export, so its final status file is not a reliable completion record. A subsequent formal spec check did not start after the crash; it cannot be reported as passing. Future native scripts must run serially, including read-only probes, and must use frozen harness files rather than changing a shared harness path during a run.

Whole-document export remains minute-scale. A fresh uninterrupted 71-board comparison is still needed to quantify the end-to-end benefit. Timer-handle cleanup does not prove that all native memory growth is resolved.
