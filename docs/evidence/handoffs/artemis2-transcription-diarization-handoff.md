# Artemis II Transcription And Diarization Handoff

> Status: context-switch handoff. Current transcript integration planning lives in [Artemis II Media Workstream](../../plans/breakdown/artemis2-media.md). Time-base decisions live in [Time Synchronization Decision Plan](../../plans/breakdown/time-synchronization.md).

This note captures the transcription/diarization context discussed on 2026-05-16 so the work can resume after a context switch.

## Verified Local Artifacts

The transcription work is in the sibling repo:

- `C:\sankar\projects\transcribe`

That repo is separate from `moon-mission`, and its `recordings/` and `transcripts/` directories are git-ignored. The useful Artemis II outputs are local generated files, not committed artifacts.

Canonical app-facing transcript files to consume:

- Part 1 JSON:
  - `C:\sankar\projects\transcribe\transcripts\artemis2-lunar-flyby-broadcast-part1.json`
- Part 2 JSON:
  - `C:\sankar\projects\transcribe\transcripts\artemis2-lunar-flyby-broadcast-part2.json`

Both JSON files are post-disambiguation. Part 1 splits Victor Glover and Jeremy Hansen out of the original merged `SPEAKER_04` cluster. Part 2 splits Reid Wiseman out of the original merged `SPEAKER_05` cluster.

Sidecar files sit alongside the JSON:

- WebVTT subtitle tracks:
  - `C:\sankar\projects\transcribe\transcripts\artemis2-lunar-flyby-broadcast-part1.vtt`
  - `C:\sankar\projects\transcribe\transcripts\artemis2-lunar-flyby-broadcast-part2.vtt`
- Speaker/provenance labels:
  - `C:\sankar\projects\transcribe\transcripts\artemis2-lunar-flyby-broadcast-part1.labels.yaml`
  - `C:\sankar\projects\transcribe\transcripts\artemis2-lunar-flyby-broadcast-part2.labels.yaml`

Source broadcast videos were found locally at:

- `C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part1.webm`
- `C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part2.webm`

Local HLS derivatives also exist under:

- `C:\tmp\moon-mission-artemis2-media\hls\artemis2-lunar-flyby\v1\`

## Current Transcript Format

The canonical JSON files use schema version 2. Each segment has:

```json
{
  "id": 412,
  "startSeconds": 3605.0,
  "endSeconds": 3610.0,
  "speaker": "JEREMY_HANSEN",
  "displaySpeaker": "Jeremy Hansen",
  "text": "to make sure this record is not long lived.",
  "status": "ok",
  "speakerConfidence": "high"
}
```

Top-level payload fields include:

- `speakers`: machine-friendly speaker map
- `statusValues`: descriptions of `status` values
- `durationHms`
- `timeBase`
- `model`
- `source`
- `schemaVersion`

Each segment's `speaker` is a canonical key that is stable for filtering/coloring. `displaySpeaker` is the user-facing label.

Timing is whole-second precision and relative to the start of each original per-part `.webm` file. The timestamps do not use the HLS stream timeline and do not use a concatenated video timeline. Each part has its own time origin at 0.

If the app concatenates the parts for playback, add `06:12:53` (`22373` seconds) to every Part 2 timestamp.

## Generation Notes

The tooling is in:

- `C:\sankar\projects\transcribe\transcribe.py`
- `C:\sankar\projects\transcribe\disambiguate_speaker04.py`

Observed generation settings from logs and project files:

- CLI used `faster-whisper` with model `large-v3`, `beam_size=5`
- Language forced to `en`
- Device was CUDA with `float16`
- `faster-whisper` was locked at `1.2.x`
- Diarization used `pyannote/speaker-diarization-3.1`
- `pyannote-audio` was locked at `3.4.0`
- Speaker-cluster disambiguation used `pyannote/wespeaker-voxceleb-resnet34-LM` embeddings and cosine-similarity matching to anchor timestamps
- The transcription run used pre-conversion from `.webm` to 16 kHz mono PCM wav to reduce Opus timestamp drift
- Earlier `_v1.txt` artifacts remain on disk for audit but had about 3 seconds of drift in places and should not be used
- Logs are local:
  - `C:\tmp\moon-mission-artemis2-media\transcribe_v2.log`
  - `C:\tmp\moon-mission-artemis2-media\disambiguate.log`

## Part 1 State

Part 1 is post-disambiguation. `SPEAKER_04` was split using voice embeddings and known anchor timestamps into:

- `VICTOR_GLOVER`
- `JEREMY_HANSEN`

The current JSON reports 471 `VICTOR_GLOVER` segments and 94 `JEREMY_HANSEN` segments from that corrected cluster. Reid Wiseman was also split by pyannote across `SPEAKER_06` and `SPEAKER_13`; both are mapped to the canonical `REID_WISEMAN` key.

## Part 2 State

Part 2 is post-disambiguation. `SPEAKER_05` originally contained both Reid Wiseman and a pre-recorded narrator. It was split into:

- `REID_WISEMAN` with 79 reassigned segments
- `PROMO_REFLECTION` with 7 reassigned segments

Reid Wiseman appears as `SPEAKER_05` after the split, `SPEAKER_11`, and `SPEAKER_14`; all are mapped to `REID_WISEMAN`.

The `UNRESOLVED` group still contains about 9 unidentified speaker IDs, mostly brief utterances. If the app surfaces them, use `displaySpeaker: "Unidentified"`.

Speaker IDs are reconciled across parts at the canonical-key level in the JSON/YAML outputs. For example, `REID_WISEMAN` in Part 1 and `REID_WISEMAN` in Part 2 refer to the same person. This is a manual mapping; pyannote did not reconcile IDs across files.

Known limitation: the output models one dominant speaker per segment. Simultaneous speech and cross-talk are not represented.

## Speaker Categories

Use these categories as the initial color/grouping hints:

| Category | Part 1 keys | Part 2 keys |
| --- | --- | --- |
| Crew, callsign Integrity | `CHRISTINA_KOCH`, `VICTOR_GLOVER`, `JEREMY_HANSEN`, `REID_WISEMAN` | `CHRISTINA_KOCH`, `VICTOR_GLOVER`, `JEREMY_HANSEN`, `REID_WISEMAN` |
| NASA PAO host / narrator | `LEAH_CHESHIER` | `LEAH_CHESHIER`, `ANNA_SCHNEIDER` |
| CAPCOM / Mission Control | `JENNY_GIBBONS`, `KELSEY_YOUNG` | `TESS_CASWELL`, `KELSEY_YOUNG`, `JEFF_RADIGAN` |
| Special guests | none | `JARED_ISAACMAN`, `PRESIDENT_TRUMP` |
| Pre-recorded / interview / package | `PROMO_DSN`, `PROMO_INTRO`, `SCIENCE_GEOLOGIST`, `SCIENCE_THEMELEAD` | `PROMO_NARRATOR`, `PROMO_REFLECTION`, `SCIENCE_TRAINING_LEAD`, `CREW_REFLECTION_A` |
| Unknown / unresolved | `UNRESOLVED`, `UNKNOWN` | `UNRESOLVED`, `UNKNOWN` |

## Segment Status Policy

Each segment includes a `status` field. Recommended default behavior:

- `ok`: display normally
- `silent`: hide by default
- `hallucination`: hide from subtitles; expose only under an explicit raw transcript mode
- `duplicate`: collapse consecutive runs into one displayed cue with a count indicator
- `garbled`: hide or replace with `[unintelligible]`

Status counts from the current artifacts:

| Status | Part 1 count | Part 2 count |
| --- | ---: | ---: |
| `ok` | 3475 | 1544 |
| `silent` | 621 | 1074 |
| `hallucination` | 139 | 124 |
| `duplicate` | 355 | 38 |
| `garbled` | 6 | 9 |

Explicit bad spans listed in `garbled_spans` in the YAML sidecars:

| Part | Range | Issue |
| --- | --- | --- |
| 1 | `01:03:41` to `01:05:41` | `"Transcription by CastingWords"` hallucination block |
| 1 | `01:28:23` to `01:29:23` | `"Transcription by CastingWords"` hallucination block |
| 2 | `00:03:26` to `00:03:57` | Mixed-language nonsense block |

Other notable flagged spans:

- Part 1, `00:00:00` to `00:01:30`: repeated `"Thank you for watching"` during intro silence; `status: "hallucination"`
- Part 2, `03:27:01` to `03:27:22`: 20+ consecutive one-second `Thank you.` cues during the Trump call; real speech but visually noisy; `status: "duplicate"`
- Part 2 Trump-call lines occasionally include injected leading prefixes such as `PRESIDENT DONALD J.` and `SECRETARY POMPEO`; strip a leading `SECRETARY POMPEO` before display

## Suggested Integration Direction

The likely app integration point is Artemis II Mission Media:

- authored manifest: `assets/artemis2/data/media-manifest.json5`
- compiled manifest: `assets/artemis2/data/media-manifest.json`
- runtime normalizer: `src/platform/js/core/domain/media-manifest.js`

The current media stream schema has a `captions` field, but it is normalized as a simple string array. For richer transcript/diarization use, prefer converting the timestamped text into app-friendly JSON and referencing it from the manifest with a richer field, such as `transcripts`, `captionTracks`, or `transcriptTracks`.

The current JSON artifacts are already app-friendly. Runtime integration should reference them rather than re-parsing the older text transcript format.

Use separate transcript JSON files for Part 1 and Part 2 unless the app has a single media stream that concatenates both parts. If concatenating, Part 2 timestamps need an offset equal to Part 1 media duration, and the speaker maps should still retain original part-local IDs.

## Timing And Animation Sync

The transcript timestamps are locked to the per-part broadcast video timelines, not to mission UTC/MET. Pre-recorded inserts break linearity to mission time even though the segment timestamps remain correct inside the `.webm`/broadcast timeline.

Transcript-derived mission time anchors:

- Part 1, about `00:07:44`: Leah says the mission is four days, 18 hours, and 30 minutes into flight. At Part 1 `t=464s`, MET is approximately `4d 18h 30m`, implying `MET = broadcast_time + (4d 18h 30m - 7m 44s)` for nearby live-broadcast portions of Part 1.
- Part 1, about `00:53:41`: the broadcast says the crew is five minutes from surpassing the Apollo 13 distance record.
- Part 1, about `01:04:49`: the broadcast says the crew passed the Apollo 13 record at 12:57 p.m. Central Time.
- Part 2, about `03:14:38`: Jared Isaacman / Trump call. No explicit MET stamp is given in the call, but it can be derived if another timeline is ingested.

If runtime needs MET/UTC throughout, ingest a separate Artemis II event timeline and align with explicit stream anchors. Do not derive full mission chronology from the transcript alone.

## Provenance And Attribution

Recommended citation block:

```text
Transcript generated locally using faster-whisper 1.2+ (model large-v3, beam_size=5, language en, GPU float16) over a 16 kHz mono PCM extraction of the source NASA broadcast .webm. Speaker diarization performed by pyannote.audio 3.4.0 with the pyannote/speaker-diarization-3.1 pipeline. Speaker-cluster disambiguation for merged voices used pyannote/wespeaker-voxceleb-resnet34-LM embeddings and cosine-similarity matching to anchor timestamps. Speaker-to-real-name attribution is best-effort by contextual inference, not endorsed by NASA, CSA, the crew, or any individual named.
```

Suggested in-app attribution:

```text
Source: NASA Artemis II lunar flyby live broadcast (Public Domain - created by NASA personnel). Transcript automatically generated and may contain errors. Speaker labels are inferred and not authoritative.
```

## Remaining Open Questions

- Should transcript/caption artifacts be committed as authored mission metadata in this repo, or staged as generated media data in `../moon-mission-data`?
- What are the exact video-stream manifest entries that the transcript tracks should attach to?
- Should the first UI exposure be subtitles, searchable transcript, speaker timeline, mission-event annotations, or metadata-only?
- Should the app expose `hallucination` spans only in a raw transcript mode, or omit them entirely from runtime payloads?
- Where should the piecewise stream segment map live once enough anchors are collected?

## Prompt For The Other Agent

This section is preserved for audit. The other agent has now answered these questions and the answers are reflected above.

```text
For Part 2, please produce a curation handoff:

1. Speaker map
- List each SPEAKER_XX label that appears in Part 2.
- For each, identify the person/role if known, or mark unknown.
- Include 2-3 representative timestamped lines per speaker.

2. Important speakers
- Which labels are crew voices?
- Which are NASA hosts/commentators?
- Which are CAPCOM / Mission Control?
- Which are pre-produced package/interview voices?

3. Problem spans
- List transcript spans that are hallucinated, garbled, duplicated, or low confidence.
- Include start/end timestamps and recommended action: keep, edit, hide, or mark uncertain.

4. Diarization issues
- Did pyannote merge multiple real speakers into one SPEAKER_XX?
- Did it split one person across multiple SPEAKER_XX labels?
- Which clusters need disambiguation like Part 1 SPEAKER_04?

5. Final recommended labels
- Provide a JSON-style mapping from raw speaker IDs to display labels.

6. Integration-ready outputs
- Confirm which Part 2 transcript file should be consumed.
- If you produce a revised/disambiguated Part 2 file, give its exact path.
```
