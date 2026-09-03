# Mobile Experience V1

## Scope

This specification defines the mobile mission experience at viewport widths of
`600px` or less. Mobile is scene-first, readable, and touch-friendly. Entering
or leaving mobile mode must not corrupt the corresponding desktop camera or
view state.

Structural rationale is documented in [Mobile Experience Design](../designs/mobile-experience.md).
Unresolved intent and implementation gaps are tracked in
[Mobile Experience Follow-Ups](../plans/implementation/mobile-experience-followups.md).

## Experience Contract

- The rendered mission scene remains the primary visual surface.
- Focused cards expose one mobile task at a time without reproducing the full
  desktop control panel.
- The bottom navigation exposes only available cards.
- Critical actions must not depend on undisclosed gestures.
- Overlays and temporary surfaces require predictable close or back behavior.
- Desktop-only panels and controls must not remain interactable while hidden.

## Navigation

The mobile shell supports these card identities:

- `mission`: always available and selected by default.
- `orbit`: always available.
- `views`: always available.
- `compose`: optional; hidden when the mobile composition capability is
  disabled.

Selecting an unavailable or unknown card returns to `mission`. Exactly one card
is active at a time. Navigation state and card visibility must agree.

The current runtime does not yet expose the required Orbit card. That is an
implementation gap, not an accepted change to this contract.

## Mission Card

The Mission card must provide:

- mission identity and phase;
- elapsed mission time;
- distance from Earth and Moon;
- spacecraft speed and Craft-Moon-Earth angle when available;
- kilometer/kilometers-per-second and mile/miles-per-hour unit modes;
- active-event status;
- play/pause, realtime, speed, slower, and faster controls; and
- primary and additional mission metrics in compare mode.

The shared timeline dock remains the authoritative mobile timeline surface. It
need not be duplicated inside the Mission card.

## Orbit Controls

The Orbit card provides:

- one orbit surface with a `2D | 3D` mode switch;
- `Earth | Moon | Relative` origin choices when supported by the mission;
- essential axes/plane controls; and
- secondary toggles behind one `More` surface.

The card must control the shared mission scene and runtime state rather than
create a second orbit renderer or settings model. The desktop settings panel
may remain unavailable on mobile.

The mobile surface must keep control density low. The shared header pill strip
may remain a temporary implementation path, but it does not satisfy the Orbit
card requirement.

## Views Card

The Views card provides these presets:

- `Craft to Moon`
- `Craft to Earth`
- `Earth to Moon`

The presets operate the shared main camera. Only the selected preset is active;
mobile must not create or continuously render duplicate desktop auxiliary
cameras for inactive presets.

The card also provides field-of-view controls. Moon visibility information and
the far-side display control are shown only when relevant to the selected view.
The card repeats the synchronized mobile transport controls.

## Optional Composition Card

The `compose` card is feature-gated. When disabled, its navigation control and
card are hidden and requests to open it fall back to Mission.

When enabled, the card provides:

- free, Earth, and Moon camera-lock modes;
- manual and automatic field of view;
- ambient/Earthshine control;
- roll control;
- a short composition timeline; and
- synchronized mission transport controls.

The final user-facing name and relationship to desktop `Frame & Shoot` remain
open and are tracked in the follow-up plan.

## Mission-Specific Workflows

Mission-specific desktop workflows must not leave dead or invisible launchers
on mobile. Artemis II requires intentional mobile adaptations with the same
workflow meaning as desktop:

- `Flyby in Focus` is launched from the Flyby focus control and presents the
  lunar-flyby composition workflow rather than a generic camera card.
- `Splashdown in Spotlight` is launched from the Splashdown focus control and
  opens automatically on initial Artemis II load.
- Splashdown uses a full-height left timeline/event sidebar and a right-side
  `2D` map or `3D` globe viewport.
- Splashdown retains second-level (`-1s`, `+1s`) and minute-level (`-1m`,
  `+1m`) transport controls.
- It presents RTC-3 through splashdown return events, dual-unit metrics, and a
  provenance note for the app-generated final descent.

Current mobile CSS hides these workflows. Their mobile implementation and any
updated user-facing names remain follow-up work; the required workflow content
must not be discarded during that adaptation.

## Interaction And Accessibility

- Interactive touch targets must be at least `44px` in both dimensions or use
  an equivalent hit area.
- Primary actions must be reachable with one thumb in ordinary portrait use.
- Controls require accessible names and visible keyboard focus where keyboard
  interaction is available.
- Selected, unavailable, and disabled states must not rely on color alone.
- Text must remain readable without horizontal page scrolling.
- The mobile shell and timeline must remain usable with browser chrome and safe
  area insets.
- Footer, timeline, and bottom-navigation zones must remain stable enough to
  prevent accidental input during card changes.

## Rendering And Performance

- Mobile must avoid duplicate heavy renderers for inactive cards.
- Off-screen panels and desktop auxiliary views must not perform continuous
  rendering work.
- Card and pill-strip layout changes may recenter the shared scene, but must not
  alter mission time or semantic camera state.
- The experience must remain responsive on representative mid-tier mobile
  hardware; measurement and device coverage are owned by the follow-up plan.

## Desktop Isolation

- Mobile-only cards and navigation are hidden above the mobile breakpoint.
- Entering mobile may apply a mobile presentation preset.
- Leaving mobile restores the captured desktop camera and view state.
- Mobile tab changes must not leak simplified presentation state into desktop.

## Acceptance Criteria

- Mission, Orbit, and Views are reachable from bottom navigation at mobile
  widths.
- Compose is either fully available or fully hidden according to its feature
  gate.
- Mission, Views, and optional Compose transport controls stay synchronized
  with the mission clock.
- The three Views presets update the shared main camera without creating
  parallel renderers.
- Desktop state is restored after leaving mobile mode.
- Essential orbit controls remain reachable without the desktop settings panel.
- Touch targets meet the `44px` requirement.
- Hidden desktop workflows cannot intercept mobile input.
