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

Status: **complete**, following the reviewed SA-17/18 receiver-ownership and
terminal-disposal work below. The producer checkpoint alone was not closure.

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
were brought forward as dependencies. The real producer/init/disposal path now
verifies eventual cleanup, including an accepted texture whose renderer update
failed; the terminal cleanup and shared-consumer regressions below also pass.

## SA-17 — Shared Texture Consumers

Initial RED: eight of nine consumer regressions failed. They cover shared
Earth/Moon/sky inputs, scene-only Earth/photo aliases, failed renderer adoption,
profile replacement, alias deduplication and shared generated normals. The
runtime also uses `SkyController`, so the real composition path and decoded
DEM/physical-normal dependency require separate coverage.

Root protocol review added tests for replacement ordering, re-entrant cleanup,
ownership epochs, failure cleanup and dependencies. Independent review then
found a listener-order defect: registering dependency cleanup before a later
parent-reacquisition listener freed the child prematurely. The reverse-order
regression failed (11 other protocol checks passed). Managed disposal now waits
until native listeners finish before releasing dependencies; both registration
orders pass. Four further RED tests reproduced repeated texture destruction
after a geometry/material cleanup failure. Retirement snapshots no longer
reacquire stale material references when cleanup is retried.

Scene and renderer leases count unique texture identities without cloning DEM
buffers. Installed scene inputs are held independently of renderer adoption,
including photo-only inputs and cross-body aliases. The actual runtime
`SkyController`, the legacy renderer, generated normals and decoded DEM
dependencies participate. Producer cancellation only destroys unclaimed inputs.
`disposePrevious:false` preserves its explicit relinquish-without-destruction
contract. No terminal scene flags or scheduling policy are changed in this slice.

Independent review cleared the final diff; **28 protocol/consumer checks** and
the broader **111 focused tests across ten files** passed. Final verification:
**1,778 unit tests passed, six skipped, 231 files**; all **seven browser checks**
passed across runtime transitions and Artemis II mobile continuity. SA-17 is
complete. SA-06 was kept open at this checkpoint pending SA-18 receiver retirement.

## SA-18 — Terminal Scene Lifetime

Initial root RED: eight terminal/disposal/replacement regressions failed, then
two render/startup-lookup regressions and five deferred-work/initialization
regressions failed. The async texture suite separately reproduced ten failures.
Scene retirement must be terminal: revoke readiness, publication tokens and
pending metadata before invoking any abort or cleanup callback. A scene-local
cleanup registry prevents retiring one scene from aborting another scene's
loads. Cancelled idle/frame waits must settle without another browser tick;
uncooperative loaders still have their eventual unclaimed results cleaned up.

Root review added failing cases for post-retirement decoration rendering and
shared profile installation iterating a scene retired by an earlier consumer.
Independent review exposed a composition gap: real curve disposal raised the
terminal numeric state from -1 back to 2. A tracked real-adapter regression
now protects terminal readiness. These regressions pass after their fixes.

The producer/init handoff regression now invokes actual scene disposal instead
of manually destroying its accepted texture, closing that test-evidence gap.
Combined independent review is clear. The new texture-init lifecycle suite has
15 cases; focused async checks passed 65 tests across six files. Full unit
verification passed **1,812 tests, six skipped, 234 files**. The local production
build passed with the existing classic-script, Three.js `sRGBEncoding` and
large-chunk warnings. All **ten browser checks** passed across runtime
transitions, load recovery and Artemis II mobile continuity. SA-18 and the
linked SA-06 receiver-cleanup dependency are complete. No baselines, thresholds
or mission data were changed; no deployment was performed.

## SA-09 — Playback Restart Publication

Two of four initial regressions failed: the controller silently rewound while
its real session/scene/timeline callbacks retained the end time. Restart now
uses `setTime` with a committed `transport-restart` seek before announcing Play.
Ordinary resume remains seek-free and frame timing still starts fresh.

Independent review cleared the callback/media ordering. **89 focused tests
across five files** passed. A new CY3 browser test uses the visible timeline
and Play controls and observes the timeline at the synchronous Play event;
it passed without waiting for a correcting animation frame. Full-unit
verification: **1,816 passed, six skipped, 235 files**. SA-09 is complete.

## SA-10 — Mobile FoV Ownership

Seven RED regressions reproduced desktop writes from retained mobile presets,
queued first/second animation frames, late manual inputs, an incorrectly consumed
Compose default, and stale mobile-to-desktop-to-mobile refresh work. Mobile FoV
mutation/render paths now require mobile viewport ownership. Scheduling and
both frame stages check ownership, while a monotonic refresh revision revokes
superseded work (including desktop resize notifications).

Independent UI review cleared the guards and real resize/preset integration.
**28 focused tests / five files** and the full suite **1,823 passed, six skipped,
235 files** passed. Both Artemis II browser tests passed: mobile tab/clock
continuity and desktop FoV restoration followed by another desktop resize.
SA-10 is complete; no visual baselines or disclosure policy were changed.

## SA-15 — Required Comparison Error And Retry

Loader RED: **16 failures / two passes** before implementation. Required config
HTTP/network/JSON/schema failures, missing/unsafe selection, unavailable setup,
unusable overlay metadata and unavailable manifest data now raise a typed
`ComparisonLoadError`; compare mode cannot silently publish base-only success.
Optional manifest 404 remains absence, while other HTTP/network/malformed
responses are retryable failures. Non-compare startup remains a no-op here.

The real cached-primary/configuration-publication regression also failed before
the loader fix. Retry now refetches the secondary, publishes only the completed
overlay, and neither refetches nor mutates valid primary configuration.
Root presentation RED tests covered the generic error message and the misleading
origin-switching hint; comparison now has explicit error/retry guidance.

**45 combined focused tests / five files** passed. All **four browser recovery
checks** passed, including real secondary HTTP 503, visible comparison error,
keyboard Retry, both mission curves present afterward, and unchanged primary
configuration request count. The initial full suite passed **1,845 tests, six
skipped, 237 files**, but independent review found two closure-blocking gaps:
missing time endpoints coerced to zero by the real comparison model, and an
invalid manifest shape accepted as fallback metadata. These require tracked
regressions, fixes and re-verification before closure; the first green run is
not the final evidence.

The review follow-up produced **11 additional RED cases** before correction.
The model now rejects absent/blank endpoints before numeric coercion (genuine
epoch-zero times remain valid). The loader checks supplied manifest map and
artifact path shapes without imposing new requirements on optional metadata.
Supported string, direct-phase, `runtime` and `path` forms remain covered.
Independent rereview cleared both findings, with **62 tests / six files**
passing. The post-fix browser comparison Retry test also passed with both
primary and overlay curves present. Final full-unit verification: **1,860 passed,
six skipped, 237 files**. SA-15 is complete after fixing and rereviewing both
validation findings.

## SA-08 — Media Manifest Recovery

Data-layer RED: **19 failed / seven passed** before implementation. URL-keyed
success/absence and in-flight caches now distinguish genuine HTTP 404 from
retryable HTTP/network/parse/shape errors. Failed requests are not cached, and
deferred A/B/ABA completions cannot contaminate another URL's entries. Existing
formats and the compiled Artemis II manifest remain supported.

Root RED: three coordinator cases exposed permanent unavailable state, missing
Retry and cross-mission completion; two panel tests exposed absent intent wiring
and cached Retry visibility. The coordinator now owns request-time URL/data path
and attempt identity, keeps recoverable failures accessible, and waits for an
explicit Retry. Disabled media, compare mode and disposed coordinators reject
Retry; successful and genuinely absent manifests are not repeatedly fetched.

Independent review cleared the complete diff; **129 tests / six focused suites**
passed. Browser HTTP 503 -> visible keyboard Retry -> recovered thumbnail passed,
with one request before Retry and two afterward. The error panel screenshot was
visually inspected. Final full-unit verification: **1,892 passed, six skipped,
238 files**. SA-08 is complete.

## SA-13 — Hidden Workspace Keyboard Ownership

Unit RED: **six failed / three passed** before implementation. Browser RED:
at 800x700, the twelfth Tab press focused the hidden `left-broadcast` group
(Flyby Broadcast). Hidden grid groups now receive owned `inert` suppression,
tracked by element identity so rebuilding/reusing a group ID cannot transfer
the wrong ownership. Reveal, expansion, removal, floating and disposal restore
only this controller's changes, preserving pre-existing inert/hidden state.

The first focused run passed **23 tests / three files**, and all **four browser
checks** passed, including keyboard/reveal/restoration and existing progressive
layout behavior. Independent review found a remaining synchronous teardown
edge: a visibility callback can dispose the controller before the outer update
reapplies inert. Closure requires a regression, correction and rereview of this
case. SA-12 selection reset remains separate.

The reentrant case failed before correction. Guards now stop work at the
terminal boundary and after external visibility, constraints, activation,
layout and publication effects. Additional cases cover all those checkpoints
and explicit reveal activation after update returns. **18 focus lifecycle
tests** and **29 focused tests / three files** pass. Independent rereview cleared
the correction. Final unit verification: **1,910 passed, six skipped, 239 files**.
The post-fix keyboard/reveal/full-expansion browser test passed. SA-13 is complete.

Two preceding post-fix browser attempts stopped before the keyboard scenario:
startup exposed six panels instead of eight, missing both media workflows,
while scene loading reported ready and no page errors occurred. The unchanged
test subsequently passed; neither requirements nor timeouts were relaxed.
Added startup diagnostics retain panel IDs, manifest responses and media status
for recurrence. This separate cold-workspace readiness finding remains open
under SA-21; the focus fix is not claimed to fix it.

## SA-21 — Workspace Initialization And Lifetime

The cold-start defect was reproduced deterministically by holding the lazy
Dockview module until media descriptors were already available. Releasing the
old host left six panels and omitted both media workflows. The host now publishes
its owned identity before synchronous registry callbacks, retains unfulfilled
default intents until panels are observed in the API, and removes one-time
close/focus intents without an arbitrary eight-second cutoff.

Initial host TDD produced **nine failures / one pass**. Review then drove
additional failing cases for reentrant replacement and disposal, failed initial
registry callbacks, constructor/partial API cleanup, stale renderer factories,
mounted-event retirement, replacement-owned DOM, focus-then-save ordering, and
cancelled frames delivered anyway. The layout host now releases allocated APIs,
subscriptions, observers and its initial sizing job when setup fails or retires.
Host globals and body classes are cleared only by their current owner.

Explicit registry `Focus` now routes through progressive reveal; automatic
Open/Restore remains raw Dockview focus. Browser RED showed Flyby Broadcast
remaining hidden/inert after a successful Focus action. A review regression also
caught automatic background Restore accidentally revealing the tool; the final
callback split preserves both contracts.

Final verification: **114 focused tests / eight files**, **1,939 unit tests
passed, six skipped, 241 files**, and all **six progressive browser checks**
passed. The browser suite covers controlled late-host availability, registry
Focus across media/Moon/composer tools, keyboard exclusion, progressive layout
restoration, compact controls and constrained reload. The local production build
passed with the existing classic-script, Three.js `sRGBEncoding` and large-chunk
warnings. SA-21 is complete; SA-12 Reset View selection remains separate.

## SA-12 — Reset View Tool Selection

RED: after selecting a constrained tool, the reset host rebuilt the default
layout and focused Main View directly while `selectedTool`/`pendingTool` remained
owned by the progressive workspace. A focused unit regression required actual
Reset to return through the progressive Scene action; a companion regression
protects ordinary `captureExpandedLayout()` from clearing an explicit or pending
tool during first-load/layout reconciliation.

Reset success and fallback now reveal `mission:main-view` through the progressive
owner. Terminal checks still stop persistence if reveal synchronously retires
the host. The browser case selects Craft → Moon at 800x700, invokes the visible
Tools → Reset View command, verifies Scene is the only visible focused group,
and proves timeline time plus camera position/look are unchanged.

Final verification: **41 focused lifecycle tests**, **1,941 unit tests passed,
six skipped, 241 files**, and all **seven progressive browser checks** passed.
SA-12 is complete.

## SA-11 — Explicit Constrained-Layout Edits

The confirmed browser case resized the compact Frame-and-Shoot/Media column from
about 507px to 437px; the prior persistence filter retained the old expanded
layout, so reload restored the original geometry. Pure RED cases covered nested
divider edits, hidden sibling geometry, tab transfer/order/active state, and a
last-tab move that empties its source group. Host RED cases covered explicit sash
provenance, user tab-drag provenance, passive pointer activity, cancellation and
disposal with a queued completion.

The layout host now owns bounded sash and Dockview drag transactions. The
progressive owner applies only those transactions to its expanded reference and
cancels them on viewport changes, transient restoration, capture and disposal.
Divider edits transfer the change in visible sibling shares onto the expanded
size budget, while hidden branches retain their authored geometry. Panel moves
reconcile membership before applying order and active-tab state, including an
emptied source group. Ordinary Dockview layout events remain filtered as derived
responsive state.

Review found and fixed the empty-source transfer case. **43 focused tests** pass
across reducer, host and progressive ownership suites. The browser test performs
a real compact `.dv-sash` drag, verifies the expanded reference and hidden
auxiliary column, reloads while compact, then expands and verifies the persisted
direction/proportions. All **eight progressive browser checks** and **1,951 unit
tests passed, six skipped, 241 files**. SA-11 is complete.

## SA-14 — Detached Window Geometry And Lifecycle

The confirmed 480px popout placed the Frame-and-Shoot View disclosure beyond
the owning viewport because `createComposerDisclosure` captured the opener
window. Initial owner-realm tests failed before helpers existed. Geometry now
resolves from each element's current `ownerDocument.defaultView`, and disclosure
position clamps to that viewport. The auxiliary control-matrix positioning path
uses the panel's owner window as well.

Disclosure resize/document subscriptions and ResizeObserver ownership rebind on
Dockview mount, layout and unmount/adoption events. The old realm's pending frame,
resize and document listeners are released; disposal cancels the current realm.
Review corrected fallback-frame cancellation so non-RAF environments do not
strand a timeout.

The browser test opens the real Frame-and-Shoot group in a 480px Dockview popout,
opens View options and verifies all edges remain inside that window. It then
adopts the panel back into a compact opener, triggers the same disclosure and
verifies owner identity and opener-bounded geometry. Final verification:
**1,953 unit tests passed, six skipped, 242 files**, and all **ten auxiliary
panel browser checks** passed. SA-14 is complete.

## SA-20 — Detached Panel Registry Snapshots

Four RED cases showed nested registry state remained writable through the input
descriptor, `getMissionPanelSnapshot`, `getMissionPanelDetails`, update patches,
and one subscriber's mutation before a later subscriber ran. The registry now
deep-copies plain descriptor data, arrays, maps, sets and dates on write and on
every read/notification. Each subscriber receives its own copy.

Action functions remain in the private registry entry. Snapshots continue to
expose the established boolean `actions` capability map, and real action
invocation remains unchanged. The SA-21 initial-listener exception cleanup is
preserved and covered in the combined focused run.

Final verification: **31 focused registry/host tests**, **1,957 unit tests
passed, six skipped, 242 files**, and the real registry-Focus browser check
passed. SA-20 is complete.

## Risk Triage Follow-Up

Independent probes strengthened the original risk inventory. SA-17/18 are now
closed above; other entries still require tracked tests, review and verification.

- SA-16: inactive lunar zoom writes changed the active legacy mirror to 9 and
  an absent-origin read returned 9. Keep mirrors active-origin-only; retain
  startup fallback only for the active missing scene, and use defaults for
  missing inactive scenes. Inactive plane synchronization must not write UI.
- SA-17 (complete above): two real MoonRenderers shared albedo/DEM/physical-normal textures;
  disposing one disposed all three while the other retained references, and
  disposing the second disposed them again. Use last-consumer resource leases;
  DEM owns its bundled physical normal, generated normals remain renderer-owned.
  Brought forward after SA-06's producer checkpoint to complete receiver
  ownership before closing SA-06. Avoid JSON-based Texture.clone of DEM metadata.
- SA-18 (complete above): two disposals left initialized3D true, stop false and loading pending,
  with 28 cleanup calls. Treat scene disposal as terminal/idempotent, invalidating
  readiness and only that scene's subscriptions before cleanup. Replacement,
  not same-instance resurrection, matches current origin-switch behavior.
- SA-19 GLTF: completion after renderer disposal attached a new craft. Guard
  renderer generation and wrapper identity, dispose late models and settle
  cancellation. Catalog URL A then B returned A with one fetch; key cache and
  inflight work by resolved URL without replacing the default catalog getter.
  Disabled orbit refinement should remain disabled with a guard test and an
  explicit no-change disposition, not speculative worker activation.
- SA-21 (complete above): the cold six-panel startup, explicit Focus reveal,
  host replacement and deferred-work ownership now have deterministic coverage.
- SA-22: existing mobile/desktop specs support live widening restoration, not
  a new reload-required exception. Own lazy desktop mounting across breakpoint
  crossings; preserve time/camera/layout and respect explicit legacy policy.
  No further product choice is required for these conservative contracts.
