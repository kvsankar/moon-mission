---
doc_class: spec
status: current
scope: rendering.frame-and-shoot
canonical_for:
  - frame-and-shoot-lighting-exposure
---

# Frame And Shoot Lighting And Exposure Spec

Last updated: 2026-05-13

This spec is the source of truth for lighting, exposure, and aesthetic control
behavior in the Artemis II `Frame and Shoot` / `Flyby in Focus` composer panel.
It covers the product model and implementation boundaries for:

- `src/platform/js/app/auxiliary-camera-views.js`
- `src/platform/js/controllers/animation-3d-controller.js`
- `src/platform/js/rendering/light-manager.js`
- `src/platform/js/core/domain/reflected-lighting.js`
- `src/platform/js/core/constants.js`

Scope boundary: Moon surface rendering is out of scope. Do not change crater
rendering, terminator rendering, lunar terrain shadowing, lunar texture/material
profiles, or the Moon photometric shader as part of Frame and Shoot
lighting/exposure work.

## Goals

- Keep the scene's physical lighting model separate from camera exposure and
  creative presentation controls.
- Make Earthshine and Moonshine behavior easier to reason about during solar
  eclipse and dark-side compositions.
- Let Frame and Shoot expose a photographer-style workflow.
- Preserve existing Sun control intent: ordinary Sun optics remain separate from
  eclipse-corona rendering.
- Avoid contradictory docs by treating this spec as authoritative for Frame and
  Shoot lighting/exposure behavior.

## Non-Goals

- No mission ephemeris/data changes.
- No attempt to make every visual effect absolutely photometric in this phase.
  The immediate goal is a clean model and safer implementation path.

## Control Taxonomy

Frame and Shoot controls are grouped into three conceptual layers.

### Physical

Physical controls and model inputs represent the simulated scene before camera
presentation:

- Sun direction and physical baseline intensity.
- Eclipse geometry and occlusion state.
- Earthshine direction, phase, distance, and reflected-light intensity.
- Moonshine direction, phase, distance, and reflected-light intensity.
- Corona geometry when derived from eclipse state.

Physical values should be computed from scene geometry and constants wherever
practical. Physical reflected-light values may have implementation calibration,
but they should not be boosted just to make a shot attractive.

### Photo

Photo controls describe how the camera records the physical scene:

- exposure / EV compensation
- auto exposure
- eclipse-specific auto exposure
- tone mapping exposure
- optical halo, glare, star visibility threshold, and flare response

Earthshine visibility during a solar eclipse should primarily come from this
layer. A long-exposure or high-ISO shot can reveal the Moon's Earthlit night side
without changing the underlying Earthshine physics.

### Creative

Creative controls deliberately bend the presentation after the physical scene and
photo model are defined:

- Earth fill
- Moon fill
- Earthshine gain
- Moonshine gain
- star gain or magnitude emphasis
- corona gain/detail/motion
- Sun flare/halo strength when used as an artistic adjustment

Creative controls must be labeled and implemented as gain/fill controls, not as
the physical truth of the scene.

## Current Behavior Summary

The current implementation already has several useful pieces:

- Frame and Shoot is the `earth-rise-composer` workflow panel in
  `auxiliary-camera-views.js`.
- The composer camera remains anchored at Orion; wheel zoom changes optical FoV.
- Frame and Shoot owns explicit exposure compensation and eclipse auto exposure
  state, and persists those photo controls with the composer panel state.
- Exposure compensation is exposed as a `-16` to `+16` stop EV range.
- Manual exposure is exposure compensation. Auto Exposure may add an
  eclipse-specific EV bias, so the UI must show the computed total EV whenever
  the two values stack.
- The current eclipse Auto Exposure bias is `+5 EV` when an active Earth- or
  Moon-occluded eclipse is present and the active occluder's disc is visible in
  Frame and Shoot. It is suppressed when no supported active occluder is visible
  in the composition.
- Current exposure scope is mixed:
  - Earth, Moon, spacecraft, and ordinary tone-mapped scene bodies respond to
    renderer tone-mapping exposure.
  - Stars, Milky Way/starmap, constellation texture, planet markers, and most
    Sun/corona presentation use `toneMapped: false` or custom visual state, so
    they need explicit exposure-aware gains before Frame and Shoot can claim a
    fully photographic exposure pipeline.
- Earthshine and Moonshine directional lights are layer-scoped reflected-light
  sources created by `light-manager.js`.
- Reflected-light direction and phase are computed by
  `core/domain/reflected-lighting.js`.

Current implementation notes:

- UI labels use `Earth Fill`, `Moon Fill`, `Earthshine Gain`, and
  `Moonshine Gain`.
- The manual photo slider is labeled `Exposure Comp`; the adjacent total EV
  readout shows the additive result of manual compensation plus any active auto
  exposure bias.
- The controls include a reset command for restoring Frame and Shoot
  presentation values to defaults without changing the selected event/time.
- Some internal state names still use older `Ambient` terminology for
  compatibility.
- Creative reflected-light gains scale the live physical baseline; if phase
  geometry makes the baseline zero, gain keeps it zero.

## Required Design Direction

1. Compute a physical baseline first.
   - Reflected-light state should come from geometry, albedo/radius constants,
     phase, and distance.
   - If calibration factors are retained, document them as calibration, not
     exposure or creative gain.

2. Apply camera exposure second.
   - Frame and Shoot should own explicit exposure state.
   - The initial UI can use EV compensation if ISO/shutter/aperture would be too
     much surface area.
   - Manual exposure should be labeled as compensation, not as the entire camera
     exposure, when auto exposure is enabled.
   - If manual EV and auto EV are both active, the UI must show the computed
     total EV.
   - Future UI may expose ISO, shutter, and aperture as a photographer-friendly
     wrapper around EV/tone-mapping exposure.

3. Add eclipse-aware auto exposure.
   - Auto exposure should respond to eclipse/dark-side compositions by biasing
     the camera layer, not by changing physical Earthshine.
   - Eclipse auto exposure should meter the active Frame and Shoot composition:
     apply the eclipse bias when the active Earth or Moon occluder disc is
     visible, and leave views without a supported visible occluder at the normal
     exposure path.
   - It should be user-overridable.
   - It must avoid silently fighting deliberate manual exposure. Manual exposure
     compensation may remain enabled while Auto Exposure is on only if the UI
     makes the additive total explicit.

4. Keep creative overrides independent.
   - Creative fill/gain controls can scale individual contributors.
   - Creative overrides should be resettable and visibly distinct from physical
     or photo controls.

## Sun Control Rules

- Normal Sun controls (`Strength`, `Halo`, `Star`, `Flare`) are camera/photo or
  creative controls outside eclipse-specific corona rendering.
- During craft-view solar eclipse, normal Sun optics can remain visible in the
  UI but must not drive the eclipse-corona model.
- `Eclipse Corona` controls (`Intensity`, `Motion`, `Detail`) drive the
  corona-only eclipse presentation. `Motion` is a real-time visual animation
  control for the corona layer and does not depend on mission playback.
- Eclipse corona falloff should avoid a visibly circular texture boundary; the
  outer fade should follow angular streamer structure.
- Any future Sun physical intensity control must be clearly separate from camera
  exposure and creative glare/flare controls.

## Reflected-Light Rules

- Earthshine and Moonshine physical baselines should be phase-aware and
  direction-aware.
- Earthshine should illuminate the Moon from the Earth-facing direction.
- Moonshine should illuminate Earth from the Moon-facing direction.
- If a reflected-light baseline is zero because of phase/geometry, Frame and
  Shoot should not silently reintroduce it as physical light.
- Visibility of very dim reflected light should usually be handled through
  exposure or explicit creative gain.

## Exposure Scope Rules

- The desired long-term model is:
  `physical scene radiance -> camera exposure -> tone/display transform`.
- UI labels, text overlays, crater labels, controls, and panel chrome must not
  respond to photo exposure.
- Tone-mapped bodies and spacecraft can use renderer tone-mapping exposure.
- Non-tone-mapped sky/star/Sun layers should become exposure-aware through their
  own uniforms or visual-state gains, not by pretending they are already part of
  the renderer tone-mapping path.
- Until that work is complete, Frame and Shoot documentation and UI must avoid
  implying that exposure affects every visible layer equally.

## Moon Dark-Side Investigation Rules

- Do not change Moon surface rendering, crater rendering, terminator rendering,
  lunar terrain shadowing, lunar texture/material profiles, or the Moon
  photometric shader without explicit approval.
- If high positive exposure reveals light on a Moon region that should be
  neither Sun-lit nor Earth-lit, first isolate contributions in the Frame and
  Shoot composition layer:
  - renderer exposure multiplier
  - eclipse auto EV
  - Earthshine directional light intensity/gain
  - Moon Fill / `moonShadowLift`
  - global body ambient
  - residual Sun/terminator contribution
- Correct non-physical residuals at the Frame and Shoot composition layer before
  considering any Moon-rendering change.

## Fill Control Rules

- `Earth Ambient` should be treated as `Earth Fill` in design language.
- `Moon Ambient` should be treated as `Moon Fill` in design language.
- Fill controls are creative presentation aids.
- Fill controls must not be described as physically correct Earthshine or
  Moonshine.

## Delivery Plan

Delivery sequencing is tracked in
[Archived Frame And Shoot Lighting Implementation Plan](../../archive/plans/frame-and-shoot-lighting.md).

## Testing Expectations

- Unit tests for physical reflected-light state should cover phase, direction,
  distance, and zero-light cases.
- Unit tests for Frame and Shoot exposure should verify renderer exposure is
  applied and restored around panel renders.
- Unit tests should verify creative gain/fill controls do not mutate physical
  baseline state.
- Browser tests should verify controls remain present and grouped correctly.
- Visual checks should use real mission routes such as `/artemis2/`.
- Any visual baseline update must explicitly state whether it comes from photo
  exposure, creative presentation, or a physical lighting change.

## Documentation Authority

- This spec is authoritative for Frame and Shoot lighting/exposure behavior.
- `docs/research/moon-rendering/research-and-plan.md` remains historical
  renderer research and should not be used to justify new Frame and Shoot
  exposure semantics.
- `docs/research/corpora/sun-fov/README.md` remains a reference pack for Sun
  appearance, not a behavior spec.
