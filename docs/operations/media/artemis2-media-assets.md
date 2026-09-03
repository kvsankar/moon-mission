# Artemis II Media Assets

Historical import record:
[Artemis II Media Import Baseline](../../evidence/baselines/artemis2-media-import-2026-05.md)

Backlog:
[Artemis II Media](../../plans/breakdown/artemis2-media.md)

## Runtime Model

- Authored manifest: `assets/artemis2/data/media-manifest.json5`.
- Compiled manifest: `assets/artemis2/data/media-manifest.json`.
- Runtime loader: `src/platform/js/data/mission-media.js`.
- Normalization: `src/platform/js/core/domain/media-manifest.js`.
- Panel key: `workflow:media-browser`.

The current `mediaBase` is an absolute hosted Sankara namespace:
`https://assets.sankara.net/moon-mission/artemis2/timeline-media/`. It is an
intentional legacy namespace exception, not an upstream media URL.

## Ownership

- Manifest source and compiled JSON are app-owned.
- Generated thumbnails, stream packages, and transcript/search artifacts are
  maintained in `../moon-mission-data` and staged for runtime/deployment.
- Upstream NASA/Wikimedia URLs remain source and attribution references.

Current gap: `stage-ephemeris-data.py` stages media thumbnails and streams but
does not yet stage `media/transcripts/`. Do not assume a clean deploy includes
transcript/search artifacts; remediation is tracked in the Artemis media plan.

## Generate Thumbnails

```bash
node scripts/generate-media-thumbnails.mjs --mission artemis2 --data-root ../moon-mission-data --kind all
```

## Update Workflow

1. Edit `assets/artemis2/data/media-manifest.json5`.
2. Run `npm run configs:compile` and `npm run configs:check`.
3. Generate required thumbnails into `../moon-mission-data`.
4. Run `make data-audit` and resolve ownership/mirror findings.
5. Stage runtime assets using [Repo Sync Playbook](../data/repo-sync-playbook.md).
6. Start Vite and smoke `/artemis2/` through visible header controls.
7. Verify filtering, selection, details, image transforms, playback sync,
   transcript behavior, panel cleanup, attribution, and provenance labels.

Long-form packaging is documented in
[Artemis II Media Streaming](artemis2-media-streaming.md). Synchronization
anchors remain in
[Artemis II Video Sync Anchors](../../evidence/baselines/artemis2-video-sync-anchors.md).
