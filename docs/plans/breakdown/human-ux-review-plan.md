---
doc_class: plan
status: current
scope: ui.human-ux-review
---

# Detailed Human UX Review

## Scheduling And Intent

Backlog state: **deferred**. On 2026-09-15 the user reviewed the current UI,
said it looked good for now, and requested a detailed human UX review after
finishing the other roadmap items.

The [repository roadmap](../roadmap.md#deferred-backlog) owns scheduling.
Run this review against the integrated app available at that later point;
do not restrict it to the September visual-token/progressive-disclosure diff.
The review does not block the other roadmap work. Existing technical review,
regression tests, and scene-baseline reconciliation retain their own scope.

The objective is to assess whether a person can understand the app, complete
useful mission tasks, and recover their context as available space changes.
A human performs and records the review. Automated checks and prior agent
reports provide supporting evidence, not a substitute for this review.

## Reference Material

- [Runtime UX](../../specs/ui/runtime-ux.md)
- [Runtime Style And Interaction](../../specs/ui/runtime-style-and-interaction.md)
- [Panel Progressive Disclosure](../../specs/ui/panel-progressive-disclosure.md)
- [Panel System V1](../../specs/ui/panel-system-v1.md)
- [Mobile Experience V1](../../specs/mobile-experience-v1-spec.md)
- [UI Review Procedure](../../operations/contributor/ui-review.md)
- [Progressive Workspace Evidence](../../evidence/reviews/progressive-workspace-ux-2026-09-15.md)

These documents own behavior and review guidance. This plan owns review tasks
and outputs; accepted behavior changes must be promoted into the relevant spec.

## Preparation

1. Record the build/revision, URL, browser, device, viewport, input method, and
   relevant saved-layout state. Confirm the runtime data needed for each task
   is available and note any known limitations.
2. Review both a clean first visit and a returning session with saved settings.
3. Use Artemis II for the integrated media/inspection workflows, Chandrayaan 3
   for a different mission structure, and a supported comparison or multi-craft
   case. Adjust the matrix to the missions shipped at review time.
4. Include a fresh-user perspective as well as an experienced-user perspective
   where practical. Record any instructions or assistance the reviewer needed.

## Review Tasks

### First Visit And Orientation

- Choose a mission, understand its brief/data coverage, and launch it.
- Explain what the current scene shows, where the mission clock is, what is
  selected, and which action is the natural next step.
- Find the route back to mission selection and determine how to revisit or
  share the current context where supported.

### Mission Workflows

- Play, pause, change speed, seek an event, and return to a known moment.
- Change origin/frame, 2D/3D mode, camera target and overlays; assess whether
  control labels and visible feedback explain the resulting scene.
- Select media, navigate a transcript or search result, inspect a related view
  in Frame and Shoot, and return to the main scene.
- Open, close, resize, maximize and restore tools; test recovery after a
  mistaken action and after reloading a saved layout.
- Exercise a comparison or multi-craft workflow and check that ownership of
  time, craft, camera and displayed data remains understandable.

### Progressive Disclosure And Space

- Reduce width and height independently, then grow the window again while
  working. Include a large desktop, laptop, intermediate window, narrow window,
  short wide window, phone portrait and phone landscape.
- Use the then-current space boundaries as well as sizes just above/below them;
  assess whether the transitions feel predictable rather than abrupt.
- Resize individual panels independently of the outer window. Check that
  reduced detail remains useful and that hidden tools/details are discoverable.
- Evaluate the scene/playback priority, Tools and Scene entry points, compact
  View options/Time controls, and media-strip disclosure where still applicable.
- Check continuity of time, camera, media selection, filters and layout through
  contraction, expansion, explicit tool changes and desktop/mobile transitions.

### Visual Hierarchy And Accessibility

- Assess scanability, terminology, grouping, text size/contrast, control states,
  icon meaning and consistency across static and generated panels.
- Complete representative tasks with keyboard only and with touch. Check focus
  order, visible focus, Escape/close behavior, target sizes and hover dependence.
- Check accessible names and relationships with a screen reader, including
  disclosure state, time controls, status messages and hidden content.
- Check browser zoom/text enlargement, reduced motion, safe-area/browser chrome
  constraints and search while the virtual keyboard is open.

### Scientific Clarity And Resilience

- Assess whether local/UTC/mission elapsed time, units, reference frames and
  camera/scale choices are clear at the point they affect interpretation.
- Check whether sourced, derived, approximate and unavailable information can
  be distinguished, and whether provenance is reachable when needed.
- Review loading, empty, filtered-out, missing-data and out-of-range states.
- Assess perceived startup, playback, seek and resize responsiveness, including
  whether progressive disclosure reduces distraction and interaction effort.

## Evidence And Triage

Produce a dated human-authored report under `docs/evidence/reviews/` containing:

- the tested build and coverage matrix, with untested areas called out;
- task outcomes, assistance needed, confusing moments and recovery paths;
- screenshots or short recordings with viewport and state context;
- findings with a concrete user consequence, reproduction steps, severity,
  affected surface, expected outcome and proposed follow-up;
- strengths to retain and intentional design tradeoffs worth revisiting.

Distinguish reproducible defects from usability friction, preference and unmet
requirements. Triage every finding as accepted work, an explicit design
decision, a duplicate/superseded item, or deferred/rejected with rationale.
Prioritize accepted work with the user in the mutable roadmap; do not silently
turn all observations into implementation requirements.

## Completion Criteria

- A human has completed the agreed coverage and published the report.
- Material findings have evidence and a recorded disposition.
- Accepted behavior changes have an owning specification and scoped follow-up.
- The roadmap records the outcome, including deferred findings and coverage
  limitations. Writing this plan or running automated tests does not complete
  the human review.
