# Native Studio Test Harness

Use `studio-test-harness.html` for native Dashboard Studio extension bundles. Keep the existing `test-harness.html` for legacy AMD bundles.

## Contents

- [Why the harnesses are separate](#why-the-harnesses-are-separate)
- [Repository files](#repository-files)
- [Manifest](#manifest)
- [Per-visualization fixture](#per-visualization-fixture)
- [Interactive data controls](#interactive-data-controls)
- [Host behavior](#host-behavior)
- [Required checks](#required-checks)

## Why the harnesses are separate

The legacy harness mocks RequireJS modules, `SplunkVisualizationBase`, row-major data, formatter namespaces, and legacy lifecycle calls. A native Studio extension is an ES module that runs inside a sandboxed iframe and imports `@splunk/dashboard-studio-extension`, which delegates to an injected `globalThis.DashboardExtensionAPI`.

Loading one framework in the other harness can produce false successes because the lifecycle, data orientation, options, theme, errors, and drilldowns are different. Share fixture values where useful, but do not share the host adapter.

## Repository files

```text
studio-test-harness.html
studio-harness.css
studio-harness-manifest.json
splunk-logo.png
studio-examples/
  <project>/
    dist/<viz-name>/visualization.js
    visualizations/<viz-name>/
      config.json
      harness.json
```

The project directory can have a different name from the visualization. Declare both in the manifest.

## Manifest

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

Paths are relative to `studio-test-harness.html`. The harness loads the built bundle, not source files. Run the project build before testing.

## Per-visualization fixture

```json
{
  "dataSources": {
    "primary": {
      "data": {
        "fields": [
          { "name": "host" },
          { "name": "count" }
        ],
        "columns": [
          ["web-01", "web-02"],
          ["42", "17"]
        ]
      }
    }
  },
  "tokens": {
    "environment": "production"
  }
}
```

Keep result values as strings to match Splunk search results. Prefer columnar fixtures. Include `rows` only when explicitly testing normalization compatibility.

Option defaults and interactive controls come from `config.json` `optionsSchema` and `editorConfig`. The harness renders text, number, checkbox, select, and color controls that update the extension immediately. It also keeps an advanced JSON editor for source-editor edge cases. Do not duplicate option definitions or defaults in `harness.json`.

The primary data source is presented as an editable table, with row add/remove and CSV/TSV paste controls. The advanced JSON editor remains available for multiple data sources, malformed payloads, row-oriented data, and other cases that cannot be represented by the table.

## Interactive data controls

Add optional `dataControls` to `harness.json` for frequently changed search values. Values come from `dataSources`; do not duplicate them as control defaults.

```json
{
  "dataControls": [
    {
      "field": "speed",
      "row": "last",
      "label": "Speed",
      "type": "slider",
      "min": 0,
      "max": 380,
      "step": 1
    },
    {
      "field": "weather",
      "row": 0,
      "label": "Weather",
      "type": "select",
      "options": [
        { "value": "0", "label": "Clear" },
        { "value": "3", "label": "Rain" }
      ]
    }
  ]
}
```

Each control supports:

- `field` — required result field; `name` is accepted as an alias
- `source` — data-source name, default `primary`
- `row` — zero-based index, `first`, `last`, or `all`; default `last`
- `type` — `slider`, `range`, `select`, `number`, or `text`
- `min`, `max`, and `step` — numeric input attributes
- `options` — primitive values or `{ "value", "label" }` objects for selects
- `transform: "divide100"` — expose `-100..100` while sending `-1..1`
- `default` — fallback only when the fixture lacks the field or row

Controls write string values into the columnar fixture, matching Splunk search results, and redraw immediately. Use `row: "all"` only when intentionally overriding a field across every result row. Keep visualization options out of `harness.json`; generate those controls from `config.json`.

## Host behavior

The harness creates a fresh sandboxed iframe on each reload, injects `DashboardExtensionAPI` before loading the real ES module, and implements:

- data source, options, dimensions, mode, theme, tokens, and error getters/listeners
- `{ invokeImmediately: true }`
- listener cleanup functions and abort signals
- `setOptions` event reporting
- DOM-node and programmatic drilldown reporting
- error overlay reporting

It sends state changes into the iframe through `postMessage`, reflecting the asynchronous nature of Studio startup. It does not emulate Dashboard Studio's private implementation or DOM.

The outer developer UI should provide the same high-value interactions as the legacy harness where the framework allows them:

- Splunk branding, color strata, task-oriented sidebar sections, preview scope chrome, and status telemetry
- schema-driven option controls with immediate redraws
- an editable data grid and CSV/TSV paste
- loading and no-data toggles
- exact dimensions, fit-to-stage, theme, and view/edit mode controls
- reset and iframe reload actions
- raw state editors and an event/drilldown log for advanced debugging

Use one visible control for each state. In particular, keep the global light/dark theme as a single sun/moon icon in the top-right toolbar; do not duplicate it with a sidebar select. A light-mode-only contrast icon may change the stage backdrop without changing the theme reported to the extension. Keep advanced JSON and event diagnostics collapsed until requested so routine slider, option, and data work remains prominent.

Keep these controls as an outer host around the sandboxed iframe. Do not move the extension into the parent document to simplify the UI.

## Required checks

Test at minimum:

1. Initial loading state, then populated data.
2. Empty `columns` and missing `primary` data.
3. Malformed or missing required fields.
4. Every editor option, including unexpected source-editor values.
5. Light and dark themes.
6. View and edit modes.
7. At least two sizes and device pixel ratios 1 and 2 when available.
8. Drilldown payloads and error recovery.
9. Repeated reloads without duplicate callbacks, timers, or animation loops.

Always finish with a smoke test of the packaged `.spl` in Splunk 10.4. The harness cannot validate the real editor panel, packaging registration, iframe restrictions, permissions, or Dashboard Studio interaction configuration.
