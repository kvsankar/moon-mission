# Vitest 4 Migration — 2026-09-16

## Scope And Compatibility

Upgraded Vitest and its V8 coverage provider from 3.2.7 to exact 4.1.11,
including the matching mocker. This addresses the remaining
[mocker advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
Local Node 22.15.0 and unchanged Vite 7.3.6 satisfy the package engines/peers.
All dependency graph changes are development-only. Runtime dependencies,
Playwright/core and browser binaries are unchanged.

Following the [v4 migration guide](https://v4.vitest.dev/guide/migration):

- Replaced removed `poolOptions.forks.singleFork` with one worker, disabled
  file parallelism and explicit `isolate: true`. The v3 runner reset modules
  and mocks between files even in its shared fork; no cross-file browser state
  is an intended test contract. Isolation is not disabled to gain speed.
- Removed obsolete `coverage.all: false`. Leaving `coverage.include` unset
  retains loaded-files-only coverage. Exclusions and thresholds are unchanged:
  lines 87%, branches 82%, functions 50%, statements 87%.
- Replaced the removed `basic` reporter with `default` in four legacy scripts.
- Converted six constructor mock implementations from arrow functions to
  ordinary functions across three test files. Return values and assertions are
  unchanged. No production code, test skips, screenshot baselines, SSIM score
  history or thresholds were edited.

The initial v4 run exposed seven failures and five unhandled errors from the
audio/HLS constructor fixtures. A complete rerun after the fixes passes.

## Reproducible Installation

Both installed npm 11.4.2 and bundled npm 10.9.2 crashed in Arborist's peer
resolver (`edgesOut`) while resolving the major upgrade. Temporary npm 11.19.1
successfully resolved it, with normal peer checks and no force/legacy-peer flags:

```powershell
npm exec --yes --package=npm@11.19.1 -- npm install --package-lock-only --ignore-scripts
npm exec --yes --package=npm@11.19.1 -- npm install
npm.cmd ci
```

The final clean `npm ci` succeeded using the existing npm 11.4.2, including
normal install scripts. No global tools or CI configuration were changed.
Unrelated lockfile line-ending churn was removed with parsed-JSON equality
checks. Semantic comparison confirms runtime package versions are unchanged.

## Verification

- Full v4 unit suite: **1,629 passed, six skipped, 219 files**.
- `npm run configs:lint`: **40 artifacts**, sync and time-scale lint passed.
- `npm run build`: passed, including generated mission pages and Moon worker.
  Existing classic-script, Three.js `sRGBEncoding` and chunk-size warnings remain.
- Final `npm audit --json`: **zero vulnerabilities**, including development
  dependencies. This result does not cover separate vendored/CDN code.

### Browser Workflows

The six-suite initial browser run passed 15/17 tests. Recovery (three), Swiper
(three, including the authored CDN import), design/pixel checks (three) and
Artemis II mobile (one) passed. Two checks failed:

- The Earth/Moon roundtrip retained-scene identity assertion failed during a
  cold run. Vite logged several newly optimized dependencies and page reloads.
  All four transition tests then passed unchanged on the warm-server rerun.
- The progressive workspace suite intermittently timed out at its existing
  30-second wait for eight panels: the reload test on the initial run, then
  the disclosure test on the warm rerun. The latter rerun passed 6/7 tests
  across the two affected suites. A separate read-only browser probe reached
  all eight panels with no reported browser errors. Root cause is not established.

An isolated progressive-suite rerun passed all three tests unchanged. Across
the original run and explicit reruns, all 17 selected checks have passed, but
this does not establish stable combined-suite startup.
No browser assertion, timeout, retry setting or baseline was changed. Cold
optimizer readiness and intermittent panel startup remain harness follow-ups;
the combined initial browser command is not described as green.

## Full Coverage Comparison

The pre-upgrade run used the original v3 configuration, before any package or
configuration changes. Both full coverage runs passed 1,629 tests, with six
skips in 219 files, but exited nonzero on the existing coverage thresholds.
Neither run used threshold overrides.

| Metric | v3 covered / total | v3 percent | v4 covered / total | v4 percent | Gate |
| --- | --- | --- | --- | --- | --- |
| Lines | 59,990 / 94,873 | 63.23% | 20,478 / 39,878 | 51.35% | 87% |
| Statements | 59,990 / 94,873 | 63.23% | 21,274 / 42,471 | 50.09% | 87% |
| Branches | 10,117 / 15,118 | 66.92% | 15,814 / 33,397 | 47.35% | 82% |
| Functions | 2,795 / 4,242 | 65.88% | 3,425 / 6,250 | 54.80% | 50% |

Normalized path-set comparison found 315 files under v3 and 314 under v4:
only `vite.config.js` disappears; all covered application files remain, and no
files are added. The old Vite-config entry had 206 lines/statements, 29 branches
and ten functions, so its omission alone does not explain the metric change.
The v4 AST remapper changes executable statement/line, branch and function
accounting; these percentages are not a like-for-like execution regression
measurement. Application code and assertions are unchanged, but the lower
reported percentages and outstanding gate are not hidden or treated as green.

Reproduction (use `npm.cmd` in PowerShell to preserve forwarded arguments):

```powershell
npm.cmd run test:unit -- --reporter=dot
npm.cmd run test:unit:coverage -- --reporter=dot --coverage.reportsDirectory=.tmp/vitest4-coverage
```

Local comparison artifacts are under ignored `.tmp/vitest3-coverage/` and
`.tmp/vitest4-coverage/`. The v3 baseline must be rerun on the pre-migration
commit if reproducing it from a fresh checkout. The roadmap owns coverage
reconciliation; thresholds, exclusions and CI gates were not loosened.

## Review And Remaining Work

Independent manifest/configuration/semantic-lock review found no actionable
issues. It verified unchanged runtime versions, explicit isolation, coverage
scope and thresholds, and independently confirmed the pre-upgrade coverage
gate was already failing. Final review also checked the constructor fixtures
and verified every coverage total and the normalized file-set comparison.

The [single roadmap](../../plans/roadmap.md) retains the unit coverage gap and
legacy SSIM disposition. The full historical SSIM suite is not claimed green
by this migration. RTA-06 camera-state ownership is the next implementation
priority; detailed human UX review remains deferred.

No deployment was performed. Production changes, including the previously
updated Swiper, still require the user's explicit deployment authorization.
