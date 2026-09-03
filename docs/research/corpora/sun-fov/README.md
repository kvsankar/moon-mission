# Sun FoV Reference Pack

This folder contains downloaded reference images from official mission/image sources to calibrate Sun rendering decisions.

Generated assets:

- `manifest.json` (URLs, source pages, timestamps, byte sizes)
- `sun_reference_contact_sheet.jpg` (quick visual grid)
- downloaded image files (`sdo_*`, `soho_*`, `stereo_*`, `apollo*`, `iss*`)
- `normal-cameras/` (Apollo/ISS/Shuttle-style camera references)

## Source groups

## 1) Solar observatories (instrument-style images)

- SDO/HMI continuum (full-disk white-light)
- SDO/AIA 171A (EUV full-disk)
- SOHO/LASCO C2 (inner-corona coronagraph)
- SOHO/LASCO C3 (wide-corona coronagraph)
- STEREO/SECCHI COR2
- STEREO/SECCHI HI-1
- STEREO/SECCHI HI-2

## 2) Human camera references

- Apollo 16 inflight archive image (`S72-37001`)
- ISS Earth observation image with sunglint (`iss058e007722`)
- ISS solar-transit archive image (`NHQ202106250004`, ground camera)
- Additional curated set in `normal-cameras/`:
  - `normal-cameras/manifest.json`
  - `normal-cameras/normal_camera_reference_contact_sheet.jpg`
  - Includes NASA `Dark Sky, Bright Sun`, Apollo 16 Earthrise article image, STS-82 APOD crew photo, and ISS sunglint image.

## Primary source pages used

- SDO data + latest imagery:
  - https://sdo.gsfc.nasa.gov/data/
- SOHO realtime image descriptions:
  - https://soho.nascom.nasa.gov/data/realtime/image-description.html
- STEREO SECCHI fields-of-view overview:
  - https://stereo.gsfc.nasa.gov/classroom/secchi_fov.shtml
- NASA Image Library entries:
  - https://images.nasa.gov/details/S72-37001
  - https://images.nasa.gov/details/iss058e007722
  - https://images.nasa.gov/details/NHQ202106250004

## Comparison notes (for app Sun tuning)

1. Full-disk Sun imagery (SDO HMI/AIA style) usually shows a sharp disc edge with little to modest diffuse halo.
2. Coronagraph imagery (LASCO/COR2) is not directly comparable to normal camera rendering:
   - the bright central Sun is occulted on purpose
   - corona dominates because optics/instrument pipeline are designed for that
3. Very wide heliospheric imagers (HI-1/HI-2) show different brightness structures and processing artifacts; they are not a direct template for a viewer camera Sun sprite.
4. Human-camera style references can show stronger flares/ghosts, but those depend heavily on optics, exposure, and Sun placement in frame.

Practical inference for this renderer:

- A restrained baseline halo is physically plausible for non-occulted Sun rendering in space scenes.
- Strong flare should be optional and camera-profile dependent, not always on.

## Repro

The files were fetched with one-off Python commands during development.  
If refreshed later, update `manifest.json` and regenerate `sun_reference_contact_sheet.jpg`.
