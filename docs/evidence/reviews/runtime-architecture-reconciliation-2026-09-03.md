# Runtime Architecture Reconciliation Evidence

Review date: 2026-09-03

This evidence preserves the pre-reconciliation target-architecture body as it
existed after an earlier extraction of follow-up material. The extracted
remaining-work detail is preserved in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md).
This record also captures the current-code findings that drove the later
refactor. It is not architecture authority.

## Current Findings

- The May boot-flow snapshot omits the current view/scene composition layers,
  including `mission-view-entry`, `mission-view-composition`,
  `mission-scene-entry`, `mission-scene-runtime`, `mission-scene-bootstrap`, and
  `mission-scene-action-bundle`.
- Application services still perform direct DOM, D3, and renderer effects in
  settings, initialization, and media coordination.
- `core/domain/active-event-ui-state.js` imports
  `app/burn-event-metadata.js`, violating the intended core-to-app dependency
  direction.
- `mission.js` remains a broad composition surface with legacy state, runtime
  stores, callback maps, UI mutation, and browser-global wiring.
- The old layer map omits the panel framework, comparison pipeline, lunar
  features, orbit milestones, and newer mobile composition.
- Existing tests verify composition behavior but do not enforce dependency or
  browser-effect boundaries.

These findings remain open in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md).

## Preserved 2026-05-08 Document

---
doc_class: design
status: review-required
scope: runtime.architecture
---

# Target Architecture

> Reconciliation notice: the target model and current-state map are grounded in
> the codebase as of 2026-05-08. This document is not current runtime authority
> until the module map and boundary claims are re-audited through the linked
> plan.

[Runtime Architecture Reconciliation](../../plans/implementation/runtime-architecture-followups.md)

This document is the single source of truth for runtime architecture in
`moon-mission`. It replaces the older split between
`refactor-audit.md`, earlier revisions of this document, and the
runtime-refactor sections that used to live in the orbit roadmap.

Delivery status and optional cleanup are tracked separately in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md).

Grounded in the codebase as of `2026-05-08`.

The design is in two parts:

1. **Layered Model** — the target: what each layer owns, and the rules for
   how they talk to each other.  This is aspirational and stable; it does
   not change with every refactor.
2. **Current-State Snapshot** — what the codebase looked like on 2026-05-08:
   boot flow, layer
   anchors, modules that already fit the target style, and the remaining
   boundary leaks.

## Goals

- functional core, imperative shell
- clear separation of concerns
- explicit state ownership
- explicit data, rendering, and UI boundaries
- smaller composition surfaces instead of large context bags
- preserve the current runtime behavior while improving refactorability

---

## Layered Model

Four layers, with one dependency direction: functional core ← state ports ←
application services ← shell.  Composition root wires them together.

### Functional core (domain and planners)

Pure value-in / value-out logic.

Owns:

- mission config parsing, normalization, validation, craft resolution
- event-time resolution
- camera and UI transition policy
- asset and manifest resolution
- mission media manifest normalization, filtering, selection, and marker derivation
- frame planning
- telemetry, phase, and event view-model calculations
- orbit-style math
- scene-state math

Does not own:

- DOM reads or writes
- D3 or Three.js mutation
- timers or `requestAnimationFrame`
- fetch, cache, or worker lifecycle
- hidden access to globals

### State ports

Narrow mutable state with explicit lookup APIs.

Owns:

- session, view, interaction, and loop state
- scene-scoped plane/zoom/pan state
- data-source and load state
- scene and controller registry

Does not own:

- DOM or scene mutation
- runtime command wiring
- cross-cutting responsibilities bundled into one facade

### Application services

Translate between state ports, domain planners, and shell effects.

Owns:

- startup orchestration
- settings intent handling
- dimension and origin transitions
- frame orchestration
- timeline and event model coordination
- mission media timeline and workflow-panel coordination
- orbit-style policy coordination
- mission data coordination

Does not own:

- direct DOM/Three/D3 mutation
- business rules that belong in the domain core
- broad effect-heavy controller hubs

### Shell and effects

Direct interaction with the browser and renderers.

Owns:

- page bootstrap
- DOM state and layout
- D3/SVG mutation
- Three.js mutation
- `requestAnimationFrame` and timeout scheduling
- fetch, cache, and worker lifecycle
- mission-specific panels and feature shells

Does not own:

- reusable calculation logic
- hidden state policy
- core business rules

### Dependency rules

Allowed:

- domain/planners → nothing below them
- state ports → domain helpers
- application services → domain helpers + state ports + explicit shell ports
- shell/effects → browser APIs, DOM, Three.js, D3, workers, fetch
- composition root → everything

Not allowed:

- domain or planner modules → DOM, Three.js, D3, timers, fetch
- state ports → DOM or scene mutation
- settings intent service → direct renderer mutation
- data normalization helpers → fetch or cache
- test helpers → hidden production business logic

---

## Current-State Snapshot (2026-05-08)

### Product surfaces

- `mission.html` is the runtime page shell.  It resolves the mission slug,
  sets `window.missionConfig`, and injects the runtime module.
- `src/platform/js/mission.js` is the main browser bootstrap script for the
  mission runtime.
- `index.html` and `src/platform/js/index-landing.js` are the landing /
  catalog path and are outside the main mission runtime.

### Boot flow

1. `mission.html` resolves the mission and loads `src/platform/js/mission.js`.
2. `mission.js` creates legacy state and the small runtime stores, then
   delegates playback bootstrap to `app/mission-entry-composition.js`,
   scene assembly to `app/mission-scene-composition.js`, runtime root
   assembly to `app/mission-runtime-root.js`, legacy binding shaping to
   `app/mission-legacy-state-bindings.js`, and the legacy state-cell
   compatibility bridge to `app/mission-state-access.js`.
3. `app/mission-playback-coordination.js` owns the timeline dock, active
   craft control sync, transport-state sync, and the related planner/shell
   split.  `app/mission-entry-composition.js` owns the event bus and
   animation-controller bootstrap that used to be inline in `mission.js`.
4. `app/mission-app.js` wires browser events and kicks off
   `handlers.initAnimation({ reset: true })`.
5. `app/mission-runtime-handlers-entry.js` delegates startup to
   `app/init-orchestration.js`, which uses `app/startup-animation-plan.js`
   for boot-time policy.
6. `app/mission-runtime-entry-deps.js`,
   `app/mission-runtime-wireup-deps.js`, and
   `app/runtime-bootstrap-deps.js` build explicit runtime dependency
   shapes before startup and bootstrap orchestration run.
7. `app/init-orchestration.js` and `app/runtime-init.js` initialize
   config, scenes, controls, orbit data, and landing data, then start the
   RAF loop.
8. Per-frame work flows through `app/scene-frame-orchestration-actions.js`,
   which uses `app/scene-frame-plan.js`,
   `app/transient-active-event-tracker.js`, and
   `core/plans/frame-plan.js` before applying render and UI intents
   through shell adapters.

### Layer anchors

| Layer | Anchors |
|---|---|
| Page shell | `mission.html`, `mission.js`, `app/mission-app.js`, `ui/event-handlers.js` |
| Composition and runtime assembly | `app/mission-runtime-root.js`, `app/mission-runtime-root-context.js`, `app/mission-entry-composition.js`, `app/mission-scene-composition.js`, `app/mission-runtime-handlers-entry.js`, `app/mission-runtime-wireup-entry.js`, `app/mission-runtime-entry.js`, `app/mission-runtime-wireup-deps.js`, `app/mission-runtime-entry-deps.js`, `app/mission-wiring-composition.js`, `app/runtime-bootstrap-actions.js`, `app/runtime-bootstrap-deps.js`, `app/mission-state-access.js`, `app/mission-state-cell-groups.js`, `app/mission-legacy-state-bindings.js` |
| Functional core / planners | `core/domain/*.js`, `core/plans/frame-plan.js`, `scene-state.js`, `data/relative-frame-provider.js`, `app/view-application-plan.js`, `app/scene-frame-plan.js`, `app/startup-animation-plan.js`, pure parts of `app/orbit-trail-style.js` |
| State ports | `core/state/runtime-view-state.js`, `runtime-session-state.js`, `runtime-interaction-state.js`, `runtime-loop-state.js`, `runtime-media-state.js`, `app/scene-view-state.js` |
| Application services | `app/init-orchestration.js`, `app/runtime-init.js`, `app/settings-actions.js`, `app/scene-frame-orchestration-actions.js`, `app/mission-runtime-handlers-entry.js`, `app/mission-wiring-composition.js`, `app/media-timeline-coordination.js` |
| Data and integration | `data/mission-data.js`, `data/mission-media.js`, `data/cached-resource-loader.js`, `data/ephemeris-provider.js`, `chebyshev.js` |
| Render and UI effects | `shell/render/frame-renderer.js`, `shell/ui/frame-ui-updater.js`, `shell/ui/mission-ui-effects.js`, `shell/time/clock-effects.js`, `rendering/*`, `controllers/*`, mission-specific panels such as `app/auxiliary-camera-views.js`, `app/ground-track-panel.js`, and `app/media-browser-panel.js` |

### Modules that already fit the target style

Treat these as reference examples when extending the codebase.

**Domain and planning core:**

- `core/domain/mission-config.js`
- `core/domain/camera-policy.js`
- `core/domain/event-time-resolver.js`
- `core/domain/origin-compat.js`
- `core/domain/ui-transition-plan.js`
- `core/domain/mission-asset-resolver.js`
- `core/domain/mission-config-assembly.js`
- `core/domain/ephemeris-manifest.js`
- `core/domain/transient-active-event.js`
- `core/domain/phase-indicator-state.js`
- `core/domain/earth-craft-moon-angle.js`
- `core/domain/scene-view-state-core.js`
- `core/domain/scene-telemetry-ui-state.js`
- `core/domain/control-panel-timeline-state.js`
- mission media helpers: `media-manifest.js`, `media-filter-state.js`,
  `media-selection-state.js`, `media-shot-view.js`,
  `media-stream-sync.js`, `media-timeline-state.js`
- mobile view-model helpers: `mobile-view-preset-state.js`,
  `mobile-compose-lock-state.js`, `mobile-compose-timeline-state.js`,
  `mobile-compose-controls-state.js`, `mobile-shell-tab-state.js`,
  `mobile-view-fov-state.js`, `mobile-moon-visibility-state.js`,
  `mobile-shell-layout-state.js`
- `core/plans/frame-plan.js`

**Pure application planners:**

- `app/view-application-plan.js`
- `app/scene-frame-plan.js`
- `app/startup-animation-plan.js`

**Narrow state ports:**

- `core/state/runtime-view-state.js`
- `core/state/runtime-session-state.js`
- `core/state/runtime-interaction-state.js`
- `core/state/runtime-loop-state.js`
- `core/state/runtime-media-state.js`

**Thin shell adapters:**

- `shell/render/frame-renderer.js`
- `shell/ui/frame-ui-updater.js`
- `shell/ui/mission-ui-effects.js`
- `shell/time/clock-effects.js`
- `app/scene-telemetry-ui-actions.js`, `scene-phase-ui-actions.js`,
  `scene-active-event-ui-actions.js`
- `ui/settings-panel-controller.js`, `keyboard-shortcuts-controller.js`,
  `desktop-chrome-autohide.js`, `header-blurb-controller.js`,
  `header-pill-strip-controller.js`, `camera-pill-controller.js`,
  `plane-pill-controller.js`, `view-settings-pill-controller.js`,
  `focus-pill-controller.js`, `control-panel-timeline-controller.js`,
  `main-control-bindings.js`
- mobile sync adapters under `ui/mobile-*-sync.js`

**Healthier coordination and composition seams:**

- `app/mission-playback-coordination.js`
- `app/runtime-ui-control-groups.js`
- `app/mission-runtime-root.js`, `mission-runtime-root-context.js`
- `app/mission-entry-composition.js`, `mission-scene-composition.js`
- `app/mission-legacy-state-bindings.js`
- `app/media-timeline-coordination.js`

**Focused integration helpers:**

- `data/cached-resource-loader.js`

**Transitional seams written in the target style:**

- `scene-state.js` — functional-core module that still depends on
  provider modules from `data/*`.
- `app/mission-state-access.js` with `app/mission-state-cell-groups.js` —
  isolate the legacy compatibility cell map from `mission.js`, even
  though the public compatibility surface is still broader than the
  end-state port model.

### Remaining boundary leaks

These are the places where concerns are still mixed in the current code.

**`mission.js`** — transitional bootstrap root.  Mixes legacy state
creation, runtime store creation, closure access to legacy bootstrap
state, final top-level composition, and global exposure / browser
bootstrap glue.  Target: page bootstrap, legacy-state setup, and minimal
composition only.

**`core/state/mission-state-store.js`** — thin compatibility wrapper
around explicit port builders.  The remaining issue is not the file
itself but that runtime consumers still depend on the flattened
compatibility surface exposed through `app/mission-state-access.js`.

**`app/mission-state-access.js`** — useful transitional seam that owns
the legacy state-cell compatibility map, state-cell bucket assembly, and
runtime view/session/interaction groups (delegated to
`app/mission-state-cell-groups.js`).  Still exposes a broad compatibility
surface because runtime consumers depend on the generic state-cell
contract.  Target: shrink this bridge as explicit ports replace generic
cells.

**`app/settings-actions.js`** — mostly orchestration now that
`view-application-plan.js` and `scene-view-plan-application.js` carry
the planning and effect-application split.  Remaining leak: view-setting
changes still fan out through broader runtime wiring and shared bridges
instead of a smaller dedicated settings service surface.

**`app/scene-view-state.js`** — plane and transform reads flow through
`core/domain/scene-view-state-core.js`; zoom/pan reads are scene-first.
Remaining leak: writes still mirror into legacy globals and plane
compatibility paths still exist for older consumers.

**`app/scene-frame-orchestration-actions.js`** — `scene-frame-plan.js`
owns frame-plan input assembly and `transient-active-event-tracker.js`
owns transient event latching.  Rule: keep this module a thin bridge
from plan to effects, not a place that grows UI policy or calculations.

**`app/init-orchestration.js`** — `startup-animation-plan.js` owns the
boot-time decision tree.  Remaining mixed concerns: orbit-data readiness
polling, timeout scheduling for view reapplication, startup control
re-enable behavior, and camera/view settling order.  Must stay on the
application-service side of the boundary.

**`app/scene-ui-update-actions.js`** — telemetry, phase, and
active-event rendering live in
`scene-telemetry-ui-actions.js` / `scene-phase-ui-actions.js` /
`scene-active-event-ui-actions.js`; this file is mostly a composition
wrapper across them.  Open question: keep the wrapper or fold it into
`scene-frame-ui-actions.js`.

**`app/runtime-ui-controls.js`** — `runtime-ui-control-groups.js`
already splits navigation, lock, camera, mode/landing, moon-profile, and
burn actions.  Remaining leak: this module still flattens those concerns
into one runtime control surface for legacy consumers.  Target: grouped
adapters with narrower consumers, not a rebuilt broad controller hub.

**`data/mission-data.js`** — pure config profile/source rules live in
`core/domain/mission-data-resolvers.js`, config assembly in
`core/domain/mission-config-assembly.js`, generic cache mechanics in
`data/cached-resource-loader.js`, and asset-path resolution leans on
`core/domain/mission-asset-resolver.js`.  Remaining work: keep this file
focused on runtime loading and mission-specific entrypoints, not a
landing place for generic loader concerns or data-policy logic.

**Mission Media workflow** — the current implementation follows the
target shape: `data/mission-media.js` loads the optional manifest,
`core/domain/media-*.js` normalizes and derives selection/filter/marker
state, `core/state/runtime-media-state.js` stores mutable media intent,
`app/media-timeline-coordination.js` coordinates timeline markers and
panel updates, and `app/media-browser-panel.js` owns DOM/lifecycle
effects. Timeline/media playback behavior is specified in
[`Timeline and Media Playback Spec`](../../specs/time/timeline-and-media-playback.md).
Keep future long-form stream work on this same split.

**`ui/event-handlers.js`** — now mostly delegates to dedicated
controllers (settings panel, keyboard shortcuts, desktop autohide,
header chrome, pill strips, compose syncs).  Remaining mixed concerns:
a few final top-level button bindings and some bootstrap-level control
wiring around already-extracted controllers.  Acting like the
composition file it was supposed to become.

**Runtime composition chain** — the chain through `mission.js` →
`mission-runtime-root.js` → `mission-entry-composition.js` →
`mission-scene-composition.js` → `mission-runtime-wireup-entry.js` →
`mission-runtime-entry.js` → `mission-runtime-wireup-config.js` →
`mission-runtime-wireup.js` → `mission-runtime-static-deps.js` →
`mission-runtime-handlers-entry.js` → `mission-wiring-composition.js` →
`runtime-bootstrap-actions.js` creates real structure, but still relies
on repeated remapping of large dependency sets around state access and
runtime bootstrap.  Next stage: simplify ownership instead of adding
more wrapper layers.

---

## Follow-Up Plan

Historical slice status, remaining cleanup proposals, and optional follow-ons
are preserved in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md).

---

## Guardrails

- move code before rewriting behavior
- preserve current visuals first, then simplify
- prefer explicit ports over broader context objects
- every new pure helper should take all of its inputs explicitly
- mission-specific features should stay at the shell edge unless they
  expose a clearly reusable policy
- run unit tests after structural slices and run the UI/SSIM gate at
  natural checkpoints

## Working Rule

When there is a design choice to make, prefer the option that moves
logic toward:

1. pure planners and selectors
2. narrow state ports
3. explicit effect adapters
4. smaller composition roots

If a change does not improve one of those four things, it is probably
not moving the architecture in the right direction.
