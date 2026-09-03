# Runtime UX Doctrine

Last updated: 2026-05-18

Experience-model rationale:
[Runtime Experience Model](../../designs/runtime-experience-model.md)

Conformance work:
[Runtime Style And Accessibility](../../plans/breakdown/runtime-style-and-accessibility.md)

This doctrine defines what the mission runtime should become. It is intentionally above component styling and below product strategy: durable enough to judge design direction, concrete enough to drive implementation.

The runtime is not a generic dashboard, a media player with an orbit background, or a simulator that exposes every knob at once. It is an orbit-native mission explorer: a scientific 3D experience where mission time, spacecraft geometry, rendered bodies, media, transcript, and annotations explain one another.

The first layer should feel simple because it is curated, not because the system is shallow. Depth should be available through clear, task-based doors.

## North Star

Mission time is the spine. Geometry is the native language. Evidence is synchronized to both.

Every meaningful user action should preserve or clarify at least one of these:

- **When**: mission time, event, phase, media/transcript timestamp.
- **Where**: spacecraft/body position, frame, surface point, orbit segment.
- **What was visible**: camera direction, lighting, occlusion, field of view, annotation state.
- **What evidence belongs here**: photo, video, audio, transcript, caption, source metadata.
- **How to return**: URL/share state, selected panel, time, camera, media, overlays.

## Product Shape

The runtime has two complementary faces:

- **Experience**: follow the mission as a story with a clear clock, phase, media/event context, and a small set of guided actions.
- **Explore**: inspect the mission through orbit views, Frame and Shoot, media timelines, transcript search, surface annotations, glints, and expert panels.

Experience and Explore must not become separate apps. They are two depths of the same mission state.

## Complexity Model

Use four layers of progressive depth:

1. **Experience layer**: mission clock, phase, playback, current scene, current media/event, primary view.
2. **Explore layer**: camera/orbit controls, timeline navigation, media panel, core overlays, persistent tools.
3. **Inspect layer**: Frame and Shoot, feature filters, surface points, glints, guide overlays, search and compare workflows.
4. **Verify layer**: provenance, time scale, coordinate frame, generated-data status, raw values, diagnostics.

Do not flatten these layers into one control surface. Do not bury expert entry points so deeply that they become invisible. The surface should be quiet; the doors into depth should be obvious.

## Scientific Visualization Honesty

The app can simplify, exaggerate, or stylize, but it must not blur those categories.

The UI should distinguish:

- **Real**: directly sourced mission/media/ephemeris facts.
- **Derived**: computed from known data, such as positions, phases, glints, sub-points, frame transforms.
- **Approximate**: inferred, reduced, interpolated, manually aligned, or limited by data quality.
- **Stylized**: intentionally rendered for visibility, scale, performance, or narrative clarity.
- **Unavailable**: missing, not loaded, outside coverage, or intentionally disabled.

This is especially important for solar-system objects. Time scales, coordinate frames, body-fixed orientation, lighting, exposure, non-real scale, and camera assumptions should be visible when they affect interpretation.

## Rendering Doctrine

3D rendering is a product feature and a performance budget.

- Keep simulation time, render frame time, media time, and UI state conceptually separate.
- Use browser-native animation timing for rendering; do not bind mission correctness to frame rate.
- Prefer stable, responsive rendering over maximum fidelity.
- Scale quality by device, viewport, and active workload.
- Reduce work before optimizing work: fewer redraws, fewer labels, fewer draw calls, lower pixel ratio when needed.
- Keep expensive DOM layout and data processing out of the render loop.
- Treat mobile as a lower-budget rendering environment with different defaults.
- Make visual compromises legible when they affect scientific interpretation.

## Time And Timeline Doctrine

There is one master mission time.

Timeline, media, transcript, events, orbit geometry, and Frame and Shoot should converge on that time. A timeline is not just a slider; it is mission navigation, media synchronization, event context, and inspection history.

Timeline surfaces should support:

- current time always visible,
- play/pause/scrub states that are visually distinct,
- preview versus committed scrub behavior when needed,
- event, phase, craft, and media markers at appropriate density,
- zoom or scale shifts for mission-wide versus event-level work,
- keyboard-accessible seek behavior,
- clear empty/loading/out-of-range states.

## Control Surface Doctrine

Controls are understandable when visual role, semantic role, and scope agree.

Every control belongs to one scope:

- global mission state,
- scene overlay state,
- persistent tool state,
- temporary configuration state,
- local panel/filter state.

Every control also belongs to one interaction role: tab, one-of selector, binary toggle, command, slider, search, disclosure, launcher, menu, or checklist. Do not use the same pill/button style for unrelated roles without a visible distinction.

Open state, selected state, enabled state, and applied state are different meanings. The UI should not collapse them into one color.

## Panel And Layout Doctrine

Panels are task spaces, not drawers full of implementation details.

- Organize panels by user intent: Mission, Media, Geometry, Orbit, System.
- Put controls near the thing they modify.
- Use spacing and alignment to show relationships before adding boxes.
- Keep panels dense but legible; density without hierarchy is noise.
- Let each panel begin with useful defaults and reveal deeper controls progressively.
- Generated and static panels for the same feature must share semantics and visual structure.

## Mobile Doctrine

Mobile is an adapted interaction model, not a shrunken desktop.

- Preserve mission context first: scene, time, playback, current mode.
- Show fewer simultaneous controls.
- Use larger touch targets and reachable placement for primary actions.
- Convert panels/popovers into bottom sheets, drawers, or focused views when space requires it.
- Avoid horizontal scrolling except for timelines or media strips.
- Keep search and input usable with the virtual keyboard open.
- Lower annotation density and rendering quality by default when needed.

## Simplicity Standard

The product is simple when:

- the first visible layer answers "where are we in the mission?",
- the primary action is obvious,
- the current scene state is explainable,
- controls are grouped by task rather than subsystem,
- advanced tools are discoverable without competing with the main experience,
- deep inspection can be shared or revisited,
- the user can tell what is real, derived, approximate, stylized, or unavailable.

The product is not simple merely because controls are hidden.
