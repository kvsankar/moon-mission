# Compatible Transitive Dependency Updates — 2026-09-16

## Scope

Updated only the two brace-expansion branches and npm fflate within their
existing parent ranges, using `npm update brace-expansion fflate`.

| Installed entry | Before | After | Parent range |
| --- | --- | --- | --- |
| brace-expansion under minimatch 10 / coverage | 5.0.4 | 5.0.12 | `^5.0.2` |
| brace-expansion under glob / minimatch 9 / coverage | 2.0.2 | 2.1.7 | `^2.0.2` |
| fflate under Three.js type definitions | 0.8.2 | 0.8.3 | `~0.8.2` |

These are all development dependencies. No direct dependencies or overrides
were added; package.json is unchanged. Structural lockfile comparison verified
that every other package entry is unchanged. Unrelated npm line-ending churn
was removed without changing the dependency graph.

The installed brace versions exceed the patched minimums in the
[brace-expansion advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
fflate 0.8.3 addresses the reported
[ZIP64 parsing issue](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
The brace 5 branch's Node requirements are compatible with local Node 22.15.0
and the existing Node 22 CI policy.

Three.js's separate vendored compression implementation is unchanged. This
update must not be described as replacing browser terrain decompression or
patching all vendored/CDN copies.

## Verification

- Full unit suite: **1,629 passed, six skipped, 219 files**.
- Coverage integration: **ten tests passed**, selecting the two intended
  modules using `src/platform/js/core/domain/{dockview-policy,ui-transition-plan}.js`.
  Both selected modules reported 100% coverage. CLI threshold overrides were
  scoped to this integration smoke run; repository coverage gates are unchanged.
- Independent normal-case probes passed both brace APIs and an fflate gzip
  roundtrip. Final independent dependency review reported no actionable findings.
- `npm run build` passed, including generated mission pages and the self-contained
  Moon worker. Existing classic-script, Three.js and chunk-size warnings remain.
- No application source, runtime package versions, browser binaries, screenshot
  baselines or mission data changed. Browser suites were not rerun for this
  development-only transitive update.

## Audit And Follow-Up

The fresh audit reports **three moderate affected package entries, zero high
and zero critical**. The brace-expansion and fflate findings are gone.
The remaining entries are `@vitest/mocker`, `vitest` and `@vitest/coverage-v8`,
associated with the same mocker advisory. They require the separately planned
major Vitest/coverage migration, not an unreviewed audit-fix command.

The [single roadmap](../../plans/roadmap.md) owns the remaining work. No
deployment was performed; the user's explicit deployment gate remains in force.
