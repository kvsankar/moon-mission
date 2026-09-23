# Background Media Panel Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`app/background-media-panel.js` is 2,329 physical lines. It conflates media
candidate policy and formatting, DOM/caption rendering, panel geometry,
HLS/video transport lifetime, transcript rendering, and panel orchestration.
Extract policy and rendering helpers into named modules. Give HLS/transport
state its own owner with explicit operations and invalidation callbacks;
keep the panel action factory as the coordinator and public compatibility
surface. Keep existing media timing, source-attachment, caption and panel
disposal semantics unchanged.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `background-media-panel.js` | 2,329 | 1,630 | Under 1,000 |

## Verification

- Run the background panel, captions/transcript and geometry suites (27
  assertions), media transport unit suites, and a real `/artemis2/` browser
  check for broadcast/foreground handoff.
- Run full unit, source-structure, static build, and `git diff --check`.
- Keep `createBackgroundMediaPanelActions` and existing named exports stable.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `background-media-panel.js` | 940 |
| `background-media-dom.js` | 132 |
| `background-media-captions.js` | 258 |
| `background-media-policy.js` | 334 |
| `background-media-layout.js` | 170 |
| `background-media-transport.js` | 343 |
| `background-media-panel-geometry.js` | 224 |
| `background-media-transcript.js` | 161 |

The largest piece is 940 lines, 59.6% smaller than the original and below
both the 1,000-line cap and committed 1,630-line maximum. Video/HLS
attachment state is owned by the transport object, pointer drag/resize state
by panel geometry, and transcript row/highlight state by its presenter.
Policy, DOM, captions and panel-layout helpers have distinct module homes.
The original module retains the public exports and orchestrates these owners.
The full unit gate (3,827 passing, six skipped), static build, structure
check, and real-route foreground/broadcast handoff browser case pass.
