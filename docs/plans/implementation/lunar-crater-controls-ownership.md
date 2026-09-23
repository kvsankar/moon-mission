# Lunar Crater Controls Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`ui/lunar-crater-control-panel.js` is 2,371 physical lines. It mixes feature
filter/preset policy, catalog load coordination, DOM control construction,
per-scope control rendering, and event binding. Give catalog/filter policy,
control DOM rendering, and element construction separate owners. Retain the
public read/write/sync/bind API in a small facade. The catalog owner publishes
to registered panel callbacks; the DOM owner receives the facade's sync
callback as an explicit port rather than importing the facade or creating a
module cycle.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `lunar-crater-control-panel.js` | 2,371 | 1,659 | Under 1,000 |

## Verification

- Run all lunar-crater control-panel tests (including lazy catalog loading,
  scoped filters, search, and disposal) and focused browser controls.
- Run the full unit suite, source-structure check and static build.
- Preserve the active Lunar Features IDs separately from legacy Moon Sites.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `lunar-crater-control-panel.js` | 826 |
| `lunar-crater-control-model.js` | 410 |
| `lunar-crater-control-dom.js` | 868 |
| `lunar-crater-control-elements.js` | 386 |

The largest piece is 868 lines, 63.4% smaller than the original and below
the committed 1,659-line maximum and 1,000-line cap. The model owns catalog
and filter policy; the DOM owner receives the facade's async publication
callback through an explicit port; element construction is independent; and
the facade retains public read/write/sync/bind behavior. Existing 68 panel
assertions plus two new catalog-publication lifetime checks pass.
The full unit gate (3,831 passing, six skipped), static build and structure
check pass. On `/artemis2/`, the visible Lunar Features pill opened the panel
and the catalog resolved to a `450 filtered` count.
