# Media Timeline Coordination Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/media-timeline-coordination.test.js` is 4,807 physical lines and covers
manifest/loading publication, timeline selection, media browsing, audio
transport, video transport, clock authority, and buffering/end-of-media.
Those are distinct media coordinator contracts. Put the global setup/cleanup
and small test factories in one shared harness, then
split the assertions along these behavior domains. Each suite must exercise
the real `createMediaTimelineCoordination` implementation; the harness may
mock only the existing external media loader and panel boundary.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `media-timeline-coordination.test.js` | 4,807 | 3,364 | Under 1,000 |

## Verification

- Preserve all 61 existing assertions across the resulting suites.
- Run the focused suites, full unit gate, and source-structure check.
- Keep the existing mock-reset and global-restoration behavior per test.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `media-timeline-coordination.test.js` | 603 |
| `media-timeline-selection.test.js` | 678 |
| `media-timeline-browser-focus.test.js` | 714 |
| `media-timeline-audio-transport.test.js` | 400 |
| `media-timeline-video-transport.test.js` | 964 |
| `media-timeline-clock-authority.test.js` | 738 |
| `media-timeline-playback-recovery.test.js` | 870 |
| `helpers/media-timeline-coordination-harness.js` | 99 |

The largest piece is 964 lines, 80.0% smaller than the original and below
the committed 3,364-line maximum and 1,000-line cap. Each suite owns one
media behavior contract. The mock declarations remain local to each suite
because Vitest must hoist them before that suite's production import; shared
global reset and test factories live in the harness. All 61 pre-existing
assertions pass.
