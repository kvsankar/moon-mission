# Main View Photo Mode Plan

Last reviewed: 2026-09-03

Shared rendering helpers and a main-view Photo boolean exist, but the complete
user-facing mode has not shipped. The original phased proposal is preserved in
the [reviewed history](../../archive/plans/main-view-photo-mode-history-2026-09-03.md).

## Current Baseline

- Runtime view state contains `viewPhotoMode`.
- The main renderer applies shared photo presentation helpers.
- Rich exposure, sky, body, overlay, roll, and flyby controls remain local to
  Frame and Shoot.
- The controller knows about `#photo-mode-pill`, but `mission.html` does not
  currently provide that control.

## Remaining Outcomes

1. Decide whether Photo mode enhances the current main camera or introduces a
   craft-anchored shooting camera.
2. Define shared photo state and persistence without duplicating Lunar Features
   state or Frame and Shoot panel state.
3. Reuse the existing shared body and exposure helpers, then extract the
   remaining reusable sky, Sun, and overlay presentation with frame-safe
   application and restoration.
4. Add a native app control surface for dense Photo controls, with the header
   limited to high-frequency entry controls.
5. Port composer-only overlays incrementally, with tests for each promoted
   behavior.
6. Retain Frame and Shoot until the main mode reaches behavioral and test
   equivalence; then convert it to a shared-state wrapper or retire it.

## Decisions Required

- Ship initially for Artemis II or as a global capability gated by available
  mission assets and features.
- Preserve, replace, or retire the Frame and Shoot phase-local flyby timeline.
- Keep EV compensation as the primary exposure language or add an
  ISO/shutter/aperture presentation layer.
- Choose which state persists per mission and which state resets on load.

## Guardrails

- Entering and leaving Photo mode must restore prior camera semantics.
- Normal mission rendering must remain unchanged when Photo mode is off.
- Mission Media and Broadcast must coexist with Photo mode without layout
  conflicts.
- Production UI stays within the repository's existing control language.

Related behavior:
[Frame And Shoot Lighting And Exposure](../../specs/rendering/frame-and-shoot-lighting-and-exposure.md).
