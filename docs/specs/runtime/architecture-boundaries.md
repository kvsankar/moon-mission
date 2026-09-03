# Runtime Architecture Boundaries

## Scope

This specification defines enforceable dependency, state, and effect ownership
rules for the runtime architecture described in
[Runtime Target Architecture](../../designs/runtime/target-architecture.md).
Known violations are tracked in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md).

## Dependency Direction

Allowed dependency direction is:

```text
shell/effects -> application services -> state ports -> functional core
```

- Functional-core modules must not import application, UI, controller,
  rendering, or data-effect modules.
- State ports may depend on core value types and normalization but not shell
  effects.
- Application services may depend on core and state ports and receive effects
  through explicit arguments.
- Shell modules may compose all inner layers.
- Only composition roots may intentionally know the full dependency graph.

## Functional-Core Purity

Core planners, selectors, and domain models must:

- take every input explicitly;
- return values or declarative plans;
- avoid DOM, D3, Three.js, fetch, cache, workers, timers, observers, media
  elements, and browser globals; and
- remain deterministic for the same inputs.

Test helpers must not hide production business logic that lacks an equivalent
runtime owner. Shared behavior belongs in production core modules and is tested
through those modules; tests may provide fixtures and assertions, not a second
implementation of the contract.

## State Ownership

- Mutable session, view, interaction, media, panel, data-source, loop, and
  scene-registry state must have an explicit owner.
- State APIs must be narrower than the full runtime context.
- State containers must not mutate DOM or renderer objects.
- Scene-scoped state must not silently fall back to a global mirror when the
  scene identity is available.
- Compatibility mirrors must be isolated and removable rather than treated as
  primary state.

## Application-Service Boundary

Application services coordinate use cases. They may calculate sequencing and
invoke injected state/effect ports, but the target boundary prohibits direct:

- DOM queries or mutation;
- D3 or Three.js mutation;
- fetch/cache/worker lifecycle;
- timer or animation-frame ownership; and
- hidden access to browser globals.

Existing violations are migration gaps and do not weaken this requirement.

## Shell And Effect Ownership

The shell owns browser and rendering effects, including:

- DOM creation, layout, focus, and accessibility state;
- canvas, SVG, D3, and Three.js mutation;
- network, cache, worker, and asset-loading lifecycle;
- media element control;
- timers, observers, and animation frames; and
- event listener binding and disposal.

Effect adapters should expose the smallest interface required by application
services.

## Composition Roots

- Composition roots may construct state, services, controllers, and adapters.
- They may pass explicit dependencies across layers.
- They must not become an alternative owner of domain policy.
- New features must not expand broad context objects when a narrow dependency
  or grouped port expresses the real contract.

## Mission-Specific Behavior

Mission-specific configuration, panels, media, and rendering remain at the
shell edge. Reusable calculations may move into the core only after mission
inputs are explicit and the behavior is independently testable.

## Change Safety

- Structural refactors preserve behavior unless an owning feature
  specification changes it.
- Refactors require focused behavior tests proportional to their blast radius.
- Boundary enforcement must include automated import/effect checks where
  practical; wiring tests alone are insufficient.
- A refactor is not complete while the documented dependency direction is
  knowingly violated without a tracked follow-up.
