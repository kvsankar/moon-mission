# Media Timeline Coordination Ownership

Status: complete (2026-09-23)

## Problem and boundary

`app/media-timeline-coordination.js` is 3,618 physical lines. It currently
owns manifest publication and invalidation, media focus/thumbnail planning,
timeline marker publication, audio/video transport, media-clock authority,
panel intents, and UI model rendering inside one closure. First move pure
media/thumbnail policy into domain-level functions. Then give playback and
clock authority, selection/focus, manifest lifetime, and panel projection
explicit owners with narrow read/effect ports. Preserve coordinator `update`
and `dispose` as the public lifecycle boundary; do not split one broad mutable
closure into prototype mixins or a single shared-state bag.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Actual largest piece |
| --- | ---: | ---: | ---: |
| `media-timeline-coordination.js` | 3,618 | 2,532 | 973 (73.1% smaller) |

## Resulting ownership

- The 763-line coordinator owns public `update`/`dispose`, timeline event
  bindings, context signatures, cache invalidation and the panel lifecycle.
- Selection intent and user-seek state live in `media-timeline-selection-runtime.js`
  (600 lines). Pure filter-intent policy lives in `core/domain/media-filter-state.js`.
- Playback/clock authority lives in `media-timeline-playback-runtime.js` (973
  lines); `media-timeline-playback-transport.js` (604 lines) owns audio/video
  element and session effects. Transport session state remains private to
  playback rather than becoming a coordinator-wide mutable bag.
- Item, focus, thumbnail, panel-model, duration-probe and manifest owners each
  have bounded inputs. The coordinator publishes only four playback fields to
  selection, playback and panel projection.

## Verification

- Eight media-timeline suites, including the separate 70-case intent suite:
  131 tests pass. The full unit run passes 3,841 tests (6 skipped).
- The Artemis II real-route foreground/broadcast browser handoff passes.
- The 845-file source-structure check, static build and `git diff --check`
  pass. The oversized-file baseline is empty.
