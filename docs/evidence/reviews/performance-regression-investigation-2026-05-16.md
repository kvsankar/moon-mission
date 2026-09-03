# Animation Responsiveness Investigation - 2026-05-16

> Status: investigation/reference. Active optimization follow-ups now live in [Performance Workstream](../../plans/breakdown/performance.md), with live planning rollup in [Moon Mission Roadmap](../../plans/roadmap.md).

## Context

Recent commits made the mission animation feel less responsive: button clicks took longer, and animation showed more jitter. The investigation focused on `/artemis2/` in local Vite and compared recent feature areas that could affect main-thread work or pointer handling.

## Findings

1. Mission Media panels can physically cover controls.
   On a 1440x900 viewport, the default-open media panel overlapped the animation controls. `elementFromPoint()` over the Play button resolved to `.media-browser-panel__thumbnail-strip`, and Playwright clicks were intercepted by that strip. This is a direct explanation for delayed or ignored button clicks when the panel is open.

2. Open media/background panels add main-thread pressure during animation.
   Headless measurements were noisy, but runs with the panels open showed more long tasks than runs with panels closed. This is likely contributing to animation jitter, especially because the UI is doing more visible panel work while the render loop is active.

3. Earth/Moon guide overlays were updated every render frame even when inactive.
   `src/platform/js/app/scene-handler-class.js` calls `updateEarthLatLonGridForCamera` and `updateMoonLatLonGridForCamera` every render. The overlay implementations recalculated camera distance, screen radius, grid granularity, and label placement even when the grid was hidden. This was likely introduced around the guide overlay work in commits `24ecdc6` and `d80fd45`.

4. `assets/lunar-features.json` was large and statically imported.
   The lunar feature dataset was loaded through `lunar-crater-actions.js`/UI paths, which made the app bundle pay the JSON parse/memory cost before Lunar Features were used. The catalog is now treated as runtime data: the source file lives in `../moon-mission-data/assets/lunar-features.json`, staging copies it into `assets/lunar-features.json`, and runtime code loads it dynamically through the R2 asset base when Lunar Features are used.

## Item 3 Fix

Status: implemented first, per request.

The Earth and Moon lat/lon overlay camera-update paths now return early when the grid is hidden and no hover label is visible. This keeps adaptive grid and label behavior unchanged when the overlay is active, while avoiding per-frame camera math and label-scaling work in the common inactive case.

Changed files:

- `src/platform/js/rendering/body-lat-lon-overlay.js`
- `src/platform/js/rendering/moon-renderer.js`
- `test/moon-renderer.test.js`

Targeted test coverage was added for the Moon overlay to prove inactive camera updates do not rebuild or adapt the grid, while visible overlays still adapt normally.

## Item 1 Fix

Status: implemented after the 1920x1080 default-layout discussion.

Quick viewport research supported treating 1920x1080 as the desktop default target rather than optimizing the open workflow layout around smaller 1366x768 screens:

- StatCounter desktop worldwide, April 2026: 1920x1080 was the top desktop resolution at 19.2%; 1366x768 was 6.65%.
- StatCounter desktop United States, April 2026: 1920x1080 was 22.28%; 1366x768 was 6.21%.
- Steam Hardware Survey Windows, April 2026: 1920x1080 was 53.81%; 1366x768 was 2.31%.

The 1920x1080 runtime check showed the default-open Mission Media panel clearing the Play button. However, after closing Mission Media, the collapsed timeline/default transport spacing left the timeline hit area overlapping the Play button center. This made `elementFromPoint()` return `.timeline-dock__track-wrap` rather than `#animate`.

The desktop control-panel default now sits fully above the timeline dock instead of using the previous collapsed-timeline overlap. Browser coverage was added for `/artemis2/` at 1920x1080 to close Mission Media and assert the Play button remains the top hit target.

## Open Discussion Order

Item 4 decision: use plain JSON in the data repo and let Cloudflare CDN handle transport compression. A direct R2/CDN deploy of `assets/lunar-features.json` was tested before app code changes:

- Public URL: `https://assets.sankara.net/moon-mission/assets/lunar-features.json`
- Raw size: `3,359,480` bytes
- CDN response: `Content-Encoding: br`
- Brotli transfer size observed: `324,670` bytes
- SHA-256 after decompression: `55BA0877F59AF96F78F6521743E7D0FF592E11922998F62BE7FED9DD771E6D98`
- Parsed feature count: `8,956`

After item 4: discuss items 1 and 2 together, because the click interception and panel-induced long-task pressure are related in the Mission Media panel behavior.
