# Runtime Target Architecture

## Purpose

Define the durable structural model for the Moon Mission runtime. Enforceable
dependency and effect rules live in
[Runtime Architecture Boundaries](../../specs/runtime/architecture-boundaries.md).
Current deviations and delivery work live in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md).

## Goals

- Functional core with an imperative browser/rendering shell.
- Explicit state ownership and narrow mutation ports.
- Clear data, rendering, UI, and mission-specific boundaries.
- Application coordination through explicit dependencies.
- Smaller composition surfaces instead of expanding context bags.
- Behavior-preserving structural evolution.

## Layered Model

Dependencies flow inward:

```text
shell/effects -> application services -> state ports -> functional core
```

The composition root may know all layers in order to assemble them. Inner
layers must not reach outward through imports or hidden globals.

### Functional Core

`src/platform/js/core/domain/` and pure planner modules own deterministic
value-in/value-out decisions such as:

- mission/config normalization and craft resolution;
- event-time and active-event models;
- camera, mobile, milestone, panel, and UI policy;
- asset and manifest resolution;
- frame, telemetry, phase, orbit-style, and scene-state calculations; and
- media filtering, selection, and marker derivation.

The core receives all inputs explicitly and has no browser, renderer, network,
timer, or mutable-global effects.

### State Ports

`src/platform/js/core/state/` and narrow state adapters own mutable session,
view, interaction, media, panel, scene, data-source, and loop state.

State ports expose explicit reads and writes. They do not mutate DOM or scene
objects and do not become broad service locators.

### Application Services

`src/platform/js/app/` coordinates domain policy, state ports, and effect
adapters. Services own use-case sequencing such as startup, settings changes,
origin/dimension transitions, mission-time coordination, scene-frame planning,
media coordination, and panel lifecycle.

The target is for application services to request effects through injected
ports. Current direct DOM/D3/Three.js effects in this layer are recognized gaps,
not accepted exceptions.

### Shell And Effects

Controllers, rendering modules, UI modules, data loaders, workers, browser
event bindings, and entrypoints own effects:

- DOM and accessibility mutation;
- D3 and Three.js object mutation;
- fetch/cache/worker lifecycle;
- animation-frame, timer, and observer lifecycle;
- media element control; and
- compatibility interaction with required browser globals.

Mission-specific rendering and panel behavior stays at this edge unless it
exposes reusable pure policy.

### Composition Root

`src/platform/js/mission.js` remains the outer composition root. It assembles
runtime state, view composition, playback, scene composition, UI coordination,
and legacy compatibility wiring.

The current composition path includes:

- `mission-view-entry.js` and `mission-view-composition.js`;
- `mission-scene-entry.js`, `mission-scene-runtime.js`, and
  `mission-scene-bootstrap.js`;
- `mission-scene-action-bundle.js`;
- runtime root/entry/wire-up modules; and
- UI/controller composition modules.

These modules provide real separation, but repeated callback maps and broad
context remapping remain candidates for reduction.

## Subsystem Placement

- **Comparison** is one runtime with explicit comparison state and transforms,
  not a second application runtime.
- **Panels** use panel runtime state/persistence plus shell-owned DOM and layout
  effects.
- **Mobile** is a presentation of shared mission/view state with mobile-specific
  coordination at the UI shell.
- **Lunar features and orbit milestones** keep pure catalog/placement policy in
  the core and renderer/interaction effects at the shell edge.
- **Mission media** separates loading, domain normalization, mutable media
  state, application coordination, and panel/media-element effects.
- **Relative mode** separates frame requirements, generated data, runtime
  transforms, and display policy through their existing spec/design/operation
  owners.

## Evolution Strategy

- Move reusable decision logic inward only after its inputs are explicit.
- Introduce state ports for real mutable ownership, not as wrappers around
  globals.
- Extract effects from application services when doing so reduces coupling or
  enables focused tests.
- Reduce composition surfaces when product work naturally touches them; do not
  add wrapper layers merely to make files smaller.
- Split data loading from normalization and policy when those concerns change
  independently.
- Preserve runtime behavior and visual output during structural changes unless
  a specification explicitly changes the outcome.

## Guardrails

- Prefer pure planners and selectors, then narrow state ports, then explicit
  effect adapters, then smaller composition roots.
- Do not infer architecture conformance from file location alone.
- Do not describe known boundary violations as completed architecture.
- Verify structural changes with focused behavior tests and automated boundary
  checks where practical.

The dated May snapshot and the reconciliation findings are preserved in
[Runtime Architecture Reconciliation Evidence](../../evidence/reviews/runtime-architecture-reconciliation-2026-09-03.md).
