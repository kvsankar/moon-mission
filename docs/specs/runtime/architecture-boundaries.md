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
- Explicit inactive-origin view transforms and plane state read/write only that
  scene. Missing inactive scenes use defaults and cannot mutate active mirrors
  or visible controls. Legacy startup fallback and compatibility writes apply
  only to the currently active origin.

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

### Asynchronous Transition Ownership

- Origin/dimension changes advance a monotonic runtime revision. Returning to
  an earlier origin or dimension does not restore the authority of old work.
- Deferred initialization, orbit processing and presentation effects carry
  their initiating origin, scene identity and transition revision. A newer
  request or replaced scene invalidates the older effect's authority.
- Valid inactive-origin data may fill its own cache. It must not publish
  active-view readiness, metadata controls, progress, camera or renderer changes.
- Staleness is checked after asynchronous boundaries, including inside SVG
  construction. Cancellation propagates to the caller; a cancelled render
  build is not successful readiness.
- Warm activation can reuse cached data and must restore its provenance and
  authored style state without allowing old callbacks to select the view.

### Scene Retirement And Resource Ownership

- Scene disposal is terminal and idempotent. Readiness and publication authority
  are revoked before abort, resource-disposal or application callbacks run.
- A disposed instance cannot be initialized again or returned as a live scene;
  activation creates a replacement scene and its controllers.
- Retirement cancels only the scene's owned work. Waiting promises settle even
  when no further frame occurs or an underlying loader ignores cancellation.
- Late completions cannot publish readiness, mutate a replacement renderer or
  schedule a render. Unclaimed results are still cleaned up.
- Texture acceptance transfers responsibility to scene-held inputs before
  renderer effects. Shared textures and generated dependencies remain alive
  until the final owner releases them; failed adoption cannot strand inputs.
- Cleanup continues after an individual cleanup failure. Reentrant or repeated
  disposal cannot restore readiness or release another consumer's resources.
- Async model/resource completion carries renderer identity/generation. Late or
  out-of-order results are disposed and settle as superseded rather than
  attaching to a retired/replaced scene. URL-selectable catalogs key both values
  and in-flight work by resolved URL; failures remain retryable.

### Required Data Readiness And Recovery

- Required orbit startup resolves explicitly to `ready`, `failed` or
  `superseded`; success-only polling must not hide a terminal request failure.
- A failure shows an actionable Retry control and ends the busy indicator.
  Retry starts a new owned attempt, reuses valid data, and does not duplicate
  the animation loop or publish obsolete errors. Failed configuration loads
  are not cached as successful configuration.
- A pending retry leaves origin navigation usable. If an internal view change
  supersedes startup without a newer startup owner, one automatic latest-view
  handoff is allowed; repeated interruption offers Retry rather than spinning.
- Landing data is a separate scene dependency. Late completion installs descent
  geometry for the matching live scene; a warm activation can use cached data.
  Repeated identical data is idempotent. Changed landing data replaces only its
  descent geometry and disposes the replaced resources.

### Structural Refactor Verification

- Structural refactors preserve behavior unless an owning feature
  specification changes it.
- Refactors require focused behavior tests proportional to their blast radius.
- Boundary enforcement must include automated import/effect checks where
  practical; wiring tests alone are insufficient.
- A refactor is not complete while the documented dependency direction is
  knowingly violated without a tracked follow-up.
