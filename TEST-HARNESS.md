# Test Harness — Local Browser Testing

Test and iterate on Splunk custom visualizations in your browser without deploying to Splunk. The test harness is a single HTML file that mocks the Splunk Visualization API and renders any viz with interactive controls.

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
