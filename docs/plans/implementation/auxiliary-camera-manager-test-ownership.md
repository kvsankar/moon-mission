# Auxiliary Camera Manager Test Ownership

Status: test ownership split complete (2026-09-23)

## Problem and boundary

`test/auxiliary-camera-manager.test.js` is 1,207 physical lines and tests two
different contracts: panel construction/lifecycle and camera geometry/lunar
analytics. Both use the same fake DOM and renderer setup, which currently sits
inside the test file.

Move the fake renderer and manager harness into `test/helpers/`, then place
camera geometry, lunar analytics and composer formatting assertions in a
separate test file. Keep lifecycle, persistence, render pass and disposal
assertions together. Avoid duplicate fixtures or assertion-only shuffling.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `auxiliary-camera-manager.test.js` | 1,207 | 844 | Under 700 |

## Verification

- Run both resulting test files together and compare their combined test count
  with the original 114 tests.
- Run the full unit suite and source-structure check.
- Preserve the real manager constructor and panel registry setup; the helper
  must not implement production behavior.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `auxiliary-camera-manager.test.js` | 613 |
| `auxiliary-camera-geometry.test.js` | 582 |
| `helpers/auxiliary-camera-manager-harness.js` | 50 |

The largest piece is 613 lines, 49.2% smaller than the original 1,207 and
below the committed 844-line maximum. Both suites share one fixture that
constructs the real manager with fake browser/renderer effects. Lifecycle,
persistence, disposal and render-pass assertions remain in the manager suite;
lunar analytics, camera geometry and composer formatting are together in the
geometry suite. The combined count remains 114 passing tests.

The completed refactor record names this plan and all three resulting files.
