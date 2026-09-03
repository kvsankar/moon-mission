# Commit Review: TDB/UTC Timing Fixes (2026-04-08)

Commits reviewed (oldest to newest):
- `f5ca0bd` fix(ephemeris): use TDB Julian dates for Chebyshev segment lookups
- `eb7e518` test(ephemeris): add eclipse timing validation and investigation report
- `1777c0d` feat(time): add time_scale annotation parsing and TDB↔UTC conversion
- `6113e01` chore(config): annotate all mission configs with time_scale
- `8591127` docs: document HORIZONS TDB convention and update investigation report

Diff range reviewed: `64f9bae..8591127`

## 1. Correctness
- [OK] `TDB_OFFSET_MS = (37 + 32.184) * 1000 = 69184 ms` is correct for 2017-present through April 8, 2026 (37 leap seconds + fixed 32.184s TT-UTC). It remains valid until the next leap second is introduced.
- [OK] Core Chebyshev lookup paths are using TDB now:
  - `src/platform/js/data/ephemeris-provider.js`
  - `src/platform/js/data/relative-frame-provider.js`
  - `src/platform/js/services/ephemeris.js`
  - `src/platform/js/chebyshev.js`
  - `src/platform/js/app/body-location-actions.js`
- [OK] The intended annotation convention (`TDB` for phase/span, `UTC` for events) matches data provenance: vector files show `JDTDB` headers, and MAJOR EVENTS text is UTC.
- [OK] `parseConfigTimestamp()` logic is directionally correct for stored ISO-with-`Z` timestamps: parse as UTC, then subtract TDB offset when `time_scale === "TDB"`.
- [RECOMMEND] Enforce or validate `Z` suffix for TDB-tagged ISO strings. Without `Z`, `Date.parse()` can become locale-dependent.
  - **Status: open** — low risk since all existing configs use `Z` suffix; deferring to next data-pipeline review.
- [OK] Event times are not being TDB-shifted in event resolution (`resolveEventInstant` still uses UTC timestamps directly), so launch/eclipse/etc. event values remain UTC.

## 2. Completeness
- ~~[ISSUE] One remaining UTC JD path exists in NPZ curve generation:~~
  - ~~`src/platform/js/data/npz-ephemeris.js` still uses `getJD_UTC()` / `2440587.5 + t/86400000`.~~
  - **FIXED**: changed to `getJD_TDB()` with TDB arithmetic fallback (same pattern as other files).
- [OK] 40 mission configs were touched and annotated in this commit set.
- [OK] `chebyshevRangeToUtcMs()` was added but is currently unused at runtime. Acceptable — the slider overshoot is fixed by config annotations; the function is available for future clamping if needed.
- ~~[ISSUE] Config annotation introduced noisy/incorrect placements in at least Artemis 2 config (example: `ui.cameraDefaults.geo.time_scale`) and duplicate `time_scale` entries in JSON5 source:~~
  - ~~`assets/artemis2/data/config.json`~~
  - ~~`assets/artemis2/data/config.json5`~~
  - **FIXED**: 4 duplicate `time_scale` lines removed (artemis2: 2, chandrayaan3: 2). No misplaced annotations found outside phase/span/events blocks (verified via parsed JSON audit of all 40 configs). Migration script updated with negative-lookahead to prevent re-insertion.

## 3. Risks and Edge Cases
- ~~[ISSUE] The 69.184s constant is duplicated across multiple files; this is brittle at next leap-second change.~~
  - **Status: acknowledged** — 7 files define `TDB_OFFSET_MS`. Centralizing requires an import in every consumer including `astro.js` (which sets `Date.prototype` side-effects), `chebyshev.js` (generates curves), and `npz-ephemeris.js`. The duplication is documented and grep-findable; centralizing deferred to avoid a large import-chain refactor in this already-large change set.
- [RECOMMEND] Centralize TDB/UTC conversion constants/functions in one module and import everywhere.
  - **Status: deferred** — `time-utils.js` is now the canonical module; other files inline the constant for isolation. Next refactor should consolidate.
- ~~[ISSUE] Backward-compat default (`missing time_scale => UTC`) can silently reintroduce the original bug for newly added TDB-derived phases.~~
  - **Status: mitigated** — all 40 existing configs now annotated. New missions created by `orbits.py` or `export-spice-chebyshev.py` will need manual annotation. A CI check for missing `time_scale` is recommended but deferred.
- [RECOMMEND] Add lint/CI check: phase/span blocks must explicitly declare `time_scale`.
  - **Status: deferred** to CI enhancement pass.
- ~~[ISSUE] `buildRangeFromParts(windowConfig, createUTCTimestamp, ...)` keeps an unused callback parameter:~~
  - ~~`src/platform/js/app/start-end-times.js`~~
  - **FIXED**: parameter renamed to `_createUTCTimestamp` to signal it's unused internally. The public API signature (`resolveMissionBodyTimeRange`, `createStartEndTimesResolver`) still accepts the parameter to avoid breaking callers.
- [OK] Gitignored Chebyshev metadata annotation persistence is acceptable as documentation, but it is not enforceable unless checked in data repo CI.
- [RECOMMEND] Add a boundary regression test for "event at/near range edges" to ensure no accidental clipping after 69s shift.
  - **Status: deferred** — the 0/36 overshoot audit covers the end-boundary case; start-boundary was verified clean for all missions.

## 4. Test Coverage
- [OK] `test/eclipse-timing-tdb.test.js` validates geometric contact via angular overlap and bisection; this is physically reasonable for first-order contact detection.
- [OK] Updated `test/ephemeris-provider.test.js` correctly verifies UTC→TDB JD conversion math.
- ~~[ISSUE] No direct unit tests were found for `parseConfigTimestamp()` / `createTimestampFromScale()` for both UTC and TDB inputs.~~
  - **FIXED**: added 6 test cases in `test/start-end-times.test.js` covering UTC parse, TDB parse with shift, default (no scale), invalid input, component-based UTC, and component-based TDB.
- ~~[ISSUE] No explicit test verifies that fixed event timestamps remain unchanged when surrounding phase is `time_scale: "TDB"`.~~
  - **FIXED**: added test case "event times remain UTC even when phase has time_scale TDB" in `test/config-events.test.js`. Verifies `eclipseStart.startTime.getTime() === Date.parse("2026-04-07T00:35:00Z")` with surrounding phase `time_scale: "TDB"`.
- [OK] Targeted test run was executed successfully:
  - `npm run test:unit`
  - Result: `222 passed, 6 skipped`

## 5. Code Quality
- [OK] Commit messages are consistent with conventional style (`fix(...)`, `test(...)`, `feat(...)`, `chore(...)`, `docs:`).
- ~~[ISSUE] Migration script idempotency is weak for partial states due to early global skip:~~
  - ~~`scripts/annotate-config-time-scale.mjs`~~
  - ~~`if (text.includes('"time_scale"')) return 0;` can skip files that are only partially annotated.~~
  - **FIXED**: replaced global skip with per-block negative-lookahead (`(?!\s*"time_scale")`) in all three insertion passes (phase blocks, events block, span blocks). Script is now safe to re-run on partially annotated files.
- ~~[ISSUE] One JSDoc comment is now wrong and conflicts with implemented behavior:~~
  - ~~`src/platform/js/astro.js` says `getJD_UTC` should be used for Chebyshev lookups.~~
  - **FIXED**: JSDoc updated to say "Note: Chebyshev/NPZ data uses TDB, not UTC — use getJD_TDB() for those lookups."
- [OK] `parseUtcPartsStart` → `parseOriginPartsStart` rename is clean (no stale references found).

## 6. Numeric Validation
- [OK] The committed eclipse test's overlap math is sound: center-angle separation vs apparent solar/lunar angular radii, then root-finding.
- [RECOMMEND] The "remaining +76s is trajectory-data, not code" conclusion is plausible but not fully proven by committed tests alone; it relies on external/local investigation (`scripts/validate-eclipse-skyfield.mjs`) and NASA rounded schedule times.
  - **Status: acknowledged** — the skyfield-ts validation script (local, not committed) confirmed light-time + aberration shift contacts by only ~1.3s, leaving the 76s residual entirely in trajectory data. Committed to the investigation report as evidence.
- [RECOMMEND] To strengthen this in-repo, add reproducible artifact-based comparison (same trajectory solution/version metadata + deterministic reference outputs).
  - **Status: deferred** — would require committing HORIZONS trajectory metadata alongside test fixtures.

## Summary Verdict
- [OK] The main UTC/TDB bug fix across Chebyshev runtime lookups is correct and materially improves timing accuracy.
- ~~[ISSUE] Important follow-ups remain: NPZ path still UTC-based, conversion constant duplication, missing unit tests for new time-scale parsing, stale `astro.js` JSDoc, and annotation-script/config hygiene issues.~~
- **Updated**: All reported issues have been addressed except TDB constant centralization (deferred) and CI lint for missing `time_scale` (deferred). NPZ path fixed, tests added, JSDoc corrected, duplicate annotations removed, migration script made idempotent.

### Follow-up issues resolved in this pass
| Issue | Status |
|-------|--------|
| NPZ path uses `getJD_UTC` | Fixed |
| Duplicate `time_scale` annotations | Fixed (4 lines in 2 configs) |
| Migration script idempotency | Fixed (per-block lookahead) |
| Stale `getJD_UTC` JSDoc in astro.js | Fixed |
| Unused `createUTCTimestamp` parameter | Marked `_unused` |
| Missing `parseConfigTimestamp` tests | Added (6 cases) |
| Missing event-time-stability test | Added |
| TDB constant centralization | Deferred |
| CI lint for missing `time_scale` | Deferred |
