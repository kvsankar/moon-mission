# Moon Mission Ephemeris Audit

This document audits the Wikipedia page [List of missions to the Moon](https://en.wikipedia.org/wiki/List_of_missions_to_the_Moon) against public orbit/trajectory sources that are relevant to this repo.

**Last updated:** 2026-03-31

## Scope

- Audited every mission row in the Wikipedia tables for `20th century`, `21st century`, `Future missions`, and `Proposed but full funding still unclear`.
- Did **not** duplicate the page's separate `Lunar rovers` table, because those rover rows belong to parent missions already covered here.
- Did **not** treat the page's `Unrealized concepts` section as mission ephemeris candidates, because those entries are design studies rather than launched or scheduled mission rows.
- Used a **conservative** rule: a mission only gets credit when I verified a public machine-readable orbit source or kernel archive. Narrative mission histories were not counted as orbit data.

## Status Legend

| Status | Meaning |
|---|---|
| `HORIZONS` | Primary spacecraft or mission-relevant flight article confirmed in JPL HORIZONS |
| `HORIZONS partial` | HORIZONS has only a related stage/booster/subcomponent, not the primary mission object |
| `NAIF/SPICE` | Public SPICE kernels confirmed outside HORIZONS |
| `NAIF/SPICE partial` | SPICE exists, but only for a limited mission arc or related sub-spacecraft |
| `Other archive` | Public orbit data confirmed in another official archive |
| `None verified` | No public machine-readable orbit source verified in this audit |
| `Pre-launch` | Future/proposed mission with no public pre-launch ephemeris or kernels verified in this audit |

## Sources Checked

- [Wikipedia mission list](https://en.wikipedia.org/wiki/List_of_missions_to_the_Moon)
- [JPL HORIZONS main interface](https://ssd.jpl.nasa.gov/horizons/)
- [JPL HORIZONS lookup API](https://ssd.jpl.nasa.gov/api/horizons_lookup.api?sstr=LRO&group=sct)
- [NAIF lunar mission index](https://naif.jpl.nasa.gov/naif/data_lunar.html)
- [NAIF Lunar Orbiter kernels](https://naif.jpl.nasa.gov/pub/naif/LUNARORBITER/kernels/)
- [NAIF Apollo kernels](https://naif.jpl.nasa.gov/pub/naif/APOLLO/kernels/spk/)
- [NAIF SELENE kernels](https://naif.jpl.nasa.gov/pub/naif/SELENE/kernels/)
- [ESA SMART-1 SPICE archive](https://spiftp.esac.esa.int/data/SPICE/SMART-1/)
- [ISAS DARTS orbit archive for Hiten](https://data.darts.isas.jaxa.jp/pub/orbits/hiten/)
- [NASA SPDF / SSCWeb provenance](https://sscweb.gsfc.nasa.gov/sscweb_data_provenance.html)

## Summary

### Actual missions on the Wikipedia page

- `144` actual missions were audited.
- `22` have confirmed `HORIZONS` primary coverage.
- `8` have only `HORIZONS partial` coverage.
- `8` have confirmed `NAIF/SPICE` coverage.
- `2` have only `NAIF/SPICE partial` coverage.
- `2` have confirmed `Other archive` coverage.
- `102` had no public machine-readable orbit source verified in this audit.

### Future and proposed missions on the Wikipedia page

- `55` future/proposed missions were audited.
- `1` already has a pre-launch HORIZONS entry: `Artemis II`.
- `54` had no public pre-launch ephemeris or kernels verified in this audit.

## Repo Takeaways

- Best `HORIZONS` expansion candidates not already central to the current app workflow include `WMAP`, `STEREO`, `ARTEMIS` P1/P2, `WIND`, `HGS-1`, `ISEE-3`, `Nozomi`, `TESS`, `JUICE`, and `Lunar Trailblazer`.
- Best `SPICE` pipeline candidates are `SMART-1`, `SELENE/KAGUYA`, and `Lunar Orbiter 1-5`.
- Historical Soviet `Luna`, `Zond`, most `Ranger`, most `Surveyor`, most commercial landers, and current Chinese primary spacecraft still have major public-data gaps for this repo's workflow.

## 20th Century

| Mission | Status | Notes |
|---|---|---|
| Pioneer 0 (Able I) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-1 No.1 | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer 1 (Able II) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-1 No.2 | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer 2 (Able III) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-1 No.3 | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer 3 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 1 (E-1 No.4) | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer 4 | None verified | No public machine-readable orbit source verified in this audit. |
| E-1A No.1 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 2 (E-1A No.2) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 3 (E-2A No.1) | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer P-3 Able IVB | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-3 No.1 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-3 No.2 | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer P-30 (Able VA) | None verified | No public machine-readable orbit source verified in this audit. |
| Pioneer P-31 (Able VB) | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 3 (P-34) | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 4 (P-35) | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 5 (P-36) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-6 No.2 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-6 No.3 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 4 (E-6 No.4) | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 6 (P-54) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-6 No.6 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-6 No.5 | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 7 | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 8 | None verified | No public machine-readable orbit source verified in this audit. |
| Kosmos 60 (E-6 No.9) | None verified | No public machine-readable orbit source verified in this audit. |
| Ranger 9 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-6 No.8 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 5 (E-6 No.10) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 6 (E-6 No.7) | None verified | No public machine-readable orbit source verified in this audit. |
| Zond 3 (3MV-4 No.3) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 7 (E-6 No.11) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 8 (E-6 No.12) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 9 (E-6 No.13) | None verified | No public machine-readable orbit source verified in this audit. |
| Kosmos 111 (E-6S No.204) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 10 (E-6S No.206) | None verified | No public machine-readable orbit source verified in this audit. |
| Surveyor 1 | None verified | No public machine-readable orbit source verified in this audit. |
| Explorer 33 (AIMP-D) | None verified | No public machine-readable orbit source verified in this audit. |
| Lunar Orbiter 1 | NAIF/SPICE | NAIF Lunar Orbiter SPKs. |
| Luna 11 (E-6LF No.101) | None verified | No public machine-readable orbit source verified in this audit. |
| Surveyor 2 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 12 (E-6LF No.102) | None verified | No public machine-readable orbit source verified in this audit. |
| Lunar Orbiter 2 | NAIF/SPICE | NAIF Lunar Orbiter SPKs. |
| Luna 13 (E-6M No.205) | None verified | No public machine-readable orbit source verified in this audit. |
| Lunar Orbiter 3 | NAIF/SPICE | NAIF Lunar Orbiter SPKs. |
| Surveyor 3 | None verified | No public machine-readable orbit source verified in this audit. |
| Lunar Orbiter 4 | NAIF/SPICE | NAIF Lunar Orbiter SPKs. |
| Surveyor 4 | None verified | No public machine-readable orbit source verified in this audit. |
| Explorer 35 (AIMP-E) | None verified | No public machine-readable orbit source verified in this audit. |
| Lunar Orbiter 5 | NAIF/SPICE | NAIF Lunar Orbiter SPKs. |
| Surveyor 5 | None verified | No public machine-readable orbit source verified in this audit. |
| Soyuz 7K-L1 No.4L | None verified | No public machine-readable orbit source verified in this audit. |
| Surveyor 6 | None verified | No public machine-readable orbit source verified in this audit. |
| Soyuz 7K-L1 No.5L | None verified | No public machine-readable orbit source verified in this audit. |
| Surveyor 7 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-6LS No.112 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 14 (E-6LS No.113) | None verified | No public machine-readable orbit source verified in this audit. |
| Soyuz 7K-L1 No.7L | None verified | No public machine-readable orbit source verified in this audit. |
| Zond 5 (7K-L1 No.9L) | None verified | No public machine-readable orbit source verified in this audit. |
| Zond 6 (7K-L1 No.12L) | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 8 | HORIZONS partial | HORIZONS mission-related object only: S-IVB stage. |
| Soyuz 7K-L1 No.13L | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-8 No.201 | None verified | No public machine-readable orbit source verified in this audit. |
| Soyuz 7K-L1S No.3 | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 10 | HORIZONS partial | HORIZONS mission-related objects: S-IVB stage and LM Snoopy. |
| Luna E-8-5 No.402 | None verified | No public machine-readable orbit source verified in this audit. |
| Soyuz 7K-L1S No.5 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 15 (E-8-5 No.401) | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 11 | HORIZONS partial | HORIZONS mission-related object only: S-IVB stage. |
| Zond 7 (7K-L1 No.11L) | None verified | No public machine-readable orbit source verified in this audit. |
| Kosmos 300 (E-8-5 No.403) | None verified | No public machine-readable orbit source verified in this audit. |
| Kosmos 305 (E-8-5 No.404) | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 12 | HORIZONS partial | HORIZONS mission-related object only: S-IVB stage. |
| Luna E-8-5 No.405 | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 13 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 16 (E-8-5 No.406) | None verified | No public machine-readable orbit source verified in this audit. |
| Zond 8 (7K-L1 No.14L) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 17 (E-8 No.203) | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 14 | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 15 | NAIF/SPICE partial | NAIF Apollo 15 CSM lunar-orbit arc only. |
| PFS-1 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 18 (E-8-5 No.407) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 19 (E-8LS No.202) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 20 (E-8-5 No.408) | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 16 | NAIF/SPICE partial | NAIF has Apollo 16 subsatellite data, not full crewed mission coverage. |
| PFS-2 | NAIF/SPICE | NAIF Apollo 16 subsatellite SPK. |
| Soyuz 7K-LOK No.1 | None verified | No public machine-readable orbit source verified in this audit. |
| Apollo 17 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 21 (E-8 No.204) | None verified | No public machine-readable orbit source verified in this audit. |
| Explorer 49 (RAE-B) | None verified | No public machine-readable orbit source verified in this audit. |
| Mariner 10 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 22 (E-8LS No.206) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 23 (E-8-5M No.410) | None verified | No public machine-readable orbit source verified in this audit. |
| Luna E-8-5M No.412 | None verified | No public machine-readable orbit source verified in this audit. |
| Luna 24 (E-8-5M No.413) | None verified | No public machine-readable orbit source verified in this audit. |
| ISEE-3 (ICE/Explorer 59) | HORIZONS | HORIZONS as ICE (-111). |
| Hiten (MUSES-A) | Other archive | ISAS DARTS orbit-data archive. |
| Geotail | Other archive | NASA SPDF/SSC definitive positions (CDF/SSC holdings). |
| WIND | HORIZONS | HORIZONS primary spacecraft (-8). |
| Clementine (DSPSE) | HORIZONS | HORIZONS primary spacecraft (-40). |
| HGS-1 | HORIZONS | HORIZONS primary spacecraft (-125126). |
| Lunar Prospector (Discovery 3) | HORIZONS | HORIZONS primary spacecraft (-25). |
| Nozomi (PLANET-B) | HORIZONS | HORIZONS primary spacecraft (-178). |

## 21st Century

| Mission | Status | Notes |
|---|---|---|
| WMAP | HORIZONS | HORIZONS primary spacecraft (-165). |
| SMART-1 | NAIF/SPICE | NAIF lunar index and ESA SPICE archive. |
| STEREO | HORIZONS | HORIZONS via STEREO-A/B (-234, -235). |
| ARTEMIS | HORIZONS | HORIZONS via ARTEMIS P1/P2 a.k.a. THEMIS-B/C (-192, -193). |
| SELENE | NAIF/SPICE | NAIF SELENE kernels and JAXA DARTS SPK products. |
| Chang'e 1 | None verified | No public machine-readable orbit source verified in this audit. |
| Chandrayaan-1 | HORIZONS | HORIZONS primary spacecraft (-86). |
| LRO & LCROSS | HORIZONS | HORIZONS primary spacecraft for LRO (-85) and LCROSS shepherd/centaur (-18, -18900). |
| Chang'e 2 | None verified | No public machine-readable orbit source verified in this audit. |
| GRAIL | HORIZONS | HORIZONS primary spacecraft for GRAIL-A/B (-177, -181). |
| LADEE | HORIZONS | HORIZONS primary spacecraft (-12). |
| Chang'e 3 | HORIZONS partial | HORIZONS mission-related object only: Chang'e 3 booster (-139459). |
| Chang'e 5-T1 | HORIZONS partial | HORIZONS mission-related object only: lunar-impacting second-stage booster (-78000). |
| TESS | HORIZONS | HORIZONS primary spacecraft (-95). |
| Queqiao | None verified | No public machine-readable orbit source verified in this audit. |
| Chang'e 4 | HORIZONS partial | HORIZONS mission-related object only: Chang'e 4 booster (-143846). |
| Beresheet | None verified | No public machine-readable orbit source verified in this audit. |
| Chandrayaan-2 | HORIZONS | HORIZONS orbiter and lander (-152, -153). |
| Chang'e 5 | None verified | No public machine-readable orbit source verified in this audit. |
| CAPSTONE | HORIZONS | HORIZONS primary spacecraft (-1176). |
| Danuri | HORIZONS | HORIZONS primary spacecraft (-155). |
| Artemis I | HORIZONS | HORIZONS Orion / Artemis I (-1023). |
| Hakuto-R Mission 1 | None verified | No public machine-readable orbit source verified in this audit. |
| Jupiter Icy Moons Explorer | HORIZONS | HORIZONS JUICE spacecraft (-28); Moon encounter is a gravity assist, not a lunar science orbit. |
| Chandrayaan-3 | HORIZONS | HORIZONS lander and propulsion module (-158, -169). |
| Luna 25 | HORIZONS partial | HORIZONS mission-related object only: Luna-25 stage (-9901492). |
| SLIM | HORIZONS | HORIZONS primary spacecraft (-240). |
| Peregrine Mission One | None verified | No public machine-readable orbit source verified in this audit. |
| IM-1 | None verified | No public machine-readable orbit source verified in this audit. |
| DRO A/B | None verified | No public machine-readable orbit source verified in this audit. |
| Queqiao-2 | None verified | No public machine-readable orbit source verified in this audit. |
| Chang'e 6 | None verified | No public machine-readable orbit source verified in this audit. |
| Blue Ghost M1 | None verified | No public machine-readable orbit source verified in this audit. |
| Hakuto-R Mission 2 | None verified | No public machine-readable orbit source verified in this audit. |
| Lunar Trailblazer (NASA, 2025) | HORIZONS | HORIZONS primary spacecraft (-242). |
| Brokkr-2 | None verified | No public machine-readable orbit source verified in this audit. |
| Chimera-1 | None verified | No public machine-readable orbit source verified in this audit. |
| IM-2 | None verified | No public machine-readable orbit source verified in this audit. |

## Future Missions

| Mission | Status | Notes |
|---|---|---|
| Mark 1 Pathfinder Mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Blue Ghost M2 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar Pathfinder | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Griffin Mission 1 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Chang'e 7 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| IM-3 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Starship Demo mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Artemis III Starship HLS delivery | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Starship cargo mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| FLEX | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Astrobotic mission 3 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| ZeusX | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Mission 2.5 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Chandrayaan-4 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Luna 26 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Chang'e 8 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Mission 3 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| TBD (Lunar Rover) | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Uncrewed Blue Moon Demo mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Artemis IV Starship HLS delivery | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Artemis V Blue Moon HLS delivery | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar Polar Exploration Mission (LUPEX) | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Canadian lunar rover mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Mission 4 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Luna 27 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| TBD (CLPS Lander) | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Mission 5 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Argonaut M1 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| KLEP | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar Voyage 3 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Artemis II | HORIZONS | HORIZONS Orion / Artemis II (-1024) already present pre-launch. |
| Artemis IV | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Artemis V | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Chinese crewed lunar mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |

## Proposed Missions

| Mission | Status | Notes |
|---|---|---|
| Doge-1 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Beresheet 2 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Garata-L | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| LSAS lander | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Parsec lunar satellites | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| AYAP-1 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar Meteoroid Impact Observer | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar Trailblazer (Australian concept) | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar zebro | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| AYAP-2 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Zeus | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| International Lunar Research Station (ILRS 15) | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Luna 29 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Luna 28 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Luna 30 | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Indian Lunar Crewed Mission | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| BOLAS | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Autonomous Impactor for Lunar Exploration | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar Crater Radio Telescope | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| Lunar space elevator | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
| LVICE | Pre-launch | No public HORIZONS or kernel entry verified in this audit. |
