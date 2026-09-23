# Timeline Dock Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`app/timeline-dock-controller.js` is 1,833 physical lines and combines time
label/signature policy, viewport scale and pan, pointer seek/scrub ownership,
event/media marker DOM rendering, hover preview lifetime and controller
binding. Move pure time/signature calculations to a model module. Give marker
rendering/preview state and pointer gesture state distinct owners with explicit
read/effect ports; keep the public `createTimelineDockController` API and
range/view orchestration in the facade. Do not replace the closure with
prototype mixins or a shared mutable state bag.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `timeline-dock-controller.js` | 1,833 | 1,283 | Under 1,000 |

## Verification

- Run the three timeline dock unit suites (22 existing assertions), including
  readout/scale, pointer seeking and event/media markers.
- Run full unit, source-structure check, static build and a real mission
  timeline seek/marker browser check.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `timeline-dock-controller.js` | 949 |
| `timeline-dock-model.js` | 135 |
| `timeline-dock-markers.js` | 598 |
| `timeline-dock-pointer.js` | 341 |

The largest piece is 949 lines, 48.2% smaller than the original and below
the committed 1,283-line maximum and 1,000-line cap. Marker/hover preview
lifetime and pointer drag/seek state have separate owners. Pure time/signature
math is independent, while the facade retains range/view orchestration and
its public API. All 22 focused timeline dock assertions pass.
The full unit gate (3,836 passing, six skipped), structure check and static
build pass. On a fresh `/artemis2/` route, the visible timeline rendered 28
event markers and a direct slider click advanced mission time.
