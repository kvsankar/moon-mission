# Chebyshev Ephemeris Format Specification

## Overview

This document defines the JSON format used for Chebyshev-compressed ephemeris data in this repository.

The runtime consumes these files via `src/platform/js/chebyshev.js` and reconstructs:
- Position `(x, y, z)` in km
- Velocity `(vx, vy, vz)` in km/s (analytic derivative of Chebyshev polynomials)

## File Naming

Common files per mission in `assets/<mission>/data/`:

- `geo-<ID>-cheb.json` - Earth-centered/or geocentric phase
- `lunar-<ID>-cheb.json` - Moon-centered/selenocentric phase
- `landing-<ID>-cheb.json` - Legacy landing file (may still exist)
- `landing-<ID>-geo-cheb.json` - Landing data expressed in geo frame
- `landing-<ID>-lunar-cheb.json` - Landing data expressed in lunar frame
- `relative-<ID>-cheb.json` - Earth-centered rotating relative frame (`mode=relative`)

`<ID>` is typically the mission's primary craft mnemonic from `config.json` (`spacecraft_mnemonic`).
Secondary craft series may also appear as additional top-level body keys in the same file.

Ownership note:
- These are the runtime/staged paths consumed by the app.
- Generated `*-cheb.json` and `*-cheb.json.gz` files are tracked in `../moon-mission-data`, not committed in `moon-mission`.

## JSON Structure

```json
{
  "format": "chebyshev-ephemeris",
  "version": "1.0",
  "metadata": {
    "source": "geo-CH3L.npz",
    "created": "2026-01-14T02:30:29.667048+00:00",
    "tolerance_km": 5,
    "segments_count": 2066,
    "bodies": ["CH3L", "CH3O", "MOON", "SC", "SUN"],
    "coordinate_frame": "J2000",
    "units": {
      "time": "julian_date_tdb",
      "position": "km"
    }
  },
  "time_range": {
    "start": 2460139.890972222,
    "end": 2460194.022916667
  },
  "CH3L": {
    "time_range": {
      "start": 2460139.890972222,
      "end": 2460194.022916667
    },
    "segments": [
      {
        "t_start": 2460139.890972222,
        "t_end": 2460139.918055556,
        "cx": [-233.13, 6782.74, 325.48],
        "cy": [-8885.77, -5924.94, 1306.44],
        "cz": [381.99, -132.79, -71.70]
      }
    ]
  },
  "SC": {
    "time_range": {
      "start": 2460139.890972222,
      "end": 2460194.022916667
    },
    "segments": [
      {
        "t_start": 2460139.890972222,
        "t_end": 2460139.918055556,
        "cx": [-233.13, 6782.74, 325.48],
        "cy": [-8885.77, -5924.94, 1306.44],
        "cz": [381.99, -132.79, -71.70]
      }
    ]
  }
}
```

## Field Definitions

### Root Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `format` | string | yes | Must be `"chebyshev-ephemeris"` |
| `version` | string | yes | Format version (`"1.0"`) |
| `metadata` | object | yes | Source/compression metadata |
| `time_range` | object | yes | Overall coverage |
| body series (`SC`, `CH3L`, `MOON`, etc.) | object | yes | One or more piecewise Chebyshev body series |
| `segments` | array | no | Legacy alias of the `SC` series segments, emitted by the ordinary compressor when `SC` exists |

### `metadata`

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | string | yes | Source NPZ filename |
| `created` | string | yes | ISO timestamp of generation |
| `tolerance_km` | number | yes | Compression tolerance used |
| `segments_count` | number | yes | Number of segments written |
| `bodies` | string[] | no | Bodies/series present in the file |
| `coordinate_frame` | string | yes | `"J2000"` for ordinary inertial products or `"relative-earth-moon"` for derived relative products |
| `units` | object | yes | Unit block |
| `derived_from` | string | no | Present for derived products (for example relative mode) |
| `mode` | string | no | Present for derived products (for example `"relative"`) |
| `frame_definition` | string | no | Human-readable basis definition for derived frame products |
| `sun_frame` | string | no | Runtime annotation for loaded Sun series (`"inertial"` or `"relative"`) |

Notes:
- Older files/docs may mention `segment_hours` or `polynomial_degree`; current generator output does not require them.
- Relative files usually include both `derived_from` and `mode`.

### `units`

| Field | Type | Required | Description |
|---|---|---|---|
| `time` | string | yes | `"julian_date_tdb"` for current ordinary generation; legacy/current relative files may use `"julian_date"` for the same project TDB-Julian-date convention |
| `position` | string | yes | `"km"` |

### `time_range`

| Field | Type | Required | Description |
|---|---|---|---|
| `start` | number | yes | First sample JD |
| `end` | number | yes | Last sample JD |

### Body Series Object

| Field | Type | Required | Description |
|---|---|---|---|
| `time_range` | object | yes | Coverage for this body series |
| `segments` | array | yes | Piecewise Chebyshev segments |

### Segment Object

| Field | Type | Required | Description |
|---|---|---|---|
| `t_start` | number | yes | Segment start JD |
| `t_end` | number | yes | Segment end JD |
| `cx` | number[] | yes | X-axis Chebyshev coefficients |
| `cy` | number[] | yes | Y-axis Chebyshev coefficients |
| `cz` | number[] | yes | Z-axis Chebyshev coefficients |
| `cw` | number[] | no | Quaternion W coefficients (`FRAME_ROT` only in relative-frame products) |

The number of coefficients can vary segment-to-segment (adaptive compression).

## Evaluation

At runtime (`src/platform/js/chebyshev.js`):

1. Resolve the target body series (`SC`, primary craft id, `MOON`, etc.).
2. Find segment with `t_start <= jd <= t_end`.
3. Normalize time to `[-1, 1]`:
   - `t_norm = 2 * (jd - t_start) / (t_end - t_start) - 1`
4. Evaluate `cx`, `cy`, `cz` via Clenshaw recurrence.
5. Evaluate derivatives for velocity and scale by segment span in seconds.

Velocity units returned are km/s.

## Time-Base Notes

- HORIZONS JDCT and SPICE-derived source products use TDB Julian dates; this
  repository preserves those values in NPZ/Chebyshev segment boundaries.
- Current ordinary compression emits `metadata.units.time =
  "julian_date_tdb"` and `coordinate_frame = "J2000"`.
- Relative generation emits `coordinate_frame = "relative-earth-moon"`. It
  currently retains the legacy `metadata.units.time = "julian_date"` label,
  while its values remain in the same project TDB-Julian-date convention.
- Runtime lookup converts UTC epoch milliseconds to JD_TDB through
  `getJD_TDB` when available or the documented TDB offset fallback. It must not
  query Chebyshev segment boundaries with JD_UTC.
- Readers must accept both documented time labels until relative generation and
  existing data are migrated deliberately.

## Generation Operation

Generation, compression, and validation procedures are owned by
[Chebyshev Ephemeris Generation](../../operations/data/chebyshev-ephemeris-generation.md).

## Accuracy Targets

Current compression defaults in tooling:

- Orbit phases (`geo`, `lunar`, `relative`): tolerance 5 km
- Landing phases (`landing`, `landing-geo`, `landing-lunar`): tolerance 2 km

Validation is available in `scripts/compress-orbits.py` (`--validate`).

## Required Format Coverage

Tests must cover both generated metadata variants:

- ordinary inertial product: `coordinate_frame = "J2000"` and accepted TDB
  Julian-date label;
- derived relative product: `coordinate_frame = "relative-earth-moon"`,
  `mode = "relative"`, and accepted legacy/current TDB Julian-date label.
