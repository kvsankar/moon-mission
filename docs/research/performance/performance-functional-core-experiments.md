# Functional Core Performance Experiments

This document tracks experiment-driven performance work on the functional core.

## Experiment 1: Skip Next-State SC Lookup for 2D Frame Path

### Hypothesis
2D frame rendering does not require a forward ephemeris sample (`nextPosition` / `nextVelocity`) for spacecraft orientation, so skipping that second lookup should reduce per-frame functional-core cost.

### Change
- `src/platform/js/core/plans/frame-plan.js`
  - Added `includeNextState` to scene-state options.
  - Sets `includeNextState: false` for `currentDimension === "2D"`.
- `src/platform/js/scene-state.js`
  - `computeBodyState("SC", ...)` now skips the second ephemeris query when `includeNextState === false` and reuses current state as next state.
- Tests
  - Updated `test/frame-plan.test.js` for 2D/3D `includeNextState` assertions.
  - Added `test/scene-state.test.js` to verify SC ephemeris query count behavior.
- Bench tools
  - Added `scripts/bench-functional-core-scene-state.js`.
  - Added `scripts/bench-functional-core-sc-body-state.js`.

### Measurement
- Scene benchmark command:
  - `node scripts/bench-functional-core-scene-state.js --config geo --rounds 7 --samples 5000 --warmup 1000 --include-next-state false`
- Targeted SC benchmark commands:
  - `node scripts/bench-functional-core-sc-body-state.js --rounds 10 --samples 15000 --warmup 4000 --include-next-state true`
  - `node scripts/bench-functional-core-sc-body-state.js --rounds 10 --samples 15000 --warmup 4000 --include-next-state false`

### Result
- Targeted SC path shows consistent improvement when `includeNextState=false`.
- Representative aggregate:
  - mean: `0.001011 ms` -> `0.000620 ms`
  - p95: `0.001200 ms` -> `0.000700 ms`
  - p99: `0.001810 ms` -> `0.001170 ms`

### Validation
- Unit tests: pass.
- UI tests: pass.
- SSIM regressions: `0`.

## Experiment 2: Remove Redundant Ephemeris Work in Scene Composition

### Hypothesis
Two avoidable costs were present in the scene-state functional core:
- `includeNextState` was not being forwarded through `computeSceneState`, so 2D scene computation still performed unnecessary SC next-state lookups.
- Relative GEO mode computed Moon ephemeris twice per frame (Sun-frame transform + body-state pass).

Reducing these redundant ephemeris queries should improve frame-time consistency and average cost without changing rendering behavior.

### Change
- `src/platform/js/scene-state.js`
  - `computeSceneState` now forwards `includeNextState` to body-state computation.
  - Relative GEO computation now reuses the Moon ephemeris state already fetched for Sun-direction frame transform.
  - `computeBodyState("MOON", "geo", ...)` accepts optional `precomputedBodyEphemeris.MOON`.
- `scripts/bench-functional-core-scene-state.js`
  - Added `--frame-mode` argument (`inertial` or `relative`) for reproducible mode-specific benchmarking.
- `test/scene-state.test.js`
  - Added coverage for `computeSceneState` forwarding `includeNextState`.
  - Added coverage that relative mode performs only one Moon ephemeris lookup.
  - Added coverage for `computeBodyState` Moon precomputed-state reuse.

### Measurement
- Relative-mode benchmark (before change):
  - `computeSceneState` with `frameMode=relative`, `includeNextState=false`
  - Aggregate mean-of-means: `0.024713 ms`
  - Aggregate mean p95: `0.027287 ms`
  - Aggregate mean p99: `0.084250 ms`
- Relative-mode benchmark (after change):
  - `node scripts/bench-functional-core-scene-state.js --config geo --frame-mode relative --rounds 8 --samples 6000 --warmup 1500 --include-next-state false`
  - Aggregate mean-of-means: `0.016381 ms`
  - Aggregate mean p95: `0.018700 ms`
  - Aggregate mean p99: `0.045200 ms`
- Inertial-mode check after forwarding `includeNextState`:
  - `--frame-mode inertial --include-next-state true`: mean-of-means `0.015956 ms`
  - `--frame-mode inertial --include-next-state false`: mean-of-means `0.015123 ms`

### Result
- Relative GEO path improved substantially after removing duplicate Moon lookup:
  - mean-of-means improved by ~`33.7%`
  - mean p95 improved by ~`31.5%`
  - mean p99 improved by ~`46.3%`
- Inertial path also improved modestly when `includeNextState=false` is active in scene-state composition.

## Experiment 3: Remove Per-Call Date Allocation in JD Conversion

### Hypothesis
`getHorizonsJulianDate` is called on every ephemeris lookup and was allocating a `Date` object even when `Date#getJD_UTC` is unavailable. Eliminating that allocation on the common path should reduce GC pressure and improve core throughput.

### Change
- `src/platform/js/data/ephemeris-provider.js`
  - Added module-level constants for Julian-date conversion.
  - Added one-time capability check `HAS_DATE_GET_JD_UTC`.
  - Uses direct arithmetic conversion without allocating `Date` when `getJD_UTC` is not available.
- Added `test/ephemeris-provider.test.js`
  - Verifies Julian-date conversion at Unix epoch and a mission-era UTC timestamp.

### Measurement
- Targeted SC body-state benchmark (before change):
  - `--include-next-state=false`: mean-of-means `0.000558 ms`
  - `--include-next-state=true`: mean-of-means `0.001000 ms`
- Targeted SC body-state benchmark (after change):
  - `node scripts/bench-functional-core-sc-body-state.js --rounds 10 --samples 20000 --warmup 5000 --include-next-state false`
  - mean-of-means `0.000520 ms`, mean p95 `0.000600 ms`, mean p99 `0.000920 ms`
  - `node scripts/bench-functional-core-sc-body-state.js --rounds 10 --samples 20000 --warmup 5000 --include-next-state true`
  - mean-of-means `0.000938 ms`, mean p95 `0.001070 ms`, mean p99 `0.001620 ms`
- Scene-state relative-mode check (after change):
  - `node scripts/bench-functional-core-scene-state.js --config geo --frame-mode relative --rounds 8 --samples 6000 --warmup 1500 --include-next-state false`
  - mean-of-means `0.014408 ms` (previous experiment: `0.016381 ms`)

### Result
- SC body-state hot path improved by ~`6-7%` mean.
- Relative GEO scene-state benchmark improved by ~`12.0%` mean vs Experiment 2 snapshot.

## Experiment 4: Switch Moon Ephemeris Source from Astronomy to NPZ (Config-Only)

### Hypothesis
Moon state computation via `astronomy-engine` is now the dominant cost in the remaining functional-core path. Switching Moon to precomputed NPZ vectors should significantly reduce per-frame compute cost with minimal behavioral risk.

### Change
- `assets/chandrayaan3/data/config.json`
  - `ephemeris_sources.MOON`: `"astronomy"` -> `"npz"`
- `scripts/bench-functional-core-scene-state.js`
  - Added NPZ loading support from disk, so benchmark scenarios are valid when a body source is set to `npz`.
  - This keeps benchmark tooling aligned with runtime source selection behavior.

### Measurement
- Relative mode (`geo`, `frameMode=relative`, `includeNextState=false`), astronomy source:
  - mean-of-means `0.013444 ms`
  - median-of-medians `0.012300 ms`
  - mean p95 `0.014150 ms`
  - mean p99 `0.033675 ms`
- Relative mode, NPZ source:
  - mean-of-means `0.001991 ms`
  - median-of-medians `0.001200 ms`
  - mean p95 `0.001925 ms`
  - mean p99 `0.002862 ms`
- Inertial mode (`geo`, `frameMode=inertial`, `includeNextState=false`), astronomy source:
  - mean-of-means `0.013675 ms`
  - median-of-medians `0.012300 ms`
- Inertial mode, NPZ source:
  - mean-of-means `0.001505 ms`
  - median-of-medians `0.001100 ms`

### Result
- Relative-mode mean improved by ~`85.2%` (about `6.8x` faster).
- Relative-mode p99 improved by ~`91.5%`.
- Inertial-mode mean improved by ~`89.0%` (about `9.1x` faster).

### Validation
- Unit tests: pass.
- UI tests: pass (`48/48`).
- SSIM regressions: `0`.

## Experiment 5: Chebyshev Transport Compression (gzip + Flat-Buffer Comparison)

### Hypothesis
Chebyshev JSON payloads are transfer-heavy and parse-heavy. A transport optimization can reduce load-time pressure by:
- Shrinking payload bytes over the wire.
- Optionally reducing decode cost when moving from JSON to a flat binary layout.

As a low-risk first step, we can keep the existing JSON data model and enable deterministic gzip transport with JSON fallback.

### Change
- Runtime transport loader
  - `src/platform/js/chebyshev.js`
    - Added transport selection (`auto` / `gzip` / `json`) via `missionConfig.chebyshev_transport`.
    - In `auto`, the loader attempts `<cheb>.json.gz` first when gzip decompression is available, then falls back to `.json`.
    - Added explicit `.json.gz` decode path using `DecompressionStream("gzip")`.
- Functional-core transport helpers
  - `src/platform/js/core/domain/chebyshev-transport.js`
    - Added pure helpers for URL/transport normalization and gzip-candidate resolution.
- Build and tooling
  - `scripts/build.py`
    - Generates deterministic `*.json.gz` companions for every `*-cheb.json` in `dist/` (can be disabled via `--no-compress-chebyshev`).
  - `scripts/compress-chebyshev-gzip.py`
    - Generates deterministic `*.json.gz` companions in `assets/` for local/dev/test serving.
  - `scripts/bench-chebyshev-transport.js`
    - Added reproducible benchmark for JSON/gzip/brotli vs flat binary transport variants.
  - `package.json`
    - Added `npm run bench:cheb-transport` and `npm run compress:cheb`.

### Measurement
Command:
- `node scripts/bench-chebyshev-transport.js --rounds 60 --warmup 12`

Representative results (`geo-CH3L-cheb.json`):
- Size:
  - JSON: `997305 B`
  - JSON+gzip: `262018 B` (`-73.7%`)
  - JSON+brotli: `212328 B` (`-78.7%`)
  - Flat F64+brotli: `181884 B` (`-81.8%`)
  - Flat F32+brotli: `96144 B` (`-90.4%`)
- Decode cost:
  - JSON parse: `3.075 ms`
  - gzip -> JSON parse: `5.419 ms`
  - Flat F64 decode: `0.033 ms`
  - gzip -> Flat F64 decode: `0.631 ms`

Representative results (`lunar-CH3L-cheb.json`):
- Size:
  - JSON: `1004189 B`
  - JSON+gzip: `260504 B` (`-74.1%`)
  - JSON+brotli: `210438 B` (`-79.0%`)
  - Flat F64+brotli: `180953 B` (`-82.0%`)
  - Flat F32+brotli: `95115 B` (`-90.5%`)
- Decode cost:
  - JSON parse: `3.087 ms`
  - gzip -> JSON parse: `5.761 ms`
  - Flat F64 decode: `0.018 ms`
  - gzip -> Flat F64 decode: `0.631 ms`

### Result
- Deterministic gzip transport delivers major transfer reduction (~`73-74%`) while preserving the existing JSON model.
- Flat-buffer transport can beat gzip+JSON on both bytes and decode time, but requires a schema/loader migration and accuracy gating (especially for F32).
- Selected implementation for this slice: gzip transport with JSON fallback (low risk, immediate network benefit, no functional-core behavior change).
