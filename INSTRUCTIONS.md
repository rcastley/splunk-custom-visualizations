# Getting Started

This guide walks you through setting up your environment, building the example visualization, and creating your own custom vizs using the Claude Code skill.

## Prerequisites

| Tool | Version | Purpose |
| ------ | --------- | --------- |
| [Splunk Enterprise](https://www.splunk.com/en_us/download.html) | 10.2+ | Hosts the custom visualizations |
| [Node.js](https://nodejs.org/) | 18+ | Runs webpack to bundle the visualization JS |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Latest | AI assistant with the splunk-viz skill |

## 1. Clone the Repo

```bash
git clone https://github.com/your-org/splunk-custom-visualizations.git
cd splunk-custom-visualizations
```

## 2. Build the Example

Build the included `custom_single_value` visualization to verify your setup:

```bash
./build.sh custom_single_value
```

This will:

1. Install npm dependencies (webpack)
2. Bundle `visualization_source.js` into `visualization.js`
3. Package everything into `dist/custom_single_value-1.0.0.tar.gz`

## 3. Test in the Browser

You can iterate on your visualization without deploying to Splunk using the test harness. Add your new viz to `harness-manifest.json`:

```json
{
  "pathTemplate": "examples/{name}/appserver/static/visualizations/{name}",
  "vizs": [
    "custom_single_value",
    "component_status_board",
    "gauge",
    "your_new_viz"
  ]
}
```

Serve the repo locally (any static server works):

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/test-harness.html` and select your visualization from the dropdown. The harness reads `harness.json` and builds the sidebar controls automatically. Change values and settings to see real-time updates. Use the theme toggle to verify your viz looks correct in both light and dark mode.

See [TEST-HARNESS.md](TEST-HARNESS.md) for full harness documentation including `harness.json` schema and data modes.

## 4. Install in Splunk

**Option A — Install the tarball:**

```bash
$SPLUNK_HOME/bin/splunk install app dist/custom_single_value-1.0.0.tar.gz
$SPLUNK_HOME/bin/splunk restart
```

**Option B — Symlink for development** (changes reflect immediately after `/_bump`):

```bash
ln -s $(pwd)/examples/custom_single_value $SPLUNK_HOME/etc/apps/custom_single_value
$SPLUNK_HOME/bin/splunk restart
```

## 5. Use in a Dashboard

1. Open any Splunk dashboard in edit mode
2. Add a new panel with a search (e.g., `| makeresults | eval value="Hello"`)
3. Click the visualization picker and select **Custom Single Value**
4. Use the **Format** panel to configure colours, alignment, and labels

## 6. Create Your Own Visualization

This is where the Claude Code skill shines. Open the repo in your editor with Claude Code enabled and describe what you want:

```text
Using /splunk-viz, create a custom visualization called "status_board" that
shows a grid of coloured tiles. Each row should have a name, status (ok/warning/critical),
and a detail string. Colour the tile based on status.
```

Claude will generate the complete app in `examples/status_board/` with all the scaffolding, rendering code, and configuration files.

### What the Skill Generates

| File | Purpose |
| ------ | --------- |
| `default/app.conf` | App identity and version |
| `default/visualizations.conf` | Registers the viz with Splunk |
| `default/savedsearches.conf` | Example saved search with all settings |
| `README/savedsearches.conf.spec` | Documents every custom setting for `btool check` |
| `metadata/default.meta` | Exports the viz to all apps |
| `formatter.html` | Settings UI in the dashboard Format panel |
| `src/visualization_source.js` | Canvas 2D rendering code |
| `visualization.css` | Required by Splunk (transparent background) |
| `webpack.config.js` | Bundles source into AMD module |
| `package.json` | npm scripts for build/dev |
| `README.md` | Documentation, SPL reference, configuration |

### Iterate on the Design

After the initial generation, keep refining:

```text
The tiles are too close together — add 8px gap between them.
Make the status text bold and add a subtle glow for critical items.
Add a "columns" setting so users can choose 2, 3, or 4 columns.
```

Each change updates the source files in place. Rebuild with:

```bash
./build.sh status_board
```

## 7. Scaffold a Dashboard Studio App

If you're building a Splunk app that bundles dashboards and multiple custom visualizations together, you can scaffold the entire app structure:

```text
Using /splunk-viz, scaffold a Splunk Dashboard Studio app called "my_monitoring_app"
with custom visualization support.
```

This generates a complete app with a `vizs/` build pipeline — see [EMBEDDING.md](EMBEDDING.md) for the full details. Individual vizs are then created under `vizs/` using the normal `/splunk-viz` workflow and merged into the app automatically by the build script.

## 8. Development Workflow

### Fast Iteration (no restart needed)

When developing, symlink your app and use `/_bump` to reload static assets without restarting Splunk:

1. Make changes to `visualization_source.js`
2. Run `npm run build` in the viz directory (or `npm run dev` for auto-rebuild on save)
3. Navigate to `http://<splunk>:8000/en-US/_bump` and click "Bump version"
4. Hard-refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)

A restart is only needed when changing config files (`app.conf`, `visualizations.conf`, `savedsearches.conf`).

### Validate Configuration

After installing, check for config issues:

```bash
$SPLUNK_HOME/bin/splunk btool check
```

If you see "Invalid key" errors, ensure every `display.visualizations.custom.*` setting used in `savedsearches.conf` is also listed in `README/savedsearches.conf.spec`.

## 9. Custom Fonts

To use a custom font in your visualization:

1. Convert your font to base64:

   ```bash
   base64 -i MyFont.woff2 | tr -d '\n' > font_base64.txt
   ```

2. Create a shared font CSS file (e.g., `shared/fonts.css`):

   ```css
   @font-face {
       font-family: 'MyFont';
       src: url(data:font/woff2;base64,PASTE_BASE64_HERE) format('woff2');
       font-weight: bold;
       font-style: normal;
       font-display: swap;
   }
   ```

3. Uncomment the `FONT_CSS` line in `build.sh` and point it to your font file:

   ```bash
   FONT_CSS="$SCRIPT_DIR/shared/fonts.css"
   ```

4. The build script will automatically prepend the font CSS to each viz's `visualization.css` during packaging, keeping the source files clean.

5. In your `visualization_source.js`, wait for the font to load before drawing:

   ```javascript
   var fontFamily = "'MyFont', sans-serif";
   // See the skill documentation for the full font-loading pattern
   ```

## 10. Development Tips

- **ES5 only** in `visualization_source.js`. Use `var`, `function`, and `for`
  loops. No `const`, `let`, arrow functions, or template literals.
- **JS defaults must match formatter defaults.** Splunk does not send formatter
  values on the first render, so your JS must fall back to the same defaults
  declared in `formatter.html`.
- **Read config in `updateView`, not `formatData`.** The `formatData` method
  should only parse the data structure. All config reading belongs in
  `updateView`.
- **Handle HiDPI.** Scale your canvas by `window.devicePixelRatio` and draw in
  CSS pixel coordinates after `ctx.scale(dpr, dpr)`.
- **Test both themes.** Use the harness theme toggle to verify your viz looks
  correct in light and dark mode.

## 11. Directory Structure Reference

```text
splunk-custom-visualizations/
  .claude/
    skills/
      splunk-viz/
        SKILL.md              The Claude Code skill definition
  examples/
    custom_single_value/             Example viz (ready to install)
      README.md
      default/
        app.conf
        visualizations.conf
        savedsearches.conf
      metadata/
        default.meta
      README/
        savedsearches.conf.spec
      appserver/
        static/
          visualizations/
            custom_single_value/
              src/
                visualization_source.js
              formatter.html
              visualization.css
              webpack.config.js
              package.json
    your_new_viz/             Your vizs go here
      ...
  build.sh                    Build and package script
  dist/                       Built tarballs (gitignored)
  INSTRUCTIONS.md             This file
  README.md                   Project overview
```

## What Next?

- Read [TEST-HARNESS.md](TEST-HARNESS.md) for the full harness documentation
  including `harness.json` schema and data modes
- Read [EMBEDDING.md](EMBEDDING.md) to learn how to embed visualizations
  into an existing Splunk app (manual or automated build pipeline)
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for the project rules and how to
  submit changes
- Browse the existing examples in `examples/` to see patterns for different
  visualization types

## Troubleshooting

| Issue | Fix |
| ------- | ----- |
| Viz doesn't appear in picker | Restart Splunk. Check `visualizations.conf` stanza name matches the directory name. |
| "Invalid key" in `btool check` | Add the missing setting to `README/savedsearches.conf.spec` |
| Canvas is blank | Check browser console for JS errors. Verify `visualization.js` was built (`npm run build`). |
| Viz doesn't update with new data | Use `/_bump` then hard-refresh. Check `formatData` returns a new object (not the raw `data`). |
| Font not rendering | Ensure `@font-face` is in `visualization.css` (not just the source). Check the font-loading guard in `updateView`. |
| Text overflows panel | Use `fitText()` to auto-scale. Check `ctx.measureText()` logic. |
