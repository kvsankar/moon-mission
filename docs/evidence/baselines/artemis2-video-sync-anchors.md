# Artemis II Stream Sync Anchors

Last updated: 2026-05-12

> Status: working anchor ledger. Current stream-sync planning lives in [Artemis II Media Workstream](../../plans/breakdown/artemis2-media.md). Time-domain vocabulary lives in [Mission Clock Authority And Time Domains](../../specs/time/clock-authority.md).

This note tracks observed anchor points between:

- mission UTC
- mission elapsed time (MET, `D/HH:MM:SS` from launch)
- official long-form stream relative video time

Use this file as the working ledger while calibrating segment-level offsets for long-form stream playback.

## Baseline Assumption

- Mission launch epoch: `2026-04-01 22:35:12 UTC` (`MET 0/00:00:00`)

## Captured Reference Points

| # | Source | UTC | MET | Video Relative Time | Status |
|---|---|---|---|---|---|
| 1 | User observation | 2026-04-06 19:02:20 | 4/20:27:08 | 2:04:07 | Kept for cross-check |
| 2 | User observation | 2026-04-06 22:50:31 | 5/00:15:19 | 5:52:17 | Kept for cross-check |
| 3 | User observation | 2026-04-06 23:19:35 | 5/00:44:23 | 6:21:21 | Kept for cross-check |
| 4 | User observation | (derived from MET) | 4/18:49:00 | 0:26:20 | Kept for cross-check |
| 5 | Screenshot (console overlay) | 2026-04-07 01:33:42 | 5/02:58:30 | 8:33:10 | High-confidence |
| 6 | Screenshot + derived +28s | 2026-04-07 01:34:10 | 5/02:58:58 | 8:33:38 | High-confidence |

## Notes On Inconsistency

- The anchor set above is not globally linear across all points.
- Most likely causes:
  - editorial cuts/trims in the archived stream
  - inserted/replayed broadcast segments
  - feed-switch offset changes
  - DVR/archive timeline discontinuities
- Treat mapping as piecewise (segment-based), not one global offset.

## TODO

- [ ] Build segment breakpoint map:
  1. collect at least 2 anchors per segment
  2. solve local affine mapping (`video_t -> mission_t`)
  3. persist segment map in Artemis II media metadata for runtime sync
