# Quickstart: Build Your First Custom Visualization

This guide walks you through creating a custom Splunk visualization from scratch and testing it in the browser, all in under 10 minutes.

## Prerequisites

- [Node.js](https://nodejs.org/) v16 or later
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- A local clone of this repository

## Step 1: Scaffold the Visualization

From the repository root, run Claude Code:

```bash
claude
```

Then use the splunk-viz skill:

```text
/splunk-viz Create a horizontal bar chart visualization called "horizontal_bar"
that shows category names on the left and colored bars on the right.
Expected columns: category, value.
Settings: bar color (default #58a6ff), show values (true/false), max value (auto/fixed).
```

Claude Code generates the full app structure under `examples/horizontal_bar/`:

```text
examples/horizontal_bar/
  default/
    app.conf
    visualizations.conf
    savedsearches.conf
    savedsearches.conf.spec
  metadata/
    default.meta
  appserver/static/visualizations/horizontal_bar/
    src/visualization_source.js
    formatter.html
    visualization.css
    harness.json
    package.json
    webpack.config.js
```

## Step 2: Build It

```bash
./build.sh horizontal_bar
```

This installs dependencies, runs webpack, and creates
`dist/horizontal_bar-1.0.0.tar.gz` ready for Splunk.

## Step 3: Test in the Browser

Add your new viz to the harness manifest:

```json
{
  "pathTemplate": "examples/{name}/appserver/static/visualizations/{name}",
  "vizs": [
    "custom_single_value",
    "component_status_board",
    "gauge",
    "horizontal_bar"
  ]
}
```

Serve the repo locally (any static server works):

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/test-harness.html` and select your visualization
from the dropdown. The harness reads `harness.json` and builds the sidebar
controls automatically. Change values and settings to see real-time updates.

## Step 4: Install in Splunk

```bash
$SPLUNK_HOME/bin/splunk install app dist/horizontal_bar-1.0.0.tar.gz
$SPLUNK_HOME/bin/splunk restart
```

Or for faster iteration during development, copy the app directly:

```bash
cp -r examples/horizontal_bar $SPLUNK_HOME/etc/apps/
```

Then use `/_bump` in the Splunk URL to reload static assets without a full
restart.

## Step 5: Use in a Dashboard

In Dashboard Studio, add a visualization panel and select your custom viz.
Run a search that produces the expected columns:

```spl
| makeresults
| eval category="Downloads", value=1250
| append [| makeresults | eval category="Signups", value=830]
| append [| makeresults | eval category="Pageviews", value=4200]
| fields category, value
```

## Key Files to Understand

| File | Purpose |
| --- | --- |
| `visualization_source.js` | Canvas 2D rendering logic (ES5 only) |
| `formatter.html` | Settings UI shown in the Splunk dashboard editor |
| `savedsearches.conf.spec` | Declares every setting with defaults |
| `harness.json` | Describes data shape and controls for the test harness |
| `visualization.css` | Styles for the viz container (keep background transparent) |

## Development Tips

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

## What Next?

- Read [TEST-HARNESS.md](TEST-HARNESS.md) for the full harness documentation
  including `harness.json` schema and data modes
- Read [EMBEDDING.md](EMBEDDING.md) to learn how to embed a visualization
  into an existing Splunk app
- Read [CONTRIBUTING.md](CONTRIBUTING.md) for the project rules and how to
  submit changes
- Browse the existing examples in `examples/` to see patterns for different
  visualization types
