---
doc_class: design
status: current
scope: runtime.frame.relative
canonical_for:
  - relative-frame-construction
  - relative-mode-runtime-integration
---

# Relative Frame Design

The required user-visible behavior is owned by the
[Relative Mode specification](../../specs/modes/relative-mode.md).

## Coordinate Frame

At each time `t`, start with geocentric Moon state `r_EM(t), v_EM(t)`:

- `x_hat = normalize(r_EM)`
- `z_hat = normalize(r_EM x v_EM)`
- `y_hat = z_hat x x_hat`

For geocentric spacecraft position `r_SE(t)`, relative coordinates are:

- `x_rel = dot(r_SE, x_hat)`
- `y_rel = dot(r_SE, y_hat)`
- `z_rel = dot(r_SE, z_hat)`

The Moon therefore lies on `+X` at `(||r_EM||, 0, 0)`. Unlike compare mode,
the frame does not normalize Earth-Moon distance.

## Runtime Integration

Relative mode retains `geo` as the base origin and replaces its orbit URLs with
`relative-<SPACECRAFT>-cheb.json` in
`src/platform/js/app/init-config-scene-setup.js`. Additional craft series can be
merged from craft-specific relative support files.

`src/platform/js/scene-state.js` represents the Moon as
`(distance, 0, 0)` with radial velocity `(dr/dt, 0, 0)`.

Sun direction is transformed into the rotating basis when the loaded Sun
series is inertial. When the primary relative file already carries
relative-frame Sun vectors, the runtime records that provenance and skips a
second rotation.

## Reload And Restore Flow

Mode switching is coordinated by `src/platform/js/app/relative-mode.js`.

Primary session keys:

- `mission.animTimeOverride`
- `mission.originOverride`

Legacy fallbacks:

- `cy3.animTimeOverride`
- `cy3.originOverride`

Startup restoration flows through:

1. `mission-view-bootstrap.js`, which consumes session overrides;
2. `mission-runtime-handlers-entry.js`, which forwards startup state into init
   flags; and
3. `init-orchestration.js`, which applies `startupAnimTimeOverride` before
   ordinary reset/start behavior.

This keeps the mission clock continuous even though entering or leaving the
relative mode reloads the page.

## Design Boundaries

- Offline generation owns coordinate rotation and Chebyshev fitting, minimizing
  runtime transforms during animation.
- Runtime loading owns selecting and combining available series.
- Scene state owns current body positions and frame-aware lighting.
- UI and URL controllers own activation and reload persistence.
- Raw ephemeris remains unchanged; relative data is a derived product.
