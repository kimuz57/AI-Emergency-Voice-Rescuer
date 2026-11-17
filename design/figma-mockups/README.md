# Figma mockups (HTML)

Static mockups of every screen of the web app, built from the real frontend
code (texts, layout, Tabler-style tokens from `frontend/app/globals.css`) with
sample data. They exist so the screens can be brought into Figma without the
Figma MCP server: a View seat only gets 20 MCP calls per month.

The Figma file "Smart Voice – Emergency Voice Detection UI" already holds the
design system (colour variables, shadows, icons, components) and the Dashboard
screen. Import these pages into the **Screens** page of that file.

## Run

```bash
node design/figma-mockups/serve.mjs
```

Open http://localhost:5500/ (it redirects to `/design/figma-mockups/`) — the
index links every screen. The server serves
the repo root so the pages can load `frontend/public/bg-elderly-light.jpg`.

## Import into Figma

1. Install the **html.to.design** Chrome extension and the html.to.design Figma
   plugin (same account).
2. Open a screen from the index in Chrome. Set the window to at least 1440 px
   wide (mobile pages are 390 px; use device mode for those).
3. Click the extension → *Capture* (whole page). It downloads a `.h2d` file.
4. In Figma, open the plugin → *Import* → choose the `.h2d` file. Each capture
   becomes one frame. Rename it after the page title and move it into the
   matching section (Auth & Public / Caregiver / Admin).

Capture works on `localhost`, so nothing needs to be published. Modal states
are separate URLs (`?modal=edit`), so capture each one.

## Files

- `assets/style.css` — tokens and shared classes (light mode only)
- `assets/shell.js` — sidebar, footer, audio player and Lucide icons; it
  writes resolved colours into the SVGs so the importer does not turn
  `currentColor` black
- `screens/*.html` — one file per screen, 1440 × ≥1024 (alert pages 390 × 844)
- `index.html` — list of screens
- `serve.mjs` — tiny static server, no dependencies

Not part of the app build; nothing in `frontend/` imports these files.
