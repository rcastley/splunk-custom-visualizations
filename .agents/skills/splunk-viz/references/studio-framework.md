# Native Dashboard Studio Extension Framework

Use this reference only for `framework_type = studio_visualization`. Native Studio extensions require Splunk Enterprise or Splunk Cloud Platform 10.4+ and run in a sandboxed iframe.

Official sources, last verified 2026-07-31:

- [Dashboard extension API reference](https://help.splunk.com/en/splunk-enterprise/developing-views-and-apps-for-splunk-web/10.4/custom-visualizations-for-dashboard-studio/dashboard-extension-api-reference)
- [Dashboard extension CLI](https://help.splunk.com/en/splunk-enterprise/developing-views-and-apps-for-splunk-web/10.4/custom-visualizations-for-dashboard-studio/create-custom-visualizations-for-dashboard-studio-with-the-splunk-dashboard-extension-cli)
- [Project and app structure](https://help.splunk.com/en/splunk-enterprise/developing-views-and-apps-for-splunk-web/10.4/custom-visualizations-for-dashboard-studio/custom-visualization-project-and-app-structure)

The public packages were `@splunk/dashboard-studio-extension` 1.0.0 and `@splunk/create` 11.1.0 when verified. Check the current official CLI output before changing generated build or packaging files.

## Contents

- [Scaffold](#scaffold)
- [Project structure](#project-structure)
- [Runtime model](#runtime-model)
- [Configuration](#configuration)
- [Data handling](#data-handling)
- [Lifecycle and safety](#lifecycle-and-safety)
- [Build and package](#build-and-package)
- [Verification](#verification)
- [Legacy-to-Studio mapping](#legacy-to-studio-mapping)

## Scaffold

Require Node.js 22+ and npm 10+ or Yarn 1.22+. Start from the official generator instead of recreating its build and packaging scripts:

```bash
npx @splunk/create@latest --mode=dashboard-studio-extension
```

Choose JavaScript, TypeScript, React, or React + TypeScript. Prefer TypeScript for new work. Choose framework-agnostic TypeScript for Canvas-first visualizations unless React materially simplifies component state or UI composition.

Run the generator in an empty project directory. If modifying an existing generated project, preserve `build.mjs`, `package.mjs`, and `build-plugins/` unless the requested change requires altering them. These files are coupled to the current CLI and package format.

## Project structure

The CLI generates one project capable of packaging one or more visualizations:

```text
my_project/
  package.json
  build.mjs
  package.mjs
  build-plugins/
    css-and-size.mjs
  package/
    app/
      app.conf
  visualizations/
    my_viz/
      config.json
      harness.json              # local-only; add for this repository's Studio harness
      src/
        visualization.ts
        visualization.css
        assets/
  dist/                         # generated
  stage/                        # generated during packaging
```

Do not add `formatter.html`, `visualization_source.js`, a legacy webpack config, or `savedsearches.conf.spec` to this structure. Those belong to the legacy framework.

The packaged app contains:

```text
<app-id>/
  appserver/static/visualizations/<viz-name>/
    visualization.js
    config.json
  default/
    app.conf
    visualizations.conf
  metadata/
    default.meta
  app.manifest
```

The CLI packager generates `visualizations.conf` with `framework_type = studio_visualization`, generates metadata and `app.manifest`, stages the app, and emits `dist/<app-id>-<version>-<hash>.spl`.

## Runtime model

The iframe host injects `globalThis.DashboardExtensionAPI`. The `@splunk/dashboard-studio-extension` package exposes it as `VisualizationAPI`.

Subscribe to every state used by the renderer:

```javascript
import { VisualizationAPI } from '@splunk/dashboard-studio-extension';

const state = {
    dataSources: {},
    loading: false,
    options: {},
    width: 0,
    height: 0,
    theme: 'light',
    mode: 'view',
    tokens: {},
};

const cleanups = [
    VisualizationAPI.addDataSourcesListener((next) => {
        state.dataSources = next.dataSources;
        state.loading = next.loading;
        render();
    }, { invokeImmediately: true }),
    VisualizationAPI.addOptionsListener(({ options }) => {
        state.options = options;
        render();
    }, { invokeImmediately: true }),
    VisualizationAPI.addDimensionsListener(({ width, height }) => {
        state.width = width;
        state.height = height;
        render();
    }, { invokeImmediately: true }),
    VisualizationAPI.addThemeListener(({ theme }) => {
        state.theme = theme;
        render();
    }, { invokeImmediately: true }),
];
```

Listener methods return cleanup functions. Call them if the visualization creates a teardown path, during hot replacement, and in tests. Also cancel animation frames, timers, observers, and DOM listeners owned by the visualization.

Available state and actions:

| Concern | Listener/getter/action |
| --- | --- |
| Search data | `addDataSourcesListener`, `getDataSources` |
| Options | `addOptionsListener`, `getOptions`, `setOptions` |
| Size | `addDimensionsListener`, `getDimensions` |
| Dashboard mode | `addModeListener`, `getMode` |
| Theme | `addThemeListener`, `getTheme` |
| Tokens | `addTokensListener`, `getTokens` |
| Errors | `addErrorListener`, `getError`, `setError`, `clearError` |
| Drilldown | `addDrilldownListener`, `triggerDrilldown` |

Do not access the parent Dashboard Studio DOM, depend on parent CSS, or read state synchronously before the API provides it. Treat data, options, dimensions, mode, theme, and tokens as independently asynchronous.

## Configuration

Define visualization metadata, option defaults, validation, and editor layout in `visualizations/<viz-name>/config.json`:

```json
{
  "showTitleAndDescription": true,
  "includeInToolbar": true,
  "includeInVizSwitcher": true,
  "showDrilldown": false,
  "canSetTokens": [],
  "hasEventHandlers": false,
  "config": {
    "name": "Resource Gauge",
    "description": "Track utilisation against configurable thresholds",
    "category": "Custom",
    "icon": null,
    "dataContract": {
      "requiredDataSources": ["primary"],
      "optionalDataSources": []
    },
    "size": {
      "initialWidth": 400,
      "initialHeight": 300
    },
    "optionsSchema": {
      "valueField": { "type": "string", "default": "count" },
      "valueColor": { "type": "string", "default": "#4e9cf5" },
      "showLabel": { "type": "boolean", "default": true },
      "maximum": { "type": "number", "default": 100 }
    },
    "editorConfig": [
      {
        "label": "Data and appearance",
        "layout": [
          [
            { "editor": "editor.text", "label": "Value field", "option": "valueField" }
          ],
          [
            { "editor": "editor.color", "label": "Value color", "option": "valueColor" },
            { "editor": "editor.checkbox", "label": "Show label", "option": "showLabel" }
          ],
          [
            { "editor": "editor.number", "label": "Maximum", "option": "maximum" }
          ]
        ]
      }
    ]
  }
}
```

Keep every option synchronized across `optionsSchema`, `editorConfig`, code fallbacks, documentation, and `harness.json`. Unlike legacy formatter values, Studio options retain JSON types; still validate user-supplied and source-editor values before use.

Set `showDrilldown` and `hasEventHandlers` consistently with implemented interactions. List only authorized token names in `canSetTokens`.

## Data handling

Read the primary result from `dataSources?.primary?.data`. Native Studio results are column-oriented:

```javascript
{
    fields: [{ name: 'host' }, { name: 'count' }],
    columns: [['web-01', 'web-02'], ['42', '17']],
}
```

`columns[fieldIndex][rowIndex]` identifies a cell. Values normally arrive as strings. Some fixtures or compatible sources may contain `rows`; normalize both once at the adapter boundary:

```javascript
export function normalizeSearchData(data) {
    const fields = (data?.fields || []).map((field) =>
        typeof field === 'string' ? field : field.name
    );
    const rows = data?.rows?.length
        ? data.rows
        : Array.from(
              { length: data?.columns?.[0]?.length || 0 },
              (_, rowIndex) => data.columns.map((column) => column[rowIndex])
          );
    return { fields, rows };
}
```

Keep this normalization separate from Canvas drawing. Validate required fields, parse numbers explicitly, and distinguish `loading`, missing data, empty results, and invalid results.

## Lifecycle and safety

- Create and own DOM only inside the iframe root (`#root` or `document.body`).
- Render loading and no-data states inside the extension; use `setError(message)` for actionable invalid-data errors and `clearError()` after recovery.
- Escape or assign untrusted strings with `textContent`. Never concatenate search values into HTML.
- Sanitize untrusted URLs and reject unsafe schemes.
- Use dimension state for responsive drawing; do not measure or manipulate the parent dashboard.
- Apply HiDPI Canvas scaling using CSS dimensions and `devicePixelRatio`.
- Treat theme as explicit state. Host CSS variables and theme styles do not cross the iframe boundary.
- Attach drilldown to a real DOM node with `addDrilldownListener`, or call `triggerDrilldown` with an action and payload.
- Never call `setOptions` merely to supply defaults. Defaults belong in `optionsSchema`; reserve `setOptions` for intentional edit-mode interactions.

## Build and package

Use scripts from the generated project:

```bash
npm install
npm run build
npm run build:prod
npm run package
```

Or use the generated Yarn equivalents. Do not hand-edit generated files under `dist/` or `stage/`.

The build uses ES modules, esbuild, and an ES2017 browser target. Modern syntax is allowed; the legacy ES5-only rule does not apply. Assets and fonts referenced from source are inlined by the generated build plugin, which is appropriate for iframe isolation.

## Verification

For every native Studio visualization:

- [ ] Official CLI project structure is intact
- [ ] Node.js is 22+
- [ ] `config.json` parses and has a `primary` data contract when required
- [ ] Every editor entry refers to an option declared in `optionsSchema`
- [ ] Code fallbacks match `optionsSchema` defaults
- [ ] Data supports columnar results and parses numeric strings explicitly
- [ ] Loading, empty, malformed, and recovered states render correctly
- [ ] Width, height, theme, and option changes redraw without reload
- [ ] Canvas is crisp at device pixel ratios 1 and 2
- [ ] Timers, animation frames, API subscriptions, and event listeners are cleaned up
- [ ] Drilldowns and token behavior match `config.json` declarations
- [ ] `npm run build:prod` succeeds
- [ ] `npm run package` produces a `.spl` with `framework_type = studio_visualization`
- [ ] The built bundle passes `studio-test-harness.html`
- [ ] The `.spl` is smoke-tested in Splunk 10.4 Dashboard Studio

The local harness validates the adapter and rendering behavior, but it does not replace the final Splunk smoke test for editor rendering, iframe policy, packaging, permissions, or platform-specific drilldown behavior.

## Legacy-to-Studio mapping

| Legacy concept | Native Studio equivalent |
| --- | --- |
| `SplunkVisualizationBase.extend` | ES module entry point using `VisualizationAPI`, or React hooks |
| `initialize` / `setupView` | Module/component initialization |
| `formatData` | Adapter-level column-to-model normalization |
| `updateView` | Render function called after state listener updates |
| `reflow` | `addDimensionsListener` / `useDimensions` |
| Formatter `config` strings | Typed `options` from `config.json` |
| `formatter.html` | `optionsSchema` plus `editorConfig` |
| `VisualizationError` | In-frame state or `setError` / `clearError` |
| `this.drilldown()` | `addDrilldownListener` or `triggerDrilldown` |
| `SplunkVisualizationUtils.getCurrentTheme()` | `addThemeListener` / `useTheme` |
| AMD + webpack | ES modules + generated esbuild pipeline |
| Legacy tarball | Generated `.spl` package and `app.manifest` |
| `test-harness.html` | `studio-test-harness.html` |
