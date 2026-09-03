
## Moon Mission Orbit Animations

[![Live Site](https://img.shields.io/website?url=https%3A%2F%2Fsankara.net%2Fastro%2Flunar-missions%2F&label=live%20site)](https://sankara.net/astro/lunar-missions/)
[![CI](https://github.com/kvsankar/moon-mission/actions/workflows/ci.yml/badge.svg)](https://github.com/kvsankar/moon-mission/actions/workflows/ci.yml)
[![Deploy to Hetzner VPS](https://github.com/kvsankar/moon-mission/actions/workflows/deploy-hetzner.yml/badge.svg)](https://github.com/kvsankar/moon-mission/actions/workflows/deploy-hetzner.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

Interactive 2D/3D lunar mission visualizations powered by NASA JPL HORIZONS data and curated runtime ephemeris artifacts.

Live pages:

- Landing/index: <https://sankara.net/astro/lunar-missions/>
- Mission pages: <https://sankara.net/astro/lunar-missions/chandrayaan3/>
- Orbit data status: <https://sankara.net/astro/lunar-missions/orbit-data.html>
- Assets status: <https://sankara.net/astro/lunar-missions/assets-status.html>

The full mission list is in the `Mission Catalog` section later in this README.

![Mission Preview](images/social/chandrayaan3-landscape.png)

## Features

I created this animation for educational purposes. It has the following features:

* Real-world orbit data and predictions based on information available from JPL/NASA HORIZONS interface
* Rendering of the orbit in 2D and 3D
* Rendering with Earth-centered, Moon-centered, and Earth-Moon relative-frame origins
* Header pill strip for fast mission controls (origin, follow/view presets, plane, dimension, and visibility toggles), with synchronized Settings panel controls as fallback
* Multi-craft missions with per-craft styling, visibility pills, and per-craft timeline spans
* Camera from/to controls for mounted viewpoints (spacecraft, Earth, Moon)
* Optional auxiliary camera panels (desktop) for simultaneous craft->Earth and craft->Moon views
* Views aligned with J2000 reference axes
* Information on all earth bound and moon bound maneuvers (engine burns)
* Realistic textures for Earth and Moon in 3D mode
* Astronomically correct rendering of sunlight on Earth and Moon, poles, and polar axes
* Various animation controls for education - camera controls (pan, zoom, rotate), timeline controls, visibility controls
* A Joy Ride feature which lets you fly along with the spacecraft
* Relative-frame mode (`mode=relative`) to view Earth-Moon transfer geometry with Earth->Moon axis fixed
* Mission comparison mode (`mode=compare`) to overlay two missions in a single animation with a shared comparison clock and normalized Earth-Moon distance — see [Orbit Comparison Mode](docs/specs/modes/orbit-comparison.md)
* Selectable orbit styles (`Trail` and `Classic`) with background-loaded style sidecars for authored missions such as CH3
* On startup, if current wall-clock time is within mission data span, runtime can auto-seek to `Now`, switch to realtime speed, and start playback
* Mission brief panels with authored Mission and HORIZONS Data text, programmatic timeline bars, a pilot orbit preview, and curated CC BY-SA image carousels

## Run locally

Prerequisites: Node.js (for the Vite dev server). Python is only needed for orbit-data tooling.

```bash
npm install
npm run dev
```

Open:

- `http://localhost:7274/`
- `http://localhost:7274/index.html`
- `http://localhost:7274/chandrayaan3/`
- `http://localhost:7274/artemis2/?mode=relative`
- `http://localhost:7274/orbit-data.html`
- `http://localhost:7274/assets-status.html`
- `http://localhost:7274/moon-render-tuner.html`
- `http://localhost:7274/sky-render-demo.html`

## Multi-Mission Support

URL parameters:

- `index.html` - Landing page
- `<mission>/` - Open a mission directly using its folder slug from `assets/mission-catalog.json`
- `<mission>/?mode=relative` - Relative-frame mode
- `<mission>/?mode=compare&compareMission=<other>` - Mission comparison mode (see [Orbit Comparison Mode](docs/specs/modes/orbit-comparison.md) for the full URL contract)
- `<mission>/?testMode=true` - Test harness mode for deterministic test behavior
- `mission.html?mission=<folder-slug>` - Legacy shared link form; redirects to the matching clean mission URL

### Mission Controls UI

- Primary quick controls live in the header pill strip (`#header-pill-strip`) in the mission page shell (`mission.html` source template).
- The Settings panel (`#settings-panel`) remains available for the full control set and advanced options.
- Both surfaces are kept in sync through shared underlying inputs/event wiring (`src/platform/js/ui/event-handlers.js`), so changing one updates the other.

### Debugging with NPZ ephemeris

Runtime supports `chebyshev`, `npz`, and `astronomy` body sources, configured per mission via `ephemeris_source` / `ephemeris_sources` in `config.json`.

Current mission configs in this repo are set to `chebyshev` for `SC`, `MOON`, `EARTH`, and `SUN` by default.

For NPZ debugging, set `"ephemeris_source": "npz"` (or per-body overrides), and stage matching `.npz` files (for example `geo-<SC>.npz`, `lunar-<SC>.npz`, and `landing-<SC>-geo.npz` / `landing-<SC>-lunar.npz` when used).

Documentation hub: [docs/README.md](docs/README.md)  
Developer workflow/build/CI guide: [developer.md](docs/operations/contributor/developer.md)
System design index: [docs/designs/README.md](docs/designs/README.md)

Shared authored mission panel content lives in:

- `assets/mission-briefs.json`
- `assets/mission-images.json`

Mission config authoring workflow:
- edit `assets/*/data/config.json5` (maintainer source with comments)
- compile runtime JSON with `npm run configs:compile` (writes `assets/*/data/config.json`)
- verify sync with `npm run configs:check`
- run `npm run configs:lint` before push when mission config timing or phase/event structure changed; current CI uses this stricter check

## Data Repository Boundary

This repository contains runtime app code, mission config, and UI assets.

Generated orbit/ephemeris artifacts are maintained in the sibling data repository (`moon-mission-data`), including:

- `*-cheb.json`
- `*-cheb.json.gz`
- `*.npz`
- `*-meta.json`
- authored style sidecars such as `geo-style.json` / `lunar-style.json`

Social/share images under `images/social/` are app-managed. Moon runtime profile
images under `images/moon/` are mirrored across the app and data repositories
and must remain byte-identical.

CI/deploy workflows stage those artifacts into this app during build/deploy.

Useful audit commands:

```bash
make data-audit
# or
npm run audit:data-boundary
```

Repo-boundary process details:
- [Repo sync playbook](docs/operations/data/repo-sync-playbook.md)
- [App and data repository boundary](docs/specs/data/repository-boundary.md)

## Architecture And Data

The 2D renderer uses SVG and D3.js; the 3D renderer uses Three.js. Mission
ephemerides are sourced offline from JPL HORIZONS or SPICE and converted to
Chebyshev products for efficient runtime interpolation. The runtime also
retains NPZ and Astronomy Engine body providers.

**Time Systems:** Runtime ephemeris sampling converts UTC epoch milliseconds to
TDB Julian dates for Chebyshev and NPZ lookups. UTC remains the authority for
user-facing event times and display. See the
[Chebyshev ephemeris specification](docs/specs/data/chebyshev-ephemeris-format.md)
and [time synchronization design](docs/designs/time/synchronization.md).

See the [system design map](docs/designs/README.md) for component boundaries
and deeper technical documentation.

## Testing

The project includes automated testing with Vitest + Playwright.

```bash
make test
```

`make test` runs the primary UI + visual regression suite (`test/ui.test.js`) on `http://localhost:8111`.

Current CI gate:
- `npm run configs:lint`
- `npm run test:unit`

For strategy and full-suite commands (`ui`, `mission-smoke`, `chebyshev-accuracy`), see:
- [Testing guide](docs/operations/contributor/testing.md)

### Hosting

At present the page can be hosted statically. There are no server components needed.
However, you need to serve it over HTTP (not `file://`) to avoid module/fetch/CORS issues.

### Deployment Data Repository

The operational sources of truth are the
[contributor guide](docs/operations/contributor/developer.md), the
[repository-boundary specification](docs/specs/data/repository-boundary.md),
and the deployment workflow itself. The summary below describes the public
deployment shape.

CI workflows stage runtime mission assets from a separate data repository before publishing. Staged assets include orbit artifacts (`*-cheb.json`, `*-cheb.json.gz`, manifests, optional `.npz` / `*-meta.json`, and orbit-style sidecars such as `geo-style.json` / `lunar-style.json`), mission screenshots (`assets/*/images/`), additional shared runtime media, and optional vendored runtime libraries (`third-party/`).

Deployment stages the data repository and then copies the app repository's
`images/` tree. Social/share images are app-owned; mirrored Moon profile images
must pass the repository-boundary hash checks.

By default workflows use:

- `MISSION_DATA_REPO = kvsankar/moon-mission-data`
- `MISSION_DATA_REF = main`

You can override these via GitHub repository variables with the same names. No extra token is needed when the data repo is public.

Current workflow behavior:

- `.github/workflows/ci.yml` runs on push, pull request, and manual trigger.
- `.github/workflows/deploy-hetzner.yml` is manual-only (`workflow_dispatch`) for sankara.net deploys.

The Hetzner workflow stages mission data and publishes the full app plus runtime asset set to `sankara.net`. Use it when shipping app-shell changes, new missions, new manifests, or updated runtime assets.

Production note:
- `sankara.net` is served by nginx, not Apache. The live legacy redirect from `mission.html?mission=<slug>` to `/<slug>/` is implemented in nginx config on the VPS, not in this repo's `.htaccess`.
- The repo's `mission.html` remains a `noindex,follow` compatibility shell so legacy shared links still work even if a host ignores server-side rewrites.
- `.htaccess` is kept only for cache-header behavior on Apache-like hosts; it is inert on production.

For development, you can use the Vite dev server:
```bash
npm run dev
```

For simple static-file checks, Python's built-in server can also serve the
files, but it does not reproduce Vite's clean mission-route behavior or the
deployment data-staging workflow:
```bash
python -m http.server 7274
```

The same limitation applies to Node.js `http-server`:
```bash
npx http-server
``` 

### Deployed Version and Audit Artifacts

Each deployment now publishes machine-readable metadata:

- `/deployment/version.json` - deployed app/data repository commits, CI run metadata, and artifact summary
- `/deployment/runtime-asset-manifest.json` - required runtime assets and SHA-256 values from `moon-mission-data`
- `/deployment/file-manifest.json` - file list + SHA-256 for the deployed static tree

For the production site this is available at:

- `https://sankara.net/astro/lunar-missions/deployment/version.json`

The Hetzner deploy workflow also runs a post-deploy parity audit (`rsync --dry-run --checksum --delete`) and fails if the remote tree differs from the staged deployment output.

Quick CLI check:

```bash
python scripts/show-deployed-version.py
```

## Mission Catalog

Current catalog missions are grouped below using the same broad families as the landing page.

### Chandrayaan

- **[Chandrayaan 1](https://sankara.net/astro/lunar-missions/chandrayaan1/)** (India - 2008)
- **[Chandrayaan 2](https://sankara.net/astro/lunar-missions/chandrayaan2/)** (India - 2019)
- **[Chandrayaan 3](https://sankara.net/astro/lunar-missions/chandrayaan3/)** (India - 2023)

### Artemis & Orion

- **[Artemis 1](https://sankara.net/astro/lunar-missions/artemis1/)** (United States - 2022)
- **[Artemis 2](https://sankara.net/astro/lunar-missions/artemis2/)** (United States - 2026)

### Apollo Trailblazers

- **[Apollo 8 S-IVB](https://sankara.net/astro/lunar-missions/apollo8-sivb/)** (United States - 1968)
- **[Apollo 9 S-IVB](https://sankara.net/astro/lunar-missions/apollo9-sivb/)** (United States - 1969)
- **[Apollo 10 LM Snoopy](https://sankara.net/astro/lunar-missions/apollo10-lm/)** (United States - 1969)
- **[Apollo 10 S-IVB](https://sankara.net/astro/lunar-missions/apollo10-sivb/)** (United States - 1969)
- **[Apollo 11 S-IVB](https://sankara.net/astro/lunar-missions/apollo11-sivb/)** (United States - 1969)
- **[Apollo 12 S-IVB](https://sankara.net/astro/lunar-missions/apollo12-sivb/)** (United States - 1969)

### Moon Mapping & Science

- **[Lunar Orbiter 1](https://sankara.net/astro/lunar-missions/lunarorbiter1/)** (United States - 1966)
- **[Clementine](https://sankara.net/astro/lunar-missions/clementine/)** (United States - 1994)
- **[Lunar Prospector](https://sankara.net/astro/lunar-missions/lunar-prospector/)** (United States - 1998)
- **[LRO](https://sankara.net/astro/lunar-missions/lro/)** (United States - 2009)
- **[LADEE](https://sankara.net/astro/lunar-missions/ladee/)** (United States - 2014)
- **[Lunar Trailblazer](https://sankara.net/astro/lunar-missions/lunar-trailblazer/)** (United States - 2025)

### New Cislunar Paths

- **[CAPSTONE](https://sankara.net/astro/lunar-missions/capstone/)** (United States - 2022)
- **[THEMIS-ARTEMIS](https://sankara.net/astro/lunar-missions/artemis/)** (United States - 2007-2011)
- **[THEMIS-ARTEMIS Overview](https://sankara.net/astro/lunar-missions/artemis-overview/)** (United States - 2007-2011)
- **[THEMIS-ARTEMIS Lagrange Transfer](https://sankara.net/astro/lunar-missions/artemis-lagrange/)** (United States - 2010)
- **[THEMIS-ARTEMIS Lunar Capture](https://sankara.net/astro/lunar-missions/artemis-lunar-capture/)** (United States - 2011)
- **[Lunar Flashlight](https://sankara.net/astro/lunar-missions/lunar-flashlight/)** (United States - 2022)
- **[SLIM](https://sankara.net/astro/lunar-missions/slim/)** (Japan - 2023)

### Global Lunar Ambitions

- **[SMART-1](https://sankara.net/astro/lunar-missions/smart1/)** (ESA - 2003)
- **[SELENE / Kaguya](https://sankara.net/astro/lunar-missions/selene/)** (Japan - 2007)
- **[KPLO Danuri](https://sankara.net/astro/lunar-missions/kplo-danuri/)** (South Korea - 2022)
- **[Nozomi](https://sankara.net/astro/lunar-missions/nozomi/)** (Japan - 1998)
- **[JUICE](https://sankara.net/astro/lunar-missions/juice/)** (ESA - 2023)

### Swingbys & Observatories

- **[ISEE-3 / ICE](https://sankara.net/astro/lunar-missions/isee3/)** (United States - 1978)
- **[Wind](https://sankara.net/astro/lunar-missions/wind/)** (United States - 1994)
- **[WMAP](https://sankara.net/astro/lunar-missions/wmap/)** (United States - 2001)
- **[STEREO](https://sankara.net/astro/lunar-missions/stereo/)** (United States - 2006)
- **[TESS](https://sankara.net/astro/lunar-missions/tess/)** (United States - 2018)

### Impact Paths & Companion Craft

- **[GRAIL](https://sankara.net/astro/lunar-missions/grail/)** (United States - 2012)
- **[GRAIL SS Stage](https://sankara.net/astro/lunar-missions/grail-ss-stage/)** (United States - 2011)
- **[LCROSS Shepherd](https://sankara.net/astro/lunar-missions/lcross-shepherd/)** (United States - 2009)
- **[LCROSS Centaur](https://sankara.net/astro/lunar-missions/lcross-centaur/)** (United States - 2009)

## Credits

* Jon D. Giorgini for helping with the JPL/HORIZONS interface and data. 
  He was very responsive whenever I mailed him my queries.
  He has been of great help since 2013 for the Mars Orbiter Mission until now
  for the Chandrayaan 3 mission.
  
* Members of the Bangalore Astronomy Society (http://bas.org.in/) for their valuable feedback

* Members of the Reddit r/isro (https://www.reddit.com/r/ISRO/) community for their valuable feedback
  
## Project Documentation

Current planning/docs split:

- Runtime architecture target: [docs/designs/runtime/target-architecture.md](docs/designs/runtime/target-architecture.md)
- Dated architecture reconciliation: [docs/evidence/reviews/runtime-architecture-reconciliation-2026-09-03.md](docs/evidence/reviews/runtime-architecture-reconciliation-2026-09-03.md)
- Active product/backlog planning: [docs/plans/roadmap.md](docs/plans/roadmap.md)
- Historical modernization/refactor plan: [modernization-plan-2026.md](docs/archive/plans/modernization-plan-2026.md)

The dated reconciliation records what was found at review time; the roadmap is
the source for outstanding work.

## AI assistance

See [ai-tools.md](docs/operations/contributor/ai-tools.md) for how AI tools are used in this repo (and where tool-specific notes live).

## Inspirations

* https://mgvez.github.io/jsorrery/ 
* https://github.com/Flowm/satvis
* https://github.com/CoryG89/MoonDemo 
* http://stuffin.space/ 
* https://theskylive.com/3dsolarsystem 
