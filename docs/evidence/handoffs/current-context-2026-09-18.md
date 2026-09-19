# Current Work Context Checkpoint — 2026-09-18

This is a resumable context record, not a second roadmap. Priority remains
owned only by [Moon Mission Roadmap](../../plans/roadmap.md).

## Repository State At Checkpoint Start

- Repository: `C:\sankar\code\kvsankar\moon-mission`
- Branch: `master`
- Latest implementation/test commit: `d8a0d18` (`Focus CY3 visual regression gate`)
- `master` and `origin/master` were synchronized and the worktree was clean
  before this documentation-consistency pass.
- The documentation commit containing this checkpoint must be present on
  `origin/master`; verify the remote before resuming implementation.
- No deployment has been performed or authorized.
- No `moon-mission-data` files, generated ephemeris artifacts, mission configs,
  production infrastructure or runtime assets are part of this pass.

Standing user requirements:

- Commit and push every completed slice.
- Do not deploy until the user explicitly authorizes deployment.
- Keep `docs/plans/roadmap.md` as the single mutable repository-wide queue.
- Use TDD and review before closing implementation defects.
- Preserve scene and playback priority as screen real estate shrinks.
- Keep detailed human UX review deferred until the preceding roadmap work is
  complete.

## Completed Campaigns

The runtime state audit campaign is complete. The authoritative delivery table
is in
[Runtime Architecture Follow-Ups](../../plans/implementation/runtime-architecture-followups.md),
and per-slice evidence is in
[Runtime State Remediation](../reviews/runtime-state-remediation-2026-09-16.md).

Post-interruption completion commits:

| Commit | Outcome |
| --- | --- |
| `26cbeff` | SA-21 Dockview startup, focus and workspace lifetime |
| `ee23152` | SA-12 Reset View selection ownership |
| `121be92` | SA-11 explicit constrained-layout edit persistence |
| `5eb2ae2` | SA-14 detached composer owner-window lifecycle |
| `22c3bee` | SA-20 detached registry snapshots |
| `1fb1c79` | SA-16 active-origin-only scene mirrors |
| `1bac717` | SA-19 model/catalog lifetimes and disabled refinement disposition |
| `a7a9510` | SA-22 live mobile/desktop capability activation |
| `e8484b7` | Executable mapping of all 86 historical CY3 SSIM baselines |
| `d8a0d18` | Focused nine-frame CY3 visual gate and legacy score-gate retirement |

The historical SSIM suite is dispositioned as nine retained direct-threshold
visual checks, 76 semantic replacements and one exact duplicate retired. The
Dockview-disabled SSIM profile remains CY3-only. Obsolete PNGs and
`ssim-history.json` are removed; ignored `ssim-latest.json` is diagnostic only.

Latest verification before this docs pass:

- unit suite: **1,976 passed, six skipped, 247 files**;
- CY3 visual gate: **nine passed**, with 44 legacy test definitions skipped;
- transition browser suite: **eight passed** after the plane-control addition;
- disposition guard: all 86 historical entries uniquely classified and only
  nine reviewed baseline PNGs tracked.

## Active Roadmap Work

### 1. Full unit coverage disposition

This is the next implementation priority. Vitest 4 coverage remains below the
unchanged line, statement and branch thresholds. After three test-only
expansions the gate reports:

| Metric | Reported | Gate |
| --- | ---: | ---: |
| Lines | 80.07% | 87% |
| Statements | 77.94% | 87% |
| Branches | 67.41% | 82% |
| Functions | 76.97% | 50% |

3,722 tests pass across 293 files with the same six pre-existing skips.

See [Unit Coverage Expansion](../reviews/unit-coverage-expansion-2026-09-18.md)
for the harness and the first pass,
[Round Two](../reviews/unit-coverage-expansion-round-two-2026-09-18.md) for the
second pass and the kill switches found, and
[Branch-First Pass](../reviews/unit-coverage-branch-first-2026-09-19.md) for the
third, which also records where each gate now stands. Branches remain the gate
furthest from target, so keep choosing slices by uncovered branch count rather
than by file size.

Run a fresh report on current `master` before choosing modules. Preserve the
loaded-files-only scope, exclusions and thresholds. Add behavior-driven tests;
do not lower gates, exclude active code or add assertions solely to execute
lines. The v3/v4 percentages are not directly comparable because AST remapping
changed denominators. See
[Vitest 4 Migration](../reviews/vitest4-migration-2026-09-16.md).

### 2. Combined browser startup diagnostics

Two observations remain unclosed:

- a cold Vite optimizer reload once invalidated a retained transition-scene
  handle; and
- progressive-workspace combined runs intermittently timed out waiting for
  eight panels, while isolated reruns passed.

The focused CY3 visual gate now waits for DOM/application readiness rather than
`networkidle`, but that does not prove the combined transition/progressive
issue is closed. Reproduce and diagnose without retries, weakened assertions or
arbitrary timeout increases.

### 3. Frozen recovery-baseline review

The immutable recovery roadmap still requires item-by-item disposition into the
single mutable roadmap, specifications, retained evidence, superseded findings
or explicit rejection. Do not copy its inventory wholesale.

## Deferred And Non-Blocking Work

- The current CY3 landing close-up showed severe displaced-terrain/framing
  artifacts during SSIM disposition. It was not rebaselined. Landing geometry,
  readiness and visibility remain semantically covered. Diagnose during or
  immediately before the deferred human UX review.
- `test/ui.test.js` still contains 44 skipped legacy test bodies. Pruning them is
  code hygiene, not a visual-gate blocker.
- Four natural full-mission visual runs dominate gate duration. They may be
  replaced by a deterministic terminal-state fixture only if the same final
  rendering concerns remain protected.
- Detailed human UX review remains explicitly deferred until the preceding
  roadmap items are complete.

## Safe Resume Checks

1. Read the single roadmap and this checkpoint.
2. Verify `git status --short --branch` and `git log -3 --oneline --decorate`.
3. Read `docs/operations/contributor/developer.md` before runtime/browser work.
4. Use `npm.cmd run test:unit:coverage -- --reporter=dot` for the fresh coverage
   baseline; keep generated coverage under ignored output directories.
5. Commit and push a verified bounded slice. Do not deploy.
