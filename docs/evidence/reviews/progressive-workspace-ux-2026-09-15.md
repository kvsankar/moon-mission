---
doc_class: evidence
status: current
scope: ui.progressive-workspace
---

# Progressive Workspace UX — 2026-09-15

User direction: keep the scene and playback primary; collapse secondary tools
as usable screen space shrinks. This extends the preceding
[visual-token pass](visual-design-tokens-2026-09-15.md).

## Implemented Behavior

Both width and height determine the workspace level. For Artemis II's default
layout, the verified progression is:

| Viewport | Level | Visible panes |
| --- | --- | --- |
| 1920×1080 | Full | 8 |
| 1366×768 | Compact | 4: scene, broadcast, Frame and Shoot, media |
| 1100×700 | Minimal | 2: scene and one tool, initially media |
| 800×700 | Focused | 1: scene, or a tool explicitly selected through Tools |
| 1920×550 | Focused | 1, despite the wide window |

Tools retains names and access to collapsed workflows, including Transcript.
Scene provides a direct return at constrained desktop sizes. Explicit tool
selection receives usable space instead of opening another squeezed pane.
Existing floating/popout arrangements remain user-owned.

Frame and Shoot uses its own measured scene viewport. Below either the 560px
width or 420px height bound, the dense
upper and timeline overlays move behind separate View options and Time controls
launchers. Below either 340px width or 260px height, passive metrics reduce to the two FoV values; expanding
the pane restores all metrics. The existing controls, state, and handlers are
retained in native popover surfaces. Nested Lunar Features and Surface Points
expand inside that bounded surface; Moon Render hands off to its shared panel.
Escape and outside dismissal are supported. The generated lunar-feature close
button now has a visible close glyph.

## State And Lifecycle Corrections

- Automatic group hiding does not close mission panels or reset mission time.
- Persistence retains the last expanded layout before Dockview's own resize
  handler can save constrained geometry. Explicit closes/opens and pane
  neighborhoods are reconciled into that layout.
- The three legacy mobile paths that closed desktop panels now defer to the
  progressive workspace when it owns those panels. Fresh mobile sessions retain
  their existing mobile shell behavior.
- A desktop session resized into mobile keeps the main canvas rendered;
  the old CSS rule hiding the entire Dockview host is overridden for that path.
- Collapsed auxiliary views skip their rendering work. Observers/listeners for
  disclosure and layout changes are cleaned up with their owning component.
- Maximized desktop tools retain their working area while header disclosure
  still responds to space. Entering mobile releases maximization for the scene.

## Verification

- Full unit suite: **207 files, 1,493 passed, 6 skipped**.
- Auxiliary interaction suite: **9 passed**, including legacy grips, docked
  divider/maximize behavior, media strip interactions, and tool restoration
  before auxiliary wheel zoom.
- Design suite: **3 passed** against the reviewed chrome baselines. The desktop
  launcher baseline intentionally changes to the compact Media / Frame & Shoot /
  Tools surface; selector and mobile-navigation baselines retain their scope.
- Progressive browser suite: **2 passed**, covering all four levels, height-only
  contraction, explicit tool switching, close/reopen, preserved mission time,
  preserved expanded storage width, desktop → mobile → desktop restoration,
  actual mobile canvas dimensions, and compact nested control hit testing.
- Visual review checked the scene remained visible after the desktop-to-mobile
  transition, as well as compact options/time surfaces and the workspace levels.

Commands:

```text
npm run test:unit
npm run test:browser:progressive
npm run test:browser:design
npx vitest run test/auxiliary-panel-resize-interaction.test.js
```

Review captures are generated in the ignored
`test/screenshots/current/progressive-ux/` directory. Shared token and chrome
baselines are under `test/screenshots/baseline/design/`.

## Remaining Work

The compact Frame and Shoot overlap is resolved by disclosure. The pre-existing
full-scene SSIM harness/baseline mismatch, broader secondary-mobile accessibility
work, and independent review remain as recorded in the roadmap. This work does
not claim those separate checks are closed. Changes remain in the working tree.
