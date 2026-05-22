# System Design

This is the design hub for the lunar mission app.

Design material now lives under `docs/design/`, grouped by purpose:

- `architecture/` for durable runtime/data/model design notes
- `specs/` for feature and behavior specs
- `roadmap/` for implementation plans, backlog notes, and staged follow-up work
- `research/` for experiments and exploratory design work
- `references/` for supporting source material

## 1) Product Surfaces

- `index.html`: landing page with mission cards and launch entry points.
- `mission.html`: mission runtime shell (selector + 2D/3D visualization), with:
  - Header pill strip (`#header-pill-strip`) for quick mission/view controls.
  - Header `Panels` launcher for desktop panel lifecycle.
  - Shared desktop `Zoom` control for semantic `A->B` views; the same control semantics are reused inside desktop panel views.
  - Settings panel (`#settings-panel`) for full control coverage and advanced options.
  - Mission-specific overlay panels where needed. Artemis II currently adds:
    - `Flyby in Focus`
    - `Splashdown in Spotlight`
    - `Mission Media`
- `orbit-data.html`: data-source coverage/audit view.
- `assets-status.html`: runtime asset-size/status view.
- Supporting standalone pages for focused renderer work:
  - `moon-render-tuner.html`
  - `sky-render-demo.html`

## 2) Runtime Architecture (High-Level)

### Functional core + imperative shell

- Core computations are isolated in pure/state-centric helpers where possible (`src/platform/js/core/*`).
- Imperative orchestration (DOM, rendering, event wiring, playback loop) is handled in app/shell modules (`src/platform/js/app/*`, controllers, UI actions).
- The canonical runtime/refactor reference is [Target Architecture](architecture/target-architecture.md).
- That architecture document is now the live progress record as well; remaining work there is mostly optional follow-on cleanup rather than broad structural rescue.
- Older modernization plans and refactor proposals remain in `docs/archived/` for history, but they are no longer the current architecture guide.

### Main runtime layers

- State and domain:
  - `src/platform/js/scene-state.js`
  - `src/platform/js/core/state/*`
  - `src/platform/js/core/*`
- Data loading + interpolation:
  - `src/platform/js/data/*`
  - `src/platform/js/chebyshev.js`
- Rendering:
  - `src/platform/js/controllers/animation-2d-controller.js`
  - `src/platform/js/controllers/animation-3d-controller.js`
  - `src/platform/js/rendering/*`
- Orchestration/UI:
  - `src/platform/js/app/*`
  - `src/platform/js/ui/*`

### UI control synchronization model

- The header pill strip and settings panel are synchronized UI surfaces over shared runtime state.
- `src/platform/js/ui/event-handlers.js` now acts mainly as the top-level binding/composition seam for those controls.
- `src/platform/js/ui/main-control-bindings.js` coordinates main-control controller creation, bind order, and the remaining raw DOM hookups.
- Shared origin/dimension/toggle/moon-surface synchronization now lives in `src/platform/js/ui/view-settings-pill-controller.js`.
- Follow/view and focus/panel pill behavior now live in `src/platform/js/ui/camera-pill-controller.js` and `src/platform/js/ui/focus-pill-controller.js`.
- `src/platform/js/ui/ui-state.js` remains the source for reading/applying view setting values consumed by runtime actions.
- Some pills launch mission-specific panels instead of only toggling settings state.
  - Artemis II `Flyby` restores the `Flyby in Focus` auxiliary composer panel.
  - Artemis II `Splashdown` opens `Splashdown in Spotlight`.
  - Artemis II `Mission Media` is available only when `workflow:media-browser` is enabled in mission config.
- Desktop mission panels are managed through a shared registry, a header `Panels` launcher, and mission-scoped persisted layout state.

## 3) Core Runtime Concepts

### Frame/origin model

Runtime supports:
- `geo` (Earth-centered inertial workflow)
- `lunar` (Moon-centered workflow)
- `relative` (URL mode, Earth->Moon axis-fixed frame)

Relative mode is URL-driven (`mode=relative`) and can trigger reload-based transitions with preserved timeline time.

Detailed design:
- [Relative Mode](architecture/relative-mode.md)

### Orbit data model

Mission config and manifests are mission-local:
- `assets/<mission>/data/config.json`
- `assets/<mission>/data/ephemeris-manifest.json`

Runtime ephemeris providers:
- `chebyshev`
- `npz`
- `astronomy`

Current default mission behavior uses Chebyshev for major bodies.

Detailed design:
- [Chebyshev Format Spec](architecture/chebyshev-format-spec.md)
- [Time Synchronization and Timekeeping](architecture/time-synchronization-and-timekeeping.md)

### Mission/craft model

- Multi-craft missions are modeled with `crafts[]` + `primaryCraftId`.
- Runtime visibility, labels, and timeline strips are craft-aware.
- Mission event buttons are config-driven with dynamic events (`now`, `<craft>DataEnd` style patterns).

Example deep dive:
- [Chandrayaan 1 Event Sourcing](architecture/chandrayaan1-event-sourcing.md)

## 4) Visual Systems

- Runtime UX doctrine is captured in [Runtime UX Doctrine](runtime-ux-doctrine.md).
- Artemis product UX direction is captured in [Artemis In Real Time UX Principles](artemis-in-real-time-ux-principles.md).
- Runtime UI style and control taxonomy are captured in [Style And Typography Guide](style-typography-guide.md).
- 2D view: SVG/D3 line/path rendering.
- 3D view: Three.js mesh/line/lighting pipeline.
- Orbit styles:
  - `Classic`
  - `Trail` (track + tail controls and style sidecars)
- Lunar crater overlays:
  - Catalog filtering and render planning live in the functional core at `src/platform/js/core/domain/lunar-crater-catalog.js`.
  - The main Moon view and `Frame and Shoot` share the same crater view state: diameter range, display mode (`Off`, `Show always`, `Show on hover`), and hover-label behavior.
  - The imperative shell in `src/platform/js/app/lunar-crater-actions.js` turns pure render plans into Three.js rings, labels, hover targets, and runtime visibility updates.
  - `Show always` renders only the subset of filtered craters that are apparent in the active view/FoV; persistent labels are sparse for readability, and hover labels remain available for unlabeled boundaries.
  - Hover labels are placed from projected screen-space crater rim bounds, keeping labels close to the apparent crater circle while avoiding overlap.
- Optional auxiliary camera panels for desktop multi-view workflows.
- Desktop panels share a common shell language, lifecycle actions, and mission-scoped layout persistence.
- Artemis II extends that panel system with three higher-level mission workflows:
  - `Flyby in Focus`
    - implemented in `src/platform/js/app/auxiliary-camera-views.js`
    - uses the composer-style panel shell and flyby-specific timeline window
    - keeps the composer camera anchored at Orion; wheel zoom changes FoV only
    - supports `Star Mag` from `-3` to `6`, `Labels`, `Constellations`, `Const Labels`, and default-on clouds; body labels are hidden when Earth or Moon obscures them
    - follows the [Frame and Shoot Lighting and Exposure Spec](specs/frame-and-shoot-lighting-exposure-spec.md)
  - `Splashdown in Spotlight`
    - implemented in `src/platform/js/app/ground-track-panel.js`
    - combines a left-hand timeline/event sidebar with either a Leaflet `2D` map or a Three.js `3D` globe
    - highlights the app-generated post-HORIZONS splashdown continuation separately from the public JPL segment
  - `Mission Media`
    - implemented by `src/platform/js/app/media-timeline-coordination.js` and `src/platform/js/app/media-browser-panel.js`
    - gated by `ui.panels.defaults["workflow:media-browser"].enabled`
    - loads `assets/artemis2/data/media-manifest.json`, renders timeline media markers, and shows a progressive media panel with filters, nearby media, and details drilldown
    - supports image pan/zoom plus selected video/audio playback synchronized with realtime mission animation
    - disabled in compare mode because media uses real mission chronology

## 5) Design Document Map

### Architecture

- [Relative Mode](architecture/relative-mode.md)
- [Orbit Comparison Mode](architecture/orbit-comparison-mode.md)
- [Chebyshev Format Spec](architecture/chebyshev-format-spec.md)
- [Time Synchronization and Timekeeping](architecture/time-synchronization-and-timekeeping.md)
- [Chandrayaan 1 Event Sourcing](architecture/chandrayaan1-event-sourcing.md)
- [Target Architecture](architecture/target-architecture.md)

### Feature specs

- [Runtime UX Doctrine](runtime-ux-doctrine.md)
- [Artemis In Real Time UX Principles](artemis-in-real-time-ux-principles.md)
- [Panel System V1 Spec](specs/panel-system-v1-spec.md)
- [Camera State Transition Spec](specs/camera-state-transition-spec.md)
- [Frame and Shoot Lighting and Exposure Spec](specs/frame-and-shoot-lighting-exposure-spec.md)
- [Panel Progressive Disclosure Spec](specs/panel-progressive-disclosure-spec.md)
- [Timeline and Media Playback Spec](specs/timeline-media-playback-spec.md)

### Roadmaps and implementation plans

- [Panel System V1 Implementation Plan](roadmap/panel-system-v1-implementation-plan.md)
- [Dockview Panel Layout Integration Plan](roadmap/dockview-panel-layout-integration-plan.md)
- [Artemis II Media Timeline Plan](roadmap/artemis2-media-timeline-plan.md)
- [Main View Photo Mode Plan](roadmap/main-view-photo-mode-plan.md)
- [Orbit-First Timeline Plan](roadmap/orbit-first-timeline-plan.md)
- [Orbit UX Roadmap](roadmap/orbit-ux-and-refactor-roadmap.md)
- [Real-Size Craft Follow Backlog](roadmap/real-size-craft-follow-backlog.md)

### Research and experiments

- [Moon Rendering Research and Plan](research/moon-rendering-research-and-plan.md)
- [Sky Render Demo](research/sky-render-demo.md)
- [Orion Procedural Model Generation](research/orion-procedural-model-generation.md)
- [Performance Functional Core Experiments](research/performance-functional-core-experiments.md)
- [Panel Layout Library Evaluation](research/panel-layout-library-evaluation.md)
- [Sun FoV reference pack](references/sun-fov/README.md)

## 6) Data Boundary Design

App repo (`moon-mission`):
- runtime code, mission config, optional media manifests, UI assets

Data repo (`moon-mission-data`):
- generated orbit artifacts and staged runtime media

Runtime asset serving:
- production app pages are served from `sankara.net`
- runtime assets are served from the public R2 asset origin
  `https://assets.sankara.net/moon-mission/`
- repository-relative paths keep the same layout under the R2 prefix

Remote third-party media may also be referenced directly by app-owned manifests when the upstream source is intentionally not mirrored.

Design intent: keep runtime code evolution independent from heavy generated asset churn while using one canonical public asset origin.

Operational references:
- [Repo Sync Playbook](../operations/repo-sync-playbook.md)
- [Mission Data Current State](../operations/mission-data-current-state.md)
- [R2 Asset Hosting](../operations/r2-asset-hosting.md)

## 7) Workflow Links

- Docs hub: [../README.md](../README.md)
- Workflow guide (commands/CI/conventions): [../developer.md](../developer.md)
- Test strategy: [../guides/testing.md](../guides/testing.md)

---

When adding new design docs, place them in the most specific `docs/design/` bucket and link them from this file.
