---
doc_class: spec
status: current
scope: ui.lunar-features
canonical_for:
  - lunar-feature-control-behavior
---

# Lunar Feature Controls Spec

Last updated: 2026-05-17

## Control Model

The Lunar Features pill opens a top-layer panel in both the main mission view and Frame and Shoot.

The panel has three tabs:

- Show Always
- Hover
- Search

Tab-specific controls are structurally mounted only in the active tab. A control removed from a tab should not remain in that tab's panel body as a hidden element.

Show Always and Hover each own an independent filter set. Changing one tab must not mutate the other tab's diameter range or feature-type filters.

## Show Always Tab

Show Always controls always-visible lunar feature annotations.

- Presets: Off, Recommended, All.
- Diameter range remains visible.
- Feature-type filters remain visible as grouped tabs: Popular, Lines & Relief, Large Regions, and Satellite Features.
- Search controls are not mounted in this tab.
- Display controls are not mounted in this tab.

Off disables Show Always. Recommended and All enable Show Always and apply the selected preset.

## Hover Tab

Hover controls pointer inspection of lunar features.

- Presets: Off, Recommended, All.
- Diameter range remains visible.
- Feature-type filters remain visible as grouped tabs: Popular, Lines & Relief, Large Regions, and Satellite Features.
- Search controls are not mounted in this tab.
- Display controls are not mounted in this tab.

Off disables Hover. Recommended and All enable Hover and apply the selected preset.

If Hover targets a feature that is already visible from Show Always or Search, the existing annotation is highlighted instead of drawing duplicate labels or perimeter rings. The highlight uses a thicker boundary and slightly larger label.

## Search Tab

Search is additive. Search results are displayed on top of the annotations implied by Show Always and Hover.

- Search shows only the search field and the search results panel.
- Search does not mount the preset buttons, diameter range, feature-type filters, or Display controls.
- Search result checkboxes pin or unpin matching features for the current search query.

If Search selects a feature already visible from Show Always, the existing annotation is highlighted instead of drawing duplicate labels or perimeter rings.

## Rendering Rules

- Do not render duplicate labels for the same lunar feature.
- Do not render duplicate perimeter circles for the same lunar feature.
- Search and Hover highlights can reuse the same visible feature annotation.
- Search and Hover highlights should remain visible against the Moon surface without looking visually heavy.
