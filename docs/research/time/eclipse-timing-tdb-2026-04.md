# Eclipse Timing Investigation — Artemis 2 Flyby (2026-04)

## Problem

In the Flyby timeline, eclipse start/end (Moon occulting Sun from Orion's viewpoint) was off by ~1–3 minutes from NASA published times.

## Root Cause

**UTC/TDB time system mismatch in Chebyshev ephemeris lookups.**

### Data pipeline (produces TDB)

1. **HORIZONS API** returns state vectors with `JDTDB` column header (verified in `data-generated/artemis1/ho-SC-vectors.txt` line 26: `JDTDB, Calendar Date (TDB), ...`)
2. **`orbits.py`** parses this column as `jdct`, stores in NPZ with that field name (line 863, 928–931)
3. **`compress-orbits.py`** reads `jd = vectors["jdct"]` (line 116) and passes TDB JDs into Chebyshev segment boundaries (`t_start`, `t_end`) unchanged
4. **`export-spice-chebyshev.py`** independently converts via `sp.unitim(value, "ET", "JDTDB")` (line 134–135) — also TDB
5. **`orbits.py`** does not set `TIME_TYPE` in HORIZONS API requests (line 415–434); HORIZONS defaults to TDB for vector ephemeris tables

### Runtime (was querying with UTC)

All Chebyshev lookup functions converted UTC epoch-ms to `JD_UTC` via `Date.prototype.getJD_UTC()`:

| File | Function | Line |
|------|----------|------|
| `src/platform/js/data/ephemeris-provider.js` | `getHorizonsJulianDate()` | 94–99 |
| `src/platform/js/data/relative-frame-provider.js` | `toHorizonsJulianDate()` | 10–18 |
| `src/platform/js/services/ephemeris.js` | `toHorizonsJulianDate()` | 36–44 |
| `src/platform/js/chebyshev.js` | `msToJD()` / `jdToMs()` | 159–170 |
| `src/platform/js/app/body-location-actions.js` | range check | 74–78 |

### Effect

TDB ≈ UTC + 69.184s. All body positions (SC, Moon, Sun) were evaluated ~69.184 seconds in the past. Since all bodies shift equally, the relative geometry displayed corresponded to ~69s earlier, systematically delaying all eclipse boundaries.

### Misleading comment

`astro.js` lines 9–11 listed "HORIZONS ephemeris data" and "Chebyshev polynomial data" under the UTC section. This was **incorrect** and propagated the confusion through the codebase.

## Fix Applied

Changed all Chebyshev lookup paths from `getJD_UTC()` to `getJD_TDB()` with arithmetic TDB fallback. 7 files changed:

| File | Change |
|------|--------|
| `data/ephemeris-provider.js` | `getHorizonsJulianDate()` → `getJD_TDB()` + TDB arithmetic fallback |
| `data/relative-frame-provider.js` | `toHorizonsJulianDate()` → `getJD_TDB()` |
| `services/ephemeris.js` | `toHorizonsJulianDate()` → `getJD_TDB()` |
| `chebyshev.js` | `msToJD()` → TDB; `jdToMs()` → subtracts TDB offset |
| `app/body-location-actions.js` | Range check → `getJD_TDB()` |
| `astro.js` | Corrected time-system documentation comments |
| `test/ephemeris-provider.test.js` | Updated to validate TDB conversion |

New test: `test/eclipse-timing-tdb.test.js` — validates geometric eclipse contacts against NASA references.

No config timestamps were edited.

## Numeric Validation

### Eclipse contact times (bisected from Chebyshev geometry)

| Boundary | NASA Reference | Before fix (JD\_UTC) | After fix (JD\_TDB) |
|----------|---------------|---------------------|---------------------|
| Eclipse start | 00:35:00 UTC | 00:36:22 (+82.4s) | 00:35:13 (+13.2s) |
| Eclipse end | 01:32:00 UTC | 01:34:25 (+145.4s) | 01:33:16 (+76.2s) |

### Physics corrections validation (skyfield-ts classify_disc_overlap)

Script: `scripts/validate-eclipse-skyfield.mjs`

| Mode | Eclipse start | Δ start | Eclipse end | Δ end |
|------|--------------|---------|-------------|-------|
| Geometric | 00:35:13.188 | +13.2s | 01:33:16.178 | +76.2s |
| + Light-time | 00:35:14.254 | +14.3s | 01:33:17.499 | +77.5s |
| + Light-time + aberration | 00:35:14.254 | +14.3s | 01:33:17.500 | +77.5s |
| NASA reference | 00:35:00 | 0 | 01:32:00 | 0 |

**Light-time correction** shifts contacts by ~1.1–1.3 seconds.
**Stellar aberration** shifts contacts by < 0.001 seconds.
**Total physics corrections**: ~1.3 seconds. The 76-second residual is unaffected.

### Conclusion on 76-second residual

The residual at eclipse end is **trajectory data**, not missing physics. The HORIZONS trajectory segment covering the eclipse period (`EPH_OEM_20260405_1908.V0.1`) is a prediction generated April 5, before OTC-3 fired April 6. The NASA broadcast schedule times likely come from a different trajectory solution. A 76-second timing error corresponds to ~71 km of along-track position discrepancy — consistent with trajectory prediction accuracy over a 28+ hour propagation window.

## Test Results

```
Unit tests:  44 files, 214 passed, 6 skipped, 0 failed
Config sync: 40 missions checked, all in sync
```

## All-Mission Audit (completed)

### HORIZONS data audit
All 111 `data-generated/*/ho-*-vectors.txt` files confirmed `JDTDB` column header — zero exceptions. No mission uses NPZ at runtime (all configs set `ephemeris_source: "chebyshev"`).

### time_scale annotation
Added `time_scale: "TDB"` to all phase/span blocks and `time_scale: "UTC"` to all events blocks across 40 mission configs (166 blocks total). Chebyshev JSON metadata updated to `units.time: "julian_date_tdb"` (129 files, gitignored).

Runtime `start-end-times.js` and `config-events.js` now read `time_scale` and apply TDB→UTC conversion when present, shifting animation slider boundaries by ~69s to match actual data availability.

### Animation slider overshoot
Before fix: 30/36 missions had ~69-second overshoot at slider end (spacecraft disappears).
After fix: 0/36 missions overshoot.

### HORIZONS request documentation
`orbits.py` `get_horizons_start_time()` / `get_horizons_stop_time()` documented as TDB (HORIZONS default for vector tables). Config phase times carry `time_scale: "TDB"` to match.

## Resolved: delta-T accuracy

Initial validation showed a 27-second delta between skyfield-ts and our TDB computation. Root cause: the validation script created skyfield-ts `Timescale` with an incorrect minimal leap second table (single entry of 10 instead of the full IERS table with 37 leap seconds). After fixing the validation script with the complete IERS leap second table (27 entries, 11–37):

```
skyfield-ts TDB JD: 2461137.525106315
our TDB JD:         2461137.5251062964
delta:              0.0016 seconds
```

Our `TDB_OFFSET_MS = (37 + 32.184) * 1000 = 69184ms` is accurate to within **1.6 milliseconds** of skyfield-ts's full model for 2026. The ~1.6ms residual is the TDB-TT periodic term (max amplitude ~1.7ms), which our constant approximation correctly ignores for this application.
