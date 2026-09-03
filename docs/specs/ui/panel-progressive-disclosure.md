---
doc_class: spec
status: current
scope: ui.panels.progressive-disclosure
canonical_for:
  - panel-progressive-disclosure-behavior
---

# Panel Progressive Disclosure Spec

Last updated: 2026-05-22

This spec defines how resizable workflow panels adapt their information density
as available space changes. The goal is not to hide useful information for its
own sake; the goal is to keep each panel readable, stable, and useful at the
size the user has chosen.

The first tracked implementation target is the thumbnail strip in the Mission
Media panel.

## Goals

- Resizable panels should show the richest useful version of their content at
  large sizes and simpler versions at smaller sizes.
- Small panels should prioritize recognition and action over dense detail.
- Progressive disclosure should preserve orientation: the user should still
  know what item is active, what controls are available, and how to restore
  hidden detail.
- Disclosure behavior should be deterministic and testable.
- Panel-specific disclosure rules should live near the owning panel code rather
  than becoming a global one-size-fits-all rule.

## Non-Goals

- This spec does not redesign the entire desktop panel system.
- This spec does not define mobile panel behavior.
- This spec does not require one shared breakpoint scale for every panel.
- This spec does not remove authored metadata; it only controls how much of it
  is visible at a given panel size.

## Terms

- **Panel frame**: the user-resizable outer panel area.
- **Available geometry**: the measured space that a panel component can use
  after shell chrome, controls, and sibling regions are accounted for.
- **Disclosure level**: a named density state such as `full`, `compact`,
  `minimal`, `media-only`, or `collapsed`.
- **Recognition content**: visual information that helps identify an item, such
  as a thumbnail image, active ring, media kind icon, or short title.
- **Detail content**: secondary text such as timestamp, camera metadata,
  generated semantic labels, location, or source notes.

## General Rules

1. Disclosure levels should be based on available component geometry, not only
   viewport size.
2. A user resize should never create overlapping text, clipped controls, or
   unreadable dense cards.
3. The active selection indicator must remain visible at every non-collapsed
   level.
4. Primary navigation and restoration controls must remain discoverable at
   every level.
5. Hidden visual text should remain available through accessible names, button
   titles, details drawers, or the focused/selected main content area.
6. Disclosure state should not change the selected item, playback state,
   mission time, or media pan/zoom state.
7. Saved layout state may remember user size and placement, but derived
   disclosure level should be recomputed from live geometry.
8. Floating, docked, or popout detail surfaces should choose a non-overlapping
   placement when anchored to compact content, then clamp to the visible panel
   area.
9. Panel layout bounds should reserve space for the visible transport controls
   row and timeline dock, not only the timeline dock.

## Mission Media Thumbnail Strip

### Current Behavior

The Mission Media thumbnail strip is implemented by:

- `mission.html`
- `src/platform/js/app/media-browser-panel.js`
- `src/platform/css/mission-panels.css`

Current behavior already includes:

- user-resizable thumbnail strip thickness
- top, bottom, left, and right placement
- collapsed strip state
- derived `full`, `compact`, `minimal`, and `media-only` levels for horizontal
  and vertical placement
- strip-size thresholds plus panel-width/panel-height guards for live geometry
- compact/minimal compatibility classes derived from the named level
- stable media selection when the strip is resized
- active thumbnail reveal after resizing, paging, and selection changes

### Disclosure Levels

The thumbnail strip should expose these derived levels:

- `full`: thumbnail and MET label are visible; detail labels are hidden.
- `compact`: thumbnail and one-line MET label are visible; detail labels are hidden.
- `minimal`: thumbnail/media preview and active state are visible; text detail is
  hidden.
- `media-only`: only the preview, media-kind affordance, and active state remain
  visible.
- `collapsed`: the thumbnail strip is hidden and represented by the separator
  restore affordance.

The current collapsed behavior can remain a user-controlled state. The other
levels should be derived from live geometry.

### Horizontal Placement

For bottom or top placement, use strip height and panel width together:

- `full`: preview and normal MET label presentation.
- `compact`: preview and tighter one-line MET label presentation.
- `minimal`: enough height for preview-only cards with normal spacing.
- `media-only`: the minimum non-collapsed strip, used when text would compete
  with the preview.

Recommended starting thresholds:

- `full`: `>= 150px`
- `compact`: `118px` to `149px`
- `minimal`: `96px` to `117px`
- `media-only`: below `96px`

The implementation expresses behavior as named levels rather than exposing bare
CSS breakpoints as product state.

### Vertical Placement

For left or right placement, use strip width, rail height, and card width:

- Wide side rail: allow `full` or `compact` MET presentation when cards have
  enough readable width.
- Narrow side rail: prefer `minimal` or `media-only` so the panel keeps a strong
  visual browsing strip instead of cramped text.
- Vertical placement uses the same named disclosure model.

Recommended starting thresholds:

- `full`: `>= 210px`
- `compact`: `170px` to `209px`
- `minimal`: `136px` to `169px`
- `media-only`: below `136px`

### Content Priority

At reduced sizes, keep content in this order:

1. Active selection state.
2. Thumbnail or media fallback visual.
3. Media kind affordance for video/audio.
4. One-line MET label.
5. Title/source/camera details in the structured popup.
6. Secondary AI metadata detail in the structured popup.

The thumbnail accessible label and structured hover/focus popup should retain
useful hidden text so detail is still reachable without taking visual space.
Native browser title tooltips should not carry the detail surface because they
cannot be structured or styled.

Thumbnail card time should use mission elapsed time instead of long absolute
dates:

- roomy card: `MET ddd:hh:mm:ss`
- tighter card: `MET ddd:hh:mm`
- earlier-than-launch media: `MET -ddd:hh:mm` or `MET -ddd:hh:mm:ss`

The popup should show structured detail including MET, local time, UTC time,
and available camera/source/AI details.

### Interaction Requirements

The following must continue to work at every disclosure level:

- selecting a thumbnail
- paging the strip
- dragging/scrolling the thumbnail rail
- moving the strip between edges
- resizing the strip
- collapsing and restoring the strip
- preserving selected media image pan/zoom during strip resize

### Non-Normative Implementation Map

- `resolveThumbnailDisclosureLevel` in `media-browser-panel.js` resolves the
  level from placement, strip size, and panel geometry.
- The strip receives one named level class such as
  `media-browser-panel__thumbnail-strip--level-compact` plus compatibility
  compact/minimal classes.
- The level is recomputed from:
  - `applyThumbnailStripHeight`
  - thumbnail placement changes
  - panel `ResizeObserver`
  - window resize
- Do not persist the derived disclosure level.
- CSS owns visual hiding after the level class is applied. The DOM retains
  metadata for accessibility and the structured popup.

## Acceptance Criteria

- Horizontal thumbnail strip levels match available strip height and do not show
  title/meta text when there is not enough room.
- Vertical thumbnail strips use equivalent disclosure behavior instead of always
  attempting full cards.
- Active thumbnail state remains visible in every non-collapsed level.
- Thumbnail paging and drag scrolling remain usable in every non-collapsed
  level.
- Collapsing/restoring the thumbnail strip still works from the separator bar.
- Resizing the thumbnail strip does not change selected media, mission time,
  playback state, or image pan/zoom except for clamping pan to the resized
  stage.
- Hidden thumbnail detail remains available through accessible text, the
  structured thumbnail popup, or the focused media details area.
- The structured thumbnail popup does not cover the hovered/focused thumbnail,
  including near panel edges where the popup must clamp to available space.
- Thumbnail cards use MET for visible card time and do not show clipped
  absolute date lines.
- App-facing generated-metadata terminology uses `AI`, not `LLM`.
- Docked and floating panel layouts leave visible clearance above the transport
  controls row.

## Required Regression Coverage

Keep coverage close to these files:

- `test/media-browser-panel.test.js`
- `test/auxiliary-panel-resize-interaction.test.js`

Minimum scenarios:

- horizontal strip derives `full`, `compact`, `minimal`, and `media-only`
  levels at representative heights.
- vertical strip derives disclosure levels at representative widths.
- compact/minimal/media-only levels keep selected thumbnail state without
  rebuilding unchanged thumbnail cards.
- strip resize preserves selected image view state and keeps the active
  thumbnail visible.
- collapsed separator restore still works after a prior derived level change.
- thumbnail popup placement avoids overlapping the active thumbnail when normal
  above/below placement is constrained.
- panel layout browser coverage verifies the Mission Media / Frame and Shoot
  workspace stays clear of the transport controls row.

## Implementation History

The completed Mission Media delivery sequence is preserved in the
[Archived Panel Progressive Disclosure Plan](../../archive/plans/panel-progressive-disclosure.md).
Applying this model to another panel requires a new panel-specific plan after
its behavior and acceptance criteria are added to this specification.
