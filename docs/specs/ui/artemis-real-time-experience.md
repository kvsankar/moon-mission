# Artemis In Real Time UX Principles

Last updated: 2026-05-18

Experience-model rationale:
[Runtime Experience Model](../../designs/runtime-experience-model.md)

Implementation gaps:
[Artemis Real-Time Experience Plan](../../plans/breakdown/artemis-real-time-experience.md)

This document defines the product direction for an Artemis-focused real-time mission experience inside this app. It is inspired by the clarity and depth of Apollo in Real Time, but it is not a plan to replicate that site.

This document is Artemis-specific. The broader runtime requirements are captured in [Runtime UX](runtime-ux.md), and the component-level implementation rules are captured in [Runtime Style And Interaction](runtime-style-and-interaction.md).

Apollo in Real Time is primarily an archival replay room: synchronized historical media, transcript, and audio arranged around the mission clock. This app began somewhere else. It is an orbit animation and geometry exploration tool. Its strongest differentiator is that media, transcript, images, captions, and camera views can be tied back to spatial truth: where the craft was, what Earth/Moon/Sun geometry existed, what the camera could plausibly see, and how a public image or broadcast moment fits into the mission trajectory.

The goal is not "ApolloInRealTime, but Artemis." The goal is an orbit-native mission explorer with a real-time narrative layer.

## Product Identity

This app should be:

- **Orbit-first**: the mission path, bodies, camera geometry, and time model remain the spine.
- **Evidence-rich**: photos, broadcast clips, captions, transcript, and metadata are synchronized evidence, not decoration.
- **Explorable**: users can move between guided story and expert inspection without losing context.
- **Geometric**: Frame & Shoot, surface points, glints, Moon features, and camera-relative views are core differentiators.
- **Shareable**: meaningful moments should be linkable with time, camera, selected media, and view state.

The app should not become:

- A linear documentary player with an orbit animation in the background.
- A replica of Apollo in Real Time's interface hierarchy.
- A control panel that exposes every technical feature at equal priority.
- A media gallery detached from mission time and geometry.

## Core Principle

Mission time is the spine, and geometry is the native language.

Every major artifact should answer:

- When did this happen?
- Where was the craft?
- What was visible from the craft, Earth, Moon, or selected camera?
- What media, transcript, event, caption, or photo belongs to this moment?
- Can this exact moment be shared or revisited?

## Primary Experience Modes

The product should support two complementary modes.

### Experience

Experience mode is for users who want to follow Artemis as a mission story.

It should emphasize:

- a clear mission clock and phase,
- a small set of guided entry points,
- active media/caption/transcript moments,
- key event markers,
- the current craft/Earth/Moon geometry,
- simple playback and sharing.

Experience mode should not require the user to understand all orbit controls before the mission feels alive.

### Explore

Explore mode is for users who want to inspect the mission.

It should emphasize:

- orbit views and camera presets,
- Frame & Shoot,
- media timeline and photo album,
- transcript search,
- surface points and glints,
- Moon/lunar feature overlays,
- panel workflows for deeper analysis.

Explore mode keeps the app's existing strength: there are many legitimate ways to look at the orbit.

## Entry Points

The front door should be emotionally and functionally clear.

Recommended entry points:

- **Start at launch**: begin the mission from the authored start.
- **Jump to flyby**: go directly to the signature Artemis II lunar flyby experience.
- **Open photo timeline**: start from Hank Green-style image chronology.
- **Search transcript/media**: start from words, people, or moments.
- **Explore orbit**: start in the current full-control orbit view.

The first impression should say: this is a mission you can experience, not merely a simulator you must configure.

## Time And Navigation

All navigation should converge on the mission clock.

- Clicking an event sets mission time.
- Selecting media sets mission time.
- Selecting a transcript line sets mission time.
- Selecting a photo sets mission time.
- Frame & Shoot phase controls set mission time.
- Orbit timeline controls set mission time.

After the time commit, the app should fan out to scene, media, transcript, captions, panels, labels, and active event state.

This keeps the product coherent even as the number of content types grows.

## Media And Transcript

Media and transcript should become first-class synchronized layers.

### Media

Mission media should answer:

- what is visible,
- when it was captured or broadcast,
- where the spacecraft was,
- which event or phase it belongs to,
- whether Frame & Shoot can recreate or explain the geometry.

The photo timeline should not be just a gallery. It should be a time-indexed visual layer over the orbit.

### Transcript

Transcript should support multiple levels:

- captions/subtitles for active broadcast or clip playback,
- a synchronized transcript panel that highlights and scrolls with playback,
- search over transcript entities, events, speakers, and objects,
- speaker/role filtering when diarization is reliable,
- transcript lines as mission-time navigation anchors,
- transcript snippets attached to events and media.

Transcript is a navigation surface as much as it is text.

## Frame & Shoot

Frame & Shoot is a signature feature, not an auxiliary toy.

It should be the bridge between a photo/broadcast moment and mission geometry:

- show where the craft was,
- show what direction the camera is looking,
- expose what Earth, Moon, Sun, Venus, or other anchors should look like,
- explain sub-points, glints, occlusions, labels, and lunar features when useful,
- allow users to compose or verify a view around a real mission moment.

When a user selects a photo or media moment, Frame & Shoot must be able to open
in the relevant time/camera context.

## Panels And Hierarchy

Panels should be organized by user intent, not by implementation history.

Recommended high-level panel families:

- **Mission**: status, phase, clock, event summary.
- **Media**: photo timeline, video/audio, captions, transcript.
- **Geometry**: Frame & Shoot, surface points, glints, lunar features.
- **Orbit**: view/origin/follow/dimension/plane controls.
- **System**: settings, performance, data/source status.

The UI should reveal expert controls progressively. The first visible layer should support the current task; deeper controls should remain available but not compete.

## Shareable Moments

Every meaningful state should be representable as a URL:

- mission time,
- mission route,
- view/origin/follow/camera state,
- selected media item,
- selected transcript line,
- selected event,
- Frame & Shoot composition,
- relevant overlay state when it explains the moment.

Share should become a product primitive, not a late utility.

## Status And Narrative

Mission status should be readable as narrative:

- mission day / phase,
- current event or next major event,
- craft state,
- distance from Earth and Moon when relevant,
- velocity when meaningful,
- media/transcript availability for the current moment.

Raw telemetry is valuable, but the user should first understand "where are we in the mission?"

## Design Implications

The style guide remains valid: compact, operational, dark, and data-focused. But UX hierarchy must become clearer:

- Primary mission experience controls should be few and obvious.
- Expert orbit controls should remain powerful but grouped.
- Media and transcript should not feel bolted on.
- Frame & Shoot should be presented as a way to understand mission imagery.
- One-of selectors, command buttons, panel launchers, and category tabs should follow the shared control taxonomy.
