# Main View Photo Mode Plan

Status: backlog plan, not scheduled.

Last updated: 2026-05-15

## Purpose

The current Artemis II `Frame and Shoot` workflow is implemented as a floating
composer panel. That was useful for proving the photographic rendering controls,
but it competes for screen space with Mission Media, Broadcast, auxiliary view
panels, and the main transport controls.

The intended direction is to evolve the main mission view into a first-class
Photo mode. In that model:

- the main viewport becomes the photographic composition surface
- Mission Media and Broadcast remain reference panels
- Frame and Shoot controls move into a main-view Photo control surface
- the floating Frame and Shoot panel eventually becomes optional or retired

## Current Findings

- Main view already has a `viewPhotoMode` flag and a `photo-mode-pill` control.
- The main render loop already applies some photo presentation/exposure logic in
  `src/platform/js/app/scene-handler-class.js`.
- Shared photo presentation helpers already exist in
  `src/platform/js/app/photo-mode-render-presentation.js`.
- Rich Frame and Shoot state is still panel-local in
  `src/platform/js/app/auxiliary-camera-views.js` as `composer*` state.
- Frame and Shoot currently owns controls for exposure, auto exposure, star
  magnitude, labels, constellations, constellation labels, clouds, Moon outline,
  see-through rendering, fill/gain, corona, roll, and flyby phase controls.
- Lunar Features already have reusable main-view state and controls.
- Main mission transport and event controls already exist outside Frame and
  Shoot.
- Frame and Shoot also has phase-local flyby timeline behavior. That behavior
  should not be flattened into generic transport without a deliberate replacement.

## Product Direction

Photo mode should be a mode, not a default floating panel.

Recommended surface model:

- Keep the header lean:
  - `Photo`
  - possibly `Clouds`
  - possibly a compact `Mag` control if it proves high-frequency
- Put dense controls in a native app slide panel rather than adding many header
  pills.
- Avoid `lil-gui` for product UI. It is useful for renderer tuning and debug
  experiments, but it would introduce a new visual and interaction language
  beside the existing header pills, settings panel, and panel shell.

Suggested Photo slide panel groups:

- Camera:
  - Free / Earth / Moon / Craft lock
  - FoV
  - roll
  - reset
- Exposure:
  - exposure compensation
  - auto exposure
  - computed total EV
- Sky:
  - star magnitude
  - labels
  - constellations
  - constellation labels
- Scene:
  - clouds
  - Moon outline
  - see-through bodies
- Creative:
  - Earth Fill
  - Moon Fill
  - Earthshine Gain
  - Moonshine Gain
- Lunar:
  - reuse the existing Lunar Features controls rather than duplicating them

## Architectural Risks

### State Duplication

Frame and Shoot persists panel-local `composer*` state through the panel layout
system. Main view uses runtime view state. Moving controls piecemeal can create
two sources of truth.

Mitigation:

- define shared photo state before moving UI controls
- map the existing composer panel onto that state only after the shared model is
  stable

### Render-Pass Assumptions

The composer panel currently applies temporary render overrides and restores
them after rendering. Main view Photo mode needs persistent, frame-safe
application of photo state.

Mitigation:

- extract composer exposure, sky, body, Sun, and overlay presentation logic into
  shared helpers
- have both main view and any remaining Frame and Shoot surface consume those
  helpers

### Camera Semantics

Frame and Shoot is craft-anchored and treats wheel zoom as optical FoV. The main
view camera is more general.

Open decision:

- Does Photo mode switch the main camera into a craft-anchored shooting camera?
- Or does Photo mode only enhance the currently selected main camera view?

This is the main architectural hinge.

### Overlay Portability

Labels, constellation labels, Moon outline, and see-through rendering are
currently composer overlay features. They are not yet general main-view overlay
modules.

Mitigation:

- migrate overlay features one at a time into reusable modules that can target
  the main canvas
- keep UI promises narrow until the overlays are actually shared

### Test Churn

Existing tests assert Frame and Shoot panel layout and control behavior.

Mitigation:

- preserve the old panel until main-view Photo mode has equivalent coverage
- add unit tests for shared photo state and render helpers before moving browser
  tests

## Phased Migration Plan

### Phase 1: Define Shared Photo State

Create a domain/state model for main-view photo controls.

Initial state candidates:

- photo mode enabled
- exposure compensation
- auto exposure enabled
- computed total EV
- star magnitude limit
- clouds enabled
- labels enabled
- constellation lines enabled
- constellation labels enabled
- Moon outline enabled
- see-through enabled
- Earth Fill
- Moon Fill
- Earthshine Gain
- Moonshine Gain
- roll

Acceptance criteria:

- state has documented defaults
- state can be read/applied independent of the Frame and Shoot panel
- state avoids duplicating existing Lunar Features state

### Phase 2: Promote Render Helpers

Move composer render presentation logic out of
`auxiliary-camera-views.js` where practical.

Targets:

- exposure and auto-exposure application
- star magnitude / sky presentation
- Earth cloud/photo texture presentation
- fill/gain controls
- Sun/corona presentation, if included in main Photo mode

Acceptance criteria:

- main view can apply photo state without reaching into the composer panel
- Frame and Shoot can still render using the same helpers
- renderer/material overrides are restored or applied consistently per frame

### Phase 3: Add Native Photo Slide Panel

Build a repo-native slide panel for dense Photo controls.

Guidelines:

- reuse existing app styling and control conventions
- avoid `lil-gui` for production UI
- avoid adding every control as a header pill
- keep the header `Photo` pill as the primary entry point

Acceptance criteria:

- toggling `Photo` opens or reveals the Photo control surface
- controls update shared photo state
- controls survive reload according to the chosen persistence model

### Phase 4: Camera Mode Decision And Implementation

Choose the main Photo camera behavior.

Candidate A:

- Photo mode enhances the current main camera.
- Lower implementation risk.
- Less faithful to the current Frame and Shoot shooting-camera model.

Candidate B:

- Photo mode introduces a craft-anchored shooting camera.
- Closest to Frame and Shoot.
- Higher risk because it must coexist with existing follow/view/plane controls.

Acceptance criteria:

- entering Photo mode is reversible
- leaving Photo mode restores prior camera semantics cleanly
- wheel zoom behavior is explicit and documented

### Phase 5: Migrate Overlay Features

Port composer-only overlays to reusable main-view overlays.

Order suggestion:

1. star magnitude
2. clouds
3. labels
4. constellation labels
5. Moon outline
6. see-through bodies

Acceptance criteria:

- each migrated overlay has unit-level behavior coverage where practical
- browser verification uses a real route such as `/artemis2/`
- controls do not regress normal non-Photo mission rendering

### Phase 6: Converge Or Retire Frame And Shoot

Once main-view Photo mode has equivalent capability:

- convert Frame and Shoot into a control wrapper over shared photo state, or
- retire it as a default panel and keep only a compatibility/developer entry

Acceptance criteria:

- no duplicated source of truth for photo controls
- Mission Media and Broadcast can coexist with Photo mode without layout fights
- documentation identifies Photo mode as the primary workflow

## Open Questions

- Should Photo mode be mission-specific initially for Artemis II, or global but
  only enabled where supporting assets/features exist?
- Should Photo mode persist per mission, per browser, or reset on load?
- Should the phase-local Frame and Shoot flyby timeline survive as a Photo mode
  sub-surface?
- Should ISO/shutter/aperture labels be introduced, or should EV compensation
  remain the primary exposure control?
- Which controls belong in the header versus the slide panel?
- What is the minimum viable Photo mode that lets us stop auto-opening Frame and
  Shoot?

## Related Documents

- [Frame and Shoot Lighting and Exposure Spec](../../specs/rendering/frame-and-shoot-lighting-and-exposure.md)
- [Panel System V1 Spec](../../specs/ui/panel-system-v1.md)
- [Timeline and Media Playback Spec](../../specs/time/timeline-and-media-playback.md)
