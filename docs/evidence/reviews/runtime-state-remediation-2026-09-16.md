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
