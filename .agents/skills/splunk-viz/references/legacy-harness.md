# Legacy Interactive Test Harness

Use this reference whenever creating or changing legacy harness coverage.

## Contents

- [Registration](#registration)
- [Fixture](#fixture)
- [Controls](#controls)
- [Data modes](#data-modes)
- [Required checks](#required-checks)

## Registration

Create `harness.json` beside `formatter.html` and register the visualization in the repository's `harness-manifest.json`. Preserve an existing repository's path layout; in this repository, the manifest normally points at `examples/{name}/appserver/static/visualizations/{name}`.

```json
{
  "fontCSS": "shared/fonts.css",
  "pathTemplate": "examples/{name}/appserver/static/visualizations/{name}",
  "categories": {
    "General": ["gauge"]
  },
  "vizs": ["gauge"]
}
```

The generic harness must discover visualizations from the manifest. Do not add visualization-specific branches to the harness runtime.

## Fixture

```json
{
  "label": "My Visualization",
  "defaultSize": { "width": 600, "height": 400 },
  "noDataMessage": "Awaiting data",
  "fields": [
    { "name": "value", "label": "Value", "type": "slider", "min": 0, "max": 100, "step": 1, "default": 75 },
    { "name": "mode", "label": "Mode", "type": "select", "options": [{ "v": "0", "l": "Off" }, { "v": "1", "l": "On" }], "default": "1" }
  ],
  "formatter": [
    { "name": "maxValue", "label": "Maximum", "type": "text", "default": "100" },
    { "name": "showLabel", "label": "Show label", "type": "radio", "options": ["true", "false"], "default": "true" },
    { "name": "accentColor", "label": "Accent", "type": "color", "default": "#ff8700" }
  ],
  "data": {
    "mode": "single_row",
    "columns": ["value", "mode"],
    "dynamicColumnName": { "column": "value", "configKey": "field" }
  }
}
```

Optional top-level keys include `dependencies`, containing JSON files loaded from the visualization directory.

## Controls

Data field controls:

| Type | Required properties | Behavior |
| --- | --- | --- |
| `slider` | `min`, `max`, `step`, `default` | Range input with live value |
| `select` | `options`, `default` | String options or `{v,l}` objects |
| `text` | `default` | Free-text input |

Use `_`-prefixed fields for harness-only controls such as `_rowCount`. A field may define `transform: "divide100"` when the fixture needs normalized input.

Formatter controls support `radio`, `select`, `color`, and `text`. Names and defaults must match `formatter.html` and runtime configuration exactly.

## Data modes

For `single_row`, every listed column needs a matching field control with a default:

```json
{
  "mode": "single_row",
  "columns": ["speed", "gear"],
  "dynamicColumnName": { "column": "speed", "configKey": "field" }
}
```

For `multi_row`, keep every sample value a string, as Splunk supplies search values as strings:

```json
{
  "mode": "multi_row",
  "columns": ["position", "driver", "delta"],
  "rowCountField": "_rowCount",
  "sampleRows": [
    ["1", "A. Driver", "0"],
    ["2", "B. Driver", "0.520"]
  ]
}
```

Use `relativeTimeColumn` when sample values represent offsets that the harness should convert to current Unix timestamps. A non-control field matching a column may override that column across sample rows.

## Required checks

- Load the valid default fixture.
- Move every slider through its minimum, midpoint, and maximum.
- Exercise selects, text, booleans, and colors.
- Test loading, empty, malformed, and recovered data.
- Resize the panel to small and large dimensions.
- Test formatter defaults against JavaScript fallbacks.
- Verify dependencies and custom fonts load from the same paths the bundle expects.
- Verify interactive hit regions after resize and HiDPI scaling.
