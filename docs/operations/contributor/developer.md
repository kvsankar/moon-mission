# Developer Workflow Guide

This document is the **how-to-work-in-this-repo** guide for contributors and coding agents.

Use this document for:
- local setup
- day-to-day commands
- testing and deploy expectations
- commit hygiene and contributor workflow

Do not use this document as the authoritative source for repo-boundary exceptions or mission-data drift handling. For those, use:
- [Repo Sync Playbook](../data/repo-sync-playbook.md)
- [App And Data Repository Boundary](../../specs/data/repository-boundary.md)

For the overall docs map, use [docs/README.md](../../README.md). For system/architecture details, use [docs/designs/README.md](../../designs/README.md).

## 1) Repo Layout (Operational View)

- App repo (this repo): runtime code, mission config, UI assets.
- Data repo (sibling): `../moon-mission-data` for generated ephemeris/runtime assets.

Key paths in this repo:
- `mission.html`, `index.html`, `orbit-data.html`, `assets-status.html`
- `src/platform/js/*`, `src/platform/css/*`
- `assets/*/data/config.json5` (maintainer source) + `assets/*/data/config.json` (runtime compiled), optional `assets/*/data/media-manifest.json5` + `media-manifest.json`, `assets/*/data/ephemeris-manifest.json`
- `test/*`
- `scripts/*`

## 2) Local Setup

```bash
npm install
npm run dev
```

Default local URL: `http://localhost:7274/`

Vite serves staged local render assets. Stage data before checking texture loading;
production still uses its configured asset base/CDN. Use data `main`, including
commit `f8aba77` or later, for the complete Moon quality tiers and V2 compact assets.

Unit tests that validate mission ephemeris require the external data repository
to be staged. CI checks out `MISSION_DATA_REPO` at `MISSION_DATA_REF` (default:
`kvsankar/moon-mission-data` at `main`) and runs the same
`stage-ephemeris-data.py` step as the deployment workflow before testing. For a
fresh local checkout, use the staging command in Section 3 before `npm run test:unit`.

Useful pages:
- `http://localhost:7274/index.html`
- `http://localhost:7274/mission.html`
- `http://localhost:7274/orbit-data.html`
- `http://localhost:7274/assets-status.html`
- `http://localhost:7274/moon-render-tuner.html`
- `http://localhost:7274/sky-render-demo.html`

### Mission Runtime Control Surfaces

- `mission.html` now exposes two synchronized control surfaces:
  - Header pill strip (`#header-pill-strip`) for quick controls.
  - Settings panel (`#settings-panel`) for full/advanced controls.
- Pill/control wiring is now split across dedicated controllers instead of living only in `src/platform/js/ui/event-handlers.js`.
  - Top-level bind order and raw DOM hookup live in `src/platform/js/ui/main-control-bindings.js`.
  - Shared origin/dimension/toggle/moon-surface behavior lives in `src/platform/js/ui/view-settings-pill-controller.js`.
  - Follow/view camera behavior lives in `src/platform/js/ui/camera-pill-controller.js`.
  - Plane behavior lives in `src/platform/js/ui/plane-pill-controller.js`.
  - Mission-focus panel pills such as Artemis II `Flyby` and `Splashdown` live in `src/platform/js/ui/focus-pill-controller.js`.
- When adding/removing a mission control:
  1. Update `mission.html` (pill button and/or settings input).
  2. Update the relevant controller or binding module, not just `event-handlers.js`.
     - Use `main-control-bindings.js` for generic hook-up/bind-order changes.
     - Use the specific pill controller for sync/state behavior changes.
  3. Verify both surfaces stay synchronized in runtime and UI tests.

### Shared Visual Tokens

Use `src/platform/css/design-tokens.css` for recurring visual decisions. The
mission selector, runtime and detached views share this vocabulary. Keep
component geometry and rendered mission/annotation colors in their owning
modules. Dockview variables must be mapped on the nested theme shell as well
as the host, since vendor theme declarations otherwise override inheritance.

Run `npm run test:browser:design` against the local test server on `8111` for
selector consistency, contrast, keyboard focus, popover stacking, mobile
playback/navigation targets and stable chrome screenshots. To intentionally
refresh its three reviewed baselines in PowerShell:

```powershell
$env:UPDATE_DESIGN_BASELINES = 'true'
npm run test:browser:design
Remove-Item Env:UPDATE_DESIGN_BASELINES
```

Review `test/screenshots/current/design-review/` before accepting baseline
updates. Scene-rendering SSIM baselines remain owned by `test/ui.test.js`.

Run `npm run test:browser:progressive` for workspace width/height transitions,
Tools access, layout/time preservation, desktop-to-mobile canvas visibility and
compact Frame and Shoot disclosures. Space policies live in
`src/platform/js/core/domain/workspace-disclosure.js`; the workspace controller
and composer disclosure controller own their respective lifecycle changes.

### Moon Render Asset Profiles

- The Moon Render panel supports Low, Medium and High resource tiers (`low`, `fast`, `quality`). The legacy Moon Surface shortcuts still call Medium/High `Standard`/`Detailed`.
- All 3D Moon surfaces use the Physical `MoonRenderer`; Current is removed. Low/Medium use prepared terrain from the same algorithm as High. See [architecture](../../designs/rendering/moon-rendering.md).
- Default quality follows optional device hints; High requires a saved or explicit choice. Actual GPU texture limits constrain unsupported tiers. See the [cross-device rendering audit](../../evidence/audits/moon-rendering-and-loading-2026-09-11.md).
- Profile defaults and migration logic live in `src/platform/js/app/moon-render-asset-profiles.js`.
- Runtime asset provenance, generators, native/JavaScript gzip support and worker packaging are documented in [Moon Render Assets](../data/moon-render-assets.md).
- When changing Moon runtime assets:
  1. Keep the runtime file paths in `moon-render-asset-profiles.js` in sync with the actual files under `images/moon/`.
  2. Update `docs/operations/data/moon-render-assets.md` with the new source/derivation story.
  3. Be careful with `.gitignore`; only explicitly tracked Moon runtime files should be unignored.

### Lunar Crater / Moon Sites Controls

Lunar Feature behavior is owned by
[Lunar Feature Controls](../../specs/ui/lunar-feature-controls.md). The pure
catalog/placement implementation is under `src/platform/js/core/domain/`; scene
objects and hover effects are under `src/platform/js/app/`. When changing this
surface, run `test/lunar-crater-catalog.test.js`,
`test/lunar-crater-actions.test.js`, and affected UI-state tests.

### Artemis II Mission-Specific Panels

Artemis II exposes four higher-level workflows: `Frame & Shoot`, `Splashdown in
Spotlight`, `Mission Media`, and `Flyby Broadcast`. Their current structure is
mapped in [Runtime System Overview](../../designs/runtime/system-overview.md);
product intent is owned by [Artemis Real-Time Experience](../../specs/ui/artemis-real-time-experience.md), panel behavior by [Panel System V1](../../specs/ui/panel-system-v1.md), and media procedures by [Artemis II Media Assets](../media/artemis2-media-assets.md).

When changing a mission panel, update its DOM shell, runtime module,
configuration, launcher wiring, and focused tests together. Use
`?legacyPanels=1` or `?dockPanels=0` only for legacy-layout debugging and
`?dockPanels=1` for targeted narrow-viewport workspace testing.

## 3) Core Commands

### Development

- `npm run dev` - Vite dev server
- `npm run test:unit` - unit/integration tests excluding UI visual suite
- `make test` - primary Playwright+SSIM UI suite (`test/ui.test.js`, managed server on `8111`)
- `make baseline` - regenerate screenshot baselines (intentional visual changes only)
- `make data-audit` - audit app/data repo boundary against `../moon-mission-data`
- `npm run audit:data-boundary` - same audit without `make`

### Mission config JSON5 workflow

- `npm run configs:bootstrap` - one-time/backfill helper to create `config.json5` from existing `config.json`
- `npm run configs:compile` - compile mission JSON5 artifacts into runtime JSON (`config.json5` -> `config.json`, and optional `media-manifest.json5` -> `media-manifest.json`)
- `npm run configs:check` - sync-only check that compiled mission JSON artifacts are in sync with their JSON5 sources
- `npm run configs:lint` - stricter CI/local gate for config sync plus required `time_scale` annotations
- `node scripts/generate-media-thumbnails.mjs --mission artemis2 --data-root ../moon-mission-data --kind all` - generate Mission Media thumbnails into the data repo
- `npm run hooks:install` - installs local pre-commit hook path (`.githooks`)

Pre-commit behavior (when hooks are installed):
- runs `configs:compile`
- stages updated `assets/*/data/config.json`
- does not currently auto-stage compiled `media-manifest.json`; stage media manifest source and compiled output intentionally when media metadata changes

### Build / Packaging

- `python scripts/build.py` - build deployable static output (run `npm ci` first; Node bundles the terrain worker)
- `python scripts/stage-ephemeris-data.py --app-root . --data-root ../moon-mission-data --target-root .` - stage runtime mission data locally

### Data/Status Helpers

- `python scripts/generate-runtime-asset-manifest.py --help`
- `python scripts/verify-staged-runtime-assets.py --help`
- `python scripts/generate-assets-status.py`
- `python scripts/show-deployed-version.py`

## 4) Data Boundary Quick Rules

Do **not** commit generated runtime ephemeris artifacts in this repo:
- `*-cheb.json`, `*-cheb.json.gz`, `*.npz`, `*-meta.json`, `*-style.json`

These belong in `../moon-mission-data`.

Maintainer/source files that stay in this repo:
- `assets/*/data/config.json5` - maintainer-edited source with comments
- `assets/*/data/config.json` - compiled runtime JSON
- `assets/*/data/media-manifest.json5` - optional maintainer-edited mission media metadata
- `assets/*/data/media-manifest.json` - optional compiled runtime media metadata
- `assets/*/data/ephemeris-manifest.json` - mirrored boundary file shared with the data repo

Boundary audit workflow:
- use `make data-audit` or `npm run audit:data-boundary`
- read [Repo Sync Playbook](../data/repo-sync-playbook.md) for the authoritative classification, staging, and cleanup rules
- the audit now also checks active missions for origin completeness:
  - compressed Chebyshev coverage for `geo`, `lunar`, and `relative`
  - required body presence per origin (`craft(s)` plus `SUN`/`EARTH`/`MOON`, excluding the origin-degenerate body)
  - required `relative-*.npz` support files
- current audit rules intentionally leave some maintainer-source files such as `config.json5` under `assets/*/data/*` in the `unknown` bucket for manual review; do not delete them just because they are flagged as unknown

If you regenerate orbit data:
1. Update/verify mission config + manifests in this repo.
2. Sync generated artifacts in `moon-mission-data`.
3. Use the playbook to verify mirrored/manifold expectations before cleanup.
4. Commit in the correct repo(s) separately.

## 5) Branching / Commit Conventions

- Primary release branch: `master`.
- Keep commits focused and reviewable.
- Use short imperative commit messages (common prefix: `docs:`, `fix:`, `refactor:`).
- Avoid bundling unrelated generated artifacts with app logic changes.

## 6) Coding Conventions

- Prefer small, single-purpose modules and pure helpers where practical.
- Keep diffs targeted; avoid formatting-only churn unless needed.
- Follow existing naming and file placement conventions in `src/platform/js/*`.
- For multi-craft behavior, prefer craft IDs (`A`, `B`, `C` style modeling by mission config), not role-hardcoded names.

## 7) Testing Policy Before Push

Minimum expected checks for most changes:
- `npm run test:unit`
- `npm run configs:lint` when mission config source/compiled files changed

When UI/visual behavior changes:
- `make test`
- Update baselines only when intentional (`make baseline`) and document why.

When mission/data loading logic changes:
- run `npm run test:unit` plus targeted smoke/manual checks using mission URLs.
- if the change affects published mission assets or manifests, choose a full deploy instead of an app-only deploy.

## 8) CI / Deploy Workflows

CI:
- `.github/workflows/ci.yml` runs on push/PR/manual and executes config lint plus unit tests.
- CI also enforces config sync plus explicit `time_scale` annotations via `npm run configs:lint`.

Manual deploy workflows:
- `.github/workflows/deploy-hetzner.yml` - sankara.net (app + staged mission data)

Notes:
- Deploy workflows are manual (`workflow_dispatch`).
- Production app pages (`sankara.net`) publish through the Hetzner deploy workflow; runtime assets are uploaded to the public R2 bucket during that workflow.
- Production `sankara.net` is fronted by nginx only. Legacy `mission.html?mission=<slug>` redirects are implemented in VPS nginx config, not `.htaccess`.
- The repo's `.htaccess` is cache-header-only and should not carry production redirect logic.
- Use the Hetzner deploy when introducing app-shell changes, new missions, new manifests, or runtime assets that need to be published.
- Local and CI Vitest discovery excludes nested `.tmp/**` scratch repos so temporary checkouts do not pollute test runs.

## 9) Pre-Commit Checklist

Use this before committing:
1. `git status` is clean except intended files.
2. No credentials/secrets in diff.
3. `npm run test:unit` passes.
4. If UI changed, run `make test`; if intentional visual diff, update baselines with rationale.
5. If mission data/config/manifests/staging changed, run `make data-audit`.
6. Confirm repo boundary (app repo vs data repo) for every changed file.
7. Verify links/docs if paths changed.

## 10) Related Docs

- Design hub: [docs/designs/README.md](../../designs/README.md)
- Docs hub: [docs/README.md](../../README.md)
- Test strategy: [Testing Guide](testing.md)
- Repo boundary + sync playbook: [Repo Sync Playbook](../data/repo-sync-playbook.md)
- Mission/data ownership contract: [App And Data Repository Boundary](../../specs/data/repository-boundary.md)
- Agent conventions: [AGENTS.md](../../../AGENTS.md)
Mission config note:
- Maintainers edit `config.json5`; runtime consumes `config.json`.
- Keep `config.json` generated from `config.json5` via compile step.
