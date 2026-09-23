# Auxiliary Camera Views Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/auxiliary-camera-views.test.js` is 2,709 physical lines and mixes panel
infrastructure, flyby/event and camera-control contracts, and scene overlay
rendering. These are different failure domains corresponding to separate
production owners from the auxiliary-camera refactor.

Keep renderer fallback, presets, Earth Orbit XY overlay and panel scheduling/
layout in the views suite. Move Frame and Shoot camera controls to a composer
interaction suite, and flyby planning, timeline phase and event-pill behavior
to a timeline suite. Move
sky labels, see-through markers, ambient/reflected light and constellation
rendering to a composer scene suite. Preserve the real manager and assertions;
do not introduce a parallel implementation in fixtures.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `auxiliary-camera-views.test.js` | 2,709 | 1,896 | Under 1,500 |

## Verification

- Run all resulting suites together and compare their combined test count
  with the original suite.
- Run the full unit suite and source-structure check.
- Check that no helper or mock setup is duplicated across suites unnecessarily.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `auxiliary-camera-views.test.js` | 341 |
| `auxiliary-composer-interactions.test.js` | 764 |
| `auxiliary-composer-timeline.test.js` | 689 |
| `auxiliary-composer-scene.test.js` | 943 |

The largest piece is 943 lines, 65.2% smaller than the original and below
both the 1,000-line cap and committed 1,896-line maximum. The interaction
suite owns camera controls, the timeline suite owns flyby planning and
phase/event behavior, the scene suite owns sky/light/constellation rendering,
and the original suite retains panel infrastructure. All 94 pre-existing
tests pass across the four suites.
