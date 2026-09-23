# Media Browser Panel Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`app/media-browser-panel.js` is 3,696 physical lines. It owns independent
media policies, panel/drawer geometry, thumbnail placement/paging/rendering,
image gestures, HLS video-source lifetime, filter controls, DOM event binding,
and orchestration. Decompose these by owned state and effect boundary while
keeping `createMediaBrowserPanelActions` and its named policy exports stable.

The panel facade should own mission context, structural render scheduling,
registry publication and public intents. Thumbnail placement/paging and card
rendering should have explicit operations and their own drag/scroll caches;
the video-source owner should retain HLS attachment tokens and disposal;
geometry should own panel drag/resize state. Pass narrow callbacks from the
facade rather than recreating a broad shared-state bag or prototype mixins.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `media-browser-panel.js` | 3,696 | 2,587 | Under 1,000 |

## Verification

- Run media browser panel timeline/player and thumbnail unit suites together
  (18 existing assertions) plus source-attachment and layout coverage.
- Run the full unit gate, source-structure check and static build.
- Exercise media selection, tray resize/paging, and foreground video on the
  real Artemis II route; preserve panel persistence/disposal behavior.

## Result

The public panel facade is 971 lines; the largest supporting owner is the
747-line thumbnail controls module. The largest piece is 73.7% smaller than
the original 3,696 lines, below the committed 2,587-line maximum and the
1,000-line cap. Media policy/config, HLS source lifetime, panel geometry,
thumbnail rendering and interaction, image view, filters, playback controls,
stage overlays, view-model formatting and shell/event binding now have named
owners and explicit callback ports. The 18 existing panel/thumbnail assertions,
three image-view checks and two new HLS stale-attachment/lifetime checks pass.
The full unit gate (3,833 passing, six skipped), structure check, retry of
the static build after a transient Windows `dist` file lock, and four real
Artemis II media geometry/foreground playback browser cases pass.
