# Legacy Runtime and Lifecycle

Use this reference when creating, debugging, or materially changing a `SplunkVisualizationBase` visualization.

## Contents

- [Lifecycle baseline](#lifecycle-baseline)
- [Data contract](#data-contract)
- [Configuration](#configuration)
- [Canvas rendering](#canvas-rendering)
- [No-data behavior](#no-data-behavior)
- [Events and teardown](#events-and-teardown)
- [Optional policies](#optional-policies)

## Lifecycle baseline

Read `core-template.md` for the complete AMD baseline. Preserve these low-freedom invariants:

- Call the base `initialize` method and create owned DOM once.
- Return explicit output/data parameters from `getInitialDataParams`.
- Make `formatData` lightweight and return a new plain model.
- Validate required fields and throw `SplunkVisualizationBase.VisualizationError` for user-facing failures.
- Redraw from `updateView` and `reflow` without duplicating DOM.
- Remove listeners, timers, animation frames, observers, and owned DOM in `destroy`, then call the base destroy method.

Use ES5-compatible syntax in the legacy source unless the app's tested browser matrix and transpilation target explicitly permit newer syntax.

## Data contract

Splunk fields and row values are strings. Build a field-name-to-index map once, parse numbers explicitly, and reject non-finite values when the renderer requires numeric input.

Return a renderer-focused model rather than the raw Splunk result object:

```javascript
return {
    value: parsedValue,
    label: String(row[labelIndex] || '')
};
```

Do not read formatter configuration in `formatData`; Splunk can call it without the view configuration. Resolve settings in `updateView`.

When a visualization shares a base search, expose field-name settings rather than hardcoding generic names such as `value`.

## Configuration

Resolve the namespace once per update:

```javascript
var namespace = this.getPropertyNamespaceInfo().propertyNamespace;
var maxValue = Number(config[namespace + 'maxValue']);
if (!isFinite(maxValue) || maxValue <= 0) maxValue = 100;
```

Use explicit parsing for booleans, numbers, colors, and URLs. Keep defaults aligned with formatter controls, saved searches, `.spec`, README, and `harness.json`.

Avoid `||` when zero or an empty string is a valid configured value. Test for `undefined`, `null`, or invalid parsing instead.

## Canvas rendering

- Measure the container with `getBoundingClientRect()` and return before drawing when width or height is not positive.
- Size the backing store to CSS size times `devicePixelRatio` and draw in CSS pixels.
- Reset the transform before resizing or scaling when reusing a context.
- Null-check every `getContext('2d')` result.
- Wrap drawing in `save()`/`restore()` or explicitly reset transforms, alpha, shadows, clipping, compositing, and line dashes.
- Clamp ratios and color indices. Guard division by zero and empty collections.
- Keep layout and drawing helpers pure where practical.
- Use `textContent` for DOM labels and sanitize any configurable URLs.

Read `canvas-recipes.md` for drawing patterns and `design-guidelines.md` for chart typography, palettes, axes, legends, and responsive layout.

## No-data behavior

Choose the policy deliberately:

1. Throw `VisualizationError` for Splunk's framework-rendered empty/error state.
2. For a custom Canvas message, have SPL emit a documented `_status` row and normalize it into an explicit status model before drawing.
3. Preserve last-good data only when the product requirement calls for stale-data continuity. Make stale state visible when it could otherwise mislead users.

Do not force every visualization to cache previous data or implement the `_status` convention. These are optional policies, not lifecycle invariants.

## Events and teardown

Store bound event handlers so `destroy` can remove the exact functions. Keep hit regions in CSS pixels. Use the visualization drilldown API rather than directly navigating the parent page; read `drilldown.md` when adding Canvas interaction.

Cancel active `requestAnimationFrame` callbacks and timers. Stop smoothing before drawing an error or status state. Call `SplunkVisualizationBase.prototype.destroy` after local cleanup.

## Optional policies

- Read `smoothing.md` only for continuous numeric motion. Do not smooth categorical, boolean, discrete-count, or rank-reordering data.
- Read `custom-fonts.md` only when using embedded fonts. Wait for required fonts before measuring or drawing text.
- Pick caching, animation, and custom status behavior from the visualization requirements; do not copy optional template branches blindly.
