# View Settings Pill Ownership

Status: UI owner split complete (2026-09-23)

## Problem and boundary

`ui/view-settings-pill-controller.js` is 1,282 physical lines. One controller
owns quick origin/dimension/toggle pills, Moon Render resource/profile controls,
and three annotation popovers with separate positioning and event lifetimes.
Those surfaces change for different reasons and are already distinct in the
contributor control map.

Keep `createViewSettingsPillController` and its returned public operations.
The parent coordinates shared view-setting commits. Extract concrete UI owners
for Moon Render and annotation panels with explicit DOM/callback inputs; no
new global authority or duplicate setting state is introduced.

## Proposed owners

| Owner | Responsibility |
| --- | --- |
| `view-settings-moon-render-panel.js` | Moon Render panel host/portal position, resource tier and pipeline synchronization, and its event bindings. |
| `view-settings-annotation-panels.js` | Lunar grid, guides, surface-point and lunar-feature popover geometry, synchronization and event bindings. |
| `view-settings-pill-controller.js` | Shared origin/dimension/toggle intent, pill visibility, and composition of the two panel owners. |

The new owners receive narrow effect/setting callbacks and their DOM/window
references. They return the operations required by the parent binder and
public facade. Avoid moving the old closure into a new file with a broad
`deps` bag as the only change.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `view-settings-pill-controller.js` | 1,282 | 897 | Under 800 |

Count the parent and both owners. The largest must be at most 897 physical
lines; the new boundary must also remove unrelated panel lifetime work from
the shared pill controller.

## Verification

- `test/view-settings-pill-controller.test.js` for both control surfaces,
  Moon Render, annotation panels and mobile behavior.
- Focused lunar-crater and settings tests, followed by the full unit suite and
  source-structure/import-cycle check.
- Browser design/progressive checks when panel geometry or interaction changes.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `view-settings-pill-controller.js` | 754 |
| `view-settings-annotation-panels.js` | 367 |
| `view-settings-moon-render-panel.js` | 263 |

The largest piece is 754 lines, 41.2% smaller than the original 1,282 and
below the committed 897-line maximum. Moon Render now owns its portal home,
active trigger, pipeline controls and listener bindings. Annotation popovers
own their geometry, synchronization and event bindings through explicit parent
callbacks. The shared controller retains the quick-control intent and public
operations.

Verification: 103 focused settings/lunar-control tests and the 735-file
source-structure/import-cycle check passed. A real Artemis II browser case
kept the lunar-feature popover above Dockview, and a direct browser smoke check
opened the Moon Render panel with visible, in-viewport geometry. The completed
refactor record names this plan and all three resulting files.

Remaining debt: the parent still coordinates a broad set of view toggles and
relies on some shared callback contracts. This slice does not change camera or
mission-state ownership.
