# Artemis II Media Timeline Plan

> Status: foundation and photo-browser MVP shipped. This document now records the implemented shape plus the remaining media roadmap.

## Purpose

Add Artemis II mission media context to the runtime without breaking the
existing architecture direction:

- keep the mission playback clock, event model, and panel system as the
  primary runtime spine
- add photo support first without hard-coding a one-off gallery app into
  `mission.html`
- leave a clean path for later audio clips and one or more time-synced video
  stream panels
- preserve the functional core / imperative shell split described in
  `docs/designs/runtime/target-architecture.md`

This plan intentionally does **not** mirror `artemistimeline.com` literally.
That site is an excellent reference for product shape, but this repo already
has a richer mission-runtime architecture, so the right move is to add a media
layer that plugs into our existing time, event, and panel seams.
The controlling product direction for future timeline polish is captured in
[Orbit-First Timeline Plan](../../plans/breakdown/orbit-first-timeline.md).

## Implementation Snapshot

Shipped pieces:

- Artemis II declares `workflow:media-browser` in mission config, defaulting to `closed`.
- The workflow is config-gated and stays dormant unless enabled. Compare mode disables it even when the config enables it.
- Authored metadata lives in `assets/artemis2/data/media-manifest.json5` and compiles to `assets/artemis2/data/media-manifest.json`.
- The runtime loads and normalizes the manifest through `src/platform/js/data/mission-media.js` and `src/platform/js/core/domain/media-manifest.js`.
- Media filters, active/nearby selection, shot view models, stream sync planning, and timeline marker derivation live under `src/platform/js/core/domain/media-*.js`.
- Mutable media intent lives in `src/platform/js/core/state/runtime-media-state.js`.
- `src/platform/js/app/media-timeline-coordination.js` coordinates manifest loading, timeline markers, panel rendering, filter changes, and item-selection seeks.
- `src/platform/js/app/media-browser-panel.js` owns the panel DOM, lifecycle, persisted layout, resizing, filters, nearby strip, compact summary, and details drilldown.
- `src/platform/js/app/timeline-dock-controller.js` renders a distinct media-marker layer and emits `mission-media-marker-select` when a marker is selected.

Current product behavior:

- The panel shows a large current/nearest media preview with minimal visible metadata by default.
- Filters cover all media, crew captures, exterior media, cameras, videos, and audio availability.
- Details are tucked into a drilldown instead of taking permanent horizontal space.
- Nearby media stays vertically compact.
- Selecting a reachable media item seeks the mission timeline; out-of-range media can still be selected in panel state.
- Images support pan/zoom/reset in the panel.
- Selecting a playable video or audio clip starts that media, switches mission animation to realtime, and keeps the mission clock aligned from media timeupdates. Media pause/end pauses animation. Playing animation alone does not auto-start media; paused playable media exposes start/alignment controls.

Timeline and media interaction requirements (implemented):

- The timeline now uses two nearby lanes in one shared time axis:
  - a main mission timeline lane
  - a distinct media-marker lane just above it
- The current time indicator is a single shared playhead (small vertical line) spanning both lanes.
- Primary time-seek interaction is dragging the shared playhead/timeline surface.
- Clicking empty main timeline space moves the playhead to that time.
- Clicking a media marker/segment in the media lane selects that media item.
- During user timeline seek/scrub:
  - if currently active media no longer covers the new mission time, media playback is stopped
  - if animation was playing when the seek started and seek ended out of the prior media range, the runtime auto-starts another playable media item only when one is valid at the new mission time

Still deferred:

- A full ArtemisLive-style horizontal media scroller inside the panel.
- Fix Mission Media timeline dot selection reliability. Clicking some media
  dots can still fail to jump/select the expected media image consistently,
  especially around initial load and marker/thumbnail readiness. Hover
  thumbnails and independent dot click handling have been improved, but the
  remaining dot-to-media selection path needs a deeper event/data-flow pass.
- Separate synchronized stream panels driven by `mediaStreams[]`.
- Per-item license/source URL enrichment beyond the currently mirrored upstream metadata.

Asset/provenance details live in
[Artemis II Media Assets](../../operations/media/artemis2-media-assets.md).

## Product Goal

For Artemis II in normal mission mode, the shipped MVP now covers the first
four goals below plus discrete clip playback. The separate stream goal remains
future work.

1. The runtime can load an authored mission-media manifest.
2. The timeline can show dense media markers without turning media into
   hundreds of event carousel chips.
3. A dedicated media workflow panel can show the current or nearby photo at the
   current mission time, plus filters and metadata.
4. Selecting a media item can seek the mission clock when the target time is
   inside the animation range; playback behavior is specified in
   [Timeline and Media Playback Spec](../../specs/time/timeline-and-media-playback.md).
5. Later, one or more built-in video stream panels can play synchronized
   streams in separate panels, all driven by the same mission clock.

## Guiding Tenets

### 1. Mission time remains the source of truth

The existing mission playback clock stays authoritative.

- Photos, audio clips, and video streams are all resolved against mission time.
- Video panels are synchronized to mission time; they do not become independent
  clocks by default.
- If a video panel is allowed to scrub later, it should emit a seek intent back
  to the mission clock instead of silently drifting on its own.

### 2. Mission events and mission media stay separate

The current `eventInfos` model is sparse, semantic, and mission-operational.
Media is dense, filterable, and often many-to-one at the same timestamp.

Therefore:

- keep `eventInfos` for mission events
- add a distinct media manifest and media derivation path
- render media markers as their own timeline layer or lane
- do not overload the burn/event carousel with photo/video items

### 3. Discrete media and continuous streams are different models

Photos and short clips behave like timestamped assets. Continuous or long-form
video behaves like synchronized transport media.

Therefore the plan uses two related but distinct data families:

- `mediaItems`: discrete images, short videos, audio clips, bounded media
- `mediaStreams`: continuous or long-window synchronized video feeds

This separation avoids forcing stream playback semantics into a photo model.

### 4. Functional core computes; shell plays

The core should decide:

- what media is visible
- what media is active at a given mission time
- how markers cluster or filter
- whether a stream should be playing, paused, or seek-corrected

The shell should own:

- DOM panel rendering
- image loading and prefetch
- `HTMLVideoElement` / HLS / player adapter control
- `play()`, `pause()`, `currentTime`, captions, buffering UI

## Recommended Data Model

### Mission-authored source files

Use the authored source file in the app repo:

`assets/artemis2/data/media-manifest.json5`

Compile it to:

`assets/artemis2/data/media-manifest.json`

This matches the existing config workflow and keeps authored metadata in the
app repo. The current Artemis II implementation references remote R2 media
directly rather than staging the photo/video payload from `moon-mission-data`.
Large self-hosted runtime assets should still remain staged from
`moon-mission-data` if we choose to mirror or transform them later.

Recommended staged asset buckets in the data repo:

- mission photos / thumbnails
- short local video clips if we host them ourselves
- poster images
- caption files / transcripts
- optional audio clips

### Manifest shape

Recommended top-level sections:

- `mediaItems[]`
- `mediaStreams[]`
- `filters`
- `ui`
- `provenance`

### `mediaItems[]`

Use for photos, short video clips, and audio clips.

Recommended fields:

- `id`
- `kind`: `image` | `videoClip` | `audioClip`
- `startTime`
- `endTime` optional for bounded clips
- `title`
- `description`
- `source`
- `asset`
- `posterAsset` optional
- `thumbnailAsset` optional
- `photographer`
- `camera`
- `cameraId`
- `location`
- `tags`
- `crewCaptured`
- `external`
- `availabilityStartPolicy`
- `enabled`

### `mediaStreams[]`

Use for long-form synchronized feeds intended for separate panels.

Recommended fields:

- `id`
- `title`
- `streamKind`: `video`
- `sourceType`: `mp4` | `hls` | `youtube` | `iframe`
- `sourceUrl`
- `posterAsset`
- `captions[]`
- `startTime`
- `endTime`
- `syncMode`: `missionClock`
- `timeOffsetSeconds`
- `defaultPanelState`
- `enabled`

## Architectural Placement

### Functional core

Pure modules for normalization and time-based derivation now include:

- `src/platform/js/core/domain/media-manifest.js`
- `src/platform/js/core/domain/media-filter-state.js`
- `src/platform/js/core/domain/media-timeline-state.js`
- `src/platform/js/core/domain/media-selection-state.js`
- `src/platform/js/core/domain/media-stream-sync.js`

Core responsibilities:

- validate and normalize media manifest records
- compute derived availability flags, including pre-ephemeris items
- filter media by type/source/camera/tag
- derive visible timeline markers and cluster summaries
- resolve active, nearest, previous, and next media items for a mission time
- build panel view-model data
- produce per-stream sync plans:
  - target playback time
  - whether to play or pause
  - whether drift requires soft correction or hard seek

### State ports

The narrow runtime media state port is:

- `src/platform/js/core/state/runtime-media-state.js`

State should include only mutable runtime intent and selection, such as:

- loaded manifest reference
- active filters
- selected media item id
- selected stream ids
- panel-local presentation state
- user mute / autoplay preferences if needed

This state port should not mutate the DOM or media elements directly.

### Application services

Implemented coordination layer:

- `src/platform/js/app/media-timeline-coordination.js`

Deferred stream-oriented service candidates:

- `src/platform/js/app/media-panel-coordination.js`
- `src/platform/js/app/media-stream-panel-coordination.js`

Service responsibilities:

- load media manifest alongside mission config
- translate mission-time changes into media-state updates
- coordinate timeline marker updates with the existing timeline dock
- route panel intents into state changes and seek intents
- translate core stream-sync plans into shell effect commands

### Shell and effects

Current browser work lives in:

- `src/platform/js/app/media-browser-panel.js`

Future stream/playback work may add effect-heavy modules such as:

- `src/platform/js/shell/ui/media-panel-effects.js`
- `src/platform/js/shell/media/media-element-effects.js`
- `src/platform/js/shell/media/media-prefetch-effects.js`

Shell responsibilities:

- render media panel DOM
- manage `<img>`, `<audio>`, and `<video>` elements
- integrate HLS or provider-specific players if needed
- handle buffering, failed loads, and poster fallback
- prefetch nearby thumbnails or posters

## Panel Strategy

### Phase-1 panel

Introduce one Artemis II workflow panel:

- `workflow:media-browser`

This panel is built on the shared panel shell and shows:

- current or nearest media item
- metadata
- filter controls
- compact nearby-item list
- details drilldown for metadata that should not occupy the default layout
- provenance and seed notes from the manifest where available

### Later stream panels

For synchronized video streams, do **not** wait on future user-created panel
support. Instead, use mission-declared built-in workflow panels such as:

- `workflow:stream-main`
- `workflow:stream-cabin`
- `workflow:stream-external`

These stay compatible with Panel System V1 because they are built-in panel
instances, not arbitrary user-generated duplicates.

If future panel work adds `Create View` or user-created workflow panels, the
stream-panel layer can expand then without changing the core media model.

## Timeline Strategy

Keep the current mission event UI semantics intact:

- event carousel remains for sparse mission events
- timeline markers remain the primary semantic event anchors

Media is now rendered as a separate dense layer:

- a marker rail tied to the same mission time
- filter-aware marker derivation based on visible media items
- selection logic routed through media services, not event services

This keeps mission operations readable while still supporting media-heavy
moments like lunar flyby photography bursts.

## Pre-Ephemeris and Post-Ephemeris Policy

Artemis II media includes important moments before public Orion ephemeris
coverage begins and after it ends.

Recommended rule:

- media may exist outside the animation sample span
- selecting such media still shows the media asset and metadata
- the runtime surfaces a clear "trajectory unavailable at this media time"
  note instead of pretending the scene is sampled there
- timeline and panel view models should expose this explicitly as derived state

This is similar in spirit to current pre-ephemeris event handling, but media
selection should remain useful even when the scene cannot seek to the exact
instant.

## Compare-Mode Scope

Media is currently **out of scope** for compare mode.

Rationale:

- compare mode uses a fictional aligned clock
- mission media is tied to a real mission clock and real source chronology
- forcing media into compare mode would create confusing semantics early

Current rule:

- media timeline and stream panels are enabled only in standard single-mission
  Artemis II runtime modes
- compare mode hides or disables media surfaces cleanly

## Staged Implementation Plan

### Phase 1: Foundation - shipped

Goal: land data and derivation seams without large UI risk.

1. Add `media-manifest.json5` + compiled `media-manifest.json`.
2. Add manifest normalization and validation in the core.
3. Add a mission-media loader and runtime media state port.
4. Add unit tests for normalization, filtering, availability, and active-item
   resolution.

Exit condition met:

- Artemis II can load a normalized media manifest in runtime code.

### Phase 2: Photo Timeline MVP - shipped

Goal: ship the first useful user-facing feature with photos only.

1. Add a `workflow:media-browser` panel.
2. Add a timeline media-marker layer separate from `eventInfos`.
3. Show current/nearest photo and metadata at mission time.
4. Support photo filters such as:
   - all
   - crew
   - external
   - camera
5. Allow photo selection to seek mission time when in range.

Exit condition met:

- Artemis II can be scrubbed through a synchronized photo experience inside the
  existing mission runtime.

### Phase 3: Richer Discrete Media - shipped for discrete clips

Goal: widen the manifest and panel model without changing the core shape.

1. Add short `videoClip` and `audioClip` support to the normalized manifest model. (Shipped.)
2. Extend filter and marker derivation for kind-specific rendering. (Shipped for discrete images, videos, and audio markers.)
3. Add poster/thumbnail handling, image pan/zoom/reset, and inline clip playback inside the media browser panel. (Shipped for discrete clips.)
4. Keep playback coordination mission-clock-aware, even for short clips. (Shipped: selected clips drive realtime animation and pause the clock when media pauses/ends.)

Exit condition:

- the media browser can represent mixed discrete media types while still using
  one normalized item model.

### Phase 4: Time-Synced Video Stream Panels - future

Goal: add one or more separate synchronized video panels.

1. Add `mediaStreams[]` manifest support.
2. Add core stream-sync planning logic with drift thresholds.
3. Add one built-in workflow panel per declared stream.
4. Drive playback from mission time:
   - play when the mission is playing and the stream is in-range
   - pause when the mission is paused
   - hard-seek on large drift
   - optionally use soft correction for small drift
5. Add provider adapters as shell-only code.

Exit condition:

- two or more Artemis II video streams can run in separate panels and remain
  synchronized to the mission timeline.

## File/Module Map

Implemented additions:

- `assets/artemis2/data/media-manifest.json5`
- `assets/artemis2/data/media-manifest.json`
- `src/platform/js/core/domain/media-manifest.js`
- `src/platform/js/core/domain/media-filter-state.js`
- `src/platform/js/core/domain/media-timeline-state.js`
- `src/platform/js/core/domain/media-selection-state.js`
- `src/platform/js/core/domain/media-stream-sync.js`
- `src/platform/js/core/state/runtime-media-state.js`
- `src/platform/js/data/mission-media.js`
- `src/platform/js/app/media-timeline-coordination.js`
- `src/platform/js/app/media-browser-panel.js`

Deferred stream/playback candidates:

- `src/platform/js/app/media-stream-panel.js`
- `src/platform/js/shell/media/media-element-effects.js`
- `src/platform/js/shell/media/media-prefetch-effects.js`

## Verification Plan

- unit tests for core media normalization and filtering (shipped)
- unit tests for stream sync planning and drift correction decisions (foundation shipped)
- browser smoke checks on `mission.html?mission=artemis2`
- panel-state regression checks for open/minimized/closed behavior
- targeted UI tests for:
  - media marker rendering (shipped at unit/component level)
  - photo selection (shipped at unit/component level)
  - video/audio pause/play/seek synchronization (shipped at unit level)
  - pre-ephemeris media behavior

## First Slice Status

The recommended first implementation slice has landed and has been extended to
cover mixed discrete media:

1. land the media manifest format
2. ship the pure media core
3. add a single `workflow:media-browser` media panel
4. add a separate media marker rail to the existing timeline
5. add discrete image pan/zoom and video/audio playback synchronized to mission time

That gives us a real Artemis II feature while preserving a clean path to later
synchronized multi-panel video streams.
