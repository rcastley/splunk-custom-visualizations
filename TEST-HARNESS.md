# Test Harness — Local Browser Testing

Test and iterate on Splunk custom visualizations in your browser without deploying to Splunk. The test harness is a single HTML file that mocks the Splunk Visualization API and renders any viz with interactive controls.

> This document primarily describes the legacy `SplunkVisualizationBase` harness in `test-harness.html`. Native Dashboard Studio extension bundles use `studio-test-harness.html`; see [Native Dashboard Studio harness](#native-dashboard-studio-harness).

## Native Dashboard Studio Harness

The native framework requires a separate iframe harness because its bundles use ES modules, columnar data, typed options, and the injected `DashboardExtensionAPI` instead of RequireJS and `SplunkVisualizationBase`.

1. Build the native Studio project so `dist/<viz-name>/visualization.js` exists.
2. Add its bundle, `config.json`, and fixture paths to `studio-harness-manifest.json`.
3. Add `harness.json` beside the visualization's `config.json`; include `dataSources` and optional `tokens`.
4. Open [http://localhost:8080/studio-test-harness.html](http://localhost:8080/studio-test-harness.html).

The Studio harness builds its option controls from `config.json` `editorConfig` and `optionsSchema`, so text, number, checkbox, select, and color settings behave like ordinary controls and redraw immediately. Its primary data source has optional slider/select/text controls plus an editable grid with row/field controls and CSV/TSV paste. Loading, no-data, dimensions, fit, theme, view/edit mode, reset, and iframe reload are available without editing JSON.

Use **Advanced state** when you specifically need raw payload control—for example multiple data sources, row-oriented results, malformed values, or tokens. Drilldowns, `setOptions`, and extension errors remain visible in the event log.

Example manifest entry:

```json
{
  "visualizations": [
    {
      "id": "resource_gauge",
      "label": "Resource Gauge",
      "bundle": "studio-examples/resource_gauge/dist/resource_gauge/visualization.js",
      "config": "studio-examples/resource_gauge/visualizations/resource_gauge/config.json",
      "harness": "studio-examples/resource_gauge/visualizations/resource_gauge/harness.json"
    }
  ]
}
```

Example fixture:

```json
{
  "dataSources": {
    "primary": {
      "data": {
        "fields": [{ "name": "host" }, { "name": "count" }],
        "columns": [["web-01", "web-02"], ["42", "17"]]
      }
    }
  },
  "dataControls": [
    {
      "field": "count",
      "row": 0,
      "label": "web-01 count",
      "type": "slider",
      "min": 0,
      "max": 100,
      "step": 1
    }
  ],
  "tokens": {}
}
```

`dataControls` target the existing fixture rather than carrying separate defaults. A control accepts `field`, optional `source`, `row` (`first`, `last`, `all`, or an index), `type`, and the applicable `min`, `max`, `step`, or `options`. The `divide100` transform supports percentage-style sliders that must emit a `0..1` value. See the skill's `references/studio-harness.md` for the complete schema.

The Studio harness loads the real built bundle in a fresh iframe and injects the public API surface for data, options, dimensions, mode, theme, tokens, errors, and drilldowns. The interactive controls live outside that iframe, preserving the native framework's isolation model. It is a development aid, not a substitute for installing and smoke-testing the packaged `.spl` in Splunk 10.4.

## Quick Start

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080/test-harness.html](http://localhost:8080/test-harness.html).

1. Select a visualization from the dropdown
2. Adjust data fields using sliders, dropdowns, and text inputs
3. Tweak formatter settings — the canvas re-renders in real-time
4. Click **Test No Data** to verify the custom no-data message
5. Resize the panel to test responsive behaviour

## How It Works

The test harness contains **zero visualization-specific code**. Everything is driven by JSON configuration:

```text
harness-manifest.json          Registers all vizs, optional shared config
examples/
  my_viz/
    .../harness.json           Fields, formatter settings, sample data
    .../src/visualization_source.js    Loaded and executed via eval()
```

On startup, `test-harness.html` loads `harness-manifest.json`, fetches each viz's `harness.json`, and populates the viz picker. When you select a viz, it:

1. Loads dependencies (e.g., JSON data files) into an AMD module cache
2. Loads and evaluates `visualization_source.js` via `fetch()` + `eval()`
3. Instantiates the viz class with a mock `SplunkVisualizationBase`
4. Builds Splunk-format data from field values and calls `formatData` → `updateView`

## harness-manifest.json

The manifest registers all vizs and optional shared configuration:

```json
{
  "fontCSS": "shared/fonts.css",
  "pathTemplate": "examples/{name}/appserver/static/visualizations/{name}",
  "vizs": [
    "custom_single_value",
    "component_status_board"
  ]
}
```

| Key | Required | Description |
| --- | -------- | ----------- |
| `vizs` | Yes | Array of viz app names |
| `pathTemplate` | No | URL path pattern. `{name}` is replaced with the viz name. Defaults to `{name}/appserver/static/visualizations/{name}` |
| `fontCSS` | No | Path to shared font CSS file (loaded once) |

## harness.json

Each viz includes a `harness.json` alongside `formatter.html`:

```json
{
  "label": "My Visualization",
  "defaultSize": { "width": 600, "height": 400 },
  "noDataMessage": "Awaiting data",
  "dependencies": [],
  "fields": [...],
  "formatter": [...],
  "data": { "mode": "single_row", "columns": [...] }
}
```

### Fields

Data fields appear as interactive controls in the sidebar. Each field's value is injected into the Splunk-format data passed to the viz.

| Type | Properties | UI Control |
| ---- | ---------- | ---------- |
| `slider` | `min`, `max`, `step`, `default` | Range input with live value |
| `select` | `options`, `default` | Dropdown (options: strings or `{"v": "0", "l": "Off"}`) |
| `text` | `default` | Free text input |

**Special properties:**

- `transform: "divide100"` — divides value by 100 before inserting (e.g., steer -100..100 → -1.0..1.0)
- Fields starting with `_` (e.g., `_numRows`) are control fields — they affect data generation but aren't columns

### Formatter

Formatter settings mirror the viz's `formatter.html`. They map to `config[ns + 'settingName']` in the viz JS.

| Type | Properties | UI Control |
| ---- | ---------- | ---------- |
| `radio` | `options` (string[]), `default` | Toggle buttons |
| `select` | `options`, `default` | Dropdown |
| `color` | `default` | Colour picker + hex input |
| `text` | `default` | Free text input |

**Important:** Defaults must match the JS fallback values. Splunk doesn't send formatter defaults on first load — the JS `||` fallback is what actually runs.

### Data Modes

**`single_row`** — One row from field values. For gauges, single-value displays, and vizs that read `data.rows[data.rows.length - 1]`.

```json
{
  "mode": "single_row",
  "columns": ["speed", "gear"],
  "dynamicColumnName": { "column": "speed", "configKey": "field" }
}
```

- `columns`: Column names. Values come from matching fields.
- `dynamicColumnName`: Renames a column based on a formatter setting (for vizs with configurable field names).

**`multi_row`** — Pre-defined sample rows. For charts, tables, maps, grids.

```json
{
  "mode": "multi_row",
  "columns": ["name", "status", "errors"],
  "rowCountField": "_numRows",
  "sampleRows": [
    ["Server A", "ok", "0"],
    ["Server B", "critical", "5"]
  ]
}
```

- `sampleRows`: Array of row arrays. **All values must be strings** (Splunk always passes strings).
- `rowCountField`: Optional `_`-prefixed slider that controls how many rows to show.
- **Column overrides**: When a non-`_` field name matches a column name, its slider value replaces that column in every row.

### Dependencies

JSON data files the viz loads via `require()`:

```json
"dependencies": ["track_data.json"]
```

Files are fetched from the viz root directory and registered in the AMD module cache as `../track_data.json` and `./track_data.json`.

## Adding a New Viz

1. Create `harness.json` in your viz's directory (alongside `formatter.html`)
2. Add the viz name to the `vizs` array in `harness-manifest.json`

No changes to `test-harness.html` needed.

## Limitations

- **No Splunk search engine** — data is static or slider-driven, not from live SPL queries
- **No drilldown testing** — `this.drilldown()` is a no-op in the mock
- **Font loading** — Custom fonts work if `fontCSS` is set in the manifest and the CSS file exists
- **`eval()` loading** — The viz source is loaded via `eval()`, so browser DevTools may show it as `(eval)` in stack traces. Set breakpoints by searching for function names in the Sources panel.

## Troubleshooting

| Issue | Cause | Fix |
| ----- | ----- | --- |
| Viz picker shows 0 vizs | `harness-manifest.json` not found or wrong `pathTemplate` | Check the file exists and paths resolve correctly |
| "Failed to load viz class" | `visualization_source.js` has a syntax error | Check browser console for eval errors |
| Canvas is blank | `getBoundingClientRect()` returns zero | Ensure the panel has non-zero dimensions |
| Font not rendering | `fontCSS` path wrong or file missing | Verify the path in the manifest |
| Cached old version | Browser cached the harness.json | Hard refresh: Cmd+Shift+R / Ctrl+Shift+R |
