# Dockview Workspace Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`app/experimental-dockview-host.js` is 1,832 physical lines. It currently
owns five distinct concerns: workspace initialization/lifetime, shell geometry
and persistence, launch/header/ribbon controls, default layout policy, and
Dockview panel render adapters. Keep the existing public exports as a
compatibility facade and extract these owners into focused modules. Retain
the initialization revision and disposal guards, rather than changing
workspace behavior during the ownership split.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `experimental-dockview-host.js` | 1,832 | 1,282 | Under 850 |

## Verification

- Run Dockview host, launch-strip, layout, and workspace-lifetime unit suites.
- Run the full unit suite, source-structure check, and static build.
- Exercise the real `/artemis2/` workspace route in browser tests, including
  reset, resize, detached panel, and default layout behaviors.
- Keep `experimental-dockview-host.js` public exports stable.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `experimental-dockview-host.js` | 363 |
| `experimental-dockview-shell.js` | 271 |
| `experimental-dockview-controls.js` | 775 |
| `experimental-dockview-layout.js` | 242 |
| `experimental-dockview-panel-renderers.js` | 241 |

The largest piece is 775 lines, 57.7% smaller than the original and below
both the 1,000-line cap and the committed 1,282-line maximum. The host is a
startup/lifetime and compatibility facade; geometry/persistence, controls,
default policy, and mounted-panel adapters have separate owners.
The focused Dockview unit suite, full unit gate (3,827 passing, six skipped),
static build, source-structure check, and ten real-route auxiliary/Media
browser cases pass after the split.
