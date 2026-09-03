# Runtime UI Style Audit Review

Last updated: 2026-05-18

This is a re-review of the current uncommitted runtime UI changes against [Runtime UX](../../specs/ui/runtime-ux.md) and [Runtime Style And Interaction](../../specs/ui/runtime-style-and-interaction.md). The runtime spec defines the product-level standard; the style spec defines the ground-level component and interaction rules.

## Verdict

No Critical release blockers were found, but the current pass is still not style-system complete.

The largest issue is not any single color, radius, or label. It is that the UI is converging visually faster than it is converging doctrinally. Several controls now share the new blue/green styling, but their DOM roles, grouping, scope, progressive-disclosure layer, and layer behavior still diverge. That can make the interface look more unified while preserving the user confusion underneath.

Doctrine alignment is currently partial:

- Mission time remains the spine, but timeline/media/transcript/annotation surfaces are not yet treated as one synchronized time system.
- Geometry is central, but annotation controls still expose implementation history instead of clear task doors.
- Complexity is being made prettier more than layered.
- Mobile and Frame and Shoot are not yet first-class verification contexts for these style changes.

## Severity Scale

- **Critical**: Blocks release or breaks core interaction/accessibility in a primary workflow.
- **High**: User-visible ambiguity or interaction/accessibility mismatch in a primary control surface.
- **Medium**: Contained inconsistency that can create visual drift, layering bugs, or accessibility debt.
- **Low**: Polish, naming, token, or consolidation issue that should be cleaned up during style-system work.

## Findings

### High: Primary Lunar Features modes still use button-group semantics instead of tabs

**Evidence**

- Static markup: `mission.html:1233`
- Dynamic panel builder: `src/platform/js/ui/lunar-crater-control-panel.js:2034`
- Styling: `src/platform/css/mission-base.css:789`

**Issue**

`Show Always`, `Hover`, and `Search` are primary panel tabs: each switches the mounted panel body. The updated style guide now requires tablist/tab/tabpanel semantics, roving focus, and inactive tab content that is not focusable or announced. The implementation still uses `role="group"` and `aria-pressed` buttons for the primary mode row.

The visual style moved closer to tabs, but the DOM contract still says pressed buttons.

**Impact**

Keyboard and assistive-tech behavior will not match what sighted users perceive. It also gives future panels the wrong pattern to copy.

**Recommended direction**

Create a reusable primary panel tabs primitive and use it in both static and generated Lunar Features panels. Use `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, and roving `tabindex`.

### High: Header control scope remains ambiguous for Surface Points and Guides

**Evidence**

- Binary overlay row: `mission.html:1057`, `mission.html:1080`
- Separated Lunar Features launcher: `mission.html:1420`
- Launcher styling added for `aria-haspopup="dialog"`: `src/platform/css/mission-base.css:505`

**Issue**

`Surface Points` and `Guides` open configuration panels, but they still live among binary scene overlay toggles such as `Craft Orbit`, `Sky`, `Ecliptic`, and `Equatorial`. `Lunar Features` is now separated as a launcher, which makes the remaining mixed row more noticeable.

The updated guide requires scope to be legible: binary scene toggles, temporary configuration launchers, and persistent panel launchers need distinct grouping and state models.

**Impact**

The header teaches that the same pill row contains immediate on/off state and panel-opening controls. Users cannot infer whether clicking a pill changes the scene, opens configuration, or both.

**Recommended direction**

Move `Surface Points`, `Guides`, and `Lunar Features` into one explicit annotation/configuration launcher zone, or visually split panel-opening controls from pure overlay toggles inside the current row.

### High: Grouped checkbox panels still read as selectable tiles

**Evidence**

- Static Surface Points and Guides sections: `mission.html:1110`, `mission.html:1179`
- Shared section grid: `src/platform/css/mission-base.css:680`
- Shared option styling: `src/platform/css/mission-base.css:698`
- Frame and Shoot generated Surface Points panel: `src/platform/js/app/auxiliary-camera-views.js:644`

**Issue**

The Surface Points and Guides panels still use a two-column grid with bordered row containers and bold labels. The colors have been quieted, but the anatomy is still tile-like: each checkbox row looks like a compact button or card instead of a checklist row.

The guide now requires checkbox-first anatomy with aligned checkbox, swatch/icon, label, optional metadata, and optional subordinate controls. Large checklists should use better grouping or progressive disclosure instead of squeezing into tile grids.

**Impact**

Independent toggles are visually confused with mode buttons. This is especially risky because these controls affect rendered scene annotations, where users need to understand exactly what is enabled.

**Recommended direction**

Introduce a shared compact checklist primitive and rebuild Surface Points, Guides, and Frame and Shoot variants around it. Preserve category spacing and aligned columns; avoid per-row filled boxes unless a row is truly a selectable tile.

### High: Style unification is being applied broadly before role mapping is complete

**Evidence**

- Frame and Shoot lock/optics controls: `src/platform/css/mission-layout.css:610`, `src/platform/css/mission-layout.css:1392`
- Timeline track toggles: `src/platform/css/mission-layout.css:2209`
- Mobile shell active states: `src/platform/css/mission-layout.css:4587`, `src/platform/css/mission-layout.css:4776`, `src/platform/css/mission-layout.css:5046`
- Ground track mode buttons: `src/platform/css/mission-panels.css:2420`

**Issue**

Many unrelated controls now share the same blue active styling and pill geometry. That may be appropriate, but the diff does not establish the role for each group: one-of selector, binary toggle, persistent mode, command, or local filter. Some local controls are styled as segmented one-of selectors while still using custom button classes and inconsistent active-state attributes.

The strengthened guide requires every visible control to be mapped to a taxonomy role before styling.

**Impact**

The UI looks more consistent at a glance, but users may still face inconsistent behavior. Future work will also have a harder time knowing whether a copied style implies one-of selection, on/off state, or panel visibility.

**Recommended direction**

Before more visual consolidation, make a role map for the touched controls and normalize their semantics. Prioritize controls that appear in both main runtime and Frame and Shoot.

### Medium: Category tabs improve Lunar Features but fall below the typography floor

**Evidence**

- Category tab styling: `src/platform/css/mission-base.css:929`
- Current category font size: `src/platform/css/mission-base.css:937`
- Labels defined in JS: `src/platform/js/ui/lunar-crater-control-panel.js:150`

**Issue**

Changing the old accordion into category tabs is directionally good, but the tab labels use `font-size: 7px`. The guide defines `8px` as the micro floor and now explicitly says not to shrink below that to force fit.

**Impact**

The category row becomes hard to scan and may fail on dense displays or lower-contrast conditions. It also creates pressure to use below-floor type elsewhere.

**Recommended direction**

Use the micro or label token. If four labels do not fit, shorten copy further, allow wrapping at `8px`, or switch to a compact menu/category selector on narrow panels.

### Medium: Layer tokens are partial and local z-index ladders remain

**Evidence**

- New token: `src/platform/css/mission-base.css:63`
- Main popover use: `src/platform/css/mission-base.css:569`, `src/platform/css/mission-base.css:590`, `src/platform/css/mission-base.css:608`, `src/platform/css/mission-base.css:626`
- Frame and Shoot overrides: `src/platform/css/mission-layout.css:754`, `src/platform/css/mission-layout.css:762`
- Media drawer local layer: `src/platform/css/mission-panels.css:799`
- Persistent panel layer values: `src/platform/css/mission-panels.css:17`, `src/platform/css/mission-panels.css:252`, `src/platform/css/mission-panels.css:3013`

**Issue**

The new `--ui-config-popover-z` token is useful, but it is not yet a layer system. Frame and Shoot still uses `2147483001` and `1000`; media drawers and persistent panels still use unrelated numeric ladders.

The updated guide calls for named role tokens for scene overlays, timeline, persistent panels, panel chrome, header, config popovers, and modals.

**Impact**

Popover and drawer obscuring bugs will keep recurring, especially when a global temporary surface is opened from inside a persistent panel.

**Recommended direction**

Define the full layer scale in `:root`, then migrate component roots to those tokens. Keep small local z-index values only inside tokenized component roots.

### Medium: Media filter drawer remains under-specified as a component

**Evidence**

- Drawer markup: `mission.html:2041`
- Drawer layer: `src/platform/css/mission-panels.css:799`
- Launcher styling: `src/platform/css/mission-panels.css:776`
- Facet buttons: `src/platform/css/mission-panels.css:920`

**Issue**

The filter toggle now uses the green launcher language, but the drawer is still `position: fixed` with `z-index: 7`, and the facets mix chip/button styling without declaring whether they are independent filters or one-of selectors. The guide now requires media filters to distinguish content kind, source/provenance, subject, camera, and mission phase, with combined facets using grouped checkboxes/chips and exclusive facets using one-of selectors.

**Impact**

Users may not understand which media filters combine, which replace each other, and whether the drawer belongs to the media panel or escapes globally.

**Recommended direction**

Classify the drawer as either bounded panel UI or global temporary configuration. Then normalize filter facet semantics and active states by facet type.

### Medium: Generated and static Lunar Features panels are closer, but still not equivalent

**Evidence**

- Static primary mode markup: `mission.html:1233`
- Generated primary mode markup: `src/platform/js/ui/lunar-crater-control-panel.js:2034`
- Generated category tabs: `src/platform/js/ui/lunar-crater-control-panel.js:934`

**Issue**

The generated category tabs have better tab semantics than the primary mode row. Static and generated panels still duplicate structural decisions instead of sharing a primitive, which increases the chance that accessibility and styling drift apart.

**Impact**

A fix in one panel context may not carry into Frame and Shoot or the static main view. This has already happened with layer behavior and panel controls.

**Recommended direction**

Extract small builders for primary tabs, category tabs, preset one-of selectors, and checklist rows. Use the same builders/classes for static hydration and generated panels where practical.

### Medium: State inventory is incomplete for data-backed annotation controls

**Evidence**

- Lunar feature status copy: `src/platform/js/ui/lunar-crater-control-panel.js:622`
- Search result container: `mission.html:1332`
- Type filter controls generated from catalog stats: `src/platform/js/ui/lunar-crater-control-panel.js:889`

**Issue**

The current changes improve normal-state controls, but the review did not find a complete visible contract for loading, missing catalog, empty search, too-many-results, unavailable feature categories, or disabled states across Lunar Features, Surface Points, and Guides.

The strengthened guide requires data-backed controls to define empty, loading, unavailable, duplicate-data, and missing-data states.

**Impact**

Annotation panels may look polished in the happy path while failing silently when mission data is absent or when search/filter state produces no useful result.

**Recommended direction**

Add or verify explicit state copy and disabled behavior for catalog loading/missing, empty search, no features after filters, and unavailable overlay data.

### Low: Copy direction improved, but terminology needs one more consistency pass

**Evidence**

- Spec changed from `Show All` to `Show Always`: `docs/specs/ui/lunar-feature-controls.md`
- UI labels changed to `Off`, `Recommended`, `All`: `src/platform/js/ui/lunar-crater-control-panel.js:117`
- Status copy: `src/platform/js/ui/lunar-crater-control-panel.js:622`

**Issue**

The move from `None/Default/All` to `Off/Recommended/All` is good. The remaining issue is making sure `Show Always`, `Hover`, `Search`, `Lunar Features`, `Surface Points`, `Guides`, and any legacy `crater` naming are consistently separated in visible UI, specs, tests, and internal comments.

**Impact**

Minor naming drift can reintroduce the older crater/site/lunar-feature confusion called out in `AGENTS.md`.

**Recommended direction**

Do a naming sweep after the component fixes. Prioritize visible labels, test selectors, docs, and comments that could cause future agents to use the legacy Moon Sites controls for Lunar Features.

## Cross-Cutting Review Notes

- The visual direction is better: green launcher language and blue selected state are starting to read as a system.
- The guide now has enough criteria to reject shallow style-only fixes. Future reviews should start with hierarchy and role mapping, then move into color/spacing.
- Frame and Shoot needs to be treated as a first-class test context, not a secondary copy of main-view controls.
- Mobile was only reviewed through the CSS diff and needs a screenshot/interaction pass before this can be considered complete.

## Recommended Fix Order

1. Create a control-role map for touched controls: header pills, Lunar Features, Surface Points, Guides, Frame and Shoot lock/optics, media filters, timeline toggles, and mobile shell controls.
2. Implement shared primitives for primary tabs, category tabs, one-of pills, configuration launchers, persistent panel launchers, compact checklists, and timeline seek controls.
3. Convert primary Lunar Features modes to real tabs in static and generated panels.
4. Move Surface Points, Guides, and Lunar Features into a clear annotation/configuration launcher zone, separate from binary overlay toggles.
5. Rebuild Surface Points and Guides on the compact checklist primitive.
6. Define full layer tokens and migrate Frame and Shoot popovers plus media drawer layers.
7. Raise Lunar Feature category tabs to the typography floor or change the control pattern.
8. Add data-backed loading, missing, empty, unavailable, and out-of-range states for Lunar Features, Surface Points, Guides, Media, and timeline surfaces.
9. Make the timeline audit concrete: document current time, scrub, marker, event, media, and keyboard behavior against the timeline doctrine.
10. Run desktop and mobile screenshots for `/artemis2/`, including main view, Frame and Shoot, Lunar Features, Surface Points, Guides, Media filters, and timeline/media playback.

## Re-Review Coverage

Reviewed:

- Current uncommitted diffs since the last commit.
- Strengthened style guide criteria.
- Header pill strip grouping.
- Lunar Features panel in static and generated forms.
- Surface Points and Guides panel styling.
- Frame and Shoot control styling and popover layers.
- Media Browser filter drawer and facets.
- CSS layer and token adoption.
- Mobile shell active-state changes through CSS scan.

Not fully verified:

- Live browser rendering and screenshots.
- Keyboard walkthrough.
- Screen-reader output.
- Mobile touch behavior.
- Mission data missing/loading states at runtime.
