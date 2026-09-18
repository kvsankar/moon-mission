# Unit Coverage Expansion — 2026-09-18

Continues [Unit Coverage Reconciliation](unit-coverage-reconciliation-2026-09-18.md).
That document records the current-`master` baseline and the first bounded
slice. This document records the test-only expansion that followed it.

## Constraint

No product code was changed. Every gain comes from new tests exercising
existing modules through their public entry points. Thresholds, coverage
exclusions, the loaded-files-only scope, mission configuration, runtime
assets and data-repository files are all unchanged, and no test was skipped.

## Result

| Metric | Before | After | Change | Gate |
| --- | ---: | ---: | ---: | ---: |
| Lines | 55.17% (22,581 / 40,927) | 74.99% (30,692 / 40,927) | +19.82 points | 87% |
| Statements | 53.94% (23,710 / 43,951) | 72.96% (32,069 / 43,951) | +19.02 points | 87% |
| Branches | 50.25% (17,294 / 34,413) | 62.74% (21,594 / 34,413) | +12.49 points | 82% |
| Functions | 58.21% (3,777 / 6,488) | 71.23% (4,622 / 6,488) | +13.02 points | 50% |

The suite grew from 1,984 to 2,987 passing tests across 275 files, with the
same six pre-existing skips. The functions gate now passes. Lines, statements
and branches remain below their gates; the 85% target was not reached.

## Test Harness

The repository runs Vitest on the default `node` environment and does not
depend on jsdom. Most of the remaining uncovered code is imperative shell code
that needs a document. `test/helpers/fake-dom.js` supplies exactly the slice
those modules use, so they run through their real code paths rather than
through hand-written stubs of themselves:

- element lookup by id, a simple CSS selector engine (`#id`, `.class`, `tag`,
  `[attr="value"]`, `:checked`, `:popover-open`, descendant combinators and
  comma groups), class lists, live `dataset` over `data-*` attributes,
  attributes, inline style, bubbling event dispatch and focus;
- tag-specific element constructors so `instanceof HTMLInputElement`-style
  guards keep distinguishing element kinds, plus shadow roots;
- a recording 2D canvas context, so procedural texture and overlay code runs
  and its draw calls can be asserted; and
- `ResizeObserver`, `getComputedStyle`, animation frames and an in-memory
  `Storage`, each installed and restored per test.

Real `d3` and real `three` run against this document. The auxiliary camera
manager takes its Three.js namespace by injection, so panel construction runs
against a fake `WebGLRenderer` without a GPU. The NPZ reader is exercised
against real `.npy` bytes built in the test, the planetary sky markers against
the real `astronomy-engine` ephemeris, and the splashdown panel against the
tracked Artemis II `config.json`.

## Covered Behaviour

New test files, grouped by the contract they pin down:

- **View settings and lunar features** — `ui-state`, `lunar-crater-control-panel`
  (element resolution, legacy and modern mode controls, scoped filter sets,
  preset equivalence, debounced commits, search result exclusion, disposal).
- **Panels** — `panel-manager`, `panel-info-popover`, `dockview-workflow-panels`,
  `composer-disclosure`, `ground-track-panel-actions`.
- **Auxiliary camera panels** — `auxiliary-camera-manager` (construction, the
  visibility state machine, frame helpers, persistence, moon phase and
  craft-to-Moon visibility analytics, orbit plane projection, the render pass)
  and `auxiliary-composer-overlays` (solar eclipse detection, Sun optics and
  exposure profiles, RA/Dec and body overlays, metrics strip, framing
  controls).
- **Rendering** — `scene-helpers`, `sun-renderer`, `body-lat-lon-overlay`,
  `spacecraft-renderer`, `light-manager-and-planet-renderer`,
  `mounted-freefly-controls`, `atmosphere-model`.
- **Scene composition and runtime actions** — `animation-scene-class`,
  `scene-composition-actions`, `viewport-and-mode-actions`,
  `label-and-location-actions`, `animation-2d-controller`,
  `load-progress-controller`, `mission-metadata`,
  `mission-state-cell-groups-runtime`.
- **Data and math** — `npz-ephemeris`, `sky-math`, `math-utils`, `core-dom`.

## Behaviour Recorded, Not Changed

Three places behave differently from what their surrounding code suggests. The
tests record what the code does today; none of them were changed.

- `ui/ui-state.js` reads `sky_time_ms` before `sky_time_seconds`, and the
  seconds branch assigns unconditionally. When both controls are mounted the
  seconds control wins, so the `sky_time_ms` guard in that loop never decides
  the outcome.
- `core/state/runtime-view-state.js` exposes
  `setLunarCraterShowAllEnabled`/`setLunarCraterHoverEnabled`, but neither key
  is in `PER_VIEW_FLAG_KEYS`. Those setters are no-ops; both flags are derived
  from the display mode when `viewLunarCraters` is written.
- `app/auxiliary-camera-views.js` `roundPercentParts` corrects any residual on
  the first entry, so an input summing above 100 can produce a negative first
  part.

## Remaining Gaps

Ranked by uncovered lines at the end of this pass:

| Module | Uncovered | Lines |
| --- | ---: | ---: |
| `app/auxiliary-camera-views.js` | 1,937 | 69.73% |
| `app/media-browser-panel.js` | 834 | 58.81% |
| `app/ground-track-panel.js` | 820 | 41.55% |
| `app/experimental-dockview-host.js` | 455 | 52.75% |
| `app/lunar-crater-actions.js` | 310 | 71.48% |
| `app/media-timeline-coordination.js` | 249 | 84.68% |
| `app/orbit-overlap-manager.js` | 223 | 18.61% |
| `app/background-media-panel.js` | 210 | 83.68% |
| `app/timeline-dock-controller.js` | 204 | 80.15% |
| `rendering/SkyController.js` | 172 | 22.86% |

Closing the remaining ~10,200 lines to reach the 87% gate is a larger campaign
than this pass. Two structural obstacles account for most of it:

- The largest files concentrate their remaining uncovered lines in very long
  render and DOM-construction methods. Without extraction, a test has to drive
  a near-complete scene and panel graph to reach them.
- `app/orbit-overlap-manager.js` and parts of `rendering/scene-helpers.js`,
  `app/mode-actions.js` and `rendering/spacecraft-renderer.js` sit behind
  hotfix kill switches (`ORBIT_OVERLAP_REFINEMENT_ENABLED`,
  `BODY_HALO_FEATURE_FLAGS.craft`, `CRAFT_EDGE_LOCATOR_ENABLED`,
  `SPACECRAFT_EDGE_LOCATOR_ENABLED`). Those paths are unreachable from tests
  while the flags stay off; they need a disposition, not more tests.

## Verification

- `npm run test:unit -- --coverage`: 2,987 passed, six skipped, 275 files.
- No threshold, coverage exclusion, test skip, runtime asset, mission config,
  data-repository file or deployment state was changed.
- `git diff --check` passed.
- One correction inside this pass: an earlier commit replaced the existing
  hand-stubbed `test/mission-state-cell-groups.test.js` instead of adding to
  it. That file was restored unchanged and the new runtime-store coverage was
  moved to `test/mission-state-cell-groups-runtime.test.js`. The final diff
  against `ace629f` adds 29 files and deletes nothing.
