---
doc_class: plan
status: current
scope: runtime.transition-audit-and-verification
---

# Runtime Transition Audit And Regression Harness

## Purpose

The original CY3 SSIM suite was a characterization safety net for a large
iterative refactor: origin, dimension, camera/view changes and lazy
initialization interacted through shared mutable state. Its replacement must
retain that integration protection, not merely trade image comparisons for
isolated unit tests.

On 2026-09-15 the user requested a current architecture audit in parallel with
the harness improvements. The audit diagnoses current design and behavior;
it does not authorize a broad runtime rewrite. Runtime fixes are separately
scoped from their reproducible findings.

Requirement owners:
[Architecture Boundaries](../../specs/runtime/architecture-boundaries.md),
[Camera State Transitions](../../specs/camera/state-transitions.md),
[Clock Authority](../../specs/time/clock-authority.md), and
[Progressive Disclosure](../../specs/ui/panel-progressive-disclosure.md).

Related work:
[Runtime Architecture Follow-Ups](runtime-architecture-followups.md) and
[CY3 Technical Verification](../../evidence/reviews/cy3-ssim-technical-verification-2026-09-15.md).

Current audit evidence:
[Runtime Transition And Lifecycle Audit](../../evidence/reviews/runtime-transition-audit-2026-09-15.md).
RTA-01 through RTA-03 have executable opt-in desired-contract reproductions in
`npm run test:audit:transitions`. The subsequent user request to continue
authorized the bounded RTA-01/02 implementation; those probes now pass and
their regressions run in the normal unit suite. RTA-03 still fails and remains
runtime work. See [supersession fix evidence](../../evidence/reviews/runtime-transition-supersession-2026-09-15.md).

## Parallel Workstreams

### A. Current-state architecture audit

- Trace state ownership from user intent through planning, loading, renderer
  updates and UI synchronization. Identify competing owners, not just large files.
- Exercise origin/dimension/view transition order, repeated selection and
  cold/warm scene paths; distinguish intentional resets from state leakage.
- Trace lazy initialization, stale async completions, failure/retry,
  resource disposal, listener/RAF ownership and scene reuse.
- Compare code with the existing architecture requirements and September 3
  reconciliation; retain resolved work and promote only evidenced gaps.
- For each finding, record severity, code locations, concrete sequence,
  confirmed versus inferred impact, current test gap and smallest next action.

### B. Transition-focused harness

- Group existing planner/state/camera/lifecycle checks into a fast explicit
  command: `npm run test:transitions:unit`.
- Add independent real-browser scenarios using visible controls, fresh contexts
  and normal Dockview: `npm run test:browser:transitions`.
- Assert both semantic state and the active rendered surface. Merely checking
  the selected radio button or the existence of a canvas is insufficient.
- Keep observation helpers separate from production behavior. No helper may
  reset camera internals or overwrite scene state to force the expected result.
- Make audit findings drive deferred-load and sequence regressions; do not
  assume independent controls commute unless the owning specification says so.
- Capture failed transition state and browser evidence without relying on SSIM.

## Coverage Map And Remaining Obligations

| Concern | Existing protection | Additional protection needed |
| --- | --- | --- |
| Origin switching | Origin transition planner, per-frame ephemeris tests, legacy CY3 captures | Real cold/warm/revisited origin sequences; stale completion cannot publish into another origin |
| Dimension switching | Dimension planner, legacy 2D/3D captures | Real 3D -> 2D -> 3D after origin changes; active render surface and state agree |
| Camera/view switching | Pair policy, camera action tests, mounted-camera tests | Paused UI/controller agreement and order-sensitive plane/free/mounted transitions |
| Lazy initialization | Texture/profile deferred-promise tests, setup tests | Orbit and landing readiness, pending switch/re-entry, failure/retry, disposal during work |
| Scene state | Scene-first state tests and compatibility fallback tests | Explicit ownership and no cross-scene leakage across repeated transitions |
| Playback and layout | Clock/media tests and progressive workspace browser tests | Combined play/seek/pause/switch/resize sequences using absolute mission time |
| Rendering | Existing CY3 SSIM and separate chrome baselines | Small reviewed scene set with pinned inputs; renderer defects remain tracked independently |

The new browser slice is an initial integration check, not exhaustive coverage
of this table. Pure tests use controlled promises/time where appropriate;
real-time responsiveness and asset-ready browser checks remain separate.

## SSIM Migration Rules

1. Preserve current CY3-only SSIM, its profile-level Dockview disable option,
   and existing baselines while the coverage inventory is reconciled.
2. Extract behavioral assertions before retiring redundant screenshot cases.
3. Replace the historical score-decrease gate with a reviewed small scene
   suite after explicit disposition of retained cases. Similarity is not a
   quality score, but visual evidence still protects rendering changes.
4. Track suspicious terrain, craft, lighting or framing differences as named
   rendering/fixture issues, not as an obligation to recreate old pixels.
5. Do not claim replacement coverage is complete until switching, lifecycle
   and loading-order obligations above have executable checks.

## Delivery And Exit Criteria

1. Publish independent audit evidence and rank remediation with the user.
2. Verify the first semantic harness slice and record its limitations.
3. Reproduce priority findings deterministically before any structural fix.
4. Implement and independently review one runtime ownership/lifecycle slice
   at a time, with its regression test already in place.
5. Complete the old-to-new coverage map and reviewed SSIM disposition before
   changing the default test gate or retiring legacy tests.

The detailed human UX review remains deferred until other roadmap work is
finished. This technical audit is not a substitute for that review.
