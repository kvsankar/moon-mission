---
doc_class: spec
status: current
scope: runtime.mode.relative
canonical_for:
  - relative-mode-behavior
  - relative-mode-url-contract
---

# Relative Mode

## Purpose

Relative mode makes translunar transfer structure easier to read by presenting
the mission in an Earth-Moon rotating frame. It is a display/runtime mode, not a
replacement for the ordinary inertial `geo` and `lunar` views.

The coordinate-frame construction and runtime ownership are defined in
[Relative Frame Design](../../designs/frames/relative-mode.md). Data generation
and coverage procedures are defined in
[Relative Orbit Data Operation](../../operations/data/relative-mode-generation.md).

## Activation Contract

Relative mode is URL-driven:

```text
mission.html?mission=<id>&mode=relative
```

Entering or leaving relative mode reloads the page. Both selector entry points,
`mission.html` without `mission=` and `index.html`, add or remove
`mode=relative` from mission links consistently.

The synchronized origin controls expose Relative alongside Earth and Moon:

- Header pills: `#origin-pill-earth`, `#origin-pill-moon`, and
  `#origin-pill-relative`.
- Settings inputs: `#origin-earth`, `#origin-moon`, and `#origin-relative`.

Both control surfaces represent the same underlying origin choice and must stay
synchronized.

## Display Invariants

In relative mode:

1. Earth remains at the origin.
2. The Earth-to-Moon axis remains fixed to `+X`.
3. Moon distance varies with time at real scale; it is not normalized.
4. Spacecraft positions use the same rotating basis as the Moon.
5. Default inertial behavior is unchanged when relative mode is not selected.
6. Multi-craft missions preserve all available craft series in the same frame.
7. Lighting vectors use the same frame exactly once; already-relative Sun data
   must not be rotated a second time.

## Switching And Time Preservation

Although mode transitions reload the page, the current mission time must be
preserved when entering or leaving relative mode.

When leaving relative mode, the requested inertial origin (`geo` or `lunar`)
must also survive the reload. Legacy `cy3.*` session keys remain compatibility
fallbacks, not the primary storage contract.

## Runtime Data Contract

Relative mode uses `geo` as its base runtime origin while selecting
`relative-<SPACECRAFT>-cheb.json` orbit data.

When source data permits, the relative dataset contains:

- the primary craft;
- additional craft bodies;
- `MOON`;
- `SUN`;
- `FRAME_ROT`; and
- `SC` as a compatibility alias for the primary craft.

Craft-specific support files may supply additional series. Runtime velocity is
the analytic derivative of Chebyshev polynomials fitted to rotated positions.

Generated relative Chebyshev and NPZ artifacts belong to the companion
`moon-mission-data` repository even when staged beneath app-visible mission
paths.

## Failure And Compatibility Rules

- Missing optional support series must not corrupt series already loaded from
  the primary file.
- The runtime must distinguish inertial Sun vectors from already-relative Sun
  vectors.
- Relative-mode activation must not rewrite raw ephemeris products.
- Session restoration must prefer current `mission.*` keys while accepting
  documented legacy fallbacks.
