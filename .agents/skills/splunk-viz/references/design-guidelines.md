# Splunk Design Guidelines Reference

These constants come from the [official Splunk design guidelines](https://help.splunk.com/en/splunk-cloud-platform/developing-views-and-apps-for-splunk-web/10.3.2512/custom-visualizations/design-guidelines). Apply them when the viz includes standard chart elements (axes, legends, gridlines, tooltips). Canvas-only vizs that draw custom UI (gauges, status boards, etc.) may deviate where it makes sense, but should still use the official palettes and font stacks.

## Description Best Practices

Write descriptions in active voice focusing on user tasks, not visual appearance:
- **Pattern**: Action (show/track/compare/plot) + Information (values/trends/metrics) + Presentation (over/in/against) + Key Components (baseline/range/time)
- **Good**: "Track metric values against configurable thresholds over time"
- **Bad**: "A colorful gauge with an arc and numbers" (describes appearance, not purpose)
- Do not repeat the visualization name in the description

## Font Standards

When the viz uses standard chart elements (axis labels, tick marks, legends), use the Splunk font stack:

```javascript
var SPLUNK_FONT = "'Lucida Grande', 'Lucida Sans Unicode', Arial, Helvetica, sans-serif";
```

| Element | Size | Line-height | Color |
|---------|------|-------------|-------|
| Axis titles (X/Y) | 12px | 16px | `#3C444D` |
| Tick mark labels | 11px | 12px | `#3C444D` |
| Legend text | 11px | 12px | `#3C444D` |

For Canvas vizs that don't have traditional chart axes (gauges, status boards, etc.), continue using `sans-serif` and `monospace` as described in rule 10 — the Splunk font stack is only relevant for chart-style visualizations.

## Color Palettes

When the viz needs color scales, prefer Splunk's official palettes. These correspond to the `splunk-color-picker` `type` values in `formatter.html`.

**Semantic (6 colors)** — for value ranges and meaning indicators (`type="splunkSemantic"`):
```javascript
var SPLUNK_SEMANTIC = ['#DC4E41', '#F1813F', '#F8BE34', '#53A051', '#006D9C', '#3C444D'];
```

**Categorical (3 alternate 10-color palettes)** — for distinct category coloring (`type="splunkCategorical"`):
```javascript
var SPLUNK_CAT_1 = ['#006D9C', '#4FA484', '#EC9960', '#AF575A', '#B6C75A', '#62B3B2', '#294E70', '#738795', '#EDD051', '#BD9872'];
var SPLUNK_CAT_2 = ['#5A4575', '#7EA77B', '#708794', '#D7C6B7', '#339BB2', '#55672D', '#E6E1A4', '#96907F', '#87BC65', '#CF7E60'];
var SPLUNK_CAT_3 = ['#7B5547', '#77D6D8', '#4A7F2C', '#F589AD', '#6A2C5D', '#AAABAE', '#9A7438', '#A4D563', '#7672A4', '#184B81'];
```

**Sequential (6 base colors)** — for single-hue intensity scales (`type="splunkSequential"`):
```javascript
var SPLUNK_SEQUENTIAL = ['#1D92C5', '#D6563C', '#6A5C9E', '#31A35F', '#ED8440', '#3863A0'];
// Minimum values must appear at ≥10% lightness of the base color
```

**Divergent (6 two-color pairs)** — for emphasizing high/low extremes:
```javascript
var SPLUNK_DIVERGENT = [
    ['#236D9C', '#EC9960'],
    ['#62B3B2', '#AF575A'],
    ['#6A5C9E', '#D6563C'],
    ['#31A35F', '#EC9960'],
    ['#ED8440', '#3863A0'],
    ['#1D92C5', '#AF575A']
];
```

## Spacing Constants

Apply these when the viz draws chart-style elements (axes, legends, gridlines):

| Spacing | Value | Between |
|---------|-------|---------|
| Panel margin | 15px | Around entire visualization panel |
| Y-axis label → viz | 10px | Label text to chart area |
| X-axis label → tick marks | 10px | Label text to tick marks |
| Tick marks → viz | 5px | Tick mark end to chart area edge |
| Viz → legend | 20px | Chart area to legend |

## Gridlines and Axes

| Element | Color |
|---------|-------|
| Gridlines | `#ebedef` |
| Axis lines | `#d9dce0` |

## Legend Swatches

Each legend item has a **16×12px** color swatch. See the `drawLegend` recipe in `references/canvas-recipes.md`. For chart-style vizs, use `SPLUNK_FONT` instead of `sans-serif` as the font family.

## Tooltips

When implementing Canvas tooltips (HTML overlays positioned on hover), use these specs:

| Property | Value |
|----------|-------|
| Padding | 10px |
| Text size | 12px |
| Line-height | 16px |
| Label color | `#CCC` |
| Background | `#FFF` |
| Pointer | Centered on tooltip edge |

## Responsive Design

- Scale all elements proportionally when the panel resizes — avoid fixed pixel widths for layout
- Hide non-essential labels and decorations on small panels (e.g., hide axis titles below 200px width)
- The `reflow` method and percentage-based layout in the core pattern handle most of this, but chart-style vizs should explicitly check panel dimensions and adapt
