---
doc_class: archive
status: archived
scope: repository.planning
prior_class: plan
archived_on: 2026-09-02
archive_reason: superseded-by-docs-plans-roadmap
---

# Current Plan

> Archive notice: the body below preserves May 2026 status language and is not
> current planning authority. Links were updated during archival so the record
> remains navigable.

Last updated: 2026-05-19

This is the live planning surface for active work. Feature docs, investigations, and handoff notes may explain context, but open TODOs should roll up here or into a linked workstream doc.

## Active Workstreams

- Artemis II media, stream sync, transcript, attribution, and launch media work: [Artemis II Media](../../plans/breakdown/artemis2-media.md)
- Performance, responsiveness, and optimization follow-ups: [Performance](../../plans/breakdown/performance.md)
- Timekeeping, mission-clock sync, UTC/TDB, and media clock mapping: [Time Synchronization](../../plans/breakdown/time-synchronization.md)
- Runtime style, typography, control taxonomy, and mobile/Frame and Shoot verification: [Runtime Style Audit](../../design/style-audit-review-report.md)

## Style And Typography Audit

This is the live checklist for the runtime UI style audit. The source review is [Runtime UI Style Audit Review](../../design/style-audit-review-report.md); the standards are [Runtime UX Doctrine](../../design/runtime-ux-doctrine.md) and [Runtime Style Guide](../../design/style-typography-guide.md). Keep the detailed review document intact as rationale and evidence, but update this section as items are started, completed, or re-reviewed.

Current status:

- No Critical release blockers were found in the 2026-05-18 re-review.
- The style pass is still not style-system complete.
- The main risk is visual convergence without matching role, state, keyboard, grouping, layer, and progressive-disclosure convergence.
- Recent follow-up work addressed several mobile shell issues after the review: mobile pill overlap/wrapping, disabled mobile-only panel clutter, mobile group labels, mobile tap reliability, mobile timeline time cycling, touch target polish, and the Follow Moon north-up camera regression.
- The deeper component taxonomy, accessibility semantics, layer system, and desktop annotation/control grouping items remain open.

### Audit Queue

1. **Create a control-role map for touched controls.**
   - Status: Open.
   - Scope: header pills, Lunar Features, Surface Points, Guides, Frame and Shoot lock/optics controls, media filters, timeline toggles, and mobile shell controls.
   - Issue: broad blue/green pill styling is being applied before every control has a declared role: tab, one-of selector, binary toggle, command, slider, search, disclosure, launcher, menu, or checklist.
   - Evidence: `src/platform/css/mission-layout.css:610`, `src/platform/css/mission-layout.css:1392`, `src/platform/css/mission-layout.css:2209`, `src/platform/css/mission-layout.css:4587`, `src/platform/css/mission-layout.css:4776`, `src/platform/css/mission-layout.css:5046`, `src/platform/css/mission-panels.css:2420`.
   - Direction: make a checked-in role map before more visual consolidation; normalize semantics and active-state attributes, especially where controls appear in both the main runtime and Frame and Shoot.

2. **Implement shared control primitives.**
   - Status: Open.
   - Scope: primary tabs, category tabs, one-of pills, configuration launchers, persistent panel launchers, compact checklists, and timeline seek controls.
   - Issue: similar-looking controls are still locally implemented with divergent DOM roles, active-state attributes, keyboard models, and CSS hooks.
   - Direction: extract or formalize small shared primitives/classes so future panels copy the role contract, not only the visual style.

3. **Convert primary Lunar Features modes to real tabs.**
   - Status: Open.
   - Scope: `Show Always`, `Hover`, and `Search` in static and generated Lunar Features panels.
   - Issue: these modes switch the mounted panel body but still use button-group semantics with `role="group"` and `aria-pressed`.
   - Evidence: `mission.html:1233`, `src/platform/js/ui/lunar-crater-control-panel.js:2034`, `src/platform/css/mission-base.css:789`.
   - Direction: use a reusable primary panel tabs primitive with `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, and roving `tabindex`; inactive tab content should not be focusable or announced.

4. **Clarify the header annotation/configuration zone.**
   - Status: Open.
   - Scope: `Surface Points`, `Guides`, and `Lunar Features` on desktop and any non-mobile layouts where those launchers remain visible.
   - Issue: `Surface Points` and `Guides` open configuration panels but still live among binary scene overlay toggles such as `Craft Orbit`, `Sky`, `Ecliptic`, and `Equatorial`; `Lunar Features` is separated, making the mixed scope more obvious.
   - Evidence: `mission.html:1057`, `mission.html:1080`, `mission.html:1420`, `src/platform/css/mission-base.css:505`.
   - Direction: move `Surface Points`, `Guides`, and `Lunar Features` into one explicit annotation/configuration launcher zone, or visually split panel-opening controls from pure overlay toggles inside the current row.
   - Note: recent mobile simplification hides the third annotation row on mobile, but the desktop scope issue remains.

5. **Rebuild Surface Points and Guides as compact checklists.**
   - Status: Open.
   - Scope: static Surface Points and Guides sections plus Frame and Shoot generated variants.
   - Issue: current two-column bordered rows still read as selectable tiles/cards instead of independent checkbox rows.
   - Evidence: `mission.html:1110`, `mission.html:1179`, `src/platform/css/mission-base.css:680`, `src/platform/css/mission-base.css:698`, `src/platform/js/app/auxiliary-camera-views.js:644`.
   - Direction: introduce a shared compact checklist primitive with aligned checkbox, swatch/icon, label, optional metadata, and optional subordinate controls; avoid filled row boxes unless the row is truly a selectable tile.

6. **Define full layer tokens and migrate local z-index ladders.**
   - Status: Open.
   - Scope: scene overlays, timeline, persistent panels, panel chrome, header, config popovers, Frame and Shoot popovers, media drawer, and modals.
   - Issue: `--ui-config-popover-z` exists, but Frame and Shoot still uses very large local values and media/persistent panels still use unrelated numeric ladders.
   - Evidence: `src/platform/css/mission-base.css:63`, `src/platform/css/mission-base.css:569`, `src/platform/css/mission-base.css:590`, `src/platform/css/mission-base.css:608`, `src/platform/css/mission-base.css:626`, `src/platform/css/mission-layout.css:754`, `src/platform/css/mission-layout.css:762`, `src/platform/css/mission-panels.css:17`, `src/platform/css/mission-panels.css:252`, `src/platform/css/mission-panels.css:799`, `src/platform/css/mission-panels.css:3013`.
   - Direction: define the full layer scale in `:root`, migrate component roots to those tokens, and keep small local z-index values only inside tokenized component roots.

7. **Raise Lunar Feature category tabs to the typography floor or change the control pattern.**
   - Status: Open.
   - Scope: generated Lunar Feature category tabs.
   - Issue: category labels use `font-size: 7px`, below the guide's `8px` micro floor.
   - Evidence: `src/platform/css/mission-base.css:929`, `src/platform/css/mission-base.css:937`, `src/platform/js/ui/lunar-crater-control-panel.js:150`.
   - Direction: use the micro or label token; if four labels do not fit, shorten copy, allow wrapping at `8px`, or use a compact menu/category selector on narrow panels.

8. **Normalize the Media filter drawer as a component.**
   - Status: Open.
   - Scope: desktop Mission Media filter drawer and filter facets.
   - Issue: the filter toggle uses launcher language, but the drawer is still fixed with a local layer and facets mix chip/button styling without declaring independent vs exclusive filter behavior.
   - Evidence: `mission.html:2041`, `src/platform/css/mission-panels.css:776`, `src/platform/css/mission-panels.css:799`, `src/platform/css/mission-panels.css:920`.
   - Direction: classify the drawer as bounded panel UI or global temporary configuration; normalize content kind, source/provenance, subject, camera, and mission phase facet semantics and active states.
   - Note: recent mobile work removed the Media pill/panel from mobile, but the desktop component audit remains open.

9. **Unify static and generated Lunar Features panel structure.**
   - Status: Open.
   - Scope: static main-view Lunar Features markup, generated Lunar Features panel, category tabs, primary mode row, preset selectors, and checklist rows.
   - Issue: generated category tabs have better tab semantics than the primary mode row, and static/generated panels can still drift.
   - Evidence: `mission.html:1233`, `src/platform/js/ui/lunar-crater-control-panel.js:934`, `src/platform/js/ui/lunar-crater-control-panel.js:2034`.
   - Direction: extract small builders for primary tabs, category tabs, preset one-of selectors, and checklist rows; use the same builders/classes for static hydration and generated panels where practical.

10. **Add data-backed loading, missing, empty, unavailable, and out-of-range states.**
    - Status: Open.
    - Scope: Lunar Features, Surface Points, Guides, Media, and timeline surfaces.
    - Issue: happy-path controls look more polished than missing-data, empty-result, unavailable-category, too-many-results, and disabled states.
    - Evidence: `src/platform/js/ui/lunar-crater-control-panel.js:622`, `mission.html:1332`, `src/platform/js/ui/lunar-crater-control-panel.js:889`.
    - Direction: add or verify explicit state copy and disabled behavior for catalog loading/missing, empty search, no features after filters, unavailable overlay data, media out-of-range items, and timeline out-of-range states.

11. **Run a copy and terminology consistency pass.**
    - Status: Open; do after component fixes.
    - Scope: visible labels, specs, tests, selectors, and internal comments.
    - Issue: `Show Always`, `Hover`, `Search`, `Lunar Features`, `Surface Points`, `Guides`, and legacy `crater`/Moon Sites naming need to remain clearly separated.
    - Evidence: `docs/specs/ui/lunar-feature-controls.md`, `src/platform/js/ui/lunar-crater-control-panel.js:117`, `src/platform/js/ui/lunar-crater-control-panel.js:622`.
    - Direction: prioritize names that could cause future work to use legacy Moon Sites controls for active Lunar Features behavior.

12. **Make the timeline audit concrete.**
    - Status: Partially addressed for mobile controls; broader audit open.
    - Scope: current time, scrub behavior, marker behavior, event/media lanes, media playback sync, keyboard behavior, and mobile timeline presentation.
    - Issue: mission time is meant to be the spine, but timeline/media/transcript/annotation surfaces are not yet fully treated as one synchronized time system.
    - Direction: document the current behavior against the timeline doctrine and the [Timeline and Media Playback Spec](../../specs/time/timeline-and-media-playback.md); then fix mismatches.
    - Recent work: mobile time display now cycles instead of showing all local/UTC/MET variants at once, and mobile Media controls were removed from the header.

13. **Run desktop and mobile verification screenshots and interaction checks.**
    - Status: Partially addressed for the recent mobile/header/follow-camera work; full audit coverage open.
    - Scope: `/artemis2/` main view, Frame and Shoot, Lunar Features, Surface Points, Guides, Media filters, timeline/media playback, keyboard walkthrough, screen-reader output, mobile touch behavior, and missing/loading mission-data states.
    - Issue: the original review did not fully verify live browser rendering, screenshots, keyboard behavior, screen-reader output, mobile touch behavior, or mission-data missing/loading states.
    - Direction: make Frame and Shoot and mobile first-class verification contexts, not secondary copies of main-view controls.

### Recently Closed Or Partially Closed Style-Audit Follow-Ups

- Mobile header pill overlap, wrapping, and desktop hover behavior leakage: closed by simplifying the mobile control surface and disabling hover expansion behavior on mobile.
- Mobile disabled control clutter: closed for the listed mobile panels/pills, including Media, Flyby/Broadcast, Frame and Shoot, Splashdown, craft transfer panels, Earth orbit XY, lunar standard/detailed, and annotation row controls.
- Mobile group discoverability: closed by keeping mobile groups expanded and showing group labels.
- Mobile pill tap reliability: closed by making mobile pointer enter/move/leave behavior inert so row scroll state does not reset during taps.
- Mobile timeline time density: partially closed by cycling local/UTC/MET instead of displaying all three at once.
- Mobile touch target polish: partially closed by raising several compact controls toward the guide's touch floor.
- Follow Moon drag rotation regression: closed by keeping forced-look follow cameras north-up during drag.

## Parking Lot

These items came from the 2026-05-16 context switch. Treat them as queued work, not necessarily started.

| Item | Status | Owning Doc |
|------|--------|------------|
| Move Moon render work to a branch. Current Moon render changes are risky to keep on `master`; issues were visible during smoke testing. | Done | [Moon Render Assets](../../operations/moon-render-assets.md) |
| Investigate Flyby Broadcast panel going totally dark. | Open; reproduce again | [Artemis II Media](../../plans/breakdown/artemis2-media.md) |
| Fix Media panel overlap with events. | Open; partly mitigated by default-layout work; user inputs pending | [Performance](../../plans/breakdown/performance.md) |
| Adjust Earth exposure during lunar eclipse so it cuts down to normal when only Earth is in view. | Done | [Frame And Shoot Lighting](../../specs/rendering/frame-and-shoot-lighting-and-exposure.md) |
| Integrate diarization artifacts. | Mostly done for runtime: manifest points to combined schema v4 transcript JSON, entity index, and VTT fallback files; Broadcast panel renders captions from JSON, shows a scroll-synced click-to-seek transcript panel, and preserves short highlight windows. Search/entity browser remains open. | [Artemis II Media](../../plans/breakdown/artemis2-media.md) |
| Change crater search and filter settings. | Done; tabbed Show Always, Hover, and additive Search model implemented | [Lunar Feature Controls](../../specs/ui/lunar-feature-controls.md) |
| Explore diarization -> LLM -> search and other AI-assisted discovery features. | Open | [Artemis II Media](../../plans/breakdown/artemis2-media.md) |
| Fix play, media, and control bugs. | Open | [Performance](../../plans/breakdown/performance.md) |
| Add attribution page for Hank Green, NASA media files, and other required media/source credits. | Open | [Artemis II Media](../../plans/breakdown/artemis2-media.md) |
| Prepare blog post, Reddit post, email to Hank, and related launch communications. | Open | [Artemis II Media](../../plans/breakdown/artemis2-media.md) |
| Plan deployment and testing, including SSIM testing and broader regression testing. | Open | [Performance](../../plans/breakdown/performance.md) |

### Crater Search And Filter Model

For the crater search/filter settings item, update defaults and UI around two independent display modes:

- Show Always: off or filter-based.
- Hover: off or filter-based.
- The Show Always and Hover filters are separate; changing one should not imply the other.
- Search is additive and should not duplicate labels or perimeter rings already shown by Show Always or Hover.

## Optimization Queue

The performance workstream owns these items. They are listed here so active planning has one entry point.

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

## Reference Notes

- Original dated parking lot: [open-todos-2026-05-16.md](open-todos-2026-05-16.md)
- Dryscope consolidation findings: [Documentation Consolidation Dryscope](../../operations/docs-consolidation-dryscope-2026-05-16.md)
