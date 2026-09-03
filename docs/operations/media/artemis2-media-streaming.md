# Artemis II Media Streaming

Historical package record:
[Lunar Flyby Stream Package Baseline](../../evidence/baselines/artemis2-lunar-flyby-stream-package.md)

Sync ledger:
[Artemis II Video Sync Anchors](../../evidence/baselines/artemis2-video-sync-anchors.md)

Backlog:
[Artemis II Media](../../plans/breakdown/artemis2-media.md)

## Package A Rendition

Prepare an ordered FFmpeg concat list, then run from the rendition directory:

```powershell
ffmpeg -hide_banner -y `
  -f concat -safe 0 -i <concat-list.txt> `
  -map 0:v:0 -map 0:a:0 `
  -vf "scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2" `
  -c:v libx264 -preset veryfast -profile:v main -level 3.1 `
  -crf 23 -maxrate 3000k -bufsize 6000k `
  -g 60 -keyint_min 60 -sc_threshold 0 `
  -c:a aac -b:a 128k -ac 2 -ar 48000 `
  -hls_time 6 -hls_playlist_type vod `
  -hls_segment_type fmp4 -hls_flags independent_segments `
  -hls_fmp4_init_filename init.mp4 `
  -hls_segment_filename seg_%05d.m4s index.m3u8
```

This creates one rendition, init segment, and media segments. It does not
create the master playlist, captions, transcript, or search index; create and
verify those separately.

## Stage And Validate

Place the complete versioned package under
`../moon-mission-data/assets/artemis2/media/streams/lunar-flyby/v1/`.

- Probe duration/codecs with `ffprobe`.
- Verify master rendition/caption references.
- Decode representative first, middle, and final segments.
- Verify `.m3u8`, `.m4s`, and `.mp4` MIME types, CORS, and cache policy.
- Verify transcript/search alignment and current manifest anchors.
- Do not reuse obsolete provisional offsets preserved in the baseline.

Use [R2 Asset Hosting](../deployment/r2-asset-hosting.md) to build, stage,
dry-run, upload, and verify. Production asset hosting and DNS already exist.
