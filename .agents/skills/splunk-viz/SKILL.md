---
name: splunk-viz
description: >-
  Scaffold, build, modify, debug, test, and package Canvas 2D custom
  visualizations for both Splunk frameworks: the legacy Simple XML/Backbone
  framework using SplunkVisualizationBase, AMD, formatter.html, and webpack;
  and the native Dashboard Studio extension framework using
  @splunk/dashboard-studio-extension, config.json dynamic editors, iframe
  isolation, esbuild, and the @splunk/create CLI. Also use for
  visualizations.conf framework selection, Splunk Cloud vetting, HiDPI canvas
  issues, custom fonts, drilldowns, local harnesses, and apps that bundle
  multiple visualizations.
---

# Build Splunk Custom Visualizations

Generate production-ready Canvas 2D custom visualizations for both Splunk frameworks.

## Select the framework first

Determine the framework before creating or changing files. Do not mix lifecycle, configuration, build, or harness conventions.

| Target | Select when | Runtime and configuration |
| --- | --- | --- |
| **Native Dashboard Studio** | Create a new visualization specifically for Dashboard Studio on Splunk 10.4+ | Sandboxed iframe, `@splunk/dashboard-studio-extension`, `config.json`, ES modules, esbuild, `.spl` package |
| **Legacy custom visualization** | Support Simple XML, Search, saved reports, an existing `SplunkVisualizationBase` app, or pre-10.4 deployments | Backbone/AMD, `SplunkVisualizationBase`, `formatter.html`, webpack, legacy app package |
| **Both outputs** | The user explicitly needs both frameworks | Separate framework adapters around shared rendering and normalization modules; independent packages and tests |

For a vague new Dashboard Studio request, recommend the native Studio framework. Do not call a legacy visualization that happens to render in Dashboard Studio a native Studio extension.

Confirm or infer:

1. Target framework: native Studio, legacy, or both outputs.
2. Minimum Splunk version and deployment target: Enterprise, Cloud, or both.
3. Visualization ID, label, description, author, required and optional SPL fields, settings, drilldowns, tokens, and no-data behavior.
4. Native Studio template: JavaScript, TypeScript, React, or React + TypeScript. Prefer TypeScript for new work; use React only when component state or UI composition justifies it.

## Route to the required references

### Native Dashboard Studio

Read before editing:

- `references/studio-framework.md` — required project, API, configuration, packaging, and verification workflow
- `references/studio-canvas-template.md` — required for framework-agnostic JavaScript or TypeScript Canvas visualizations
- `references/studio-react-template.md` — required only for React or React + TypeScript
- `references/studio-harness.md` — required whenever creating or changing native Studio test coverage

Use the official `@splunk/create --mode=dashboard-studio-extension` scaffold as the source of truth. Preserve its generated `build.mjs`, `package.mjs`, and build plugins unless a concrete requirement demands a change.

### Legacy framework

Read `references/legacy-framework.md` before editing. It contains the app structure, AMD lifecycle, formatter, configuration, Cloud vetting, build, harness schema, and verification rules.

Also read only the references required by the feature:

- `references/core-template.md` — required when creating or materially changing `visualization_source.js`
- `references/drilldown.md` — legacy Canvas drilldowns
- `references/dashboard-studio-app.md` — parent Dashboard Studio apps that bundle legacy visualizations; not the native extension framework

### Shared rendering references

- `references/canvas-recipes.md` — drawing helpers, thresholds, layout, and hit testing
- `references/design-guidelines.md` — chart typography, palettes, axes, legends, gridlines, and descriptions
- `references/custom-fonts.md` — use when embedding or debugging fonts; account for iframe isolation on native Studio
- `references/smoothing.md` — adapt its tween math and state model; use framework-specific subscription and cleanup code

## Both-output architecture

Do not ship one entry point that detects both hosts. Generate separate adapters and metadata around shared pure modules:

```text
shared/
  render.js               # pure Canvas drawing and calculations
  normalize.js            # framework-neutral model conversion
legacy/
  visualization_source.js # SplunkVisualizationBase adapter
  formatter.html
studio/
  visualization.ts        # DashboardExtensionAPI adapter
  config.json
```

Keep the shared layer free of:

- Splunk APIs and lifecycle methods
- formatter namespaces and native Studio state objects
- DOM ownership and direct element lookup
- framework-specific row-major or columnar result shapes
- timers, subscriptions, and cleanup ownership

Translate both inputs into the same small model, then pass `context`, CSS dimensions, theme, options, and the model into pure drawing functions. Test the legacy bundle in `test-harness.html` and the native bundle in `studio-test-harness.html`.

## Shared Canvas requirements

Apply these in both frameworks:

1. Handle HiDPI: size the backing store from CSS dimensions times `devicePixelRatio`, set/reset the transform, and draw in CSS pixels.
2. Check positive width and height before drawing and null-check every 2D context.
3. Reset or wrap Canvas state with `save()` and `restore()`; do not leak alpha, shadows, transforms, clipping, line dashes, or compositing.
4. Keep drawing and calculation helpers pure. Give the framework adapter ownership of DOM, subscriptions, timers, and teardown.
5. Treat search values as untrusted strings. Use `textContent` for DOM text, avoid dynamic `innerHTML`, sanitize URLs, and parse numerics explicitly.
6. Support loading, empty, malformed, and recovered states without flashing stale framework errors.
7. Redraw on data, option, size, and theme changes. Cancel animation frames, timers, listeners, observers, and subscriptions on teardown.
8. Keep every setting synchronized across metadata/schema, editor controls, code defaults, documentation, saved examples where applicable, and harness fixtures.
9. Verify responsive proportions at small and large panel sizes and text readability in light and dark themes.
10. Use a client-side tween only for continuous numeric motion; keep discrete, categorical, boolean, and rank-reordering data unsmoothed.

## Completion requirements

Do not stop after generating the entry point.

For either framework:

- Build the production bundle.
- Run the matching local harness and cover loading, empty, invalid, valid, resize, theme, and option changes.
- Validate configuration and documentation syntax.
- Inspect the packaged archive and run applicable Splunk AppInspect or vetting checks.
- Smoke-test the installed package on the minimum supported Splunk version when an instance is available.

For both outputs, perform all checks independently. A passing legacy harness does not validate the Studio adapter, and a passing Studio harness does not validate Simple XML, Search, saved-report, or legacy formatter behavior.
