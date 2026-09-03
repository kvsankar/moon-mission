# Test Strategy (UI + Visual Regression)

This repository uses Vitest + Playwright with four complementary suites.

## Goals

- Catch user-visible regressions early (UI behavior and rendering).
- Keep screenshot comparisons reproducible enough for baseline workflows.
- Separate visual checks, smoke checks, and ephemeris accuracy checks.

## Test Suites

- **UI + visual regression** (`test/ui.test.js`)
  - Primary CH3 end-to-end coverage (Earth/Moon, 2D/3D, camera/view interactions, full-run snapshots).
  - Uses SSIM-based image comparisons against tracked baselines.
  - Writes latest SSIM scores and reports SSIM drift against committed history.

- **Cross-mission smoke** (`test/mission-smoke.test.js`)
  - Functional smoke checks for non-CH3 missions (`a10`, `a11`, `cy2`) across origin/dimension combinations.
  - Includes the "Mission Compare Smoke Tests" block covering dual craft/orbit rendering across 2D/3D and interleaved comparison events.
  - Verifies load/runtime health and absence of console/page errors.
  - No screenshot baselines.

- **Compare-mode functional** (`test/compare-artemis-scaling.test.js`)
  - Exercises the compare-mode normalization pipeline against real Artemis 1 / Artemis 2 relative Chebyshev data in both orderings.
  - Asserts Moon/craft scaled positions stay anchored at `COMPARISON_REFERENCE_DISTANCE_KM` inside each mission's window and in the past-primary-end tail where only the secondary mission has live data.
  - Skips automatically when the generated Artemis Chebyshev files have not been staged locally from `moon-mission-data`.
  - See [Orbit Comparison Mode](../../specs/modes/orbit-comparison.md) for the feature contract.

- **Chebyshev accuracy** (`test/chebyshev-accuracy.test.js`)
  - Validates Chebyshev position accuracy against NPZ source data at interval samples.
  - Phase blocks are automatically skipped when required NPZ files are not present.

## Run Commands

Quick default visual run (managed server lifecycle):

```bash
make test
```

Notes:
- `make test` currently runs `test/ui.test.js` only (headless, port `8111`).
- `make test` starts and stops its own managed server on `8111`.
- It does not automatically run `mission-smoke` or `chebyshev-accuracy`.

Full local audit in PowerShell (recommended before larger merges):

```powershell
npm run configs:lint
npm run test:unit
node test/server-manager.js start
$env:HEADLESS = "true"
$env:VITE_TEST_BASE_URL = "http://localhost:8111"
npx vitest test/ui.test.js --run
npx vitest test/mission-smoke.test.js --run
npx vitest test/chebyshev-accuracy.test.js --run
node test/server-manager.js stop
Remove-Item Env:HEADLESS, Env:VITE_TEST_BASE_URL
```

Against a custom dev server:

```powershell
$env:HEADLESS = "true"
$env:VITE_TEST_BASE_URL = "http://localhost:7274"
npx vitest test/ui.test.js --run
Remove-Item Env:HEADLESS, Env:VITE_TEST_BASE_URL
```

## Visual Baselines and SSIM Files

- Tracked:
  - `test/screenshots/baseline/*.png`
  - `test/screenshots/ssim-history.json`
- Ignored runtime artifacts:
  - `test/screenshots/current/`
  - `test/screenshots/diff/`
  - `test/screenshots/analysis/`
  - `test/screenshots/ssim-latest.json`
  - `test/screenshots/ssim-diff-report.json`
  - `test/screenshots/ssim-diff-report.csv`

Regenerate baselines only for intentional visual changes:

```bash
make baseline
```

## Useful Env Flags

- `VITE_TEST_BASE_URL` - target app URL (`http://localhost:8111` default in tests).
- `HEADLESS=false` - run with visible browser for debugging.
- `SSIM_REGRESSION_STRICT=true` - fail UI suite on SSIM regression report.
- `UPDATE_SSIM_COMMITTED=true` - update `ssim-history.json` from current run (use intentionally).

Vitest discovery excludes nested `.tmp/**` scratch repos so temporary worktrees do not pollute app test runs.

## Conventions

- Screenshot IDs follow stable mode-first naming (for example `earth-3d-...`, `moon-2d-...`).
- Tests own test mechanics. Specifications own intended product behavior. When
  tests and specifications differ, determine whether the test, implementation,
  or requirement is wrong rather than updating intent automatically.
- Keep strategy docs concise; avoid duplicating per-test implementation details.

## Troubleshooting

- **Port conflicts**: `make test` expects to own port `8111`; if a previous local server is still around, stop it before rerunning.
- **Slow rendering/timeouts**: use headless mode for consistency; CI has built-in timeout scaling.
- **Unexpected visual diffs**: confirm intent first, then regenerate baseline/SSIM artifacts deliberately.
- **Mission/config boundary changes**: run `npm run test:unit` in addition to `make test`; unit tests catch config-window and scene-state boundary issues that the UI suite may not surface.
- **Mission config timing changes**: run `npm run configs:lint`; current CI requires explicit `time_scale` annotations and config/runtime sync.
