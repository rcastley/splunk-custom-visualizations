# Legacy App Scaffold

Use this reference when creating or changing legacy app layout, metadata, formatter controls, preview assets, or build inputs.

## Contents

- [Portable layout](#portable-layout)
- [App configuration](#app-configuration)
- [Visualization configuration](#visualization-configuration)
- [Saved search and setting specification](#saved-search-and-setting-specification)
- [Metadata](#metadata)
- [Formatter](#formatter)
- [Build inputs](#build-inputs)
- [Icons and preview](#icons-and-preview)

## Portable layout

Preserve an existing repository's app location. For this repository, new examples normally use `examples/{app_name}/`; in another repository, locate its equivalent app root rather than imposing that path.

```text
{app_root}/
  README.md
  default/
    app.conf
    visualizations.conf
    savedsearches.conf
  metadata/default.meta
  README/savedsearches.conf.spec
  static/
    appIcon.png
    appIcon_2x.png
    appIconAlt.png
    appIconAlt_2x.png
  appserver/static/visualizations/{app_name}/
    src/visualization_source.js
    formatter.html
    preview.png
    visualization.css
    webpack.config.js
    package.json
    harness.json
```

Keep repository-only files such as `.gitignore` and `node_modules/` out of the packaged app.

## App configuration

Use semantic versions and keep `[id]` and `[launcher]` versions synchronized:

```ini
[id]
name = {app_name}
version = 1.0.0

[install]
is_configured = false
build = 1

[package]
id = {app_name}
check_for_updates = false

[ui]
is_visible = true
label = {display_label}

[launcher]
author = {author}
description = {description}
version = 1.0.0
```

Do not add `[triggers]` for `visualizations.conf`; it is a Splunk-defined configuration file. Keep `is_configured = false` in shipped apps.

## Visualization configuration

```ini
[{app_name}]
label = {display_label}
description = {description}
default_height = {height}
allow_user_selection = true
disabled = 0
search_fragment = {search_fragment}
```

Use at most 30 characters for `label`, 80 for `description`, and 80 for `search_fragment`. Make the description task-oriented and make the search fragment demonstrate the expected field shape.

## Saved search and setting specification

Provide a working historical saved search and include every setting with its runtime default:

```ini
[{Display Label} - Example]
search = {full_spl_query}
dispatch.earliest_time = -15m
dispatch.latest_time = now
display.general.type = visualizations
display.visualizations.type = custom
display.visualizations.custom.type = {app_name}.{app_name}
display.visualizations.custom.{app_name}.{app_name}.{setting} = {default}
```

Document each setting in `README/savedsearches.conf.spec`:

```ini
display.visualizations.custom.{app_name}.{app_name}.{setting} = <type>
```

Use `<integer>`, `<float>`, `<string>`, or `<boolean>`. Document required/optional columns, a complete SPL example, settings, time range, build, and drilldown behavior in the app README.

## Metadata

Use a global access stanza for Cloud vetting and export the visualization:

```ini
[]
access = read : [ * ], write : [ admin, sc_admin ]

[visualizations/{app_name}]
export = system
```

## Formatter

Use Splunk formatter components inside `form.splunk-formatter-section`. Namespace every control with `{{VIZ_NAMESPACE}}`:

```html
<form class="splunk-formatter-section" section-label="General">
    <splunk-control-group label="Maximum" help="Upper bound for the scale.">
        <splunk-text-input name="{{VIZ_NAMESPACE}}.maxValue" value="100">
        </splunk-text-input>
    </splunk-control-group>
</form>
```

Available controls include `splunk-text-input`, `splunk-text-area`, `splunk-radio-input`, `splunk-select`, and `splunk-color-picker`. In JavaScript, resolve the namespace with `getPropertyNamespaceInfo().propertyNamespace` and read `config[namespace + 'maxValue']`.

Treat formatter defaults as part of one synchronized contract: formatter, runtime fallback, saved search, `.spec`, README, and harness must agree.

## Build inputs

Use an AMD webpack target:

```javascript
var path = require('path');

module.exports = {
    entry: './src/visualization_source.js',
    output: {
        filename: 'visualization.js',
        path: path.resolve(__dirname),
        libraryTarget: 'amd'
    },
    externals: [
        'api/SplunkVisualizationBase',
        'api/SplunkVisualizationUtils'
    ]
};
```

Provide `build` and `dev` webpack scripts in `package.json`. Keep the visualization background transparent unless the design explicitly requires an opaque background:

```css
.{app-name}-viz {
    background: transparent;
}
```

## Icons and preview

Provide four app icons: 36×36 standard and alternate images plus 72×72 HiDPI variants. Provide a 116×76 `preview.png` that fills the frame and clearly represents the visualization.

Prefer the repository's existing image workflow. If generating an image helper, keep it outside the packaged app or remove it after verifying the output. Do not hardcode a host-specific font path; use an available font or a bundled asset and fall back safely.
