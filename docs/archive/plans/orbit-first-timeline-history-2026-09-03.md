# Orbit-First Timeline Plan

> Status: proposed direction, documented for tracking.
> Last updated: 2026-05-20.

## Context

The Artemis II mission view is an orbit visualization first. Mission media was
added to help users connect real photos, video, and audio to the underlying
mission geometry. The goal is not to turn this app into a photo archive or
recreate `artemistimeline.com` directly.

`artemistimeline.com` is still a strong reference for timeline rendering. Its
timeline works well because it makes dense chronological material legible with
activity bands, media dots, audio dots, a clear playhead, hover feedback, and
zoom/pan navigation. This project should borrow those timeline affordances, but
apply them to mission geometry first.

## Product Principle

The timeline should answer:

- Where is the spacecraft in the mission geometry?
- What geometric event or phase is happening now?
- Which real media captures correspond to this geometry?
- Can the user seek from a photo or event into the animation and understand why
  the view looks the way it does?

Media is supporting evidence. The orbit animation remains the center of gravity.

## Non-Goals

- Do not make the main Artemis II runtime a media-first gallery.
- Do not put hundreds of media items into the mission event carousel.
- Do not let media-first browsing replace the orbit animation as the primary
  experience.
- Do not hide or weaken the existing 2D/3D orbit controls.
- Do not make Artemis II-specific UI assumptions that block other missions from
  using the improved timeline later.

## Current State

Implemented pieces relevant to this plan:

- The bottom dock in `mission.html` contains the mission event carousel,
  native range slider, event-marker layer, media-marker layer, current-time
  label, and optional craft strip.
- `src/platform/js/app/timeline-dock-controller.js` owns the dock DOM behavior.
- `src/platform/css/mission-layout.css` owns dock styling.
- `src/platform/js/app/media-timeline-coordination.js` loads mission media,
  computes active/nearby media, and passes media markers to the timeline dock.
- `src/platform/js/app/media-browser-panel.js` owns the floating media panel.
- Artemis II media metadata is authored in
  `assets/artemis2/data/media-manifest.json5`.
- Artemis II mission events are authored in
  `assets/artemis2/data/config.json5`.

Known product gaps:

- The dock visually reads as a compact scrubber rather than a layered mission
  story.
- The bottom controls still read as several nearby strips instead of one
  coherent mission console.
- The timeline dock should be content-aware: compact when Events and Media are
  closed, taller only when extra lanes need space.
- Event markers are sparse and useful, but phase duration is not visible.
- Media markers are intended as a distinct layer, but they are not yet a strong
  visual affordance for geometry moments.
- Pre-ephemeris media and launch-day events are less discoverable because the
  primary slider range follows the sampled trajectory window.
- Hover feedback is mostly native browser title text instead of an app-level
  timeline readout.
- Dense moments such as TLI, lunar flyby, Earthset, Earthrise, eclipse, and
  entry need zoom/pan to be inspectable.

## Target Experience

The user can scrub the mission timeline and see a layered, orbit-first account
of the mission:

- a phase/activity band showing major mission geometry windows
- event ticks for operational milestones
- emphasized geometry moments for Earthset, Earthrise, closest approach,
  eclipse ingress/egress, maximum distance, entry interface, and splashdown
- secondary media pins aligned to the mission time
- a clear playhead and current mission-time readout
- hover/focus cards explaining the geometry at a point in time
- click-to-seek behavior that keeps the 3D animation authoritative

When the user clicks a reachable, foreground media pin, the app should seek the
mission clock to that media time, open or focus the media preview, and keep the
animation view oriented toward the relevant geometry when a preset is available.
Background-role media markers are timeline context only and do not seek or open
foreground Mission Media.

## Timeline Lanes

The dock should evolve from one slider plus marker overlays into a visual track
with multiple semantic lanes.

Recommended lanes:

- `phase`: broad mission phase or crew schedule bands
- `geometry`: named orbit/lighting/viewing geometry moments
- `events`: existing mission events and burns
- `media`: photos, video clips, and audio clips
- `data`: trajectory coverage, including generated or out-of-range regions
- `playhead`: current mission clock position

The native slider can remain as the accessible transport control, but the visual
track should become the primary explanatory surface.

### Track Controls

The compact timeline should not depend on an ambiguous chevron. It should have
plain, one-click track controls:

- `Events` toggles the event track and event carousel.
- `Media` toggles the media track.
- The simple timeline track remains visible regardless of those toggles.

Default state for the current increment:

- simple timeline track: visible
- events: off until the user enables it
- media: off until the user enables it

Later expanded states can add richer media rendering, including clusters or
thumbnails, but the control model should stay simple: users decide which tracks
they want to see.

### Compact Dock Layout

The timeline strip should get first claim on horizontal space:

- Render the timeline track full width so the mission range reaches the screen
  available dock bounds.
- Move the start/end range labels below the track, aligned left and right.
- Keep endpoint labels as two-line date/time stamps.
- Put the `Events`, `Media`, zoom, pan, and reset controls below the track in
  the same lower band.
- Keep the current-time readout in the lower band so the track itself remains
  visually clean.

### Bottom Console Implementation Spec

The current bottom chrome behavior is specified in
[`Timeline And Media Playback Spec`](../../specs/time/timeline-and-media-playback.md).
Use that spec as the guardrail: preserve mission-clock authority, media sync,
transport wiring, and Dockview bottom spacing while improving the visual
console.

Design references:

- `artemistimeline.com`: dense mission chronology, activity bands, hover
  feedback, and zoom/pan legibility.
- IMG.LY mobile video timeline article: adaptive height, time-to-space
  discipline, visible toolbar density, clear ruler scale, separated gestures,
  larger hit areas than visuals, and viewport-local snapping.

#### DOM Ownership

Do not move behavioral ownership during the first implementation pass.

- `#control-panel` remains outside `#header` and remains the transport owner.
- `#timeline-dock` remains the timeline/event/media owner.
- `control-panel-timeline-controller.js` remains responsible for:
  - binding the Events and Media buttons
  - syncing `--timeline-dock-height`
  - syncing `--control-panel-visual-height`
  - forcing transport visibility in Dockview desktop mode
- `timeline-dock-controller.js` remains responsible for:
  - range/current-time rendering
  - click-to-seek
  - playhead drag
  - scrub-lane pan
  - zoom/pan/reset controls
  - event/media marker rendering and selection

#### Visual Structure

The bottom console has two physical pieces today, but they should read as one
visual system:

1. `#control-panel`: transport row.
2. `#timeline-dock`: event row, timeline track, and status/action row.

Shared visual rules:

- Use one horizontal gutter variable for the event viewport and timeline track:
  `--timeline-track-gutter`.
- Use the same left/right visual bounds for:
  - `.timeline-dock__event-carousel`
  - `.timeline-dock__track-wrap`
- Keep `#control-panel` horizontally aligned to the dock using
  `--timeline-dock-offset`.
- Keep the vertical gap between `#control-panel` and `#timeline-dock` at no
  more than `4px` in desktop Dockview mode.
- Keep `#control-panel` above overlapping timeline/Dockview surfaces whenever
  those surfaces would otherwise cover transport hit targets. In Dockview mode,
  transport must remain above the Dockview host and timeline dock.
- No state may clip `#animation-control-panel`, `.timeline-dock__track-wrap`,
  `#timeline-playhead`, or the timeline readout row.
- Do not add a new wrapper or move transport controls until the existing
  behavior is covered by tests.

#### Layout States

State names are CSS/behavioral concepts, not necessarily class names.

| State | Trigger | Track height | Event row | Media lane | Required behavior |
| --- | --- | ---: | --- | --- | --- |
| `compact` | Events off, Media off | `52px` desktop; mobile shell keeps `.timeline-dock__track-wrap { height: 50px }` | hidden | hidden | Transport visible; click lane seeks; scrub lane pans; readouts visible. |
| `events-expanded` | Events on, Media off | `52px` desktop | visible | hidden | Event carousel visible; event markers visible; carousel viewport aligned to track. |
| `media-visible` | Media on, Events off | `76px` desktop | hidden | visible | Media rail and markers visible; Mission Media panel open/focused; taller lane restored. |
| `events-and-media` | Events on, Media on | `76px` desktop | visible | visible | Event row and media lane visible; event and media markers remain distinct. |
| `zoomed` | visual range narrower than full mission range | same as current media/event state | unchanged | unchanged | Overview visible; pan/reset controls active; mission clock unchanged. |

Implementation rules:

- `compact` is the default desktop state after bind.
- Mission Media panel state owns media-visible. The timeline Media button and
  Mission Media pill are synchronized launch surfaces for the same panel/lane
  state.
- The Events button owns the event-carousel state and must not open the Mission
  Media panel.
- State changes must call or schedule `syncTimelineDockHeight()`.
- Dockview host bottom spacing must follow the latest `--timeline-dock-height`.
- Mobile shell keeps its existing compact geometry:
  `.timeline-dock__track-wrap { height: 50px }`,
  `.timeline-dock__time-click-lane { top: 4px; height: 24px }`,
  and `.timeline-dock__scrub-lane { height: 16px }`.

#### Timeline Track Geometry

Desktop target values:

- `.timeline-dock__track-wrap`
  - `52px` when `.timeline-dock--media-track-visible` is absent
  - `76px` when `.timeline-dock--media-track-visible` is present
- `.timeline-dock__time-click-lane`
  - no-media: `top: 8px`, `height: 20px`
  - media-visible: existing `top: 26px`, `height: 16px`
- `#timeline-markers`
  - no-media: `top: 8px`
  - media-visible: existing `top: 23px`
- `.timeline-dock__scrub-lane`
  - remains bottom anchored
  - remains the pan surface, not the seek surface
- `.timeline-dock__playhead`
  - remains visually thin
  - keeps a larger hit area through its pseudo-element or pointer target

The current visual marker can stay small. Pointer targets should be larger than
the visual marker:

- event marker visual width: current small tick/pill
- event marker pointer width target: at least `18px`
- media marker pointer width target: at least `18px`
- playhead pointer width target: at least `18px`
- zoom/pan/reset controls: at least `20px` desktop visual size; larger mobile
  targets are handled by mobile rules.

#### Media Reachability

A media marker is `reachable` only when all of these are true:

- the marker has a finite mission timestamp inside the active mission timeline
  range
- the marker can be mapped to a valid animation time for the current mode
- the marker is not a background-role video marker
- media is enabled for the current mode; compare mode keeps media disabled
- the marker is not explicitly inactive or disabled by its media view model

Reachability is independent of the current zoom window. A reachable marker can
be outside the visible zoom window; it should not be clickable while outside
the DOM-visible viewport, but it remains logically reachable when the user pans
or resets the timeline to reveal it.

For implementation, valid animation time should be resolved through the same
timeline/media domain state that currently marks media markers inactive,
out-of-range, pre-ephemeris, or post-ephemeris. Do not duplicate that range
logic in CSS or event handlers.

Opening/focusing behavior:

- If Mission Media is closed and media is available, selecting a reachable media
  marker opens the Mission Media panel and selects the item.
- If Mission Media is already open, selecting a reachable media marker updates
  selection/focus without recreating the panel.
- If media is unavailable, compare-disabled, mobile-disabled, or the marker is
  not reachable, the marker does not seek mission time and does not open
  foreground Mission Media.
- Background-role media markers are contextual only: render them as inactive,
  do not select them, do not seek, and do not open foreground Mission Media.

#### Ruler And Labels

The ruler improvement is a separate implementation slice from the height and
alignment work.

Required behavior:

- Keep exact start and end labels at the left/right edges.
- Keep `#timeline-time-labels` as the interior label host.
- Interior labels are derived from the current visual window, not the full
  mission range when zoomed.
- Labels must never overlap. If there is not enough room, show fewer labels.
- Add subtle unlabeled subdivisions between major labels when there is enough
  pixel space.
- Use rounded-down elapsed/time labels for current playback position; do not
  round up before a boundary has elapsed.

Cadence rules:

- Choose a target major tick spacing between `120px` and `220px`.
- Choose the nearest friendly time step for the visible window:
  `1s`, `5s`, `10s`, `30s`, `1m`, `5m`, `15m`, `30m`, `1h`, `3h`, `6h`,
  `12h`, `1d`, `2d`, `7d`, `1mo`, `3mo`, `1y`.
- Month and year ticks are calendar ticks, not fixed millisecond durations.
  Align them to calendar month/year boundaries in the displayed time scale.
- Use 4 minor subdivisions when the major step is small enough to make them
  at least `18px` apart.
- Hide minor subdivisions when they would create visual noise.

#### Interaction Contract

These surfaces must remain distinct:

- `#timeline-time-click-lane`: click sets mission time.
- `#timeline-playhead`: drag sets mission time continuously.
- `#timeline-scrub-lane`: drag pans the visible timeline window.
- `.timeline-dock__event-carousel`: horizontal drag scrolls event pills;
  event button click seeks/selects the event.
- `#timeline-media-markers`: media marker click selects media and seeks when
  reachable.
- Zoom/pan/reset buttons change visual range only; they do not change mission
  clock time.

If snapping is added later:

- Snap only to visible event/media/phase points.
- Never snap to an offscreen point.
- Show a visible snap guide before committing the snapped position.

#### Implementation Slices

1. **Height and alignment slice.**
   - Files: `src/platform/css/mission-layout.css`,
     `src/platform/js/ui/control-panel-timeline-controller.js`,
     `test/control-panel-timeline-controller.test.js`.
   - Deliver:
     - shared `--timeline-track-gutter`
     - compact no-media track height
     - media-visible restored height
     - height variable resync tests

2. **Unified console visual slice.**
   - Files: `mission.html`, `src/platform/css/mission-layout.css`.
   - Deliver:
     - visual alignment of transport, timeline, toggles, readouts
     - no behavior ownership changes
     - no transport clipping in Dockview mode

3. **Ruler slice.**
   - Files: `src/platform/js/app/timeline-dock-controller.js`,
     `src/platform/js/core/domain/timeline-time-labels.js`,
     `test/timeline-dock-controller.test.js`.
   - Deliver:
     - friendly cadence
     - optional minor subdivisions
     - non-overlapping labels
     - zoom-window-aware labels

4. **Hit-target slice.**
   - Files: `src/platform/css/mission-layout.css`,
     `test/timeline-dock-controller.test.js`.
   - Deliver:
     - larger pointer targets for playhead/event/media markers
     - unchanged visual density
     - regression tests for click target behavior where possible

5. **Verification slice.**
   - Files: UI/screenshot tests under `test/`.
   - Deliver screenshots or geometry assertions for:
     - compact
     - events-expanded
     - media-visible
     - events-and-media
     - zoomed
     - Dockview transport clickability

Test matrix:

| Context | Required checks |
| --- | --- |
| Desktop compact | `#control-panel` visible/clickable; no-media track is compact; timeline click seeks. |
| Desktop Events | event carousel appears; event viewport bounds match track bounds; reduced-motion cue still respects preference. |
| Desktop Media | media lane appears; track restores taller height; Mission Media panel and timeline Media button stay synchronized. |
| Desktop Events + Media | both rows/layers visible; event and media marker hit targets do not steal playhead drag or scrub pan. |
| Desktop zoomed | zoom/pan/reset update visual window only; labels are valid; mission time is unchanged. |
| Dockview desktop | transport remains visible/clickable after Events, Media, and zoom state changes. |
| Mobile shell | desktop `52px`/`76px` values do not apply; Media is disabled/closed if lane is unavailable. |
| Compare mode | media remains disabled; Events, zoom, pan, and reset still work. |
| Background-role media | marker can render as inactive context; click does not seek, select, or open foreground media. |
| Empty data | no-event and no-media missions render without layout collapse or JS errors. |
| Invalid range | zero-length or invalid timeline ranges do not create overlapping labels or NaN marker positions. |
| Keyboard/ARIA | Events, Media, zoom, pan, and reset expose correct pressed/expanded/disabled state. |

#### Acceptance Criteria

- In compact desktop state, the timeline dock has no large empty band above the
  scrub lane.
- Opening Events shows event pills in a viewport that has the same left and
  right bounds as the timeline track.
- Opening Media restores the taller timeline track and shows the media lane.
- Closing Media returns the dock to compact height if Events is also closed.
- Mission Media panel opens/focuses from reachable media markers and stays
  synchronized with the timeline Media button and any other Mission Media
  launch surface.
- Background-role media markers remain inert and cannot open foreground Mission
  Media.
- Transport controls remain visible and clickable in Dockview mode.
- Click-to-seek, playhead drag, scrub-pan, event scroll, and media selection do
  not interfere with each other.
- Zoom/pan/reset alter the visual window without changing mission time.
- Interior ruler labels remain readable and non-overlapping at full range and
  zoomed ranges.

### Space-Saving Time Scale

The compact dock also needs a readable time scale. Endpoint labels are not
enough once events/media/phases are layered onto the track, but full timestamps
everywhere would create noise.

Rules:

- Show only enough interior time labels to fit the available track width.
- Choose the cadence from the mission span: years, months, weeks, days, hours,
  minutes, or seconds.
- Disclose timestamp detail progressively:
  - long spans can show `2026`, `Apr`, or `Apr 9`
  - medium spans can show `Apr 9 12:00` or just `12:00`
  - short spans can show `12:34`, then `12:34:56`
  - include the year when the visible range crosses years
- Keep the native start/end labels as the exact range anchors.
- Add subtle one-click timeline controls:
  - zoom out: show a wider mission window
  - reset: return to the full mission span
  - zoom in: show a narrower mission window around the current time
  - pan left/right: shift the visible window while zoomed
- Support direct manipulation on the track:
  - mouse wheel or trackpad scroll over the timeline zooms around the cursor
  - horizontal wheel or shift-wheel pans while zoomed
  - dragging the timeline strip pans the visible window
  - dragging the current-time thumb still seeks the mission clock

The visual timeline window is separate from the authoritative mission clock.
Zoom and pan change how labels, event markers, and media markers are laid out;
the animation time remains controlled by the mission playback state.

## Geometry-First Media Behavior

Media pins should be labeled and styled as annotations of the geometry, not as
the main content of the app.

Examples:

- Earthset photo:
  - headline: `Earthset geometry`
  - supporting media: selected photo/video title
  - action: seek mission time, open media preview, optionally apply a
    recommended Earth/Moon/craft view preset
- Earthrise photo:
  - headline: `Earthrise geometry`
  - supporting media: selected photo/video title
  - action: seek mission time and emphasize the line-of-sight context
- Eclipse:
  - headline: `Earth shadow crossing`
  - supporting media: any nearby crew image/audio
  - action: seek and highlight shadow/lighting state

The hover card should lead with mission geometry and use media as evidence.

## Data Model Additions

Prefer mission-authored JSON5 config over hard-coded Artemis II logic.

Candidate section in `assets/<mission>/data/config.json5`:

```json5
"timelineNarrative": {
  "time_scale": "UTC",
  "phases": [
    {
      "id": "outbound-coast",
      "label": "Outbound Coast",
      "startTime": "2026-04-02T03:35:12Z",
      "endTime": "2026-04-06T14:00:00Z",
      "kind": "coast"
    }
  ],
  "geometryMoments": [
    {
      "id": "earthset",
      "label": "Earthset",
      "startTime": "2026-04-06T15:00:00Z",
      "kind": "lineOfSight",
      "recommendedView": {
        "origin": "lunar",
        "follow": "craft",
        "focus": "frame-and-shoot"
      }
    }
  ],
  "dataRegions": [
    {
      "id": "post-horizons-generated",
      "label": "Generated final descent",
      "startTime": "2026-04-10T23:53:32Z",
      "endTime": "2026-04-11T00:08:21Z",
      "kind": "generated"
    }
  ]
}
```

Exact field names can change during implementation. The important split is:

- phases are duration bands
- geometry moments are point or short-window highlights
- data regions explain provenance and coverage
- media remains in `media-manifest.json5`

## Implementation Plan

Build this in thin increments. Each increment should leave the app better than
before, with a visible orbit-first outcome, instead of waiting for a large
timeline rewrite to land all at once.

### Delivery Order

| Order | Increment | User value | Scope |
| --- | --- | --- | --- |
| 0 | Marker plumbing and screenshots | Restores trust in the existing dock and gives us a baseline for later UI work. | Confirm media markers render, add focused tests, capture Artemis II dock screenshots. |
| 1 | Curated geometry moments | Makes Earthset/Earthrise/flyby/eclipse discoverable immediately. | Add a small authored/derived geometry-moment model and render those points distinctly from generic events. |
| 2 | Media as geometry annotations | Connects real photos to orbit geometry without making the UI media-first. | Make media pins secondary; clicking a reachable foreground pin seeks the mission time and opens/focuses media preview. |
| 3 | Phase and data bands | Shows the broad mission arc and data provenance at a glance. | Render phase bands plus HORIZONS/generated/out-of-range regions. |
| 4 | Timeline zoom and time scale | Makes dense moments inspectable without clutter. | Add adaptive time labels plus subtle zoom, pan, and reset controls. |
| 5 | Timeline hover/focus card | Explains what the user is seeing before they click. | Add an app-level card led by geometry, with nearby event/media as supporting context. |
| 6 | Timeline zoom polish | Makes dense mission moments inspectable with richer direct manipulation. | Add cursor-centered wheel zoom, drag pan polish, and preserve accessible seek semantics. |
| 7 | Geometry-aware view presets | Lets a media capture become a doorway into the right 3D explanation. | Attach conservative view suggestions to geometry moments/media selections. |
| 8 | Bottom console polish | Makes the transport/timeline area feel intentional and compact. | Apply the concrete bottom-console actions above while preserving current behavior. |

The highest-value first build is therefore:

1. fix marker visibility and tests
2. expose curated geometry moments
3. connect those moments to media and seek behavior

Phase/data bands and zoom/pan are valuable, but they should follow after the
Earthset/Earthrise/flyby loop is working end to end.

### Iteration 1: Visible Media Pins in the Desktop Orbit Timeline

Scope:

- Desktop first.
- Mobile should not regress, but it will not get dense always-visible media
  pins in this iteration.
- The existing mobile transport remains the mobile behavior until a later
  mobile-specific timeline design is added.

Why desktop first:

- Desktop has enough horizontal space to make dense media pins useful.
- Artemis II orbit-geometry workflows currently rely on desktop auxiliary
  panels.
- Mobile needs a different interaction model, likely a current-point detail
  sheet rather than hundreds of tiny pins.

Deliverables:

- Artemis II desktop dock shows media pins at reachable media times.
- Pins are visually distinct from mission event/burn markers.
- Clicking a reachable media pin seeks the orbit animation.
- Clicking a reachable foreground media pin opens or focuses the media preview.
- Focused tests cover marker propagation/rendering and the desktop/mobile
  visibility split.
- A before/after screenshot can be captured for the desktop dock.

### Phase 1: Make the Existing Dock More Informative

- Audit why Artemis II media markers are not visually present when the manifest
  has loaded.
- Ensure media marker updates reach `timeline-dock-controller.js`.
- Add a compact legend or differentiated marker styling for:
  - burns/events
  - geometry moments
  - photos/video
  - audio
  - generated data boundaries
- Improve marker density handling so closely spaced markers do not disappear
  into noise.
- Add tests for media marker rendering and timeline state propagation.

Acceptance criteria:

- Artemis II dock shows media pins at reachable media times.
- Selecting a reachable foreground media pin seeks the mission time and
  opens/focuses the media preview.
- Event and media pins remain visually distinct.

### Phase 2: Add Phase and Data Bands

- Add a derived or authored phase-band model.
- Render a duration band lane beneath or above the slider track.
- Show trajectory coverage and generated continuation regions distinctly.
- Add hover text for phase and data provenance.

Acceptance criteria:

- A user can see the broad mission arc without opening the event carousel.
- The post-HORIZONS generated splashdown continuation is visible as a distinct
  timeline region.
- Pre-ephemeris launch media/events are represented honestly instead of being
  silently flattened into the first sampled trajectory time.

### Phase 3: Add Geometry Moment Cards

- Add authored `geometryMoments` or derive them from mission events where
  possible.
- Build an app-level hover/focus card for timeline points.
- Prioritize geometry terms in the card:
  - phase
  - Earth/Moon/craft relationship
  - distance, lighting, or line-of-sight when available
  - nearby mission event
  - nearby media
- Keep the card keyboard accessible.

Acceptance criteria:

- Hover/focus over Earthset or Earthrise explains the geometry before the media
  title.
- Users can distinguish a media timestamp from the underlying mission event.

### Phase 4: Add Timeline Zoom and Pan

- Add visual-track zoom state independent of mission clock.
- Support explicit zoom in, zoom out, reset, and pan buttons.
- Support wheel or trackpad zoom around cursor on desktop.
- Support horizontal pan and drag pan when zoomed in.
- Preserve the native slider for accessible seek semantics.
- Ensure mobile touch behavior does not fight page or app gestures.

Acceptance criteria:

- Dense clusters around TLI, lunar flyby, Earthset/Earthrise, eclipse, and
  entry can be inspected without expanding the event carousel.
- Reset returns to the full mission range.
- Keyboard and screen reader timeline seeking still work.

### Phase 5: Geometry-Aware Media Presets

- Allow selected media items or geometry moments to suggest view presets.
- On media selection, optionally offer or apply a view that reveals the
  underlying geometry.
- Keep this conservative: do not unexpectedly destroy a user's carefully chosen
  view unless the interaction clearly asks for the preset.

Acceptance criteria:

- Selecting an Earthset/Earthrise media pin can bring the user to a useful
  orbit view for understanding that capture.
- The user can still inspect the same moment from other origins and dimensions.

## Design Notes

### Visual Priority

The largest visual weight should belong to:

1. mission clock/playhead
2. phase/data bands
3. geometry moments
4. operational events and burns
5. media pins

Media pins should be discoverable, not dominant.

### Mobile

Mobile should keep a compact, readable mission transport:

- fewer labels
- larger touch targets
- no hover-only affordances
- optional detail sheet for the current timeline point
- avoid dense always-visible media dots if they make the track unusable

### Compare Mode

Compare mode currently disables media, which remains appropriate. The orbit
timeline improvements should still help compare mode through phase/event/data
lanes that are not media-dependent.

### Data Provenance

The timeline should make data honesty visible:

- sampled HORIZONS trajectory
- generated final descent
- pre-sampled launch events
- post-mission media, if included

This is especially important for Artemis II because the current trajectory and
post-HORIZONS splashdown continuation already carry different provenance.

## Candidate Files

Likely implementation touch points:

- `mission.html`
- `src/platform/js/app/timeline-dock-controller.js`
- `src/platform/js/app/media-timeline-coordination.js`
- `src/platform/js/app/comparison-timeline.js`
- `src/platform/js/app/mission-playback-coordination.js`
- `src/platform/js/core/domain/media-timeline-state.js`
- `src/platform/js/core/domain/timeline-phases.js`
- `src/platform/css/mission-layout.css`
- `src/platform/css/mission-panels.css`
- `assets/artemis2/data/config.json5`
- `assets/artemis2/data/media-manifest.json5`
- timeline and media tests under `test/`

## Open Questions

- Should phase bands be fully authored, derived from events, or a hybrid?
- Should the visual timeline range use mission start/end while the seekable
  orbit range stays ephemeris-bounded?
- How should out-of-range media be represented when it cannot seek to a valid
  orbit sample?
- Should geometry-aware view presets auto-apply, or should selection reveal a
  small "show geometry" action?
- Can Earthset/Earthrise geometry be computed generally enough to support
  missions beyond Artemis II?

## Tracking Checklist

- [x] Document current bottom chrome behavior in the timeline/media playback spec.
- [x] Align the event-strip viewport with the timeline track gutters.
- [x] Reduce default no-media timeline dock height while preserving media-visible height.
- [ ] Consolidate transport, timeline, Events, Media, zoom, and readouts into one visual console.
- [ ] Add ruler subdivisions/ticks that respond to zoom level.
- [ ] Add larger invisible hit areas for dense event/media markers and playhead drag.
- [ ] Add screenshot coverage for compact, events-expanded, media-visible, and zoomed dock states.
- [x] Confirm media markers render in the Artemis II dock.
- [x] Add visual distinction between mission events and media pins.
- [ ] Add phase/data band model.
- [ ] Render phase/data bands in the dock.
- [x] Add adaptive interior time labels.
- [x] Add timeline zoom, pan, and reset controls.
- [x] Add desktop wheel zoom and drag pan on the timeline strip.
- [ ] Add geometry moment model.
- [ ] Add app-level timeline hover/focus card.
- [x] Add zoom/pan visual timeline state.
- [x] Add explicit zoom controls and reset.
- [ ] Add geometry-aware media selection behavior.
- [ ] Add unit tests for derived timeline state.
- [ ] Add UI tests or screenshot coverage for Artemis II timeline lanes.
