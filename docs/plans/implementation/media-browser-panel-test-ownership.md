# Media Browser Panel Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/media-browser-panel.test.js` is 1,090 physical lines. Its fake range,
panel and element types are shared by two behavior domains: timeline seek and
player controls, and thumbnail disclosure/paging. Put the fake DOM types in
one harness, then split the behaviors into their own suites. Keep manifest
Retry with the timeline/player intent tests.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `media-browser-panel.test.js` | 1,090 | 763 | Under 600 |

## Verification

- Preserve all 18 pre-existing assertions across both suites.
- Run the focused suites, full unit gate, and source-structure check.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `media-browser-panel.test.js` | 356 |
| `media-browser-thumbnails.test.js` | 523 |
| `helpers/media-browser-panel-harness.js` | 231 |

The largest piece is 523 lines, 52.0% smaller than the original and below
the committed 763-line maximum. Timeline/player intents and thumbnail
disclosure/paging have independent suites with one fake DOM harness. All 18
pre-existing tests pass.
