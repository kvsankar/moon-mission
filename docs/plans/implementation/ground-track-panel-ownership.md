# Ground Track Panel Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`app/ground-track-panel.js` is 2,627 physical lines. It mixes Earth-fixed
trajectory math, Chebyshev/relative source loading and sampling, map/globe
surface lifetime, timeline card presentation, panel layout/persistence,
pointer interactions, and the public update/action facade. Separate pure
track math from data-source ownership and rendering effects. Give map/globe
resources and panel geometry their own lifecycle owners. Keep mission intent,
event binding and public `createGroundTrackPanelActions` in the facade.
Preserve the relative-frame, generated-segment and Dockview/legacy behavior.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `ground-track-panel.js` | 2,627 | 1,838 | Under 1,000 |

## Verification

- Run ground-track panel/action/globe unit suites and panel state tests.
- Run full unit, source-structure check, static build and real splashdown
  panel map/globe browser checks on a mission route.
- Preserve generated segment provenance and controlled data loading.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `ground-track-panel.js` | 908 |
| `ground-track-config.js` | 75 |
| `ground-track-geometry.js` | 168 |
| `ground-track-policy.js` | 108 |
| `ground-track-primitives.js` | 115 |
| `ground-track-presentation.js` | 365 |
| `ground-track-data-source.js` | 405 |
| `ground-track-surface.js` | 469 |
| `ground-track-panel-geometry.js` | 248 |

The largest piece is 908 lines, 65.4% smaller than the original and below
both the committed 1,838-line maximum and 1,000-line cap. Track math,
mission-window policy, Chebyshev cache/source lifetime, map/globe resources,
timeline presentation and panel geometry have separate owners. The facade
retains public update and panel-intent orchestration. All 42 focused panel,
action and globe assertions pass.
The full unit gate (3,836 passing, six skipped), static build and structure
check pass. A fresh `/artemis2/` route opened the Splashdown panel through
the panel registry fallback (the header shortcut was not visible in that
workspace layout); switching to 3D set the globe control active and mounted
one renderer canvas in the shadow surface.
