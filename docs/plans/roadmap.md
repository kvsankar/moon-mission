# Moon Mission Roadmap

Last reviewed: 2026-09-18

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

The latest resumable status summary is
[Current Work Context Checkpoint](../evidence/handoffs/current-context-2026-09-18.md).
It records state but does not own priority.

## Completed Foundations

### 1. Audit runtime state ownership and remediate sequentially

On 2026-09-16 the user expanded RTA-06 into an audit of all state-related
problem areas, followed by one-at-a-time remediation. Survey session/view,
camera, clock/media, loading/cache/resource lifetime, panels/mobile/persistence,
comparison and compatibility mirrors. Separate reproduced defects from design
risks; do not equate every mutable object or derived UI value with a defect.

The [state audit](../evidence/reviews/runtime-state-audit-2026-09-16.md) records
the inventory, evidence and review limits. The campaign prioritized confirmed
stale-publication and cross-session contamination before broad ownership cleanup.
RTA-01 through RTA-06 are complete and remain protected by regression coverage.

SA-01 is complete: configuration initialization is guarded against superseding
startup, origin/dimension revisions and scene replacement, with explicit
outcomes, shared loading and bounded latest-view handoff. SA-02 retired-media
ownership is also complete; [TDD/review evidence](../evidence/reviews/runtime-state-remediation-2026-09-16.md).
SA-07 terminal media disposal and SA-03/RTA-06 camera intent/retry ownership
are complete, along with SA-04 annotation restoration and SA-05 owned curve
construction/cancellation. SA-06 texture handoff, SA-17 shared resource ownership
and SA-18 terminal scene disposal are complete, including real receiver cleanup.
SA-09 playback restart publication and SA-10 mobile FoV ownership are complete.
SA-15 required comparison error/Retry is complete, including review-driven
metadata validation. SA-08 media-manifest recovery and SA-13 hidden-panel keyboard
ownership are complete. SA-21 workspace initialization/lifecycle and SA-12 Reset
View selection and SA-11 explicit constrained-layout edit persistence are
complete. SA-14 detached-window geometry/lifecycle is complete. SA-20 detached
panel-registry snapshots and SA-16 scene compatibility mirrors are complete.
SA-19 late model/catalog ownership is complete, with orbit refinement explicitly
kept disabled. SA-22 live viewport capability bootstrap is complete. The runtime
state-remediation queue is complete. The scoped plan and remediation evidence
preserve the delivery order, failing regressions, review corrections and final
verification. This section is completion context, not active work.

Owner: [Runtime Architecture Follow-Ups](implementation/runtime-architecture-followups.md).

### 2. Transition coverage and legacy SSIM gate

Integration protection was preserved by mapping old screenshots to semantic
transition, controlled loading-order and selected rendering checks. The focused
CY3 scene set and direct thresholds now replace the redundant screenshots and
historical score-decrease gate. Detailed human UX review remains deferred.

The 86-baseline CY3 disposition is complete and executable: nine retained
visual checks, 76 replacements with named semantic evidence, and one exact
duplicate retired. The first identified integration gap is also closed:
all plane presets now run through visible progressive controls in the normal
Dockview browser transition suite. The focused gate passes all nine direct
thresholds; obsolete PNGs, score history and the historical score-decrease gate
are removed. Skipped legacy test-body pruning is cleanup, not a gate blocker.

Evidence:
[CY3 SSIM Coverage Disposition](../evidence/reviews/cy3-ssim-coverage-disposition-2026-09-17.md).

Owner: [Runtime Transition Audit And Regression Harness](implementation/runtime-transition-audit-and-tests.md).

## Current Priority

### 1. Reconcile the full unit coverage gate

The Vitest 4 migration reproduced the coverage failure before changing versions.
At that checkpoint, v4 reported lines 51.35%, statements 50.09%, branches
47.35% and functions 54.80% against unchanged gates of 87%, 87%, 82% and 50%.
The v4 AST remapper changed denominators, so do not compare its percentages to
v3 as if they were like-for-like execution measurements.

Run a fresh report at current `master`, preserve loaded-files-only scope,
exclusions and thresholds, then inventory the largest uncovered active modules.
Add behavior-driven tests in bounded slices; do not lower thresholds, exclude
active code, or add coverage-only assertions. Evidence and reproduction:
[Vitest 4 Migration](../evidence/reviews/vitest4-migration-2026-09-16.md).

Current-`master` reconciliation is underway. The fresh baseline is 55.01%
lines, 53.79% statements, 50.02% branches and 58.12% functions. The first
bounded slice extracted and behaviorally covered Frame and Shoot flyby-event
resolution; the resulting gate is 55.17% lines, 53.94% statements, 50.25%
branches and 58.21% functions. Thresholds and exclusions remain unchanged.
Evidence: [Unit Coverage Reconciliation](../evidence/reviews/unit-coverage-reconciliation-2026-09-18.md).

A test-only expansion then raised the gate to 74.99% lines, 72.96% statements,
62.74% branches and 71.23% functions across 2,987 passing tests, without
touching product code. The functions gate now passes; lines, statements and
branches do not. Evidence:
[Unit Coverage Expansion](../evidence/reviews/unit-coverage-expansion-2026-09-18.md).

Continue with bounded behavior/refactoring slices chosen from the largest
active gaps, now led by the auxiliary camera manager, the media browser panel,
the splashdown ground-track panel and the Dockview host. Two follow-ups are
now explicit:

- Decide whether the long render and DOM-construction methods in those files
  are extracted, because the remaining lines are otherwise reachable only by
  driving a near-complete scene and panel graph.
- Dispose of the hotfix kill switches (`ORBIT_OVERLAP_REFINEMENT_ENABLED`,
  craft body halos, craft edge locators). Code behind a permanently off flag
  cannot be covered and should be retired or re-enabled deliberately rather
  than counted against the gate.

### 2. Harden combined browser startup diagnostics

Cold Vite dependency optimization previously reloaded a page and invalidated a
retained transition-scene handle. Progressive-workspace checks also
intermittently timed out waiting for eight panels, although isolated reruns
passed. The focused CY3 visual gate now uses application readiness instead of
`networkidle`, but the combined transition/progressive failure has not been
deterministically reproduced or closed. Preserve assertions and diagnose
ownership/readiness; do not hide the issue with retries or longer waits.

### 3. Review the recovery baseline

Review the frozen recovery roadmap by workstream. For every proposed action,
record one disposition:

- promote into this roadmap or a scoped plan;
- promote a behavior decision into a specification;
- retain as evidence/recovery material;
- mark superseded with proof; or
- reject explicitly.

Do not copy the audit inventory wholesale into the mutable queue.

## Recently Completed

- Test-only unit coverage expansion added 29 test files and a minimal DOM test
  double, raising lines from 55.17% to 74.99% with no product-code change:
  [expansion evidence](../evidence/reviews/unit-coverage-expansion-2026-09-18.md).

- The three behaviours that expansion recorded were then investigated and
  dispositioned: per-view retention of the lunar feature mode flags and the
  sky-time control precedence were confirmed defects and fixed; the
  percentage-rounding residual was shown unreachable and left alone:
  [defect investigation](../evidence/reviews/lunar-mode-and-sky-time-defects-2026-09-18.md).

- Documentation consistency pass closed stale active-plan and handoff wording,
  added a resumable current-context checkpoint, and verified all local links in
  128 active Markdown files:
  [review evidence](../evidence/reviews/documentation-consistency-2026-09-18.md).

- State audit inventory and SA-01 configuration publication ownership:
  [audit and verification](../evidence/reviews/runtime-state-audit-2026-09-16.md).

- Vitest/coverage/mocker migration to exact 4.1.11, with isolated sequential
  execution and constructor-compatible test fixtures. The repository npm audit
  now reports zero vulnerabilities; this does not audit vendored/CDN copies or
  mean production has changed. [Migration evidence](../evidence/reviews/vitest4-migration-2026-09-16.md).

- Compatible development-only brace-expansion/fflate patches:
  [transitive update evidence](../evidence/reviews/transitive-dependency-updates-2026-09-16.md).

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
  suite is now a nine-frame direct-threshold gate. Historical behavior is mapped
  to semantic tests; obsolete baselines and score history are removed.

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

### CY3 landing close-up rendering/fixture review

The SSIM disposition run exposed severe displaced-terrain/framing artifacts in
the current landing close-up. The obsolete image was not rebaselined and is not
part of the focused gate. Landing geometry, readiness and visibility remain
semantically covered. Diagnose the renderer/fixture during or immediately
before the detailed human UX review; do not restore the old pixels or lower a
threshold to close it.

Maintenance after the coverage work may also prune the 44 skipped legacy test
bodies still present in `test/ui.test.js` and replace four expensive natural
full-run captures with a deterministic terminal-state fixture, provided the
nine retained rendering concerns remain protected.

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
