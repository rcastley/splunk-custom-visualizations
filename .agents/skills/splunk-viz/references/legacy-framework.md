# Legacy SplunkVisualizationBase Framework

Use this reference for `framework_type = legacy_visualization`, the default legacy framework, or a legacy visualization embedded in Dashboard Studio. Do not use these lifecycle or configuration conventions for a native Dashboard Studio extension.

## Contents

- [Requirements](#requirements)
- [Platform differences](#platform-differences)
- [Task routing](#task-routing)
- [Framework invariants](#framework-invariants)
- [Completion contract](#completion-contract)

## Requirements

Confirm or infer:

1. Target platform: Splunk Cloud, Splunk Enterprise, or both. Default to both when compatibility is unclear.
2. Visualization ID: lowercase app and stanza identifier, normally using underscores.
3. Label and description: label at most 30 characters; description at most 80 characters.
4. Required and optional SPL fields, including whether field names must be configurable for base-search reuse.
5. Formatter settings, defaults, types, and valid ranges.
6. Rendering, interaction, drilldown, animation, and no-data behavior.
7. Minimum supported Splunk version. The templates target the custom visualization behavior available in Splunk Enterprise 10.2+ and current Splunk Cloud.

Ask only when an unresolved choice materially changes the implementation. Otherwise state the assumption and proceed.

## Platform differences

When targeting both, apply the Cloud constraints because they are the stricter set.

| Concern | Cloud | Enterprise | Both |
| --- | --- | --- | --- |
| `[id]` in `app.conf` | Required | Recommended | Include |
| `[triggers]` for `visualizations.conf` | Reject | Unnecessary | Omit |
| Write roles in `default.meta` | Include `sc_admin` | Include `admin` | Include both |
| Real-time saved searches | Reject | Allowed | Use historical ranges |
| Four app icons | Required by vetting | Recommended | Include |
| `.git*`, caches, development files | Exclude | Exclude for clean packages | Exclude |
| Global `[]` metadata access stanza | Required | Recommended | Include |

## Task routing

Read only what the task requires:

- `legacy-scaffold.md`: directory layout, app configuration, formatter, preview, and build inputs.
- `legacy-runtime.md`: AMD lifecycle, data validation, settings, rendering, no-data behavior, and teardown.
- `core-template.md`: baseline AMD implementation. Preserve lifecycle guards; adapt optional caching, status, and rendering policies.
- `legacy-harness.md`: interactive fixture schema and harness registration.
- `legacy-packaging.md`: build, archive, AppInspect/vetting, and completion checklist.
- `drilldown.md`: Canvas hit testing and legacy drilldown.
- `dashboard-studio-app.md`: optional parent Dashboard Studio app that bundles legacy visualization apps.
- `canvas-recipes.md`, `design-guidelines.md`, `custom-fonts.md`, and `smoothing.md`: feature-specific shared guidance.

## Framework invariants

- Extend `SplunkVisualizationBase` from an AMD module and emit an AMD webpack bundle.
- Keep formatter names, JavaScript defaults, saved-search settings, specification entries, documentation, and harness fixtures synchronized.
- Normalize Splunk search data before rendering and report user-facing validation failures with `SplunkVisualizationBase.VisualizationError`.
- Render in CSS pixels with a device-pixel-ratio backing store, positive-size checks, and a non-null 2D context.
- Give the adapter ownership of DOM nodes, event handlers, animation frames, timers, and teardown.
- Treat search values as untrusted strings. Parse numeric values explicitly and avoid dynamic `innerHTML`.
- Package only runtime files. Exclude source, dependencies, caches, generated helpers, and all `.git*` artifacts.

## Completion contract

For a new visualization, complete scaffold, runtime, harness, and packaging checks. For an existing visualization, load only the affected references but update every synchronized setting or field surface. A successful webpack build alone is not completion.
