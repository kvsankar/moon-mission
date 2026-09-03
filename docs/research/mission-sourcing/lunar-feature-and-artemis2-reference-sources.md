# Lunar Feature And Artemis II Reference Sources

Last updated: 2026-05-12

This note captures vetted external references for two recurring needs:

- machine-usable lunar surface-feature data beyond craters (especially basins)
- Artemis II public/crew-facing lunar map resources used during the April 6, 2026 flyby window

Use this as a source index when extending feature overlays, validating labels, or cross-checking Artemis II map/timeline context.

## Lunar Feature Data Sources

### 1) USGS Unified Geologic Map of the Moon (GIS)

Best primary source for global lunar geologic units and linework, including basin-related structures and context.

- Catalog page: `https://astrogeology.usgs.gov/search/map/Moon/Geology/Unified_Geologic_Map_of_the_Moon_GIS_v2/`
- Direct ZIP: `https://asc-astropedia.s3.us-west-2.amazonaws.com/Moon/Geology/Unified_Geologic_Map_of_the_Moon_GIS_v2.zip`

### 2) IAU/USGS Gazetteer GIS Downloads (Moon)

Best source for named lunar features as a GIS label layer (maria, montes, rimae, etc.).

- Downloads landing page: `https://planetarynames.wr.usgs.gov/GIS_Downloads`
- Direct Moon shapefile ZIP (center points): `https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip`

### 3) Lunar relief basemaps for overlay context

Useful global terrain/relief basemaps for feature-layer visualization.

- LOLA + Kaguya shaded relief (59 m/px):
  - `https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_shaded_relief_merge_60n60s_59m`
- LROC GLD100 color shade (118 m/px):
  - `https://astrogeology.usgs.gov/search/map/moon_lroc_wac_gld100_colorshade_79s79n_118m`

## Artemis II Crew/Public Moon Map Resources

These are the key publicly shared artifacts that map to Artemis II lunar observation planning and feature identification.

### Feature-labeled map and cards

- Labeled Moon Map (PDF):
  - `https://www.nasa.gov/wp-content/uploads/2025/12/labeled-moon-map.pdf`
- Moon Image Cards (PDF, includes "Lunar Fifteen" targets):
  - `https://www.nasa.gov/wp-content/uploads/2025/12/moon-image-cards.pdf`
- Artemis II "Observe the Moon Like an Astronaut" activity page:
  - `https://www.nasa.gov/stem-content/artemis-ii-observe-the-moon/`

### Lunar targeting and mission timeline files

- Artemis II Lunar Targeting Plan landing page:
  - `https://science.nasa.gov/resource/artemis-ii-lunar-targeting-plan/`
- Artemis II Lunar Targeting Plan PDF:
  - `https://assets.science.nasa.gov/content/dam/science/missions/artemis/ArtemisII_LunarTargetingPlan.pdf`
- Artemis II public overview timeline PDF:
  - `https://www.nasa.gov/wp-content/uploads/2026/01/artemis-ii-overview-timeline-public-final.pdf`

### Adjacent media context

- Artemis Timeline web viewer:
  - `https://artemistimeline.com/`
- Artemis Timeline source repo:
  - `https://github.com/hankmt/Artemis-Timeline`

## Notes

- These links were validated as live on 2026-05-12.
- Keep references to official NASA/USGS sources where possible; treat social posts as discovery pointers, not canonical data sources.
- Important caveat for basin overlays: the IAU Gazetteer Moon nomenclature center-point export does **not** include an official `Basin, basins` feature class. In this repo, non-crater expansion should therefore start with named IAU classes that are present (e.g., maria, montes, rimae, dorsa, valles), and basin-specific overlays should be treated as a separate curated/science layer.
