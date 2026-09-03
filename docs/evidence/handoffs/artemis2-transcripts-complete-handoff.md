# Artemis II Transcripts - Complete Handoff

Captured from the transcript/synthesis agent response. This document is intended to preserve the full handoff detail before integration work continues.

> 2026-05-19 update: the transcript workspace has since been reorganized under
> `C:\sankar\projects\transcribe\transcripts\artemis2\`. The current canonical
> app-facing files are under `transcripts\artemis2\outputs\`, and the runtime
> copies are committed in `../moon-mission-data/assets/artemis2/media/transcripts/`.
> The latest staged snapshot is from transcribe commit
> `b8fd81d Correct Artemis II proper noun transcripts`.

## 1. Artifact Inventory

Canonical generated artifacts now live in `C:\sankar\projects\transcribe\transcripts\artemis2\outputs\`.
Runtime copies of the app-facing artifacts are committed in `../moon-mission-data/assets/artemis2/media/transcripts/`.

### Canonical Artifacts

The app should consume these.

| File | Purpose | Size |
| --- | --- | --- |
| `artemis2-lunar-flyby-broadcast-combined.json` | Single source of truth: unified timeline, aligned words, all speakers. Use this for everything app-side. | 7.9 MB |
| `artemis2-lunar-flyby-broadcast.index.json` | Searchable entity index built from `combined.json`. | 784 KB |
| `artemis2-lunar-flyby-broadcast-part1.aligned.json` | Part 1 alone, with word-level timing. | 4.7 MB |
| `artemis2-lunar-flyby-broadcast-part2.aligned.json` | Part 2 alone, with word-level timing. | 3.0 MB |
| `artemis2-lunar-flyby-broadcast-part1.vtt` | WebVTT captions for Part 1, publish-safe. | 480 KB |
| `artemis2-lunar-flyby-broadcast-part2.vtt` | WebVTT captions for Part 2, publish-safe. | 195 KB |
| `artemis2-lunar-flyby-broadcast-part1.labels.yaml` | Speaker label reference for Part 1. | small |
| `artemis2-lunar-flyby-broadcast-part2.labels.yaml` | Speaker label reference for Part 2. | small |

### Provenance And Intermediate Artifacts

Keep these, but do not ship them.

| File | Status |
| --- | --- |
| `*_transcript_timestamped.txt` | Raw Whisper output, post-VAD, v3. Source of truth for re-running disambiguation. |
| `*_transcript_timestamped_disambiguated.txt` | After speaker-disambiguation passes. Input to `export_app_format.py`. |
| `*_transcript.txt` | Plain reading version. |
| `*_transcript_disambiguated.txt` | Plain version after disambiguation. |
| `*.json` without `.aligned` | Older app JSON before word alignment. Superseded by `.aligned.json`. |
| `INTEGRATION.md` | Earlier handoff doc, superseded by this document. |

### Obsolete Artifacts

Audit only. Do not load.

| File | Why Obsolete |
| --- | --- |
| `*_v1.txt` | Pre-preconvert run; has about 3 seconds of codec-drift timestamp errors. |
| `*_v2.txt` | Pre-VAD run; contains CastingWords/Amara hallucinations buried with real speech. |

### Recommended Artifact Homes

| Location | What Goes There |
| --- | --- |
| `moon-mission` committed | App code only. Do not put raw transcripts here; file sizes and churn would bloat git. |
| `moon-mission-data` committed, LFS-eligible | Recommended home for canonical artifacts: `combined.json`, `index.json`, `.vtt` files, both label YAMLs. They are stable, app-essential, about 10 MB total. |
| `transcribe` workspace, local-only | Generation scripts (`*.py`), intermediate `.txt` files, audio source files. Not for the app. |
| `C:\tmp\moon-mission-artemis2-media\source\*.webm` | Source media. Outside git. Keep; needed to regenerate. |

## 2. Transcript Schema

### Per-Part JSON Without Word Alignment

Files: `.json`

Schema version: `2`

Older format, superseded by `.aligned.json`. Keep only as fallback.

### Per-Part Aligned JSON

Files: `.aligned.json`

Schema version: `4`

```json
{
  "source": "artemis2-lunar-flyby-broadcast-part1.webm",
  "schemaVersion": 4,
  "model": {
    "transcription": "faster-whisper large-v3 (beam_size=5, vad_filter=True, condition_on_previous_text=False, no_repeat_ngram_size=4)",
    "diarization": "pyannote/speaker-diarization-3.1"
  },
  "durationHms": "06:12:53",
  "timeBase": "seconds, relative to source video start (.webm file timeline)",
  "alignment": {
    "method": "whisperx forced alignment via wav2vec2",
    "language": "en",
    "wordSegmentsCovered": 2264,
    "totalSegments": 2277
  },
  "statusValues": {
    "ok": "...",
    "silent": "...",
    "hallucination": "...",
    "duplicate": "...",
    "garbled": "..."
  },
  "speakers": {
    "<canonicalKey>": {
      "name": "Display name",
      "role": "Commander",
      "affiliation": "NASA",
      "confidence": "confirmed | high | medium | low | none"
    }
  },
  "segments": [
    {
      "id": 412,
      "startSeconds": 3605.0,
      "endSeconds": 3610.0,
      "displayStartSeconds": 3605.02,
      "displayEndSeconds": 3608.45,
      "speaker": "JEREMY_HANSEN",
      "displaySpeaker": "Jeremy Hansen",
      "text": "to make sure this record is not long lived.",
      "status": "ok",
      "speakerConfidence": "high",
      "words": [
        { "word": "to", "start": 3605.020, "end": 3605.121, "score": 0.92 },
        { "word": "make", "start": 3605.141, "end": 3605.302, "score": 0.97 }
      ]
    }
  ]
}
```

Segment field notes:

- `id`: integer, dense, zero-based per file.
- `startSeconds` and `endSeconds`: floats, raw Whisper segment boundaries from the file start; provenance only for display surfaces.
- `displayStartSeconds` and `displayEndSeconds`: floats, tight schema v4 display window; use for captions, transcript rows, click-to-seek, and visible entity mentions.
- `speaker`: canonical key, stable for filtering/coloring.
- `displaySpeaker`: user-facing string.
- `status`: `ok`, `silent`, `hallucination`, `duplicate`, or `garbled`.
- `speakerConfidence`: mirrors `speakers[key].confidence`.
- `words`: present only when `alignment.wordSegmentsCovered` counts it; word-level timestamps and wav2vec2 alignment scores.

### Combined JSON

File: `combined.json`

Schema version: `4`

Same segment schema as aligned JSON, including schema v4 display timing fields, plus `originPart`, `originStartSeconds`, and top-level `partOffsets`.

```json
{
  "source": "artemis2-lunar-flyby-broadcast (combined Part 1 + Part 2)",
  "schemaVersion": 4,
  "model": {},
  "alignment": {},
  "timeBase": "seconds, concatenated timeline: part1 then part2",
  "durationHms": "10:09:59",
  "partOffsets": {
    "part1": { "start": 0, "end": 22373, "durationHms": "06:12:53" },
    "part2": { "start": 22373, "end": 36599, "durationHms": "03:57:06" }
  },
  "speakers": {},
  "segments": [
    {
      "startSeconds": 25978.0,
      "endSeconds": 25983.0,
      "displayStartSeconds": 25978.02,
      "displayEndSeconds": 25980.45,
      "originPart": "part2",
      "originStartSeconds": 3605.0,
      "words": [
        { "word": "...", "start": 25978.020 }
      ]
    }
  ]
}
```

Combined JSON notes:

- `startSeconds`, `endSeconds`, `displayStartSeconds`, and `displayEndSeconds` are shifted into the combined timeline.
- `originPart` is `"part1"` or `"part2"`.
- `originStartSeconds` is the original per-part timestamp before shifting.
- `words[].start` and `words[].end` are also shifted into the combined timeline.
- Speakers are merged; Part 2 wins on collisions because it has the more complete speaker roster.

### Field Semantics

| Field | Meaning |
| --- | --- |
| `id` | Per-file integer, dense, zero-based. Combined IDs are renumbered: Part 1 keeps its IDs; Part 2 gets `previousMaxId + 1` upward. Do not assume a Part 2 combined ID equals its per-part ID. |
| `startSeconds` / `endSeconds` | Raw Whisper segment boundaries from the time-base origin. In per-part JSON, origin is the start of that part's `.webm`; in combined JSON, origin is the start of Part 1's `.webm`, with Part 2 shifted by `partOffsets.part2.start`. Treat these as provenance only for display surfaces. |
| `displayStartSeconds` / `displayEndSeconds` | Tight schema v4 display window from word timing or repair heuristics. Use these for captions, transcript rows, click-to-seek, and visible entity mentions. |
| `originStartSeconds` | Combined JSON only. The original per-part `startSeconds` before shifting. Use this to map back to per-part `.vtt` cues or to re-run alignment. |
| `originPart` | Combined JSON only. `"part1"` or `"part2"`. |
| `speaker` | Canonical key, machine-readable. Stable across all artifacts. Use as filter chip / CSS class. |
| `displaySpeaker` | Human-readable name. Falls back to speaker key if unmapped. |
| `status` | Drives display policy. By default the export drops `silent`, `hallucination`, and `garbled` from `.json` and `.vtt`; `ok` and `duplicate` remain. |
| `speakerConfidence` | Per-speaker confidence carried into every segment. Use for italic/dimmed rendering of low-confidence speakers. |
| `words[].start` / `words[].end` | Word-level timestamps, about 50 ms precision. `score` is wav2vec2 alignment confidence from 0 to 1. |

### JSON Variant Differences

| Variant | Has Segments | Has Words | Speaker Labels | Timeline | Hallucinations Dropped |
| --- | --- | --- | --- | --- | --- |
| `.json` legacy | yes | no | yes | per-part | yes |
| `.aligned.json` | yes | yes, about 99% | yes | per-part | yes |
| `combined.json` | yes | yes, about 99% | yes, merged | unified | yes |
| `_transcript_timestamped*.txt` | text-format | no | yes | per-part | no; raw, contains hallucinations |

## 3. Timing Model

### Time Bases

| Base | Where It Lives | How To Compute |
| --- | --- | --- |
| Part 1 local time | Per-part Part 1 JSON / `.vtt`. Origin is first frame of `part1.webm`. | direct |
| Part 2 local time | Per-part Part 2 JSON / `.vtt`. Origin is first frame of `part2.webm`. | direct |
| Combined timeline | `combined.json`. Origin is first frame of `part1.webm`; Part 2 shifted forward by Part 1 duration. | `combined_t = part1_t` or `partOffset + part2_t` |
| Mission UTC / MET | Not stored. Must be derived from text anchors. | requires lookup table |

### Part 2 Offset: `22373` Versus `22373.268`

Use `22373` integer seconds. That is what `combined.json.partOffsets.part2.start` contains and what the concat script applied.

Why both numbers exist:

- `22373` is Part 1's reported `durationHms` value, `06:12:53`, converted to seconds. This uses whole-second precision because Whisper segment timestamps are second-resolution.
- `22373.268` is Part 1's exact audio duration in samples / 16000 Hz. This is the physically correct concatenation point if splicing raw audio.

For app sync:

- Use `22373` everywhere for consistency with the produced JSON.
- The 0.27 second difference is below the resolution of segment-level captions, which are already about plus/minus 1 second from Whisper, and is barely noticeable in word-level highlighting.
- Do not mix the two values; using `22373.268` in one place and `22373` elsewhere creates a user-visible inconsistency.
- If animation needs frame-accurate sync with a single concatenated video file, re-run `ffprobe` on the actual concatenated MP4/HLS to get its sample-accurate part-boundary timestamp and apply that to the combined JSON.

### Mission-Time Anchors In The Transcript

These are narration mentions, not embedded metadata. They are reliable enough for about plus/minus 1 minute precision, not for frame-accurate sync.

| Per-Part Time | Narrator Says | What It Anchors |
| --- | --- | --- |
| Part 1, about `00:07:44` | "We are now four days, 18 hours, and 30 minutes into the flight" | MET is approximately `4d 18h 30m` at that broadcast moment. |
| Part 1, about `01:04:49` | "passed the record set by Apollo 13 ... at 12:57 p.m. Central Time" | UTC anchor for Apollo 13 record passage. |
| Part 1, about `00:53:41` | "five minutes from surpassing the Apollo 13 record" | Confirms the Apollo 13 record passage anchor. |
| Part 2, about `03:14:38` | Jared Isaacman comm check + Trump call begins | UTC anchor pinpointable from public news. |
| Part 2, about `03:15:11` | "Today you've made history" -- Trump call start | Anchor. |

For MET / UTC display in the app: derive a small `metAnchors` sidecar from these and interpolate linearly between anchors. This has not been done yet and would be a small effort.

### What Still Needs Piecewise Stream Mapping

- HLS chunk boundaries versus combined JSON timestamps. HLS segments are not at `22373s` boundaries, so word-level cue rendering may need byte-range or playlist-aware seeking. Untested.
- Mission UTC requires a manual lookup, such as NASA's published Artemis II timeline, to convert MET to wall-clock.

## 4. Diarization And Speaker Curation

### Pipeline

Current canonical run: v3.

```text
.webm
  -> ffmpeg (16 kHz mono PCM wav)
  -> faster-whisper large-v3
       beam_size=5
       vad_filter=True
       condition_on_previous_text=False
       no_repeat_ngram_size=4
       language="en"
       device="cuda"
       compute_type="float16"
       -> segments, about whole-second timestamps
  -> pyannote/speaker-diarization-3.1
       uses pyannote/segmentation-3.0 + pyannote/wespeaker-voxceleb-resnet34-LM
       -> speaker turns
  -> assign_speakers() in transcribe.py
       max time-overlap
       -> labeled segments
  -> disambiguate_speaker04.py
       per merged cluster
       -> split labels such as VICTOR_GLOVER, JEREMY_HANSEN
  -> export_app_format.py + labels YAML
       -> .json + .vtt, publish-safe
  -> align_words.py
       WhisperX forced alignment
       -> .aligned.json, word-level
  -> concat_parts.py
       -> combined.json
  -> build_index.py
       -> index.json
```

### Models And Versions

- `faster-whisper >= 1.2.0` with model `large-v3`
- `pyannote.audio 3.4.0`
- `whisperx 3.4.5` for alignment only, not transcription
- `transformers 5.8.1` as transitive dependency
- `torch` with CUDA 12.1
- system `ffmpeg`

### Final Canonical Speaker Roster: Part 1

Part 1 has 13 entries and 21 raw IDs covered.

| Canonical Key | Display | Role | Confidence |
| --- | --- | --- | --- |
| `CHRISTINA_KOCH` | Christina Koch | Mission Specialist 1, NASA | confirmed |
| `VICTOR_GLOVER` | Victor Glover | Pilot, NASA | high |
| `JEREMY_HANSEN` | Jeremy Hansen | Mission Specialist 2, CSA | high |
| `REID_WISEMAN` | Reid Wiseman | Commander, NASA | high |
| `LEAH_CHESHIER` | Leah Cheshier-Mustachio | NASA PAO Host | confirmed |
| `JENNY_GIBBONS` | Jenny Gibbons | CAPCOM, CSA astronaut | confirmed |
| `KELSEY_YOUNG` | Kelsey Evans Young | Artemis Science Flight Ops Lead, NASA | confirmed |
| `PROMO_DSN`, `PROMO_INTRO` | NASA promotional narrators | pre-recorded | confirmed/medium |
| `SCIENCE_THEMELEAD`, `SCIENCE_GEOLOGIST` | NASA science team interviewees | merged into Kelsey where confirmed | low |
| `UNRESOLVED` | Unidentified | various | none |
| `UNKNOWN` | unattributed speech | Whisper produced but no pyannote turn | none |

### Final Canonical Speaker Roster: Part 2

Part 2 has 16 entries.

| Canonical Key | Display | Role | Confidence |
| --- | --- | --- | --- |
| `LEAH_CHESHIER` | Leah Cheshier-Mustachio | PAO host, first half | confirmed |
| `ANNA_SCHNEIDER` | Anna Schneider | PAO host, overnight shift | confirmed |
| `JARED_ISAACMAN` | Jared Isaacman | NASA Administrator | confirmed |
| `PRESIDENT_TRUMP` | Donald J. Trump | President of the United States | confirmed |
| `TESS_CASWELL` | Tess Caswell | CAPCOM, Orbit 2 | confirmed |
| `JEFF_RADIGAN` | Jeff Radigan | Flight Director, Orbit 1 | high |
| `REID_WISEMAN` | Reid Wiseman | Commander | high |
| `VICTOR_GLOVER` | Victor Glover | Pilot | high |
| `JEREMY_HANSEN` | Jeremy Hansen | Mission Specialist 2 | high |
| `KELSEY_YOUNG` | Kelsey Evans Young | Science Flight Ops Lead | confirmed |
| `ANGELA_GARCIA` | Angela Garcia | Artemis II Science Officer, late shift | confirmed |
| `MARIE_HENDERSON` | Marie Henderson | Artemis II Lunar Science Deputy Lead | confirmed |
| `PROMO_NARRATOR`, `PROMO_REFLECTION` | NASA promotional narrators | pre-recorded | high/medium |
| `SCIENCE_OFFICER` | Science Officer / PAO mixed | unsplittable cluster | low |
| `UNRESOLVED` | Unidentified | various | none |
| `UNKNOWN` | unattributed speech | | none |

### Manual Disambiguation Log

Voice-embedding cosine-similarity disambiguation passes completed:

| Pass | Part | Cluster Split | Anchors Used | Outcome |
| --- | --- | --- | --- | --- |
| 1 | Part 1 | `SPEAKER_04 -> VICTOR_GLOVER + JEREMY_HANSEN` | Victor: `04:24:51`, "Genesis, Maya, Joya, Corinne"; Jeremy: `00:59:50`, milestone speech | Clean. Margin `0.17`. |
| 2 | Part 2 | `SPEAKER_05 -> REID_WISEMAN + PROMO_REFLECTION` | Reid: `03:41:43`, post-Trump interview; Promo: `00:01:28`, intro | Clean. Margin `0.19`. |
| 3 | Part 2 | `SPEAKER_15 -> VICTOR_GLOVER + SCIENCE_OFFICER` | Victor: `01:51:33`, eclipse observation; Science: `02:02:09`, "Thank you Victor" | Partially clean. Margin `0.17`. `SCIENCE_OFFICER` cluster is itself mixed. |
| 4 | Part 2 | `SPEAKER_17 -> REID_WISEMAN + PROMO_NARRATOR` | Reid: `03:14:40`, comm check; Promo: `00:55:50` | Mixed result. Margin `0.08`. About 3 of 5 `PROMO` segments may be Reid. |
| 5 | Part 2 | `SCIENCE_OFFICER -> 3-way`, Victor / Anna / Kelsey | Attempted, then reverted | Failed. Voices too acoustically similar. Reverted. |

Cross-part voice-embedding verification:

| Speaker | Cosine Similarity Across Parts | Verdict |
| --- | ---: | --- |
| `LEAH_CHESHIER` | 0.92 | same person confirmed |
| `KELSEY_YOUNG` | 0.86 | same person confirmed |
| `VICTOR_GLOVER` | 0.48 | Borderline; likely same, some cluster dilution |
| `REID_WISEMAN` | 0.44 | Borderline |
| `JEREMY_HANSEN` | 0.40 | Borderline |

The borderline crew similarities are most likely acoustic variation across recording contexts, live versus interview versus Trump call, not misattribution.

### Known Bad Spans

| Severity | Issue | Status In JSON |
| --- | --- | --- |
| Medium | Garbled "mascara" block, Part 2 `00:03:26` to `00:03:57`. | tagged `garbled`, dropped |
| Medium | CastingWords/Amara hallucinations, Part 1 multiple spans and Part 2 `01:56:57+`. | tagged `hallucination`, dropped |
| Medium | "Thank you" repetition loop during Trump call, about 20 cues. | tagged `duplicate`, may be displayed as a single collapsed cue |
| Low | Whisper inserts `SECRETARY POMPEO` / `PRESIDENT DONALD J.` prefixes in Trump-call segments. | still present in `.text`; recommend regex strip before display |
| Low | Some `UNRESOLVED` content in Part 2, about 191 segments / 11 small clusters. | shown as "Unidentified" |
| Low | Word score below `0.3` on some words means unreliable timing. | use as confidence threshold for word highlighting |

Default display policy, already applied to `.json` / `.vtt`:

- drop `silent`
- drop `hallucination`
- drop `garbled`
- keep `ok`
- keep `duplicate`
- show `UNRESOLVED` / `UNKNOWN` as "Unidentified speaker"

## 5. Caption MVP

The transcript agent had not read `build-artemis2-broadcast-captions.mjs`; this section records what the agent said is needed and recommended.

### Canonical WebVTT Generation

```powershell
cd C:\sankar\projects\transcribe
uv run python export_app_format.py `
  transcripts/artemis2-lunar-flyby-broadcast-part1_transcript_timestamped_disambiguated.txt `
  transcripts/artemis2-lunar-flyby-broadcast-part1.labels.yaml `
  --out-stem transcripts/artemis2-lunar-flyby-broadcast-part1
```

This outputs `part1.vtt` and `part1.json`. The equivalent command applies for Part 2 with the Part 2 transcript and labels YAML.

### Rules Applied By `export_app_format.py`

- Format: standard WebVTT with `<v Speaker Name>...</v>` voice tags.
- Hidden by default:
  - `status: silent`, blank or `.` only
  - `status: hallucination`, CastingWords/Amara/"Thank you for watching" patterns
  - `status: garbled`, manually listed time ranges in `labels.yaml` under `garbled_spans`
- Kept:
  - `status: ok`
  - `status: duplicate`, not collapsed in VTT; comes through as multiple cues, up to UI to collapse
- Speaker prefix rule:
  - every cue starts with `<v ${displaySpeaker}>` and ends with `</v>`
  - `UNKNOWN` gets `<v Unattributed speech>`
  - `UNRESOLVED` gets `<v Unidentified>`
- Time format: `HH:MM:SS.000`; millisecond precision in cue tags, but values are quantized to whole seconds because Whisper segment timestamps are second-precision.
- Provenance text is not embedded in the VTT. It belongs at the app level.

### Native Browser Tracks Versus Custom Rendering

Either works:

- Native `<track kind="subtitles" src="...vtt">`: simplest. Browsers display voice-tag `<v>` text as a styled prefix automatically in Safari or strip it in some Chrome modes. Speaker filtering / coloring requires JS.
- Custom rendering from JSON: recommended for speaker filter chips, click-to-seek, search highlighting, or per-word highlighting. Use the segment list directly. VTT is then mostly for non-app contexts such as direct video downloads.

Recommendation: app renders from JSON for the rich UI, and VTT exists for fallback / external use.

### Tests

The transcript agent added zero automated tests.

Recommended app-side tests:

- Snapshot test: `combined.json` parses, every segment has required fields, every speaker key referenced in segments exists in `speakers`.
- Property test: every segment's `startSeconds <= endSeconds`.
- Property test: combined JSON segments are sorted by `startSeconds`.
- Property test: no segment text contains `castingwords`, `amara`, or `subtitles by`, as a paranoid hallucination check.

## 6. Synthesis / Search / Index

### Purpose Of `build_index.py`

Convert the flat transcript into an entity-indexed, alias-searchable structure so the app can:

- show all segments mentioning a named entity, such as Mare Orientale, Reid, or Eclipse
- browse all entities by category
- resolve user search terms through an alias map

### Index Schema

```json
{
  "schemaVersion": 1,
  "source": "artemis2-lunar-flyby-broadcast (combined Part 1 + Part 2)",
  "durationHms": "10:09:59",
  "totalEntities": 71,
  "totalMentions": 1646,
  "categories": {
    "<category>": {
      "title": "Lunar Features",
      "entityCount": 13,
      "entities": ["<slug>", "<slug>"]
    }
  },
  "aliasIndex": {
    "<lowercased search string>": "<entity slug>"
  },
  "entities": {
    "<slug>": {
      "slug": "mare_orientale",
      "displayName": "Mare Orientale",
      "category": "lunar_features",
      "subcategory": "basin",
      "description": "Large multi-ring impact basin on the lunar far side ...",
      "aliases": ["oriental", "orientale", "mare orientale", "oriental basin"],
      "mentionCount": 35,
      "speakerKey": "REID_WISEMAN",
      "mentions": [
        {
          "segmentId": 1453,
          "part": "part1",
          "startSeconds": 7497.0,
          "endSeconds": 7501.0,
          "originStartSeconds": 7497.0,
          "speaker": "LEAH_CHESHIER",
          "displaySpeaker": "Leah Cheshier-Mustachio",
          "text": "you also heard Glover mention oriental",
          "matchedAliases": ["oriental"]
        }
      ]
    }
  }
}
```

Notes:

- `categories[].entities` are sorted by mention count descending.
- `speakerKey` is optional and only for people category.
- `mentions[].startSeconds` is in the combined timeline.
- `mentions[].originStartSeconds` is per-part timeline, and for Part 2 differs from `startSeconds`.

### Categories And Counts

| Category | Entities | Mentions |
| --- | ---: | ---: |
| `people` | 20 | 427 |
| `spacecraft` | 6 | 392 |
| `mission_events` | 7 | 224 |
| `astronomical_phenomena` | 11 | 186 |
| `facilities` | 3 | 114 |
| `lunar_features` | 13 | 113 |
| `equipment` | 6 | 79 |
| `roles` | 3 | 56 |
| `historical_references` | 2 | 55 |

### Alias Matching

- Aliases in the catalog are plain strings.
- `compile_patterns()` wraps each plain string with `\b...\b` word boundaries and `re.IGNORECASE`.
- Multi-word aliases such as `apollo 13` and `south pole-aitken` are matched as literal text with word-boundary anchors.
- For raw regex, rare and defined as anything containing `\`, `[`, `]`, `{`, `}`, or `|`, the alias is used as-is.
- `aliasIndex` is built from cleaned plain-string aliases: regex characters stripped and whitespace normalized.

### Manually Authored Versus Auto-Generated Entities

Manually curated in `ENTITY_CATALOG` and `ADDITIONAL_PEOPLE`:

- lunar features
- astronomical phenomena
- events
- spacecraft
- equipment
- facilities
- roles
- historical references
- additional people, 12 family/staff entries

Generated from `combined.json.speakers` via `_make_speaker_entity()`:

- most people entries
- aliases: full name + last name + first name, case-insensitive and at least 3 characters

Promotional, unidentified, and generic speaker entries are intentionally excluded from the person entity list.

### App Usage

For "search what's said about X":

```js
// 1. User types "saturn setting"
const term = userInput.trim().toLowerCase();

// 2. Resolve to entity slug
const slug = index.aliasIndex[term]; // -> "saturnset"
if (!slug) {
  // No direct alias hit. Fall back to substring search in alias keys,
  // or full-text search in segment text via the JSON.
}

// 3. Render the entity card + mentions
const entity = index.entities[slug];
// entity.displayName, entity.description, entity.mentionCount
// entity.mentions[] -> list of {startSeconds, displaySpeaker, text, ...}

// 4. Each mention's startSeconds is in COMBINED timeline.
// Click a mention -> videoElement.currentTime = mention.startSeconds
```

For browsing by category:

```js
const lunarFeatures = index.categories["lunar_features"].entities;
// -> ["mare_orientale", "south_pole_aitken_basin", "vavilov_crater", ...]
// Iterate and show each as a filter chip.
```

For "show all entities mentioned in this segment", the index does not currently expose a segment-to-entities map. Build it client-side on first load:

```js
const segmentToEntities = {};
for (const [slug, ent] of Object.entries(index.entities)) {
  for (const m of ent.mentions) {
    (segmentToEntities[m.segmentId] ||= []).push(slug);
  }
}
```

### Worked Examples

| User Query | `aliasIndex` Resolves To | Entity | Mentions |
| --- | --- | --- | ---: |
| `oriental` | `mare_orientale` | Mare Orientale | 35 |
| `Saturn setting` | `saturnset` | Saturn setting behind the Moon | 2 |
| `earth set` | `earthset` | Earthset | 9 |
| `Apollo 13` | `apollo_13_record_passage` | Apollo 13 distance record passage | 26 |
| `Reid` | `reid_wiseman` | Reid Wiseman | 58 |
| `eclipse` | `solar_eclipse` | Solar Eclipse from the Moon | 86 |
| `integrity` | `integrity_callsign` | Integrity, Orion call sign | 100 |

## 7. App Integration Proposal

### Recommended Manifest Fields

Add to `media-manifest.json5`:

```json5
{
  "artemis2_lunar_flyby_broadcast": {
    // existing
    "captionTracks": [
      { "lang": "en", "src": "transcripts/artemis2-lunar-flyby-broadcast-part1.vtt", "appliesTo": "part1" },
      { "lang": "en", "src": "transcripts/artemis2-lunar-flyby-broadcast-part2.vtt", "appliesTo": "part2" }
    ],

    // recommended new
    "transcriptDoc": "transcripts/artemis2-lunar-flyby-broadcast-combined.json",
    "searchIndex": "transcripts/artemis2-lunar-flyby-broadcast.index.json",
    "speakerMap": {
      "source": "transcripts/artemis2-lunar-flyby-broadcast-combined.json",
      "field": "speakers"
    },
    "partOffsets": {
      "part1": { "start": 0, "end": 22373 },
      "part2": { "start": 22373, "end": 36599 }
    }
  }
}
```

Avoid duplicating speaker metadata in the manifest. Read it from the combined JSON `speakers` field at runtime.

### Search Results To Video Seek

- Combined JSON timeline assumes the player loads concatenated video.
- If the player loads parts separately, map combined `startSeconds` back to per-part using `originPart` and `originStartSeconds`.
- For per-segment seek:
  - combined player: `player.currentTime = mention.startSeconds`
  - per-part player: `player.currentTime = mention.originStartSeconds`
- For word-level seek, use `segments[].words[].start` from combined JSON. These timestamps are already shifted.

### Relationship To App Surfaces

| Surface | Data Source | Relationship To Transcripts |
| --- | --- | --- |
| Captions, existing | `.vtt` per part | Direct subtitle display. |
| Transcript panel | `combined.json` segments | Scrollable, click-to-seek, speaker-filtered. |
| Mission timeline markers | `index.json.entities` filtered to `category=mission_events` | Plot LOS / AOS / closest approach as time markers. |
| Event search | `index.json` keyed by category | Browse by category, click to mentions list, seek. |
| Object/entity filter | `index.json.entities` by `category=lunar_features` | "Show me when they talk about Vavilov." |
| Speaker filter | `combined.json.speakers` | Color-coded segment chips; filter "only Reid." |

### Minimum Useful UI After Captions

In order of impact:

1. Transcript panel with scroll-to-current-time and click-to-seek. Estimated 1-2 days given the JSON already exists.
2. Speaker filter chips above the panel; toggle each speaker on/off. Color from canonical key using a deterministic palette.
3. Search box that resolves through `aliasIndex` and shows entity card + mentions list. Click mention to seek.
4. Entity browse view: category list, expand to entities, expand entity to mentions.
5. Timeline markers for major events: eclipse start/end, Apollo 13 record, Trump call, etc. Read directly from `index.json` `mission_events` category.

## 8. Quality And Risk

### Trustworthy To Publish

- All cleaned cue text in `.vtt` and `.json` with `status: ok`.
- Speaker labels with `confidence: confirmed` or `high`.
- Word-level timestamps within plus/minus 100 ms when `word.score > 0.5`.
- Mission event entity references, including Apollo 13 record, eclipse, LOS, AOS.
- Lunar feature mentions, including Mare Orientale and named craters.

### Show With A Warning Label

- Speaker labels with `confidence: medium` or `low`, such as `SCIENCE_OFFICER` mixed cluster and `PROMO_REFLECTION`.
- `Unidentified` / `UNRESOLVED` segments, clearly marked as unattributed.
- Word timestamps with `score < 0.3`; low confidence, do not karaoke-highlight.
- Any display of "Marie Henderson" or speaker attributions; these are inferred, not authoritative.

### Hide Unless Raw Or Debug Mode

- All segments with status in `{silent, hallucination, garbled, duplicate}`. Most are already dropped, but `duplicate` and any others marked still in JSON are for audit.
- Whisper artifacts in Trump-call text: `SECRETARY POMPEO`, `PRESIDENT DONALD J.` prefixes.
- The garbled mascara block, already excluded by status, but worth a manual filter against the time range.

### Recommended Provenance Language

```text
Source: NASA Artemis II lunar flyby live broadcast (U.S. Public Domain - NASA-produced media). Transcript and word-level timestamps automatically generated with faster-whisper large-v3 and WhisperX. Speaker identification performed via pyannote.audio diarization plus manual context-based attribution; some labels are inferred and may contain errors.
```

### Highest-Risk Inaccuracies

1. Speaker attribution on borderline-confidence clusters, particularly `SCIENCE_OFFICER`, 50 segments labeled as "Science Officer / PAO mixed", and about 5 `PROMO_NARRATOR` segments in Part 2 that may actually be Reid.
2. Crew cross-part identity: `0.40` to `0.48` cosine similarity between Part 1 and Part 2 crew labels could indicate genuine misattribution in either part. Treat individual crew quotes attributed to a specific crew member as about 80% reliable.
3. Transcribed lunar-feature names: Whisper transcribed "Mare Orientale" variously as "Oriental" and "Orient Hall"; the latter was manually corrected to "Oriental". Other lunar features may have similar mistranscriptions not yet caught.
4. Words with `score < 0.3` in `.aligned.json`: alignment failed on those words; their timestamps are essentially segment-level fallback.
5. Trump call name-prefix artifacts: text contains spurious `SECRETARY POMPEO` tags. Pompeo was not on the call.
6. Whole-second timestamp precision for segment boundaries: word-level `words[].start` / `words[].end` is about 50 ms, but segment-level is about 1 second. Use word-level for fine-grained UI.

## 9. Reproduction

### Required Environment

- Python 3.12 + `uv`
- NVIDIA GPU with CUDA 12.1; the run used an RTX 4070 Laptop
- `ffmpeg` on `PATH`
- About 5 GB GPU memory for Whisper, 3 GB for pyannote, and 2 GB for wav2vec2
- HuggingFace token, `HF_TOKEN` env var or `.env` as `HUGGING_FACE_TOKEN`
- License acceptance at:
  - `https://huggingface.co/pyannote/speaker-diarization-3.1`
  - `https://huggingface.co/pyannote/segmentation-3.0`
- Source `.webm` files at `C:\tmp\moon-mission-artemis2-media\source\`, about 7.6 GB

Dependencies, already pinned in `pyproject.toml`:

- `faster-whisper >= 1.2.0`
- `pyannote.audio >= 3.1`, optional extra `diarize`
- `whisperx 3.4.5`, for word alignment
- `pyyaml >= 6.0.3`
- `torch`, `torchaudio`, `torchvision`, via CUDA 12.1 index

Setup:

```powershell
cd C:\sankar\projects\transcribe
uv sync --extra diarize
uv add whisperx # if not already installed
```

### Full Pipeline

Expensive: about 2 hours total.

```powershell
cd C:\sankar\projects\transcribe

# 1. Transcribe + diarize Part 1 and Part 2 (~95 min, GPU-bound)
uv run python transcribe.py `
  "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part1.webm" `
  "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part2.webm" `
  --model large-v3 --diarize --preconvert

# 2a. Disambiguate Part 1 Victor/Jeremy (~5 min)
uv run python disambiguate_speaker04.py `
  --target-speaker SPEAKER_04 `
  --anchor VICTOR_GLOVER=04:24:51 `
  --anchor JEREMY_HANSEN=00:59:50

# 2b. Disambiguate Part 2 SPEAKER_05, Reid / Promo (~5 min)
uv run python disambiguate_speaker04.py `
  --audio "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part2.webm" `
  --transcript transcripts/artemis2-lunar-flyby-broadcast-part2_transcript_timestamped.txt `
  --target-speaker SPEAKER_05 `
  --anchor REID_WISEMAN=03:41:43 `
  --anchor PROMO_REFLECTION=00:01:28

# 2c. Disambiguate Part 2 SPEAKER_15, Victor / Science Officer (~5 min)
uv run python disambiguate_speaker04.py `
  --audio "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part2.webm" `
  --transcript transcripts/artemis2-lunar-flyby-broadcast-part2_transcript_timestamped_disambiguated.txt `
  --out transcripts/artemis2-lunar-flyby-broadcast-part2_transcript_timestamped_disambiguated.txt `
  --target-speaker SPEAKER_15 `
  --anchor VICTOR_GLOVER=01:51:33 `
  --anchor SCIENCE_OFFICER=02:02:09

# 2d. Disambiguate Part 2 SPEAKER_17, Reid / Promo (~5 min)
uv run python disambiguate_speaker04.py `
  --audio "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part2.webm" `
  --transcript transcripts/artemis2-lunar-flyby-broadcast-part2_transcript_timestamped_disambiguated.txt `
  --out transcripts/artemis2-lunar-flyby-broadcast-part2_transcript_timestamped_disambiguated.txt `
  --target-speaker SPEAKER_17 `
  --anchor REID_WISEMAN=03:14:40 `
  --anchor PROMO_NARRATOR=00:55:50

# 3. Export per-part app JSON + WebVTT (fast, < 1 min)
uv run python export_app_format.py `
  transcripts/artemis2-lunar-flyby-broadcast-part1_transcript_timestamped_disambiguated.txt `
  transcripts/artemis2-lunar-flyby-broadcast-part1.labels.yaml `
  --out-stem transcripts/artemis2-lunar-flyby-broadcast-part1

uv run python export_app_format.py `
  transcripts/artemis2-lunar-flyby-broadcast-part2_transcript_timestamped_disambiguated.txt `
  transcripts/artemis2-lunar-flyby-broadcast-part2.labels.yaml `
  --out-stem transcripts/artemis2-lunar-flyby-broadcast-part2

# 4. Word-level alignment (~15-20 min total, GPU-bound)
uv run python align_words.py `
  --audio "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part1.webm" `
  --in-json transcripts/artemis2-lunar-flyby-broadcast-part1.json `
  --out-json transcripts/artemis2-lunar-flyby-broadcast-part1.aligned.json

uv run python align_words.py `
  --audio "C:\tmp\moon-mission-artemis2-media\source\artemis2-lunar-flyby-broadcast-part2.webm" `
  --in-json transcripts/artemis2-lunar-flyby-broadcast-part2.json `
  --out-json transcripts/artemis2-lunar-flyby-broadcast-part2.aligned.json

# 5. Concatenated timeline (fast, < 1 min)
uv run python concat_parts.py `
  --part1 transcripts/artemis2-lunar-flyby-broadcast-part1.aligned.json `
  --part2 transcripts/artemis2-lunar-flyby-broadcast-part2.aligned.json `
  --out transcripts/artemis2-lunar-flyby-broadcast-combined.json

# 6. Build searchable index (fast, < 5 sec)
uv run python build_index.py

# Optional: cross-part speaker verification (~3 min, diagnostic only)
uv run python verify_cross_part_speakers.py
```

### Cost Summary

| Stage | Time | GPU | Frequency |
| --- | --- | --- | --- |
| Transcribe + diarize | about 95 min | yes | Re-run only if source changes or model upgrades. |
| Disambiguation, 4 passes | about 20 min | yes | Re-run only if anchors change. |
| Export app JSON / VTT | less than 1 min | no | Re-run after any disambiguation or label edit. |
| Word alignment | about 20 min | yes | Re-run when transcripts change. |
| Concatenate | less than 1 min | no | Re-run after alignment. |
| Build index | less than 5 sec | no | Re-run after any text/label change or after adding entities. |

The fast steps, export, concat, and index, are safe to run repeatedly.

## 10. Remaining Work

### App Code: `moon-mission`

1. `[Done]` Switch caption rendering to read from `combined.json` segments. Keep `.vtt` as fallback / external export.
2. `[Done]` Add manifest fields `transcriptDoc`, `searchIndex`, and `partOffsets`.
3. `[Done]` Build a transcript panel: scroll-sync to `currentTime`, click-to-seek.
4. `[P1]` Add speaker filter chips with deterministic color palette.
5. `[P1]` Wire a search box to `aliasIndex` plus entity card display.
6. `[Done/defense-in-depth]` Strip Whisper artifact prefixes such as `SECRETARY POMPEO` and `PRESIDENT DONALD J.` before display. The current data-generation pipeline also removes known artifacts and proper-noun errors.
7. `[P2]` Render `duplicate` cues as a collapsed `xN` indicator instead of N separate cues.
8. `[P2]` Add confidence-driven styling: italic / dim low-confidence speakers.

### Data Staging: `moon-mission-data`

1. `[Done]` Canonical runtime home is `../moon-mission-data/assets/artemis2/media/transcripts/`.
2. `[Done]` Add a README in that directory pointing to this handoff doc and the regeneration commands.
3. `[P1]` Commit a `regenerate.md`, or move Section 9 content there, so anyone can rebuild from source.
4. `[P2]` Decide whether `INTEGRATION.md` from the `transcribe` workspace migrates here.

### UX

1. `[Done]` Captions: runtime now renders custom caption text from JSON; `.vtt` remains fallback/external caption data.
2. `[Done]` Transcript panel layout: implemented inside the Broadcast panel below video, with click-to-jump behavior and auto-scroll.
3. `[P1]` Decide how `UNRESOLVED` / `UNKNOWN` are displayed: italic "Unidentified", or hidden by default with toggle?
4. `[P2]` Entity browser UX: category list -> entity list -> mentions list.
5. `[P2]` Mission-event timeline markers above the player.

### Verification

1. `[Done/continue spot-checking]` Smoke test: load `combined.json` in app, scroll, seek, confirm cues render in sync.
2. `[P1]` Spot-check 20 random word-level timestamps against the actual video; confirm drift is at or below 200 ms.
3. `[P1]` Spot-check borderline-confidence segments, such as the `SCIENCE_OFFICER` mixed cluster; confirm labels are tolerable.
4. `[P2]` Add the property tests listed in Section 5.
5. `[P2]` Add search regression tests: assert user-typed terms such as `Saturn setting`, `Mare Orientale`, and `Reid` resolve to non-empty results.

### Intentionally Left Unfinished

- Mission UTC / MET sidecar: anchors are documented in Section 3 but no machine-readable map has been produced. Small project.
- `SCIENCE_OFFICER` cluster split: tried, failed. Voices are acoustically too similar. Left as low-confidence "mixed" cluster.
- Trevor Graff identification: third Artemis II Science Officer; mentioned by Angela but never spoke on-air, or his cluster was not surfaced.
- Object/event extraction via LLM: stated next step. The index gives a curated seed catalog to bootstrap from.
- Concatenated video file: a concatenated JSON timeline was produced; no actual concatenated MP4/HLS was created.
- JSON Schema: formal validation schema not authored. Suggested in Section 5.
- WhisperX word alignment for about 13 short/silent segments: covered 99.4%, not 100%.
- Cleanup of `_disambiguated_disambiguated.txt` file generation: happens as a side effect of running disambiguation on already-disambiguated input. The files are cleaned up manually, but the script could be patched to avoid producing them. Cosmetic only.

## 11. Schema v4 Display Timing Addendum

After the first app integration, jump-to-time testing found stale captions caused by raw Whisper segment boundaries that extended far beyond the spoken words. The app should treat `startSeconds` / `endSeconds` as provenance ranges and use `displayStartSeconds` / `displayEndSeconds` for caption display and user-facing mention timing.

Transcript agent findings:

- 56 of 3,794 segments, about 1.5%, had more than 60 seconds of trailing silence after their last word.
- 2 segments had more than 300 seconds of trailing silence; the maximum was segment `3223` at 421 seconds.
- Median trailing silence was 0.02 seconds; this was a long-tail issue, not a general offset issue.
- Breakdown: 29 affected segments in Part 1, 27 in Part 2.
- Root cause: faster-whisper large-v3 with `vad_filter=True`; VAD-filtered segment endpoints can snap to the next VAD silence boundary even when speech ended much earlier.
- Not caused by pyannote diarization or concat/export logic.

Schema change:

- `schemaVersion` is now `4`.
- Each segment includes `displayStartSeconds` and `displayEndSeconds`.
- For segments with `words[]`, display timing is derived from `words[0].start` to `words[-1].end + 0.15s`.
- For segments without words, display timing uses a text-length heuristic of 0.4 seconds per word, minimum 1.0 second, capped at `endSeconds`.
- Invariant: `startSeconds <= displayStartSeconds <= displayEndSeconds <= endSeconds`.
- Top-level `displayTimingMethod` documents the derivation.

Regenerated files from the transcript workspace:

- `outputs/artemis2-lunar-flyby-broadcast-combined.json`
- `outputs/artemis2-lunar-flyby-broadcast-part1.aligned.json`
- `outputs/artemis2-lunar-flyby-broadcast-part2.aligned.json`
- `outputs/artemis2-lunar-flyby-broadcast.index.json`

Updated transcript tooling:

- New: `scripts/tighten_display_times.py`
- Updated: `scripts/concat_parts.py`
- Updated: `scripts/build_index.py`
- Updated docs: `docs/HANDOFF.md`, `docs/PIPELINE.md`

## 12. App Integration Update - 2026-05-19

The first runtime integration is complete in `moon-mission`:

- Artemis II media manifest references:
  - `transcriptDoc`: `../media/transcripts/artemis2-lunar-flyby-broadcast-combined.json`
  - `searchIndex`: `../media/transcripts/artemis2-lunar-flyby-broadcast.index.json`
  - `partOffsets`: Part 1 `0..22373`, Part 2 `22373..36599`
- The Broadcast panel renders captions from `combined.json` via `transcriptDoc`; VTT remains fallback/external caption data.
- The Broadcast panel includes a synchronized transcript list:
  - renders all normalized schema v4 transcript segments,
  - highlights the current conversation,
  - auto-scrolls when the active row changes,
  - lets row clicks seek to the row's `displayStartSeconds` on the unified broadcast timeline.
- Transcript row highlighting uses a forgiving readable window for very short segments so lines are not skipped between playback ticks. Caption overlay timing remains strict to the schema v4 display range.
- The transcript normalizer now accepts valid display-timed segments even when raw Whisper `startSeconds` and `endSeconds` are equal. This preserves all `3,794` current combined transcript segments.

Current staged data snapshot:

- Transcribe commit: `b8fd81d Correct Artemis II proper noun transcripts`
- Data repo commit: `185f8c3 Update Artemis II transcript corrections`
- App transcript panel/highlight commits:
  - `67e5272 Add broadcast transcript panel`
  - `412cba4 Fix transcript highlight gaps`

Important integration rule:

- Use `displayStartSeconds` / `displayEndSeconds` for user-facing caption, transcript, seek, and entity mention timing.
- Treat raw `startSeconds` / `endSeconds` as provenance only.

Remaining runtime work:

- Build entity search/browse UI from `artemis2-lunar-flyby-broadcast.index.json`.
- Add speaker filters and deterministic speaker colors.
- Add confidence styling for low-confidence speakers and unidentified segments.
- Decide whether and how to collapse visible `status: duplicate` runs.
