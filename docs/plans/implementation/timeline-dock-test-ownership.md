# Timeline Dock Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/timeline-dock-controller.test.js` is 1,860 physical lines. It combines
time/readout and scaling behavior, pointer seek/scrub behavior, and event/media
marker presentation/selection. Move its reusable fake element into one test
harness and organize those three contracts as independent suites. Keep each
suite exercising the real timeline dock controller.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `timeline-dock-controller.test.js` | 1,860 | 1,302 | Under 800 |

## Verification

- Preserve the original 22 assertions across the three suites.
- Run focused tests, the full unit gate, and the source-structure check.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `timeline-dock-controller.test.js` | 415 |
| `timeline-dock-pointer.test.js` | 648 |
| `timeline-dock-markers.test.js` | 706 |
| `helpers/timeline-dock-element.js` | 100 |

The largest piece is 706 lines, 62.0% smaller than the original and below
the committed 1,302-line maximum. Readout/scale, pointer seeking, and
event/media markers are independent suites around one fake element. All 22
pre-existing tests pass.
