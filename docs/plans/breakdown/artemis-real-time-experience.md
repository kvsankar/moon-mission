# Artemis Real-Time Experience Plan

Requirements:
[Artemis Real-Time Experience](../../specs/ui/artemis-real-time-experience.md)

Rationale:
[Runtime Experience Model](../../designs/runtime-experience-model.md)

## Current Conformance

| Requirement area | Current state | Remaining work |
| --- | --- | --- |
| Experience and Explore depths | Tools and mission scene exist, but no explicit Experience entry/mode | Design and implement the simple Experience entry path |
| Start at launch | Available through ordinary mission time controls | Make it a clear authored entry point |
| Jump to flyby | Flyby workflows exist | Provide the intended direct experience entry |
| Photo timeline | Mission Media images exist | Provide a first-class photo-timeline entry and geometry handoff |
| Transcript navigation | Synchronized transcript rendering exists | Complete entity search/browse, filters, and reliable transcript-line navigation |
| Media-to-geometry | Media selection drives mission time | Open Frame & Shoot with relevant time/camera/media context |
| Mission narrative | Phase, time, telemetry, and events exist | Add a clearer mission-status/narrative band |
| Shareable moments | Mission and selected runtime modes are routable | Encode media, transcript, event, composition, and explanatory overlay state |
| Scientific provenance | Present in selected surfaces | Apply Real/Derived/Approximate/Stylized/Unavailable semantics consistently |

## Preserved Near-Term Sequence

1. Stabilize the style and control taxonomy.
2. Make Lunar Features and Surface Points consistent with that taxonomy.
3. Improve Mission Media so selection clearly drives mission time and geometry
   context.
4. Integrate transcript as a synchronized navigation surface.
5. Add a clearer mission-status/narrative band.
6. Add shareable moment URLs for media, transcript, and Frame & Shoot state.
7. Create an Experience entry path that hides complexity until requested.

## Delivery Outcomes

- [ ] Define Experience entry behavior without creating a separate mission
  state model.
- [ ] Add clear launch, flyby, photo-timeline, transcript-search, and orbit
  entry points.
- [ ] Connect photo/media selection to Frame & Shoot context.
- [ ] Complete transcript search, speaker/role filtering, and navigation.
- [ ] Add mission narrative/status presentation.
- [ ] Define and implement complete shareable-moment URL state.
- [ ] Verify all flows against mission time, geometry, provenance, and return
  navigation requirements.

## Closure

Close only when each retained requirement is shipped and tested or explicitly
changed in the owning specification. Independent product and accessibility
review is required.
