# Dependency Advisory Triage — 2026-09-15

Follow-up: [same-major toolchain updates](dependency-updates-2026-09-15.md)
reduced the audit to 13 affected entries. The inventory below is the original
pre-update checkpoint, not the current installed-version list.

The subsequent [Swiper update](swiper-upgrade-2026-09-15.md) reduces the
repository audit to 12 affected entries, with no critical entries. Deployment
remains explicitly deferred by the user.

Read-only triage of the reported 18 vulnerable package entries (three critical,
ten high, five moderate). Counts include affected wrappers/transitive packages;
they are not counts of independent deployed exploits. No dependencies changed.

## Exposure And Recommended Slices

| Order | Package / current version | Actual exposure found | Follow-up |
| --- | --- | --- | --- |
| 1 | Vite 7.1.2 | Local dev/build server, loopback-bound but permissive CORS; not deployed as a server | Upgrade within major to 7.3.6; review development CORS |
| 1 | Vitest and coverage-v8 3.2.4 | Development tests; vulnerable UI/API or Browser Mode paths not configured here | Upgrade together to 3.2.7, then full test verification |
| 2 | Swiper npm 11.2.10 and production CDN major 10 | Shipped runtime; hardcoded constructor options, no attacker-controlled options/extendDefaults path found | Coordinate npm and CDN JS/CSS upgrade to 12.1.2+ with carousel compatibility review |
| 2 | Playwright MCP 0.0.32 and SDK 1.17.2/transitives | Optional local MCP service; absent from static deployment and CI execution | Upgrade to MCP 0.0.40+ and resolve patched SDK/transitives when used |
| 3 | Rollup, PostCSS, nanoid, picomatch, brace-expansion | Build/test dependency paths; fixed repository-owned build inputs/outputs | Refresh compatible transitives and verify build |
| 3 | Vitest mocker on 3.x | Standalone mocker/interceptor plugin path not installed in this Vite server | Separate Vitest/coverage 4.1.11+ migration if retained advisory requires it |
| 3 | fflate 0.8.2 through types dependency | Dev-only audited package; runtime Three uses a separate vendored gunzip path, not audited unzipSync | Refresh dev dependency; inventory vendored code separately |

Version candidates above were checked against package metadata during triage,
not installed or compatibility-approved. In particular, the Swiper and MCP
changes exceed current allowed ranges and need explicit scoped testing.

## Primary Advisory References

- [Vite file access](https://github.com/advisories/GHSA-p9ff-h696-f583)
- [Vitest](https://github.com/advisories/GHSA-5xrq-8626-4rwp)
- [Swiper prototype pollution](https://github.com/advisories/GHSA-hmx5-qpq5-p643)
- [Playwright MCP](https://github.com/advisories/GHSA-6fg3-hvw7-2fwq)
- [MCP SDK](https://github.com/advisories/GHSA-345p-7cg4-v4c7)
- [Rollup](https://github.com/advisories/GHSA-mw96-cpmx-2vgc)
- [Vitest mocker](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)
- [fflate](https://github.com/advisories/GHSA-px8p-9vwx-vf98)

## Disposition

Repository deployment copies static HTML/source/assets and bundles the Moon
worker; it does not deploy Vite, Vitest or MCP servers. This review establishes
repository execution boundaries, not an inventory of running external services.
No demonstrated exposure warrants interrupting the load-recovery fixes.

Queue same-major Vite/Vitest updates as a bounded dependency-remediation slice.
Do not apply blind `npm audit fix --force`. An npm-only Swiper upgrade would
miss production's CDN imports. npm audit does not comprehensively inventory
CDN or vendored dependencies, so do not describe a future zero count as proof
of complete runtime security.

Priority remains owned by the [single roadmap](../../plans/roadmap.md).
