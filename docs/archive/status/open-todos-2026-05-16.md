---
doc_class: archive
status: archived
scope: repository.planning.capture
prior_class: plan
archived_on: 2026-09-02
archive_reason: superseded-context-capture
---

# Open Todos From 2026-05-16 Context Switch

> Archive notice: the body below is the May 2026 context capture and is not
> current planning authority. Its rollup link was updated during archival for
> navigation.

> Superseded as a planning surface. Keep this file as the original context-switch capture. The live rollup is [Moon Mission Roadmap](../../plans/roadmap.md).

Captured at 2026-05-16 01:24 +05:30. Do not treat these as started; this is only a parking lot for follow-up work.

1. Move Moon render work to a branch. Current Moon render changes are risky to keep on `master`; there are already issues visible during smoke testing.
2. Investigate Flyby Broadcast panel going totally dark.
3. Fix Media panel overlap with events.
4. Adjust Earth exposure during lunar eclipse so it cuts down to normal when only Earth is in view.
5. Integrate diarization artifacts.
6. Change crater search and filter settings.
7. Explore diarization -> LLM -> search and other AI-assisted discovery features.
8. Fix play, media, and control bugs.
9. Add attribution page for Hank Green, NASA media files, and other required media/source credits.
10. Prepare blog post, Reddit post, email to Hank, and related launch communications.
11. Plan deployment and testing, including SSIM testing and broader regression testing.

## Optimization Track

Captured after the Mission Media/Broadcast optimization work on 2026-05-16. These are pending follow-ups, not yet started.

1. Run Chrome Performance measurement on `/artemis2/`.
   - Compare panels closed, Mission Media open, Broadcast open/enabled, and high-speed playback.
   - Use the trace to confirm whether the recent cache/render-split changes reduced long tasks and click delay.
2. Coalesce geometry and layout work.
   - Batch `syncFilterDrawerPlacement`, `syncDrilldownFlyoutPlacement`, thumbnail reveal, and image transform/layout reads into scheduled frame work.
   - Only run placement when drawers/flyouts are open, active thumbnail needs reveal, or panel dimensions changed.
3. Coalesce media/HLS event rerenders.
   - Avoid immediate duplicate renders from HLS/video readiness events such as manifest parsed, level loaded, canplay, and loadedmetadata.
   - Schedule one pending rerender for a burst of media readiness events.
4. Add performance regression tests.
   - Assert no structural Mission Media render on playback-only ticks.
   - Assert no repeated registry sync on playback ticks.
   - Assert bounded Broadcast seek/startLoad calls.
   - Assert no marker rebuild when media data is unchanged.
5. Run runtime smoke/performance check.
   - Start the local dev server and smoke `/artemis2/` with animation running.
   - Exercise Mission Media open, Broadcast open/enabled, and playback/frame controls.
