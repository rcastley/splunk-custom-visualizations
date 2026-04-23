---
name: splunk-viz
description: Scaffold and build Splunk custom visualizations using Canvas 2D. Use this skill whenever the user wants to create, modify, debug, fix, or package a Splunk custom visualization app — including visualization_source.js, formatter.html, visualizations.conf, savedsearches.conf, webpack config, harness.json, or anything involving SplunkVisualizationBase. Also triggers for Splunk Cloud vetting errors (check_for_trigger_stanza, check_for_prohibited_files), blurry/HiDPI canvas issues, custom font embedding in Splunk vizs, Dashboard Studio custom viz integration, and scaffolding parent apps that bundle multiple vizs.
---

You are an expert Splunk developer specializing in custom visualizations built with the Splunk Visualization Framework (Canvas 2D rendering, AMD modules, webpack). You generate production-ready code, not prototypes.

## Architecture Overview

**Requires Splunk Enterprise 10.2+ or Splunk Cloud.** The `visualizations.conf` configuration and custom viz framework were significantly improved in 10.2. The target platform (Cloud, Enterprise, or both) is determined in Step 1 and affects which vetting constraints are applied — see the **Platform Differences** table.

A Splunk custom visualization is a standalone Splunk app that renders search results using Canvas 2D. It consists of:

1. **App scaffolding** — Splunk app config files (`app.conf`, `visualizations.conf`, `savedsearches.conf`)
2. **Formatter UI** — HTML form that exposes user-configurable settings in the Splunk dashboard editor
3. **Visualization source** — JavaScript AMD module that extends `SplunkVisualizationBase` with Canvas 2D rendering
4. **Build tooling** — webpack bundles the source into a single `visualization.js` AMD module
5. **Build/deploy scripts** — Shell scripts to build, package, and deploy the app

## Step 1: Gather Requirements

Before generating code, ask the user (or extract from context):

1. **Target platform**: Splunk Cloud, Splunk Enterprise, or both. This determines which vetting constraints apply (see **Platform Differences** below). When in doubt, default to **both** — this produces an app that passes Splunk Cloud vetting and also works on Enterprise.
2. **Viz name**: short lowercase identifier (e.g., `network_graph`, `heatmap_grid`). Used as both the app ID and the visualization stanza name.
3. **Display label**: human-readable name for the Splunk UI (e.g., "Network Graph", "Heatmap Grid"). **Max 30 characters.**
4. **Description**: one-line description. **Max 80 characters.** See **Description Best Practices** in Splunk Design Guidelines.
5. **Expected SPL columns**: which fields the search must produce (e.g., `_time, source, dest, value`). Distinguish required vs optional columns. Ask if the viz will share a base search with other panels — if so, use configurable field names (see rule 18) instead of hardcoding column names like `value`.
6. **Configurable settings**: what the user should be able to tweak from the formatter panel (e.g., colors, sizes, toggles, units). For each setting, determine: name, type (text/radio/dropdown), default value.
7. **Rendering approach**: what to draw on the canvas (shapes, lines, text, gradients, animations).
8. **Custom no-data message**: ask the user if they want a custom "awaiting data" message rendered on the canvas when no data is flowing (e.g., "Awaiting telemetry data"). If yes, the viz will detect a `_status` field from an SPL `appendpipe` fallback and render the message centered on the canvas. Optionally, an emoji can be displayed above the text for visual flair. If no, the viz falls back to Dashboard Studio's default placeholder (grey bar chart icon or `VisualizationError` text).

If the user provides a vague request, ask clarifying questions before scaffolding.

### Platform Differences

The table below summarises the key differences that affect generated code. When the target is **both**, apply all Splunk Cloud constraints — they are a strict superset of Enterprise requirements.

| Concern | Splunk Cloud | Splunk Enterprise | Both (default) |
|---------|-------------|-------------------|----------------|
| **`[id]` stanza in `app.conf`** | Required (`check_version_is_valid_semver`) | Optional but recommended | Required |
| **`[triggers]` for `visualizations.conf`** | Rejected (`check_for_trigger_stanza`) | Accepted but unnecessary | Omit |
| **`sc_admin` role in `default.meta`** | Required (`check_kos_are_accessible`) — `admin` role does not exist in Cloud | Not needed — only `admin` exists | Include both `admin` and `sc_admin` |
| **Real-time saved searches** | Rejected (`check_for_real_time_saved_searches_for_cloud`) | Allowed | Use historical (`-1m` to `now`) |
| **App icons in `static/`** | Required — vetting warns on missing icons | Optional but recommended | Include all four |
| **Prohibited files** | Rejected (`check_for_prohibited_files`) — `.gitignore`, `.gitkeep`, `.github/`, `.git/`, `.DS_Store`, `*.pyc`, `__pycache__/` are all blocked | No restriction | Exclude all `.git*` files and dev artifacts from the tarball |
| **`check_meta_default_write_access`** | Global `[]` stanza in `default.meta` is mandatory | Recommended | Include |

When generating files, apply the constraints from the user's chosen platform column. The templates in this skill default to the **Both** column.

## Step 2: Generate the App

### Directory Structure

Every viz app lives in `examples/{app_name}/` and follows this exact layout — do not deviate from this path:

```
examples/{app_name}/
  README.md                       (documentation, SPL reference, and build instructions)
  default/
    app.conf
    visualizations.conf
    savedsearches.conf
  metadata/
    default.meta
  README/
    savedsearches.conf.spec
  static/
    appIcon.png                   (36x36 app icon)
    appIcon_2x.png                (72x72 HiDPI app icon)
    appIconAlt.png                (36x36 alternate app icon)
    appIconAlt_2x.png             (72x72 HiDPI alternate app icon)
  appserver/
    static/
      visualizations/
        {app_name}/
          src/
            visualization_source.js
          formatter.html
          preview.png             (116x76 viz picker preview icon)
          visualization.css       (transparent background by default)
          webpack.config.js
          package.json
          harness.json            (test harness config — fields, formatter, sample data)
          .gitignore              (dev-only — excluded from tarball by build script)
```

> **Required after scaffolding**: Create `harness.json` in `{viz_path}/` and add the viz name to both the `vizs` array and the appropriate `categories` group in `harness-manifest.json` (at the repo root). Both are mandatory for the test harness. Do not skip this step.

### File Templates

#### README.md

Every viz app includes a `README.md` at the app root. This is the single source of documentation — it describes the visualization, installation, expected columns, SPL queries, configuration options, and build instructions. Structure:

```markdown
# {Display Label} — Splunk Custom Visualization

{Description paragraph}

## Install

1. Copy or symlink the `{app_name}/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "{Display Label}" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| {col}  | {type} | {what it is} |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| {col}  | {type} | {what it is} |

## Notes

- Key data assumptions, units, fallback behaviour, etc.

## Search

\`\`\`spl
{full working SPL query}
\`\`\`

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| {setting} | {what it does} | {default value} |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

\`\`\`bash
./build.sh {app_name}
\`\`\`

The tarball is output to `dist/{app_name}-1.0.0.tar.gz`.
```

#### default/app.conf
```
[id]
name = {app_name}
version = 1.0.0

[install]
is_configured = true
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

The `[id]` stanza is required by Splunk Cloud vetting (`check_version_is_valid_semver`). Do NOT add a `[triggers]` stanza with `reload.visualizations = simple` — `visualizations.conf` is a Splunk-defined conf file and Splunk Cloud vetting (`check_for_trigger_stanza`) will reject it. The `[triggers]` stanza is only for custom (non-Splunk) config files. Keep the version in `[id]` and `[launcher]` in sync.

#### default/visualizations.conf
```
[{app_name}]
label = {display_label}
description = {description}
default_height = {height}
allow_user_selection = true
disabled = 0
search_fragment = {search_fragment}
```

**Character limits** (enforced by Splunk's viz picker UI):
- `label`: max **30 characters**
- `description`: max **80 characters**
- `search_fragment`: max **80 characters**

The `search_fragment` is a partial SPL snippet that shows users how to structure their search for this visualization. It should produce the expected columns.

#### default/savedsearches.conf

Provide a complete, working saved search that demonstrates the visualization. Use historical time ranges — do NOT use real-time (`rt-*` to `rt`) as Splunk Cloud vetting rejects them (`check_for_real_time_saved_searches_for_cloud`). Include all `display.visualizations.custom.*` settings with sensible defaults.

```
[{Display Label} - Live]
search = {full_spl_query}
dispatch.earliest_time = -{window}
dispatch.latest_time = now
display.general.type = visualizations
display.visualizations.type = custom
display.visualizations.custom.type = {app_name}.{app_name}
display.visualizations.custom.{app_name}.{app_name}.{setting1} = {default1}
display.visualizations.custom.{app_name}.{app_name}.{setting2} = {default2}
```

#### README/savedsearches.conf.spec

Document every custom setting:
```
display.visualizations.custom.{app_name}.{app_name}.{setting} = <type>
```

Valid types: `<integer>`, `<float>`, `<string>`, `<boolean>`

#### metadata/default.meta

Required for Splunk to export the visualization to other apps/users.
The global `[]` stanza is **mandatory for Splunk Cloud vetting** — without it the upload is blocked with `check_meta_default_write_access`.
```
[]
access = read : [ * ], write : [ admin, sc_admin ]

[visualizations/{app_name}]
export = system
```

Always include `sc_admin` alongside `admin` in write ACLs — the `admin` role is not available in Splunk Cloud. Without `sc_admin`, Cloud administrators cannot access the knowledge objects (`check_kos_are_accessible`).

#### static/ (app icons)

Splunk requires four PNG icon files in the `static/` directory at the app root. These are displayed in the Splunk app browser, Manage Apps page, and Splunkbase. All four must exist — missing icons cause Splunk Cloud vetting warnings.

| File | Size | Description |
|------|------|-------------|
| `appIcon.png` | 36x36 px | Standard app icon |
| `appIcon_2x.png` | 72x72 px | HiDPI (Retina) app icon |
| `appIconAlt.png` | 36x36 px | Alternate icon (used on dark backgrounds) |
| `appIconAlt_2x.png` | 72x72 px | HiDPI alternate icon |

Use a simple, recognizable graphic on a transparent background. The `Alt` variants should be legible on both light and dark backgrounds — typically a lighter or inverted version of the primary icon.

#### formatter.html

Use Splunk's built-in form components. Multiple `<form>` elements with `class="splunk-formatter-section"` and `section-label` render as separate tabs in the format menu.

**Container:**
- `<splunk-control-group label="..." help="...">` — wraps each input. `help` shows helper text below the control.

**Input types:**
- **Text**: `<splunk-text-input name="{{VIZ_NAMESPACE}}.{setting}" value="{default}">`
- **Text area**: `<splunk-text-area name="{{VIZ_NAMESPACE}}.{setting}">`
- **Radio**: `<splunk-radio-input name="{{VIZ_NAMESPACE}}.{setting}" value="{default}">` with `<option>` children
- **Dropdown**: `<splunk-select name="{{VIZ_NAMESPACE}}.{setting}" value="{default}">` with `<option>` children
- **Color picker**: `<splunk-color-picker name="{{VIZ_NAMESPACE}}.{setting}" type="{type}" value="{default}">` with optional `<splunk-color>` children

**Color picker `type` values:** `splunkCategorical` (default), `splunkSemantic`, `splunkSequential`, `custom`. Use `custom` with `<splunk-color>` children to define a bespoke palette:
```html
<splunk-color-picker name="{{VIZ_NAMESPACE}}.bgColor" type="custom" value="#1a1a2e">
    <splunk-color>#1a1a2e</splunk-color>
    <splunk-color>#000000</splunk-color>
    <splunk-color>transparent</splunk-color>
</splunk-color-picker>
```

Settings are accessed in JS via `config[ns + '{setting}']` where `ns` comes from `this.getPropertyNamespaceInfo().propertyNamespace`.

#### webpack.config.js (identical for all vizs)
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

#### package.json
```json
{
  "name": "{app-name}-viz",
  "version": "1.0.0",
  "description": "{description}",
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch"
  },
  "devDependencies": {
    "webpack": "^5.90.0",
    "webpack-cli": "^5.1.4"
  }
}
```

#### visualization.css
Create this file with a transparent background on the root container. Splunk requires it to exist. Always default to `background: transparent` so the visualization inherits the dashboard's background color. Only use an opaque background if the user explicitly requests one.

```css
.{app-name}-viz {
    background: transparent;
}
```

#### .gitignore

**Important**: `.gitignore` is for local development only. Splunk Cloud vetting rejects apps containing `.gitignore`, `.gitkeep`, `.github/`, or any `.git*` files (`check_for_prohibited_files`). The build script must exclude all `.git*` files from the tarball using `--exclude='.git*'` or `--exclude='.*'`.

```
node_modules
```

#### preview.png (Visualization Picker Icon)

Splunk displays a `preview.png` in the visualization picker when the user selects a chart type. This file is **required** for a polished viz.

| Property | Requirement |
|----------|-------------|
| **Dimensions** | Exactly 116×76 pixels |
| **Format** | PNG |
| **Location** | `appserver/static/visualizations/{app_name}/preview.png` |
| **Content** | Fill the full 116×76 area — no gaps, borders, or empty margins. Show a recognizable, moderately detailed representation of the viz (not too minimal, not too busy) |
| **Background** | Use the viz's typical dark background color (e.g., `#1a1a2e`, `#0d1117`) — not transparent, since the picker has its own background |

**Prerequisite:** Generating `preview.png` requires Python 3 with the **Pillow** library. Use a virtual environment (see rule 31) — `pip install Pillow` inside the venv.

**Generation script** — `generate_preview.py` is a temporary helper that creates `preview.png` for the viz. Place it alongside the viz source, run it once, then delete it. The script draws a simplified representation of the viz type on a 116×76 canvas.

Generate a viz-type-specific script based on the table below. Each script must:
1. Create a 116×76 RGBA image
2. Fill with the viz's dark background color
3. Draw a simplified but recognizable representation of the viz
4. Save as `preview.png` in the same directory
5. Print a confirmation message

**Viz type preview templates:**

| Viz Type | What to Draw |
|----------|-------------|
| **Gauge / Meter** | Arc with colored fill segment, center value text |
| **Heatmap / Grid** | Small grid of colored rectangles with varying intensity |
| **Network Graph** | Circles (nodes) connected by lines (edges) |
| **Status Board** | Colored rounded rectangles with short labels |
| **Timeline / Gantt** | Horizontal bars at different Y positions |
| **Bar / Column** | Vertical bars of varying height with axis line |
| **Radial / Donut** | Colored arc segments forming a ring with center text |
| **Line Chart** | Polyline with dots on a simple axis |
| **Single Value** | Large centered number with small label below |

**Example generation script** (gauge type):

```python
#!/usr/bin/env python3
"""Generate preview.png for the viz picker (116x76)."""
import math, os
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow is required. Install with: source .venv/bin/activate && pip install Pillow")
    raise SystemExit(1)

W, H = 116, 76
img = Image.new("RGBA", (W, H), (26, 26, 46, 255))  # dark bg
draw = ImageDraw.Draw(img)

# Draw a simplified gauge arc
cx, cy, r = W // 2, H // 2 + 8, 28
draw.arc([cx - r, cy - r, cx + r, cy + r], 200, 340, fill=(80, 80, 120), width=6)
draw.arc([cx - r, cy - r, cx + r, cy + r], 200, 290, fill=(0, 200, 120), width=6)

# Center value text (use default font)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
except Exception:
    font = ImageFont.load_default()
draw.text((cx, cy - 6), "75", fill=(255, 255, 255), font=font, anchor="mm")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "preview.png")
img.save(out)
print(f"Created {out} ({W}x{H})")
```

**Workflow:** After generating the viz source files, create `generate_preview.py` customized for the specific viz, run it with `python3 generate_preview.py`, verify the output, then delete the script. Only `preview.png` ships with the app.

#### harness.json (MANDATORY)

Create `appserver/static/visualizations/{app_name}/harness.json` alongside `formatter.html`. Also add the viz name to `vizs` in `harness-manifest.json` at the repo root. Both are required for the test harness — do not skip.

See [Step 5](#step-5-generate-test-harness-config-mandatory) for the full schema reference.

#### visualization_source.js — The Core Pattern

When creating a new viz, read `references/core-template.md` for the complete AMD module template. It includes all lifecycle methods (`initialize`, `getInitialDataParams`, `formatData`, `updateView`, `reflow`, `destroy`), the `_lastGoodData` caching pattern, `_status` sentinel handling, HiDPI canvas setup, and the `_drawStatusMessage` / `_ensureCanvas` helpers. Use it as the starting point — do not deviate from the structure.

## Critical Rules

1. **Use `var`, not `const`/`let`**. Webpack targets AMD for Splunk's RequireJS environment. Some Splunk versions run older JS engines. Stick with ES5 (`var`, `function`, `for` loops). No arrow functions, no template literals, no destructuring.

2. **Always handle HiDPI displays**. Set `canvas.width/height` to `rect.width * dpr` and call `ctx.scale(dpr, dpr)`. All drawing math uses the CSS pixel dimensions (`rect.width`, `rect.height`), NOT `canvas.width/height`.

3. **Never assume canvas is visible**. Check `rect.width > 0 && rect.height > 0` before drawing. Splunk may call `updateView` while the viz is hidden. This check is required in **every method that draws** — not just `updateView`, but also `_drawStatusMessage` and any other custom drawing methods.

4. **Always null-check `ctx`**. `canvas.getContext('2d')` can return null if the canvas is detached. Add `if (!ctx) return` after every `getContext('2d')` call — in `updateView`, `_drawStatusMessage`, and any other method that obtains a context.

5. **Reset `ctx.shadowBlur` after use**. Canvas shadow state leaks into subsequent draw calls if not explicitly reset to 0.

6. **Reset `ctx.globalAlpha` after use**. Same leaking behavior as shadows.

7. **`formatData` must return a plain object, not the raw `data`**. Returning the raw Splunk data object causes issues with Splunk's internal caching.

8. **Throw `SplunkVisualizationBase.VisualizationError`** for user-facing errors (missing columns, bad data). This displays a clean error in the Splunk UI instead of a silent failure.

9. **Settings from formatter come as strings**. Always parse: `parseInt(x, 10)` for integers, `parseFloat(x)` for floats, `=== 'true'` for booleans.

10. **Font usage: `sans-serif` for labels, `monospace` for numeric values, custom fonts via base64 embedding**. The default convention for system fonts is:
    - **`sans-serif`** for all labels, headings, badges, status text, no-data messages, legend text, axis labels, and any non-numeric text (e.g., `ctx.font = 'bold 12px sans-serif'`)
    - **`monospace`** only for numeric value readouts where digit alignment matters — temperatures, times, percentages, pressures, speeds, lap times, etc. (e.g., `ctx.font = 'bold 16px monospace'`)
    - Never use `monospace` for labels or descriptive text.

    For custom fonts, read `references/custom-fonts.md` — covers base64 embedding in `visualization.css`, centralised font management via `shared/fonts.css`, the `document.fonts.ready` wait pattern, `ctx.font` quoting pitfalls, and the harness-vs-Splunk OpenType feature leakage gotcha. Always include a system font fallback (e.g., `sans-serif`).

11. **JSON data files** (e.g., lookup tables, coordinate maps) can be placed next to `visualization.js` and loaded with `require('../filename.json')` — webpack will bundle them inline.

12. **No `this` in helper functions**. Keep drawing helpers as pure functions that take `ctx`, dimensions, and data as arguments. Only the four lifecycle methods (`initialize`, `getInitialDataParams`, `formatData`, `updateView`) plus `destroy` should use `this`.

13. **Animation timers**: Two approaches depending on animation style:
    - **`setInterval`** — for periodic state-driven redraws (e.g., flashing LEDs, blinking indicators). Use `this.invalidateReflow()` to trigger redraws. Store the timer ID on `this` and clear it in `destroy()`. Guard against creating duplicate timers.
    - **`requestAnimationFrame`** — for continuous smooth animation (e.g., flowing particles, scrolling tickers, conveyor belts). Store the frame ID on `this._animFrame`, cancel with `cancelAnimationFrame(this._animFrame)` in `destroy()`. Preferred for 60fps rendering as it syncs with the browser's refresh rate and avoids timer backlogs.

14. **XSS prevention with `SplunkVisualizationUtils`**. When inserting dynamic strings from search results into the DOM (innerHTML, text nodes, attributes), use `SplunkVisualizationUtils.escapeHtml(str)` to prevent XSS injection. This is **required** for Splunk certification. For dynamic URLs, use `SplunkVisualizationUtils.makeSafeUrl(url)` to strip unsafe schemes like `javascript:`. Canvas-only vizs that never touch the DOM with user data can skip this.

15. **Available `SplunkVisualizationUtils` helpers**:
    - `escapeHtml(str)` — encode strings for safe DOM insertion
    - `makeSafeUrl(url)` — strip unsafe URL schemes
    - `getCurrentTheme()` — returns `'dark'` or `'light'`
    - `normalizeBoolean(val)` — coerce string/int to boolean

16. **Invalidation methods** (do not override, call when needed):
    - `this.invalidateFormatData()` — re-run `formatData` on next cycle
    - `this.invalidateUpdateView()` — re-run `updateView` on next cycle
    - `this.invalidateReflow()` — re-run `reflow` on next cycle

17. **Additional lifecycle methods** (optional overrides):
    - `setupView()` — called once before the first `updateView`, useful for one-time DOM setup
    - `onConfigChange(configChanges, previousConfig)` — called when formatter settings change
    - `reflow()` — called when the container resizes; typically call `this.invalidateUpdateView()` here

18. **Configurable field names for shared searches**. In Splunk dashboards, a single base search often feeds multiple panels via post-process or shared results. When a viz only needs one or a few columns from a wide search, add a formatter setting (e.g., `field`) that lets the user specify which column to read. This avoids requiring users to create separate searches or rename columns. Pattern:

    **In formatter.html** (default should be a realistic column name, not a generic placeholder):
    ```html
    <splunk-control-group label="Field Name" help="Column name from your search (e.g. cpu_usage, response_time)">
        <splunk-text-input name="{{VIZ_NAMESPACE}}.field" value="count">
        </splunk-text-input>
    </splunk-control-group>
    ```

    **In formatData** — pass through colIdx and row, do NOT read config here (see rule 21):
    ```javascript
    var row = data.rows[data.rows.length - 1];
    return { colIdx: colIdx, row: row };
    ```

    **In updateView** — read the field name from config and extract the value:
    ```javascript
    var ns = this.getPropertyNamespaceInfo().propertyNamespace;
    var fieldName = config[ns + 'field'] || 'count'; // must match formatter default — see rule 19
    var rawVal = 0;
    if (data.colIdx[fieldName] !== undefined) {
        var v = parseFloat(data.row[data.colIdx[fieldName]]);
        if (!isNaN(v)) rawVal = v;
    }
    ```

    **In savedsearches.conf** (always include the field setting explicitly):
    ```
    display.visualizations.custom.{app_name}.{app_name}.field = count
    ```

    Use this pattern whenever the viz displays a single value (gauges, single-value displays) or a small subset of a larger search result. For vizs that consume many specific columns (like a multi-metric dashboard panel), hardcoded column names are fine.

19. **Formatter HTML defaults are NOT sent to the JS on first load**. The `value="..."` attribute on formatter inputs only takes effect after the user opens the Format panel and interacts with it. On initial render (and for saved searches without explicit settings), `config[ns + 'setting']` is `undefined`, so the JS `||` fallback is what actually runs. This means:
    - The JS default (`|| 'fallback'`) **must exactly match** the formatter HTML default (`value="fallback"`)
    - The `savedsearches.conf` must explicitly include every setting to avoid relying on defaults
    - Never use a generic fallback like `'value'` in JS if the formatter defaults to something else like `'speed'`
    - Test the viz with a fresh panel (no saved config) to verify defaults work correctly

20. **Real-time search handling**. Splunk real-time searches (`rt-1m` to `rt`) accumulate rows over time. The `count` in `getInitialDataParams` controls how many rows the viz receives, and `data.rows` is ordered oldest-first. This has two implications:

    **Always read the last row for latest-value vizs** (gauges, single-value displays):
    ```javascript
    // WRONG — reads the oldest row, goes stale as results accumulate
    var row = data.rows[0];

    // CORRECT — reads the most recent row
    var row = data.rows[data.rows.length - 1];
    ```

    **Size `count` appropriately for the viz type:**
    - Single-value / gauge vizs: `count: 50` — only needs the latest row, small buffer keeps updates snappy
    - Time-series / chart vizs: `count: 10000` — needs historical rows for plotting
    - Grid / table vizs: `count: 10000` — needs all rows for display

    For vizs that iterate all rows (charts, tables, maps), `data.rows[0]` through `data.rows[length-1]` is fine. But for vizs that display a single current value, always use `data.rows[data.rows.length - 1]`.

    **Use `VisualizationError` for the no-data state** (empty/missing rows). In Dashboard Studio v2, `return false` from `formatData` causes Splunk to show its own default grey bar chart placeholder and never call `updateView` — there is no way to display a custom message. Throwing `VisualizationError` is the **only** mechanism that works in Dashboard Studio v2 to show a meaningful "Awaiting data" message. For fully custom no-data rendering (custom fonts, emojis, styled text on canvas), use the `_status` field + SPL `appendpipe` pattern described in rule 27.

    **Cache last good data to prevent flashing**. In real-time searches, Splunk can briefly call `formatData` with empty `data.rows` between result batches. Without caching, this causes the "Awaiting data" error to flash momentarily even though data was flowing moments before. Fix: store the last successful `formatData` result on `this._lastGoodData` and return it when rows are temporarily empty. Only throw the error on the very first call (before any data has ever arrived):

    ```javascript
    initialize: function() {
        // ...
        this._lastGoodData = null;
    },

    formatData: function(data, config) {
        if (!data || !data.rows || data.rows.length === 0) {
            if (this._lastGoodData) return this._lastGoodData;
            throw new SplunkVisualizationBase.VisualizationError(
                'Awaiting data \u2014 {Viz Display Name}'
            );
        }

        // ... build result object ...
        var result = { colIdx: colIdx, row: row };
        this._lastGoodData = result;
        return result;
    }
    ```

    **Important:** Only cache-return for the empty-rows check. If `formatData` also validates required columns, that check should also return `_lastGoodData` before throwing, so a transient batch with missing columns doesn't flash an error:
    ```javascript
    if (colIdx.required_field === undefined) {
        if (this._lastGoodData) return this._lastGoodData;
        throw new SplunkVisualizationBase.VisualizationError('...');
    }
    ```

    **Cache in `updateView` too — not just `formatData`**. In Dashboard Studio, Splunk can pass `data = false` directly to `updateView` even when `formatData` returned cached data (e.g., when a chain/post-process search temporarily returns zero rows between result batches). Without a cache fallback in `updateView`, the viz goes blank with no error message. Always use this pattern:
    ```javascript
    updateView: function(data, config) {
        if (!data) {
            if (this._lastGoodData) { data = this._lastGoodData; }
            else { return; } // or draw a no-data placeholder
        }
        // ... rest of drawing code ...
    }
    ```
    This provides two layers of protection: `formatData` caching prevents `VisualizationError` flashing, and `updateView` caching prevents blank canvas flashing.

    **Do NOT throw `VisualizationError` for missing individual fields** in real-time vizs. When a real-time search first starts (or a playback begins), some fields may not exist in the initial results. For these transient missing-field cases, fall back to safe defaults so the viz renders immediately and updates as data arrives:
    ```javascript
    // WRONG — throws error for a single missing field
    if (isNaN(value)) {
        throw new SplunkVisualizationBase.VisualizationError('Column not found');
    }

    // CORRECT — renders immediately with 0, updates when data arrives
    if (isNaN(value)) {
        value = 0;
    }
    ```

21. **Never read `config` in `formatData`**. Splunk internally caches `formatData` results and the interaction between config-dependent formatData logic and Splunk's caching causes inconsistent update timing — some vizs update instantly while others stall for up to a minute on the same dashboard with the same search. Keep `formatData` a pure data-only pass-through:

    ```javascript
    // WRONG — reading config in formatData causes caching/timing issues
    formatData: function(data, config) {
        var ns = this.getPropertyNamespaceInfo().propertyNamespace;
        var fieldName = config[ns + 'field'] || 'speed';
        // ... extract value based on config ...
        return { value: value };
    }

    // CORRECT — formatData passes through data, updateView reads config
    formatData: function(data, config) {
        if (!data || !data.rows || data.rows.length === 0) {
            if (this._lastGoodData) return this._lastGoodData;
            throw new SplunkVisualizationBase.VisualizationError('Awaiting data');
        }
        var fields = data.fields;
        var colIdx = {};
        for (var i = 0; i < fields.length; i++) {
            colIdx[fields[i].name] = i;
        }
        var row = data.rows[data.rows.length - 1];
        return { colIdx: colIdx, row: row };
    }
    ```

    For multi-column vizs with hardcoded field names (no config dependency), you can extract values in `formatData` using `getVal(row, 'fieldName', 0)` — this is fine because the field names are constants, not config-dependent. The rule is: **no `config` access, no `this.getPropertyNamespaceInfo()` in `formatData`**.

22. **`savedsearches.conf.spec` must document every custom setting**. The `README/savedsearches.conf.spec` file in each viz app must list every `display.visualizations.custom.*` setting used in formatter.html and savedsearches.conf. Without this, `splunk btool check` reports "Invalid key" errors. If multiple viz apps are bundled into a single parent Splunk app, the spec entries from each viz must also be present in the parent app's `README/savedsearches.conf.spec`.

23. **Use `/_bump` to reload static assets without restarting Splunk**. After rebuilding `visualization.js`, navigate to `http://<splunk>:8000/en-US/_bump` (must be logged in) and click "Bump version". Then hard-refresh the browser (Cmd+Shift+R / Ctrl+Shift+R). This clears Splunk's static file cache without a restart. A restart is only needed when changing config files (`app.conf`, `visualizations.conf`, `savedsearches.conf`).

24. **Label settings: always offer alignment when a viz has a configurable label**. If a viz draws a title/label (e.g., a heading above a gauge or chart), provide a `labelAlign` formatter setting with left/center/right options. Reserve space for the label in the layout calculation so it doesn't collide with the viz content — shrink the viz area rather than overlapping:

    **In formatter.html:**
    ```html
    <splunk-control-group label="Label Align" help="Horizontal alignment of the label text">
        <splunk-radio-input name="{{VIZ_NAMESPACE}}.labelAlign" value="center">
            <option value="left">Left</option>
            <option value="center">Centre</option>
            <option value="right">Right</option>
        </splunk-radio-input>
    </splunk-control-group>
    ```

    **In updateView — reserve space in the layout, then draw at the top:**
    ```javascript
    var labelAlign = config[ns + 'labelAlign'] || 'center';
    var labelReserve = label ? 28 : 0; // shrink viz area to make room

    // Use labelReserve when calculating available height for the viz content
    var availH = h - labelReserve - otherPadding;

    // Draw label at the top of the panel
    if (label) {
        var labelFontSize = Math.max(8, Math.min(20, radius * 0.13));
        ctx.font = 'bold ' + labelFontSize + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textBaseline = 'top';
        ctx.textAlign = labelAlign;
        var lPad = Math.max(10, w * 0.04);
        var labelX = labelAlign === 'left' ? lPad : labelAlign === 'right' ? w - lPad : cx;
        ctx.fillText(label, labelX, 4);
    }
    ```

    The key principle: **reserve space first, draw later**. Don't try to squeeze the label into the gap between the viz and the panel edge — reduce the viz size to create a guaranteed gap.

25. **Drilldown from Canvas-based visualizations**. When the viz needs click-through to drill into data, read `references/drilldown.md` for the full hit-rect tracking pattern, click/hover handlers, Dashboard Studio drilldown configuration, and token format. Always document drilldown setup in the viz README.

26. **Use original ingested field names (no aliases required)**. Vizs must reference fields by the exact name used at indexing time. Never require users to rename fields with `as` aliases in SPL just to match a viz's hardcoded expectations. This keeps SPL straightforward (`latest(field_name) as field_name`) and prevents silent breakage from mismatched aliases. The only exceptions are:
    - **Display renames** in table-style vizs (e.g., `| rename status as Status`) where the column header is the user-facing label
    - **Computed/derived fields** that don't exist at ingestion (e.g., `eval delta = field_a - field_b`)

27. **Custom no-data message via `_status` field and SPL `appendpipe`**. In Dashboard Studio v2, the "Awaiting data" overlay (from `VisualizationError`) and the default placeholder (grey bar chart icon) are both rendered **outside** the viz's sandboxed iframe — CSS and JS inside the viz cannot hide or style them. The only way to display a fully custom no-data state is to ensure the search always returns at least one row.

    **SPL pattern** — append a fallback row with a `_status` field when the main search returns zero results:
    ```spl
    | appendpipe [| stats count | where count=0 | eval _status="Awaiting telemetry data", field1=0, field2=0]
    ```
    The `appendpipe` only produces a row when the main search has zero results (`where count=0`). When real data is flowing, it adds nothing. Include dummy values for required fields so `formatData` doesn't throw a column-missing error.

    **In `formatData`** — detect the `_status` field early and return a sentinel object:
    ```javascript
    // Check for status message from appendpipe fallback
    if (colIdx._status !== undefined) {
        var statusRow = data.rows[data.rows.length - 1];
        var statusVal = statusRow[colIdx._status];
        if (statusVal) {
            return { _status: statusVal };
        }
    }
    ```

    **In `updateView`** — intercept the sentinel before normal rendering:
    ```javascript
    if (data && data._status) {
        this._ensureCanvas();
        this._drawStatusMessage(data._status);
        return;
    }
    ```

    The `_ensureCanvas` and `_drawStatusMessage` methods are defined in the **core template** above. Key design points:
    - The text auto-scales down to fit 85% of the container width, preventing overflow on small panels
    - The emoji renders at full opacity above the dimmed text for visual hierarchy
    - The message string comes from the SPL `_status` field, so it can be changed without rebuilding the viz
    - If using a custom font (e.g., Formula1), replace `sans-serif` in `_drawStatusMessage` with the custom font family
    - `_ensureCanvas` is needed because `updateView` may be called before the canvas exists (e.g., on first load with the status fallback)

    **When NOT to use this pattern**: If the viz's SPL search uses `| stats` commands that always return a row (e.g., `| stats count` returns 0 instead of empty), Dashboard Studio will always pass data to the viz and the default placeholder never appears. In that case, `_status`/`appendpipe` is unnecessary.

28. **Dashboard Studio JSON: keep viz `options` empty**. When embedding custom visualizations in a Dashboard Studio v2 JSON dashboard, do NOT hardcode formatter settings in the viz's `options` block. Use empty options instead:

    ```json
    "viz_my_gauge": {
        "dataSources": { "primary": "ds_my_gauge" },
        "options": {},
        "title": "My Gauge",
        "type": "my_app.my_gauge"
    }
    ```

    **Why**: When a user changes a setting via the Format panel, Dashboard Studio writes a new fully-qualified key (e.g., `my_app.my_gauge.colorTheme: "neon"`) but does **not** remove the original short key (e.g., `colorTheme: "default"`). The viz JS reads `config[ns + 'colorTheme']` which resolves to the short key's stale value — the user's change is silently ignored. By starting with empty `options`, the only keys that exist are the ones the user explicitly sets, so there is no conflict.

    The viz's JS `||` fallbacks (e.g., `config[ns + 'colorTheme'] || 'default'`) handle the initial "no settings" state correctly — this is the same code path that runs on first load in Splunk (see rule 19).

29. **Text readability across all themes**. Every text element drawn on canvas must be readable regardless of the active theme or what's behind it (colored fills, glows, dark backgrounds):

    - **Use pure white (`#ffffff`) for all informational text** — labels, names, values, sub-text. White provides maximum contrast on dark dashboards and remains legible over colored fills. Never use theme-dependent text colors for text that overlays colored elements — they can be low-contrast in some themes.
    - **Reserve colour for meaning, not decoration** — only colour a value when the colour itself communicates status (e.g., green/yellow/red for thresholds). All other text stays white.
    - **Sub-text uses white at reduced opacity (`rgba(255,255,255,0.5)` minimum)** — never go below 50% opacity for text the user needs to read. 30% opacity is only acceptable for purely decorative text.
    - **Test every theme visually** — default, dark, and neon themes have very different background intensities. Text that's readable on default may vanish on neon.
    - **Per-theme colour palettes** must maintain the theme's visual identity. Neon theme should use neon-family colours (`#00ff88`, `#ffff00`, `#ff0066`) — not blues and purples that belong to the default theme.

30. **README.md must pass markdown linting**. Every generated `README.md` must be valid, well-formatted Markdown that passes standard linting (e.g., `markdownlint`). Specifically:

    - **Headings**: use ATX style (`#`), increment by one level only (`##` after `#`, not `####` after `##`), blank line before and after
    - **Lists**: consistent markers (`-` for unordered), blank line before the first item, proper indentation for nested lists
    - **Tables**: every pipe must have a space on both sides of content (`| Column | Type |` not `|Column|Type|`). Separator rows use `| --- | --- |` with spaces. Blank line before and after the table. Never omit spaces around pipes — this is a hard requirement
    - **Code blocks**: fenced with triple backticks, language identifier on opening fence (` ```spl `, ` ```bash `, ` ```json `), blank line before and after
    - **Line length**: no hard limit, but avoid excessively long lines in prose (code blocks and tables are exempt)
    - **Trailing whitespace**: none
    - **Final newline**: file ends with exactly one newline
    - **No bare URLs**: use `[text](url)` for links
    - **No HTML**: use Markdown equivalents

31. **Always use a Python virtual environment**. When running Python scripts (preview image generation, icon creation, data processing, or any task requiring `pip install`), **never install packages directly on the user's system**. Always create or reuse a virtual environment:

    ```bash
    # Create (first time)
    python3 -m venv .venv && source .venv/bin/activate && pip install Pillow

    # Reuse (subsequent times)
    source .venv/bin/activate
    ```

    - Never use `pip install --break-system-packages` or bare `pip install` outside a venv
    - If `.venv/` already exists in the repo, activate it rather than creating a new one
    - Add `.venv/` to the repo's `.gitignore` if not already present
    - The venv is a local development tool — it is never included in Splunk app tarballs

32. **Smooth real-time numeric values with a client-side tween.** Splunk real-time searches typically bin at 200 ms–1 s, so the viz receives a new sample roughly every half-second. Rendering raw values directly causes smooth-motion elements (needles, bars, rotations, positions) to snap between samples — visible jerkiness that undermines a live-data feel. For any viz where the data is numeric and continuous, decouple the render rate from the data rate with a client-side ease-out tween:

    - `updateView` stores the latest sample as a **target**, and snaps **current** to target on first sample so the viz doesn't sweep from 0 on dashboard load.
    - A short-lived `setInterval(16 ms)` or `requestAnimationFrame` loop lerps `current → target` with a frame-rate-independent ease-out:
      ```
      current += (target − current) × (1 − exp(−smoothness × dt))
      ```
    - Each tick redraws the viz using `current`. Idle-stop the timer when the value has settled for a few frames to save CPU; restart it from the next `updateView` that changes the target.
    - Expose a `smoothness` formatter setting (per-second follow speed). Default `8` closes ~95% of the gap within 500 ms — practically indistinguishable from a snap for sharp transitions but removes jitter during dwell. `0` disables tweening and restores snap behaviour.
    - Clear the timer in `destroy()`.

    **Choosing a smoothness value.** Smoothness is a rate constant, not a "level". Time to close 95% of the gap ≈ `3 / smoothness`. Dashboard Studio polls at ~1 Hz, so the tween's relationship to the poll interval matters:

    - **High values (`10`–`14`)** — settle time ~200–300 ms, well inside the 1 s poll window. The needle chases, then rests until the next sample. You will see a subtle 1 Hz pulse between "active chase" and "still" phases. Best for analysis/coaching views where sub-second accuracy matters.
    - **Default (`8`)** — ~375 ms settle. Compromise. Pulse is softer but still visible during sustained acceleration.
    - **Low values (`2`–`4`)** — settle time ~750 ms–1.5 s, *longer than* the poll interval. The tween never finishes before the next sample arrives, so motion is continuous across poll boundaries and the 1 Hz pulse disappears entirely. Trade-off: the displayed value lags reality by ~1 s. Best for atmospheric / broadcast-style HUDs where "looks like a live TV telemetry overlay" matters more than instantaneous accuracy.

    **Match smoothness across vizs on the same dashboard.** If one viz uses `smoothness=2` (cinematic lag) and another uses `smoothness=12` (responsive), related telemetry appears de-synced — the responsive one reacts first and the cinematic one trails, which reads as a bug. Pick one value per app and apply it as the default to every smoothing-enabled viz (JS initialiser, formatter input `value=`, and every `savedsearches.conf` example stanza).

    **When to apply:**

    - ✅ Continuous numerics: metrics, percentages, rates, utilisation, temperature, pressure, levels, rotation angles, 2D coordinates.
    - ❌ Discrete / categorical / boolean values: enum status, string states, on/off toggles, integer counts where increments matter.
    - ❌ Tables or ranked lists where row positions reorder between samples — tweening re-orderings reads as glitchy, not smooth.

    See the **Smoothing Between SPL Samples** recipe for the full implementation covering single-value tweens and multi-entity tweens keyed by identifier.

## Parallel Workflow (new vizs only)

Background agents run unattended and cannot prompt for permission. To avoid silent denials, do all permission-sensitive setup in the foreground first, then spawn background agents only for commands that are already allowed.

**Before spawning — run in foreground (main agent):**
1. Ensure the venv exists and Pillow is installed: `source .venv/bin/activate && pip install Pillow` — this may need user approval the first time
2. Run `npm install` in the viz directory — this may need approval if not yet allowed
3. Write all source files (Steps 1-2) and the `generate_preview.py` / icon generation scripts

**Then spawn two background agents in parallel:**

1. **Background: Image generation** — run `python3 generate_preview.py` and the icon generation scripts (already allowed via `Bash(python3:*)`). Delete the scripts after. No pip or venv activation needed — that was done in the foreground step.

2. **Background: Build** — run `npm run build` in the viz directory (requires `Bash(npm run:*)` in settings). Verify `visualization.js` was created.

While these run, the main agent should update `harness-manifest.json` (add to `vizs` and `categories`), then run the verification checklist (Step 4).

The project's `.claude/settings.json` auto-allows `python3`, `npm install`, `npm run`, and `./build.sh` — background agents inherit these permissions.

Do not try to parallelize file generation itself — the config files, formatter.html, JS defaults, and savedsearches.conf share settings names that must stay in sync. One agent keeping it all in context is more reliable than two trying to coordinate.

## Step 3: Generate Build Script

The repo uses a single shared `build.sh` at the root. **Do not generate per-viz build scripts** — use the existing `build.sh` instead. Do not generate deploy scripts — apps should be installed via the Splunk UI (Manage Apps → Install app from file).

### Usage

```bash
# Build a specific viz app
./build.sh {app_name}

# Build all viz apps in examples/
./build.sh
```

Output tarballs go to `dist/{app_name}-{version}.tar.gz`.

### What build.sh does

1. **npm install** — installs dependencies if `node_modules/` is missing
2. **webpack build** — bundles `src/visualization_source.js` into `visualization.js`
3. **Font CSS** — if `shared/fonts.css` exists and the viz's `visualization.css` doesn't already contain `@font-face`, prepends the shared font CSS (then restores the source file after packaging)
4. **Package tarball** — creates a tar.gz excluding dev files (`.*`, `node_modules/`, `src/`, `package.json`, `webpack.config.js`, `__pycache__/`, `*.pyc`)

The build script handles macOS-specific tar flags (`--disable-copyfile`, `--no-xattrs`, `xattr -rc`) automatically.

## Common Canvas 2D Recipes

For drawing helpers (color scales, rounded rects, arcs, legends, grids, responsive text, hit testing), read `references/canvas-recipes.md`.

For smooth real-time animation (client-side tweening between SPL samples), read `references/smoothing.md`. This covers both single-value tweens (gauges, needles) and per-entity position tweens (moving items on a map), with the full timer/cleanup implementation.

## Splunk Design Guidelines Reference

For chart-style vizs that use axes, legends, gridlines, or tooltips, read `references/design-guidelines.md` for official Splunk font stacks, color palettes (semantic, categorical, sequential, divergent), spacing constants, description best practices, and responsive design guidance. Canvas-only vizs (gauges, status boards) can skip this — use `sans-serif` and `monospace` per rule 10.

## Viz Type Guidance

When the user describes what they want, map their description to one of these common viz categories and tailor the scaffolding accordingly:

| Viz Type | Key Canvas Patterns | Typical SPL Columns |
|----------|-------------------|-------------------|
| **Gauge / Meter** | Arcs, gradients, centered text | `label, value, min, max` |
| **Heatmap / Grid** | Grid layout, color scales, cell text | `row, col, value` |
| **Network Graph** | Lines between nodes, circles, labels | `source, dest, value` |
| **Status Board** | Rounded rects, color-coded cells, icons | `name, status, detail` |
| **Timeline / Gantt** | Horizontal bars, time axis, labels | `_time, task, duration, status` |
| **Map / Floor Plan** | Coordinate plotting, background image, markers | `x, y, label, value` |
| **Bar / Column** | Filled rects, axis lines, labels | `category, value` |
| **Radial / Donut** | Arc segments, center text, legend | `label, value` |

For any viz type, always include a "no data" state. Ask the user whether they want a custom canvas-rendered message (rule 27 `_status` pattern) or the default Dashboard Studio placeholder (`VisualizationError`). If custom, the message text is defined in the SPL `appendpipe` fallback and rendered by `_drawStatusMessage`.

## Step 4: Verify Completeness

**For new vizs**, verify all files are generated. **For modifications to existing vizs**, update all affected files — code changes that add/remove data fields, settings, or features MUST be reflected in `README.md`, `savedsearches.conf`, `savedsearches.conf.spec`, `harness.json`, and `formatter.html`. Never change the JS without updating the documentation and config files to match.

Before presenting the generated code, verify:

- [ ] `README.md` exists with description, install, columns, search, configuration, drilldown (if applicable), time range, and build sections
- [ ] All files in the directory structure are generated
- [ ] `app.conf` has `[id]` stanza with `name` and `version` (required for Splunk Cloud vetting)
- [ ] `app.conf` does NOT have a `[triggers]` stanza for `visualizations.conf` (it is a Splunk-defined conf, not a custom one)
- [ ] `app.conf` package ID matches the directory name
- [ ] `app.conf` version is consistent across `[id]` and `[launcher]` stanzas
- [ ] `visualizations.conf` stanza name matches the directory name
- [ ] `visualizations.conf` label ≤30 chars, description ≤80 chars, search_fragment ≤80 chars
- [ ] `visualizations.conf` description uses active voice focusing on user tasks (not visual appearance)
- [ ] `savedsearches.conf` custom type follows pattern `{app_name}.{app_name}`
- [ ] `savedsearches.conf.spec` documents every setting in formatter.html
- [ ] `formatter.html` setting names use `{{VIZ_NAMESPACE}}.{setting}`
- [ ] `visualization_source.js` uses ES5 syntax only (var, function, for)
- [ ] `visualization_source.js` handles HiDPI, null ctx, zero-size canvas
- [ ] `visualization_source.js` formatData validates required columns and throws VisualizationError
- [ ] If custom no-data message requested: `formatData` detects `_status` field, `updateView` intercepts it, `_ensureCanvas` and `_drawStatusMessage` methods exist
- [ ] `visualization.css` exists (transparent background by default)
- [ ] `metadata/default.meta` exists with global `[]` access stanza, `export = system`, and `sc_admin` in all write ACLs (required for Splunk Cloud)
- [ ] `savedsearches.conf` uses historical time ranges (no `rt-*` / `rt` — rejected by Splunk Cloud vetting)
- [ ] `static/` contains all four app icons: `appIcon.png` (36x36), `appIcon_2x.png` (72x72), `appIconAlt.png` (36x36), `appIconAlt_2x.png` (72x72)
- [ ] `preview.png` exists (116×76px) in `appserver/static/visualizations/{app_name}/` — fills full area with recognizable viz representation
- [ ] `harness.json` exists alongside `formatter.html` with correct fields, formatter defaults (matching JS defaults), data mode, and sampleRows as strings
- [ ] Viz name added to `vizs` and appropriate `categories` group in `harness-manifest.json`
- [ ] `.gitignore` excludes `node_modules`
- [ ] **If modifying an existing viz**: `README.md` updated to reflect new/changed columns, settings, and features
- [ ] **If modifying an existing viz**: `savedsearches.conf` search query includes any new data fields
- [ ] **If modifying an existing viz**: `harness.json` updated with new field controls and data columns

## Step 5: Generate Test Harness Config (MANDATORY)

Every new viz MUST have a `harness.json` file and be added to `harness-manifest.json`. When modifying an existing viz, update its `harness.json` to match.

Every viz app includes a `harness.json` file that enables local browser testing without deploying to Splunk. A generic `test-harness.html` (containing zero viz-specific code) reads these files and renders any viz with interactive controls.

### harness-manifest.json

A single manifest at the project root registers all vizs and optional shared config:

```json
{
  "fontCSS": "shared/fonts.css",
  "pathTemplate": "examples/{name}/appserver/static/visualizations/{name}",
  "categories": {
    "Splunk": ["splunk_status_board", "license_gauge"],
    "General": ["gauge", "custom_single_value"]
  },
  "vizs": [
    "splunk_status_board",
    "license_gauge",
    "gauge",
    "custom_single_value"
  ]
}
```

- `fontCSS` (optional): path to a shared CSS file with `@font-face` declarations. Loaded once when any viz is selected.
- `pathTemplate` (optional): URL path pattern to locate each viz's files. `{name}` is replaced with the viz name. Defaults to `{name}/appserver/static/visualizations/{name}` if omitted. Use this when viz apps live under a subdirectory (e.g., `examples/`) or when the repo layout differs from the standard flat structure.
- `categories` (optional): groups vizs into themed sections in the harness picker dropdown. Keys are category names, values are arrays of viz names. If omitted, the harness shows all vizs in a single "All" group. When adding a new viz, add it to both `vizs` and the appropriate category.
- `vizs`: array of viz app directory names. The harness loads `{pathTemplate}/harness.json` for each.

### harness.json

Located alongside `formatter.html` in each viz's directory. Defines everything the test harness needs to render the viz with interactive controls.

```json
{
  "label": "My Visualization",
  "defaultSize": { "width": 600, "height": 400 },
  "noDataMessage": "Awaiting data",
  "dependencies": ["track_splines.json"],
  "fields": [
    { "name": "speed", "label": "Speed", "type": "slider", "min": 0, "max": 380, "step": 1, "default": 285 },
    { "name": "mode", "label": "Mode", "type": "select", "options": [{"v": "0", "l": "Off"}, {"v": "1", "l": "On"}], "default": "0" },
    { "name": "host", "label": "Host", "type": "text", "default": "rig_1" }
  ],
  "formatter": [
    { "name": "colorScheme", "label": "Color Scheme", "type": "select", "options": ["speed", "rpm"], "default": "speed" },
    { "name": "showGlow", "label": "Show Glow", "type": "radio", "options": ["true", "false"], "default": "true" },
    { "name": "accentColor", "label": "Accent Color", "type": "color", "default": "#ff8700" },
    { "name": "maxValue", "label": "Max Value", "type": "text", "default": "320" }
  ],
  "data": {
    "mode": "single_row",
    "columns": ["speed", "host"],
    "dynamicColumnName": { "column": "speed", "configKey": "field" }
  }
}
```

### Schema Reference

**Top-level keys:**

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `label` | string | Yes | Human-readable name shown in the viz picker dropdown |
| `defaultSize` | `{ width, height }` | No | Default panel dimensions in pixels when the viz is selected |
| `noDataMessage` | string | No | Custom message shown when "Test No Data" is clicked. Falls back to "No data available" |
| `dependencies` | string[] | No | JSON files to preload (e.g., `["track_splines.json"]`). Loaded from the viz root dir, registered in the AMD module cache as `../{filename}` and `./{filename}` |
| `fields` | array | Yes | Data field controls shown in the sidebar (see below) |
| `formatter` | array | Yes | Formatter setting controls matching the viz's `formatter.html` (see below) |
| `data` | object | Yes | Defines how Splunk-format data is constructed (see below) |

**Field types** (`fields` array):

| Type | Properties | Description |
|------|-----------|-------------|
| `slider` | `min`, `max`, `step`, `default` | Range input with live value display |
| `select` | `options`, `default` | Dropdown. Options can be strings (`"opt"`) or objects (`{"v": "0", "l": "Off"}`) |
| `text` | `default` | Free text input |

Optional field properties:
- `transform`: `"divide100"` — divides the value by 100 before inserting into the data row (e.g., steer input -100..100 → -1.0..1.0)

Fields whose names start with `_` (e.g., `_numDrivers`, `_preset`) are control fields — they influence data generation but are not inserted as columns.

**Formatter types** (`formatter` array):

| Type | Properties | Description |
|------|-----------|-------------|
| `radio` | `options` (string[]), `default` | Toggle buttons |
| `select` | `options`, `default` | Dropdown |
| `color` | `default` | Color picker + hex text input |
| `text` | `default` | Free text input |

Formatter setting names must match the suffixes used in `formatter.html` (e.g., `colorScheme` maps to `config[ns + 'colorScheme']` in the viz JS). Defaults must match the JS fallback values (rule 19).

**Data modes** (`data` object):

Two generic modes — the harness has no domain-specific code:

**`single_row`** — builds one row from field values. Used for gauges, single-value displays, and any viz that reads `data.rows[data.rows.length - 1]`.

```json
{
  "mode": "single_row",
  "columns": ["speed", "gear", "rev_lights_percent"],
  "dynamicColumnName": { "column": "speed", "configKey": "field" }
}
```

- `columns`: array of column names. Each column's value comes from the matching field's current value.
- `dynamicColumnName` (optional): renames a column based on a formatter setting. Used when the viz has a configurable "Field Name" setting (rule 18). Pass `{}` (empty object) to explicitly disable dynamic column renaming.

**Important**: In `single_row` mode, every column in `columns` **must** have a corresponding entry in the top-level `fields` array with a `default` value. The harness builds the data row from `fields[].default` — if a column has no matching field, its value is `'0'`. Unlike `multi_row` mode (which reads from `sampleRows`), `single_row` mode does NOT use `sampleRows` as a fallback. Always provide slider, text, or select fields for every column.

**`multi_row`** — passes pre-defined sample rows. Used for charts, tables, maps, and any viz that iterates `data.rows`.

```json
{
  "mode": "multi_row",
  "columns": ["position", "driver", "lap_time", "delta"],
  "rowCountField": "_numDrivers",
  "sampleRows": [
    ["1", "L. Norris", "1:22.580", "0"],
    ["2", "O. Piastri", "1:23.100", "0.520"]
  ]
}
```

- `columns`: array of column names (defines the field schema).
- `sampleRows`: array of row arrays. Each row is an array of **strings** (Splunk always passes strings).
- `rowCountField` (optional): name of a `_`-prefixed slider field that controls how many rows to show (slices from the start).
- `relativeTimeColumn` (optional): string — column name whose values are treated as relative time offsets in seconds. The harness converts them to `Date.now()/1000 - value`, producing realistic absolute Unix timestamps for time-series vizs.
- **Column overrides**: when a non-`_` field name matches a column name, the slider value replaces that column's value in every row. This lets users change a value (e.g., `track_id`) across all sample rows interactively.

### Usage

To test locally:

```bash
cd splunk_app && python3 -m http.server 8080
```

Open `http://localhost:8080/test-harness.html`. Select a viz from the dropdown. Adjust data fields and formatter settings — the canvas re-renders in real-time.

### Adding a new viz to the harness

**Do this as part of every scaffolding — it is not a separate or optional step.**

1. Create `examples/{name}/appserver/static/visualizations/{name}/harness.json`
2. Add `"{name}"` to the `vizs` array and the appropriate `categories` group in `harness-manifest.json` (at the repo root, next to `test-harness.html`)

No changes to `test-harness.html` are needed — it discovers everything from JSON.

## Step 6: Scaffold a Dashboard Studio App (Optional)

When the user asks to scaffold a Dashboard Studio app that bundles multiple custom vizs, read `references/dashboard-studio-app.md` for the full directory structure, file templates, build pipeline, and namespace guidance.

