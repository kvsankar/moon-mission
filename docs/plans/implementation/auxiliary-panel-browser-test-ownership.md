# Auxiliary Panel Browser Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/auxiliary-panel-resize-interaction.test.js` is 1,034 physical lines.
Its first seven cases exercise auxiliary panel geometry, resize and wheel
interaction. The final three cases exercise Mission Media layout and thumbnail
disclosure. These contracts should have independent suites, with one shared
browser launch helper so WebGL flags cannot drift.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `auxiliary-panel-resize-interaction.test.js` | 1,034 | 723 | Under 650 |

## Verification

- Run both browser suites against the real Artemis II route and preserve all
  ten cases.
- Run the source-structure check, retaining the browser suites outside the
  unit-only Vitest command.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `auxiliary-panel-resize-interaction.test.js` | 588 |
| `mission-media-panel-geometry-interaction.test.js` | 452 |
| `helpers/auxiliary-panel-browser.js` | 16 |

The largest piece is 588 lines, 43.1% smaller than the original and below
the committed 723-line maximum. A shared browser launcher keeps the WebGL
settings identical. All ten browser cases pass against `/artemis2/`.
