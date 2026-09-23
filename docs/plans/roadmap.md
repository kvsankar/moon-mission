# Moon Mission Roadmap

Last reviewed: 2026-09-23

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

A second test-only pass raised it again to 79.08% lines, 76.92% statements,
66.06% branches and 76.37% functions across 3,530 passing tests in 288 files,
covering the camera controller, the star field, both sky renderers, the mobile
far-side overlay, both splashdown ground-track surfaces, the media browser
render path, and the settings and spacecraft action factories. Evidence:
[Unit Coverage Expansion, Round Two](../evidence/reviews/unit-coverage-expansion-round-two-2026-09-18.md).

A third, branch-first pass then raised it to 80.66% lines, 78.55%
statements, 68.32% branches and 77.52% functions across 3,820 passing tests
in 297 files, by targeting the modules carrying far more uncovered branches
than lines across nine slices. Evidence:
[Branch-First Pass](../evidence/reviews/unit-coverage-branch-first-2026-09-19.md).

Continue with bounded behavior/refactoring slices chosen from the largest
active gaps. Branches remain the gate furthest from target (68.32% against
82%, a 4,708-arm shortfall), so keep choosing by uncovered branches:
`media-browser-panel.js`, `ground-track-panel.js`,
`media-timeline-coordination.js` and `background-media-panel.js` are next.
Drop `lunar-crater-control-panel.js` below those despite its branch count;
the last pass showed its remaining arms are spread too thinly across
generated rows to repay a slice. At the September 19 snapshot, both line
gates were reachable without changing `auxiliary-camera-views.js`: 2,593
lines were needed for 87% and 5,975 were uncovered elsewhere. Recalculate
these figures after the structural split. Two follow-ups remain explicit:

- Re-measure coverage after the auxiliary-camera extraction. Its former
  3,300-line `createPanel` method has been split, so the September 19
  per-file uncovered-line estimate is no longer a current prioritization
  input. Choose further tests from a fresh branch report and real behavior.
- Dispose of the hotfix kill switches (`ORBIT_OVERLAP_REFINEMENT_ENABLED`,
  craft body halos, craft edge locators, and `resolveEffectiveOrbitStyle`,
  which ignores its argument and always returns `"classic"`). Code behind a
  permanently off flag cannot be covered and should be retired or re-enabled
  deliberately rather than counted against the gate.

### 2. Harden combined browser startup diagnostics

Cold Vite dependency optimization previously reloaded a page and invalidated a
retained transition-scene handle. Progressive-workspace checks also
intermittently timed out waiting for eight panels, although isolated reruns
passed. The focused CY3 visual gate now uses application readiness instead of
`networkidle`, but the combined transition/progressive failure has not been
deterministically reproduced or closed. Preserve assertions and diagnose
ownership/readiness; do not hide the issue with retries or longer waits.

### 3. Reduce structural debt without regrowing it

The [September 23 structure review](../evidence/reviews/source-structure-architecture-review-2026-09-23.md)
found 17 production and nine test files over 1,000 lines. A source-size
ratchet, ES module syntax check, core import boundary check and import-cycle
check now run through the staged pre-commit hook and/or CI. The guard is
preventive; it does not close the architectural findings below.

Deliver bounded slices through
[Runtime Architecture Follow-Ups](implementation/runtime-architecture-followups.md):

The first [panel construction ownership slice](implementation/auxiliary-camera-panel-ownership.md)
is complete: the 969-line factory became a 324-line coordinator plus 533-line
initial-state and 213-line render-surface owners. Its largest piece is 45%
smaller; the broader auxiliary state and shell-boundary work remains open.
The [media manifest schema slice](implementation/media-manifest-normalization-ownership.md)
is also complete: its 1,017-line mixed-schema normalizer became a 68-line
assembler and separate field, Artemis and stream owners; the largest piece is
554 lines (45.5% smaller). Media playback coordination remains open.
The [lunar crater planning slice](implementation/lunar-crater-planning-ownership.md)
is complete: the 1,048-line module became projection, labels, common math and
catalog owners; the largest piece is 482 lines (54.0% smaller).
The [view-settings pill slice](implementation/view-settings-pill-ownership.md)
is complete: the 1,282-line controller now composes Moon Render and annotation
panel owners; its largest piece is 754 lines (41.2% smaller).
The [animation-scene effect slice](implementation/animation-scene-effect-ownership.md)
is complete: mobile framing, visual aids and shared Earth/Moon relative-frame
rotation moved out of the 1,008-line compatibility class; the largest piece
is 624 lines (38.1% smaller).
The [view-settings test-fixture slice](implementation/view-settings-pill-test-fixture.md)
is complete: fake controls moved out of the 1,038-line behavior test; the
largest piece is 552 lines (46.8% smaller).
The [auxiliary manager test slice](implementation/auxiliary-camera-manager-test-ownership.md)
is complete: panel lifecycle and camera geometry assertions now share a
50-line harness across two focused files; the largest piece is 613 lines,
49.2% smaller than the original 1,207.
The [auxiliary views test slice](implementation/auxiliary-camera-views-test-ownership.md)
is complete: interaction, timeline, scene-rendering and panel infrastructure
contracts are separate; the largest piece is 943 lines, 65.2% smaller than
the original 2,709, with all 94 assertions preserved.
The [auxiliary browser test slice](implementation/auxiliary-panel-browser-test-ownership.md)
is complete: resize behavior and Mission Media geometry now have separate
browser suites and a shared launcher; the largest piece is 588 lines, 43.1%
smaller, with all ten cases passing.
The [Dockview workspace slice](implementation/dockview-workspace-ownership.md)
separates shell persistence, controls, default layout, panel renderers and
startup lifetime. The largest owner is 775 lines, 57.7% smaller than the
original 1,832; focused and full unit suites, static build and ten real-route
browser cases pass.
The [background media test slice](implementation/background-media-test-ownership.md)
separates playback policy, captions/transcript, and panel geometry/lifetime
around one fake DOM harness. The largest piece is 794 lines, 55.0% smaller
than the original 1,766; all 27 assertions pass.
The [media browser test slice](implementation/media-browser-panel-test-ownership.md)
separates timeline/player intents and thumbnail behavior around one fake DOM
harness. The largest piece is 523 lines, 52.0% smaller than the original
1,090; all 18 assertions pass.
The [timeline dock test slice](implementation/timeline-dock-test-ownership.md)
separates readout/scale, pointer seeking, and event/media markers around one
fake element. The largest piece is 706 lines, 62.0% smaller than the original
1,860; all 22 assertions pass.
The [media timeline test slice](implementation/media-timeline-test-ownership.md)
separates manifest/stream publication, selection, browsing, audio, video,
clock authority and recovery. The largest piece is 964 lines, 80.0% smaller
than the original 4,807; all 61 assertions pass.
The [background media production slice](implementation/background-media-panel-ownership.md)
separates video/HLS transport, captions, transcript presentation, geometry,
policy and DOM helpers from panel orchestration. The largest piece is 940
lines, 59.6% smaller than the original 2,329; focused and real-route media
handoff tests, static build and structure check pass.
The [star catalog data-placement slice](implementation/star-catalog-data-placement.md)
keeps synchronous JS facades while placing generated records in bounded
JSON shards. The largest pieces are 852 and 802 lines respectively, with
pre/post content hashes matching exactly; unit, build and real-route browser
verification pass.
The [CY3 visual gate slice](implementation/cy3-visual-gate-ownership.md)
removes skipped legacy test bodies already replaced by reviewed semantic
coverage, and separates screenshot, configuration, control and profile
helpers. The largest piece is 804 lines, 81.2% smaller than the original
4,284; all nine retained cases are still registered, and a full browser gate
passes at unchanged thresholds. One earlier full run captured a wrong
relative-frame image (0.845 SSIM) while isolated/sequence reruns passed
(0.999); investigate state/readiness rather than adding retries or changing
the baseline.
The [Moon renderer slice](implementation/moon-renderer-ownership.md)
separates Physical material/shader construction from selenographic overlay
geometry while retaining the renderer's public texture and visibility owner.
The largest piece is 966 lines, 48.6% smaller than the original 1,878;
focused/full unit, static build, structure and eight Moon-loading browser
cases pass.
The [lunar crater controls slice](implementation/lunar-crater-controls-ownership.md)
separates catalog/filter policy, DOM rendering and element construction from
the public control facade, with an explicit async catalog-publication port.
The largest piece is 868 lines, 63.4% smaller than the original 2,371;
focused/full unit, static build, structure and real-route panel/catalog checks
pass.
The [media browser panel slice](implementation/media-browser-panel-ownership.md)
separates thumbnail layout/rendering, image gestures, HLS source lifetime,
filters, panel geometry and event effects from the public facade. The largest
piece is 971 lines, 73.7% smaller than the original 3,696; focused tests pass,
and full unit, static build, structure and four real-route media cases pass.
The [lunar crater effects slice](implementation/lunar-crater-effects-ownership.md)
separates ring/label primitives, hit testing, scene annotation lifetime and
hover from the action facade. The largest piece is 840 lines, 68.2% smaller
than the original 2,639; focused/full unit, static build, structure and
real-route Lunar Features checks pass.
The [ground-track panel slice](implementation/ground-track-panel-ownership.md)
separates track math, Chebyshev source/cache, map/globe resources, timeline
presentation and panel geometry from the action facade. The largest piece
is 908 lines, 65.4% smaller than the original 2,627; focused tests pass,
and full unit, static build, structure and real-route globe-mount checks pass.
The [timeline dock slice](implementation/timeline-dock-ownership.md)
separates time/signature math, marker/hover preview lifetime and pointer
seek/drag state from range/view orchestration. The largest piece is 949
lines, 48.2% smaller than the original 1,833; focused tests pass, with
full unit, static build, structure and a real-route timeline seek passing.
The [landing entry slice](implementation/landing-entry-ownership.md)
separates catalog/timing, authored brief, orbit data/math and DOM view owners
behind an ES module entry. The largest piece is 732 lines, 80.6% smaller
than the original 3,782; compare, table, timeline, brief and orbit-preview
browser checks pass, along with full unit, static build and structure checks.
The [mission entry slice](implementation/mission-entry-ownership.md)
separates initial view hydration, identity, timeline caching, state/render
bootstrap, view commands and workspace lifetime from the composition root.
The largest piece is 697 lines, 30.7% smaller than the original 1,006;
focused/full unit, static build, structure and two real-route startup and
terminal cleanup checks pass.
The [media timeline coordination slice](implementation/media-timeline-coordination-ownership.md)
separates selection/seek intent, playback clock and transport lifetime,
manifest publication, duration probing and view projection from the public
coordinator. The largest piece is 973 lines, 73.1% smaller than the original
3,618; 131 focused tests, full unit, structure, static build and Artemis II
foreground/broadcast browser handoff pass. The oversized-file baseline is now
empty; all 845 checked authored files are within the 1,000-line cap.

1. Replace the auxiliary-camera prototype mixins and broad shared/dependency
   hubs with named owners and narrower state/effect interfaces. Place DOM and
   rendering effects at the shell boundary. Keep the existing public API and
   verify panel construction, rendering, detached windows and disposal in
   each slice.
2. Remove the known `core/domain/active-event-ui-state.js` to
   `app/burn-event-metadata.js` import, then delete its exact guard exception.
3. Keep the source-size guard and empty oversized-file baseline intact as new
   code is added. Any future structural split still needs a named owner and
   boundary, a plan, and a largest resulting piece at least 30% smaller than
   the original; the 1,000-line cap alone is not the goal. Use the
   [structural refactor template](templates/structural-refactor.md).
4. Close the runtime build-validation gap exposed by the duplicate export in
   the [startup diagnostics](#2-harden-combined-browser-startup-diagnostics)
   workstream. Keep a real mission-route smoke check for structural changes.

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

- Test-only unit coverage expansion added 29 test files and a minimal DOM test
  double, raising lines from 55.17% to 74.99% with no product-code change:
  [expansion evidence](../evidence/reviews/unit-coverage-expansion-2026-09-18.md).

- A second test-only pass added nine more test files and raised lines from
  75.45% to 79.08% and branches from 62.91% to 66.06%, again with no
  product-code change:
  [round-two evidence](../evidence/reviews/unit-coverage-expansion-round-two-2026-09-18.md).

- A third, branch-first pass added nine more test files and raised branches
  from 66.06% to 68.32% and lines from 79.08% to 80.66%, choosing each slice
  by uncovered branch count:
  [branch-first evidence](../evidence/reviews/unit-coverage-branch-first-2026-09-19.md).

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
8. A structural refactor begins with a responsibility-based plan. Its largest
   resulting source piece must be at most 70% of the original physical line
   count; crossing below 1,000 lines alone is not completion.

## Verification Gate

Each promoted implementation plan defines its own checks. At repository level,
do not close a delivery unit without:

- focused tests for the changed behavior;
- broader tests proportional to blast radius;
- link and metadata checks for documentation changes;
- visual review for intentional UI changes; and
- explicit confirmation that unrelated dirty work was not staged.
