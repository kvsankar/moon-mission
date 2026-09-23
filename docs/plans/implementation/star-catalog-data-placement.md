# Star Catalog Data Placement

Status: data-placement split complete (2026-09-23)

## Problem and boundary

`rendering/star-catalog-hipparcos.js` (5,068 lines) and
`rendering/star-name-cross-index.js` (2,923 lines) are generated lookup data
embedded in executable JavaScript. The declarations obscure the small runtime
API and make generated catalog rows look like hand-authored program logic.
Move the records into static JSON modules, sharded by increasing HIP ranges
so no data file exceeds 1,000 physical lines. Keep the synchronous imports,
record order and shape, shallow-frozen public containers, and compatibility
aliases. The JS files become small assembly/API facades; star label precedence
remains in `core/domain/star-display-names.js`.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `star-catalog-hipparcos.js` | 5,068 | 3,547 | Under 900 |
| `star-name-cross-index.js` | 2,923 | 2,046 | Under 900 |

## Verification

- Compare pre/post counts, ordering, all records, and export aliases using
  deterministic parity tests or hashes; preserve 5,041 Hipparcos rows.
- Run star-name/renderer/sky tests, full unit gate, structure check, static
  build, and a real mission route in the browser (JSON module MIME/import).
- Keep catalog provenance in the facades and name-shard boundaries explicitly.

## Result

The Hipparcos facade is 35 lines; its six ordered JSON shards are at most
852 lines. The cross-index facade is 19 lines; its four ordered shards are at
most 802 lines. The largest pieces are 83.2% and 72.6% smaller than their
respective originals, and every resulting file is under the 1,000-line cap.
Pre/post JSON hashes match exactly: 5,041 stars and 2,914 name records,
including ordering and public alias identity. The source-structure ratchet
now validates JSON catalog shards in completed refactors and enforces their
1,000-line cap.
The full unit gate (3,829 passing, six skipped), static build, structure
check, real Artemis II route, and raw static-server JSON module import pass.
