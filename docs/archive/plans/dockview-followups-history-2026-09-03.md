# Dockview Panel Layout Integration Plan

Date: 2026-05-19

## Goal

Introduce Dockview Core as the desktop layout engine for mission workflow panels while preserving the existing mission panel registry, panel launcher, URL behavior, and mobile experience.

The user-facing target is a more deliberate mission workspace:

- dock panels beside or below the orbit scene
- resize panels with predictable splitters
- group related panels as tabs
- restore the same layout after reload
- optionally float or pop out focused panels

## Guiding Principles

- Keep `panel-registry.js` as the app-owned source of panel identity, lifecycle actions, titles, and availability.
- Treat Dockview as a layout renderer, not as the mission panel model.
- Keep the first release desktop-only.
- Do not migrate all panel types at once.
- Keep existing overlay panels available until Dockview behavior is proven.
- Store Dockview layout snapshots alongside the current `moon-mission:panel-layout:v1:<missionKey>` payload during migration.
- Make every phase shippable and reversible behind a feature flag.

## Phase 0: Spike And Decision Gate

Purpose: prove Dockview Core can coexist with the full-screen orbit scene.

Work:

- Add `dockview-core` as an experimental dependency.
- Create a small local prototype module, not wired into normal runtime by default.
- Mount a Dockview host behind a query flag such as `?dockPanels=1`.
- Render two placeholder panels inside Dockview.
- Verify pointer behavior:
  - orbit scene remains interactive when no docked panel covers it
  - docked panels can receive pointer/keyboard input
  - header pills and timeline remain usable
- Verify serialization with `api.toJSON()` and restore with `api.fromJSON()`.

Exit criteria:

- Artemis II loads normally with and without the flag.
- Dockview does not break canvas/SVG interaction outside its visible pane area.
- A saved Dockview layout can survive reload.

Rollback:

- Remove the dependency and prototype module. No production behavior depends on it.

## Phase 1: Layout Host Adapter

Purpose: isolate Dockview from app code.

Work:

- Add `src/platform/js/app/panel-layout-host.js`.
- Expose app-owned operations:

```js
createPanelLayoutHost({
    container,
    missionKey,
    panels,
    renderPanel,
    onPanelFocus,
    onPanelClose,
    onPanelLayoutChange,
});
```

- The adapter owns:
  - Dockview creation/disposal
  - panel add/remove/focus calls
  - layout serialization
  - resize notifications
  - feature-flag checks
- Existing feature modules continue to own panel content and state.
- Add a small event or callback contract for "panel was resized" so Leaflet, Three.js, and media views can redraw.

Exit criteria:

- Unit tests cover layout-host serialization fallback and lifecycle mapping.
- No feature panel imports Dockview directly.

Rollback:

- Disable the feature flag and keep using current overlay panels.

## Phase 2: Dock One Workflow Panel

Purpose: migrate the lowest-risk real panel first.

Status: `Mission Media` and `Flyby Broadcast` are mounted into the Dockview host through `panel-layout-host.js` on desktop. Legacy overlay behavior remains available with `?legacyPanels=1` or `?dockPanels=0`.

The Dockview shell is also movable by dragging its toolbar and resizable from its bottom-right corner. Shell geometry is persisted separately from the Dockview panel layout.

Recommended first panel: `workflow:media-browser`.

Why:

- It is already config-gated.
- It is closed by default.
- It has obvious UX value when docked next to the mission view.
- It does not need to be visible on every mission.

Work:

- Let `media-browser-panel.js` render its content into a host element supplied by the layout adapter when Dockview mode is active.
- Disable its custom drag, z-order, and corner resize behavior while docked.
- Map current registry actions:
  - `open` adds or focuses the Dockview panel
  - `focus` activates the panel
  - `close` closes or hides the Dockview panel
  - `restore` re-adds the panel if absent
- Preserve media-specific state:
  - selected media item
  - filters
  - playback status
  - image zoom/pan
- Notify media layout code after Dockview resize.

Exit criteria:

- Header `Mission Media` pill opens the docked panel.
- Settings `Panels` section can focus/close/reopen it.
- Panel content works after resize and reload.
- Existing non-Dockview behavior still works when the flag is absent.

Tests:

- Targeted browser test for `/artemis2/`.
- Existing media panel unit tests remain green.

## Phase 3: Add Splashdown Workflow

Purpose: validate Dockview with a map/globe panel and mission timeline coupling.

Status: initial `Splashdown in Spotlight` migration is implemented for the desktop Dockview workspace. The existing ground-track panel is mounted into the Dockview host, skips legacy overlay drag/maximize behavior while docked, and schedules Leaflet/Three.js resize work after Dockview layout changes. Legacy overlay behavior remains available with `?legacyPanels=1` or `?dockPanels=0`.

Panel: `workflow:splashdown`.

Work:

- Render `Splashdown in Spotlight` inside Dockview when Dockview mode is active.
- Preserve its 2D/3D mode controls.
- Trigger Leaflet map invalidation and Three.js renderer resize after layout changes.
- Keep `autoOpenBeforeEvent` behavior mapped through the registry.
- Confirm docked layout does not block timeline transport or header pills.

Exit criteria:

- `Splashdown` pill opens/focuses the docked panel.
- 2D map and 3D globe survive docking, resizing, tabbing, and reload.
- Auto-open still works near the configured return event.

Tests:

- Browser test for open, resize, switch 2D/3D, reload restore.

## Phase 4: Tabbed Workflow Workspace

Purpose: unlock the core user experience improvement.

Status: desktop workspace behavior is now expanded beyond workflow-only panels. The host starts as a real mission workspace: `Flyby Broadcast` and `Mission Media` open in a left rail, the main mission view sits in the center, and `Frame and Shoot` plus a vertical aux stack (`Craft -> Moon`, `Craft -> Earth`, `Orbit`) open in a right rail. `Splashdown in Spotlight` joins the same Dockview workspace when opened, but remains closed by default. Dockview tab closes synchronize back to the panel registry.

Work:

- Define the default Dockview layout for Artemis II:
  - left rail: `Flyby Broadcast` above `Mission Media`
  - center: main orbit scene
  - right rail: `Frame and Shoot` beside a vertical aux stack with `Craft -> Moon`, `Craft -> Earth`, and `Orbit`
  - `Splashdown in Spotlight` is available but closed by default
- Add layout reset action for broken or unwanted layouts.
- Persist Dockview layout JSON in a new versioned field, for example:

```json
{
  "dockview": {
    "version": "dockview-v1",
    "layout": {}
  }
}
```

- Keep old `rect` geometry in place for panels that still use overlay layout.

Exit criteria:

- Users can drag panels between groups, tab them together, and restore the layout after reload.
- A "Reset panel layout" action returns to the mission default.
- Bad persisted Dockview JSON recovers gracefully.

Tests:

- Unit test corrupted layout recovery.
- Browser test layout reset and reload restore.

## Phase 5: Evaluate Auxiliary Camera Panels

Purpose: decide whether Dockview should own view panels too.

Panels:

- `aux:earth`
- `aux:moon`
- `aux:earth-moon`
- composer/flyby panel only if the simpler aux panels succeed

Work:

- Try one non-composer auxiliary camera panel inside Dockview.
- Ensure render loops, aspect ratios, FoV controls, hover labels, and crater controls still work.
- Compare UX against the current floating mini-view stack.

Decision:

- If Dockview improves these views, migrate the simple aux panels.
- If the floating mini-view model is better for quick visual reference, keep aux panels outside Dockview and use Dockview only for larger workflow panels.

Exit criteria:

- Explicit decision recorded in the panel system spec or this roadmap.

## Phase 6: Default-On Rollout

Purpose: make Dockview the normal desktop workflow-panel experience.

Status: Dockview is the normal desktop workflow-panel experience. `?legacyPanels=1` and `?dockPanels=0` are the temporary emergency fallback paths. Mobile remains unchanged.

Work:

- Remove the query flag for supported desktop missions.
- Keep an emergency fallback flag for one release cycle, such as `?legacyPanels=1`.
- Update docs:
  - `docs/operations/contributor/developer.md`
  - `docs/specs/ui/panel-system-v1.md`
  - `docs/designs/README.md`
- Remove obsolete custom drag/resize code only for migrated panels.
- Keep mobile unchanged.

Exit criteria:

- `make test` passes.
- Targeted Artemis II browser tests pass.
- Visual baselines are updated only if intentional.
- Production smoke checks confirm supported mission routes still load.

## Open Design Decisions

- Should the main orbit scene itself become a Dockview panel, or should Dockview manage only side/bottom workflow areas?
- Should floating Dockview groups be enabled in the first default-on release?
- Should popout windows be enabled, or deferred until media playback and cross-window state are reviewed?
- Should layout defaults be mission config data or app code presets?
- Should reset layout clear both old overlay geometry and Dockview layout JSON?

## Suggested First PR

The first PR should be deliberately small:

- install `dockview-core`
- add `panel-layout-host.js`
- add a feature-flagged Dockview host with placeholder panels
- persist and restore placeholder layout
- add one focused test or manual verification script

No real panel migration should happen in the first PR. That keeps the dependency and pointer-event risk isolated.
