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

### 1. Coordinate remaining dependency remediation

The same-major toolchain slice is complete: Vite 7.3.6, Vitest/coverage 3.2.7,
loopback-only serving with wildcard CORS disabled, and generated-report watcher
isolation. See [update evidence](../evidence/reviews/dependency-updates-2026-09-15.md).
The coordinated Swiper slice is also complete at exact version 12.2.0 across
npm and authored CDN JavaScript/CSS, with bundle parity and native carousel
gesture/lifecycle checks: [Swiper evidence](../evidence/reviews/swiper-upgrade-2026-09-15.md).
The unused repository MCP dependency and launcher have now been removed after
usage review, eliminating 82 development-only packages while preserving the
direct Playwright/browser versions: [removal evidence](../evidence/reviews/mcp-dependency-removal-2026-09-15.md).
The fresh repository audit reports five affected entries (one high, four
moderate, zero critical). Production remains unchanged until the user explicitly
authorizes deployment.

Next, resolve compatible brace-expansion/fflate transitive updates and handle
the major Vitest/coverage/mocker migration as a separate tested slice. Do not
apply blind audit-fix upgrades or reinstall unused MCP tooling.

Evidence and version candidates:
[Dependency Advisory Triage](../evidence/reviews/dependency-triage-2026-09-15.md).
Brace-expansion, fflate and Vitest/mocker advisories remain. This is not a clean
security audit; the live site's Swiper remains pending explicit deployment.

### 2. Reduce camera-state ownership ambiguity (RTA-06)

With RTA-01 through RTA-05 corrected, move semantic camera state toward
a narrow authoritative state port, with DOM controls as projections. Define a
bounded design slice; do not launch another broad refactor.

Owner: [Runtime Architecture Follow-Ups](implementation/runtime-architecture-followups.md).

### 3. Complete transition coverage and disposition the legacy SSIM gate

Preserve integration protection while mapping old tests to semantic transition,
controlled loading-order and selected rendering checks. Keep a small reviewed
CY3 scene set; retire redundant screenshots and the historical score-decrease
gate only after the coverage disposition. This migration does not block the
reliability fixes above. Detailed human UX review remains deferred.

Owner: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).


### 4. Review the recovery baseline

Review the frozen recovery roadmap by workstream. For every proposed action,
record one disposition:

- promote into this roadmap or a scoped plan;
- promote a behavior decision into a specification;
- retain as evidence/recovery material;
- mark superseded with proof; or
- reject explicitly.

Do not copy the audit inventory wholesale into the mutable queue.

## Recently Completed

- Removed unused repository MCP tooling and its exclusive dependency chain:
  [MCP removal evidence](../evidence/reviews/mcp-dependency-removal-2026-09-15.md).

- Coordinated Swiper security update and carousel compatibility fixes:
  [Swiper upgrade evidence](../evidence/reviews/swiper-upgrade-2026-09-15.md).

- Same-major Vite/Vitest updates and local development-server hardening:
  [dependency update evidence](../evidence/reviews/dependency-updates-2026-09-15.md).

- The roadmap was updated before implementation, then reviewed UI/harness and
  RTA-01/02 work was checkpointed in `5e5edd0`.
- RTA-01/02 stale-completion safeguards are implemented and independently
  reviewed: [supersession evidence](../evidence/reviews/runtime-transition-supersession-2026-09-15.md).
- RTA-04 load-failure/Retry recovery, RTA-05 late landing-data readiness and
  RTA-03 camera orientation are implemented and independently reviewed:
  [recovery/readiness evidence](../evidence/reviews/runtime-recovery-and-readiness-2026-09-15.md).
  The camera fix has its own commit, `5020625`.
- Design tokens, progressive disclosure and UI review fixes retain the scene
  and playback priority: [progressive UX evidence](../evidence/reviews/progressive-workspace-ux-2026-09-15.md).
  The user accepted the UI for now; the later human review remains deferred.
- CY3-only SSIM has a configuration-level Dockview disable option. Its historical
  rendering/fixture differences remain tracked under coverage migration above;
  no baselines were replaced to close the runtime fixes.

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
