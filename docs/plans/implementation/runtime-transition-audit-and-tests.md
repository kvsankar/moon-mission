---
doc_class: plan
status: complete
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
their regressions run in the normal unit suite. Subsequent approved work fixed
RTA-03/04/05 as well: [recovery and readiness evidence](../../evidence/reviews/runtime-recovery-and-readiness-2026-09-15.md).
All three original audit probes now pass. RTA-06 and the runtime state-remediation
campaign are complete. The old-to-new baseline inventory, plane-control browser
regression, focused nine-frame harness and legacy-gate removal are complete. See
[CY3 SSIM Coverage Disposition](../../evidence/reviews/cy3-ssim-coverage-disposition-2026-09-17.md)
and [supersession evidence](../../evidence/reviews/runtime-transition-supersession-2026-09-15.md).

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

## Final Coverage Map

| Concern | Unit/domain protection | Delivered integration protection |
| --- | --- | --- |
| Origin switching | Origin planner, per-frame ephemeris and request-ownership tests | Cold Moon, warm Earth roundtrip plus held-request Retry/origin supersession |
| Dimension switching | Dimension planner and stale plane-completion tests | Real 3D -> 2D -> 3D across cold/warm Earth and Moon scenes with exclusive active surfaces |
| Camera/view switching | Pair policy, action, intent and mounted-camera tests | Paused UI/controller agreement plus visible plane/free/mounted controls |
| Lazy initialization | Texture/profile, setup, curve, model and catalog ownership tests | Orbit/config/media failure/Retry, late landing readiness, disposal and viewport-superseded activation |
| Scene state | Scene-first state and compatibility-adapter tests | Active-origin-only mirrors, repeated transitions and scene identity checks |
| Playback and layout | Clock/media and workspace-domain tests | Restart publication ordering, resize/reload continuity and progressive disclosure browser checks |
| Rendering | Renderer/unit tests and separate chrome baselines | Nine reviewed CY3 scene frames with direct thresholds; landing close-up remains a named deferred rendering concern |

Pure tests use controlled promises/time where appropriate; real-time
responsiveness, asset-ready browser checks and the focused CY3 visual gate stay
separate so one layer does not masquerade as another.

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

The coverage map in item 5 is executable and complete for all 86 historical
scene baselines: nine retain, 76 replace with named semantic evidence, and one
retire as an exact duplicate. The default visual workflow now registers only
the nine retained cases, all nine pass direct thresholds, obsolete PNGs are
removed, and the historical score-decrease gate and score-history file are
retired. The remaining code-hygiene task is pruning skipped legacy test bodies;
it does not affect gate behavior.

This plan is complete. Optional cleanup—pruning skipped legacy bodies and
replacing expensive full-run captures with a deterministic terminal fixture—is
tracked in the roadmap and must preserve the nine reviewed rendering concerns.
The detailed human UX review remains deferred until other roadmap work is
finished; this technical audit is not a substitute for that review.
