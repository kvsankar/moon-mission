---
doc_class: design
status: current
scope: runtime.time
canonical_for:
  - time-synchronization-architecture
---

# Time Synchronization Design

The normative vocabulary and authority rules are owned by
[Mission Clock Authority And Time Domains](../../specs/time/clock-authority.md).

## Why The Time Model Crosses Features

Moon Mission combines physical ephemeris time, civil event timestamps, mission
elapsed time, one authoritative animation clock, discrete media intervals,
long-form stream playback, source-relative transcripts, and fictional compare
time. These domains are related through explicit mappings, not interchangeably
stored timestamps.

## Synchronization Shape

```text
user or playback intent
  -> resolve source time domain
  -> map to mission animation time
  -> commit authoritative mission time
  -> derive scene, event, media, transcript, caption, and panel state
```

The mapping step belongs to the feature that understands the source domain.
The animation clock remains the common commit point.

## Discrete Media

Discrete media metadata resolves image, audio, and video intervals against
mission chronology. Detailed selection and seek behavior remains owned by the
timeline/media specification. The representation of media outside ephemeris
coverage remains an open decision rather than settled architecture.

Detailed playback policy remains in
`docs/specs/time/timeline-and-media-playback.md` until that specification's
own migration unit.

## Long-Form Streams

Stream adapters translate between media-element seconds and mission time. The
mapping can contain multiple affine segments because archive edits, source
switches, replays, or DVR discontinuities can invalidate one global offset.

Observed anchors remain evidence until a segment map is accepted into authored
metadata or a data sidecar. Playback effects consume the accepted mapping; they
do not infer mission time from an undocumented offset.

## Transcripts

Transcript time begins in the source media domain. Part offsets and stream
mappings place segments on a unified media timeline and then mission chronology.
The transcript/media schema owns any distinction between visible display timing
and raw transcription provenance; this design only requires an explicit mapping
between source and mission domains.

## Ephemeris UTC And TDB

Ephemeris computation can use TDB while mission events and user-visible labels
use UTC. Conversion and declared `time_scale` metadata isolate that difference
at the data boundary. Event-sensitive tests guard against applying UTC values
directly to a TDB series or presenting ephemeris time as civil time.

## Relative And Compare Modes

Relative mode changes the spatial frame while preserving the same mission
clock.

Compare mode introduces fictional `tau`, which maps independently into each
mission's native chronology. Real mission media is disabled unless a separate
feature defines meaningful comparison-media semantics.

## Ownership Boundaries

- Specifications own time meanings and authority.
- Mission/data loaders own declared source time scales.
- Mapping helpers own deterministic conversion between domains.
- Runtime state owns the authoritative animation time.
- Media and transcript adapters own browser/media effects.
- Evidence records provisional anchors and validation measurements.
- Plans own unresolved schema, storage, UX, and test decisions.

## Current Detail Records

- `docs/specs/time/timeline-and-media-playback.md`
- [Artemis II Media](../../plans/breakdown/artemis2-media.md)
- [Artemis II Video Sync Anchors](../../evidence/baselines/artemis2-video-sync-anchors.md)
- [Artemis II Transcription And Diarization Handoff](../../evidence/handoffs/artemis2-transcription-diarization-handoff.md)
- [Eclipse Timing And TDB](../../research/time/eclipse-timing-tdb-2026-04.md)
- [TDB Timescale Commit Review](../../evidence/reviews/commit-review-tdb-timescale-2026-04-08.md)

Each will move under its own reviewed migration unit.
