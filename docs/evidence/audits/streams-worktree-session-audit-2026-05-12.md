# Streams Merge Manual Review Checklist

Temp checklist for preserving the remaining manual review scope before making additional changes.

Base merge commit: `d302994` (`Merge Artemis 2 media streams`)

Post-merge commits currently included:

- `4623a3e` - `Fix lunar feature hover labels`
- `46f334a` - `Fix media timeline playback interactions`
- `c4e37c5` - `Fix media timeline seek while playing`

Changed files since the merge:

- `mission.html`
- `src/platform/css/mission-layout.css`
- `src/platform/js/app/lunar-crater-actions.js`
- `src/platform/js/app/media-browser-panel.js`
- `src/platform/js/app/media-timeline-coordination.js`
- `src/platform/js/app/timeline-dock-controller.js`
- `test/lunar-crater-actions.test.js`
- `test/media-timeline-coordination.test.js`
- `test/timeline-dock-controller.test.js`

## Manual UI Review Items

- Lunar feature always labels:
  - More always-visible feature labels are shown than before.
  - Label font size is stable while dragging the Moon.
  - Hover does not create a duplicate label when an always-visible label already exists.
  - Feature names do not receive inconsistent suffixes such as `* Rima`.

- Lunar feature hover behavior:
  - Main view hover labels still appear when hovering unlabeled lunar features.
  - Frame & Shoot hover labels match the main view behavior.
  - Lunar feature labels remain legible and do not wiggle during drag/interaction.

- Mission Media panel:
  - The media browser module loads without MIME-type errors.
  - Filtering media, especially `stream`, produces the expected results.
  - Closing the Mission Media panel stops media playback and mission animation.

- Fullscreen timeline and media lane:
  - Clicking the regular timeline sets the mission animation time.
  - Clicking the fullscreen media lane sets the mission animation time.
  - Clicking a green video segment in the fullscreen media lane works while media is paused.
  - Clicking a green video segment in the fullscreen media lane works while media is playing.
  - Dragging the timeline bar pans the timeline range instead of setting time on pointer down.
  - Dragging the vertical current-time line changes the mission time.

- Media/animation playback invariants:
  - Starting playback keeps animation and media play state aligned.
  - Pausing playback keeps animation and media play state aligned.
  - Seeking by timeline click, media-lane click, event selection, and +/- time controls updates media time when relevant.
  - The active video does not jitter between play and pause.
  - Seeking within the active stream while it is playing keeps the same stream active and seeks the media time instead of restarting incorrectly.

## Automated Checks Already Run For Latest Fix

- `npx vitest run test/timeline-dock-controller.test.js -t "selects and seeks media segments"`
- `npx vitest run test/media-timeline-coordination.test.js test/timeline-dock-controller.test.js`
- `npm run test:unit`
