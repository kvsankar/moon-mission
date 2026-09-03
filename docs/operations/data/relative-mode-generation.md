---
doc_class: operation
status: current
scope: data.relative-orbits
canonical_for:
  - relative-orbit-generation
  - relative-orbit-coverage-check
---

# Relative Orbit Data Operation

This runbook generates and inspects the derived orbit data consumed by
[Relative Mode](../../specs/modes/relative-mode.md). The frame and runtime
structure are described in
[Relative Frame Design](../../designs/frames/relative-mode.md).

## Generator

Relative files are produced by `scripts/generate-relative-orbits.py`.

Inputs:

- geocentric NPZ from
  `data-generated/<mission>/<geo-orbits-file>.npz`; and
- multi-body `*_vectors` from that NPZ or from a body-keyed Chebyshev source.

Outputs:

- staged runtime file
  `assets/<mission>/data/relative-<SPACECRAFT>-cheb.json`; and
- intermediate debug NPZ
  `data-generated/<mission>/relative-<SPACECRAFT>.npz`.

Current generator behavior:

- emits a multi-body relative file when source data is available;
- includes the primary craft and additional craft bodies found in the source;
- includes `MOON`, `SUN`, and `FRAME_ROT` when available; and
- writes `SC` as a compatibility alias for the primary craft.

Relative Chebyshev is fitted to rotated positions. Runtime velocity is derived
analytically from those fitted polynomials.

## Repository Boundary

The paths beneath `assets/<mission>/data/` are app-visible staging paths.
Generated `relative-*-cheb.json`, compressed Chebyshev files, and relative NPZ
artifacts are tracked in `../moon-mission-data`, not committed to this app
repository.

## Commands

Preferred end-to-end mission pipeline:

```bash
python scripts/run-mission-pipeline.py --missions <mission>
```

Relative-only regeneration when source NPZ/Chebyshev already exists:

```bash
python scripts/generate-relative-orbits.py --mission <mission> --force
```

Optional batch generation:

```bash
python scripts/generate-relative-orbits.py --all --exclude artemis1 --ensure-npz
```

## Coverage Inspection

```bash
rg --files ..\moon-mission-data\assets -g "*/data/relative-*-cheb.json"
```

Runtime smoke URL:

```text
mission.html?mission=<id>&mode=relative
```

After regeneration, follow the app/data boundary audit and verification process
before committing either repository.
