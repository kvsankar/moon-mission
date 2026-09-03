# R2 Asset Hosting

Runtime assets for the lunar missions are served from the public Cloudflare R2
bucket behind:

```text
https://assets.sankara.net/moon-mission/
```

The app shell still deploys to `https://sankara.net/astro/lunar-missions/`,
but runtime asset URLs are resolved through the R2 asset base. This includes:

- mission config and manifest JSON under `assets/<mission>/data/`
- generated orbit payloads staged from `moon-mission-data`
- shared runtime JSON such as `assets/lunar-features.json`
- mission images, media thumbnails, and HLS streams
- shared runtime images under `images/`
- optional vendored runtime assets under `third-party/`

## Source Repositories

- `moon-mission` remains the source for app code, mission config source,
  compiled config JSON, media manifests, catalog metadata, and UI-owned assets.
- `moon-mission-data` remains the source for generated orbit payloads,
  shared runtime JSON catalogs, and staged runtime data/media assets.
- R2 is a public serving target, not the source of truth.

## URL Contract

All runtime asset paths keep their repository-relative layout after the
`moon-mission/` prefix. For example:

```text
assets/artemis2/data/config.json
```

is published as:

```text
https://assets.sankara.net/moon-mission/assets/artemis2/data/config.json
```

Do not hand-author absolute R2 URLs in mission configs for normal runtime
assets. Use repository-relative paths and let the runtime resolver apply the
asset base. External third-party URLs may remain absolute when the upstream
source is intentionally not mirrored.

## Local Upload

Build or stage a deploy tree first, then upload only the runtime asset roots:

```bash
python scripts/build.py --dist dist-pages
python scripts/stage-ephemeris-data.py --app-root . --data-root ../moon-mission-data --target-root dist-pages
python scripts/upload-r2-assets.py --source-root dist-pages --prefix moon-mission/ --roots assets images third-party --dry-run
python scripts/upload-r2-assets.py --source-root dist-pages --prefix moon-mission/ --roots assets images third-party
```

The upload script reads `.env` by default and requires:

- `R2_S3_ENDPOINT_SANKARA_NET`
- `R2_BUCKET_SANKARA_NET`
- `AWS_ACCESS_KEY_ID_SANKARA_NET`
- `AWS_SECRET_ACCESS_KEY_SANKARA_NET`
- `AWS_REGION_SANKARA_NET` is optional and defaults to `auto`

Use `--dry-run` to inspect the upload set before writing.

The Artemis II manifest currently uses an absolute hosted `mediaBase` under
`/moon-mission/artemis2/timeline-media/`. Treat it as a legacy namespace
exception until the media plan migrates it to `/moon-mission/assets/...`.

## Deploy Workflow

The Hetzner deploy workflow stages and verifies runtime assets exactly as
before, then uploads the staged `assets/`, `images/`, and `third-party/` roots
to R2 before publishing the app shell to the VPS.

Required GitHub configuration:

- Repository variable `R2_BUCKET_SANKARA_NET`, default `sankara-net-assets`
- Repository variable `R2_ASSET_PREFIX_SANKARA_NET`, default `moon-mission/`
- Repository secret `R2_S3_ENDPOINT_SANKARA_NET`
- Repository secret `AWS_ACCESS_KEY_ID_SANKARA_NET`
- Repository secret `AWS_SECRET_ACCESS_KEY_SANKARA_NET`
- Optional repository variable `AWS_REGION_SANKARA_NET`, default `auto`

## Cache Policy

The upload tool currently applies:

- short cache (`300s`) for JSON, JSON5, and HLS playlists
- one day for ordinary runtime assets
- immutable one year for HLS media stream segments and init media

If an asset becomes content-addressed, it may safely move to immutable caching.
If an asset is mutable under a stable filename, keep its cache short enough for
mission updates to propagate without manual cache purge.
