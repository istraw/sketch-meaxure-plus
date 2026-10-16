# Spec Export 2026.3.12

This local patch targets Sketch 2026.3 (233959). Native worker-isolation experiments were withdrawn and are not included in this build. It has not been published to GitHub Releases.

## Changes

- Use Sketch's current native export-request builder on versions that provide it. Do not fall back to the legacy builder after a modern-builder failure: native access violations cannot be caught in JavaScript.
- Reject exports of detached, documentless layers before calling native rendering. Reject invalid raster dimensions and rasters over 64 megapixels; vector formats have no pixel limit.
- Index Symbol overrides once per instance; cache expanded/master tree paths for the duration of each projection. Avoid reading Sketch's wrapper-producing children getters repeatedly.
- Enumerate document layers iteratively, detecting cycles and preserving child-before-parent and tint ordering.
- Yield between layer tasks, including projected Symbol children and text fragments, after approximately 100 ms of work. Individual native rendering/projection calls remain synchronous and can exceed this interval.
- Cache inherited visibility, lock, slice, marker and shape-group states within each synchronous batch; clear after run-loop yields, marker renames and board boundaries so changes are observed.
- Clean up only temporary layers owned by the export, including cancellation/error paths. Keep a Sketch async fiber alive until the export and cleanup finish.
- Write `export-diagnostics.json` in the chosen output folder with the build, status, elapsed time, current layer, processed count, slowest 30 layers, and final top-level warnings. Nested Symbol timing includes its children; timings must not be summed. The processed count includes expanded children and differs from the progress dialog's original traversal count. Style-level fallbacks continue to be logged in Sketch's console.

Closing the processing panel requests cancellation at the next checkpoint. It cannot interrupt a native call already in progress. Reopen Sketch normally after installation to load the new bundle; a currently running export continues using the bundle it started with. Safe Mode disables installed plugin menu commands.

## Verification

Run `npm test` and `npm run build`. Tests cover export ordering and cancellation, cleanup, orphan-layer guards, modern/legacy request selection, override indexing, 20,001-level traversal, cycle detection, raster limits, and 10,000 cached Symbol path lookups.

For a real-document smoke test, use a disposable local copy (never the original):

1. Run `NODE_OPTIONS=--openssl-legacy-provider node scripts/buildSketchHarness.js`.
2. In Sketch's **Plugins → Run Script**, run:

```js
eval(String(NSString.stringWithContentsOfFile_encoding_error('/tmp/meaxure-performance/harness.js', 4, null)));
MeaxureHarness.run('/absolute/path/to/disposable-copy.sketch', '/tmp/meaxure-performance/check', 300);
```

The last argument limits original traversal tasks; `0` tests all boards. The harness uses page `页面 1` when present, otherwise the first page, and considers its root Groups/Artboards. It writes per-board JSON, slices, quarter-scale board previews, and `harness-status.json`. A limited run may stop partway through a board, before its preview. This exercises real export code, but does not cover the export-selection panel, HTML viewer, or every output scale. No document contents are uploaded. The harness closes its document without saving it.

## Local validation status (2026-10-14)

- The 2026.3.1 real-document smoke test completed 300 original traversal tasks (1,317 processed layers including projections) in 16.559 seconds and wrote 433 layer records. This was a limited run, not a full HTML export.
- A complete-document attempt of that build did not finish; the retained status was 9,324 traversal tasks at 998.759 seconds. No new crash report was found, so the reason that process exited is unknown.
- An experimental forced-collection build also became slow and unresponsive late in the document. That mechanism was removed from the final patch. At a checkpoint it had written 42 board data files containing 9,926 records with finite rectangles, but had not completed the document.
- The final 2026.3.2 patch adds a task-scoped inherited layer-state cache. Tests compare 3,000 varied hierarchies with the previous algorithm and check that 10,000 siblings read their shared parent's ancestry only once. A complete first-board test of this final build processed 926 layers, wrote 254 records and a preview, and took 8.455 seconds. Names, types and rectangles matched the previous output. A full-document run was cancelled after 643.353 seconds because later boards still slowed down; the cancellation and subsequent native cleanup also remained slow. Whole-document performance remains unresolved.

The harness now accepts an optional fourth argument, e.g. `{ startBoard: 0, boardCount: 1 }`, to test a small set of complete boards. Creating a file called `cancel` in its output folder requests cancellation at a checkpoint. This cancellation feature applies to harnesses built after it was added; it cannot cancel older running harnesses. The normal plugin requests cancellation when its processing panel is closed.

## Text measurement follow-up (2026.3.3)

- Evaluate text bounds in the existing priority order, stopping at the first usable rectangle. Previously every query fitted a duplicate even when native glyph bounds were already sufficient.
- Remove temporary text measurement groups through the ownership manager so their wrappers are released immediately and final cleanup does not revisit them.
- Regression tests cover 1,000 glyph-bound queries without temporary groups, 1,000 fitted measurements with immediate release, and fragment fallback after measurement failure.
- A real first-board run exported 926 processed layers and 254 records. Names, types, rectangles, display rectangles, text, styles and CSS matched the 2026.3.2 output. Processing took 9.033 seconds; the previous recorded run took 8.455 seconds, so this small-board check does not establish a speed improvement. Whole-document performance remains unverified for this follow-up.
- A consecutive three-board run completed in 26.491 seconds of processing, with 2,841 processed layers and 814 records. Compared with the retained 2026.3.2 full-run files for those boards, the same geometry/text/style/CSS fields had zero differences. The harness bundle used for this run preceded the version bump, so its status JSON still labels the build 2026.3.2. This test does not cover late-document slowdown.

## Resolved Symbol export (2026.3.4)

- Copy Sketch's resolved immutable expanded tree into fresh mutable temporary layers, preserving the Symbol container, overrides and local frames. This avoids duplicating a live instance, recursively detaching it, and then walking both trees again to normalize, snapshot, annotate and sync coordinates. A failed or incomplete copy is cleaned up before the detach/manual fallback. Rotated/flipped instances and influence-bound exports retain the detach path.
- Reject excluded layers before measuring geometry. Preserve mask/tint transitions and note handling.
- Prune descendants of hidden containers, shape groups and exportable groups in resolved projections. Keep subtrees containing modern or legacy notes. Unannotated fallback projections retain full traversal.
- Batch up to 100 ms of work between event-loop yields, retaining cancellation checks at every checkpoint. Native operations remain synchronous. Diagnostics now report per-phase timings, yield count and time spent waiting for yields. Phase timings include nested operations and must not be summed.
- Tests cover immutable-tree copying, fresh IDs, nested coordinates, partial-failure cleanup, pruning, hidden notes, excluded geometry and cancellation.

### Hidden document and scene rendering

Temporary projection and text-measurement layers now live in an owned, hidden Sketch document with copied local/foreign shared styles and swatches. All native rendering layers remain attached to a real document. Slice rendering uses one short-lived copy of its projected hierarchy in the original document, preserving scene, clipping, opacity, export formats and crop scope. The render copy is reused within its Symbol task and removed on success, error or cancellation. Native request scale is set explicitly for each format.

The temporary Symbol wrapper is an ordinary Group for safe native crop bounds. Its resolved style/opacity is copied; child layout metadata is preserved. Legacy detached wrappers may report a different automatic-layout flag on empty temporary containers. These empty containers are filtered out by the HTML viewer.

The export holds a scoped macOS user-initiated activity token, following [Apple's long-running activity guidance](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/PrioritizeWorkAtTheAppLevel.html). The token is ended after cleanup, including error and cancellation paths.

### Real-document validation

- The actual document identified as 大宗交易 has 71 boards on 页面 1; its first two visual rows contain 21 boards. Tests use the retained disposable fixture, without saving the source document.
- A 2026.3.3 baseline run of those first two rows was cancelled after 456.666 seconds without completing. It had processed 25,601 layers and written 19 complete board files. This is a lower bound, not a completed-export duration.
- Hidden-document runs completed all 21 boards with 6,656 records in 110.715–115.877 seconds before the final scene-copy refinements.
- A complete 71-board hidden-document run finished in 575.000 seconds, processing 69,579 layers and writing 18,311 records plus board previews. This preceded final container-style and scene-copy refinements. Geometry, text, color/style/CSS fields matched the 39 retained baseline boards, except three additional warning-icon slices that the previous projection omitted. Wrapper layout/opacity findings were subsequently checked separately.
- Targeted final scene-copy tests verified original raster content, 2x/3x dimensions and temporary cleanup. The tests cover a confirmation board containing a zero-opacity icon container.

These timings include annotation extraction, slices and quarter-scale previews in the harness, not the selection panel, full-scale normal previews or HTML output. The entire document still takes minutes; this patch does not establish a seconds-long whole-document export.

- The final ordinary-group/scene-copy build completed the first two rows in 139.287 seconds: 21 boards, 26,687 processed layers and 6,656 records. All matched PNG assets retained their dimensions and RGBA pixels. Geometry/text/colors/styles/CSS/flow fields matched the retained output; five zero-opacity wrapper values were restored relative to an intermediate build. Empty temporary wrapper layout flags have the ordinary-group behavior noted above.

## Mixed-font single-line bounds (2026.3.5)

- Preserve the saved source text container height and vertical position when exporting single-line rich-text fragments. Keep the source automatic or explicit line height instead of assigning a reconstructed default. Multiline layout continues to use line advances.
- A disposable copy of 大宗交易, board `2-5 意向卖出-输入完成`, completed with 268 records. The saved `999股` container is 37 pixels high; both `999` and `股` fragments now export at 37 instead of 47, with identical x/y/width. Eight fragments changed height/line-height metadata as expected; every other non-ID field remained identical.
- Regression tests cover a 37-pixel container with a reconstructed 47-pixel default and preserve both automatic and explicit source line heights.

## Background document visibility (2026.3.6)

- Create the scratch document with `makeUntitledDocumentOfType:error:` rather than `openUntitledDocumentAndDisplay:error:`. The former does not register it in Sketch's document controller or create window controllers; the latter could expose an Untitled tab despite its display flag being false. Temporary hosts remain internal and are closed by the existing export cleanup.
- Native verification: creation and insertion of three temporary artboards leave the registered document count unchanged and create zero window controllers. A complete disposable `2-5 意向卖出-输入完成` export produces the same 268 records as 2026.3.5 (all non-ID fields equal).

## Consistent text container annotations (2026.3.7)

- Use the saved text frame for annotation rectangles with both explicit and automatic line heights. Previously explicit-line-height labels used glyph bounds, shrinking `可买` to 23 and `可用` to 24–25 despite their 32-pixel containers.
- Use the same frame for projected Symbol text selection boxes instead of substituting glyph bounds in `displayRect`. Raster slice geometry remains separate.
- The complete disposable first-board native test produced 254 records; `可买` and `可用` both export with height 32 and matching display rectangles. Regression tests also cover automatic line heights, projected frames and 37-pixel mixed-font fragments.

### Broader text audit

- The saved source document contains 2,813 text layers, including 165 rich-text layers and nine texts with explicit newline characters (three rich-text). These counts include component definitions.
- Comparing the older complete harness output with matching source IDs/content found 624 height differences among 2,203 matched text records, including 涨停/跌停/最新价 and 买入/卖出/撤单. This is historical evidence, not a complete new-build visual audit.
- New-build first-board records show 涨停/跌停/最新价 at the saved height 32 and 买入/卖出/撤单 at 44. Additional native checks completed on boards 10-5/10-6 (1073 traversal tasks, 259 records) and 1-11 (196 tasks, 336 records): multiline headers retain height 72; the rich multiline commitment text retains its saved 948-pixel container. Together these are representative native checks, not a fresh full 71-board visual acceptance pass.

## Full-document performance follow-up (2026.3.8)

- Skip source Shape paths and hidden/locked/exportable Group subtrees that cannot produce annotations. Preserve note subtrees, including old marker names, and tint boundaries.
- Reuse inherited layer states across adjacent tasks in a synchronous batch; refresh after yielding to Sketch, marker normalization and board boundaries. Native getter tests cover one parent read for 1,000 siblings and visibility updates while yielded.
- Resolve native callable properties once per lookup/call. CocoaScript callable proxies do not inherit `.apply`; use `Function.prototype.apply.call` while preserving native errors and receiver semantics.
- Count attributed-string ranges directly before attempting rich-text reconstruction. Avoid full dictionary serialization for plain labels; retain the older-API fallback.
- Read the diagnostic build from package.json instead of the stale hardcoded 2026.3.4.
- Native full-document comparison, same disposable 大宗交易 and scale=1 previews: preceding source-pruning candidate 664.587 seconds; final batch/range-count candidate 486.865 seconds (26.7% lower). Both completed all 71 boards, processed 64,241 layers and produced 18,316 records. All non-ID layer fields and notes matched across all 71 boards; all 94 PNG previews/assets matched in size and RGBA pixels. Source direct child counts remained unchanged.
- These are sequential harness runs, not controlled multi-run benchmarks or the complete selection/HTML viewer workflow. Earlier source-pruning baseline also contained the traversal optimization, so this comparison does not isolate its benefit. Whole-document export remains minute-scale and single-run memory growth is still unresolved. No claim is made that the performance problem is fully solved.

## Component slice blank exports (2026-10-15)

- Keep the temporary scene copy visible when exporting a Slice. A hidden projection root is useful for traversal bookkeeping but suppresses scene pixels in native slice rendering.
- Retain native request crop rectangles in document coordinates. Do not translate them with parent-relative master frames or artboard-relative projection metadata; this moves crops away from resized instance pixels.
- Skip asset writes for exportable layers under zero-opacity ancestors. These instances otherwise overwrite visible instances' same-named files with blank pixels. Preserve partial opacity and leave annotation extraction unchanged.
- `npm test` and `npm run build` pass. A disposable copy of `860两融交易买卖撤.sketch` completed its first board: 227 traversal tasks, 434 records, and unchanged source root count (18). Close and checkmark PNGs at both configured scales have nonempty alpha; the close icon at @2x matches the master export pixel for pixel. This is a representative board check, not a whole-document acceptance pass.
- Reproduce the synthetic native check with `NODE_OPTIONS=--openssl-legacy-provider node scripts/buildSliceHarness.js`, then run in Sketch: `eval(String(NSString.stringWithContentsOfFile_encoding_error('/tmp/meaxure-slice-check/harness.js',4,null))); SliceHarness.run('/tmp/meaxure-slice-check/output');`. It creates its own document and tests a board at a nonzero canvas offset, hidden/visible scene controls, 2x/3x PNG, SVG, and a transparent-instance overwrite guard.

## Direct source-container projections (2026.3.9)

The first slice fix only created visible render copies for projections hosted in the hidden document. Influence-bounds exports, rotated instances, detach/manual fallback, and isolation failure can instead put the hidden projection directly in the source Artboard or Group. Those layers had no scratch-host mapping and still rendered blank.

`getProjectionRenderLayer` now recognizes owned temporary ancestors in either location, copies the complete projected subtree into its source container, and reveals only the owned render copy. It also handles source containers that are plain Groups and have no parent Artboard. All exportable projected layer types use this path. Ordinary source layers are returned unchanged; per-symbol cleanup still removes the visible copy.

The native harness accepts `byInfluence`, `boardID`, and `boardIDs`. The synthetic harness accepts `{direct:true,sourceGroup:true}`. `scripts/buildSpecHarness.js` bundles an additional native check that runs the real `exportSpecification` writer, replacing only panel selection, destination selection, and file reveal; model extraction, assets, previews, HTML, diagnostics, and cleanup use production code.

The direct-projection regression reproduced fully transparent plus/minus PNGs in a disposable copy of 大宗交易.sketch. The repaired complete spec writer finished 3-0 定价买入-默认 with build 2026.3.9 and no warnings; all four configured plus/minus PNGs contained nonzero alpha. Unit tests and the plugin build passed.

Follow-up against the user's actual `Downloads/大宗交易 2` output: 17 fully transparent PNGs across 71 boards. Four source-board checks (1-1, 1-4, 10-2详情, 10-6无数据) cover all 17 filenames. Fresh exports have nonempty alpha and exactly match the prior dimensions; each source board retained its direct-child count. A review copy named `大宗交易 2-切图已修复` preserves the existing HTML/annotations and replaces only these 17 PNGs. The original export directory remains unchanged. This checks every reported blank PNG type, rather than rerunning the complete 71-board export.

## Platform/format asset downloads (2026.3.10)

Exportable layers now carry a reference to an embedded, self-contained source in `downloadSources`, independent of their saved export presets. SVG sources retain paths and embedded bitmap content; if native SVG is unavailable, a raster source is generated up to 4x (subject to the raster limit). Logical 1x dimensions use the document's configured design resolution and the source SVG crop/viewBox, rather than saved suffix names. Normal per-board HTML and combined advanced HTML both include the source table. Repeated identical sources share an entry. Existing exports without sources retain their original download links.

The inspector offers iOS (1x/2x/3x), Android (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi), and Web (1x/2x/3x). PNG, WebP, SVG, and JPG are available where the source/browser supports them. SVG is disabled for a raster-only fallback; SVG containing images is labeled as bitmap-containing. JPG composites onto white. Raster dimensions are bounded before canvas allocation. Multiple scales use a local ZIP writer; Android files keep drawable density directories even for a single scale. No external encoder, CDN, or live Sketch connection is needed by the viewer. The source table increases the size of generated HTML.

Checks: unit tests cover source creation from PNG-only saved presets, 2x design-resolution normalization, selectable platform sizes/formats, filenames and ZIP CRC/UTF-8; existing export regressions pass. A disposable 大宗交易 copy completed the real spec writer for 3-0, including eight embedded sources. Browser downloads of the plus icon were unpacked and inspected: PNG/WebP at 40/80/120 px preserve alpha, SVG dimensions are 40/80/120 with a viewBox, JPG has opaque white corners, and Android PNGs use the five correct drawable directories at 40/60/80/120/160 px. ZIP CRC checks pass. Browser validation used a loopback preview; file:// navigation is disallowed by the browser tool, so direct file-mode interaction was not tested. The conversion itself reads only embedded data URLs and writes Blob URLs, not local image files into canvas.

Also keep native selects mounted during changes, hide closed unit-picker menus from pointer hit testing, and widen the inspector to 320 px so the density labels and dimensions fit. A one-board review export is saved as `Downloads/大宗交易-平台切图示例`; prior user exports are unchanged and must be re-exported to include embedded sources.

## SVG download uses one logical size (2026.3.11)

Selecting SVG hides and disables the density checklist, explains the fixed 1x size, and downloads one plain `.svg` file on all platforms, including Android. The download event forces scale 1 and bypasses ZIP/drawable packaging; the encoder also enforces 1x to keep the invariant independent of UI state. Raster-format selections remain stored per platform and reappear when switching back. No saved source geometry or Sketch export behavior changes.

Unit regressions and the plugin build pass. Browser verification on the native source-backed example confirmed that SVG hides the checklist, Android downloads a single SVG with width/height 40 and the original viewBox (the example's logical 1x size), and returning to PNG restores five selected density levels. The installed plugin and the review example are updated to this behavior.

## Resolution selection in the export dialog (2026.3.12)

The artboard-selection dialog now exposes the existing document design-resolution setting next to the export action. Presets are 0.75x, 1x, 1.5x, 2x, 3x, and 4x; a custom positive numeric value is preserved and editable. The conversion hint uses the current device unit. Units themselves are not changed. The selected resolution is sent with submit and saved before the spec writer reads `context.configs.resolution`, keeping preview normalization, annotation dimensions, and embedded asset-source dimensions consistent with Settings. Sorting, cancellation, invalid input, or an empty board selection do not persist a change; an older cached dialog with no resolution field retains the current setting.

The dialog grows from 597 to 637 points and its scrollable board list shrinks by 40 points to accommodate the controls. Resolution validation is implemented in both the page and native message handler. New unit checks cover initialization, custom values, save timing, invalid input, cancellation/sorting, and old-dialog compatibility. Browser checks with a mock bridge confirmed preset 3 and custom 1.25 submit payloads, zero-value rejection, and a submit-button bottom of 601 within the 637-point content area. Existing regression tests and plugin build passed.

## Long export scheduling and slice rendering (2026.3.13)

- Ordinary layers and plain text finish synchronously. Only a scheduled checkpoint, Symbol expansion, or actual rich-text reconstruction creates an asynchronous continuation. The outer export loop catches both synchronous failures and rejected promises, preserving warning and cancellation handling.
- Batch synchronous work for 250 ms before yielding to Sketch, while retaining per-layer cancellation checks and 250 ms progress reporting. Clear each fired timer explicitly: Sketch's bundled `@skpm/timers` stores native fiber handles until `clearTimeout` is called. This bounds retained timer handles; it does not establish that all native memory growth is solved.
- Keep visible slice-rendering copies inside the windowless projection document, alongside the hidden traversal copies. This avoids adding/removing visible temporary layers in the large source document. Source-attached fallback projections still use their original parent. Native crop rectangles, export presets, opacity checks, and browser download controls are unchanged.
- Regression checks cover synchronous fast paths, timer cleanup, cancellation after yielding, synchronous/asynchronous orchestration errors, and the render-copy parent. A same-file three-board native comparison preserved 814 annotation records (excluding generated object IDs) and all 11 PNG previews/assets pixel for pixel. Small-run wall time was noisy and did not establish a reliable end-to-end speedup percentage.

## Transparent component slices (2026.3.14)

The refresh Slice's embedded SVG included both the navigation bar's white rectangle and the temporary artboard's default background. Keep synthetic artboards transparent and limit nested Slice scenes to their containing group. Preserve the ancestor chain for coordinates, transforms, and opacity, retain intentional fills inside the group, hide other cached scenes while rendering, and release ordinary document scenes after export. Direct/detached projections also render in the scratch document when available.

Unit regressions and plugin build pass. The first real board exports 254 records with all non-generated annotation fields unchanged. Browser pixel verification finds 1,841 transparent pixels in the repaired 48×48 refresh icon, zero opaque-white pixels, and zero differences when composited over white against the previous opaque export. Synthetic native checks cover both normal and source-Group fallback projections, including nonempty visible PNGs and empty hidden/incorrect-crop controls.

A fresh real spec writer run completed all 72 boards in the current saved copy, processed 65,281 layers, produced 18,586 records, and reported no warnings in 365.177 seconds. All 64 embedded refresh sources lack the unrelated white rectangle. Compared with the user's previous export, 71 boards' non-ID annotation fields match; one downward-triangle alias on board 1-5 differs by 0.5 design pixels in its Y rectangle. No whole-document pixel-equivalence claim is made for changed assets.

The new export is saved to `Downloads/大宗交易-透明切图修复`. Its viewer settings and embedded source dimensions were normalized to the user's latest export's 2x/pt settings because the disposable saved copy retained older 1x/px settings. Browser checks confirm the refresh at X=337pt, Y=54pt, size=24pt, PNG downloads at 24/48/72 pixels with transparent corners and visible artwork, and one 24×24 SVG with no white rectangle. The installed plugin is 2026.3.14; original exports and design files are preserved.

## Corner radius compatibility (2026.3.15)

Sketch 2026 stores corner radii in the native style's `corners().radii()` collection; the previous ShapePath extension relied on the removed `cornerRadiusString` method. Export the modern numeric radii for ShapePaths, Shapes and frames/Groups, retaining the legacy fallback. Read the native style directly so inspecting a layer cannot create a missing corners object through the SDK getter. Preserve explicit zero, validate finite nonnegative values, and omit absent/invalid metadata.

The inspector converts radii with the selected design resolution and device unit. Uniform values display once; mixed values display the entire sequence instead of only the first value. Unit checks cover native collections, frame corners, legacy fallback, zeros, malformed/absent values, uniform/mixed values and 2x conversion. The reported 436×88 input Vector has native radius 8 and therefore displays 4pt at design resolution 2.

For the existing viewer, a test-only metadata harness reuses production layer traversal and geometry while omitting asset generation, unrelated style extraction, and rich-text reconstruction. Only Shape/Group records are used; every record must match the existing board's ordered name, type and rectangle before its radius can be applied. Existing assets, annotation IDs, positions, text and download-source settings are preserved. The harness transform checks its production-source anchors and fails if they change.

The metadata pass completed all 72 boards and matched all 12,067 Shape/Group records, adding radius values to 2,415 layers in `Downloads/大宗交易-透明切图修复`. Comparing the embedded data before and after with radius fields removed confirms all other annotation data is identical. Browser verification of the reported Vector shows X=12pt, Y=256.5pt, size=218×44pt and radius=4pt. All unit tests and the plugin build pass; version 2026.3.15 is installed.
