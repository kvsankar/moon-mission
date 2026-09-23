# Media Manifest Normalization Ownership

Status: schema split complete (2026-09-23)

## Problem and boundary

`core/domain/media-manifest.js` is 1,017 physical lines and normalizes three
different input schemas in one file: generic media items, legacy Artemis
timeline photos/audio, and mission media streams. The schemas share small
field, timestamp, thumbnail and metadata policies, but each has its own item
shape and provenance. Keeping them together makes a schema change require
reviewing unrelated normalization paths.

The public `normalizeMissionMediaManifest`, `buildMediaThumbnailKey` and
`parseMediaTimestamp` exports stay available from the existing module path.
All extracted modules remain deterministic value transformations; asset URL
resolution continues through the existing domain resolver.

## Proposed owners

| Owner | Responsibility |
| --- | --- |
| `media-manifest-fields.js` | Shared field, timestamp, thumbnail, metadata and generic item normalization. Export only inputs needed by schema adapters. |
| `media-manifest-artemis.js` | Legacy Artemis timeline photo and audio schema, including its fixed-offset time and media-base URL rules. |
| `media-manifest-streams.js` | Mission stream schema, sync anchors and playable stream item projection. |
| `media-manifest.js` | Assemble the normalized collections and retain the public API. |

Dependencies flow from the three schema owners to shared field policy and
from the public assembler to those owners. No adapter imports the assembler.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `media-manifest.js` | 1,017 | 711 | Under 600 |

Count every resulting source file. The split is complete only if the largest
piece is at most 711 physical lines and the schema boundaries are preserved.

## Verification

- `test/media-manifest.test.js`, including the authored Artemis manifest case.
- `test/mission-media-load-recovery.test.js` and focused media coordination
  tests for callers of the public facade.
- Full unit suite and source-structure/import-cycle check.
- Compare ordering, timestamps, URLs, metadata, playback roles and stream
  projections through the unchanged facade.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `media-manifest-fields.js` | 554 |
| `media-manifest-artemis.js` | 283 |
| `media-manifest-streams.js` | 197 |
| `media-manifest.js` | 68 |

The largest piece is 554 lines, 45.5% smaller than the original 1,017 and
below the committed 711-line maximum. The public module remains an assembler
and re-exports the existing thumbnail-key and timestamp helpers. Schema
adapters depend on shared field policy; none imports the assembler.

Verification: all 166 focused manifest and media-coordinator tests, the full
unit suite (3,827 passed, six skipped), production build and the 730-file
source-structure/import-cycle check passed. The completed refactor record in
`scripts/source-structure-baseline.json` names this plan and all four pieces.

Remaining debt: the shared field module still exports helpers to multiple
schema adapters, but it has no browser effects or mutable state. The larger
media timeline coordinator's playback ownership remains a separate open
slice.
