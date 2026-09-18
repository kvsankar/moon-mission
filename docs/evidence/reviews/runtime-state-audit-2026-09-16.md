# Runtime State Ownership Audit — 2026-09-16

## Scope And Method

The user expanded the camera-state follow-up into a runtime-wide state audit
and sequential remediation. Inventory checkpoint: `0a41290`. Three independent
read-only reviews covered lifecycle/resources, playback/media/comparison, and
panels/mobile/persistence. The integrating review covered camera intent, state
ports, view identity and scene/legacy mirrors.

This is a survey of the major state domains, not a claim that every possible
browser, network, GPU, mission or event interleaving has been exhausted.
“Confirmed” below means a deterministic real-module probe or an observed
browser sequence, not necessarily a measured production incident. Ports were
stubbed for module probes; production decision logic was not reimplemented.
Risks and product decisions are explicitly separate from reproduced defects.

Requirement owners: [architecture boundaries](../../specs/runtime/architecture-boundaries.md),
[camera transitions](../../specs/camera/state-transitions.md),
[clock authority](../../specs/time/clock-authority.md),
[panel system](../../specs/ui/panel-system-v1.md), and
[progressive disclosure](../../specs/ui/panel-progressive-disclosure.md).
The [roadmap](../../plans/roadmap.md) owns priority; the
[architecture follow-up plan](../../plans/implementation/runtime-architecture-followups.md)
owns sequential delivery. IDs remain stable regardless of delivery order.

## State-Domain Map

| Domain | Intended owner / projections | Audit disposition |
| --- | --- | --- |
| Session time and playback | Session state plus animation controller; timeline/media observe committed time | SA-02, SA-07, SA-09 |
| Origin, dimension, view identity | Runtime view state and monotonic transition revision; DOM is presentation | SA-01, SA-03, SA-16 |
| Camera semantics and pose | Normalized camera intent; scene controller derives pose | SA-03; RTA-06 remains structural work |
| Configuration and async readiness | Shared mission load, activation-scoped publication, scene generation | SA-01, SA-05, SA-15 |
| Media data and session lifecycle | Manifest cache, coordinator lifecycle, individual playback session | SA-02, SA-07, SA-08 |
| Scene annotations/render resources | Per-view presentation; explicit resource acceptance and disposal | SA-04, SA-06, SA-17/18 |
| Desktop/mobile FoV | One camera with presentation-specific controls | SA-10 |
| Panel layout and persistence | Saved user layout plus temporary responsive disclosure | SA-11/12/13 |
| Detached-window geometry | Owning document/window, not opener viewport | SA-14 |
| Compatibility and dormant loaders | Explicit adapters, keyed caches and lifetime guards | SA-16/19 |

## Confirmed Defects

### SA-01 — Configuration activation can publish after supersession (P2)

`app/init-config-flow-actions.js` captured an origin, awaited global config,
then applied derived state, scene setup and controls without rechecking its
owner. `init-config-scene-setup.js` also changes shared timeline, scale and
controller state. The outer startup guard ran only after these effects.

Probe: start geo, defer config, switch to lunar, release. Derived updates read
lunar while setup targeted geo, controls changed and geo was marked ready.
Origin/dimension roundtrips also require revision checks rather than string
equality alone. Initial blocking-overlay browser reachability was not proved.
Concurrent `ensureGlobalConfigLoaded()` calls also loaded/published defaults
twice because only completed config was cached.

Smallest fix: singleflight mission-wide loading, separate activation authority
by request/origin/revision/scene/caller, explicit superseded outcome and bounded
latest-view handoff. Tests must cover warm reuse, same-origin overlap, ABA,
scene replacement, stale rejection, legitimate failure/retry and cancelled
callers that must not invalidate live work. **First implementation slice.**

### SA-02 — Retired foreground media reclaims selection and clock (P1)

`app/media-timeline-coordination.js` (checkpoint lines 1119, 1439, 1758, 1857)
retains old audio listeners and accepts `playing` by item ID without current
element/session ownership. Play-promise settlements also share mutable request
state; item equality cannot distinguish two generations of the same item.

Real-coordinator probe: play A, switch/play B, deliver A's queued `playing`.
Selection changed B to A and mission time changed 1775147700000 to
1775147400000 (five minutes backward).

Fix: explicit playback-session generation and element identity for every event
and promise settlement; retire on stop/replacement/restart/dispose. Regressions:
A-B, A-B-A, same-ID restart, old resolve/reject and old playing/ended/error/time
events after pause/close. This is the next high-priority delivery slice.

### SA-03 — Camera retry outlives newer intent; DOM still owns semantics (P2)

`app/camera-actions.js:790-899` reads position/look from controls and queues a
200 ms retry when the scene is not initialized. A newer successful action does
not cancel that timer; retry loses `preserveManualRelease` and rereads controls.

Real-action probe: queue while cold, mark scene ready, release follow with
`preserveManualRelease: true`, run old timer. Default-pose resets changed from
zero to one. The older completion overrides the newer pose-preserving action.

Fix retained normalized intent and timer ownership first; then complete RTA-06
with one semantic camera state port and controls as projections. Cover latest
intent across cold/warm, origin/dimension changes, release and disposal. The
exported but currently uncalled recenter helper also bypasses pair normalization;
its Earth/manual case conflicts with the allowed-pair invariant and needs
explicit disposition, not an invented active UI regression.

### SA-04 — Cold auxiliary annotation rendering leaks into main state (P2)

`app/lunar-crater-view-renderer.js:36-41` returns from restoration if no group
previously existed, skipping saved fields. Temporary writes at 114-131 also
precede the `try/finally`. Late catalog completion consumes these fields.

Probe with no group: main diameter 80/search `main` becomes diameter 10/search
`auxiliary` after auxiliary render; group remains absent. Fix unconditional
field restoration and include setup in the protected region. Test absent group,
delayed catalog, thrown annotation creation and thrown render.

### SA-05 — Cancelled 3D curve build still publishes completion (P2)

`app/spacecraft-curve-actions.js:221-222,236-260,280-321` breaks chunk creation
when stopped but continues generated segments and final readiness. Probe:
pause a real Three.js build, stop/dispose, release; scene reaches ADD_CURVE_DONE
with no children and still publishes generated body metadata.

Fix generation-owned build and immediate cancelled return before subsequent
work/readiness. Test dispose during a chunk, same-scene replacement build,
failure and absence of resources/publication after cancellation. User-visible
impact depends on scene reuse; invalid readiness itself is confirmed.

### SA-06 — Rejected progressive texture handoff leaks ownership (P2)

`app/texture-loader.js:771-797` marks delivery before consumer acceptance.
`scene-3d-init-actions.js:237-239` can reject a stale handoff. Probe with a
disposal counter: callback throws `TextureLoadStaleError`, texture disposals=0.

Fix explicit accepted/rejected resource transfer; dispose unaccepted textures
without disposing installed resources. Test rejection and supersession between
readiness and installation, including partial accepted groups.

### SA-07 — Manifest completion resurrects disposed coordination (P2)

`app/media-timeline-coordination.js:2376-2417,3340,3439-3453` keeps the pending
manifest and last render context after disposal. Probe: update/defer manifest,
dispose, resolve; four document listeners are re-added by rerender/update.

Fix terminal lifecycle ownership and clear context. Test late success/failure,
repeated disposal and pending play completion. Coordinate with SA-02, but keep
the separate disposal regression and status visible.

### SA-08 — Manifest transient failure is permanently cached as absent (P2)

`data/mission-media.js:44-75` caches failure as loaded `null`; the coordinator
also treats `unavailable` as terminal. Probe: 503, then explicit load with a
successful response available; both results null, fetch count one.

Fix absence/error distinction, success-only cache and explicit retry across
both layers. Test optional 404, network/503, deduplicated retry and cached
success. Do not turn this into an automatic retry loop. URL-change cache races
also need lifecycle coverage if multiple data paths are supported in-page.

### SA-09 — End-to-start restart announces play before committing time (P2)

`animation/animation-controller.js:139-150` directly rewinds internal time,
then publishes play without `onTimeChange`. The synchronous playback/media
event path reads the old session time. Probe: start=10/end=100, goToEnd/play;
play callback sees controller=10, published=100.

Fix normal time commit before play notification. Test callback order and
controller/session/label/media equality, with ordinary pause/resume unchanged.
Full-browser restart failure was not measured.

### SA-10 — Hidden mobile state overwrites desktop FoV (P2)

`ui/mobile-view-fov-sync.js:226,271` schedules/applies mobile auto-FoV without
checking viewport ownership; `mobile-mission-card-sync.js:659` schedules it on
resize. Probe with desktop viewport and retained mobile Views tab: FoV 50
degrees becomes 5.904 degrees. Guard both scheduling and callback execution;
test mobile Views to desktop with queued RAF, resize and camera changes.

### SA-11 — Compact layout discards explicit user geometry (P2)

`app/progressive-workspace.js:18` and `core/domain/workspace-disclosure.js:32`
reconcile all constrained persistence against frozen expanded geometry.
Browser: at 1366x768, composer divider 507 to 437 pixels, saved JSON unchanged,
reload restores 507. Distinguish user edits from automatic hiding/resizing;
test divider/tab changes, reload and return to expanded layout.

### SA-12 — Reset View retains the selected secondary tool (P2)

`app/progressive-workspace.js:114` resets geometry but not `selectedTool` or
`pendingTool`. Browser at 800x700: choose Craft-to-Moon, Reset View; only
`aux:moon` remains visible. Reset transient tool selection too; test reset at
every disclosure level, including a pending not-yet-created tool.

### SA-13 — Automatically hidden groups retain keyboard ownership (P2)

`app/progressive-workspace.js:67` only calls `setVisible(false)`. Browser after
returning to Scene at 800x700: 13 Tab presses focus Flyby Broadcast while its
group says `isVisible=false`. Synchronize focus eligibility/inert state with
derived visibility; test traversal and restoration without losing user focus.

### SA-14 — Popout controls retain opener-window geometry (P2)

`ui/composer-disclosure.js:5,34` captures original document/window. Browser
detached composer 480x360: View popover left=47, width=464, right=511. Resolve
the current element owner document/window; migrate window listeners on
adoption. Test narrow popout bounds, focus and redocking.

### SA-15 — Requested comparison silently becomes base-only (P2)

`app/comparison-overlay-loader.js:128-158` returns unchanged base config on a
requested secondary mission's 503; orchestration marks that successful. Probe
returns one craft and no overlay. The previous specification did not choose
between retryable failure and explicit partial mode.

**User decision on 2026-09-16: show a comparison error with Retry.** Recorded
in the owning [comparison specification](../../specs/modes/orbit-comparison.md).
Implement retryable required-comparison failure, preserving valid cached base
data without caching comparison failure as readiness. Test secondary 503,
invalid config, retry success and unaffected ordinary non-compare mode.

### SA-20 — Panel registry snapshots alias mutable nested data (P3)

`app/panel-registry.js:4` shallow-copies descriptors. Probe mutating
`getMissionPanelDetails(id).infoItems[0].value` changes the next registry read
without an update/notification. Production nesting is mainly display metadata.
Detach nested descriptor data while preserving action flags; test snapshot
mutation, registration/update input aliasing and notifications.

## Design Risks And Decisions

- **SA-16 — Scene/legacy mirror isolation (design risk).**
  `app/scene-view-state.js:49-129` writes global mirrors even for explicit
  inactive-scene setters; absent-scene zoom/pan reads use unscoped legacy values.
  Plane reads already restrict fallback to the active origin. Current callers
  mostly pass the active origin, so no live UI failure was established. Add
  inactive-origin/missing-scene regressions before narrowing the adapter.
- **SA-17 — Shared Moon texture lifetime (design risk).**
  `moon-render-profile-actions.js:131-148` shares texture objects across scenes,
  while `rendering/moon-renderer.js:1911-1934` disposes them per renderer. Define
  shared/refcounted ownership or per-renderer resources; test one consumer's
  disposal while another remains. No GPU failure proved.
- **SA-18 — Scene disposal contract (design risk).**
  `scene-dispose-actions.js:2-36` advances generation and destroys renderers but
  leaves `initialized3D` true and does not immediately abort texture requests.
  Current origin switching stops/deletes the scene, reducing exposure. Define
  terminal disposal/reuse semantics before changing this contract.
- **SA-19 — Dormant/unkeyed resource paths (conditional risks).**
  Async GLTF model loading lacks identity after disposal, but active startup
  uses synchronous craft creation. The lunar-feature catalog singleton ignores
  optional alternate URL; production currently uses one catalog. Orbit-overlap
  refinement is disabled. Track these before enabling/hot-switching those paths,
  not as demonstrated active failures.
- **SA-21 — Workspace lifecycle/focus ownership (design risks).**
  Registry Focus reaches `panel-layout-host.js:255` without passing through
  progressive visibility ownership; repeat the suspected invisible-focus path
  after stable default-layout readiness. `experimental-dockview-host.js:1621,1633`
  does not cancel its initial eight-second callback or clear its published
  global pointer on disposal. Test disposal/replacement before that callback.
- **SA-22 — Mobile-to-desktop initialization symmetry (contract review).**
  Dockview bootstrap policy and `scene-handler-class.js:79` evaluate initial
  width; widening a fresh mobile session does not instantiate all desktop
  owners. Decide and document whether adaptive startup or reload is required,
  then cover that contract. Do not confuse this with SA-10's proved unauthorized
  mobile FoV write into an already-existing desktop scene.

## Inspected Without An Additional Finding

- Existing RTA-01/02 orbit, 2D and runtime-init revision protections, RTA-04
  retry outcomes and RTA-05 landing readiness remain present.
- Generic cached loader shares pending requests and evicts failures; worker
  decode subscribers release/abort and workers terminate on terminal outcomes.
- Deferred decorations, normal refresh and Moon observer/profile loads have
  generation/renderer guards in the inspected paths.
- Comparison normalization does not mutate raw ephemeris in the inspected
  paths; reload-based mode navigation is intentional, not a missing hot switch.
- One main clock tick driver found. Controller/session duplication requires
  commit ordering, but separate FPS/frame bookkeeping is not a second clock.
- Mutable session flag proxies are explicit compatibility adapters, not hidden
  duplicate storage. Loop snapshots are copied. Lunar-feature view snapshots
  normalize/copy arrays and filters; an external excluded-key mutation probe
  did not mutate stored state.
- Maximized composer to focused layout to Scene navigation worked in the
  browser; the suspected navigation defect was not retained.
- Progressive startup timeouts remain intermittent. No cause was established
  by this audit; do not claim the configuration fix resolves that symptom.

## SA-01 Implementation And Verification

Implementation introduces request/origin/revision/scene/caller guards at the
configuration activation boundary; mission configuration loads/publishes once
per pending operation. Shared load failure is evicted for explicit retry.
Superseded configuration hands off through the existing bounded startup policy.

Eight new contract tests failed before implementation. Independent review found
one edge case: a cancelled caller incremented the attempt number and invalidated
valid pending work. Entry validation now precedes ownership acquisition, with
a dedicated regression. Final independent review cleared the implementation;
each audit reviewer also checked the consolidated findings for fidelity.

Verification:

- Full unit suite: **1,643 passed, six skipped, 220 files** (14 new tests).
- Fast transition unit suite: **201 passed, 21 files**, now including the new
  configuration-flow regressions.
- Browser recovery and runtime transition suites: **seven passed**, including
  configuration failure/Retry with the CY3 SSIM Dockview policy, origin switch
  during Retry, cold/warm origins, dimension roundtrips and paused camera changes.
- `npm run configs:lint`: **40 artifacts**, sync and time-scale checks passed.
- `npm run build`: passed, including generated mission pages and Moon worker.
  Existing classic-script, Three.js `sRGBEncoding` and large-chunk warnings remain.

Reproduction commands use `npm.cmd` in PowerShell for forwarded arguments:

```powershell
npm.cmd run test:unit -- --reporter=dot
npm.cmd run test:transitions:unit -- --reporter=dot
.\node_modules\.bin\vitest.cmd run test/load-recovery-interaction.test.js test/runtime-transition-interaction.test.js
```

The initial survey's scratch media/panel/camera probes remain ignored under
`.tmp/`; their observed sequences are preserved above. Before each queued fix,
promote its desired-contract reproduction into tracked tests. SA-01's tracked
tests are `test/init-config-flow-state.test.js`, expanded config orchestration
and recovery tests, and the revision-wiring test. No camera/media/render/panel
fix is bundled here.

No deployment. At this checkpoint the coverage shortfall, historical SSIM
disposition and browser startup flake remained tracked; no thresholds, skips or
baselines were changed. The state campaign and SSIM disposition were later
completed. The unit coverage gap and combined browser-startup diagnosis remain
active in the
[current context checkpoint](../handoffs/current-context-2026-09-18.md).
