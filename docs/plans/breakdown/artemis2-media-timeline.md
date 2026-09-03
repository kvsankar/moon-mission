# Artemis II Media Timeline Plan

Last reviewed: 2026-09-03

The Mission Media foundation, photo timeline, and discrete audio/video support
have shipped. The full implementation narrative is preserved in the
[reviewed history](../../archive/plans/artemis2-media-timeline-history-2026-09-03.md).

## Scope

This plan owns the remaining Mission Media timeline and browser follow-ups. It
does not own long-form broadcast delivery or the broader orbit timeline:

- Long-form streams, transcripts, search, attribution, and deployment:
  [Artemis II Media](artemis2-media.md)
- Orbit-first phase, geometry, and data lanes:
  [Orbit-First Timeline](orbit-first-timeline.md)
- Clock and playback behavior:
  [Timeline And Media Playback](../../specs/time/timeline-and-media-playback.md)

## Verified Baseline

- Artemis II loads an authored media manifest through the media domain and
  coordination modules.
- Mission Media has its own panel, filters, details, nearby items, and image
  pan/zoom controls.
- Event and media markers use separate lanes on one mission-time axis.
- Selecting a reachable foreground media item is intended to seek the mission
  clock; discrete audio/video playback coordinates with mission playback.
- Compare mode keeps real-time mission media disabled.

## Remaining Outcomes

1. Reproduce and close the intermittent media-dot selection problem with a
   focused browser regression covering initial load and thumbnail readiness.
2. Decide whether the proposed horizontal media scroller adds value beyond the
   current nearby-item strip. Implement it only after an explicit product
   decision.
3. Keep marker selection, panel selection, and mission-time seeking on one
   tested event/data path.
4. Verify pre- and post-ephemeris media remains selectable without implying
   that trajectory data exists at that time.

## Completion Gate

Archive this active remainder when the marker-selection issue is closed, the
scroller is implemented or rejected, and the focused browser checks pass.
