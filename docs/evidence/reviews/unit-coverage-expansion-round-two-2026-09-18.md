# Unit Coverage Expansion, Round Two — 2026-09-18

Continues [Unit Coverage Expansion](unit-coverage-expansion-2026-09-18.md).
That document records the first test-only expansion and the two product
defects it surfaced. This document records the second expansion pass.

## Constraint

Test-only again. No product code was changed in this pass. Thresholds,
coverage exclusions, the loaded-files-only scope, mission configuration,
runtime assets and data-repository files are unchanged, and no test was
skipped. One shared test helper gained a method (`FakeElement.getRootNode`),
which is test-support code, not product code.

## Result

Measured with `npm run test:unit -- --coverage` at the start and end of the
pass.

| Metric | Before | After | Change | Gate |
| --- | ---: | ---: | ---: | ---: |
| Lines | 75.45% (30,880 / 40,927) | 79.08% (32,366 / 40,927) | +3.63 points | 87% |
| Statements | 73.39% (32,257 / 43,951) | 76.92% (33,808 / 43,951) | +3.53 points | 87% |
| Branches | 62.91% (21,649 / 34,411) | 66.06% (22,733 / 34,411) | +3.15 points | 82% |
| Functions | 73.55% (4,772 / 6,488) | 76.37% (4,955 / 6,488) | +2.82 points | 50% |

The suite grew from 3,082 to 3,530 passing tests across 288 files, with the
same six pre-existing skips. The functions gate continues to pass. Lines,
statements and branches remain below their gates.

## Slices

Each slice was committed on its own after the new files passed, and the full
suite was re-run between slices.

| Slice | Module | Lines before | Lines after |
| --- | --- | ---: | ---: |
| Camera controller | `rendering/camera-controller.js` | 53.33% | 91.1% |
| Star field | `rendering/StarRenderer.js` | 20.90% | 97.74% |
| Sky controller | `rendering/SkyController.js` | 22.86% | 97.30% |
| Sky sphere | `rendering/sky-renderer.js` | 41.93% | 100% |
| Mobile far-side overlay | `ui/mobile-moon-visibility-sync.js` | 43.04% | 96.20% |
| Splashdown panel | `app/ground-track-panel.js` | 41.55% | 73.62% |
| Media browser panel | `app/media-browser-panel.js` | 58.81% | 71.55% |
| Settings actions | `app/settings-actions.js` | 0% | 100% |
| Spacecraft actions | `app/spacecraft-actions.js` | 0% | 98.50% |

## What The New Tests Pin Down

- **`camera-controller-core`** — Drives the real `TrackballControls` adapter
  and `MountedFreeFlyControls` against the DOM double rather than a stub, so
  the change-listener that captures a user-dragged mount or follow standoff,
  the deterministic clip planes that a hotfix pinned, the manual roll
  normalization and the full disposal path all run end to end.
- **`star-renderer-core`** — The B-V to linear-RGB fit and its luminance
  normalization, the catalog-to-attribute build (position on the sky sphere,
  clamped magnitude, substituted colour index, stable twinkle seed), the
  snake_case and camelCase parameter patches, and disposal.
- **`sky-controller`** — Clamping for every published sky control, the three
  sky shells and their layer and render order, the atmosphere shell and its
  haze curve, the procedural-star boost, and the layer visibility rules.
- **`sky-renderer-scene`** — Shell ordering, the ecliptic tilt, shared
  geometry, texture swaps and shared-texture retention, disposal and rebuild.
- **`mobile-moon-visibility-overlay`** — The refresh throttle and the
  signature dedup on the readout, the far-side overlay shell built on the moon
  mesh, and every path that takes that shell back down.
- **`ground-track-panel-map` and `ground-track-panel-globe`** — A Leaflet
  stand-in and a stubbed `WebGLRenderer` let both surfaces run headlessly:
  the wrapped track polylines, the app-generated continuation styling, the
  marker and recentering, the event rail, the transport card mirror, panel
  chrome, and the globe scene graph, zoom clamps and resize path.
- **`media-browser-panel-render`** — The real panel markup mounted against the
  DOM double: the metadata readout, the image/video/audio stage, the zoom
  controls, the playback transport, the thumbnail strip build and its
  incremental active-state update, the filter drawer and navigation, and the
  panel availability rules.
- **`settings-actions`** — The origin-frame transition including the
  scene-reuse path that only hides body halos, the view apply pass, the SVG
  orbit styling and the 2D and 3D trail prominence.
- **`spacecraft-actions`** — Fleet construction, craft model resolution with
  mission and per-craft overrides, colour fallbacks, and teardown.

## Test Harness Change

`test/helpers/fake-dom.js` gained `FakeElement.getRootNode()`. Upstream
`OrbitControls` calls it to bind its key handlers next to an element that may
be inside a shadow tree, and the splashdown globe mounts its canvas inside
exactly such a tree. The implementation returns the containing shadow root
when there is one and the owner document otherwise, matching the DOM.

## Kill Switches Found During This Pass

The earlier document listed four hotfix flags whose code is unreachable from
tests. This pass found a fifth, of the same shape:

- `app/view-application-plan.js` `resolveEffectiveOrbitStyle` ignores its
  argument and always returns `"classic"`. The whole trail-style branch of
  `settings-actions.applyOrbitSvgStyle` is therefore dead from every caller.
  `test/settings-actions.test.js` records the pin rather than working around
  it, so lifting the pin will fail that expectation deliberately.

Two defensive branches in `rendering/StarRenderer.js` `bvToLinearRgb` are also
unreachable for legal input: the `linLuma <= 1e-4` white fallback and the
`maxChannel * scale > 2.2` cap. Across the clamped B-V range the normalized
luminance is exactly 1 and the largest channel reaches only 1.79. These were
left alone rather than forced with illegal input.

`rendering/camera-controller.js` `_updateCameraUpForLookTarget` has no callers
anywhere in `src/` or `assets/`. It is dead code, not a kill switch, and was
left untested rather than covered for its own sake.

## Remaining Gaps

Ranked by uncovered lines at the end of this pass:

| Module | Uncovered lines | Uncovered branches | Lines |
| --- | ---: | ---: | ---: |
| `app/auxiliary-camera-views.js` | 1,938 | 1,858 | 69.71% |
| `app/media-browser-panel.js` | 576 | 848 | 71.55% |
| `app/experimental-dockview-host.js` | 455 | 378 | 52.75% |
| `app/ground-track-panel.js` | 370 | 465 | 73.62% |
| `app/lunar-crater-actions.js` | 310 | 450 | 71.48% |
| `app/media-timeline-coordination.js` | 249 | 500 | 84.68% |
| `app/orbit-overlap-manager.js` | 223 | 195 | 18.61% |
| `app/background-media-panel.js` | 210 | 366 | 83.68% |
| `app/timeline-dock-controller.js` | 204 | 386 | 80.15% |
| `rendering/scene-helpers.js` | 120 | 117 | 70.51% |

`auxiliary-camera-views.js` deserves a note. Its 1,938 uncovered lines contain
only two contiguous runs longer than fourteen lines. The rest is scattered
single branches inside a 11,392-line module with one 3,300-line
`createPanel` method. Extraction is the prerequisite for covering it; more
tests against the current shape buy very little per unit of effort. That is
the same structural follow-up the previous pass recorded, now with a
measurement behind it.

Branches are now the gate furthest from target (66.06% against 82%). Modules
with far more uncovered branches than lines — `media-timeline-coordination.js`,
`background-media-panel.js`, `timeline-dock-controller.js`,
`lunar-crater-actions.js` — are the efficient targets for that gate
specifically.

## Verification

- `npm run test:unit -- --coverage`: 3,530 passed, six skipped, 288 files,
  exit status driven only by the unchanged thresholds.
- Full suite re-run between slices; no cross-file regression appeared.
- All new test files verified to use LF line endings before commit.
- No threshold, coverage exclusion, test skip, runtime asset, mission config,
  data-repository file or deployment state was changed.
