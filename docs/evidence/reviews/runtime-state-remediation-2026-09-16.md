# Runtime State Remediation — 2026-09-16

The [audit](runtime-state-audit-2026-09-16.md) identifies the findings; the
[scoped plan](../../plans/implementation/runtime-architecture-followups.md)
tracks delivery under the single roadmap. This log records red tests, minimal
fixes, review corrections and verification for each subsequently closed item.
The user explicitly requires TDD and review/fixes before closing each item.
SA-01 evidence is in the original audit. No deployment is authorized.

## SA-02 — Foreground Playback Session Ownership

Status: complete after independent review and correction of both findings.

Red: ten of the first twelve `media-playback-session.test.js` cases failed
against the original code. They cover retired audio A-B/A-B-A events, same-ID
restart settlement and Pause followed by a late playing event. A further native
video boundary test failed when retired item A replaced focused B.

Implementation: playback sessions capture element/item/kind identity; each
play request has its own token. Only the current owner may change pending,
selection, clock or playback state. Retired audio listeners are removed and
queued copies still check ownership. Pausing suspends transport without
discarding selection. Current native video can explicitly adopt a session;
frame-scrub resume retains its existing path. Panel events carry element identity
and validate the current focused source and transport state.

Independent review found two additional races before closure:

1. Animation Pause before `playing` failed to invalidate pending/buffering work.
2. Queued video buffering/readiness/time events could affect suspended playback.

Both were reproduced with new failing tests, then fixed. Final focused review
reported no remaining actionable findings; all 90 tests across the three media
suites pass. Final full suite: **1,660 passed, six skipped, 221 files**.
Browser foreground playback: **one passed** (simulated media transport, not
real decoding/HLS validation). No thresholds, production data or baselines changed.

Fixture corrections preserve behavior assertions: the buffering unit fixture
now exposes its actual current video and a coherent playing clock. The browser
fixture's synthetic play/pause/end events now update paused/ended properties.
Its old “2 videos” count included a background-role stream, contrary to the
already-existing foreground exclusion contract; the check now requires the
single foreground video. The card locator uses the existing stable media ID
instead of obsolete title text (cards now display mission elapsed time), and
the selection uses a visible Playwright click. No production filter policy
was changed. Foreground playback/browser interaction: one test passes.

## SA-07 — Terminal Media Coordinator Disposal

Status: complete; independent review clear.

Red: all four new `media-coordinator-disposal.test.js` tests failed. Late
manifest success and failure each re-added four document listeners; later
updates/intents reactivated effects; repeated disposal repeated cleanup.

Fix: acquire terminal disposal state before cleanup, clear retained render
context, and reject late manifest publication, updates, rerenders, panel and
background callbacks, queued document handlers and duration probes. Disposal
is idempotent. Pending shared loading may finish but cannot republish here.
Captured queued handlers are exercised after removal as well as late promises.

Focused regression run: 104 tests pass across disposal, session, coordination
and background-panel suites. Independent reviewer found no actionable issues.
Final full unit suite: **1,664 passed, six skipped, 222 files**. This terminal
lifecycle slice has no visual change; the SA-02 browser interaction remains
separate evidence, not a new browser run for SA-07.

## SA-03 / RTA-06 — Authoritative Main-Camera Intent

Status: complete after final independent review.

Red milestone: 11 ownership regressions failed on the existing action module,
covering state versus corrupted controls, obsolete retry after newer release,
retained release metadata, repeated no-argument projection, origin ABA,
replacement scenes, disposal, invalid pair no-op and re-entrant projection.
The implementation is bounded to the main camera; auxiliary view cameras keep
their independent state owners. Delayed startup/BFCache callbacks must project
current intent rather than resetting Free after a newer user action.

Implementation creates one composition-root state port, routes header/mobile
intents through it before projecting a complete pair, and derives view identity
from that port. Explicit commands advance intent revision even for the same
pair; readiness-only application is idempotent and retains release metadata.
Polling is bounded to five seconds, with fresh readiness reapplication after
that budget. Origin/transition, scene, generation and controller ownership guard
late work. BFCache retains the owner; terminal pagehide cancels work. Auxiliary
cameras are unchanged.

Review corrections cover terminal guards on all camera/FoV/plane entry points,
scene-generation ownership, callback forwarding through root/entry composition,
and an explicit Earth-recenter normalization exception. A readiness-only hook
avoids recursive projection/identity effects. Two further regressions first
failed for an old controller on a reused scene and mounted recentering after a
generation change; both were fixed before final review.

Focused verification: **111 tests / 18 files**. Expanded fast transition suite:
**241 tests / 26 files**. Browser run: **seven passed**, including corrupted
restored controls, cold 2D beyond the retry budget, four existing transition
checks and Artemis II mobile continuity. Final targeted browser and full-unit
reruns follow the last controller/generation corrections before closure:
the two ownership browser cases plus mobile continuity passed again (the four
other already-passing cases were filtered only for this targeted rerun).
Final full unit suite: **1,705 passed, six skipped, 227 files**. Local build
passed with the existing classic-script/Three.js/chunk warnings. Final narrow
review independently passed all 20 intent tests and found no remaining issues.

## SA-04 — Temporary Annotation State Restoration

Status: complete after independent review and correction of its finding.

Red: seven of eight new cold/delayed-catalog/setup/render-exception cases failed
on the original helper. Code review added a failing fallback-group case where
an object without presentation methods was mutated and visibility stayed true.
The fix restores captured fields regardless of whether a group existed, puts
setup inside cleanup protection, and preserves the visibility-only fallback.

Independent review then reproduced a gap with the real annotation builder:
rebuilding geometry normalizes and overwrites the fields just restored. A real
`createLunarCraterActions` empty-catalog integration test and two mutating/throwing
restoration tests all failed before the second fix. Restoration now reapplies
the authored snapshot in `finally` after effect-side rebuild/cleanup, including
exceptions. No annotation filter policy or baseline was changed.

Focused suite: **42 passed / three files**, including 12 new regression cases.
Final full unit suite: **1,717 passed, six skipped, 227 files**. Independent
review reran the 42 focused tests and cleared the final restoration logic.
No new browser/SSIM run was claimed for this module-level state/exception fix.

## SA-05 — Owned Curve Construction

Status: complete after independent review and correction of its findings.

Red milestone: 13 real-Three.js lifecycle regressions fail on the original
builder. Cancellation cases expose stale completion; the observable-promise
contract gates injected allocation failures so fire-and-forget baseline errors
do not become uncontrolled test-process rejections. Coverage includes stop,
dispose, same-scene replacement, generation/container changes, failure cleanup,
retry, landing independence and wrapper forwarding.

Implementation uses per-scene entry/build identities, captured generation and
container, input-array snapshots and a geometry/material/line ownership ledger.
The `AnimationScene` wrapper forwards a non-rejecting outcome promise; starting
a new build revokes previous curve readiness without clearing prepared inputs.
Landing installation remains synchronous and independently owned.

Review/TDD follow-ups before closure include cancellation status after stop,
cleanup-listener exceptions, snapshot inputs, allocation failure in landing
construction, and synchronous replacement during `childadded`, entry cleanup
and explicit disposal. These callbacks can run before the outer operation
returns, so ownership must be checked around effects as well as awaits.
Old references are unpublished before cleanup; newer output/landing owners
must survive, and re-entrant disposal must not release resources twice.

The final root review added a failing ready-build cleanup/cancel ordering case:
geometry disappeared while old readiness remained. Terminal state is now
revoked before cleanup callbacks, with subsequent diagnostic writes guarded by
ownership. Independent review cleared this final ordering correction.

Verification: **25 curve lifecycle regressions**, **30 curve/landing tests**,
and the full unit suite **1,742 passed, six skipped, 228 files**. All **ten
browser checks** passed across runtime transitions, load recovery and Artemis II
mobile continuity. No baselines, thresholds or mission data changed.

## SA-06 — Texture Handoff Ownership

Status: producer boundary implemented and reviewed; **item remains open** until
SA-17/18 verify eventual receiver cleanup.

Red: five of six initial handoff tests failed, including synchronous/async
consumer rejection and rejection of a later group. The producer no longer
marks delivery before acceptance. Successful callbacks retain compatibility;
an explicit `acceptOwnership()` receipt allows scene assignment to take
responsibility before subsequent rendering effects. Acceptance closes when
the callback settles. The real scene-init path forwards the receipt through
the scene texture assignment boundary.

Independent review found mutable payload enumeration could dispose an accepted
original texture if its field was moved/deleted. A failing regression now
protects an immutable private snapshot of the loaded resource identities.
Focused producer/scene-init tests: **40 passed / four files**.
Producer checkpoint full suite: **1,750 passed, six skipped, 229 files**;
independent review cleared the immutable receipt implementation.

The same review exposed an unresolved receiver limitation: if renderer adoption
throws after scene assignment, existing scene disposal can null the accepted
texture field without releasing it. Manual fixture cleanup is not evidence of
production cleanup. SA-17 shared resource ownership and SA-18 scene retirement
are brought forward as dependencies; SA-06 will not be closed until a real
consumer-disposal regression passes. This is an explicit dependency, not a
claim that the full texture lifecycle is fixed.

## Risk Triage Follow-Up (Not Yet Closed)

Independent probes strengthened the original risk inventory; these still need
tracked red tests, implementation, review and verification in their turn.

- SA-16: inactive lunar zoom writes changed the active legacy mirror to 9 and
  an absent-origin read returned 9. Keep mirrors active-origin-only; retain
  startup fallback only for the active missing scene, and use defaults for
  missing inactive scenes. Inactive plane synchronization must not write UI.
- SA-17: two real MoonRenderers shared albedo/DEM/physical-normal textures;
  disposing one disposed all three while the other retained references, and
  disposing the second disposed them again. Use last-consumer resource leases;
  DEM owns its bundled physical normal, generated normals remain renderer-owned.
  Complete SA-06 before this slice. Avoid JSON-based Texture.clone of DEM metadata.
- SA-18: two disposals left initialized3D true, stop false and loading pending,
  with 28 cleanup calls. Treat scene disposal as terminal/idempotent, invalidating
  readiness and only that scene's subscriptions before cleanup. Replacement,
  not same-instance resurrection, matches current origin-switch behavior.
- SA-19 GLTF: completion after renderer disposal attached a new craft. Guard
  renderer generation and wrapper identity, dispose late models and settle
  cancellation. Catalog URL A then B returned A with one fetch; key cache and
  inflight work by resolved URL without replacing the default catalog getter.
  Disabled orbit refinement should remain disabled with a guard test and an
  explicit no-change disposition, not speculative worker activation.
- SA-21: test instance-owned timers/frames/globals on workspace disposal, and
  reproduce registry Focus after stable layout readiness before routing reveal.
- SA-22: existing mobile/desktop specs support live widening restoration, not
  a new reload-required exception. Own lazy desktop mounting across breakpoint
  crossings; preserve time/camera/layout and respect explicit legacy policy.
  No further product choice is required for these conservative contracts.
