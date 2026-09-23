# Landing Entry Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`src/platform/js/index-landing.js` is 3,782 physical lines in one classic
IIFE. It combines mission timing/catalog normalization, authored brief data,
Chebyshev orbit preview planning, compare selection, card/table/timeline
rendering, SVG preview animation and DOM event binding. Convert the entry to
an ES module and keep DOMContentLoaded registration and the existing landing
routes/links intact. Separate pure catalog/timing and orbit-preview data from
DOM owners for compare selection, brief content, orbit SVG/canvas preview,
and view rendering. Pass explicit state and callbacks; do not replace the IIFE
with a global namespace bag.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `index-landing.js` | 3,782 | 2,647 | Under 1,000 |

## Verification

- Preserve landing selector, cards, table/timeline filters, brief carousel,
  orbit previews and compare URL behavior.
- Run landing unit/browser tests on `/` and mission selection/compare routes,
  plus full unit, structure check and static build.
- Confirm the module entry loads with no console/module errors before changing
  visual baselines; do not regenerate baselines for a structural split.

## Result

The entry is 732 lines; the largest supporting owner is the 666-line catalog
model. The largest piece is 80.6% smaller than the original 3,782 lines,
below the committed 2,647-line maximum and 1,000-line cap. Catalog/timing,
authored briefs, orbit data/math, card/compare rendering, brief presentation,
orbit controllers and view rendering now have separate module owners. The
classic script in `index.html` became a module entry while retaining the
DOMContentLoaded bootstrap. An unused historical orbit-card preview helper
was removed; its prior text remains recoverable from Git. The compare smoke
passes, and a second browser case now covers table, timeline, brief and SVG
orbit preview without baseline changes.
The full unit gate (3,836 passing, six skipped), static build and source-
structure check pass. The HORIZONS asset-path source contract now reads its
actual owner, `landing-brief-data.js`.
