# Runtime Recovery, Landing Readiness And Camera Reset — 2026-09-15

## Outcome

The single [roadmap](../../plans/roadmap.md) was updated first as requested,
then the reviewed prior work was checkpointed in `5e5edd0`. This delivery
implements the next concrete findings: RTA-04 load recovery, RTA-05 landing
readiness, and RTA-03 Free-camera orientation. Dependency advisories were
triaged separately; no package version was changed.

## RTA-04 — Explicit Outcomes And Retry

- Orbit loading returns ready, failed or superseded. Runtime initialization
  awaits that outcome on cold and warm paths; success-only readiness polling
  is removed.
- Failure produces a non-busy error card with keyboard-accessible Retry,
  positioned above playback. Retry leaves origin navigation usable and
  starts a new owned attempt without duplicating the animation loop.
- Failed configuration is not cached as success. Required-config failure
  reaches the recovery UI, while Dockview observes the first successful config
  (including its profile) without initiating automatic network retries.
- Warm 2D recovery creates a fresh SVG before processing. Old retries, errors
  and overlay timers cannot overwrite a newer startup.
- Internal supersession transfers startup to the latest view once. Repeated
  interruption becomes retryable instead of leaving an orphaned spinner or
  creating an unbounded retry loop.

Test-first: five new failures in the initial recovery/loader group; three
additional configuration failures before the config adjunct. Independent
review identified and cleared warm-SVG reuse, sticky failed config and orphaned
overlay ownership after internal supersession.

## RTA-05 — Scene-Owned Landing Geometry

- Landing requests share a mission/origin/source cache. Successful origins
  remain cached while failed ones can retry; inactive completions do not mutate
  the active scene.
- Late data creates descent geometry for the matching live scene. Cold and
  warm paths share the same landing-only creation method.
- Repeated identical data does not duplicate geometry. Changed data replaces
  and disposes only the landing line, without rebuilding main orbits or
  changing camera/container state.
- Scene/generation/source checks prevent disposed scenes and obsolete source
  completions from overriding newer geometry or aggregate readiness.

Test-first: seven loader failures; review additionally reproduced source-change
geometry and aggregate-publication gaps. Both were corrected and re-reviewed.

## RTA-03 — Canonical Plane Orientation

Ordinary Free reset preserves the canonical up vector from the production
camera-pose planner. Pose-preserving follow release keeps its separate existing
orientation behavior. Fourteen new cases cover seven plane presets across
Earth/Moon origins and both action orders with a real Three.js camera.

Test-first: ten failed and twelve passed before the change. Independent review
cleared the final fix. Focused commit: `5020625`.

## Verification

- Full unit suite: **1,620 passed, six skipped, 216 files**.
- Focused transition/readiness suite: **187 passed, 20 files**.
- Browser recovery: **three passed**, including actual HTTP 503 failure,
  keyboard Retry, origin change during a held Retry, suppression of the late
  old-origin failure, and config failure/retry honoring Dockview-off policy.
- Normal browser transitions/mobile: **five passed** after the changes.
- Opt-in audit reproductions: **all three pass**, exit 0.
- Visual review: error card and Retry are legible and clear of playback;
  screenshot in ignored `test/screenshots/current/load-recovery/orbit-error.png`.
- No SSIM baselines or committed similarity history were changed. The broader
  historical SSIM disposition remains separate, not claimed green here.
- Independent final code review reported no remaining actionable finding in
  these three bounded fixes. Links, syntax and diff hygiene were checked.

## Follow-Up

[Dependency triage](dependency-triage-2026-09-15.md) distinguishes static runtime
exposure from development tooling and identifies a coordinated npm/CDN Swiper
upgrade. Same-major toolchain remediation is the next bounded security slice.
RTA-06 camera state ownership and wider transition/SSIM coverage remained open
at this checkpoint and were subsequently completed. See the
[current context checkpoint](../handoffs/current-context-2026-09-18.md).
The detailed human UX review remains deferred until other roadmap work is done.
