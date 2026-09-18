# Lunar Mode And Sky Time Defect Investigation — 2026-09-18

The [Unit Coverage Expansion](unit-coverage-expansion-2026-09-18.md) recorded
three places where the code behaved differently from what the surrounding code
implied, and left them for disposition rather than changing product code. This
document records the investigation, the disposition of each, and the two fixes.

## 1. Lunar feature mode flags were not remembered per view — FIXED

### Intent

`lunarCraterShowAllEnabled` and `lunarCraterHoverEnabled` are the two Lunar
Features mode flags. Three independent pieces of the code state the intended
contract:

- `core/domain/lunar-crater-view.js` `normalizeLunarCraterViewState` checks
  `hasOwnProperty(value, "lunarCraterShowAllEnabled")` and honours an explicit
  value, deriving one from the display mode only when it is absent.
- `core/state/runtime-view-state.js` `applyViewFlagPatch` guards its derivation
  with `!hasOwnProperty(patch, "lunarCraterShowAllEnabled")`, i.e. "do not
  derive when the caller supplied an explicit value".
- `PER_VIEW_FLAG_KEYS` lists every other lunar feature key — `viewLunarCraters`,
  `lunarCraterHoverLabels`, `lunarCraterDisplayMode`, both diameter ranges, and
  all six `lunarFeature*` filter keys.

Commit `2c6a633` ("Add lunar feature search controls") introduced the two mode
flags. It added them to `VIEW_FLAG_KEYS` and to `buildDefaultViewFlags`, and it
added every other new key of that change to `PER_VIEW_FLAG_KEYS` — but not
these two.

### Why it was a defect, not a design choice

`setPerViewFlags` gates on `PER_VIEW_FLAG_KEYS` twice: `hasPerViewFlagPatch`
decides whether to apply the patch at all, and `applyViewFlagPatch`'s
`allowedKeys` decides which keys land. With the two mode keys missing:

- `runtimeViewState.setLunarCraterShowAllEnabled(value)` was a silent no-op.
  The runtime UI reaches this through `settings-actions.setView()` →
  `mission-state-port-builders.setViewFlags` → the state cells.
- `setCurrentViewIdentity(next, { previousViewFlags: readViewSettings() })`
  saves the outgoing view's flags. `readViewSettings()` always includes both
  mode keys, so their presence **suppressed the derivation** while the values
  themselves were **discarded**. The outgoing view kept a stale value and the
  guard's purpose was defeated in the one case it was written for.

That combination — suppress the fallback, then drop the explicit value — is not
a coherent design. It is an omission.

### Fix

`src/platform/js/core/state/runtime-view-state.js`: add
`"lunarCraterShowAllEnabled"` and `"lunarCraterHoverEnabled"` to
`PER_VIEW_FLAG_KEYS`.

Consequences, all consistent with the keys that were already per-view:

- the dedicated setters apply;
- each view identity remembers its own mode selection across origin,
  dimension, plane and camera changes;
- a view identity seen for the first time is seeded from the global defaults by
  `extractPerViewFlagPatch`, exactly as `viewLunarCraters` already was;
- the derivation still runs whenever a patch omits both mode keys.

Regression coverage: `test/runtime-view-state-lunar-modes.test.js`. The red run
before the fix failed on "applies the dedicated mode setters" and "remembers
each view's mode selection across a view switch", and passed the four tests
that describe behaviour the fix had to preserve.

## 2. Sky time millisecond control was overridden by the seconds control — FIXED

### Intent

`app/sky-actions.js` `readInitialSkyParameters` reads the same pair of controls
and states the precedence explicitly:

```js
const skyTimeMs = readOptionalNumeric("sky-time-ms") ??
    (Number.isFinite(skyTimeSeconds) ? skyTimeSeconds * 1000 : undefined);
```

The millisecond control wins; seconds is the fallback.

### Severity

`ui/ui-state.js` `readViewSettings` did the opposite: its `sky_time_seconds`
branch assigned unconditionally, and because `sky_time_ms` is iterated first,
the guard that reads as "keep the millisecond value" never decided the case.

This is **latent, not live**. No `sky-time-ms` or `sky-time-seconds` element
exists in `mission.html`, `sky-render-demo.html`, `moon-render-tuner.html` or
any other markup in the repository, so neither control is ever read today. It
was fixed because the two readers of the same control pair disagreed, which is
a trap for whoever adds those controls.

### Fix

`src/platform/js/ui/ui-state.js`: only derive `sky_time_ms` from the seconds
control when no millisecond value has been read. Coverage in
`test/ui-state.test.js`.

## 3. `roundPercentParts` negative first part — NOT A DEFECT, no change

`roundPercentParts` distributes a rounding residual and, if the parts sum above
100, corrects the remainder on the first entry, which can make it negative.

Both call sites — `app/auxiliary-camera-views.js` `computeCraftMoonVisibilityInfo`
and the equivalent in `core/domain/mobile-moon-visibility-state.js` — build the
parts as four counts that partition the visible sample set:

```js
const rawParts = [
    (nearDay * 100) / visibleCount,
    (nearNight * 100) / visibleCount,
    (farDay * 100) / visibleCount,
    (farNight * 100) / visibleCount,
];
```

Those four counts are incremented in one loop over the same samples, so they
are non-negative and sum to exactly `visibleCount`. The parts therefore always
sum to 100, `remaining` is never negative, and the correction branch is
unreachable. No product change was made.

The coverage-pass test that asserted the out-of-contract input was replaced
with one that pins the real contract: four whole, non-negative shares summing
to 100. Asserting the unreachable branch pinned arbitrary behaviour.

## Verification

- Red-then-green for both fixes; the red runs failed on exactly the predicted
  assertions.
- Full unit suite: **2,995 passed, six skipped, 276 files, zero failures**.
  The only test that failed on the first post-fix run was the coverage-pass
  test that had documented the defect; it now asserts the fixed contract.
- Coverage unchanged at 74.99% lines / 72.96% statements / 62.75% branches /
  71.25% functions.
- `npm run configs:lint` passes. `npm run lint` reports the same 458
  pre-existing TypeScript errors as the pre-change baseline at `ace629f`.
- `git diff --check` clean. The product diff is 11 added and 2 removed lines
  across two files, applied at byte level so the files' mixed CRLF/LF endings
  are untouched.
