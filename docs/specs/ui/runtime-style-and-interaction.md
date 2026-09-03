# Runtime Style Guide

Last updated: 2026-05-18

This specification defines the ground-level visual and interaction language for the mission runtime. It implements [Runtime UX](runtime-ux.md): new UI must choose from the component taxonomy here, use shared tokens, and document deliberate deviations.

Design rationale:
[Runtime Experience Model](../../designs/runtime-experience-model.md)

Implementation and audit work:
[Runtime Style And Accessibility](../../plans/breakdown/runtime-style-and-accessibility.md)

Review procedure:
[UI Review](../../operations/contributor/ui-review.md)

## Doctrine Alignment

Use this guide after the doctrine decision is clear. The doctrine answers what the runtime is trying to be; this guide answers how controls, panels, typography, layers, states, and responsive behavior should be implemented.

Ground-level rules:

- Role before style: identify the control role before choosing the visual treatment.
- Hierarchy before density: compact UI is acceptable only when relationships remain scannable.
- Mission context before mechanism: group controls around time, view, geometry, media, annotations, or system state.
- Tokens before values: prefer shared design tokens for recurring decisions.
- State must be visible: rest, hover, focus, active, disabled, loading, selected, open, empty, and unavailable states need distinct treatment where applicable.
- Color is not enough: pair color with label, shape, icon, check mark, border, or position.
- Scope must be legible: users should know whether a control affects the main mission, the scene, a persistent panel, a temporary popover, or local panel content.
- Copy is interface: labels should name user-facing outcomes, not implementation history.

## Foundations

### Tokens

Runtime CSS should expose and consume explicit tokens for recurring decisions:

- Surface: `--ui-bg-0`, `--ui-surface-1`, `--ui-surface-2`.
- Text: `--ui-text-1`, `--ui-text-2`.
- Border: `--ui-border-1`, `--ui-border-2`.
- Interaction: `--ui-accent-1`, `--ui-annotation-accent`, `--header-pill-current-color`.
- Launcher: `--header-pill-launcher-color`, `--header-pill-launcher-border`, `--header-pill-launcher-bg`.
- Focus: `--ui-focus`.
- Radius: `--ui-radius-sm`, `--ui-radius-md`.
- Type: `--ui-font-sans`, `--ui-font-condensed`, `--ui-font-mono`, `--ui-type-*`.
- Layer: config popovers, persistent panels, mobile shell, and scene overlays should have named z-layer tokens.

New hard-coded values require a reason: semantic rendered data color, mission-specific media marker, or an experimental component documented in this guide.

### Layer Tokens

Layer values need a named scale because this app combines canvas overlays, fixed panels, header controls, drawers, and temporary popovers. Use role tokens rather than local numeric ladders:

- `--ui-layer-scene`: base scene and canvas content.
- `--ui-layer-scene-overlay`: labels, annotations, tooltips tied to rendered content.
- `--ui-layer-timeline`: timeline dock and transport controls.
- `--ui-layer-persistent-panel`: media, Frame and Shoot, compare, and similar persistent panels.
- `--ui-layer-panel-chrome`: handles, close buttons, resize affordances, panel-local overlays.
- `--ui-layer-header`: desktop pill strip and mobile shell controls.
- `--ui-layer-config-popover`: temporary configuration popovers, drawers, menus, and search suggestions.
- `--ui-layer-modal`: blocking dialogs and overlays.

Use small local z-index values only inside a component after its root has established the correct layer token. Do not use `214748...` values or unrelated fixed values inside component CSS except as a documented compatibility shim scheduled for removal.

### Typography

Use the existing type stack:

- Primary UI: `IBM Plex Sans`, falling back to system sans.
- Compact controls and labels: `IBM Plex Sans Condensed`.
- Numeric or data-like values: `IBM Plex Mono` where fixed-width comparison helps.

Runtime type sizes:

- Micro: `8px` for dense secondary labels.
- Label: `9px` for compact button text and field labels.
- Control: `10px` for primary runtime controls.
- Small body: `11px` for panel copy, summaries, and metadata.
- Body: `12px` for readable panel text.
- Small title: `16px` for panel titles.

Rules:

- Use `0` letter spacing for normal text and button labels when legibility is at risk.
- Use `var(--ui-tracking-label)` only for short uppercase labels in established chrome.
- Do not use negative letter spacing.
- Avoid bolding every control. Weight is hierarchy; reserve heavier weights for section labels, selected pills, and important numeric values.
- Use tabular numerals for live time, distances, diameters, FOV values, and comparable metrics.
- Button and checkbox labels should be short, direct, and parallel.
- Do not shrink below the guide's micro size to make labels fit. Rename, wrap, or change the control pattern instead.

### Copy And Labeling

Runtime labels should be plain, compact, and outcome-oriented:

- Use user-facing outcomes: `Show Always`, `Hover`, `Search`, `Recommended`, `Off`.
- Avoid ambiguous defaults: `Default` is allowed only when it restores a defined app or mission default.
- Prefer positive labels over negated labels.
- Use parallel terms inside a control group. Do not mix verbs, nouns, and internal feature names in one selector.
- Tooltips can add technical context, but the visible label should still be understandable.
- Status text should describe current state or next useful action, not restate the name of the control.

### Color

The dominant palette is a dark neutral surface with blue interaction states:

- Background: near-black blue.
- Panels: translucent dark blue-gray.
- Borders: low-opacity white or blue-white.
- Primary text: bright blue-white.
- Secondary text: muted blue-gray.
- Selection/focus: restrained cyan-blue.
- Configuration launchers: muted green action family.

Rules:

- Active states should be unmistakable but not bright enough to compete with the scene.
- Use semantic marker colors only for rendered annotations, media categories, status markers, or swatches.
- Avoid one-off color systems inside a panel unless the data category requires it.
- Do not use color as the only cue for meaning. Pair it with label, shape, check mark, icon, or position.
- Maintain sufficient contrast for small text and icons; tiny text needs higher contrast than large display text.
- Semantic colors must be stable. Solar yellow, Moon silver, and craft cyan should not be reused for unrelated UI chrome.

### Spacing And Density

Use a compact spacing scale derived from the app’s existing density:

- `1px`: segmented-control seams.
- `2-3px`: very dense internal gaps.
- `4px`: compact row gap.
- `6px`: standard control gap.
- `8px`: section/panel padding.
- `10-12px`: larger panel/body spacing.

Rules:

- Similar items get similar spacing.
- Category boundaries need more space than row boundaries.
- A row should not look like a button unless it behaves like a button.
- Preserve alignment columns inside groups: control column, swatch/icon column, label column, value/metadata column.
- Dense controls need stable dimensions so hover, checked state, and dynamic labels do not shift layout.
- Dense panels still need breathing room between categories. If every row has the same weight, the panel becomes harder to scan even when it fits.

### Shape And Radius

- Pill controls: `999px`.
- Panel shells and compact fields: `6-10px`.
- Dense rectangular buttons: `4-6px`.
- Attached tabs: square or lightly rounded bottom connection depending on the tab model.
- Cards: reserve for repeated content, modals, or genuinely framed tools.

Do not place cards inside cards. Do not use cards as generic section backgrounds.

### Elevation And Layers

Layering communicates interaction priority:

- Scene/canvas and annotation overlays are base content.
- Persistent panels sit above scene content.
- Header controls and mobile shell sit above scene content and most panel chrome.
- Temporary configuration popovers, menus, dropdowns, and search result popovers sit above persistent panels.
- Modal dialogs sit above all normal runtime UI.

Temporary UI must not be clipped or obscured by the panel that opened it unless it is intentionally local to that panel and bounded by it.

### Motion

Motion should clarify state, not decorate:

- Use short transitions for hover, focus, open/close, and loading.
- Avoid large movement in dense controls.
- Respect reduced-motion settings for nonessential animation.
- Keep scene/annotation animation visually subordinate to mission content unless the animation is the requested feature.

## Runtime Visualization Surfaces

### 3D Rendering Surfaces

The 3D scene is the primary content surface, not a background effect.

- Keep frame rendering independent from UI layout work.
- Keep mission time and render frame time conceptually separate in UI copy and code.
- Provide quality tiers for expensive scene features: pixel ratio, texture resolution, labels, atmosphere, stars, shadows, annotation density.
- Favor stable interaction over maximum fidelity when performance is constrained.
- Do not let panel animation, hover effects, or DOM updates run inside the render loop.
- If a rendering mode is approximate, stylized, or non-real scale, expose that state in the relevant status/provenance surface.
- Scene overlays should have density limits and collision/occlusion behavior; labels should not flood the rendered body at default zoom.

### Solar-System Object Rendering

Rendered bodies carry scientific meaning.

- Body labels, surface labels, sub-points, glints, and guide overlays should state what frame or body they belong to when ambiguity is possible.
- Swatches and annotation colors must match rendered scene colors.
- Do not reuse data colors as generic UI chrome.
- Lighting/exposure controls should distinguish physical lighting from display exposure or visibility compensation.
- Scale modes should be named plainly: real scale, readable scale, relative frame, or mission-specific framing.
- Missing or out-of-coverage geometry should show an unavailable state rather than silently dropping annotations.

### Timeline Surfaces

Timeline controls are mission-time navigation surfaces.

- Current mission time is always visible near the timeline or playback controls.
- Play, pause, scrub preview, and committed time states should be visually distinct.
- Event, phase, craft, and media markers should use separate semantic marker styles.
- Marker density should adapt to zoom/scale; do not let all event types compete at once.
- Timeline sliders use accessible seek semantics, keyboard stepping, and clear value text.
- Time-range zoom, next/previous event, and "now/current event" commands are commands, not persistent modes.
- Empty/out-of-range states should explain whether the current mission time has no media, no events, no data coverage, or filtered-out content.

### Orbit Trail Controls

- Keep 2D and 3D track-context brightness independently adjustable.
- Keep 2D and 3D tail prominence independently adjustable.
- The track brightness control owns base opacity. Dynamic overlap refinement
  may only contribute a multiplicative factor:
  `final opacity = base opacity * overlap factor`.
- A stale refinement result must not replace a newer user-selected base value.
- Mission-specific semantic intervals belong in authored orbit-style sidecars;
  generic missions may use the fixed tail-length fallback. Do not add style
  metadata to the Chebyshev transport payload.

## Interaction Contracts

Each component family has a behavioral contract. A visual style is incomplete unless the DOM semantics, keyboard model, and state attributes match the same role.

### State Attribute Rules

- Tabs use `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, and roving `tabindex`.
- One-of selectors use radio semantics or a documented `aria-pressed` button group pattern, consistently within that family.
- Binary toggles use checkbox semantics, switch semantics, or `aria-pressed`; do not mix within one visible group.
- Launchers that open temporary UI use `aria-expanded`, `aria-haspopup` where appropriate, and `aria-controls`.
- Persistent panel launchers indicate open state independently from the configured/selected state of whatever the panel controls.
- Search results, menus, and popovers restore focus to the invoker when closed.
- Hidden inactive tab bodies should be unmounted when practical or hidden from assistive tech with a correct relationship to the active tab.

### State Inventory

Before a component is complete, define and test:

- Rest, hover, focus-visible, active/selected/open, disabled, loading, empty, and error/unavailable states where applicable.
- Pointer, keyboard, and touch behavior.
- What happens when the backing data is missing, stale, loading, or too large.
- Whether the control affects mission time, scene overlays, media selection, or only local panel filtering.

## Component Taxonomy

Each component below has a distinct job. Do not reuse a style merely because it looks similar.

### Primary Panel Tabs

Use when switching the panel body or major mode, for example `Show Always`, `Hover`, and `Search`.

- Shape: attached or underline tab.
- Active state: selected tab clearly connected to content below.
- Inactive state: quiet text and border.
- Behavior: exactly one active tab.
- Accessibility: use `role="tablist"`, `role="tab"`, `aria-selected`, and keyboard movement.
- Keyboard: left/right or up/down moves focus and selection within the tablist; `Home` and `End` should be supported when the tab count is more than two.
- Content: inactive tab-specific controls are not visible, focusable, or announced as current content.
- Do not style these exactly like one-of command buttons.

### Category Tabs

Use for filtering subgroups inside an already selected mode.

- Shape: quiet text tabs or underline tabs.
- Active state: underline or text emphasis.
- Behavior: exactly one category visible.
- Category labels must remain legible at the minimum supported panel width. If labels do not fit at `8px`, use shorter labels, wrapping, or a dropdown/menu pattern.
- Category tabs are secondary to the parent mode. Their active state must be quieter than primary panel tabs.
- Do not use filled button styling; the parent tab or one-of selector owns stronger emphasis.

### One-Of Pill Selectors

Use when selecting exactly one option from a small set: origin, dimension, plane, filter preset, lock target.

- Shape: compact segmented pill group.
- Active state: filled/outlined pill using standard blue active state.
- Inactive state: transparent or low-fill segment.
- Options should be parallel nouns or short phrases.
- Avoid labels like `Default` unless it literally means restore app/mission default; prefer `Recommended` for curated presets and `Off` for disabled state.
- Accessibility: expose radio semantics or `aria-pressed` consistently.
- A one-of selector changes a persistent value. It should not open a panel, drawer, or popover.
- Avoid making a one-of group look like independent checkboxes or command buttons.

### Binary Toggles

Use for a single independent on/off setting.

- Shape: checkbox, switch, or standalone compact pill depending on context.
- Active state: same blue interaction language as other controls.
- Use checkbox when the setting is one of several independent options.
- Use pill toggle when the setting is a prominent standalone overlay in a toolbar.
- If the toggle opens a panel, represent open state separately through `aria-expanded`.
- Do not place panel launchers in the middle of a binary toggle row unless their visual treatment and group label distinguish them.

### Grouped Checkboxes

Use when a panel presents several independent options inside a shared category, for example `Sun on Earth: Sub-Solar | Glint` or guide overlays.

Grouped checkboxes are not buttons and should not look like one-of selectors.

- Shape: checklist rows inside a category section.
- Row anatomy: checkbox, optional swatch/icon, label, optional metadata/help text, optional subordinate control.
- Alignment: checkbox edges align vertically across all rows; swatches/icons align in their own column when present; labels start on a consistent x position.
- Spacing: use a clear row gap and a stronger category gap. Avoid squeezing rows so tightly that they read as segmented controls.
- Background: row background should be absent or extremely quiet. Use hover/focus emphasis, not persistent card/button fills.
- Border: avoid boxed button-like borders around each checkbox. If dense row containers are necessary, use subtle borders and consistent row height.
- Typography: option labels use compact body/control text, not button-bold text. Category labels use uppercase label styling.
- Checkbox styling: native or near-native checkbox is preferred for recognition. Use consistent dimensions and app accent color.
- Selected state: the check mark is the primary selected signal. Do not also turn the row into a strong active pill.
- Swatches: swatches preview semantic rendered colors only; they do not replace checkboxes and should not make the row look like a color picker.
- Label behavior: the entire row label should toggle the checkbox.
- Ordering: list options logically and positively; avoid negative labels when possible.
- Wrapping: labels may wrap only when necessary; wrapped text aligns with label start, not under the checkbox.
- Disabled state: keep the row visible if it explains unavailable capability; reduce opacity and keep cursor/state obvious.
- Subordinate controls: if a checked row reveals a slider, range, or options, indent or grid-align the subordinate controls under the label/value columns so they do not look like separate top-level choices.
- Large checklists: when a category has many items, provide search, category tabs, or progressive disclosure. Do not squeeze the checklist into unreadable two-column tiles just to avoid scrolling.

Recommended structure:

```text
CATEGORY LABEL
[ ]  swatch  Option label
[x]  swatch  Option label
```

### Search Fields And Result Lists

Use search when selecting or pinning a specific item from a larger catalog.

- Search fields use compact input styling, not pill styling.
- Placeholder text is secondary and not a substitute for the label.
- Results use list rows with checkbox/pin affordances when selections persist.
- Results should show enough metadata to disambiguate similarly named items.
- Empty, loading, and overflow states are required.
- Search results are additive when specified by the feature model and must avoid duplicate scene annotations.
- Highlighting an already visible result should strengthen the existing annotation rather than drawing a second label or perimeter.
- Search selection must state whether it is temporary, pinned, or applied to mission time.
- Search should not inherit unrelated filters silently unless the panel labels explain the scope.

### Numeric Sliders And Ranges

Use sliders for continuous or bounded numeric choices.

- Layout: label on the left, current value on the right, control below or inline depending on width.
- Numeric values use tabular numerals.
- Track and thumb use standard blue unless the slider controls a semantic data category.
- Min/max labels should be secondary and visually quieter than the current value.
- Dual ranges must make the selected interval visually obvious.
- Thumb hit targets should be usable on touch when the panel appears in mobile contexts.

### Command Buttons

Use for immediate actions: `Reset`, `Close`, `Play`, `Now`, step controls, zoom, delete.

- Shape: icon button, compact text button, or standard button.
- Active/pressed styling should not imply persistent selection unless the command is also a mode.
- Use icons where the command is familiar and the icon is already in the app’s visual language.
- Destructive commands use red styling and require clear labeling.
- Disabled commands should remain visible when their absence would be confusing.

### Configuration Launchers

Use for compact controls that open temporary configuration popovers: `Lunar Features`, `Surface Points`, `Guides`, `Compare`, `Advanced`.

- Shape: compact single pill.
- Color: green action-launcher treatment.
- Open state: indicate with `aria-expanded` styling, distinct from blue one-of selection.
- Placement: popovers render above persistent panels and canvas overlays.
- Scope: configuration changes apply to the owning view or panel unless explicitly documented as global.
- Grouping: configuration launchers may sit near each other, but should not be grouped with persistent exploration panel launchers unless the group label covers both.
- State: open state is not the same thing as enabled state. A launcher may be open while none of its contained options are enabled.
- Label: use the feature area name, not the currently selected value, unless the launcher is explicitly a compact select control.

### Persistent Panel Launchers

Use for controls that open persistent exploration or media surfaces: `Flyby`, `Media`, `Frame & Shoot`.

- Shape: compact pill inside the panel launcher strip.
- Color: green action family.
- State: active/open state reflects persistent panel visibility.
- Behavior: launched panel remains independently movable/resizable or otherwise persistent.
- Do not mix temporary configuration popovers and persistent exploration panels in the same labeled group unless intentionally documented.
- Persistent panel launcher state should mirror panel visibility. It should not imply that every feature inside the panel is currently active.

### Swatches And Semantic Markers

Use swatches to preview colors that also appear in the rendered scene or data visualization.

- Shape: small circle or compact marker.
- Size: visually smaller than checkbox and label.
- Placement: after the checkbox and before the label in checklist rows.
- Contrast: visible on dark panels and on rendered bodies where applicable.
- Semantics: stable within a feature family: solar yellow, Moon silver, craft cyan.
- Restraint: do not use semantic swatch colors for generic chrome, active tabs, or unrelated buttons.

### Data Badges And Pills

Use for compact metadata: mission phase, generated/provenance markers, media kind, craft role.

- Shape: small pill or badge.
- Color: semantic only when it identifies data category/status.
- Text: short, uppercase where established.
- Badges are labels, not buttons, unless they have explicit interactive affordance.

### Menus, Popovers, And Dropdowns

Use when choices are too numerous for inline display or when configuration is temporary.

- Anchor visually to the invoking control.
- Render above persistent panels.
- Restore focus to the invoker when closed.
- Do not obscure the selected control’s state.
- Use keyboard navigation and escape-to-close.
- Decide whether the surface is global or bounded to its owning panel. Global temporary UI uses the config popover layer; bounded panel UI uses panel-local layers under the panel root.
- Avoid `position: fixed` drawers inside panels unless the drawer intentionally escapes the panel and uses a global layer token.

### Panels

Use panels for persistent tools, media, and complex configuration.

- Header: title, optional context, then command buttons.
- Body: group controls by task and scope.
- Footer/status: use only when useful.
- Drag/resize affordances should be visually quiet but discoverable.
- Panel content should not look like a landing page.

## Panel Layout

Panel content should read from broad mode to narrow filter:

1. Panel title and close action.
2. Primary tabs or major mode.
3. One-of selector or compact mode presets.
4. Sliders/search/filters belonging to the active mode.
5. Status text and results.

Within sections:

- Category sections should have consistent top/bottom rhythm.
- Section titles should align with the content grid they describe.
- Related checkbox rows should share columns and row heights.
- Do not mix card rows, button rows, and native checkbox rows within one group unless each has a distinct role and label.
- Controls removed from the active mode should be structurally unmounted when practical, not merely hidden in place.
- A panel may be dense, but density must not erase hierarchy.

### Panel Anatomy

Every persistent panel should expose the same basic anatomy unless there is a documented reason:

- Header: panel title, current context when useful, close/minimize commands.
- Mode row: primary tabs or one-of mode selector.
- Scope row: selected craft/body/time/media context when the panel has a local scope.
- Controls: grouped by task, with one control role per visual pattern.
- Results/content: lists, previews, rendered data, or status.
- Status: loading, empty, unavailable, and error copy close to the affected region.

Panels should not need visible prose explaining how to use ordinary controls. When explanation is required, first ask whether the control hierarchy or label is unclear.

### Header Pill Strip

The desktop header pill strip is a quick-control surface, not a complete settings panel.

- Binary scene toggles belong in visible overlay/view groups.
- One-of global view selectors should be segmented and use the blue active language.
- Configuration launchers should use the green launcher language and sit in a launcher zone.
- Persistent panel launchers should be grouped by tool family and show panel visibility.
- Expanded/collapsed header behavior must not hide the only way to reach a primary workflow.
- Group labels should describe the scope: `View`, `Overlays`, `Lunar`, `Panels`, `Media`, or similar user-facing terms.

### Frame And Shoot

Frame and Shoot is both a persistent tool and a geometry explanation surface. Its controls should mirror the shared taxonomy while preserving local scope.

- Lock target, plane, optics, and similar exactly-one choices use one-of selectors.
- Guide/overlay configuration uses configuration launchers or checklist rows, not command-button styling.
- Local scene annotation state should not silently mutate the main scene unless the control label says it is shared.
- Temporary controls opened from Frame and Shoot must either be bounded to the panel or use the global config layer token; mixed layer ladders are a review failure.
- If a media/photo moment opens Frame and Shoot, the panel should make the time/camera/media context visible.

### Media And Transcript Surfaces

Media and transcript controls should reinforce mission time.

- Selecting a media item, clip, caption, transcript line, or event should make its mission-time effect clear.
- Filters should distinguish content kind, source/provenance, subject, camera, and mission phase.
- Facets that can be combined are grouped checkboxes/chips; mutually exclusive facets are one-of selectors.
- Media drawers and filters are temporary configuration surfaces unless they become persistent panels.
- Empty states should explain whether there is no data for the current time, no data for the current filters, or data is still loading.

### Scene Annotation Controls

Annotation controls need an extra check because their UI state has visible rendered consequences:

- The control label should name what appears in the scene.
- Swatches must match rendered annotation colors.
- Search or hover highlights should strengthen existing annotations instead of duplicating labels, paths, or perimeter rings.
- Annotation density controls should prevent unreadable clutter at default zoom.
- If annotations depend on data availability, the unavailable state must be visible in the owning panel.

## Forms And Configuration Content

- Use labels for every input.
- Prefer positive, direct labels.
- Use helper text for consequences or technical context, not for basic instructions.
- Put validation or warning text close to the affected field.
- Keep disabled controls visible when they explain capability; hide only when irrelevant to the current scope.
- Group controls by user task, not implementation module.
- If one checkbox reveals more controls, use progressive disclosure and keep the revealed controls visually subordinate to the triggering choice.

## Accessibility And Interaction

- Use real buttons, inputs, labels, and semantic roles before custom event handling.
- Ensure labels are clickable for checkboxes and radios.
- Manage focus when opening and closing temporary UI.
- Use `Escape` to close popovers and dialogs where appropriate.
- Maintain logical keyboard order: left-to-right, top-to-bottom in the visible layout.
- Focus outlines use `--ui-focus` and must be visible against the current surface.
- Text and interactive non-text elements need sufficient contrast.
- Text must fit at desktop and mobile widths without clipping.
- Hit targets may be compact on desktop, but mobile/touch contexts require larger spacing and target size.
- Do not rely on hover as the only way to reveal critical controls on touch surfaces.
- Verify accessible names after label changes. A concise visual label can have a longer `aria-label` when needed.
- Use native controls unless custom rendering provides clear value.
- Avoid putting interactive descendants inside clickable labels unless the event behavior is deliberately handled and tested.
- For generated panels, keep the semantic structure equivalent to static markup.

## Responsive Behavior

- Desktop header pill strip is the primary quick-control surface.
- Mobile shell should preserve the same component roles with larger hit targets and fewer simultaneous controls.
- Popovers may become anchored panels or bottom sheets on narrow screens if needed.
- Avoid horizontal scrolling inside configuration panels unless the content is explicitly a timeline or media strip.
- Text should wrap or abbreviate consistently; avoid viewport-based font scaling.
- Mobile controls should prioritize the current mission task. Do not simply mirror every desktop header pill at smaller size.
- Touch targets must be at least `44px` in both dimensions on mobile, or expose
  an equivalent `44px` hit area, as required by the Mobile Experience spec.
- Panels and drawers must remain reachable when the virtual keyboard is open for search.
- At narrow widths, prefer fewer visible controls plus stable navigation over wrapped rows that change meaning.

## Intentional Deviations

- Mission phase and generated/provenance markers may use amber because they describe mission data state, not generic UI selection.
- Audio/video/image timeline and media indicators may use semantic media colors when the color identifies content type.
- Destructive actions keep red styling.
- Rendered annotation colors may be more saturated than UI chrome if required for visibility on Earth/Moon surfaces.
