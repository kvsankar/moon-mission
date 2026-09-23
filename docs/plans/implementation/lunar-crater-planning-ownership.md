# Lunar Crater Planning Ownership

Status: calculation split complete (2026-09-23)

## Problem and boundary

`core/domain/lunar-crater-catalog.js` is 1,048 physical lines. It combines
low-level lunar vectors, view/camera projection, label placement, catalog
validation and feature filtering. These decisions are pure, but projection and
catalog-selection changes have different inputs and test concerns.

Keep the current public exports from `lunar-crater-catalog.js` for the UI and
application callers. Separate the pure calculation owners with one-way
imports and no browser or renderer dependencies.

## Proposed owners

| Owner | Responsibility |
| --- | --- |
| `lunar-crater-common.js` | Shared vector, numeric and feature-name primitives and constants. |
| `lunar-crater-projection.js` | View-frame resolution, camera/surface projection, visibility and boundary tone. |
| `lunar-crater-labels.js` | Label offset, density and hover-anchor placement. |
| `lunar-crater-catalog.js` | Validate/cache catalog features, filter them and assemble the render plan; retain public re-exports. |

Dependencies run from catalog to labels/projection/common and from labels and
projection to common. The common layer does not import the higher owners.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `lunar-crater-catalog.js` | 1,048 | 733 | Under 550 |

Count every resulting source file, including the public facade. The largest
must be at most 733 physical lines.

## Verification

- `test/lunar-crater-catalog.test.js` for filtering, projection and labels.
- `test/lunar-crater-actions.test.js` and
  `test/lunar-crater-control-panel.test.js` for the existing public API.
- Full unit suite and source-structure/import-cycle check.
- Preserve sorted catalog caching, far-side visibility, labels and the
  camera-versus-surface projection choice.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `lunar-crater-projection.js` | 482 |
| `lunar-crater-catalog.js` | 250 |
| `lunar-crater-common.js` | 228 |
| `lunar-crater-labels.js` | 204 |

The largest piece is 482 lines, 54.0% smaller than the original 1,048 and
below the committed 733-line maximum. The public catalog module retains the
existing exports; the new dependency flow is common primitives to projection
and labels, then catalog selection. All owners remain pure domain modules.

Verification: 104 focused crater catalog/action/control-panel tests, the full
unit suite (3,827 passed, six skipped), production build and the 733-file
source-structure/import-cycle check passed. The completed refactor record in
`scripts/source-structure-baseline.json` names this plan and all four pieces.

Remaining work is in callers' UI and render effects, not the pure catalog
selection boundary. Keep the existing lunar-feature control specification as
the behavioral owner.
