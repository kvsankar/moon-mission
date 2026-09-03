---
doc_class: spec
status: current
scope: runtime.time
canonical_for:
  - mission-clock-authority
  - runtime-time-domain-semantics
---

# Mission Clock Authority And Time Domains

## Purpose

This specification defines time-domain vocabulary and clock authority across
ephemeris data, mission events, animation, media, broadcast streams,
transcripts, relative mode, and compare mode.

Implementation structure is described in
[Time Synchronization Design](../../designs/time/synchronization.md). Unresolved
schema and UX decisions are tracked in
[Time Synchronization Plan](../../plans/breakdown/time-synchronization.md).

This specification owns time-domain definitions and the precedence of the
mission animation clock. The timeline/media specification owns detailed media
transport, transcript display, seek, pause, and end behavior. Relative and
comparison specifications own their mode-specific behavior.

## Time Domains

| Domain | Meaning | Typical source | Contract |
| --- | --- | --- | --- |
| UTC | Civil timestamp used by mission events, publications, and user-facing labels | Mission configs, HORIZONS outputs, NASA references | Preferred display/reference time unless a source explicitly requires another scale. |
| TDB / ephemeris time | Dynamical time used by ephemeris calculations | HORIZONS, SPICE-like and astronomy data | Must not be silently substituted for UTC in UI or event logic. |
| Mission elapsed time | Duration from a mission launch/reference epoch | Mission source material | Requires an explicit epoch before conversion to mission time. |
| Animation time | Runtime mission clock | Animation controller and timeline state | Authoritative runtime time for scene state. |
| Media item time | Timestamp or interval for discrete images/audio/video | `mediaItems[]` metadata | Resolved against real mission chronology. |
| Stream video time | Seconds from the start of a long-form video | HLS/video element | Requires explicit mapping to mission time. |
| Transcript time | Seconds or source-relative timestamp within transcript media | Generated transcript artifacts | Requires explicit offset/mapping before synchronized use. |
| Comparison time (`tau`) | Fictional aligned time used by compare mode | Compare-mode mapping | Never presented or interpreted as real UTC/TDB. |

## Authority Rules

1. Animation time is the runtime source of truth for scene state.
2. A discrete media selection may request a mission-time seek, but media does
   not silently create an independent mission clock.
3. Long-form streams require an explicit video-time to mission-time mapping.
4. Stream mappings may be piecewise. A single global offset is valid only when
   anchor evidence establishes it.
5. Transcript segments remain source-relative until a manifest or sidecar
   states their time base and mapping.
6. Compare mode uses derived time and does not expose real mission media unless
   a feature explicitly defines those semantics.
7. UTC/TDB conversion decisions belong at the data boundary and require tests
   for event-sensitive behavior.

## Related Current Contracts And Evidence

- Timeline/media behavior:
  `docs/specs/time/timeline-and-media-playback.md`
- Relative mode: [Relative Mode](../modes/relative-mode.md)
- Comparison mode: [Orbit Comparison Mode](../modes/orbit-comparison.md)
- Artemis II stream planning:
  [Artemis II Media](../../plans/breakdown/artemis2-media.md)
- Provisional stream anchors:
  [Artemis II Video Sync Anchors](../../evidence/baselines/artemis2-video-sync-anchors.md)
- Transcript handoff:
  [Artemis II Transcription And Diarization Handoff](../../evidence/handoffs/artemis2-transcription-diarization-handoff.md)
- Eclipse timing investigation:
  [Eclipse Timing And TDB](../../research/time/eclipse-timing-tdb-2026-04.md)
- TDB commit review:
  [TDB Timescale Commit Review](../../evidence/reviews/commit-review-tdb-timescale-2026-04-08.md)
- Chebyshev transport:
  `docs/specs/data/chebyshev-ephemeris-format.md`

Those paths will be updated by their own migration units. They do not override
the time-domain and clock-precedence rules in this specification.
