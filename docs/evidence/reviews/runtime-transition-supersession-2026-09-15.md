# Runtime Transition Supersession Fixes — 2026-09-15

## Outcome And Scope

Following the user's request to continue, implemented the first bounded
remediation from the [transition audit](runtime-transition-audit-2026-09-15.md):
RTA-01 (stale origin/readiness publication) and RTA-02 (stale dimensional
presentation). Initializer ownership and asynchronous SVG writes were included
because guarding only the final callback would leave the same defect upstream.

No camera-orientation policy, load-failure/retry workflow, landing-data readiness,
SSIM baseline or dependency version was changed in this slice. Prior dirty
UI/SSIM changes were preserved. Nothing was staged, committed, pushed or deployed.

## Implementation

- Runtime view state owns a monotonic origin/dimension revision. No-op setters
  leave it unchanged; changing away and back advances it. The existing readonly
  state-cell/port path forwards this signal to loading, plane actions and init.
- Orbit requests capture origin, scene, revision, dimension, URLs and source
  policy before yielding. Per-origin request identity prevents older requests
  overwriting newer cache data. Removed/replaced scenes lose cache authority.
- An inactive request may finish its own valid cache, but not change active UI,
  progress, readiness, geometry or callbacks. Warm activation replays cached
  provenance and cached/pending authored style metadata.
- Processing carries `{config, isCurrent}` through existing wrapper boundaries
  into SVG construction. Each async SVG boundary checks the original scene and
  SVG selection as well as request validity. Explicit cancellation propagates
  back through processing to the loader instead of becoming successful readiness.
- Plane callbacks validate request order, revision, scene, origin, dimension
  and selected plane. Unchanged no-op selection does not cancel useful pending work.
- Runtime initialization validates its owner at each yield. A local initializer
  token covers same-view restarts, including warm early returns; the parent
  startup predicate covers cancellation before another init call begins.
- Orchestration rechecks its existing run ID after config/init awaits and before
  error publication or final rendering/animation-loop startup.

Contract: [Asynchronous Transition Ownership](../../specs/runtime/architecture-boundaries.md#asynchronous-transition-ownership).

## Test-First And Review Evidence

Before implementation:

- Loader/processor regressions: seven failed, including origin ABA, scene
  replacement, old cache overwrite, warm processing and obsolete failure UI.
- Plane action regressions: nine failed, three passed.
- SVG yield-boundary regressions: 34 failed, eight passed.
- Initializer/orchestration regressions: 13 failed, nine passed.

Independent review identified and cleared three follow-ons:

1. Propagate a cancelled SVG build's `false` result so it cannot publish readiness.
2. Reapply cached/pending authored style metadata and provenance on warm activation.
3. Reject same-origin/same-dimension initializer re-entry as well as changed-origin work.

Each correction has regression coverage. The reviewer's original initializer
probe now reports only the new run initiating a loader, not new then obsolete.
Final review: no remaining actionable finding within RTA-01/02's targeted scope.

## Verification

- `npm run test:transitions:unit`: **150 passed in 17 files** on the final guards.
- Final full unit suite: **1,581 passed, six skipped in 213 files**.
- Final browser rerun: **five passed** (four normal CY3 transition scenarios
  plus Artemis II mobile mounted-camera/tab preservation), 117 seconds.
- The audit script now passes RTA-01 and RTA-02. It still deliberately exits 1
  for the unmodified RTA-03 camera-up contract; this is not a failure of the
  normal unit gate.
- `npm run configs:lint`: all 40 artifacts and time-scale annotations passed.
- `git diff --check` and local links in the changed documentation passed.
- Local server returned HTTP 200 for `/chandrayaan3/`; dependencies were installed.
- `npm install` reported 18 dependency advisories (five moderate, ten high,
  three critical). No audit fixes were applied; these reports need separate
  dependency triage. The lockfile's incidental line-ending change was restored.

The complete old SSIM suite was not rerun or rebaselined for this slice. Its
previous rendering/fixture discrepancies remain separately tracked. The new
controlled-promise tests prove specific interleavings; they do not constitute
exhaustive browser network-fault coverage across every mission.

## Next Work

At this checkpoint, RTA-03 camera orientation, RTA-04 terminal load
failure/retry, RTA-05 landing dependency readiness and RTA-06 DOM-owned camera
semantics remained open. They were subsequently completed, as was the legacy
SSIM disposition; see the
[current context checkpoint](../handoffs/current-context-2026-09-18.md).
The [paired plan](../../plans/implementation/runtime-transition-audit-and-tests.md)
preserves the completed coverage migration.
Detailed human UX review remains deferred as requested.
