---
doc_class: evidence
status: current
scope: ui.visual-design
---

# Visual Design And Panel Regression Review — 2026-09-15

This records the initial token/style pass. The subsequent
[progressive UX delivery](progressive-workspace-ux-2026-09-15.md) adds runtime
disclosure behavior and resolves the compact Frame and Shoot overlap recorded
here. Its verification record is the current follow-up.

Base revision: `a4dc1a5` on `master`; implementation is in the working tree.
Request: simplify the visual design using shared tokens while preserving the
existing structural design, alongside the priority panel-regression work.

## Findings And Changes

| Finding | User-facing consequence | Disposition |
| --- | --- | --- |
| Green launchers, blue selectors, amber media selection, text glows and several border/shadow systems | Secondary controls competed with the scene and media | Use one neutral surface and blue interaction palette; retain scientific and content-type colors. |
| Repeated values in the selector and three runtime stylesheets | Similar components drifted independently | Extract `design-tokens.css`; migrate recurring type, spacing, radii, color, elevation and motion declarations. |
| Dockview defines its theme on a nested `.dv-shell` | Host tokens alone did not change purple tab strips | Map vendor tokens on the nested theme class as well as the host; cover this with a computed-style browser assertion. |
| Glowing tab dots and individually boxed panel actions | Dense workspace chrome carried unnecessary emphasis | Use tab underlines, transparent icon actions, flat docked surfaces, and shared floating-panel shadows. |
| Boxed landing counters and multiple button color families | Statistics and secondary actions competed with mission choices | Use quiet counter separators, neutral secondary controls and a consistent Launch/selected treatment. |
| Mobile playback and bottom navigation were 30px/34px high | Primary touch targets were undersized | Use the shared 44px target and move the timeline above the larger navigation row. |
| Broadcast empty-state copy could start above the clipped panel viewport | The heading and first lines were obscured | Top-align the message and allow vertical scrolling within the existing panel. |
| Local lunar-feature catalog absent | Configuration review only showed loading/unavailable content | Stage the existing data-repo catalog; ignore this generated runtime file in the app repo. |

Panel positions, Dockview rails, header groups, media placement, timeline,
mobile navigation, mission selection modes, camera behavior and rendered
scientific data remain owned by their existing modules. No scene/runtime
JavaScript was changed.

## Panel Regression Reconciliation

The original three failures were reproduced before this work. They applied
legacy floating-panel assertions to the default Dockview route:

- The reported `45px` gap includes Dockview's workspace inset, tab strip and
  content frame. The legacy 6–10px content-to-header expectation does not apply.
- `mission-panels.css` deliberately hides `.aux-camera-view__resize-grip`
  within `.experimental-dockview-host`. Dockview owns resizing there.
- Both grip tests reach the grip on `?legacyPanels=1`. The remaining texture
  assertion expected only `deferred`, while current loading also uses `loading`.

Tests now explicitly cover legacy geometry and normal/maximized grips, with
image requests held pending until interaction completes. A separate docked
case covers workspace/header/transport bounds, divider dragging, hidden legacy
grips and group maximize/restore at 1920×1080 and 1366×768. At laptop width,
the neighboring main view is near its minimum width, so the divider test
shrinks the composer into the available space.

The original findings are dispositioned as stale layout/test assumptions,
not a runtime hit-target defect. Independent review remains required before
closing the roadmap delivery unit.

## Verification

- Unit suite: **206 files; 1,485 passed, 6 skipped**.
- Original auxiliary interaction cases: **8 passed**; new docked case passed
  separately at both desktop sizes after making the test respect minimum widths.
- Design suite: **3 passed against the reviewed baselines**, covering both
  selectors, selected-text contrast (at least 4.5:1), keyboard focus,
  configuration panel hit testing in the main and maximized Frame and Shoot
  views, and mobile 44px playback/navigation without timeline overlap.
- Three intentional chrome baselines live in `test/screenshots/baseline/design/`:
  selector toolbar, desktop launchers and mobile navigation. They avoid
  time-dependent scene content. Baseline updates require an explicit flag.
- Full review captures live in ignored `test/screenshots/current/design-review/`.
- All four stylesheets parse, all 51 referenced shared UI tokens resolve, the
  seven edited current documents have valid local links, and `git diff --check`
  passes. The initial working tree was clean; nothing has been staged.
- Data boundary audit: no mirrored mismatch, missing required artifact,
  origin/body issue, tracked app-side orbit artifact, or thumbnail issue.
  The audit continues to report its existing maintainer-source/mission-directory
  classification observations.

### Existing Full-Scene SSIM Limitation

The broader `test/ui.test.js` checks still compare the default Dockview runtime
against legacy-layout scene baselines. Three sampled comparisons fail even
when serving the **unmodified HEAD styles**:

| Scene | Original HEAD CSS | New CSS | Required SSIM |
| --- | --- | --- | --- |
| Earth initial load | 0.6042 | 0.6167 | 0.98 |
| Earth 3D initial switching frame | 0.5694 | 0.5771 | 0.98 |
| Moon 3D initial switching frame | 0.6752 | 0.6828 | 0.98 |

The original-style comparison used temporary Playwright response fixtures
loaded with `git show HEAD:src/platform/css/...`; it did not replace source
files. These tests stop at their initial screenshot assertions, so they do not
provide completed 2D/3D interaction evidence. The existing primary UI-elements
check passed. Full-scene baselines were not overwritten by this chrome pass.

## Remaining Review Scope

- Independent review of this delivery unit is pending.
- Reconcile the legacy/default layout contract of the broader SSIM harness
  before claiming that full suite is green.
- Secondary mobile controls still need the broader accessibility workstream.
- The compact Frame and Shoot hover/timeline overlap observed in this initial
  pass is resolved by the subsequent progressive disclosure implementation.
- Local panel z-index values and mission-specific presentation colors remain;
  token extraction is not a rewrite of the entire stacking or rendering system.
