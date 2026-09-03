# Artemis II Lunar Flyby Stream Package Baseline

This preserves the original source hashes, package measurements, one-off
FFmpeg invocation, provisional synchronization assumptions, and branch-state
notes. Current packaging is documented in
[Artemis II Media Streaming](../../operations/media/artemis2-media-streaming.md).

> Status: technical reference. Current decisions and next actions live in [Artemis II Media Workstream](../../plans/breakdown/artemis2-media.md). Time mapping semantics live in [Mission Clock Authority And Time Domains](../../specs/time/clock-authority.md).

This branch starts the long-form Mission Media stream path with the public
Artemis II lunar flyby broadcast.

## Source

- Source category: https://commons.wikimedia.org/wiki/Category:Videos_of_Artemis_2
- Original credit: NASA
- Original YouTube URL recorded in the WebM metadata: https://www.youtube.com/watch?v=z-j1uxBmis0
- Local staging root: `C:\tmp\moon-mission-artemis2-media`

Downloaded source files:

- `source/artemis2-lunar-flyby-broadcast-part1.webm`
  - Size: `4292026329` bytes
  - Duration: `22373.268` seconds
  - SHA256: `1EA7F1B6CC98F1F51C6D97C0B1B55A8245A028DFA217CB36A9558DE35175B041`
  - Streams: 3840x2160 AV1 video, Opus stereo audio
- `source/artemis2-lunar-flyby-broadcast-part2.webm`
  - Size: `3862789971` bytes
  - Duration: `14226.866` seconds
  - SHA256: `D7467E8A67FF30EE63D2B902653446CE1613BE98198C043083C84CC186703ABD`
  - Streams: 3840x2160 AV1 video, Opus stereo audio

Combined duration: `36600.130` seconds, about `10:10:00`.

## Generated HLS

Generated local candidate:

- `C:\tmp\moon-mission-artemis2-media\hls\artemis2-lunar-flyby\v1\master.m3u8`
- Rendition: `720p/index.m3u8`
- Segment type: HLS VOD, fragmented MP4/CMAF
- Segment cadence: 6 seconds
- Segment count: 6100 media segments plus `init.mp4` and playlists
- Total size: `2661423628` bytes
- FFprobe duration: `36600.130215` seconds
- Master playlist SHA256:
  `223BCD1ED93072BA6F0AF392252416A451320FC4937651352BB6DC37BC3B6853`

The intended hosted URL is:

`https://assets.sankara.net/moon-mission/assets/artemis2/media/streams/lunar-flyby/v1/master.m3u8`

The stream is declared in `assets/artemis2/data/media-manifest.json5` with
`enabled: true` and points at the local staged HLS copy for development:

`assets/artemis2/media/streams/lunar-flyby/v1/`

The durable local staging copy has been moved out of temp scratch and into the
sibling data workspace at:

`C:\sankar\projects\moon-mission-data\assets\artemis2\media\streams\lunar-flyby\v1\`

That directory is local staging for upload/deploy workflows. Do not commit the
6103 HLS playlist/segment files to GitHub; publish them to object storage/CDN
instead.

The hosted URL above is the intended production location once DNS and static
hosting are configured.

A generated poster frame is staged at:

`assets/artemis2/media/thumbnails/videos/artemis2-lunar-flyby-broadcast.webp`

## Packaging Command

The source concat list is:

```text
file 'C:/tmp/moon-mission-artemis2-media/source/artemis2-lunar-flyby-broadcast-part1.webm'
file 'C:/tmp/moon-mission-artemis2-media/source/artemis2-lunar-flyby-broadcast-part2.webm'
```

Run from:

`C:\tmp\moon-mission-artemis2-media\hls\artemis2-lunar-flyby\v1\720p`

```powershell
ffmpeg -hide_banner -y `
  -f concat -safe 0 `
  -i C:\tmp\moon-mission-artemis2-media\scratch\artemis2-lunar-flyby-concat.txt `
  -map 0:v:0 -map 0:a:0 `
  -vf "scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2" `
  -c:v libx264 -preset veryfast -profile:v main -level 3.1 `
  -crf 23 -maxrate 3000k -bufsize 6000k `
  -g 60 -keyint_min 60 -sc_threshold 0 `
  -c:a aac -b:a 128k -ac 2 -ar 48000 `
  -hls_time 6 -hls_playlist_type vod `
  -hls_segment_type fmp4 -hls_flags independent_segments `
  -hls_fmp4_init_filename init.mp4 `
  -hls_segment_filename seg_%05d.m4s `
  index.m3u8
```

## Hosting Requirements

Host the whole `v1` directory on object storage/CDN. Required content types:

- `.m3u8`: `application/vnd.apple.mpegurl`
- `.m4s`: `video/iso.segment`
- `.mp4`: `video/mp4`

Useful cache policy:

- Segment files and `init.mp4`: long immutable cache after the path includes
  a version such as `v1`.
- Playlists: short cache while iterating, then longer once stable.
- Enable CORS for the app origin.
- Use the custom domain (`assets.sankara.net`) for production rather than an
  `r2.dev` development URL.

## Sync Status

The current stream mapping is provisional:

- Stream second `0` is tentatively mapped to `2026-04-06T17:56:00Z`.
- Closest approach is tentatively mapped to stream second `18240`, using the
  published `2026-04-06T23:00:00Z` milestone.

Before enabling the stream, validate anchors against visible or audible
broadcast cues. Good candidates:

- Apollo 13 distance record milestone
- Loss of signal / Earthset
- Closest lunar approach
- Acquisition of signal / Earthrise

## Next Work

1. Upload the generated `v1` HLS directory from `moon-mission-data` local
   staging to the media host.
2. Verify the hosted playlist and a representative segment return the expected
   content types and CORS headers.
3. Keep `sourceUrl` repository-relative, for example `../media/streams/lunar-flyby/v1/master.m3u8`; the runtime asset resolver publishes it through the R2 asset base.
4. Replace provisional sync with validated anchors and anchor interpolation.
5. Add stream-specific filtering if whole-mission streams should be separated
   from short video clips in the UI.
