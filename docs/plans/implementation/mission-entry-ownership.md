# Mission Entry Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`src/platform/js/mission.js` is 1,006 physical lines. It is the application
composition root, but still owns several lifecycles that can be named and
tested independently: runtime state bootstrap, initial view-flag hydration,
view-identity synchronization, timeline event/marker caching, and workspace
startup/disposal. Extract these as focused owners while leaving broad
dependency injection and final module assembly at the root. Do not move a
wide argument literal solely to meet a line count, or add another mutable
shared-state hub.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `mission.js` | 1,006 | 704 | Under 700 |

## Verification

- Run mission runtime root/entry/view-state/scene composition unit suites.
- Run the full unit gate, source-structure check and static build.
- Exercise real Artemis II and CY3 routes through startup, view identity and
  cleanup; preserve the existing public globals and `main` export.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `mission.js` | 697 |
| `app/mission-initial-view-state.js` | 84 |
| `app/mission-view-identity-controller.js` | 70 |
| `app/mission-timeline-source.js` | 58 |
| `app/mission-workspace-lifecycle.js` | 83 |
| `app/mission-runtime-state-bootstrap.js` | 83 |
| `app/mission-view-commands.js` | 66 |

The largest piece is 697 lines, 30.7% smaller than the original and below
the committed 704-line maximum and 1,000-line cap. Initial view hydration,
identity publication, timeline caching, state/render bootstrap, Lunar
Features/photo commands, and workspace cleanup have separate owners. Broad
scene/legacy composition remains at the root rather than being hidden behind
another mutable dependency bag. Five focused owner assertions plus existing
root/viewport tests pass.
The full unit gate (3,841 passing, six skipped), static build and structure
check pass. Fresh Artemis II and Chandrayaan III routes loaded owned scenes
with Dockview startup. A terminal `pagehide` disposed the scene and removed
the resize global.
