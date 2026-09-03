---
doc_class: plan
status: current
scope: runtime.time
canonical_for:
  - time-synchronization-decisions
---

# Time Synchronization Decision Plan

Current rules are owned by
[Mission Clock Authority And Time Domains](../../specs/time/clock-authority.md),
with implementation structure in
[Time Synchronization Design](../../designs/time/synchronization.md).

## Open Decisions

### Stream segment-map ownership

Decide whether finalized piecewise stream mappings live inside
`media-manifest.json5` or as companion data-repository sidecars.

Required outcome:

- one authored source of truth;
- explicit time base and segment boundaries;
- staging/deployment ownership; and
- validation against the anchor ledger.

### Transcript time representation

Decide whether synchronized transcript tracks store video-relative seconds,
mission UTC, or both.

Required outcome:

- preserve source-relative provenance;
- deterministic conversion to display/seek time;
- schema versioning and validation; and
- no ambiguity across multi-part streams.

### Uncertain and piecewise sync UX

Decide how the UI communicates provisional, uncertain, discontinuous, or
out-of-range stream mappings.

Required outcome:

- users can distinguish measured synchronization from approximation;
- unsupported ranges do not appear synchronized; and
- status does not overwhelm ordinary playback.

### Canonical UTC/TDB regression guard

Choose the canonical test layer and fixtures for UTC/TDB-sensitive event
behavior.

Required outcome:

- data-boundary `time_scale` validation;
- event-time conversion coverage;
- at least one known eclipse/contact or equivalent physical reference; and
- protection against duplicated or inconsistent TDB offsets.

### Timeline range and out-of-range media

Decide whether the visual timeline spans authored mission chronology while the
seekable orbit range remains ephemeris-bounded, and how media outside that
seekable range is represented.

Required outcome:

- visual and seekable ranges are explicit;
- the UI never fabricates an ephemeris sample;
- non-seekable media behavior is specified by the timeline/media contract; and
- empty, unavailable, and out-of-range states have verification coverage.

## Delivery Rule

Each accepted decision must update the owning specification or design before
implementation. Evidence such as stream anchors or timing investigations does
not become normative by being linked here.
