# Moon Mission Roadmap

Last reviewed: 2026-09-03

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

### 1. Resolve panel runtime regressions

Reproduce and resolve the auxiliary-stack spacing and Frame and Shoot
resize-grip failures captured during specification review.

Owner:
[Panel Runtime Regressions](implementation/panel-runtime-regressions.md)

Source evidence:
[Feature Specification Migration Review](../evidence/reviews/documentation-migration-feature-specifications-2026-09-02.md)

### 2. Review the recovery baseline

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
