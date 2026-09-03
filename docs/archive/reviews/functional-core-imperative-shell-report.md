# Functional Core / Imperative Shell Architecture Review

Date: 2026-03-20
Scope: `assets/platform/js`, mission config/data paths, `scripts/`, `test/`, runtime wiring.

## Executive Summary

The codebase has already moved meaningfully toward modularity, but the core/shell boundary is still porous in several high-leverage areas. The biggest issues are:

1. State access and domain decisions are mixed with DOM and timer side effects.
2. Mission lifecycle assumptions (`geo`/`lunar`) are hardcoded into runtime state and initialization paths.
3. Runtime composition has very large dependency bags, which obscures effect boundaries.
4. Data pipeline contracts are implicit (filename conventions), not explicit (manifest/schema).
5. Test shell determinism is weakened by failure masking and server reuse behavior.

The highest ROI path is to tighten boundaries first (P0), then normalize mission contracts and composition seams (P1), then remove legacy global patterns (P2).

## Current State Map

### Runtime Flow (today)

- Entry shell: `mission.html` sets `window.missionConfig`, then loads `assets/platform/js/mission.js`.
- Large orchestration module: `assets/platform/js/mission.js` initializes mutable legacy state, wires event bus, constructs runtime dependencies, and boots handlers.
- Runtime wireup chain: `assets/platform/js/app/mission-runtime-wireup-entry.js` -> `assets/platform/js/app/mission-runtime-entry.js` -> `assets/platform/js/app/mission-runtime-wireup.js`.
- Frame orchestration: `assets/platform/js/app/scene-frame-orchestration-actions.js` computes scene state, invokes 2D/3D rendering, then performs UI updates.

### Functional-Core Islands Already Present

- `assets/platform/js/scene-state.js`
- `assets/platform/js/app/config-events.js`
- `assets/platform/js/app/config-times.js`
- `assets/platform/js/app/camera-parameters-core.js`
- `assets/platform/js/app/animation-loop.js`

### Boundary Leaks (examples)

- `assets/platform/js/app/mission-state-access.js`
  - state access methods also do DOM writes (`setEventInfoText`, `setEpochDisplay`) and timeout cleanup (`clearLegacyTimeout`).
- `assets/platform/js/app/camera-actions.js`
  - decision logic (`allowedLookByPosition`, `normalizeFromTo`) is mixed with DOM reads/writes and `setTimeout` side effects.
- `assets/platform/js/app/scene-ui-update-actions.js`
  - phase semantics and display mapping are mixed directly with D3 DOM mutations.
- `assets/platform/js/app/init-config-scene-setup.js` and `assets/platform/js/app/init-config-flow-actions.js`
  - hardcoded `geo`/`lunar` assumptions in init flow.

## Prioritized Backlog

## P0 - Do First (architecture safety + correctness)

### P0.1 Purify Mission State Access Boundary

Priority: P0
Impact: Very high
Risk: Medium

Current pain:
- `assets/platform/js/app/mission-state-access.js` mixes state operations with UI/timer effects.

Change:
- Split into:
  - `core/state/mission-state-store.js` (pure getters/setters + state transitions)
  - `shell/ui/mission-ui-effects.js` (D3/DOM updates)
  - `shell/time/clock-effects.js` (timeout clear/schedule)
- Inject shell adapters into orchestrators instead of embedding them in state access.

Success criteria:
- No DOM/time side effects inside state-access module.
- Unit tests can execute core state transitions in Node without DOM.

### P0.2 Extract Camera Decision Engine

Priority: P0
Impact: Very high
Risk: Medium

Current pain:
- `assets/platform/js/app/camera-actions.js` interleaves pure rules and imperative mutations.

Change:
- Create `core/domain/camera-policy.js` with pure functions, e.g.:
  - `normalizeFromTo(input)`
  - `resolveAllowedLooks(positionMode)`
  - `planCameraPairTransition(state, intent)`
- Keep scene/DOM writes in a shell adapter (`shell/render/camera-shell.js`).

Success criteria:
- Camera rules are tested without THREE/DOM.
- Shell module only applies precomputed camera plan.

### P0.3 Split Frame Planning from Frame Effects

Priority: P0
Impact: Very high
Risk: Medium

Current pain:
- `assets/platform/js/app/scene-frame-orchestration-actions.js` computes and applies in the same pass.

Change:
- Introduce pure `core/plans/frame-plan.js` returning:
  - render intent
  - UI patch intent
  - state patch intent
- Shell executors apply those plans:
  - `shell/render/frame-renderer.js`
  - `shell/ui/frame-ui-updater.js`

Success criteria:
- Frame planning is replayable/testable offline.
- Render/UI modules become thin adapters.

### P0.4 Replace Label-Based Event Semantics with Typed Event Semantics

Priority: P0
Impact: High
Risk: Medium

Current pain:
- Event behavior relies on labels and key suffixes (`Now`, `endsWith("DataEnd")`).
- Files: `assets/platform/js/app/config-events.js`, `assets/platform/js/app/burn-actions.js`.

Change:
- Add typed event schema in mission config:
  - `kind: "fixed" | "now" | "data_end" | "mission_marker"`
  - `timeSource` payload for dynamic events
- Use a pure resolver:
  - `resolveEventInstant(eventDef, context) -> timestamp`

Success criteria:
- No semantic branching on label text.
- Event resolution behavior is declarative and cross-mission safe.

### P0.5 Remove Hardcoded `geo`/`lunar` Lifecycle Assumptions

Priority: P0
Impact: High
Risk: High

Current pain:
- Runtime state and scene setup assume exactly two phases.
- Files: `assets/platform/js/app/mission-legacy-state.js`, `assets/platform/js/app/init-config-flow-actions.js`, `assets/platform/js/app/init-config-scene-setup.js`.

Change:
- Convert to phase-driven maps from config (`globalConfig.phases`).
- Replace phase-specific branching with iteration over normalized phase descriptors.

Success criteria:
- New mission phases can be added without touching init branching logic.
- No direct literals `geo`/`lunar` outside mapping/compatibility layer.

### P0.6 Make Test Shell Deterministic and Fail-Hard

Priority: P0
Impact: High
Risk: Low

Current pain:
- Make targets ignore failures (`-npx ...`) and local runs can reuse unknown servers.
- Files: `Makefile`, `test/server-manager.js`.

Change:
- Remove failure masking from test targets.
- Ensure test server ownership is explicit for CI/local modes.
- Guarantee cleanup in error paths (trap/finally strategy).

Success criteria:
- Test failures propagate non-zero exit reliably.
- No “pass” runs with hidden failed vitest execution.

### P0.7 Align Accuracy Test Inputs with Data Pipeline Contract

Priority: P0
Impact: High
Risk: Medium

Current pain:
- Accuracy test reads NPZ from `assets/.../data`; pipeline writes NPZ to `data-generated/...`.
- Files: `test/chebyshev-accuracy.test.js`, `scripts/orbits.py`, `scripts/compress-orbits.py`.

Change:
- Introduce explicit ephemeris artifact contract via manifest:
  - `assets/<mission>/data/ephemeris-manifest.json`
- Tests and runtime loaders consume manifest paths rather than filename conventions.

Success criteria:
- Accuracy tests do not silently skip due to path mismatch.
- Runtime and scripts share the same declared source-of-truth artifact map.

## P1 - High Value Next (maintainability + scaling)

### P1.1 Mission Plugin Contract

Priority: P1
Impact: High
Risk: Medium

Current pain:
- Mission-specific behavior is mostly implicit and centralized in platform flow.

Change:
- Define optional mission hooks in `assets/<mission>/js/mission-plugin.js`, e.g.:
  - `normalizeConfig(raw)`
  - `decorateEvents(events, context)`
  - `getLocationMarkers()`
  - `onRuntimeReady(shellPorts)`
- Load plugin at bootstrap if present.

Success criteria:
- Shared platform code stops accumulating mission-specific branches.
- Mission customization is local and declarative.

### P1.2 Config Schema Validation + Normalization

Priority: P1
Impact: High
Risk: Low/Medium

Current pain:
- Loader relies on permissive shape assumptions and scattered coercions.
- File: `assets/platform/js/data/mission-data.js`.

Change:
- Add normalized config pipeline:
  - `parseMissionConfig(raw)`
  - `validateMissionConfig(parsed)`
  - `normalizeMissionConfig(valid)`
- Fail early with explicit diagnostics.

Success criteria:
- Downstream modules consume a stable typed shape.
- Fewer null/shape checks in runtime modules.

### P1.3 Unify Mode/Dimension/Phase Transition Model

Priority: P1
Impact: High
Risk: Medium

Current pain:
- Transition rules are spread across multiple modules.
- Files: `mode-actions.js`, `dimension-actions.js`, `settings-actions.js`, `relative-mode.js`.

Change:
- Add pure transition reducer:
  - `transitionRuntimeState(state, intent) -> { nextState, effects }`
- Shell executes returned effects only.

Success criteria:
- One source of truth for toggles and transition invariants.
- Regression tests cover intent -> state transitions.

### P1.4 Rationalize Runtime Dependency Ports

Priority: P1
Impact: Medium/High
Risk: Medium

Current pain:
- Very large dependency bag in `assets/platform/js/app/mission-runtime-wireup-config.js`.

Change:
- Group into explicit ports:
  - `uiPort`
  - `renderPort`
  - `dataPort`
  - `clockPort`
  - `statePort`
- Keep each port minimal and purpose-specific.

Success criteria:
- Lower cognitive load in runtime wiring.
- Easier module-level ownership and mocking.

### P1.5 Extract Shared Ephemeris Core for Scripts + Runtime + Tests

Priority: P1
Impact: Medium/High
Risk: Medium

Current pain:
- Chebyshev/NPZ interpolation and validation logic appears in multiple places.

Change:
- Create shared core package (Python + JS parity or generated vectors):
  - segment evaluation
  - interpolation primitives
  - validation metrics

Success criteria:
- Reduced algorithm drift across runtime/tests/tooling.
- One canonical behavior definition per algorithm.

## P2 - Cleanup / Structural Hardening

### P2.1 Retire Legacy Global Mutable Bag in `mission.js`

Priority: P2
Impact: High (long-term)
Risk: Medium/High

Change:
- Gradually replace top-level mutable variables with explicit state slices and reducer-like transitions.

### P2.2 Centralize Mission Asset URL Resolution

Priority: P2
Impact: Medium
Risk: Low

Change:
- One pure resolver for orbit/model/landing/relative asset paths.
- Consumers should not manually compose filenames.

### P2.3 Remove CY3-Specific Naming in Shared Platform APIs

Priority: P2
Impact: Medium
Risk: Low

Current examples:
- `CY3Dialog`, `cy3Animate`, `cy3.originOverride` naming remains in shared layers.

Change:
- Rename to mission-agnostic keys and provide short compatibility shims.

### P2.4 Reproducible Build/Deploy Shell

Priority: P2
Impact: Medium
Risk: Low

Change:
- Inject clock/path dependencies in build/deploy scripts.
- Avoid hidden global `chdir` assumptions.

## Target Architecture (Recommended)

```text
assets/platform/js/
  core/
    domain/        # Pure mission/domain logic
    state/         # Pure transitions/reducers/state planners
    plans/         # Render/UI/IO intent planners
  shell/
    ui/            # D3/DOM application only
    render/        # THREE mutations/render calls only
    io/            # fetch/storage/url/timeouts/process env
    time/          # schedulers/clock adapters
  app/
    runtime/       # composition and wiring only
```

Key rule:
- `core/*` must not import DOM/THREE/fetch/window/document.
- `shell/*` may do side effects but should not own business rules.

## Suggested Implementation Sequence

### Wave 1 (1-2 weeks)

1. P0.6 fail-hard tests and deterministic server ownership.
2. P0.1 mission-state-access split (state vs ui/time effects).
3. P0.2 camera policy extraction + tests.
4. P0.7 ephemeris manifest contract (read-only adoption in tests first).

### Wave 2 (2-4 weeks)

1. P0.3 frame planner extraction.
2. P0.4 typed event semantics and migration for existing mission configs.
3. P0.5 phase-agnostic initialization model.

### Wave 3 (4-8 weeks)

1. P1.1 mission plugin contract.
2. P1.2 config schema/normalizer.
3. P1.3 unified transition reducer.
4. P1.4 dependency-port decomposition.

### Wave 4 (as capacity permits)

1. P1.5 shared ephemeris core extraction.
2. P2 series cleanup and de-legacy work.

## Measurable Architecture KPIs

1. Core purity:
   - 0 imports of `window/document/d3/THREE/fetch` in `core/*`.
2. Testability:
   - >= 80% of transition/planner logic covered by pure unit tests.
3. Boundary size:
   - `mission-runtime-wireup-config` dependency count reduced by >= 40%.
4. Mission scalability:
   - Add one new mission/phase without editing core transition logic.
5. Pipeline determinism:
   - `make test` returns non-zero on any failed test, consistently.

## Concrete First PR Candidates

1. `refactor: split mission-state-access into core state + shell ui/time adapters`
2. `refactor: extract camera policy planner from camera-actions`
3. `test: make Makefile fail-hard and enforce deterministic server lifecycle`
4. `feat: introduce ephemeris-manifest contract and consume in chebyshev accuracy tests`
5. `feat: typed event semantics in config-events with compatibility bridge`

## Notes

- This report is based on static code analysis plus focused sub-agent scans over platform runtime, mission config/runtime specialization, and scripts/test infrastructure.
- No full runtime/test execution was performed for this review.
