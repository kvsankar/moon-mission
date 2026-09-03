# Sky Render Demo

This repo now includes a standalone sky rendering demo page at:

- `/sky-render-demo.html`

Start Vite first:

```powershell
.\node_modules\.bin\vite.cmd --port 7275 --strictPort --host 127.0.0.1
```

Then open `http://127.0.0.1:7275/sky-render-demo.html`. Do not open the HTML
directly from disk; its modules and assets require an HTTP server.

It is intended as a sandbox for iterative development of the physically plausible sky pipeline (`SkyController`) without impacting mission runtime wiring.

## What It Demonstrates

- Atmosphere ON/OFF switching
- Time-of-day slider for sky rotation
- Observer latitude and longitude placeholders; values are stored but do not
  currently alter rendering
- Star size, twinkle, bloom-strength, and atmosphere controls
- Extinction control in the main `SkyController`; the fallback does not apply
  extinction or observer location
- Clear visual distinction between ground-based and space-view modes

## Implementation Notes

- Script: `src/platform/js/sky-render-demo.js`
- Styles: `src/platform/css/sky-render-demo.css`
- `SkyController.js` is loaded dynamically. Import or runtime failure activates
  a deterministic fallback that supports star size, twinkle, bloom, and
  atmosphere only.
