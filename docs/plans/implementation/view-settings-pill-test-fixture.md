# View Settings Pill Test Fixture Ownership

Status: fixture split complete (2026-09-23)

## Problem and boundary

`test/view-settings-pill-controller.test.js` is 1,038 physical lines. Its
first half implements a fake DOM and control harness; the second half asserts
origin, dimension, Moon Render, annotation and mobile behavior. Fixture setup
and behavior tests change for different reasons, especially after the UI
owner split.

Move the fake element/class-list model and harness construction to
`test/helpers/view-settings-pill-harness.js`. Keep the behavior cases in the
test file and preserve their public harness fields. Do not duplicate the
controller logic inside the fixture.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `view-settings-pill-controller.test.js` | 1,038 | 726 | Under 600 |

## Verification

- Run `test/view-settings-pill-controller.test.js` before and after.
- Run the full unit suite and source-structure check; no product behavior or
  test assertions should change.
- Record final counts and remaining fixture debt.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `test/helpers/view-settings-pill-harness.js` | 552 |
| `test/view-settings-pill-controller.test.js` | 488 |

The largest piece is 552 lines, 46.8% smaller than the original 1,038 and
below the committed 726-line maximum. The behavior cases remain together;
the helper owns only fake elements, control wiring and fixture construction.
All 15 focused tests passed without assertion changes. The completed refactor
record names this plan and both resulting files.
