# Coordinated Swiper Upgrade — 2026-09-15

## Outcome And Scope

Upgraded npm Swiper 11.2.10 and the authored CDN JavaScript/CSS major 10 to
**exactly 12.2.0**. This includes the 12.1.2 security fix and later stale-handler
guards. Both environments now import `swiper/bundle`; previously Vite loaded
core-only npm code while the production import map selected the full bundle.

Sources: [prototype-pollution advisory](https://github.com/advisories/GHSA-hmx5-qpq5-p643)
and [official changelog](https://swiperjs.com/changelog).

The pin is deliberate: an independent npm update must not silently diverge from
the separately authored CDN assets. Tests verify package/lock/template and
generated CY3/Artemis II pages use the same reviewed version.

No deployment was performed. The live site remains unchanged until the user
explicitly authorizes deployment; this report describes repository/build state.

## Compatibility Corrections

Independent review identified two existing integration risks that full-bundle
parity exposes:

1. The event strip already scrolls through native overflow and the timeline
   controller, while Swiper additionally translated the wrapper. Browser tests
   reproduced nonzero wrapper offsets after mouse/keyboard interaction and
   failed native touch scrolling. Swiper gesture/momentum/focus scrolling is
   now disabled for that strip; the existing native owner remains authoritative.
2. Reinitialization created new Swipers without destroying old instances.
   Instances are now owned by selector and destroyed before replacement.
   Replacing event slides updates the current live instance.

The transport strip remains non-swipable. Keyboard event activation still
seeks once, mouse/touch dragging does not seek, and origin changes retain
working controls. No mission-time or animation-state policy was changed.

## Verification

- Full unit suite: **1,629 passed, six skipped, 219 files**.
- New distribution tests cover exact version alignment and the published
  prototype-pollution bypass in a child process. The deliberate built-in
  mutation is isolated and restored; normal option extension is also checked.
- Lifecycle tests reproduced two failures before the fix; five focused cases
  now cover replacement, refresh, pre-init sync, externally destroyed instances
  and native gesture ownership.
- All three new gesture cases initially failed with competing Swiper/native
  owners and passed after the correction.
- Broader browser verification: eleven passed, including existing visual chrome
  baselines, CY3 transitions, Artemis mobile and HTTP recovery.
- Final carousel/CDN rerun: **three passed**, including actual browser import
  and construction through the authored CDN URL. Together with the broader
  run, all fourteen selected browser checks passed; no baselines were updated.
- Both pinned CDN entry assets returned HTTP 200 and matched installed bytes.
  Recursive verification matched **34 files**, including all relative module
  imports and the security-sensitive shared utilities.
- `npm run build` passed, including generated mission pages and the
  self-contained Moon worker. Existing classic-script/Three.js/chunk-size
  warnings were not suppressed. `npm run configs:lint` passed.
- Independent code review reported no actionable findings. No screenshot
  baseline, generated ephemeris, dependency other than Swiper, or deployment
  configuration was changed.

The initial CDN browser probe used a function containing dynamic `import()`;
Vitest rewrote it to a Node/SSR helper before Playwright serialization. The
probe now supplies browser-owned source text so the real CDN import executes
in the browser. Production code and assertions were not weakened to fix that
test setup issue.

## Audit And Remaining Work

The repository audit changed from **13 affected entries (one critical)** to
**12 (zero critical, five high, seven moderate)**. Swiper is no longer reported.
Other remaining findings are the optional MCP/SDK chain, Vitest/mocker and
other previously triaged dependencies. This does not imply a comprehensive
security clearance of every vendored/CDN component.

Follow-up priority remains in the [single roadmap](../../plans/roadmap.md).
