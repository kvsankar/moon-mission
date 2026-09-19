# Unit Coverage, Branch-First Pass — 2026-09-19

Continues [Unit Coverage Expansion, Round Two](unit-coverage-expansion-round-two-2026-09-18.md).
That pass closed the largest line gaps. This one targets branches, which
the measurement at the end of it identified as the gate furthest from
target.

## Why Branches

At the start of this pass the four gates stood at 79.08% lines, 76.92%
statements, 66.06% branches and 76.37% functions, against 87/87/82/50.
Branches were 15.94 points short; lines were 7.92. Modules carrying far
more uncovered branches than uncovered lines are therefore the efficient
targets, and each slice here was chosen that way rather than by file size.

## Constraint

Test-only. No product code was changed, and no test-helper change was
needed either. Thresholds, coverage exclusions, the loaded-files-only
scope, mission configuration, runtime assets and data-repository files are
unchanged, and no test was skipped.

## Result

| Metric | Before | After | Change | Gate |
| --- | ---: | ---: | ---: | ---: |
| Lines | 79.08% (32,366 / 40,927) | 80.07% (32,771 / 40,927) | +0.99 points | 87% |
| Statements | 76.92% | 77.94% | +1.02 points | 87% |
| Branches | 66.06% (22,733 / 34,411) | 67.41% (23,199 / 34,411) | +1.35 points | 82% |
| Functions | 76.37% | 76.97% | +0.60 points | 50% |

The suite grew from 3,530 to 3,722 passing tests across 293 files, with the
same six pre-existing skips. The branch shortfall fell from 5,485 to 5,019
uncovered arms.

## Slices

Five slices, each committed on its own after its new file passed, with a
full-suite run between them.

| Slice | Module | Branches before | Branches after |
| --- | --- | ---: | ---: |
| Intent dispatcher | `app/media-timeline-coordination.js` | 500 | 389 |
| Setter family | `app/lunar-crater-actions.js` | 450 | 309 |
| Media marker lane | `app/timeline-dock-controller.js` | 386 | 303 |
| Panel launch strip | `app/experimental-dockview-host.js` | 378 | 284 |
| Main field of view | `app/camera-actions.js` | 160 | 131 |

Lines moved with them: the media coordinator 84.7% to 89.2%, lunar crater
actions 71.5% to 81.0%, the timeline dock 80.2% to 84.6%, the Dockview host
52.8% to 68.3% and the camera actions 76.9% to 83.5%.

## What The New Tests Pin Down

- **`media-timeline-coordination-intents`** — The panel intent boundary:
  every filter facet with its aliases and reset rules, selection and the
  adjacent-step clamp, the playback transport over an audio double, and the
  timeline scrub state machine driven through the real document event.
- **`lunar-crater-actions-setters`** — The six setters share one shape:
  guard on the scene, normalize, short-circuit when nothing changed, hide
  the hover, and rebuild the annotations only in the lunar frame. Every arm
  of that shape now runs, along with the annotation visibility switch and
  the label-scaling guards.
- **`timeline-dock-media-markers`** — Point and segment markers with their
  clipping and edge-preview rules, the visible-range filter, the signature
  dedup, and the pointer hit test that ranks overlapping markers.
- **`dockview-launch-strip`** — The responsive sync across all four
  disclosure levels: which controls stay inline, when short labels are
  spelled out, the stable overflow ordering, and how each proxy mirrors its
  header control. Pressing a proxy is covered across its three routes.
- **`camera-actions-main-fov`** — Which from-to pairs offer a main lens at
  all, the automatic fit that frames the target body, leaving automatic mode
  the moment the user drives the lens, clamping, the logarithmic slider
  scale, and the wheel remap.

## Contracts Recorded Along The Way

Four places behaved differently from what a caller might assume. None is a
defect; each is now pinned by a test so a change to it is deliberate.

- A raw manifest item declares its audience with `crewCaptured` or
  `external`. A `subjects` array on the raw item is dropped, because the
  normalizer only carries subjects that arrive through a metadata entry.
- The quick-filter aliases collapse to the five published values, so
  `external` and `space` both normalize to `all` while `crew`, `new`,
  `exterior` and `videos` survive. `new` further normalizes to `crew`.
- A lunar feature type filter entry is an object with an `enabled` flag.
  Passing a bare boolean is silently a no-op.
- Media marker selection leaves the timeline dock as a
  `mission-media-marker-select` document event. The `onMarkerSelect`
  callback serves event markers only.

## Where The Gates Stand

| Gate | Shortfall | Available outside `auxiliary-camera-views.js` |
| --- | ---: | ---: |
| 85% lines | 2,017 | 6,218 |
| 87% lines | 2,836 | 6,218 |
| 82% branches | 5,019 | 9,354 |

Both line gates remain reachable without touching the largest file. The
branch gate needs a little over half of every remaining branch outside it,
which is a longer campaign than the line gates but not a blocked one.

The branch-heavy list, which is where the next slices should come from:

| Module | Uncovered branches | Uncovered lines |
| --- | ---: | ---: |
| `app/auxiliary-camera-views.js` | 1,858 | 1,938 |
| `app/media-browser-panel.js` | 848 | 576 |
| `app/ground-track-panel.js` | 465 | 370 |
| `app/media-timeline-coordination.js` | 389 | 200 |
| `app/background-media-panel.js` | 366 | 210 |
| `app/lunar-crater-actions.js` | 309 | 253 |
| `app/timeline-dock-controller.js` | 303 | 159 |
| `app/experimental-dockview-host.js` | 284 | 305 |
| `ui/lunar-crater-control-panel.js` | 233 | 97 |
| `app/orbit-overlap-manager.js` | 195 | 223 |

`orbit-overlap-manager.js` should not be worked. It sits behind
`ORBIT_OVERLAP_REFINEMENT_ENABLED`, which is permanently off; it needs a
disposition, not tests. The same applies to its four companion kill
switches recorded in the previous pass.

## Verification

- `npm run test:unit -- --coverage`: 3,722 passed, six skipped, 293 files.
- Full suite re-run between slices; no cross-file regression appeared.
- All new test files verified to use LF line endings before commit.
- No threshold, coverage exclusion, test skip, runtime asset, mission
  config, data-repository file or deployment state was changed.
