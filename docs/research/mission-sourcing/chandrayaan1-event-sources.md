---
doc_class: research
status: current
scope: mission-sourcing.chandrayaan1
---

# Chandrayaan-1 Event Sourcing (For Mission Config)

> Research scope: this document preserves source chronology and confidence. The
> maintained mission config owns current visualization event timestamps.

## Why this file exists

The existing CH1 markdown in this repo has background context, but not a
complete source timeline with normalized UTC timestamps for config review.

This file captures a practical event set for `moon-mission` UI/event buttons, with source confidence notes.

## Runtime Visualization Profile

The checked-in CH1 runtime profile is intentionally trimmed for animation focus:

- Data window ends at `2008-11-14T19:00:49.999Z` (a short span after MIP impact).
- Active `eventConfigs` include events through `mipImpact` plus dynamic `now` and `ch1DataEnd`.
- `orbitRaise200km` and `missionEnd` remain documented below for provenance, but are not active in current event button lists.

## Source hierarchy used

1. NASA mission page (primary for key dates and key UTC times):
   - https://science.nasa.gov/mission/chandrayaan-1/
2. ISRO mission pages / archival publication (primary corroboration, especially MIP IST timing):
   - https://www.isro.gov.in/Chandrayaan_1.html
   - https://www.isro.gov.in/media_isro/pdf/ResourcesPdf/SpaceIndia/publication%286%29.pdf
3. Wikipedia mission timeline (used for fine-grained burn timestamps where NASA gives date but not exact burn time):
   - https://en.wikipedia.org/wiki/Chandrayaan-1

## Historical Launch Versus Visualization Start

The historical launch time is `2008-10-22T00:52:11Z` (06:22 IST).

The current runtime starts at `2008-10-22T01:12:00Z`, the first available SPK
sample. `assets/chandrayaan1/data/config.json5` therefore maps `missionStart` to
the visualization boundary while preserving the historical launch time in its
label/source text.

Do not treat the historical launch timestamp below as the current runtime event
time unless pre-ephemeris event behavior is explicitly designed and specified.

## Source Timeline (UTC)

| Key | Label | UTC timestamp | Confidence | Notes |
|---|---|---|---|---|
| `missionStart` | `🚀 Launch` | `2008-10-22T00:52:11Z` | High | Historical NASA launch time; current visualization clips this event to first SPK coverage at `01:12:00Z`. |
| `ebn1` | `🔥EBN#1` | `2008-10-23T03:30:00Z` | Medium | Earth-orbit raise #1. |
| `ebn2` | `🔥EBN#2` | `2008-10-25T00:18:00Z` | Medium | Earth-orbit raise #2. |
| `ebn3` | `🔥EBN#3` | `2008-10-26T01:38:00Z` | Medium | Earth-orbit raise #3. |
| `ebn4` | `🔥EBN#4` | `2008-10-29T02:08:00Z` | Medium | Earth-orbit raise #4. |
| `tli` | `🔥TLI` | `2008-11-03T23:26:00Z` | Medium | Final Earth burn into lunar transfer trajectory. |
| `loi` | `🔥LOI` | `2008-11-08T11:21:00Z` | High | LOI burn start time from NASA. |
| `lbn1` | `🔥LBN#1` | `2008-11-09T14:33:00Z` | Medium | Lunar orbit reduction #1. |
| `lbn2` | `🔥LBN#2` | `2008-11-10T16:28:00Z` | Medium | Lunar orbit reduction #2. |
| `lbn3` | `🔥LBN#3` | `2008-11-11T13:00:00Z` | Medium | Lunar orbit reduction #3. |
| `polar100km` | `100 km Polar Orbit` | `2008-11-12T00:00:00Z` | Medium | Final operational 100x100 km orbit achieved on Nov 12 (exact time not consistently published). |
| `mipRelease` | `📦 MIP Release` | `2008-11-14T14:36:00Z` | High | NASA + ESA corroboration (ESA gives 20:06 IST). |
| `mipImpact` | `💥 MIP Impact` | `2008-11-14T15:01:00Z` | High | NASA gives 15:01 UT; ISRO publication gives 20:31 IST. |
| `orbitRaise200km` | `⬆️ 200 km Orbit` | `2009-05-19T03:30:00Z` | Medium | Orbit raised to 200 km in May 2009; wiki cites 03:30-04:30 UTC window on May 19. |
| `missionEnd` | `🏁 Mission End` | `2009-08-28T20:00:00Z` | High | NASA "last contact" UTC; matches ISRO Aug 29 local-date statement (IST). |

## Notes for config authoring

- Treat this table as source research; verify current values in
  `assets/chandrayaan1/data/config.json5`.
- Keep `missionStart` at the first available ephemeris sample unless an accepted
  specification defines pre-ephemeris launch navigation.
- Use the same event list for both `geo` and `lunar` `eventConfigs`.
- Keep `now` and `<mnemonic>DataEnd` dynamic events, as in other mission configs.
- Prefer showing `burnFlag: true` for maneuver events (`ebn*`, `tli`, `loi`, `lbn*`).
- `polar100km`, `mipRelease`, `mipImpact`, `missionEnd` can be non-burn informational milestones.

## Date consistency note

- `2009-08-28T20:00:00Z` (UTC, NASA) corresponds to `2009-08-29` in IST, which aligns with ISRO's "lost on August 29, 2009" phrasing.
