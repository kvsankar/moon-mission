# Unit Coverage Reconciliation — 2026-09-18

## Current Baseline

The first current-`master` coverage run passed 1,976 tests with six skipped and
failed only the unchanged global thresholds:

| Metric | Before first slice | Gate |
| --- | ---: | ---: |
| Lines | 55.01% (22,515 / 40,928) | 87% |
| Statements | 53.79% (23,643 / 43,953) | 87% |
| Branches | 50.02% (17,214 / 34,413) | 82% |
| Functions | 58.12% (3,772 / 6,489) | 50% |

This supersedes the 2026-09-16 measurement for current planning. The earlier
Vitest 3 and Vitest 4 percentages remain point-in-time migration evidence and
are not treated as like-for-like execution measurements.

## Slice 1: Frame And Shoot Flyby Event Resolution

The first bounded slice extracted Frame and Shoot flyby-event interpretation
from the 11,000-line auxiliary camera manager into the pure domain module
`src/platform/js/core/domain/composer-flyby-events.js`.

Behavioral contracts now cover:

- closest-approach priority over broader flyby narratives;
- non-burn and earliest-event tie breaking;
- explicit, tokenized and narrative lunar-flyby metadata;
- canonical event-pill identity and display order;
- invalid, absent and unmatched events;
- SOI boundary key, label and narrative variants; and
- missing or reversed SOI windows.

The TDD red run failed because the planner resolver was not independently
available. After extraction, all 94 auxiliary-camera tests pass. Focused module
coverage is 99.09% lines, 99.09% statements, 91.60% branches and 100% functions.

Review checked that compact-key matching remains behaviorally equivalent to the
previous inline implementation, that the manager still consumes the same three
resolver results, and that no rendering, timeline, mission configuration or
deployment behavior changed.

## Repository Result After Slice 1

The full coverage run passed 1,984 tests with six skipped and again failed only
the unchanged global thresholds:

| Metric | After slice 1 | Change |
| --- | ---: | ---: |
| Lines | 55.17% (22,581 / 40,927) | +0.16 points |
| Statements | 53.94% (23,710 / 43,951) | +0.15 points |
| Branches | 50.25% (17,294 / 34,413) | +0.23 points |
| Functions | 58.21% (3,777 / 6,488) | +0.09 points |

Verification:

- focused red/green flyby and SOI tests;
- 94/94 auxiliary-camera tests;
- 1,984 unit tests passed, six skipped;
- production build passed with existing classic-script, Three.js
  `sRGBEncoding` and chunk-size warnings; and
- `git diff --check` passed.

No threshold, coverage exclusion, test skip, runtime asset, mission config,
data-repository file or deployment state was changed.

