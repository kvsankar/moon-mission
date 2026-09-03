---
doc_class: design
status: current
scope: runtime.mode.compare
canonical_for:
  - orbit-comparison-normalization
  - orbit-comparison-runtime-structure
---

# Orbit Comparison Design

The required behavior and URL contract are owned by the
[Orbit Comparison specification](../../specs/modes/orbit-comparison.md).

## Core Model

One runtime scene owns the primary mission plus comparison overlay series. The
comparison mission is not bootstrapped as a second application/runtime.

The overlay loader maps the comparison craft into a synthetic ID of the form
`CMP_<MISSION>_<CRAFT>`. Its Moon normalization support series uses the related
alias `CMP_<MISSION>_<CRAFT>__MOON`.

## Normalization

Let:

- `r_EM(t)` be the physical Earth-to-Moon position vector at time `t`; and
- `D_ref` be `COMPARISON_REFERENCE_DISTANCE_KM` from
  `comparison-display.js`.

The display scale is:

```text
s(t) = D_ref / |r_EM(t)|
```

After rotating/translating into the comparison frame, every displayed vector
is multiplied by `s(t)`.

The resulting frame has:

- Earth at `(0, 0, 0)`;
- Moon at `(D_ref, 0, 0)`; and
- craft vectors rotated into the Earth-to-Moon basis and scaled by `s(t)`.

This is intentionally more non-physical than ordinary relative mode because
its purpose is shape comparison.

## Mission Of Record For Moon Scale

Normally, the primary mission supplies the Moon sample used by both the scene
Moon and scale resolver.

If primary Moon data ends before the compare-display window, the runtime uses
the comparison mission's Moon alias. The displayed Moon and normalization
scale must switch to the same source together so they cannot drift apart.

## Time Mapping

Conceptual `tau` is zero at the selected anchor pair, but runtime display time
remains a primary-mission timestamp. For a comparison body,
`mapComparisonBodyTimeMs` applies:

```text
sourceTime = displayTime + (sourceAnchorTime - displayAnchorTime)
```

Orbit curves and events therefore preserve each mission's native pacing while
sharing one presentation clock. Timeline `T+` labels remain relative to the
display range start; they are not a rendering of conceptual anchor-relative
`tau`.

## Data Loading

Compare mode loads unchanged assets from both missions:

- primary `config.json` and Chebyshev data;
- comparison `config.json` and Chebyshev data; and
- both missions' `relative-<CRAFT>-cheb.json` support data.

`mergeComparisonNormalizationSupportSeries` in `orbit-load-actions.js` merges
the secondary `SC` and `MOON` series under comparison aliases during the normal
support-Chebyshev loading pass.

## Rendering Structure

Both craft curves use the normal multi-craft path. The synthetic comparison ID
appears in `scene.planetsForLocations`, and
`generateBodyCurve`/`normalizeComparisonCurveVectors` produce comparison
vectors with the per-vector scale resolver.

Display freezing is applied after physical state calculation. Raw telemetry and
ephemeris lookup remain under their existing owners.

## State Boundaries

Compare-mode state owns:

- activation;
- comparison mission identity;
- anchor and time mapping;
- comparison frame settings; and
- frozen lighting/spin presentation.

Existing physical state owns:

- raw mission config;
- raw Chebyshev and NPZ data;
- body ephemeris lookup; and
- raw telemetry calculations.

This boundary keeps comparison as a deterministic presentation layer.

## Implementation Map

| File | Role |
| --- | --- |
| `src/platform/js/app/comparison-overlay-loader.js` | Parse URL, load secondary config/manifest, and build `globalConfig.comparisonOverlay`. |
| `src/platform/js/core/domain/comparison-overlay.js` | Pure ID, anchor, and time-mapping helpers. |
| `src/platform/js/core/domain/comparison-display.js` | Low-level scale primitives and reference distance. |
| `src/platform/js/app/comparison-normalization.js` | Normalized display state and per-vector scale resolver. |
| `src/platform/js/app/orbit-load-actions.js` | Merge comparison `SC`/`MOON` support series. |
| `src/platform/js/scene-state.js` | Select comparison Moon alias beyond primary data coverage. |
| `src/platform/js/ui/compare-mode-controller.js` | Compare-panel UI adapter. |
| `src/platform/js/app/relative-mode.js` | URL state for anchors and compare origin. |

## Existing Test Surfaces

- `test/compare-artemis-scaling.test.js`
- `test/mission-smoke.test.js`
- `test/compare-mode-controller.test.js`
- `test/compare-mode-ui-model.test.js`
- `test/compare-panel-controller.test.js`
- `test/index-landing-compare-smoke.test.js`
