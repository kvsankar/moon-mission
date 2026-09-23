# Auxiliary Camera Panel Construction Ownership

Status: construction slice complete (2026-09-23)

## Problem

`auxiliary-camera-panel-factory.js` is 969 physical lines. It constructs DOM,
creates and configures a WebGL renderer, reads persisted layout, initializes a
large panel-state contract, binds controls, and hands the panel to the manager.
The mixed lifetime and effect responsibilities make it hard to change panel
state without touching renderer setup or DOM failure handling.

This slice separates the creation of render resources and initial panel state
from interaction binding. It preserves the manager API and the existing flat
`panelState` fields used by callers. Narrowing that mutable state contract is
separate STR-02 work; moving lines alone will not close it.

## Proposed owners

| Owner | Responsibility |
| --- | --- |
| `auxiliary-camera-panel-render-surface.js` | Create the panel viewport, composer viewport chrome, renderer, overlay canvas, grips, chip and camera. Return the resources or a failed outcome; own creation cleanup. |
| `auxiliary-camera-panel-initial-state.js` | Read persisted layout, derive its frame/visibility facts, and create the initial flat panel state from shell/content/surface references. No event binding or renderer mutation. |
| `auxiliary-camera-panel-factory.js` | Sequence shell/content/surface/state creation, bind controls, and invoke panel finalization. |

The state initializer receives grouped shell, content and surface inputs plus
the mission-enable flags and persisted-layout reader. It must not reach back
into the manager. The render-surface builder receives explicit browser/Three.js
effect dependencies and returns resources for the existing disposal path.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `auxiliary-camera-panel-factory.js` | 969 | 678 | Under 600 |

The result includes the remaining factory and both new owners. No result is
complete unless its largest piece is at most 678 physical lines.

## Verification

- Focused auxiliary manager, composer overlay and view suites.
- Full unit suite and source-structure check.
- Real Artemis II panel resize/layout browser suite, including legacy and
  Dockview paths, because the viewport and renderer creation move.
- Inspect resource-failure cleanup, persistence defaults and panel registry
  state after construction.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `auxiliary-camera-panel-factory.js` | 324 |
| `auxiliary-camera-panel-initial-state.js` | 533 |
| `auxiliary-camera-panel-render-surface.js` | 213 |

The largest piece is 533 lines, 45.0% smaller than the original 969 and below
the committed 678-line maximum. The factory now retains only the content
references it uses to coordinate construction. The state initializer reads
persisted layout and establishes defaults through grouped inputs without
reaching into the manager. The render-surface owner creates DOM/WebGL resources
and disposes a renderer if later setup fails.

Verification: 262 focused auxiliary tests, one focused renderer-failure test,
the full unit suite (3,827 passed, six skipped), production build, and the
727-file source-structure check passed. The auxiliary browser suite's four
successful cases plus a fresh-server rerun of six startup-timeout cases passed
all ten interaction cases. The initial six failures were page navigation or
mission-readiness timeouts before panel assertions; the direct Artemis II route
loaded five panels after the test-server restart.

Remaining debt: `panelState` is still a wide flat mutable contract, the factory
still binds interactions, and the render-surface effects still live under
`app/`. STR-01, STR-02 and STR-06 remain open for separately planned slices.
