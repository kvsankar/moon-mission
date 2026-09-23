# Background Media Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/background-media-panel.test.js` is 1,766 physical lines. A fake DOM
builder and global cleanup live alongside playback policy, captions/transcript,
and panel geometry/lifecycle assertions. Move the reusable fake DOM setup to
`test/helpers/`, then keep those three behavior domains in distinct suites.
Each suite still calls the real background-media panel actions.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `background-media-panel.test.js` | 1,766 | 1,236 | Under 850 |

## Verification

- Preserve the original assertion count across all suites.
- Run the three focused suites and the full unit gate.
- Run the source-structure check and avoid duplicating the DOM harness.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `background-media-panel.test.js` | 794 |
| `background-media-captions.test.js` | 422 |
| `background-media-panel-geometry.test.js` | 406 |
| `helpers/background-media-panel-harness.js` | 177 |

The largest piece is 794 lines, 55.0% smaller than the original and below
the committed 1,236-line maximum. The real panel actions are exercised in
all three suites against one shared fake DOM and cleanup helper. All 27
pre-existing tests pass.
