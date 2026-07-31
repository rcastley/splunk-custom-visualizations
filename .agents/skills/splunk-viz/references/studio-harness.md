# Native Studio Test Harness

Use `studio-test-harness.html` for native Dashboard Studio extension bundles. Keep the existing `test-harness.html` for legacy AMD bundles.

## Why the harnesses are separate

The legacy harness mocks RequireJS modules, `SplunkVisualizationBase`, row-major data, formatter namespaces, and legacy lifecycle calls. A native Studio extension is an ES module that runs inside a sandboxed iframe and imports `@splunk/dashboard-studio-extension`, which delegates to an injected `globalThis.DashboardExtensionAPI`.

Loading one framework in the other harness can produce false successes because the lifecycle, data orientation, options, theme, errors, and drilldowns are different. Share fixture values where useful, but do not share the host adapter.

## Repository files

```text
studio-test-harness.html
studio-harness-manifest.json
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

Option defaults and interactive controls come from `config.json` `optionsSchema` and `editorConfig`. The harness renders text, number, checkbox, and color controls that update the extension immediately. It also keeps an advanced JSON editor for source-editor edge cases. Do not duplicate option definitions or defaults in `harness.json`.

The primary data source is presented as an editable table, with row add/remove and CSV/TSV paste controls. The advanced JSON editor remains available for multiple data sources, malformed payloads, row-oriented data, and other cases that cannot be represented by the table.

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

- schema-driven option controls with immediate redraws
- an editable data grid and CSV/TSV paste
- loading and no-data toggles
- exact dimensions, fit-to-stage, theme, and view/edit mode controls
- reset and iframe reload actions
- raw state editors and an event/drilldown log for advanced debugging

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
