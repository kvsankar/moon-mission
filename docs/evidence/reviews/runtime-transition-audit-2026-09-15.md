# Runtime Transition And Lifecycle Audit — 2026-09-15

Remediation follow-up: [Transition Supersession Fixes](runtime-transition-supersession-2026-09-15.md)
implements RTA-01/02 with regression tests and independent review. The findings
and red-probe results below describe the original audit checkpoint.
[Recovery/readiness follow-up](runtime-recovery-and-readiness-2026-09-15.md)
also closes RTA-03/04/05. RTA-06 remains open.

## Scope And Method

The user clarified that legacy CY3 SSIM characterized interactions during the
large monolith refactor, especially origin, dimension, view and lazy-init
ordering. This audit examines those concerns in the current working tree
based on `de34d71`, including the subsequent uncommitted UI/SSIM follow-up.

Two independent read-only reviewers examined transition/state ownership and
async lifecycle respectively, while a third contributor built semantic browser
coverage. The integrating agent inspected the relevant code and persisted and
reran three controlled reproductions using real exported production modules.
No runtime refactor, baseline update, commit, push or deployment was performed
as part of this audit slice.

Requirement/design owners:
[Architecture Boundaries](../../specs/runtime/architecture-boundaries.md),
[Camera State Transitions](../../specs/camera/state-transitions.md), and
[Runtime Target Architecture](../../designs/runtime/target-architecture.md).

This is a bounded audit of transition/lifecycle seams, not a claim that the
entire architecture, all missions or every network/device condition was reviewed.

## Summary

The refactor produced real improvements: pure transition/pair planners,
scene-scoped view state, texture/decorations generation checks and a guarded
main animation-loop startup. The remaining weakness is inconsistent ownership
across async boundaries, not simply module size.

| ID | Priority | Finding | Evidence level |
| --- | --- | --- | --- |
| RTA-01 | P1 | Old-origin load completion can publish new-origin readiness | Real loader + processor, persisted deterministic reproduction |
| RTA-02 | P2 | Old plane completion can restore an obsolete dimension | Real plane action + presentation adapter, persisted reproduction |
| RTA-03 | P2 | Free reset overwrites the selected plane's up vector | Real camera action + canonical pose policy, persisted reproduction |
| RTA-04 | P2 | Failed orbit loading never reaches terminal startup failure | Independent real-module fault probe and call-chain inspection |
| RTA-05 | P2 | Cold descent geometry depends on load completion order | Independent deferred landing-loader/curve probe and call-chain inspection |
| RTA-06 | Design risk | Camera semantic state still routes through DOM controls | Verified ownership gap; no new user-visible failure demonstrated |

These reproductions establish module-boundary defects. They do not measure how
often live UI input, control disabling or network timing makes each interleaving
reachable. Browser fault-injection confirmation remains part of remediation.

## RTA-01 — Stale Origin Publication

`orbit-load-actions.js:290` captures an origin, but lines 494/520 invoke
`processOrbitData()` without identity. `orbit-process-actions.js:32` updates
metadata from live state; after an await, line 137 writes
`orbitDataProcessed[getConfig()] = true`.

Deferred geo load -> active origin becomes lunar -> geo resolves:

```json
{"loaded":{"geo":true},"processed":{"lunar":true},"events":["metadata:lunar","callback:lunar"]}
```

`settings-actions.js:204-205` changes origin and starts initialization.
The startup run-id guard in `init-orchestration.js:291-299` does not protect
these lower-level publications. False readiness can allow the wrong scene to
advance initialization. The current loader tests mock the processor and do
not switch origin while work is pending.

Next action: carry origin, scene identity and generation through processing.
Separate valid cache completion from effects on the active scene/UI. Cover
geo -> lunar and geo -> lunar -> geo with out-of-order completion and disposal.

## RTA-02 — Stale Dimension Presentation

`plane-actions.js:149-159` captures the current dimension in loader callbacks.
The warm loader also awaits processing and sleep (`orbit-load-actions.js:521-526`).
`mode-switch.js:35-40` directly applies the callback's dimension to the DOM.

Queue a 2D plane change -> select 3D -> complete the old callback:

```json
{"dimension":"3D","presentation":{".dimension-3D:visibility":"hidden",".dimension-2D:visibility":"visible"}}
```

There is no direct plane/dimension action test covering this sequence; the
planner and wiring tests do not execute asynchronous effects together.

Next action: validate transition revision plus scene identity before applying
presentation. Assert both semantic dimension and active renderer under both
completion orders, including an intervening origin change.

## RTA-03 — Plane/Free Order Dependence

`camera-actions.js:87-109` calls canonical `setCameraParameters(false)` and
then overwrites camera up with world Z. The normal Free path invokes it at
lines 873-879. `plane-camera-config.js:21-26` defines Y-up for XY and X-up for ZX.

The same XY/manual view has up `[0,1,0]` after plane selection but `[0,0,1]`
after selecting Free. The latter is degenerate for the pole-on XY position.
The existing camera test covers plane selection preserving up, not the reverse
order. Follow-release behavior intentionally has a separate orientation rule.

Next action: distinguish ordinary preset reset from pose-preserving follow
release. Derive one final position/target/up/control plan. Cover both action
orders for all plane presets. The earlier SSIM fixture reordering removes the
test's unwanted reset, but does not fix this underlying runtime behavior.

## RTA-04 — Failure Has No Terminal Readiness State

`runtime-init.js:73-76` launches loaders without awaiting their outcomes and
marks INIT_DONE. `orbit-load-actions.js:502-514` catches a failed request and
resolves normally. `init-orchestration.js:235-242` then polls a success-only
boolean; its outer failure handler at lines 334-340 is not reached.

An independent injected-503 probe, advanced through twenty scheduled polls,
retained a blocking `loading` overlay, the message `Preparing orbit data...`
and another pending poll, despite the loader's separate error message.

Next action: explicit `ready`, `failed` and `superseded` outcomes owned by the
startup transaction, with a defined retry path. Test failure and retry rather
than only successful readiness. Persist that fault probe as a regression
before changing the owner; the current opt-in script covers RTA-01 through 03.

## RTA-05 — Landing Geometry Has An Unrepresented Dependency

`runtime-init.js:73-74` starts main and landing data separately.
`dimension-actions.js:68-83` builds landing vectors during cold 3D startup.
`orbit-curve-actions.js:98` supplies no vectors until landing data is available.
`landing-load-actions.js:92-94,126` publishes late data without rebuilding
geometry; `spacecraft-curve-actions.js:327` requires existing vectors.

The independent deferred-load probe returned:

```json
{"firstCount":0,"dataReady":true,"curveLengthAfterLoad":0,"explicitRebuildCount":1}
```

Next action: model landing geometry readiness independently. Rebuild once its
data becomes available, or await the dependency for views requiring descent.
Cover orbit-first, landing-first, failure and superseded completion. This is
not evidence that this race caused any particular existing SSIM mismatch.

## RTA-06 — DOM-Owned Camera Semantics

`ui/ui-state.js:352-377`, `camera-actions.js:790-842` and `mission.js:455-478`
route camera intent through hidden controls, reread/normalize/write them, then
derive controller state and view identity. Missing-scene retries reread those
controls rather than replay a retained normalized intent.

This is a structural gap already related to the September 3 architecture
queue, not an independently reproduced user-facing defect. A narrow camera/view
state owner would let header, settings and mobile controls project the same
state while readiness replays the latest normalized request. Do not add another
wrapper/context layer without reducing this ownership ambiguity.

## Executable Evidence And Harness

```text
npm run test:transitions:unit
npm run test:browser:transitions
npm run test:audit:transitions
```

- The focused existing unit group passed **65 tests in twelve files**,
  including startup orchestration and orbit loading after independent review
  identified those omissions in the initial command grouping.
- The browser command exercises normal CY3 Dockview, with fresh contexts and
  visible controls. It does not use the SSIM profile or reset camera internals.
  **Four scenarios passed in 95 seconds**: Earth -> cold Moon -> warm Earth;
  Earth 3D -> 2D -> warm 3D; Earth 2D -> Moon 2D -> cold/warm Moon 3D; paused
  Free -> Craft/Moon -> Free. Checks include actual SVG/canvas exclusivity,
  finite camera pose, source/target agreement and absolute mission time.
  The integrating agent reviewed the new test implementation.
- An initial immediate assertion observed both render surfaces during handoff.
  It did not reproduce as a sustained defect. The final harness allows a
  bounded five-second handoff and still requires the inactive surface to hide.
  Fresh contexts exercise lazy scene initialization, not controlled network
  ordering. Running transitions, supersession during loading, relative/compare
  modes and rendering fidelity remain outside this initial browser slice.
- Browser failures produce state JSON and PNG diagnostics under the ignored
  `test/screenshots/current/runtime-transitions/` directory.
- The opt-in audit command deliberately exits **1** for the three unresolved
  desired-contract assertions. All three failures were reproduced by the
  integrating agent and independently reviewed/rerun; failures occurred at the
  intended assertions, not during fixture setup. It is not included in the
  ordinary CI/unit gate and does
  not assert the broken behavior as correct. Once fixed, promote these checks
  into their owning regression suites.

Reproduction source: [runtime-transition-audit.mjs](../../../test/repros/runtime-transition-audit.mjs).
Browser source: [runtime-transition-interaction.test.js](../../../test/runtime-transition-interaction.test.js).

Local links in the five audit/harness documents and `git diff --check` passed.
Earlier dirty UI/SSIM work was preserved; nothing was staged.

## Disposition

Prioritize RTA-01/02 transition identity and stale-publication protection,
then RTA-04 failure/retry and RTA-05 dependency readiness. RTA-03 is a small,
separately testable camera fix. Use RTA-06 to guide those boundaries rather than
launching another broad refactor. Runtime implementation remains follow-up
work, not silently included in this audit.

The [paired delivery plan](../../plans/implementation/runtime-transition-audit-and-tests.md)
owns coverage migration. Existing CY3 baselines and strict gate are unchanged
in this slice; replacement/retirement requires a coverage disposition. The
detailed human UX review remains deferred as requested.
