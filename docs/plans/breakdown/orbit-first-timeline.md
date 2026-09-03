# Orbit-First Timeline Plan

Last reviewed: 2026-09-03

The timeline already has event and media tracks, adaptive time labels, a shared
playhead, and zoom/pan/reset interactions. The original proposal and completed
implementation detail are preserved in the
[reviewed history](../../archive/plans/orbit-first-timeline-history-2026-09-03.md).

## Product Outcome

The timeline should explain mission geometry first and use media as supporting
evidence. It should show where the craft is in the mission arc, what geometry
or data phase is active, and which events or media correspond to that moment.

## Remaining Outcomes

1. Consolidate transport, timeline tracks, Events, Media, zoom controls, and
   readouts into one coherent bottom console without changing clock ownership.
2. Add larger invisible hit targets for dense event and media markers. The
   existing ruler subdivisions already respond to the zoomed time range.
3. Define and render phase and trajectory-data bands, including honest
   pre-ephemeris and generated-continuation regions.
4. Define a reusable geometry-moment model for Earthset, Earthrise, closest
   approach, eclipse boundaries, maximum distance, entry, and splashdown.
5. Add keyboard-accessible hover/focus details led by geometry, with nearby
   event and media context.
6. Decide and implement conservative geometry-aware view suggestions for
   selected media or geometry moments.
7. Add unit coverage for new derived timeline state and browser/screenshot
   coverage for compact, expanded, media-visible, and zoomed layouts.

## Guardrails

- The mission clock remains authoritative.
- Mission events and dense media remain separate data families and tracks.
- The native range input retains accessible seek semantics.
- Compare mode may use non-media lanes; real-time mission media remains off.
- Mobile must use touch-sized targets and cannot depend on hover.

Behavioral authority:
[Timeline And Media Playback](../../specs/time/timeline-and-media-playback.md).

## Completion Gate

Archive this plan when the remaining outcomes are implemented or explicitly
rejected and the resulting behavior is captured in the owning specification.
