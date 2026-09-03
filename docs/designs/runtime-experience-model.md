# Runtime Experience Model

## Purpose

Explain the product rationale behind [Runtime UX](../specs/ui/runtime-ux.md),
[Artemis Real-Time Experience](../specs/ui/artemis-real-time-experience.md), and
[Runtime Style And Interaction](../specs/ui/runtime-style-and-interaction.md).

## Orbit-Native Identity

The runtime is not a generic dashboard, a media player with an orbit
background, or a simulator that exposes every control simultaneously. It is an
orbit-native mission explorer where mission time, spacecraft geometry,
rendered bodies, media, transcript, and annotations explain one another.

The first layer feels simple because it is curated, not because the system is
shallow. Depth remains available through clear task-based entry points.

## Experience And Explore

The product has two complementary depths:

- **Experience** follows the mission as a story through clock, phase,
  media/event context, geometry, and guided actions.
- **Explore** inspects orbit views, cameras, Frame & Shoot, media timelines,
  transcript search, surface annotations, glints, and expert tools.

These are not separate applications and are not yet implemented as a literal
runtime mode switch. They are two depths of shared mission state.

## Progressive Depth

The intended information architecture has four layers:

1. **Experience**: mission clock, phase, playback, scene, current media/event,
   and primary view.
2. **Explore**: camera/orbit controls, timeline navigation, media, core
   overlays, and persistent tools.
3. **Inspect**: Frame & Shoot, filters, surface points, glints, guides, search,
   and compare workflows.
4. **Verify**: provenance, time scale, coordinate frame, generated-data state,
   raw values, and diagnostics.

The surface stays quiet without hiding the doors into deeper work.

## Panel-Family Rationale

Grouping by user intent is easier to understand than grouping by implementation
module. The proposed families are Mission, Media, Geometry, Orbit, and System.
They are an information-architecture target, not a claim about the current
panel registry.

## Artemis And Apollo In Real Time

Apollo in Real Time is primarily an archival replay room. Moon Mission began as
an orbit and geometry exploration tool. Artemis adapts useful principles rather
than copying the interface:

- one master mission clock;
- synchronized media and transcript;
- deep archival exploration;
- simple entry points;
- shareable moments; and
- mission status as narrative.

Apollo's audio-channel matrix maps to Artemis media/transcript/source layers.
Its replay orientation maps to an orbit-and-geometry orientation. Its dense
historical dashboard maps to progressive Experience/Explore depth.

The north star is Artemis in real time, understood through orbit geometry.

## Sources Of Guidance

The model is informed by:

- MDN, web.dev, and Three.js browser/WebGL guidance;
- NASA/JPL visualization patterns, especially NASA Eyes;
- NASA SPICE time, frame, and geometry conventions;
- IAU planetary coordinate/frame recommendations;
- W3C ARIA Authoring Practices; and
- Apple, Material, Fluent, USWDS, Carbon, Atlassian, and Polaris guidance for
  hierarchy, tokens, components, accessibility, layout, and progressive
  disclosure.

These systems supply discipline, not a visual template. Moon Mission remains
compact, operational, dark, data-focused, and specific to scientific mission
exploration.
