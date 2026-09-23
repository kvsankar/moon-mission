# Lunar Crater Rendering Effects Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`app/lunar-crater-actions.js` is 2,639 physical lines. It combines ring/label
geometry, canvas textures, projected hit testing, catalog readiness,
always/search annotation selection, scene object lifetime, hover picking,
and public view-setting actions. Move reusable rendering primitives and hit
math to focused modules. Give scene annotation creation/disposal and pointer
hover presentation an effect owner with its own temporary vectors and caches.
Keep the public action factory, catalog/view-setting intent and explicit
scene lifetime boundary stable. Avoid prototype mixins and a bag of every
mutable field.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `lunar-crater-actions.js` | 2,639 | 1,847 | Under 1,000 |

## Verification

- Run crater action/setter, projection/catalog and control tests; add owner
  lifetime coverage where scene cleanup crosses a new boundary.
- Run full unit, structure check, static build and real Artemis II Lunar
  Features browser smoke check.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `lunar-crater-actions.js` | 674 |
| `lunar-crater-render-config.js` | 87 |
| `lunar-crater-render-primitives.js` | 741 |
| `lunar-crater-hit-testing.js` | 177 |
| `lunar-crater-annotation-runtime.js` | 840 |
| `lunar-crater-hover-runtime.js` | 341 |

The largest piece is 840 lines, 68.2% smaller than the original and below
the committed 1,847-line maximum and 1,000-line cap. Ring/label geometry,
hit math, scene annotation lifetime and pointer hover now have separate
owners. The action facade retains catalog/view-setting intent and public
methods. All 76 focused action/setter/catalog assertions pass.
The full unit gate (3,836 passing, six skipped), structure check and static
build pass. On `/artemis2/`, the visible Lunar Features pill opened its panel;
Recommended enabled `view-lunar-craters`, produced 450 filtered features and
created the scene annotation group without enabling legacy `view-craters`.
The initial scene camera need not show individual crater rims at that scale.
