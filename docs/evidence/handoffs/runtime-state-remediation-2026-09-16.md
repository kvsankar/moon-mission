# Runtime State Remediation — Interrupted Session Handoff

Saved 2026-09-16 at the user's request because credits were running low.
This is a continuation note, **not another roadmap**.

## Closed historical checkpoint

**Do not resume from the instructions below.** Work resumed later, the dirty
SA-21 slice was completed, and every SA-01 through SA-22 audit item was closed,
reviewed, committed and pushed. Transition/SSIM disposition is also complete.
The details below intentionally preserve the exact interruption point and are
not current instructions.

Use the [current context checkpoint](current-context-2026-09-18.md), the
[mutable roadmap](../../plans/roadmap.md), and the
[remediation log](../reviews/runtime-state-remediation-2026-09-16.md) for current
status.

## Historical instructions at interruption

The active request is to fix **all items in the runtime state audit**, using
TDD, and review/fix findings before closing each item. Work is intentionally
paused, not complete. Resume from the dirty worktree; do not restart or discard it.

Standing user requirements:

- Commit **and push** each completed, verified slice.
- **No deployment without explicit authorization.** None has been performed.
- Keep one authoritative roadmap: [roadmap](../../plans/roadmap.md).
- Detailed human UX review remains deferred until other roadmap work finishes.
- Preserve scene/playback priority as screen real estate shrinks.
- Required comparison failure must show a comparison error with **Retry**,
  never silently fall back to the primary mission alone.
- Do not lower thresholds, skip regressions, or regenerate SSIM baselines to
  hide failures. Historical scene SSIM discrepancies and the pre-existing
  coverage gate failure remain separate roadmap work.
- Runtime data in sibling `moon-mission-data` is not being changed. No generated
  ephemeris, data staging, or deployment is authorized by this handoff.

Canonical task records:

- [Audit inventory](../reviews/runtime-state-audit-2026-09-16.md): 16 confirmed
  gaps plus six risk areas; not a claim that every possible state bug was found.
- [Per-item TDD/review evidence](../reviews/runtime-state-remediation-2026-09-16.md).
- [Ordered implementation plan](../../plans/implementation/runtime-architecture-followups.md).
- [Developer guide](../../operations/contributor/developer.md).
- [Architecture index](../../designs/README.md).

## Environment and safe commands

- Repository: `C:\sankar\code\kvsankar\moon-mission`, PowerShell.
- Branch: `master`; remote: `git@github-kvsankar:kvsankar/moon-mission.git`.
- Latest committed/pushed HEAD: **`0d31ca3`**. Everything currently dirty belongs
  to the unfinished SA-21 slice, its tests, or the documented priority reorder.
- Node 22.15.0, Vitest 4.1.11, Vite 7.3.6.
- Local Vite test server was already running at **http://127.0.0.1:8111/**.
  Old server process session was 61071; verify availability before restarting.
  Setup/dependencies/assets were already installed/staged and used successfully.
- Use `npm.cmd`, not the PowerShell npm shim, when forwarding `--` arguments.
- Node/esbuild/Playwright workers and Git writes/network have required elevated
  sandbox calls in this environment. The user has authorized commit/push, not deploy.
- Edit with `apply_patch`. Never reset/checkout away the current changes.
- Use `rg --files` to locate files before reading guessed names. Windows `rg`
  file globs belong in `-g`; paths like `app/dockview*.js` do not expand.
  Native executable pipes to PowerShell sometimes fail in the sandbox; use
  `Select-String` directly or a plain `rg` command instead.
- Do not modify runtime source while a browser test runs: Vite HMR can invalidate
  its scene/workspace handles. Freeze, run, inspect, then edit.
- Full unit suite takes roughly 2–3 minutes. Preserve the existing six skips.
- `npm.cmd run test:unit -- --reporter=dot --reporter=json --outputFile=.tmp/name.json`
- Browser suites are opt-in and excluded from `test:unit`; use
  `.\node_modules\.bin\vitest.cmd run test/<suite>.test.js --reporter=verbose`.
- `.tmp/`, screenshots/current, and `dist/` are ignored. Build is local only.
- Any process interrupted by the final user interruption may have partially
  executed. Inspect before resuming; do not assume the last patch/test completed.

## Completed and pushed

Earlier completed slices (details in the remediation log):

| Commit | Completion |
| --- | --- |
| `0a41290` | Vitest/coverage 4 migration; npm audit zero at that checkpoint |
| `1f20625` | Initial comprehensive state audit and SA-01 configuration ownership |
| `7c5c605` | SA-02 foreground media session ownership |
| `3891023` | SA-07 terminal media coordinator disposal |
| `afa2032` | SA-03 / RTA-06 authoritative main-camera intent and retry ownership |
| `f571975` | SA-04 exception-safe annotation presentation restoration |
| `3490a20` | SA-05 curve construction/resource lifetime and reentrant cleanup |
| `fd6e40b` | SA-06 producer acceptance checkpoint; deliberately not closed yet then |
| `29f6fdc` | SA-17 shared texture ownership; 1,778 unit + 7 browser checks |
| `d7c4b81` | SA-18 terminal scene disposal; closes SA-06 receiver dependency; 1,812 unit + 10 browser checks + build |
| `9f45494` | SA-09 restart-time publication before Play; 1,816 unit + direct browser event-order check |
| `2a32f93` | SA-10 mobile-only FoV ownership; 1,823 unit + 2 mobile/desktop browser checks |
| `f863196` | SA-15 required comparison error/Retry; 1,860 unit, recovery browser checks, review validation fixes |
| `0e4491e` | SA-08 explicit media manifest recovery; 1,892 unit + real keyboard Retry browser check |
| `0d31ca3` | SA-13 hidden workspace keyboard ownership; 1,910 unit + progressive browser checks/review fix |

All full unit counts above retain six pre-existing skips. The last fully
verified/pushed tree is `0d31ca3`: **1,910 passed, six skipped, 239 files**.
The current dirty SA-21 work has **not** had final full-suite/browser verification.

Important completed implementation contracts:

- SA-17 `rendering/texture-ownership.js` provides unique per-owner leases,
  incoming-before-outgoing retention, reentrant disposal bookkeeping, later
  ownership epochs, and DEM/physical-normal dependencies. Actual Earth, Moon,
  legacy Sky and runtime `SkyController` participate. Scene input leases cover
  pre-renderer/adoption-failure orphans, including Earth photo aliases.
  `disposePrevious:false` deliberately relinquishes without destruction.
- Review caught dependency listener ordering and repeated texture destruction
  after a native geometry/material cleanup failure; both are regression-tested.
- SA-18 `app/scene-lifecycle.js` owns scene cleanup subscriptions. Scene disposal
  marks `disposed`, stops creation, sets numeric state -1, revokes generation/
  texture tokens and loading metadata **before** callbacks. It drains accepted
  scene textures even after adapter failure. Disposed scenes are replaced, not
  resurrected. Real curve cleanup cannot raise terminal readiness to 2.
- Scene texture-init owns preview/main/profile controllers, cancellable idle/
  RAF waits, stale-result cleanup, and guarded success/error/finally publication.
  Waiting promises settle even if a loader ignores cancellation. Only that
  scene's work is cancelled. Global quality-choice cancellation still works.
- SA-09 uses a committed `transport-restart` seek through `setTime` before Play.
  Ordinary resume is seek-free; real session/scene/timeline callbacks are tested.
- SA-10 guards mobile FoV writes and both scheduled RAF stages by viewport;
  a revision prevents stale mobile→desktop→mobile refresh revival.
- SA-15 `ComparisonLoadError` propagates required config/metadata failures into
  comparison-specific error/Retry UI. Valid primary config remains cached and
  unmodified. Optional manifest 404 is absence; other HTTP/network/parse/shape
  failures reject. Review fixed null timestamps becoming epoch-zero ranges and
  malformed manifest structures silently falling back to generated URLs.
- SA-08 media loader caches success/404 by resolved URL, never failures; typed
  errors distinguish HTTP/network/parse/shape. Coordinator owns URL/attempt/data
  path, keeps recoverable failure accessible, and retries only on explicit
  `retryManifest`. `#media-browser-manifest-retry` is keyboard accessible.
- SA-13 uses owned native `inert` suppression keyed by element identity, preserves
  pre-existing inert/hidden state, restores on reveal/rebuild/removal/floating/
  disposal, and moves focus to visible Tools/Scene controls. Review fixed
  synchronous disposal during visibility/constraints/activation/layout effects.
  It intentionally does **not** clear Reset View's selected/pending tool state.

## Historical active slice: SA-21 workspace lifecycle — not closed at interruption

SA-21 was brought forward before SA-12 because a cold startup defect blocked
reliable workspace verification. The reorder is already in the dirty roadmap
and implementation plan. SA-13 itself is closed; the independent startup gap
remained explicitly open rather than being hidden by retries/timeouts.

### Confirmed startup cause and browser proof

`initializeExperimentalDockviewHost` originally subscribed to the panel registry
before publishing `globalThis.__moonMissionDockviewSpike`. Subscription invokes
its callback synchronously. Already-available media restore/open actions could
not discover a host, so they remained floating. The pending-default list removed
their IDs merely because `invokeMissionPanelAction` returned true (that only
means a callback existed), not because `api.getPanel(id)` existed. Later identical
media contexts skip reapplication. This left six panels, missing both media
workflows, and generic groups 1..5 instead of the named default arrangement.

Repeated browser failures reported scene loading ready, no page errors, valid
local media manifest HTTP 200, and media availability true. This is not evidence
of a missing data file or SA-08 fetch failure.

Root added a **deterministic RED browser test** in
`test/progressive-workspace-interaction.test.js`:

1. Intercept `/src/platform/js/app/experimental-dockview-host.js` including its
   Vite `?t=...` query and hold the response.
2. Wait until a real scene initializes and media registry descriptors are
   available/open.
3. Release the import.
4. Require both media panels and named default layout within 10 seconds.

Against old production this consistently retained exactly six panels and timed
out after release. Also confirmed a separate registry Focus RED after stable
eight-panel readiness: action returned true but collapsed Flyby Broadcast stayed
`visible:false, inert:true`, with Main View still active.

Browser harness detail: Vitest rewrites native `import()` in serialized function
closures to SSR helpers. Use an executed browser string IIFE for registry imports.
Import the app's actual already-loaded `panel-registry.js` URL from
`performance.getEntriesByType('resource')`, preserving Vite's version query,
otherwise a second registry module instance can be accidentally created.
The current tests contain these corrections. Earlier fixture serialization/
barrier failures are NOT product RED evidence.

### Current dirty implementation and ownership

Former lifecycle agent was editing:

- `src/platform/js/app/experimental-dockview-host.js`
- tiny `subscribeMissionPanels` initial-notification exception cleanup in
  `src/platform/js/app/panel-registry.js`
- new `test/dockview-host-lifecycle.test.js`
- `test/panel-layout-host.test.js` (new RED cases)
- Expected remaining implementation in `panel-layout-host.js` — **this source
  was NOT modified in the final inspected Git status**, despite new tests.

Already implemented/in progress in host:

- Publish owned host before synchronous default-opening callbacks.
- Fulfil pending defaults only when the panel actually exists.
- Remove the eight-second discard deadline; retain readiness subscription until
  intent is fulfilled or owner retires.
- One-time default-close intents and focus only on actual initialization progress,
  so permanently unavailable defaults do not repeatedly close user panels or
  steal focus on unrelated registry updates.
- Owned deferred-work helper for timers, RAFs, microtasks; main renderer/ribbon
  child lifetimes; terminal/idempotent disposal; identity-aware globals/classes.
- Handle synchronous initial registry listener failure by unregistering it,
  disposing partially initialized host, then rethrowing.
- Cleanup after individual adapter failure; renderer cleanup ledger.
- Several post-effect reentry guards, including focus→dispose→save.

Root edited explicit registry Focus routing:

- Added `focusDockviewWorkflowPanel` to `dockview-workflow-panels.js`.
  Explicit Focus uses `workspace.progressiveWorkspace.revealPanel(id)`; if that
  returns false, do NOT fall through to raw focus. Hosts without progressive
  disclosure retain raw focus fallback. No workspace returns false.
- `media-browser-panel.js`, `ground-track-panel.js`, `auxiliary-camera-views.js`
  now route only their explicit registry Focus callbacks through that helper,
  after their existing restore/open behavior. Automatic Open/Restore is meant
  to stay raw so initialization does not select a secondary tool.
- `background-media-panel.js` has an **outstanding review bug**, described next.
- New `test/dockview-workflow-focus.test.js` has four contract tests, green before
  the interruption. Root's focused helper/media/background/focus run was 66 green
  before the new background regression was added.

### EXACT interruption point — first action on resume

Review found that background `openPanel()` also calls its internal `focusPanel()`.
Root had changed that shared function to progressive reveal, inadvertently
making automatic Open/Restore reveal Flyby Broadcast and hide Scene in focused
layouts. Other three explicit Focus callback changes are correctly isolated.

A tracked failing case now exists in `test/background-media-panel.test.js`:
**“reveals only explicit registry Focus, not automatic background Restore”**.
It invokes the real panel registry and fails because Restore calls reveal once.
The last test run was **one expected failure** (26 unrelated cases filtered).

The user interrupted an `apply_patch` + test command intended to fix it.
Final read-only inspection confirmed the patch **did not land**:

```js
// Still on disk at handoff:
focus: panelAvailable ? focusPanel : null,
function focusPanel() { ... focusDockviewWorkflowPanel(BACKGROUND_MEDIA_PANEL_ID); ... }
```

Intended minimal correction:

```js
focus: panelAvailable ? () => focusPanel({ reveal: true }) : null,

function focusPanel({ reveal = false } = {}) {
    // keep existing panel/hidden guards
    if (isBackgroundMediaPanelDocked(panel)) {
        if (reveal) focusDockviewWorkflowPanel(BACKGROUND_MEDIA_PANEL_ID);
        else getDockviewSpikeLayoutHost()?.focusPanel?.(BACKGROUND_MEDIA_PANEL_ID);
    }
    panel.focus?.();
}
```

Then run background panel/helper/media tests. **Do not assume any aborted test
command ran or passed.** No SA-21 commit has been created.

### Other SA-21 review findings / unfinished checks

The lifecycle agent was interrupted while addressing these. Read current source
and new tests; some host guards may already be patched, but no final verification
exists after the latest edits.

1. Captured `renderPanel` factory invoked after retirement must not mount DOM or
   schedule work. A detached inert placeholder return is acceptable.
2. Failure inside `createPanelLayoutHost` before host cleanup is established must
   release root/strip/classes/deferred work and rethrow. If the native Dockview API
   was allocated before setup fails, the lower-level layout host must dispose it.
   New `test/panel-layout-host.test.js` cases exist; source fix was still absent.
3. A mounted-element event can synchronously dispose the host during renderer
   creation, before cleanup is registered. Check ownership after factory effects
   and retire any just-created renderer rather than leaking it.
4. Old renderer cleanup must not restore/reclaim DOM nodes already adopted by a
   replacement renderer. New tests cover main-view strip ownership.
5. Main-close/Reset fallback focus can synchronously retire the host; do not
   subsequently save/layout. Guards/tests were being added.
6. Initial registry callback failure must not leave an unreachable subscribed
   listener; the narrow registry try/catch removes it and rethrows.
7. Repeated default callbacks while an optional panel stays unavailable must not
   keep closing an explicitly reopened panel or refocusing Main. One-time intent
   tracking was added and tested earlier.

Last agent reports (NOT final assurance for the current tree):

- Initial host TDD: **9 failed / 1 passed** before implementation.
- Four additional review/reentry RED cases fixed, then **51 focused tests** passed
  across host lifecycle/helpers, registry and progressive-focus suites.
- Further residual boundary run: **7 new failures / 20 passed** across host/native
  layout tests before latest fixes. Extra mounted-event/replacement ownership
  cases were subsequently being added.
- UI reviewer has **not cleared SA-21**. It flagged the background routing bug and
  the lifecycle boundaries above. Obtain a fresh independent review after fixes.

Suggested verification once stable:

```powershell
.\node_modules\.bin\vitest.cmd run test/dockview-host-lifecycle.test.js test/experimental-dockview-host.test.js test/panel-layout-host.test.js test/panel-registry.test.js test/progressive-workspace-focus.test.js test/dockview-workflow-focus.test.js test/background-media-panel.test.js test/media-browser-panel.test.js --reporter=verbose
.\node_modules\.bin\vitest.cmd run test/progressive-workspace-interaction.test.js --reporter=verbose --reporter=json --outputFile=.tmp/sa21-browser.json
npm.cmd run test:unit -- --reporter=dot --reporter=json --outputFile=.tmp/sa21-unit.json
```

Verify actual test filenames with `rg --files` before invoking. Browser suite now
contains six cases: controlled late host, registry Focus across background/media/
Moon/composer, keyboard isolation, progressive levels/restoration, compact composer
controls, constrained reload. Do not change its expected panel counts/timeouts to
hide startup failures. Re-review findings, update evidence/plan, then commit AND
push only when SA-21 genuinely passes. No deployment.

## Historical remaining items after SA-21

### SA-12 — Reset View selection (next)

Confirmed: at focused width, reveal Craft→Moon then Reset View leaves that tool
selected. `selectedTool` and `pendingTool` survive `captureExpandedLayout()`.
Do not indiscriminately clear them on ordinary capture, which also runs during
late default initialization. Actual reset is in `experimental-dockview-host.js`
(`resetDockviewWorkspaceLayout`, formerly around 1524); success/fallback currently
call raw `layoutHost.focusPanel(MAIN_VIEW_PANEL_ID)`.

Possible smallest fix: actual Reset routes Main through progressive `revealPanel`
(which already clears selected/pending tool) rather than raw focus. Preserve
automatic capture behavior and do not reset mission time/camera. Consider reset
fallback and pending-tool arrival. Browser control is visible **Reset View** in
the launch strip/Tools menu. Reproduce before changing it. SA-21 agent was told
not to fix this implicitly.

### SA-11 — Persist explicit compact-layout edits

Confirmed: at 1366x768, composer divider 507→437px did not alter saved JSON;
reload restored 507. Need explicit user-edit provenance, not wholesale compact
snapshot persistence. Preserve expanded geometry of hidden panes.

Previously researched installed Dockview 6.3 APIs:

- `onDidLayoutChange` is `Event<void>` and microtask-batched (`AsapEvent`), without
  a reason flag. A synchronous `applying` boolean is insufficient.
- Public `onDidMovePanel`, `onWillDragPanel/Group` exist.
- `onDidDrop` is for **unhandled** drops, not ordinary successful move completion.
- Divider `onDidSashEnd` is internal, not exposed by DockviewApi.
- Hidden leaves serialize cached size with `visible:false`.

Suggested design: explicit host `commitUserLayoutEdit({kind,before,after})` port;
an isolated `.dv-sash` pointer transaction captures before/after and completes
after Dockview handles pointerup. Use owner document, detach on dispose, invalidate
on viewport/disclosure interruption. Use public drag/move events and explicit
commands for tab moves. Pure reducer applies visible sibling proportions within
the expanded size budget, preserving hidden branches and float/popout records;
explicit tab edits update order/membership/active tab. Avoid inferring all changes
from dimensions or `onDidLayoutChange`.

Likely files: `panel-layout-host.js`, `progressive-workspace.js`,
`core/domain/workspace-disclosure.js`, their tests and progressive browser suite.
Tests: nested/vertical proportion edits, hidden geometry, min-bound no-op, reorder/
transfer/group move, input immutability, passive resize versus explicit edit,
interrupted/disposed gestures, compact save→reload→expand and real divider drag.

### SA-14 — Popout ownership

Confirmed: composer View popover in a 480px popout has right edge ~511, because
geometry/listeners use opener `window`. Use dynamic `ownerDocument.defaultView`,
rebind resize/listeners across adoption/redock, and dispose old realm handlers.
Main area is `auxiliary-camera-views.js` (large module); inspect relevant composer
popover helpers, do not broadly reformat/refactor it. Browser popout test needed.

### SA-20 — Registry snapshots

`panel-registry.js` shallow snapshots expose nested `infoItems[0].value` and other
descriptor data to mutation without notification. Deep-detach owned descriptor
data on input and reads while preserving action availability/callback semantics.
Test input aliasing, nested snapshot mutation, updates and notifications. Preserve
the current SA-21 initial-subscription exception cleanup hunk.

### SA-16 — Scene compatibility mirrors

Probe proved setting inactive lunar zoom to 9 changed active legacy zoom to 9,
and missing inactive-origin read returned 9. Contract:

- Existing explicitly requested scene reads/writes its own state.
- Legacy mirrors track active scene only.
- Missing inactive scene reads defaults and writes do not mutate active mirror.
- Missing active scene retains startup fallback.
- Inactive plane sync does not write visible UI controls.

Files: `app/scene-view-state.js`, `core/domain/scene-view-state-core.js`.
TDD all mirror fields and origin round trips.

### SA-19 — Dormant resource paths

- GLTF completion after renderer disposal attaches a new craft. Guard generation
  and wrapper renderer identity, dispose late GLTF resources, settle cancellation.
  Files `rendering/spacecraft-renderer.js` (~533) and spacecraft model actions;
  test late/out-of-order/replacement, not only current synchronous startup.
- Lunar catalog singleton ignores optional URL A→B: fetches A once and returns A
  for B. Key cache/in-flight work by resolved URL, preserve default catalog getter,
  let failures retry. Avoid unnecessary schema changes.
- Orbit-overlap refinement is disabled by constant. Keep it disabled, add a gate
  regression proving no Worker construction, and record a justified no-change
  disposition. Do not enable dormant work merely to close a risk item.

### SA-22 — Live viewport capability bootstrap

No new product choice is needed: existing specs require mobile→desktop adaptation.
Current `mission.js` near 978–991 chooses Dockview once, and SceneHandler only
constructs `DesktopPanelManager` initially above 600px. Introduce owned lazy
viewport capability activation; create desktop facilities once without resetting
time/camera, preserve saved layout across crossings, respect explicit legacy/config
disable (especially CY3 SSIM), invalidate a pending import if viewport ownership
changes, and prevent duplicate controllers. Primary scene/playback stay prioritized.
The SA-21 host changes must remain protected.

## Historical review and evidence instructions

Previous agents were stopped for this handoff. Their names were
`lifecycle_design_audit`, `transition_design_audit`, `ui_technical_review`; a fresh
session may not have access to them. Do not depend on their private context.
Follow current session policy about agents; do not spawn new agents unless the
user/applicable instructions authorize it. Independent review can use available
authorized reviewers or a clearly separated review pass.

For each remaining slice: meaningful RED → minimal fix → code review → reproduce
and fix review findings → focused/full/proportional browser verification → evidence
and roadmap update → commit AND push. The task is not done after first green.

Known unrelated gates: historical full SSIM is not green and was not rebaselined;
coverage thresholds are pre-existing red after the documented Vitest migration.
The local build last passed at SA-18 with existing classic-script, Three.js
`sRGBEncoding`, and large-chunk warnings. No deployment, no data-repo writes.

The final interruption was intentional to conserve credits. Do not continue
implementation merely because this handoff exists; resume when the new user
session asks you to continue.
