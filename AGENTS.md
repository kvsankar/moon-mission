# Repository Guidelines

## Project Structure & Module Organization

- Agent/Contributor reference docs:
  - `docs/operations/contributor/developer.md` (repo workflow, commands, CI, conventions)
  - `docs/designs/README.md` (system design and architecture map)
- Workspace setup first (required before debugging server/runtime issues):
  - Read `docs/operations/contributor/developer.md`, especially **Section 2) Local Setup**.
  - Run `npm install`, then start the app with `npm run dev` (default `http://localhost:7274/`).
  - For a non-default port in PowerShell, run Vite directly instead of passing `--port` through npm, for example:
    - `.\node_modules\.bin\vite.cmd --port 7275 --strictPort --host 127.0.0.1`
  - Validate runtime assets load with real mission routes (for example `/artemis2/`) before debugging UI/CSS regressions.
- Entry points: `mission.html` (mission selector + app; shows landing view when `mission` is omitted), `index.html` (landing page).
- Shared platform code: `src/platform/` (`css/` + `js/` ES modules).
- Shared authored landing content: `assets/mission-briefs.json`, `assets/mission-images.json`.
- Mission content: `assets/<mission>/`
  - `data/` (`config.json5` source + compiled `config.json`, optional `media-manifest.json5` + compiled `media-manifest.json`, `ephemeris-manifest.json`; staged runtime data may also include `*-cheb.json`, `*-meta.json`, `*-style.json`)
  - `models/`, `images/`, optional `js/`, `html/`
- Shared media: `images/` (Earth/Moon/sky textures), `third-party/` (vendored libs).
- Tooling: `scripts/` (Python data/build/deploy utilities).
- Tests: `test/` (Vitest + Playwright UI tests, screenshot baselines).

## Data Repo Boundary

- Runtime app code, mission config, optional mission media manifests, and UI assets are worked on in this repo.
- Generated ephemeris artifacts such as `*-cheb.json`, `*-cheb.json.gz`, `*.npz`, `*-meta.json`, and authored orbit-style sidecars like `geo-style.json` / `lunar-style.json` are tracked in the sibling repo `../moon-mission-data`, not here.
- If you regenerate orbit/ephemeris files locally while working in `moon-mission`, sync and commit those generated files in `moon-mission-data`.
- Do not assume a regenerated file under `assets/<mission>/data/` in this repo is tracked here; verify with `git ls-files` before committing.

## Build, Test, and Development Commands

- `npm install` — install JS dependencies.
- `npm run dev` — run Vite dev server (default `http://localhost:7274/`).
- `npm run configs:bootstrap` — create `assets/*/data/config.json5` from existing `config.json` (one-time/backfill utility).
- `npm run configs:compile` — compile mission JSON5 artifacts into runtime JSON (`config.json5` and optional `media-manifest.json5`).
- `npm run configs:check` — verify compiled mission JSON artifacts are in sync with their JSON5 sources (sync-only check).
- `npm run configs:lint` — verify config sync plus required `time_scale` annotations (matches current CI).
- `npm run hooks:install` — set `core.hooksPath` to `.githooks` to enable local pre-commit checks.
- `make test` — recommended UI test run (starts server on `8111`, runs Vitest, stops server).
- `npm run test:prod:missions` — opt-in production smoke suite against `https://sankara.net/astro/lunar-missions` (supports `PROD_MISSION_FILTER` and `PROD_MISSION_LIMIT`).
- `make baseline` — regenerate visual baselines (use only when changes are intentional).
- `python scripts/build.py` — create a deployable static folder in `dist/`.

## Coding Style & Naming Conventions

- JavaScript (ES modules) lives under `src/platform/js/` and `assets/<mission>/js/`.
- Do not use legacy paths like `assets/platform/js/*` in new changes.
- Keep diffs focused; avoid reformat-only changes unless necessary.
- Prefer small, single-purpose modules and pure functions where practical.
- Tests are `*.test.js` under `test/`.

## Runtime Notes

- Runtime supports `chebyshev`, `npz`, and `astronomy` body sources.
- Relative mode uses precomputed `relative-<ID>-cheb.json` and is enabled by URL `mode=relative`.
- Compare mode uses `mode=compare&compareMission=<other>` and overlays two missions in one relative-frame scene.
- Multi-craft missions are supported via `crafts[]`; current examples include CH2/CH3-style missions.

## Mission Controls UI

- On desktop, the header pill strip is the primary quick-control surface for origin/dimension/view toggles.
- The Settings panel remains a fallback/advanced surface and may be hidden in layouts where the pill strip is visible.
- Production/browser automation should prefer the visible pill controls before assuming `#settings-panel-button` is interactable.
- Keep lunar feature controls separate from legacy landing overlays:
  - `view-lunar-craters` + `toggle-pill-lunar-craters` are the active "Lunar Features" controls and must not be gated by landing availability.
  - `view-craters` + `toggle-pill-craters` refer to legacy Moon Sites/landing-era overlays and should not be used to drive the Lunar Features panel.

## Testing Guidelines

- Frameworks: Vitest + Playwright; visual regression uses SSIM comparisons.
- Baselines are tracked in `test/screenshots/baseline/`; `current/`, `diff/`, and latest-run SSIM output are git-ignored.
- Production smoke automation should prefer the visible header pill strip on desktop; the Settings panel is a fallback control surface and may not be visibly present in all layouts.
- If you change visuals intentionally, update baselines and explain why in the PR.

## Commit & Pull Request Guidelines

- Commit messages in this repo are short and imperative; common patterns include `docs: ...`, `Add ...`, `Refactor ...`.
- PRs should include: what changed, how to test (commands + URLs), and screenshots/gifs for UI changes (plus baseline update rationale if applicable).

## Mission Config Workflow

- Edit `assets/<mission>/data/config.json5`, then run `npm run configs:compile`.
- For mission media metadata, edit `assets/<mission>/data/media-manifest.json5`, then run `npm run configs:compile`.
- Keep compiled runtime JSON in sync with JSON5 sources (`npm run configs:check`).
- CI enforces the stricter `npm run configs:lint` gate (config sync plus required `time_scale` annotations).

## CI & Deploy Notes

- `.github/workflows/ci.yml` runs `npm run configs:lint` and `npm run test:unit`.
- `.github/workflows/deploy-hetzner.yml` is the manual Hetzner deploy plus parity audit.
- Deploy workflows are manual-only; pushing does not publish to `sankara.net` by itself.

## Production Redirect Rules

- Production `sankara.net` is served by nginx on the Hetzner VPS. nginx does not read `.htaccess`.
- The repo `.htaccess` is production-inert and is kept only for cache-header behavior on Apache-like hosts.
- The live legacy mission redirect from `/astro/lunar-missions/mission.html?mission=<slug>` to `/astro/lunar-missions/<slug>/` is implemented outside this repo in:
  - `/etc/nginx/conf.d/sankara-mission-redirects.conf`
  - `/etc/nginx/sites-available/sankara.net`
- Current production behavior:
  - allowlisted mission slugs return a real server-side `301`
  - unknown slugs and bare `mission.html` stay `200`
  - `mission.html` in this repo remains a `noindex,follow` compatibility shell as defense in depth
- When adding or renaming a mission slug:
  1. Update the repo mission slug source, usually `assets/mission-catalog.json`.
  2. Update the nginx allowlist on the Hetzner host in `/etc/nginx/conf.d/sankara-mission-redirects.conf`.
  3. Run `sudo nginx -t && sudo systemctl reload nginx`.
- Verification commands:
  - `curl -ILs "https://sankara.net/astro/lunar-missions/mission.html?mission=artemis2&view=relative&foo=1"`
  - `curl -ILs "https://sankara.net/astro/lunar-missions/mission.html?mission=bogus-unknown-slug"`
  - `curl -ILs "https://sankara.net/astro/lunar-missions/artemis2/"`

## Landing Content & Data Staging

- The mission selector/landing UI reads authored brief copy from `assets/mission-briefs.json`.
- Curated CC BY-SA image carousel entries live in `assets/mission-images.json`.
- The brief panel keeps the `Mission`, `HORIZONS Data`, and `Timelines` structure, with the image carousel displayed below the orbit preview.
- Deploy/test workflows stage runtime data from `kvsankar/moon-mission-data` (or a repo-variable override) via `scripts/stage-ephemeris-data.py`.
- Staged categories include orbit artifacts, orbit-style sidecars, shared images, mission screenshots, and optional `third-party/`.

## Security & Configuration Tips

- Don’t commit credentials or deployment config: `deploy-config.json` is intentionally git-ignored.
- Don’t commit generated artifacts: `dist/`, `data-generated/`, `.test-server.*`, and `node_modules/` are ignored by design.
- Deploy workflows are manual-only; pushing does not publish to sankara.net by itself.
