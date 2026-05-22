# Orbit Milestones Spec

Last updated: 2026-05-22

Status: proposed for implementation tracking.

This spec defines how mission events appear as selectable milestones on the
rendered orbit path. It is the reference for future changes in:

- `src/platform/js/app/config-events.js`
- `src/platform/js/app/orbit-vector-processing-actions.js`
- `src/platform/js/app/orbit-vectors-actions.js`
- `src/platform/js/app/spacecraft-curve-actions.js`
- `src/platform/js/app/timeline-dock-controller.js`
- new orbit milestone scene/UI modules

## Goals

- Put mission events directly on the currently visible trajectory so users can
  connect timeline moments to mission geometry.
- Treat the mission clock as the only authority for event selection and
  time-jump behavior.
- Use existing mission event metadata: `label`, `hoverText`, `infoText`,
  `burnFlag`, `burnDirection`, `burnTypeLabel`, `durationSeconds`,
  `clickable`, `preEphemeris`, and `generated`.
- Resolve marker positions in the same frame currently used by the scene:
  `geo`, `lunar`, `helio`, `relative`, compare overlays, and multi-craft
  views.
- Keep default annotation density readable. Burn and major geometry events
  should be visible before lower-priority routine events.
- Make hover and focus details available without requiring the Settings panel.
- Make selection equivalent to selecting the same event from the event
  timeline or carousel.

## Non-Goals

- Do not create a second independent event system.
- Do not duplicate ephemeris transform math only for milestones.
- Do not make marker placement depend on label text or path SVG parsing.
- Do not show pre-ephemeris events as if they have known plotted positions.
- Do not make marker hover panels a replacement for the timeline dock,
  Mission Media, or mission brief content.
- Do not ship all event labels expanded by default on dense missions.

## Terms

- **Milestone**: a mission event rendered at the spacecraft/body position for
  that event time.
- **Anchor position**: the resolved XYZ point in the active rendered frame.
- **Reachable event**: an event with a finite timestamp and available
  ephemeris/derived position in the current scene.
- **Unavailable event**: an event that is valid mission metadata but cannot be
  placed on the currently rendered path, usually because it is before the
  ephemeris window or outside the active frame's data range.
- **Selected milestone**: the event marker corresponding to the last explicit
  event selection or the currently highlighted timeline event.

## Data Contract

Milestones consume `eventInfos` produced by `computeEventsUpdate`. No new
mission config block is required for the first implementation.

Required event fields:

- `key`: stable event identifier.
- `startTime`: UTC `Date`.
- `label`: short visible title.
- `body`: optional craft/body identifier. Defaults to the primary craft when
  omitted.
- `clickable`: false when the event must not seek the mission clock.
- `preEphemeris`: true when the event predates available plotted data.
- `burnFlag`: true for burn styling.

Optional event fields:

- `hoverText` or `infoText`: detail text for hover/focus popouts.
- `burnDirection`: `prograde`, `retrograde`, or `attitude`.
- `burnTypeLabel`: human-readable burn category.
- `durationSeconds`: burn/event duration.
- `generated`, `generatedLabel`, `generatedNote`: provenance for generated
  extension segments.

## Position Resolution

Milestone placement must be based on event time and current rendered frame, not
on a separate visual approximation.

The implementation should expose a shared helper with this conceptual API:

```js
resolveMilestonePosition({
    eventInfo,
    scene,
    config,
    globalConfig,
    bodyId,
})
```

The helper returns:

- `ok: true`
- `position`: a `THREE.Vector3` in 3D scenes, or an `{ x, y }` point in 2D
  SVG scenes
- `timeMs`
- `bodyId`
- `source`: `sampled`, `evaluated`, or `generated-extension`

Or:

- `ok: false`
- `reason`: `pre-ephemeris`, `out-of-range`, `missing-body`,
  `missing-data`, or `unsupported-frame`

### Preferred Resolution Path

Use the same provider and transform path that creates the rendered spacecraft
positions. It is acceptable to interpolate existing sampled scene data when it
is the authoritative rendered representation:

- 3D scenes may interpolate `scene.curvesById[bodyId]` using
  `scene.curveTimesById[bodyId]`.
- 2D scenes may interpolate `scene.orbitSvgPointsByBodyId[bodyId]` using
  `scene.orbitTimesByBodyId[bodyId]`.

This is not because milestones conceptually need orbit curves. The curve
samples are a cache of already-transformed positions in the active displayed
frame. Reusing them prevents marker drift from the visible path.

If a direct `positionAtTimeInCurrentFrame` helper is later extracted, both orbit
curve construction and milestone placement should use that helper.

### Interpolation Rules

- Locate the two adjacent sample times surrounding `eventInfo.startTime`.
- Linearly interpolate the position between those samples.
- If the event time exactly matches a sample, use the sample position.
- If the event is outside the sampled range, return `out-of-range`.
- If the event is within a generated extension segment, return
  `generated-extension` and expose provenance in the popout.
- Do not clamp out-of-range events to path endpoints.

## Visual Semantics

Milestones are scene annotations, not generic UI controls.

Default marker categories:

| Category | Source condition | Visual treatment |
| --- | --- | --- |
| Burn | `burnFlag === true` | warm marker, stronger outline, optional burn-direction glyph |
| Event | `burnFlag !== true` | cool neutral marker, smaller/default emphasis |
| Selected | selected event | brighter ring and persistent short label |
| Current | active/current event from timeline highlight | pulse or ring; respect reduced motion |
| Generated | `generated === true` or generated position source | generated-segment color/provenance cue |
| Unavailable | no anchor position | not rendered on path; represented only in timeline/list surfaces |

Color must not be the only cue. Burn milestones should also differ by shape,
outline, icon, or label treatment.

Short labels:

- Marker dots may be numerous; labels may not. Labels are optional scene
  annotations and must earn visibility through priority, zoom, and available
  screen space.
- Default visible labels are limited by zoom. At far zoom, show no routine
  labels and at most one or two exceptional labels. At normal mission-wide
  zoom, show only the top few high-priority labels. At close zoom, labels may
  increase, but still remain capped.
- Always show the selected marker label when it can fit without covering core
  UI chrome. If it cannot fit, keep the marker selected and expose details via
  popout instead of forcing overlap.
- Labels must be laid out in screen space after the active scene transform is
  known. Do not decide overlap using raw orbit coordinates.
- Labels must not overlap each other. Use greedy placement by event priority
  and then time, reserve a small padding gap around accepted labels, and hide
  later labels whose screen-space boxes collide.
- Labels must not overlap transport controls, header controls, timeline dock,
  or panel chrome. Treat these as reserved screen-space bands/rectangles.
- Labels must dynamically resize within a bounded range. They should shrink
  when zoomed out and grow modestly when zoomed in, but never become badge-like
  or dominate the orbit.
- Label text must be subtle: low-contrast fill, light stroke/shadow only for
  legibility, no large filled badge backgrounds in the default state.
- Long labels must be shortened before layout. Prefer existing short labels;
  otherwise clamp to a small character budget and rely on the hover/focus
  popout for the full text.
- Burn/event color may tint a label, but label color must remain secondary to
  the marker dot. The popout is the detailed/readable surface.

## Interaction

### Hover And Focus

Pointer hover and keyboard focus show a popout anchored near the marker.

Popout content:

- event `label`
- UTC timestamp
- burn type and duration when `burnFlag` is true
- `hoverText` or `infoText`
- generated-data note when applicable
- unavailable/disabled reason when rendered in a non-scene list surface

The popout should be compact and must remain within the viewport. It should not
steal focus on pointer hover. Keyboard focus should keep the popout open until
focus leaves the marker or Escape is pressed.

### Selection

Click, Enter, or Space on a reachable clickable milestone must seek the mission
clock to `eventInfo.startTime` through the same path used by existing event
buttons:

1. set animation time to the event timestamp
2. call the normal mission time commit/update path
3. update timeline event highlight state
4. mark the milestone as selected

Selection must not directly mutate spacecraft position, timeline labels, media
state, or active-event UI outside the mission-clock fan-out.

When `eventInfo.clickable === false`, the marker may show hover details but
must not seek time. It should expose disabled semantics.

### Touch

On touch devices:

- first tap selects/opens the compact popout when the marker is reachable
- second tap on the same marker commits the seek
- tapping elsewhere dismisses the popout

If that proves too slow in testing, a single tap may both select and seek, but
the timeline/event row must still provide a reliable details surface.

## Density And Filtering

Default density must favor mission comprehension over completeness.

Initial priority order:

1. currently selected/current event
2. burns
3. major geometry or phase events, as inferred from labels and event metadata
4. other mission events
5. app-only data markers

The first implementation may use a simple maximum visible marker count per
viewport. Later implementations may add user controls or per-event importance
metadata.

Minimum behavior:

- Do not show more labels than can be read.
- Do not drop the selected marker.
- Do not drop the current active event marker.
- Keep all hidden events available through the existing timeline/event list.

## 2D Behavior

2D SVG milestones should be rendered in the same SVG coordinate system as the
orbit path.

Required behavior:

- Markers follow pan/zoom because they live inside the same transformed SVG
  layer as the path.
- Marker hit areas are larger than the visible marker.
- Labels scale or hide according to zoom so text remains readable.
- Existing event marker and timeline click behavior remains unchanged.

## 3D Behavior

3D milestones should be rendered as lightweight scene overlays attached to the
active scene container.

Required behavior:

- Markers depth-test enough to feel attached to geometry, but selected/hovered
  markers must remain discoverable.
- Marker size should remain screen-legible across zoom levels.
- Raycasting or equivalent hit testing owns pointer hover/click.
- Labels/popouts should be DOM overlays or CSS2D-style labels rather than
  bitmap text in the render loop.
- Marker update work must not run expensive DOM layout inside the animation
  frame loop.

## Compare And Multi-Craft Behavior

Milestones use `eventInfo.body` when present, otherwise the scene primary craft.

Compare mode rules:

- Primary mission events attach to the primary craft.
- Compare mission events attach only if compare event data is explicitly
  available in the active compare config.
- Do not project primary mission event times onto the compare craft unless a
  compare alignment layer explicitly defines that mapping.

Multi-craft rules:

- A marker belongs to the event body/craft.
- If that craft is hidden, its milestones are hidden.
- If the event body is missing in the scene, return `missing-body`.

## Accessibility

- Interactive milestones must be keyboard reachable when marker density is low
  enough to make that practical.
- Each reachable milestone needs an accessible name containing event label and
  timestamp.
- Disabled markers expose disabled state and do not trap focus.
- Popouts are associated with focused markers via ARIA where possible.
- Escape dismisses an open popout.
- Reduced-motion users get static selected/current rings instead of pulses.

## Implementation Plan

Track implementation against this checklist.

- [x] Add pure position-resolution helpers and tests for interpolation,
  exact-sample matches, out-of-range events, pre-ephemeris events, and missing
  bodies.
- [x] Add milestone view-model helpers that map `eventInfos` to marker
  categories, labels, disabled state, and popout text.
- [x] Add 2D SVG milestone rendering and event selection wiring.
- [x] Add 3D milestone rendering and hit testing.
- [x] Add shared popout styling and keyboard focus behavior.
- [x] Connect selection to the existing mission-clock event seek path.
- [x] Add density/label collision rules for default views.
- [ ] Verify `geo`, `lunar`, `relative`, compare, and at least one
  multi-craft mission.
- [ ] Add Playwright coverage for visible markers, hover/focus details, and
  click-to-seek.
- [ ] Update screenshots/baselines only after intentional visual review.

## Test Plan

Unit tests:

- position interpolation returns expected midpoint coordinates.
- exact sample times return exact sample coordinates.
- out-of-range and pre-ephemeris events are not clamped.
- burn events resolve burn visual category and detail text.
- non-burn events resolve event visual category.
- disabled events do not produce seek actions.

Integration tests:

- selecting a milestone calls the same mission-clock update path as selecting
  its event button.
- timeline highlight and selected milestone remain synchronized after a seek.
- hidden craft milestones are hidden in multi-craft scenes.
- relative mode markers appear on the displayed relative trajectory.

UI tests:

- `/artemis2/` shows burn and non-burn milestones on the trajectory.
- hover/focus opens a compact popout with label, UTC time, and detail text.
- clicking a reachable milestone moves the animation time to the event time.
- pre-ephemeris events remain available in the timeline but are not drawn on
  the path.
- mobile/touch has a usable details-and-seek path.

## Open Questions

- Should marker visibility be controlled by a new `Milestones` pill, or should
  milestones follow the existing event-track visibility?
- Should mission configs gain an optional `importance` or `milestoneLevel`
  field, or is inferred priority sufficient for the first pass?
- Should selected marker state survive origin/dimension changes if the same
  event remains reachable?
- Should dense missions default to burns-only markers at wide zoom, with all
  events appearing as the user zooms in?
