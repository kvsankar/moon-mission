# Same-Major Toolchain Updates — 2026-09-15

## Scope And Changes

Completed the bounded development-tool slice from the
[single roadmap](../../plans/roadmap.md), following the
[advisory triage](dependency-triage-2026-09-15.md).

| Dependency | Before | After |
| --- | --- | --- |
| Vite | 7.1.2 | 7.3.6 |
| Vitest | 3.2.4 | 3.2.7 |
| Vitest coverage-v8 | 3.2.4 | 3.2.7 |

Package minimums and lockfile were updated together. Vite's resolved esbuild
0.28.2 and Rollup 4.63.3 satisfy its declared ranges. All changed/new lockfile
package entries are development dependencies; production dependency versions,
Swiper CDN references and optional MCP versions remain unchanged.

Local Node 22.15.0 meets the declared Vite/Vitest requirements. The current
setup-node 22 CI policy remains unchanged. Optional platform-specific package
changes were checked during independent lockfile review.

## Local Server Hardening

- Keep the existing loopback bind and disable wildcard CORS. Repository pages,
  workers, popouts and tests do not require a browser to read local Vite from
  another origin. Remote asset-host permissions are unchanged. CORS is not
  authentication; the loopback/network boundary still matters.
- Ignore generated `coverage/` and `.tmp/` outputs in Vite's watcher. Source,
  mission HTML and authored/runtime assets remain watched.
- Add an HTTP regression test for mission and source routes: requests work,
  but unrelated origins receive no `Access-Control-Allow-Origin` grant.
- The test uses explicit Node HTTP APIs, a separate scratch cache and disabled
  test-only dependency discovery. It does not rely on globals modified by
  other tests or interfere with the live dev server's cache.

The CORS decision follows [Vite's server guidance](https://vite.dev/config/server-options#server-cors).

## Advisory Delta

| Severity | Before | After |
| --- | --- | --- |
| Critical | 3 | 1 |
| High | 10 | 5 |
| Moderate | 5 | 7 |
| Total affected package entries | 18 | 13 |

The audit was independently repeated and matched these counts. Vite, Rollup,
PostCSS, nanoid and picomatch are no longer reported as affected entries.
Vitest/coverage move from critical to moderate because the separate mocker
advisory still applies to the 3.x packages. The remaining critical entry is
Swiper; MCP-family and other deferred findings remain as recorded in triage.

Counts include dependency/wrapper effects, not independent deployed exploits.
This is not a clean security audit, and npm does not comprehensively inspect
the CDN or vendored libraries. No blind audit fix or major migration was applied.

## Verification

- Full unit suite: **1,622 passed, six skipped, 217 files**.
- Updated coverage provider: three focused policy tests passed, with 100%
  coverage of that selected module. CLI threshold overrides were confined to
  this provider smoke run; repository thresholds were not changed. This is not
  a claim of full-repository coverage.
- `npm run build` succeeded under Vite 7.3.6, including generated mission pages
  and the separate self-contained Moon worker build. The worker artifact is
  406,986 bytes; its build helper checks for unresolved imports.
- Build warnings remain for classic non-module scripts, legacy Three.js
  `sRGBEncoding` references in the sky demo, and large chunks. Those sources
  were not changed in this slice; no warning was hidden or suppressed.
- The verified old repository Vite process on port 8111 was stopped and a new
  Vite 7.3.6 server started on the same loopback URL.
- Final unchanged browser suite: **eight passed** across CY3 transitions,
  Artemis II mobile and HTTP failure/recovery, after excluding generated
  reports from the watcher. Final HTTP/CORS policy rerun: two passed.

The first full run exposed the new test's reliance on a global `fetch` removed
by other test fixtures; the explicit Node client fixed it. A concurrent browser
run failed its scene-reuse assertion while the Vite log recorded numerous
coverage-HTML page reloads. Generated-output watcher exclusions address that
observed interference. Runtime assertions and production animation code were
not changed. Cache isolation is separate test hygiene, not a proven cause of
that browser failure.

Independent review found no actionable issue in the dependency, CORS, watcher
or test-isolation changes. No SSIM baselines or generated data were committed.

## Remaining Work

Coordinate a patched Swiper version across npm and deployed CDN JS/CSS with
carousel compatibility checks. Optional MCP and the major Vitest/mocker
migration remain separate slices. Current prioritization stays in the roadmap.
