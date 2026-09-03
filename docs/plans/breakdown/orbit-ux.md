# Orbit UX Follow-Ups

Last reviewed: 2026-09-03

Most of the recovered orbit-UX work has landed: percentile density tuning,
base-opacity ownership, brighter context defaults, relative-Sun handling,
lower-sky treatment, and combined multi-craft mission surfaces. The source
roadmap and branch-recovery narrative are preserved in the
[reviewed history](../../archive/plans/orbit-ux-history-2026-09-03.md).

## Remaining Decisions

### Dynamic Overlap Refinement

The live overlap path is still globally disabled. Decide whether to re-enable
it after current visual baselines are trustworthy. If enabled:

- authored style metadata and precomputed density hints short-circuit worker
  refinement;
- 2D and 3D track sliders remain the source of base opacity;
- refinement contributes only a multiplicative overlap factor;
- stale jobs cannot overwrite newer state; and
- focused unit and visual checks cover isolated and dense orbit regions.

### Minimal Chrome

Decide whether to implement `?minimalChrome=true` for screenshots, demos, and
embeds. If accepted, specify exactly which controls remain, preserve a way to
recover the normal interface, and add route-level browser coverage.

## Completion Gate

Archive this plan after both decisions are implemented or explicitly rejected.
Do not revive the retired shelf branch wholesale.
