# Runtime Animation Benchmarking

This repo now includes a browser-runtime benchmark for animation smoothness:

- Script: `scripts/bench-runtime-animation.js`
- npm alias: `npm run bench:runtime-animation -- ...`

The goal is to measure animation quality scientifically, not just eyeball it.

## What to measure

For runtime animation work, a single FPS number is not enough.

Use these metrics together:

- Frame-time distribution from `requestAnimationFrame`
  - mean / median / p95 / p99 / max
  - standard deviation and coefficient of variation
  - counts above budget thresholds such as `16.7ms`, `33.3ms`, and `50ms`
  - counts above relative thresholds such as `1.5x` and `2x` the median frame time
- Long Tasks
  - count
  - total duration
  - p95 / p99 / max
- Long Animation Frames (LoAF)
  - count
  - total duration
  - blocking duration
  - top LoAF entries
  - top script contributors when attribution is available

These together answer different questions:

- `FPS` tells us throughput.
- `Frame-time spread` tells us jitter.
- `Long Tasks` tell us when the main thread is blocked.
- `LoAF` tells us when a whole render/update cycle is slow, even if no single task looks dramatic.

## Measurement rules

Keep the benchmark controlled:

- Use the same mission, origin, dimension, viewport, warmup, and duration for all variants.
- Change one variable at a time.
- Run multiple rounds, not just one.
- Prefer headed Chromium on the local machine for meaningful numbers.
- Treat headless runs as relative checks only.

## Recommended workflow

1. Start Vite on the URL used by the benchmark, for example:

   ```powershell
   .\node_modules\.bin\vite.cmd --port 7275 --strictPort --host 127.0.0.1
   ```

2. Pick one scenario.
3. Run a baseline with repeated rounds.
4. Run one variant at a time.
5. Treat optional-selector variants (`view-*`, orbit style, camera, and plane)
   as exploratory only until selector enforcement is fixed. The script can
   silently miss those controls and still label the run as requested.
6. Compare:
   - mean / p95 / p99 frame time
   - over-budget frame ratios
   - LoAF count and blocking duration
   - whether playback actually advanced during every round

## Example commands

Baseline:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --label baseline
```

Aux panels off:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --view-aux-panels false --label aux-off
```

Aux panels on:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --view-aux-panels true --label aux-on
```

Sky off:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --view-sky false --label sky-off
```

Orbit hidden:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --view-orbit false --label orbit-off
```

Classic orbit style:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --orbit-style classic --label classic
```

Moon origin:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin moon --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --label moon
```

XY plane lock:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --plane XY --label plane-xy
```

Spacecraft/Earth camera pair:

```bash
npm run bench:runtime-animation -- --mission artemis2 --origin earth --dimension 3d --base-url http://127.0.0.1:7275 --rounds 5 --warmup-ms 2000 --duration-ms 10000 --headless false --camera-position spacecraft --camera-look earth --label camera-spacecraft-earth
```

## Output notes

The benchmark emits JSON with:

- per-round summaries
- pooled overall summaries
- frame-time thresholds
- long-task summaries
- long-animation-frame summaries
- top LoAFs
- top LoAF-attributed scripts
- a playback-advance check

The playback-advance check matters because a perfectly smooth but non-advancing scene is not a useful animation result.

Long Task and Long Animation Frame metrics are browser-dependent. Check the
output `support` object; unsupported metrics are `null` and cannot be compared.

Redirect stdout to a dated JSON file when retaining a run, for example:

```powershell
npm run bench:runtime-animation -- --mission artemis2 --base-url http://127.0.0.1:7275 --label baseline | Set-Content -Encoding utf8 runtime-animation-baseline.json
```

Accepted values:

- origin: `earth`, `moon`/`lunar`, `relative`;
- dimension: `2d`/`2`, `3d`;
- orbit style: `classic`, `trail`;
- camera position/look: `manual`, `earth`, `moon`, `spacecraft`;
- plane: `DEFAULT`, `XY`, `YZ`, `ZX`, `XY-`, `YZ-`, `ZX-`.

Invalid origin/dimension values currently normalize to Earth/3D. Invalid style,
camera, and plane values are ignored. Do not use affected variant output as
authoritative evidence. Selector validation and provenance hardening are
tracked in [Performance](../../plans/breakdown/performance.md).

## Follow-up diagnosis

If a variant regresses:

- record a Chrome DevTools Performance trace on the same scenario
- inspect the Main thread, Frames track, and rendering work
- look for:
  - repeated layout/style work
  - heavy per-frame JS
  - texture/material churn
  - auxiliary view rendering overhead
  - orbit-trail geometry updates

Use the runtime benchmark to detect and compare. Use DevTools traces to explain why.
