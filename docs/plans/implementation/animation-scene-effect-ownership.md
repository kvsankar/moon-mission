# Animation Scene Effect Ownership

Status: scene-effect split complete (2026-09-23)

## Problem and boundary

`app/animation-scene-class.js` is 1,008 physical lines. It is primarily a
compatibility class forwarding work to action owners, but it still contains
mobile panel-aware camera framing, Moon SOI/halo/orbit visual-aid effects, and
Earth/Moon rotation with duplicated relative-frame fallback construction.
Those effects have different inputs and lifetimes from class construction.

Keep the public `AnimationScene` methods for current callers. Move substantive
behavior into named scene-effect owners with explicit runtime, DOM and Three.js
inputs; avoid adding another prototype mixin or a wrapper-only file.

## Proposed owners

| Owner | Responsibility |
| --- | --- |
| `scene-mobile-camera-framing.js` | Artemis II compact-card look-target adjustment and its browser geometry. |
| `scene-body-rotation.js` | Resolve the relative frame once, apply Moon/Earth and sky rotation, and fall back to ephemeris geometry when needed. |
| `scene-visual-aids.js` | Moon SOI/Hill sphere, body halos and osculating-orbit resource creation, refresh and disposal. |
| `animation-scene-class.js` | Construct scene state and preserve the public delegation surface. |

Effect modules receive the scene and the few dependencies they use; the
rotation owner shares the fallback calculation rather than duplicating it.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `animation-scene-class.js` | 1,008 | 705 | Under 650 |

Count all resulting source pieces. The largest must be at most 705 lines.

## Verification

- `test/animation-scene-class.test.js` and focused relative-frame/scene tests.
- Full unit suite and source-structure/import-cycle check.
- Real mission route when camera framing or scene asset lifecycle changes.
- Preserve Moon/Earth inertial and relative orientation, sky restoration,
  lunar aid visibility and terminal disposal.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `animation-scene-class.js` | 624 |
| `scene-visual-aids.js` | 148 |
| `scene-body-rotation.js` | 117 |
| `scene-mobile-camera-framing.js` | 92 |

The largest piece is 624 lines, 38.1% smaller than the original 1,008 and
below the committed 705-line maximum. The scene class keeps its public
methods. Mobile framing is a UI effect with explicit browser/Three.js inputs;
visual aids own their resources; Earth and Moon rotation share one relative
frame resolver and ephemeris fallback.

Verification: 60 focused scene/relative tests, the full unit suite (3,827
passed, six skipped), production build and the 738-file structure/import-cycle
check passed. All three Artemis II mobile browser interaction cases passed.
The completed refactor record names this plan and all four resulting files.

Remaining debt: the class remains a compatibility facade over many action
modules, and the permanently disabled craft locator halo gate still needs the
roadmap's explicit disposition. This slice did not change that product choice.
