# Unused Repository MCP Dependency Removal — 2026-09-15

## Decision And Scope

Following the approved roadmap, checked whether the optional Playwright MCP
dependency was still used before choosing upgrade versus removal.

Active repository references were limited to the `@playwright/mcp` development
dependency and the `mcp-server` script. No source, tests, scripts, CI, deployment
workflow or tracked MCP configuration consumed the package or SDK. Historical
MCP manager examples exist only in archived documents. No repository-local MCP
process was found during the check; this was not a machine-wide service audit.

The old script invoked `playwright mcp`, while the MCP package actually supplied
`mcp-server-playwright`; the installed Playwright CLI had no `mcp` subcommand.
Removal therefore retires unused/broken repository tooling, not the direct
Playwright browser-test workflow or any separately configured external tools.

## Changes

- Removed the unused development dependency and obsolete npm launcher.
- npm removed **82 development-only packages**, including the exclusive
  MCP/SDK/Express/ws server chain.
- No packages were added. All retained package versions and dev/optional flags
  are unchanged, verified by structural lockfile comparison and independent review.
- Direct `playwright` and `playwright-core` remain exactly
  `1.55.0-alpha-1752701791000`; their browser revision and executable are unchanged.
- Preserved archive documents and the ignored `.playwright-mcp/` output rule.
- Removed npm's unrelated lockfile line-ending churn without changing the
  generated dependency graph.

## Verification

- Full unit suite: **1,629 passed, six skipped, 219 files**.
- `npm ls` confirms MCP/SDK/Express/ws are absent and direct Playwright remains.
- `npm run build` passed, including generated mission pages and the
  self-contained Moon worker. Existing classic-script/Three.js/chunk-size
  warnings were not suppressed.
- Eight browser checks passed across CY3 transitions, Artemis II mobile and
  actual HTTP load-failure/recovery workflows (126 seconds).
- Independent usage and lockfile review reported no actionable findings.

## Current Audit

The fresh audit reports **five affected package entries: one high, four
moderate, zero critical**, versus twelve entries in the preceding recorded
audit. MCP/SDK server-chain findings are gone.

Remaining entries:

- `brace-expansion`: high, with currently reported range/expansion DoS findings.
- `fflate`: moderate ZIP64 parsing finding.
- `@vitest/mocker`, `vitest`, `@vitest/coverage-v8`: three affected package entries
  associated with the same remaining mocker advisory; not three independent
  vulnerabilities.

Advisory classification can change independently of package changes. The
remaining high brace-expansion finding needs a compatible transitive update;
fflate and the separately planned major Vitest/coverage migration remain open.
No audit-fix upgrade was applied in this removal slice.

The [single roadmap](../../plans/roadmap.md) owns sequencing. Runtime source,
mission data, CDN references and screenshot baselines were unchanged. No
deployment was performed or authorized.
