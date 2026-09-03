# Panel Layout Library Evaluation

Date: 2026-05-19

## Question

Can the mission runtime use a panel layouting library, such as Dockview, to reduce the growing amount of custom panel drag, resize, stacking, and persistence code?

## Current App Fit

The app already has a V1 panel model:

- `src/platform/js/app/panel-registry.js` owns panel lifecycle registration and actions.
- `src/platform/js/app/panel-layout-store.js` persists mission-scoped panel state under `moon-mission:panel-layout:v1:<missionKey>`.
- `src/platform/js/app/panel-manager.js` renders the desktop panel launcher inside Settings.
- Feature panels still implement their own shell mechanics:
  - `src/platform/js/app/auxiliary-camera-views.js`
  - `src/platform/js/app/media-browser-panel.js`
  - `src/platform/js/app/background-media-panel.js`
  - `src/platform/js/app/ground-track-panel.js`

That means a library should not be introduced as a second independent panel registry. The right integration point is a small layout adapter that connects the existing registry and mission defaults to one underlying layout engine.

## Library Candidates

### Dockview / `dockview-core`

Verdict: best first spike.

Reasons:

- Vanilla TypeScript core is available through `dockview-core`, so the app does not need React.
- The library supports the primitives this app is hand-building: tab groups, drag and drop, floating groups, popout windows, and serialized layouts.
- It also exposes smaller primitives (`Gridview`, `Splitview`, `Paneview`) if full docking is too much for a first milestone.
- Current npm metadata checked on 2026-05-19: `dockview-core@6.3.0`, MIT, no runtime dependencies listed by `npm view`.

Primary concerns:

- Dockview expects to own a real layout container. The current app renders the main SVG/canvas and panels as fixed overlays. If a full-screen Dockview host sits over the scene, it can steal pointer events from the orbit view unless the scene itself becomes a managed panel or Dockview is limited to a side/bottom workspace.
- Current panel headers, resize grips, z-order, and localStorage geometry would need to be disabled or mapped to Dockview APIs when a panel is docked.
- Three.js and Leaflet panel contents must receive resize notifications after dock changes.

References:

- Dockview introduction: https://dockview.dev/docs/overview/introduction/
- Dockview state loading: https://dockview.dev/docs/core/state/load/
- Dockview Splitview/Gridview docs: https://dockview.dev/docs/other/splitview/overview/ and https://dockview.dev/docs/other/gridview/overview/

### Golden Layout

Verdict: viable fallback, but less attractive than Dockview for this app.

Reasons:

- Vanilla JS layout manager with component registration, rearrangeable tabs, popouts, maximize/close controls, and `toConfig()` serialization.
- Current npm metadata checked on 2026-05-19: `golden-layout@2.6.0`, MIT, no runtime dependencies listed by `npm view`.

Concerns:

- Older API and visual model. It can work, but it feels more like adopting a legacy workbench shell than incrementally modernizing the current panel system.
- Integration shape is similar to Dockview, but Dockview has a cleaner fit for vanilla TypeScript plus smaller layout primitives.

References:

- Golden Layout configuration/API docs: https://golden-layout.com/docs/Config.html and https://golden-layout.com/docs/GoldenLayout.html

### Lumino Widgets / `@lumino/widgets`

Verdict: powerful but probably too invasive for the first move.

Reasons:

- Battle-tested DockPanel model from the JupyterLab ecosystem.
- Supports widget lifecycle, docking, save/restore layout, tab bars, commands, messages, and drag/drop.
- Current npm metadata checked on 2026-05-19: `@lumino/widgets@2.7.5`, BSD-3-Clause.

Concerns:

- Lumino is a full widget framework. Panels would become Lumino widgets rather than plain DOM modules, which is a bigger architectural turn than this app needs right now.

References:

- Lumino overview: https://lumino.readthedocs.io/en/latest/api/index.html
- Lumino DockPanel API: https://lumino.readthedocs.io/en/stable/api/classes/widgets.DockPanel-1.html

### Gridstack

Verdict: useful for dashboard tiles, not for the main mission workbench.

Reasons:

- Framework-agnostic TypeScript dashboard grid with drag, resize, responsive layouts, nested grids, and save/restore.

Concerns:

- It is a grid/dashboard layout, not an IDE-style docking/tabbing system. It would improve resize/placement mechanics but would not naturally solve tabbed workflow panels, dock groups, or scene-adjacent workbench layout.

Reference:

- Gridstack docs: https://gridstackjs.com/

### Split.js / Split Grid

Verdict: too low-level to solve the actual problem alone.

Reasons:

- Good for deterministic split panes.
- Small and framework-free.

Concerns:

- No panel lifecycle, tabbing, floating, docking, or serialized workspace model. The app would still maintain most of the custom panel manager.

References:

- Split Grid npm docs: https://www.npmjs.com/package/split-grid

### React-only Layout Libraries

Verdict: skip unless the app adopts React for mission UI.

Libraries such as Allotment, `react-resizable-panels`, and `flexlayout-react` are healthy options in React apps, but this repo is currently vanilla ES modules plus imperative DOM/Three/D3/Leaflet wiring. Introducing React only for layout would increase migration cost without solving the core panel ownership issue.

## Recommended Path

1. Do not replace the whole app shell first.
2. Add a `panel-layout-host` adapter that is the only module allowed to talk directly to the chosen library.
3. Spike Dockview Core on desktop only, behind a query flag or config flag.
4. Start with workflow panels:
   - `workflow:media-browser`
   - `workflow:splashdown`
   - optionally `workflow:background-media`
5. Leave auxiliary camera panels on the existing overlay system during the first spike because they have the densest camera/composer coupling.
6. Persist Dockview layout JSON alongside, not instead of, the existing layout payload until migration is proven.
7. Add resize notifications from the layout adapter so Three.js, Leaflet, and media viewports can redraw after pane changes.

## Integration Shape

The adapter should expose app-owned methods, not library-owned concepts:

```js
createPanelLayoutHost({
    container,
    registry,
    storageKey,
    renderPanel(panelDescriptor),
    onPanelFocus(panelId),
    onPanelClose(panelId),
    onPanelLayoutChange(layoutSnapshot),
});
```

Panel modules should keep owning content behavior. The layout host should own only:

- dock placement
- tab grouping
- resize geometry
- active/focus state
- close/open mapping
- serialized layout snapshots

## Acceptance Criteria For A Spike

- Artemis II loads normally at `/artemis2/`.
- The main orbit scene remains interactive when panels are docked or closed.
- `Mission Media` and `Splashdown in Spotlight` can be opened, focused, closed, restored, and resized through the library.
- Layout survives reload per mission.
- Dock layout changes notify media, Leaflet, and Three.js panel renderers.
- Existing header pill controls still open the same workflow panels through `panel-registry`.
- Mobile behavior remains unchanged.

## Decision

Use Dockview Core for the first proof of concept. Treat it as a layout engine behind the existing panel registry, not as a replacement for the app's mission panel model. If Dockview's container/pointer-event model fights the full-screen scene too much, fall back to a simpler side-workbench using Dockview `Gridview`/`Splitview` or evaluate Golden Layout as the next candidate.
