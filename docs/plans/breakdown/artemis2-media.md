# Artemis II Media Workstream

Last reviewed: 2026-09-03

This is the active workstream for Artemis II mission media, long-form broadcast
streams, video sync anchors, transcripts, attribution, and launch
communications. Specifications, operations, and evidence retain their own
authority; outstanding delivery work rolls up here.

## Authority Split

- Preserved May work and decisions awaiting reconciliation: this document
- Runtime media asset model and update workflow: [Artemis II Media Assets](../../operations/media/artemis2-media-assets.md)
- Long-form HLS packaging and hosting details: [Artemis II Media Streaming](../../operations/media/artemis2-media-streaming.md)
- Stream anchor ledger: [Artemis II Video Sync Anchors](../../evidence/baselines/artemis2-video-sync-anchors.md)
- Transcript and diarization handoff: [Artemis II Transcription And Diarization Handoff](../../evidence/handoffs/artemis2-transcription-diarization-handoff.md)
- Product and architecture roadmap: [Artemis II Media Timeline Plan](artemis2-media-timeline.md)
- Playback behavior spec: [Timeline And Media Playback Spec](../../specs/time/timeline-and-media-playback.md)
- Timekeeping and clock semantics: [Mission Clock Authority And Time Domains](../../specs/time/clock-authority.md)

## Current Runtime State

- Artemis II has a config-gated `workflow:media-browser` Mission Media panel.
- Authored media metadata lives in `assets/artemis2/data/media-manifest.json5`; runtime consumes compiled `media-manifest.json`.
- Discrete images, short videos, and audio clips are normalized through the media domain modules and coordinated by `media-timeline-coordination.js`.
- Mission Media is disabled in compare mode because media uses real mission chronology.
- Long-form Flyby Broadcast stream metadata exists in the manifest and is wired to the workflow Broadcast panel.
- The Broadcast panel renders captions from the combined transcript JSON, with per-part VTT files retained as fallback/external caption artifacts.
- The Broadcast panel includes a synchronized transcript list: current line highlighting follows mission playback, rows auto-scroll, and row clicks seek to the corresponding broadcast time.

## Current Decisions

- Media metadata belongs in this app repo when it is authored mission metadata.
- Generated thumbnails, large stream payloads, and generated transcript artifacts belong in `../moon-mission-data` or external generated-data storage unless deliberately promoted as authored metadata.
- Long-form stream delivery should use object storage/CDN, with repository-relative paths in manifests and runtime resolution through the public asset base.
- Stream timing should be piecewise, not one global offset, because observed broadcast anchors are not globally linear.
- Rich transcript/diarization data should be JSON track data referenced from the manifest, not overloaded into the current simple `captions` string-array field.

## Active TODOs

1. Investigate Flyby Broadcast panel going totally dark.
   - Confirm whether this is media element state, HLS loading state, panel lifecycle, z-index/visibility, or source URL failure.
   - Add a targeted regression once the failure mode is understood.
2. Upload and verify the long-form HLS stream.
   - Upload `assets/artemis2/media/streams/lunar-flyby/v1/` from the data workspace to the public media host.
   - Verify `.m3u8`, `.m4s`, `.mp4`, and `.vtt` content types.
   - Verify CORS and cache behavior through `assets.sankara.net`.
3. Deliver separate synchronized stream panels driven by `mediaStreams[]`.
   - Keep each declared long-form stream in its own built-in workflow panel.
   - Use mission-clock sync planning rather than independent panel clocks.
   - Preserve provider-specific playback and buffering work in the browser
     shell.
4. Build the stream sync segment map.
   - Collect at least two anchors per continuous broadcast segment.
   - Solve local affine mappings from video time to mission time.
   - Persist the segment map in Artemis II media metadata or an attached sidecar.
5. Maintain diarization artifact integration.
   - Runtime consumes `transcriptDoc` from the Artemis II media manifest and treats `combined.json` as the single source of truth for unified timeline captions and transcript rows.
   - Runtime uses schema v4 `displayStartSeconds` / `displayEndSeconds` for user-facing caption, seek, and transcript timing. Raw `startSeconds` / `endSeconds` remain provenance only.
   - Per-part `.vtt` files remain staged as fallback/external caption artifacts.
   - The current data-repo receipt identifies transcribe commit `47615b1`.
6. Add transcript/search discovery.
   - Synchronized captions and transcript panel behavior are implemented.
   - Next runtime surfaces: entity search from `artemis2-lunar-flyby-broadcast.index.json`, speaker filters, confidence styling, and event/annotation linkage.
   - Later explore diarization -> LLM -> search enrichment, speaker timeline, and mission-event annotation features.
7. Add attribution coverage.
   - Cover Hank Green / Artemis Timeline provenance.
   - Cover NASA media and broadcast source credit.
   - Cover generated thumbnails, transcripts, and any mirrored or transformed assets.
8. Prepare launch communications.
   - Blog post.
   - Reddit post.
   - Email to Hank.
   - Any source/license acknowledgements needed before public promotion.
9. Investigate intermittent corrupt/truncated browser warning for `55196663265_ef59978360_o.jpg`.
   - Re-test target browsers with cache disabled and network throttling.
   - Compare R2 derivative against Flickr variants.
   - Decide whether to pin a different source URL or add fallback handling.

## Stream Sync Anchors

Media asset and stream delivery still requires:

- [ ] Extend `stage-ephemeris-data.py` and its tests to stage
  `assets/<mission>/media/transcripts/` from `moon-mission-data`; verify a clean
  deployment contains every manifest `transcriptDoc` and `searchIndex` target.
- [ ] Decide whether to migrate the absolute legacy `mediaBase` namespace to
  the canonical `/moon-mission/assets/...` layout.
- [ ] Verify the published HLS master playlist, representative segments, MIME
  types, CORS, and cache headers against the current package.
- [ ] Replace provisional synchronization with validated piecewise anchors and
  interpolation.
- [ ] Decide whether whole-mission streams require a distinct filter from short
  clips.
- [ ] Verify master-playlist references to renditions, captions, transcript,
  and search artifacts.

The current high-value anchors remain in [Artemis II Video Sync Anchors](../../evidence/baselines/artemis2-video-sync-anchors.md). Treat that file as the ledger until the mapping is promoted into manifest metadata.

Known issue: the anchor set is not globally linear. Likely causes include archive edits, feed switches, replayed broadcast segments, and DVR timeline discontinuities.

## Transcript State

Canonical app-facing transcript artifacts are generated in the sibling transcription workspace under:

- `C:\sankar\projects\transcribe\transcripts\artemis2\outputs\`

Runtime-staged artifacts live in the data repo under:

- `../moon-mission-data/assets/artemis2/media/transcripts/`

The app manifest references those staged artifacts through repository-relative paths:

- `artemis2-lunar-flyby-broadcast-combined.json`: unified Part 1 + Part 2 schema v4 transcript, all speakers, word timings where reliable, and tight display timings.
- `artemis2-lunar-flyby-broadcast.index.json`: curated entity/search index. Mention `startSeconds` / `endSeconds` use display timing; raw segment lineage is preserved as `segmentStartSeconds` / `segmentEndSeconds`.
- `artemis2-lunar-flyby-broadcast-part1.vtt` and `artemis2-lunar-flyby-broadcast-part2.vtt`: per-video fallback/external WebVTT caption files rebuilt from repaired display timings.
- `artemis2-lunar-flyby-broadcast-part1.labels.yaml` and `artemis2-lunar-flyby-broadcast-part2.labels.yaml`: speaker/provenance sidecars.

Runtime integration status:

- The Broadcast panel loads `combined.json` via `transcriptDoc`.
- Caption overlay text is rendered from the normalized JSON transcript before VTT fallback.
- The synchronized transcript panel renders all normalized transcript segments, highlights the current conversation, auto-scrolls on active-line changes, and lets users click rows to seek.
- Transcript highlighting deliberately uses a slightly forgiving readable window so very short lines are not skipped between playback ticks. Caption overlay timing remains strict to `displayStartSeconds` / `displayEndSeconds`.
- The normalizer keeps valid schema v4 display-timed segments even when raw Whisper `startSeconds` and `endSeconds` are equal. The current combined transcript contains 3,793 segments.

Important data rules:

- Treat `combined.json` as the single source of truth for unified-timeline UI.
- Use `displayStartSeconds` / `displayEndSeconds` for captions, seeking, transcript rows, and visible entity mentions.
- Treat `startSeconds` / `endSeconds` as raw Whisper provenance only.
- Use the integer Part 2 offset `22373` seconds, matching `combined.json.partOffsets.part2.start`.
- Speaker labels are inferred and should be treated as non-authoritative.

Current remaining transcript UX work:

- Entity search/browse UI from `artemis2-lunar-flyby-broadcast.index.json`.
- Speaker filter chips and deterministic speaker colors.
- Confidence-driven styling for low-confidence speakers and unidentified segments.
- Collapsing `status: duplicate` runs into a compact indicator if duplicate cues become visually noisy.

## Reference Details To Keep Out Of This File

- Full HLS packaging command: [Artemis II Media Streaming](../../operations/media/artemis2-media-streaming.md)
- Full transcript parse regex and local paths: [Artemis II Transcription And Diarization Handoff](../../evidence/handoffs/artemis2-transcription-diarization-handoff.md)
- Full media manifest update workflow: [Artemis II Media Assets](../../operations/media/artemis2-media-assets.md)
