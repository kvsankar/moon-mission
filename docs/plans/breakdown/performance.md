# Performance Workstream

Last reviewed: 2026-09-15

This is the active workstream for animation responsiveness, panel interaction
latency, and runtime optimization follow-ups.

## Authority Split

- Preserved May optimization queue and next actions: this document
- Original 2026-05-16 investigation: [Performance Regression Investigation](../../evidence/reviews/performance-regression-investigation-2026-05-16.md)
- Live planning rollup: [Moon Mission Roadmap](../roadmap.md)
- Benchmark method and tooling: [Runtime Animation Benchmark](../../operations/ci/runtime-animation-benchmark.md)
- Timeline/media playback behavior: [Timeline And Media Playback Spec](../../specs/time/timeline-and-media-playback.md)
- Panel behavior: [Panel System V1 Spec](../../specs/ui/panel-system-v1.md)

## Current Findings

1. Mission Media and Broadcast panels can affect both clickability and main-thread work.
   - A panel can physically cover controls at some viewport/layout states.
   - Open media panels add render and media-element work during animation.
2. Hidden Earth/Moon guide overlays used to do per-frame camera work even when inactive.
   - This was fixed first.
3. The large lunar features catalog used to be statically imported.
   - It is now dynamic runtime data staged from `../moon-mission-data` and served through the public asset base.
4. Desktop and mobile users are equal performance targets.
   - Preserve 1920x1080 desktop behavior while validating touch layouts, constrained resources and slow downloads. Do not assume a powerful desktop GPU or fast local asset delivery.
5. The Moon startup audit replaces automatic High with device-aware defaults and independent preview delivery.
   - Shared renderer/loading changes and measured validation are in the [2026-09-11 audit](../../evidence/audits/moon-rendering-and-loading-2026-09-11.md).
   - Sun corona generation has moved out of startup. Real Android/iOS measurements and High memory across multiple WebGL views remain follow-ups.

## Landed Mitigations

- Inactive Earth/Moon guide overlays now return early from camera-update work.
- `assets/lunar-features.json` moved to data repo/runtime asset delivery, loaded dynamically.
- The default desktop control panel sits fully above the timeline dock at 1920x1080.
- Mission Media render work has been split so playback-only ticks can update playback state without rebuilding the full panel structure.
- Focused Mission Media tests cover playback-only sync behavior.
- Repeated animation ticks skip unchanged media marker and panel updates.
- Focused Broadcast tests cover bounded HLS `startLoad` behavior.

## Moon Rendering Consolidation

Complete on app `master` and data `main`: one Physical renderer, V2 Low/Medium
terrain normals, Current retirement, settings migration, independent previews,
bounded loading waits, cancellation recovery and prepared Sun-corona textures.
The terminator and eclipse-speckle fixes are accepted. High was preserved through
the compact-tier improvements. See [architecture](../../designs/rendering/moon-rendering.md),
[consolidation validation](../../evidence/audits/moon-physical-consolidation-2026-09-11.md),
and [final quality review](../../evidence/audits/moon-low-medium-quality-2026-09-15.md).

Separate follow-ups: deploy the matching app/data assets, measure real Android/iOS
devices and V2 cold-network startup, and reduce full-application frame time. Moon-only GPU timing is fast;
the four-view animation still incurs orbit/UI/other-renderer work. High's
transfer and per-context allocation costs remain candidates for compression
or tiling. Do not reintroduce a second Moon lighting model as a shortcut.

## Pending Optimization Queue

1. Run Chrome Performance measurement on `/artemis2/`.
   - Compare panels closed, Mission Media open, Broadcast open/enabled, and high-speed playback.
   - Confirm whether the cache/render-split changes reduced long tasks and click delay.
2. Coalesce geometry and layout work.
   - Batch filter drawer placement, drilldown flyout placement, thumbnail reveal, and image transform/layout reads into scheduled frame work.
   - Only run placement when drawers/flyouts are open, active thumbnail needs reveal, or panel dimensions changed.
3. Coalesce media/HLS event rerenders.
   - Avoid immediate duplicate renders from HLS/video readiness events.
   - Schedule one pending rerender for a burst of media readiness events.
4. Complete the remaining performance regression tests.
   - No repeated registry sync on playback ticks.
5. Run runtime smoke/performance check.
   - Start the local dev server.
   - Smoke `/artemis2/` with animation running.
   - Exercise Mission Media open, Broadcast open/enabled, and playback/frame controls.
6. Harden `bench-runtime-animation.js` scenario validity and provenance.
   - Fail when a requested optional selector cannot be applied.
   - Reject invalid origin, dimension, style, camera, and plane values instead
     of silently normalizing or dropping them.
   - Add an explicit output-file option or documented artifact convention.
   - Test argument normalization and requested-state application.

## Regression Risks To Watch

- Play/frame controls becoming covered by timeline or panel hit areas.
- Media readiness events triggering multiple full renders.
- HLS state transitions causing repeated seek or start-load calls.
- Hidden panels or closed drawers doing layout work.
- Timeline marker rebuilds on unchanged media data.
- New work optimized for a narrow viewport while regressing the 1920x1080 default layout.

## Verification Notes

Use unit tests for deterministic render/state contracts, then use browser smoke/performance traces for actual click delay and frame-time behavior. Unit tests alone cannot prove the UI feels responsive under video/HLS load.
