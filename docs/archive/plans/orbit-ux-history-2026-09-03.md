# Orbit UX Roadmap

This document records the current roadmap threads so they are easy to resume later without depending on chat context.

Runtime architecture and refactor guidance now lives in
[Runtime Target Architecture](../../designs/runtime/target-architecture.md).
This file is intentionally limited to orbit UX and related product behavior so
we only have one architecture document to maintain.

Architecture status note:

- The broad functional-core / imperative-shell refactor is now largely complete.
- Future structural work in this area should be small, targeted follow-on cleanup tied to real product changes, not another open-ended breakup campaign.

Branch recovery note:

- The old shelf branch `temp/orbit-ux-shelf-20260328` contained additional branch-only product/runtime ideas that are not fully on `master`.
- The still-relevant parts of that shelf are folded into the `Shelf-Derived Reimplementation Targets` section below so this roadmap is the single recovery document.

## Current Guardrail

Before reopening broad structural work in orbit UX, run the visual gate again:

- unit tests
- UI/SSIM tests
- inspect diffs
- refresh baselines only if the visual changes are intentional

Reason:

- recent work has included orbit-style, timeline, and mission-view UX changes
- we want a clean visual checkpoint before any new structural pass touches these surfaces

## Orbit UX Roadmap

### 1. Trail Background Readability

Status:

- partially addressed in working tree

Goals:

- make the full orbit track in `Trail` mode easier to see by default
- preserve the tail/head emphasis
- keep 2D and 3D independently tunable

Current direction:

- slider value should represent the base trail-context brightness
- optimizer should only dim relative to that base

### 2. Brightness Ownership Bug

Problem:

- manual trail-context brightness changes have felt like they get overridden later

Desired behavior:

- slider is the single source of truth for base brightness
- dynamic overlap refinement applies only a relative dimming factor
- stale refinement jobs must not reapply older absolute values

Implementation principle:

- `final opacity = base opacity * overlap factor`

### 3. Dynamic Overlap Refinement Tuning

Problem:

- refinement is helpful, but only about 60% effective in dense clustered orbit regions

Desired behavior:

- lone segments stay relatively bright
- close, repeated, or overlapping segments dim much more aggressively
- dense local clusters should not dominate the scene

Current tuning direction:

- prefer high-percentile local density instead of simple average density
- normalize against a high percentile of chunk densities instead of a single extreme outlier
- use a steeper dimming curve in dense zones
- if needed later, shorten chunk size for more local control

### 4. Trail Controls

Keep:

- separate 2D and 3D context-brightness controls
- separate 2D and 3D tail-prominence controls

Do not change casually:

- semantic tail-length behavior
- authored mission-specific style intervals

### 5. Authoring Strategy

Current intended split:

- authored style interval files for missions where we care about semantic tails
- fixed tail-length fallback for generic missions

Do not bloat the main orbit transport:

- style metadata should remain sidecar data
- main Chebyshev payload should stay focused on orbit transport

## Shelf-Derived Reimplementation Targets

These came from the retired `temp/orbit-ux-shelf-20260328` branch and are still worth considering, but should be reimplemented on current `master` rather than revived from the branch wholesale.

### 1. Re-enable Live Orbit Overlap Refinement

Preserve:
- overlap refinement available in normal runtime instead of a permanent hidden kill-switch
- authored style metadata and precomputed density hints still short-circuit the worker path

Why it matters:
- the roadmap above assumes refinement is part of the intended `Trail` UX, but current runtime still needs the live path re-enabled

### 2. Preserve Base Brightness Ownership

Preserve:
- `2D Track` and `3D Track` sliders as the source of truth for base brightness
- overlap refinement applying only a multiplicative dimming factor over that base

Implementation rule:
- `final opacity = base opacity * overlap factor`

### 3. Use Percentile Density Instead Of Simple Average Density

Preserve:
- dense local orbit clusters dimming more aggressively than isolated arcs
- normalization based on a high percentile rather than a single outlier

Shelf tuning candidates:
- `chunkDensityPercentile = 0.82`
- `normalizationPercentile = 0.94`
- `densityExponent = 1.35`
- `minFactor = 0.16`

### 4. Slightly Brighter Default Trail Context

Candidate defaults to retest with current visuals:
- `2D Track = 0.24`
- `3D Track = 0.14`

### 5. Minimal Chrome Capture Mode

Preserve:
- URL-driven `?minimalChrome=true`
- hides nonessential UI for screenshots, demos, and uncluttered embeds
- remains recoverable rather than destructively changing normal layout

### 6. Relative-Mode Sun Frame Metadata

Preserve:
- explicit metadata for whether relative-mode Sun data is inertial or already relative-frame
- no double application of `FRAME_ROT`

### 7. Relative-Mode Moon Lighting Fallback

Preserve:
- prefer precomputed frame rotation when available
- fall back to Moon ephemeris-derived basis only when relative frame data is absent

### 8. Tone Down Lower Sky Brightness

Candidate direction to retune against current renderer:
- darker lower-sky treatment
- reduced star/constellation opacity
- optional lower-hemisphere shade mesh

### 9. Combined-Mission Surface Cleanup

Already landed:
- combined public mission surfaces for `Chandrayaan 2`, `Chandrayaan 3`, and `GRAIL`
- retirement of standalone `Vikram` and split `GRAIL-A` / `GRAIL-B` app missions

Remaining cleanup, if needed:
- mission briefs/images
- source docs and sourcing playbooks
- timeline/event language
- any explicit handling of retired split-mission slugs

## Notes

- Do not reopen broad structural changes while the visual baseline is uncertain.
- Prefer small structural commits over one large “architecture cleanup” commit.
- Keep multi-craft modeling generic: craft A, B, C, not orbiter/lander assumptions in reusable code.
- Do not preserve shelf-branch HTML/layout/code blindly; preserve the spec intent and reapply it against current runtime structure.
