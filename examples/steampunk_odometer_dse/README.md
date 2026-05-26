# Steampunk Odometer (10.4+) — Splunk Custom Visualization

Same brass steampunk odometer as `examples/steampunk_odometer/`, rebuilt on
the Splunk 10.4+ **Dashboard Studio custom visualization framework**
(`@splunk/dashboard-studio-extension`).

## Why this exists

The legacy build (`legacy_visualization`) repaints visibly when a data
source refreshes on Splunk 10.4 Dashboard Studio. Splunk 10.4 introduced
a new iframe-based framework with an explicit `loading` signal — this
build subscribes to that signal and **keeps the previous frame on screen
during refreshes**, eliminating the repaint.

| | Legacy (`steampunk_odometer`) | 10.4+ (`steampunk_odometer_dse`) |
|---|---|---|
| Splunk version | 10.0+, 10.2, 10.4 | 10.4+ only |
| Dashboard types | Dashboard Studio + Simple XML | Dashboard Studio only |
| Framework | `SplunkVisualizationBase` (AMD) | `VisualizationAPI` (iframe) |
| `framework_type` | `legacy_visualization` | `studio_visualization` |
| Refresh behaviour | Repaints empty shell briefly | Holds last frame, no repaint |

Both apps can be installed side by side. They appear as two distinct
entries in the visualization picker.

## Build prerequisites

- Node.js 22+ and npm 10+

## Install dev dependencies and build

From this directory:

```bash
npm install
npm run build              # development build (with source maps)
npm run build:prod         # production build (minified, no maps)
npm run package            # builds a .spl file in dist/
```

The package step produces `dist/steampunk_odometer_dse-1.0.0-<git>.spl`.

## Install in Splunk

In Splunk 10.4+:

1. Apps → Manage Apps → Install app from file
2. Upload the generated `.spl` file
3. Restart if prompted

In Dashboard Studio:

1. Open or create a Dashboard Studio dashboard
2. From the visualization picker, choose **Steampunk Odometer (10.4+)** (Custom category)
3. Bind a search that returns `value` (number) and `label` (string)

## Required columns

| Column | Type   | Description                                         |
|--------|--------|-----------------------------------------------------|
| value  | number | The reading shown on the digit drums.               |
| label  | string | Text engraved on the brass below the drums.         |

Both column names are configurable in the editor panel under **Data**.
Negative values are clamped to `0` (odometers count up).

## Configuration

Identical to the legacy odometer:

| Section    | Setting        | Default |
|------------|----------------|---------|
| Data       | Value Field    | `value` |
| Data       | Label Field    | `label` |
| Data       | Whole Digits   | `6`     |
| Data       | Decimals       | `0`     |
| Data       | Unit           | _(empty)_ |
| Appearance | Show Rivets    | on      |
| Appearance | Show Wear      | on      |
| Appearance | Digit Spacing  | `50`    |
| Appearance | Smoothness     | `8`     |

See `examples/steampunk_odometer/README.md` for the carry-cascade
roll mechanics, cylinder-projection details, and visual design notes —
the rendering logic is identical between the two builds.

## Example search

```spl
| makeresults
| eval value=round(random() % 100000), label="DISTANCE"
```

For a real telemetry stream:

```spl
index=metrics sourcetype=fleet
| stats sum(distance_km) as value
| eval label="DISTANCE"
```

## Differences vs. the legacy build

- **Data shape**: the studio framework delivers data column-major
  (`{ fields, columns }`) instead of row-major (`data.rows`). The viz
  reads the last value/label from the columns directly.
- **No formatter.html / savedsearches.conf**: editor schema lives in
  `visualizations/steampunk_odometer_dse/config.json`. Default values
  are part of the schema and the app metadata is in
  `package/app/app.conf`.
- **No `updateView` / `formatData`**: state is driven by
  `addDataSourcesListener`, `addOptionsListener`, and
  `addDimensionsListener`. The viz holds last-known state in module
  scope and re-renders on any signal.
- **No `_lastGoodData` cache or canvas-reattach guard**: the iframe is
  reused across refreshes, so there is nothing to re-attach to. The
  `loading` flag is the single source of truth for "data is being
  refreshed".
- **Wear seed is derived from config only** — same as legacy v1.3.2 —
  so the panel pattern is stable from the first frame.

## Project layout

```
steampunk_odometer_dse/
├── package.json                            # node deps + build/package scripts
├── build.mjs                               # esbuild driver
├── package.mjs                             # .spl packager (auto-generates default/visualizations.conf etc.)
├── build-plugins/
│   └── css-and-size.mjs                    # esbuild plugin for CSS injection + asset inlining
├── package/
│   ├── app/app.conf                        # Splunk app identity (id, version, label, author)
│   └── metadata/default.meta               # [default] export = system
└── visualizations/
    └── steampunk_odometer_dse/
        ├── config.json                     # viz metadata + optionsSchema + editorConfig
        └── src/
            ├── visualization.js            # render code (uses VisualizationAPI)
            └── visualization.css           # transparent background, root sizing
```
