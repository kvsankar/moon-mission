---
doc_class: plan
status: current
scope: runtime.mode.compare
canonical_for:
  - orbit-comparison-followup-work
---

# Orbit Comparison Follow-Up Plan

The shipped behavior is owned by the
[Orbit Comparison specification](../../specs/modes/orbit-comparison.md), with
runtime structure in
[Orbit Comparison Design](../../designs/modes/orbit-comparison.md).

## Current State

Two-mission comparison, single-anchor time mapping, relative-frame
normalization, interleaved events, and compare display overrides are shipped.

## Deferred Outcomes

1. Add compare-panel shortcuts for `Launch`, `TLI`, `LOI`, `Landing`, and
   `End` alignment choices.
2. Add a `Swap Missions` action.
3. Expand browser-level regression coverage for compare UI surfaces.
4. Polish auxiliary UI that still assumes a single mission.
5. Evaluate precomputing selected comparison transforms for performance.
6. Evaluate comparisons involving more than two missions.
7. Evaluate offline pre-normalized comparison Chebyshev assets.
8. Add full telemetry parity for both missions throughout the UI.
9. Evaluate mission-pair-specific authored alignment scripts.

Each outcome requires a separate implementation plan before coding. The
current plan does not authorize precomputed assets or multi-mission expansion.
