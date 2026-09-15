# Moon Mission Roadmap

Last reviewed: 2026-09-15

## Authority

This is the single mutable repository-wide queue. It owns priority and routes
work into scoped breakdown or implementation plans. Detailed requirements and
architecture remain owned by specifications and designs.

The immutable
[`current-status-roadmap.md`](../operations/current-status-roadmap.md) remains
the September 2026 recovery baseline. It is not edited or used as the mutable
planning surface. Findings from that baseline enter this roadmap only after
explicit review and disposition.

The preserved May planning snapshot is
[`current-plan-2026-05-19.md`](../archive/status/current-plan-2026-05-19.md).

## Current Priority

### 1. Recover from load failures and support retry (RTA-04)

Status: next implementation, approved by the user on 2026-09-15.
Before starting, checkpoint the reviewed UI/harness and RTA-01/02 work.

Replace success-only startup polling with explicit ready, failed and
superseded outcomes. A failed request must leave the user with an understandable
error and a usable Retry action, not a permanently blocking spinner. Verify
failure -> retry -> success, repeated retry, and switching origins during retry
without duplicate initialization or stale errors.

Implementation detail: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).
Finding: [RTA-04](../evidence/reviews/runtime-transition-audit-2026-09-15.md#rta-04--failure-has-no-terminal-readiness-state).

#### Parallel: dependency-advisory triage

`npm install` reported 18 advisories, including three critical. Determine
affected packages, production versus development exposure, reachability and
available safe upgrades. Promote urgent reachable issues ahead of the queue
when evidence warrants it. Do not apply blind or breaking audit-fix upgrades.

### 2. Make landing geometry independent of load order (RTA-05)

Represent landing-data/geometry readiness explicitly. Test orbit-first and
landing-first completion, failure and superseded loads. A cold visit must not
silently omit descent geometry that appears only on a warm visit.

Owner: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).

### 3. Correct Free-camera orientation reset (RTA-03)

Preserve the selected plane's canonical orientation during ordinary Free reset,
while retaining the separately specified follow-release behavior. Promote the
existing failing reproduction into regression coverage for both action orders
across plane presets.

Owner: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).

### 4. Reduce camera-state ownership ambiguity (RTA-06)

After the concrete defects above are covered, move semantic camera state toward
a narrow authoritative state port, with DOM controls as projections. Define a
bounded design slice; do not launch another broad refactor.

Owner: [Runtime Architecture Follow-Ups](implementation/runtime-architecture-followups.md).

### 5. Complete transition coverage and disposition the legacy SSIM gate

Preserve integration protection while mapping old tests to semantic transition,
controlled loading-order and selected rendering checks. Keep a small reviewed
CY3 scene set; retire redundant screenshots and the historical score-decrease
gate only after the coverage disposition. This migration does not block the
reliability fixes above. Detailed human UX review remains deferred.

Owner: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).

### Completed foundation and retained evidence

The user requested these workstreams in parallel on 2026-09-15. The original
SSIM suite protected interactions between origin, dimension, view and lazy
initialization during the monolith refactor; that protection must survive
harness modernization.

Owner: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).
Current audit: [Transition And Lifecycle Findings](../evidence/reviews/runtime-transition-audit-2026-09-15.md).

The first audit confirms stale origin/readiness publication, stale dimension
effects and order-sensitive camera reset, with executable reproductions.
RTA-01/02 stale-completion protection is now implemented and independently
reviewed: [supersession fix evidence](../evidence/reviews/runtime-transition-supersession-2026-09-15.md).
Camera orientation, failure/retry and late landing geometry still need scoped
remediation; camera state ownership remains a design gap. Continue adding
sequence/loading-order regressions before fixing these narrow owners; do not begin a broad refactor or remove
legacy coverage merely to make a test gate green.

The semantic browser harness and fast unit group are the first migration slice,
not full replacement coverage. Complete the old-to-new coverage map and
disposition of rendering differences before retiring the historical SSIM gate.

UI verification precursor:

The spacing and resize-grip assertions have been reconciled with legacy and
Dockview layout ownership. Focused coverage passes; no panel runtime fix was
needed for those original assertions. The accompanying visual pass simplifies
the existing structure through shared design tokens. Independent review found
and cleared compact-control keyboard access, constrained-reload persistence,
and corrupt-layout recovery issues. CY3's SSIM profile now explicitly disables
Dockview; Artemis mobile coverage is functional and separate. The full CY3
scene suite is still not green: remaining rendering/baseline differences need
disposition before closure. Baselines have not been overwritten.

Current evidence:
[Visual Design And Panel Regression Review](../evidence/reviews/visual-design-tokens-2026-09-15.md)

Follow-up: [CY3 SSIM And Technical Verification](../evidence/reviews/cy3-ssim-technical-verification-2026-09-15.md).

The accompanying [Progressive Workspace UX](implementation/progressive-workspace-ux.md)
is implemented: width and height progressively reduce simultaneous tools,
compact Frame and Shoot controls use bounded disclosures, and resizing restores
the expanded layout without treating hidden panels as closed. See
[progressive UX evidence](../evidence/reviews/progressive-workspace-ux-2026-09-15.md).

The user reviewed the UI on 2026-09-15 and accepted it for now. A detailed
human UX review is explicitly deferred until the other roadmap items are
finished; see the deferred backlog below. That review does not block continuing
the other work. Technical verification and the existing scene-baseline issue
feed the paired audit/harness plan above.

UI precursor owner:
[Panel Runtime Regressions](implementation/panel-runtime-regressions.md)

Source evidence:
[Feature Specification Migration Review](../evidence/reviews/documentation-migration-feature-specifications-2026-09-02.md)

### 6. Review the recovery baseline

Review the frozen recovery roadmap by workstream. For every proposed action,
record one disposition:

- promote into this roadmap or a scoped plan;
- promote a behavior decision into a specification;
- retain as evidence/recovery material;
- mark superseded with proof; or
- reject explicitly.

Do not copy the audit inventory wholesale into the mutable queue.

## Reviewed Scoped Plans

These plans have been reconciled against current code and documentation. They
own delivery decomposition for their stated workstreams while this roadmap
owns cross-repository priority.

| Workstream | Scoped plan | Current planning action |
| --- | --- | --- |
| Artemis II media, streams, transcripts, attribution, and launch | [Artemis II Media](breakdown/artemis2-media.md) | Fix stream/deployment failures, complete sync mapping, search UX, attribution, and launch work. |
| Mission Media timeline and browser | [Artemis II Media Timeline](breakdown/artemis2-media-timeline.md) | Close marker selection reliability and decide the horizontal scroller. |
| Performance and responsiveness | [Performance](breakdown/performance.md) | Measure current runtime, coalesce remaining work, and harden the benchmark. |
| Runtime style and accessibility | [Runtime Style And Accessibility](breakdown/runtime-style-and-accessibility.md) | Reconcile open review findings and promote accepted requirements. |
| Orbit-first timeline | [Orbit-First Timeline](breakdown/orbit-first-timeline.md) | Add phase/data bands, geometry moments, explanatory details, and coverage. |
| Orbit UX | [Orbit UX](breakdown/orbit-ux.md) | Decide dynamic overlap refinement and minimal-chrome behavior. |
| Main-view Photo Mode | [Main View Photo Mode](breakdown/main-view-photo-mode.md) | Decide camera semantics, define shared state, and deliver the control surface. |
| Real-size craft follow | [Real-Size Craft Follow](breakdown/real-size-craft-follow.md) | Specify and implement a current craft-inspection mode. |
| Panel system | [Panel System V1 Follow-Ups](implementation/panel-system-v1-followups.md) | Define and deliver user-created view identity and persistence. |
| Dockview | [Dockview Follow-Ups](implementation/dockview-followups.md) | Reconcile defaults, verify rollout, and decide fallback retirement. |
| Artemis II real-time experience | [Artemis II Real-Time Experience](breakdown/artemis-real-time-experience.md) | Complete the remaining event-driven, countdown, and live-mission outcomes. |
| Mobile experience | [Mobile Experience Follow-Ups](implementation/mobile-experience-followups.md) | Complete the remaining mobile shell, interaction, and verification outcomes. |
| Orbit milestones | [Orbit Milestones](implementation/orbit-milestones.md) | Complete marker sizing, panel-local enablement, label density, and interaction work. |
| Orion model | [Orion Model Follow-Ups](implementation/orion-model-followups.md) | Complete the remaining model-quality and runtime-integration outcomes. |
| Runtime architecture | [Runtime Architecture Follow-Ups](implementation/runtime-architecture-followups.md) | Complete the remaining boundary and composition work. |

## Reviewed Current Plans

These plans were created or reviewed during the documentation migration and
can be used directly:

- [Orbit Comparison Follow-Up Plan](breakdown/orbit-comparison.md)
- [Time Synchronization Decision Plan](breakdown/time-synchronization.md)

## Pending Recovery Intake

The frozen baseline records milestone, RA/Dec, deployment, branch, stash,
archive, and dangling-object concerns. These categories identify the scope of
the pending review; they are not yet ordered or promoted into the mutable
roadmap. Establish a clean implementation base only after their individual
dispositions are approved.

## Deployment Follow-Up

- Generate the nginx legacy-mission slug map from `assets/mission-catalog.json`
  during deployment so the production allowlist is not maintained separately.

## Deferred Backlog

### Detailed human UX review — after the other roadmap items

Status: deferred by the user on 2026-09-15. Schedule after the other current
roadmap items are finished, using the integrated app as it exists then.

Owner: [Human UX Review Plan](breakdown/human-ux-review-plan.md).

Review end-to-end workflows, progressive disclosure across window and panel
sizes, discoverability, visual hierarchy, keyboard/touch accessibility,
mission-time and scientific clarity, and perceived responsiveness. Produce a
human-authored findings report and triage follow-up work into the roadmap.
This is a later product review, not an active delivery prerequisite.

## Queue Rules

1. Only this file owns repository-wide priority.
2. A scoped plan owns delivery decomposition, not cross-repository priority.
3. A plan links to specifications and designs; it does not restate their
   requirements.
4. A moved historical checklist remains review-required until checked against
   implementation and evidence.
5. Completed work leaves the active queue and retains traceability in Git,
   evidence, or archive records.
6. New work from the frozen recovery baseline requires explicit promotion.
7. Every implementation unit follows: refactor or implement, independent
   review, fixes, re-verification, and review evidence.

## Verification Gate

Each promoted implementation plan defines its own checks. At repository level,
do not close a delivery unit without:

- focused tests for the changed behavior;
- broader tests proportional to blast radius;
- link and metadata checks for documentation changes;
- visual review for intentional UI changes; and
- explicit confirmation that unrelated dirty work was not staged.
