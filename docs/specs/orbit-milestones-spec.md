# Orbit Milestones

## Scope

This specification defines how mission events appear as selectable annotations
on the rendered trajectory. Architecture is documented in
[Orbit Milestones Design](../designs/rendering/orbit-milestones.md). Current
implementation gaps are tracked in
[Orbit Milestones Follow-Ups](../plans/implementation/orbit-milestones.md).

## Goals

- Connect timeline events to mission geometry by placing them at the event-time
  position in the active rendered frame.
- Use the mission clock as the only authority for selection and seeking.
- Reuse mission event metadata rather than create a second event system.
- Keep markers and labels readable across mission scales.
- Provide compact details through hover, focus, and touch interaction.
- Support geocentric, lunar, heliocentric, relative, compare, and multi-craft
  contexts when the required event and trajectory data are available.

## Non-Goals

- Milestones do not own independent event or ephemeris data.
- Marker placement must not depend on label text or visual path parsing.
- Events outside available ephemeris coverage must not be clamped to a path
  endpoint or presented as if their position were known.
- Milestone popouts do not replace timeline, media, or mission-brief surfaces.
- Dense missions must not display every label by default.

## Terms

- **Milestone**: a mission event rendered at its body position and event time.
- **Anchor position**: the resolved XYZ point in the active rendered frame.
- **Reachable event**: an event with a finite timestamp and an available body
  position in the current frame.
- **Unavailable event**: a valid event that cannot be placed because its time,
  body, data, or frame is unavailable.
- **Selected milestone**: the marker for the last explicit event selection.
- **Current milestone**: the event currently highlighted by mission-time state.

## Event Contract

Milestones consume the same normalized event information used by timeline and
event controls. No separate mission-configuration block is required.

Required fields:

- `key`: stable event identifier.
- `startTime`: event time accepted by the mission event pipeline.
- `label`: short user-facing title.

Behavioral fields:

- `body`: optional craft/body identifier; defaults to the primary craft.
- `clickable`: `false` prevents mission-time seeking.
- `preEphemeris`: `true` prevents trajectory placement.
- `burnFlag`: `true` selects burn semantics.
- `hoverText` or `infoText`: detailed description.
- `burnDirection`: `prograde`, `retrograde`, or `attitude`.
- `burnTypeLabel` and `durationSeconds`: burn details.
- `generated`, `generatedLabel`, and `generatedNote`: generated-segment
  provenance.

## Position Resolution

- Resolve the event body at `startTime` in the exact frame used by the active
  scene.
- Reuse the authoritative transformed trajectory representation or a shared
  current-frame position evaluator.
- Use an exact sample when available; otherwise linearly interpolate between
  adjacent transformed samples.
- Never clamp an out-of-range event to the first or last trajectory point.
- Distinguish invalid time, pre-ephemeris, out-of-range, missing body, missing
  data, and unsupported-frame failures when those conditions are knowable.
- Generated extension positions must retain generated-data provenance.

## Visibility And Scope

- Event Milestones has its own toggle and state; it is not the orbit-track
  toggle.
- Turning milestones off must not turn the orbit path off.
- Turning the orbit path off must not mutate the milestone preference.
- Milestone rendering is panel scoped. The main mission view owns its setting;
  auxiliary views render milestones only after explicitly opting in through
  their own panel state.
- Milestones for a hidden craft are hidden.
- Unavailable events remain accessible through timeline or list surfaces even
  though they are not drawn on the trajectory.

## Visual Semantics

| Category | Condition | Required distinction |
| --- | --- | --- |
| Burn | `burnFlag === true` | Warm color plus shape, outline, or icon distinction |
| Event | Other reachable event | Cooler neutral treatment with lower emphasis |
| Selected | Explicitly selected event | Persistent ring and short label |
| Current | Mission-time highlighted event | Static or animated ring according to motion preference |
| Generated | Generated event or anchor | Provenance cue distinct from ordinary sourced data |

Color must never be the only category cue.

Markers are trajectory annotations, not body-sized objects:

- Marker size must remain within a conservative screen-legible range.
- Burn markers may be modestly larger than routine events.
- Hover emphasis must not inflate a marker into a body-like dot.
- Hit areas may be larger than visible markers.

## Label Density And Layout

- Labels are optional; marker availability does not imply label visibility.
- At far zoom, show no routine labels and at most one or two exceptional labels.
- At normal mission-wide zoom, show only the highest-priority labels.
- Close zoom may increase label count within a fixed cap.
- Labels resize within bounded minimum and maximum sizes.
- Labels are laid out in screen space after scene projection.
- Labels must not overlap each other or reserved header, transport, timeline,
  and panel chrome.
- Greedy placement uses selected/current state, event priority, and event time.
- A selected label is retained when it fits; selection remains visible through
  the marker and popout when the label cannot fit.
- Long labels are shortened for scene display while full text remains in the
  popout.
- Default labels use subtle text, restrained contrast, and no large badge
  background.

Priority order:

1. selected and current events;
2. burns;
3. major geometry or phase events;
4. other mission events;
5. app-only/generated data markers.

## Details Interaction

Pointer hover and keyboard focus open a compact viewport-bounded popout with:

- event label;
- UTC timestamp;
- burn type and duration when applicable;
- hover or information text;
- generated-data provenance; and
- disabled or unavailable reason when shown from a non-scene event surface.

Pointer hover does not steal focus. Keyboard focus keeps details open until
focus leaves or Escape is pressed.

On touch, the user must be able to inspect details before or while committing a
seek. A two-step details-then-seek interaction is preferred; a single action is
acceptable only when details remain reliably accessible elsewhere.

## Selection

Click, Enter, Space, or the accepted touch activation on a reachable clickable
milestone seeks through the normal mission-time commit path:

1. set mission time to the event timestamp;
2. commit the normal timeline seek/update;
3. update timeline/current-event state; and
4. mark the milestone selected.

Selection must not directly mutate spacecraft position, media, or timeline
labels outside the mission-clock fan-out. A non-clickable milestone may expose
details but must not seek.

## 2D Requirements

- Render markers in the same transformed SVG coordinate space as the orbit.
- Pan and zoom keep markers attached to the path.
- Visible dots and hit areas scale independently where needed.
- Label density and size respond to zoom.
- Each interactive marker exposes button semantics, an accessible event/time
  name, disabled state, focus behavior, Enter/Space activation, and Escape.

## 3D Requirements

- Render lightweight markers at current-frame trajectory positions.
- Depth behavior keeps markers attached to geometry while selected and hovered
  markers remain discoverable.
- Marker and label sizing remain screen-legible across zoom levels.
- Projected label placement must agree with the rendered label position.
- Pointer, keyboard, and touch users receive equivalent detail and seek paths.
- Label layout must not add expensive DOM measurement to every animation frame.

## Compare And Multi-Craft Requirements

- Use `eventInfo.body` when present; otherwise use the primary craft.
- Primary mission events attach only to the primary mission craft.
- Compare events attach only when compare event data is explicitly available.
- Never project primary event times onto the compare craft without an explicit
  alignment model.
- A missing or hidden event body cannot leave a visible marker.

## Accessibility

- Interactive milestones require accessible label and timestamp information.
- Keyboard navigation must remain practical at the displayed density.
- Disabled milestones expose disabled state and cannot trap focus.
- Focused markers associate with their popout where the rendering technology
  permits it.
- Reduced-motion users receive static selected/current indicators.

## Acceptance Criteria

- Burn and non-burn events appear at the correct current-frame positions.
- Labels remain sparse, bounded, subtle, and collision-free across zoom levels.
- Hover/focus/touch details expose event time and descriptive metadata.
- Selecting a reachable milestone commits the same mission-time seek as the
  corresponding timeline event.
- Selected/current state remains visible and survives a rerender while the
  event remains reachable.
- Separate main-view and auxiliary-panel settings prevent cross-panel leakage.
- Compare and multi-craft markers attach only to their owning craft.
- Unavailable and pre-ephemeris events are not drawn at false positions.
