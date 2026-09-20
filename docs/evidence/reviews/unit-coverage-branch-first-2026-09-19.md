# Unit Coverage, Branch-First Pass — 2026-09-19 / 2026-09-20

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

Test-only. No product code was changed. Thresholds, coverage exclusions,
the loaded-files-only scope, mission configuration, runtime assets and
data-repository files are unchanged, and no test was skipped.

One shared test helper gained methods: `test/helpers/fake-dom.js` now
implements `setPointerCapture`, `releasePointerCapture` and
`hasPointerCapture`, which drag code calls unguarded to route a gesture to
one element for its whole duration. That is test-support code, not product
code.

## Result

| Metric | Before | After | Change | Gate |
| --- | ---: | ---: | ---: | ---: |
| Lines | 79.08% (32,366 / 40,927) | 80.66% (33,014 / 40,927) | +1.58 points | 87% |
| Statements | 76.92% | 78.55% | +1.63 points | 87% |
| Branches | 66.06% (22,733 / 34,411) | 68.32% (23,510 / 34,411) | +2.26 points | 82% |
| Functions | 76.37% | 77.52% | +1.15 points | 50% |

The suite grew from 3,530 to 3,820 passing tests across 297 files, with the
same six pre-existing skips. The branch shortfall fell from 5,485 to 4,708
uncovered arms.

## Slices

Nine slices, each committed on its own after its new file passed, with a
full-suite run between them.

| Slice | Module | Branches before | Branches after |
| --- | --- | ---: | ---: |
| Intent dispatcher | `app/media-timeline-coordination.js` | 500 | 389 |
| Setter family | `app/lunar-crater-actions.js` | 450 | 309 |
| Media marker lane | `app/timeline-dock-controller.js` | 386 | 303 |
| Panel launch strip | `app/experimental-dockview-host.js` | 378 | 284 |
| Main field of view | `app/camera-actions.js` | 160 | 131 |
| Thumbnail strip geometry | `app/media-browser-panel.js` | 848 | 681 |
| Panel frame and popover | `app/media-browser-panel.js` | 681 | 586 |
| Telemetry and persistence | `app/ground-track-panel.js` | 465 | 420 |
| Search results list | `ui/lunar-crater-control-panel.js` | 233 | 230 |

Lines moved with them: the media coordinator 84.7% to 89.2%, lunar crater
actions 71.5% to 81.0%, the timeline dock 80.2% to 84.6%, the Dockview host
52.8% to 68.3%, the camera actions 76.9% to 83.5%, the media browser panel
71.6% to 82.0% and the splashdown panel 73.6% to 75.6%.

The crater control panel slice is the one to read carefully. It moved 233
uncovered branches to 230 while adding seventeen tests. That module was
already at 92% lines, and its remaining arms are spread thinly across
generated type-filter rows rather than gathered in one place. It is the
first slice in this campaign where branch-first selection stopped paying,
and the signal that this module should drop down the list.

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
- **`media-browser-thumbnail-strip`** — Moving the strip to any of the four
  edges by key or by drag, the drop-zone highlight, keyboard resizing with
  its per-placement arrow reversal and page and limit keys, pointer resizing
  in all four orientations, and the collapse bar that restores on a press.
- **`media-browser-panel-geometry`** — The default frame and its viewport
  clamping, header dragging with its edge limits and the handover from
  managed to manual layout, layout persistence and restore across mounts,
  maximize and restore, and the thumbnail hover popover.
- **`ground-track-panel-telemetry`** — How the Earth-centred position and
  velocity resolve in each frame, the precedence that prefers published
  scene telemetry over a recomputed magnitude, the imperial conversions, the
  hemisphere labels, and layout persistence for both maximized and
  restored-down panels.
- **`lunar-crater-search-results`** — The results list the search scope
  renders, its empty and no-match states, the match-count header, the row
  contents, and the exclusion round trip.

## Contracts Recorded Along The Way

Seven places behaved differently from what a caller might assume. None is a
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
- The lunar feature control panel keeps a typed search query only on its
  search scope. Every other scope substitutes its own query, so the results
  list stays empty there.
- Lunar feature search results are ordered by descending diameter, so a
  prominent crater leads its satellite features.
- The splashdown panel opens maximized on a first mount with no stored
  layout, so it has to be restored down before it has a frame of its own to
  remember.

## Where The Gates Stand

| Gate | Shortfall | Available outside `auxiliary-camera-views.js` |
| --- | ---: | ---: |
| 85% lines | 1,774 | 5,975 |
| 87% lines | 2,593 | 5,975 |
| 82% branches | 4,708 | 9,043 |

Both line gates remain reachable without touching the largest file. The
branch gate needs a little over half of every remaining branch outside it,
which is a longer campaign than the line gates but not a blocked one.

The branch-heavy list, which is where the next slices should come from:

| Module | Uncovered branches |
| --- | ---: |
| `app/auxiliary-camera-views.js` | 1,858 |
| `app/media-browser-panel.js` | 586 |
| `app/ground-track-panel.js` | 420 |
| `app/media-timeline-coordination.js` | 389 |
| `app/background-media-panel.js` | 366 |
| `app/lunar-crater-actions.js` | 309 |
| `app/timeline-dock-controller.js` | 303 |
| `app/experimental-dockview-host.js` | 284 |
| `ui/lunar-crater-control-panel.js` | 230 |
| `app/orbit-overlap-manager.js` | 195 |

`orbit-overlap-manager.js` should not be worked. It sits behind
`ORBIT_OVERLAP_REFINEMENT_ENABLED`, which is permanently off; it needs a
disposition, not tests. The same applies to its four companion kill
switches recorded in the previous pass.

`ui/lunar-crater-control-panel.js` should drop below the others despite its
branch count, for the reason given under Slices.

## Verification

- `npm run test:unit -- --coverage`: 3,820 passed, six skipped, 297 files.
- Full suite re-run between slices; no cross-file regression appeared,
  including after the DOM double gained pointer capture.
- All new test files verified to use LF line endings before commit.
- No threshold, coverage exclusion, test skip, runtime asset, mission
  config, data-repository file or deployment state was changed.
