# Moon Render Tuning Experiments

These nine Playwright tools form an experimental harness for tuning and
diagnosing Moon rendering. They exercise either the isolated
`moon-render-tuner.html` surface or the Artemis II mission runtime.

Run every command from the repository root. The tools launch the installed
Chrome channel with `--headless=new` and WebGL/GPU flags. They require:

- repository dependencies installed with `npm install`;
- a Chrome installation available to Playwright as `channel: "chrome"`;
- the Vite app running on `http://127.0.0.1:7275`;
- Artemis II runtime data staged locally for scripts that open the mission.

In PowerShell, start the required server with:

```powershell
.\node_modules\.bin\vite.cmd --port 7275 --strictPort --host 127.0.0.1
```

Several scripts honor `MOON_TUNE_BASE_URL`, but `probe.mjs`,
`probe-mission.mjs`, and `probe-composer-lighting.mjs` currently use the
default URL directly. Keep the server on port `7275` when using the complete
suite.

Generated screenshots are written to `tmp/moon-tune/shots/`. The repository's
`tmp/` ignore rule keeps these experiment outputs out of Git.

## Screenshot Tools

### `shoot.mjs`

Loads `moon-render-tuner.html`, applies a low-Sun reference framing plus JSON
overrides through the tuner's Apply JSON control, optionally drags the camera,
and captures the tuner canvas.

```powershell
node scripts/moon-tune/shoot.mjs <label> [json-overrides]
node scripts/moon-tune/shoot.mjs low-sun-test '{"primaryElevationDeg":4,"normalScaleX":1.6,"normalScaleY":1.6}'
```

Inputs:

- `label`: output basename; defaults to `shot`.
- `json-overrides`: JSON object merged over the built-in framing; defaults to
  `{}`.
- `PROFILE`: `fast` or `quality`; defaults to `fast`.
- `DRAG_DX`, `DRAG_DY`: integer camera-drag deltas; default to `60` and `140`.
- `MOON_TUNE_BASE_URL`: server base URL; defaults to
  `http://127.0.0.1:7275`.

Output: `tmp/moon-tune/shots/<label>.png`.

### `mission-shot.mjs`

Loads the Artemis II mission, selects a main-camera preset, captures the main
viewport, and captures any matching auxiliary panels found through its legacy
selector list.

```powershell
node scripts/moon-tune/mission-shot.mjs [preset] [label]
```

Inputs:

- `preset`: `free`, `earth`, or `moon`; defaults to `moon`.
- `label`: output basename; defaults to `mission-<preset>`.
- `MOON_TUNE_BASE_URL`: server base URL; defaults to
  `http://127.0.0.1:7275`.

Outputs:

- `tmp/moon-tune/shots/<label>.png`;
- zero or more `tmp/moon-tune/shots/<label>-aux-<selector>.png` crops when a
  matching auxiliary panel exists.

### `shoot-follow-moon-at.mjs`

Loads Artemis II, selects Follow Moon, attempts to seek to a requested UTC
instant through legacy optional scene methods, and captures the main viewport.
It is the comparison companion to `shoot-craft-to-moon-at.mjs`.

```powershell
node scripts/moon-tune/shoot-follow-moon-at.mjs [label] [iso-utc]
```

Inputs:

- `label`: output basename; defaults to `follow-moon-shot`.
- `iso-utc`: target time; defaults to `2026-04-06T22:41:21Z`. Invalid values
  skip the seek attempt rather than terminating the script. On the current
  runtime, the attempted scene methods may be absent; check the reported scene
  time before using the screenshot for a time-specific comparison.
- `MOON_TUNE_BASE_URL`: server base URL; defaults to
  `http://127.0.0.1:7275`.

Output: `tmp/moon-tune/shots/<label>.png`.

### `shoot-craft-to-moon-at.mjs`

Loads Artemis II, seeks to a requested UTC instant, opens/selects the Craft to
Moon view, optionally applies an auxiliary-camera FoV override, and captures
the viewport plus the panel when it can be located.

```powershell
node scripts/moon-tune/shoot-craft-to-moon-at.mjs [label] [iso-utc]
```

Inputs:

- `label`: output basename; defaults to `craft-to-moon-shot`.
- `iso-utc`: target time; defaults to `2026-04-06T22:41:21Z`. An invalid value
  terminates with an error.
- `FOV_DEG`: optional positive numeric Craft-to-Moon panel FoV override.
- `MOON_TUNE_BASE_URL`: server base URL; defaults to
  `http://127.0.0.1:7275`.

Outputs:

- `tmp/moon-tune/shots/<label>-fullpage.png`;
- `tmp/moon-tune/shots/<label>-panel.png` when the Craft-to-Moon panel is
  found.

## Diagnostic Probes

### `probe.mjs`

Loads `moon-render-tuner.html` at the fixed default URL. It reports page,
network, animation-frame, and WebGL state; reads the framebuffer center pixel;
and exercises both canvas and page capture paths.

```powershell
node scripts/moon-tune/probe.mjs
```

Inputs: none. The URL is fixed at `http://127.0.0.1:7275`.

Outputs:

- diagnostic records on stdout;
- `tmp/moon-tune/shots/probe-canvas-toDataURL.png`;
- `tmp/moon-tune/shots/probe-fullpage.png`.

### `probe-mission.mjs`

Loads Artemis II at the fixed default URL and reports the live Moon material's
render settings, photometric-shader uniforms, texture presence, and directional
lights.

```powershell
node scripts/moon-tune/probe-mission.mjs
```

Inputs: none. The URL is fixed at
`http://127.0.0.1:7275/mission.html?mission=artemis2`.

Output: a JSON diagnostic record on stdout; no files are written.

### `probe-material.mjs`

Loads Artemis II, optionally attempts to seek to a UTC instant through legacy
scene methods, selects the Craft to Moon view, and reports Moon material
settings, shader uniforms, active texture dimensions, generated-normal-map
state, and scene time.

```powershell
node scripts/moon-tune/probe-material.mjs [iso-utc]
```

Inputs:

- `iso-utc`: target time; defaults to `2026-04-06T22:41:21Z`. Invalid values
  skip the seek attempt. On the current runtime, the attempted scene methods
  may be absent; use the reported `sceneTime` to determine whether the target
  was applied.
- `MOON_TUNE_BASE_URL`: server base URL; defaults to
  `http://127.0.0.1:7275`.

Output: a JSON diagnostic record on stdout; no files are written.

### `probe-craft-to-moon-time.mjs`

Loads Artemis II and probes a fixed target instant
(`2026-04-06T22:41:21Z`). It reports scene time, ephemeris ranges, body
availability, attempted legacy seek-method names, and Craft-to-Moon panel
discovery before capturing the scene. An `ok` record for an optional call means
the attempt did not throw; it does not prove that the method existed or moved
the timeline.

```powershell
node scripts/moon-tune/probe-craft-to-moon-time.mjs
```

Inputs: no command-line inputs. `MOON_TUNE_BASE_URL` overrides the server base
URL; the target time is fixed in the script.

Outputs:

- diagnostic records on stdout;
- `tmp/moon-tune/shots/probe-craft-to-moon-fullpage.png`;
- `tmp/moon-tune/shots/probe-craft-to-moon-panel.png` when the panel is found.

### `probe-composer-lighting.mjs`

Loads Artemis II at the fixed default URL, attempts to open Frame & Shoot using
the legacy `#focus-pill-flyby` selector, and reports the Moon-centered Sun
direction, Moon orientation, projected Hertzsprung-region direction, and
resulting lighting dot product. The current runtime no longer exposes that
selector, so the probe may remain on the existing panel state.

```powershell
node scripts/moon-tune/probe-composer-lighting.mjs
```

Inputs:

- `PROBE_TIME_MS`: optional mission time in Unix milliseconds. The script uses
  legacy optional scene methods, so verify the reported time before treating
  the result as time-specific.
- The URL is fixed at
  `http://127.0.0.1:7275/mission.html?mission=artemis2`.

Output: a JSON diagnostic record on stdout; no files are written.

## Experiment Notes

- These are exploratory tools, not automated acceptance tests. Several scripts
  use best-effort selectors or try multiple runtime seek APIs and may continue
  when an optional control is unavailable.
- `mission-shot.mjs` still searches a legacy auxiliary-panel selector list.
  Current panel markup may therefore produce only the main viewport capture.
- GPU-backed WebGL capture can be fragile under software rendering. The tools
  request real Chrome with GPU and WebGL enabled because SwiftShader captures
  may be black.
- `shoot.mjs` intentionally uses low-Sun, oblique-limb framing, where terrain
  self-shadow behavior is easiest to inspect. High-Sun and full-disc views rely
  more heavily on normal-map shading.
