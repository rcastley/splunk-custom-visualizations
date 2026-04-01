name: splunk-viz
description: Scaffold and build Splunk custom visualizations using Canvas 2D
---

You are an expert Splunk developer specializing in custom visualizations built with the Splunk Visualization Framework (Canvas 2D rendering, AMD modules, webpack). You generate production-ready code, not prototypes.

## When to Use

Use this skill when the user asks to:
- Create a new Splunk custom visualization app
- Add features to an existing Splunk custom viz
- Debug or fix a Splunk custom visualization
- Generate build/deploy scripts for a Splunk viz app
- Scaffold a Splunk Dashboard Studio app with custom visualization support

## Architecture Overview

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
3. **Display label**: human-readable name for the Splunk UI (e.g., "Network Graph", "Heatmap Grid").
4. **Description**: one-line description of what the visualization does.
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
| **`check_meta_default_write_access`** | Global `[]` stanza in `default.meta` is mandatory | Recommended | Include |

When generating files, apply the constraints from the user's chosen platform column. The templates in this skill default to the **Both** column.

## Step 2: Generate the App

### Directory Structure

Every viz app follows this exact layout — do not deviate:

```
{app_name}/
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
          visualization.css       (transparent background by default)
          webpack.config.js
          package.json
          harness.json            (test harness config — fields, formatter, sample data)
          .gitignore              (excludes node_modules)
```

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
```
node_modules
```

### visualization_source.js — The Core Pattern

This is the most important file. Follow this exact AMD module structure:

```javascript
/*
 * {Display Label} — Splunk Custom Visualization
 *
 * {Brief description of what it renders.}
 *
 * Expected SPL columns: {list columns}
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper functions (pure, no `this`) ──────────────────────

    // Place all utility functions here: color math, formatting,
    // coordinate transforms, drawing primitives, etc.

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('{app-name}-viz');

            // Create canvas element
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            // Internal state (non-config)
            // e.g., this._cachedBounds = null;
            this._lastGoodData = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000  // see rule 20 for real-time sizing guidance
            };
        },

        formatData: function(data, config) {
            // Keep formatData lightweight — see rule 21.
            // Build column index and pass through row data.
            // Do NOT read config here — field selection belongs
            // in updateView to avoid Splunk caching issues.

            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 {Viz Display Name}'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for status message from appendpipe fallback (see rule 27)
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Helper to safely parse numeric values
            function getVal(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                var v = parseFloat(row[colIdx[name]]);
                return isNaN(v) ? fallback : v;
            }

            function getStr(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                return row[colIdx[name]] || fallback;
            }

            var row = data.rows[data.rows.length - 1];

            // Option A: Multi-column viz (hardcoded fields)
            // var result = {
            //     value1: getVal(row, 'field1', 0),
            //     value2: getStr(row, 'field2', '')
            // };

            // Option B: Configurable field viz (field chosen in updateView)
            var result = { colIdx: colIdx, row: row };

            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Main render method. Called whenever data or config changes.
            //
            // MUST handle:
            //   1. data === false (no data) — use cached data or show placeholder
            //   2. Canvas sizing with devicePixelRatio for sharp rendering
            //   3. Reading user settings from config
            //   4. Full canvas redraw (clear + draw)

            // Custom no-data message from appendpipe fallback (see rule 27)
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read user settings ──
            // IMPORTANT: The || fallback values below MUST match the
            // default values in formatter.html. Splunk does not send
            // formatter defaults to JS until the user interacts with
            // the Format panel. See rule 19.
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var setting1 = config[ns + '{setting1}'] || '{default1}';
            // parseFloat/parseInt for numeric settings
            // === 'true' for boolean settings from radio inputs

            // ── Size canvas for HiDPI ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            var w = rect.width;
            var h = rect.height;

            // ── Clear canvas (transparent — inherits dashboard background) ──
            ctx.clearRect(0, 0, w, h);

            // ... all Canvas 2D drawing code here ...
            // Use w, h for layout calculations
            // Use data (the object returned by formatData)
            // NOTE: Do NOT fill the canvas with an opaque background color
            // unless the user explicitly requests it. Transparent is the default.
        },

        // ── Custom no-data message support (see rule 27) ──

        _ensureCanvas: function() {
            if (!this.canvas) {
                this.el.innerHTML = '';
                this.canvas = document.createElement('canvas');
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.style.display = 'block';
                this.el.appendChild(this.canvas);
            }
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
        },

        _drawStatusMessage: function(message) {
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var ctx = this.canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            // Scale font down if text overflows container
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            // Optional emoji icon above text (full opacity)
            // Replace the emoji string with any relevant Unicode emoji
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u23F3', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji (dimmed)
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        // Optional: clean up timers, event listeners
        destroy: function() {
            // Clear any setInterval/setTimeout references
            // if (this._timer) { clearInterval(this._timer); this._timer = null; }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
```

## Critical Rules for visualization_source.js

1. **Use `var`, not `const`/`let`**. Webpack targets AMD for Splunk's RequireJS environment. Some Splunk versions run older JS engines. Stick with ES5 (`var`, `function`, `for` loops). No arrow functions, no template literals, no destructuring.

2. **Always handle HiDPI displays**. Set `canvas.width/height` to `rect.width * dpr` and call `ctx.scale(dpr, dpr)`. All drawing math uses the CSS pixel dimensions (`rect.width`, `rect.height`), NOT `canvas.width/height`.

3. **Never assume canvas is visible**. Check `rect.width > 0 && rect.height > 0` before drawing. Splunk may call `updateView` while the viz is hidden.

4. **Always null-check `ctx`**. `canvas.getContext('2d')` can return null if the canvas is detached.

5. **Reset `ctx.shadowBlur` after use**. Canvas shadow state leaks into subsequent draw calls if not explicitly reset to 0.

6. **Reset `ctx.globalAlpha` after use**. Same leaking behavior as shadows.

7. **`formatData` must return a plain object, not the raw `data`**. Returning the raw Splunk data object causes issues with Splunk's internal caching.

8. **Throw `SplunkVisualizationBase.VisualizationError`** for user-facing errors (missing columns, bad data). This displays a clean error in the Splunk UI instead of a silent failure.

9. **Settings from formatter come as strings**. Always parse: `parseInt(x, 10)` for integers, `parseFloat(x)` for floats, `=== 'true'` for booleans.

10. **Font usage: `sans-serif` for labels, `monospace` for numeric values, custom fonts via base64 embedding**. The default convention for system fonts is:
    - **`sans-serif`** for all labels, headings, badges, status text, no-data messages, legend text, axis labels, and any non-numeric text (e.g., `ctx.font = 'bold 12px sans-serif'`)
    - **`monospace`** only for numeric value readouts where digit alignment matters — temperatures, times, percentages, pressures, speeds, lap times, etc. (e.g., `ctx.font = 'bold 16px monospace'`)
    - Never use `monospace` for labels or descriptive text.

    **Custom fonts via base64 embedding in `visualization.css`**. Splunk custom vizs cannot reliably load custom fonts via the JavaScript FontFace API, external CSS `@font-face` URL references, or relative `url()` paths to font files. Only base64-encoding the font directly into the CSS works reliably — Splunk loads `visualization.css` when the viz renders, registering the `@font-face` for both DOM and Canvas 2D contexts. This approach is practical for fonts under ~50KB per weight (woff2 format).

    **Centralised font management**: To avoid duplicating the base64 font data across every viz, store a shared CSS file (e.g., `shared/fonts.css`) containing the `@font-face` declarations and have the build script prepend it to each viz's `visualization.css` during packaging. The source CSS stays clean; the packaged output is self-contained:

    **In `shared/fonts.css`** — the single source of truth:
    ```css
    @font-face {
        font-family: 'CustomFont';
        src: url(data:font/woff2;base64,{BASE64_ENCODED_FONT_DATA}) format('woff2');
        font-weight: bold;
        font-style: normal;
        font-display: swap;
    }
    ```

    **In each viz's `visualization.css`** (source) — just the viz styles, no font:
    ```css
    .{app-name}-viz {
        background: transparent;
    }
    ```

    **In `build.sh`** — prepend font CSS before packaging, restore source after:
    ```bash
    if [ -f "$FONT_CSS" ] && [ -f "$VIZ_CSS" ] && ! grep -q "@font-face" "$VIZ_CSS"; then
        ORIGINAL_CSS=$(cat "$VIZ_CSS")
        cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp" && mv "$VIZ_CSS.tmp" "$VIZ_CSS"
        CSS_MODIFIED=true
    fi
    # ... tar packaging ...
    if [ "$CSS_MODIFIED" = true ]; then echo "$ORIGINAL_CSS" > "$VIZ_CSS"; fi
    ```

    To generate the base64 string: `base64 -i FontFile.woff2 | tr -d '\n'`

    **In `visualization_source.js`** — wait for the font to load before first draw using `document.fonts.ready`:
    ```javascript
    initialize: function() {
        // ... canvas setup ...
        this._fontReady = false;
        this._fontCheckDone = false;
    },

    updateView: function(data, config) {
        if (!this._fontReady && !this._fontCheckDone) {
            this._fontCheckDone = true;
            var self = this;
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function() {
                    self._fontReady = true;
                    self.invalidateUpdateView();
                });
            } else {
                setTimeout(function() {
                    self._fontReady = true;
                    self.invalidateUpdateView();
                }, 200);
            }
            return;
        }
        // ... rest of drawing code using 'CustomFont', sans-serif ...
    }
    ```

    Then use the font in Canvas drawing: `ctx.font = "bold 24px \"CustomFont\", sans-serif"`

    **Important: quoting in `ctx.font` strings**. The font family name must be quoted inside the `ctx.font` value, but JavaScript string quoting conflicts with this. Use escaped double quotes inside single-quoted JS strings:
    ```javascript
    // WRONG — nested single quotes break the JS string
    ctx.font = '700 ' + size + 'px \'CustomFont\', sans-serif';

    // WRONG — replace-all of 'sans-serif' → '\'CustomFont\', sans-serif' produces broken syntax
    ctx.font = '700 ' + size + 'px 'CustomFont', sans-serif';

    // CORRECT — escaped double quotes inside single-quoted string
    ctx.font = '700 ' + size + 'px "CustomFont", sans-serif';

    // CORRECT — store font family in a variable (avoids quoting issues entirely)
    var fontFamily = "'CustomFont', sans-serif";
    ctx.font = '700 ' + size + 'px ' + fontFamily;
    ```

    The variable approach is safest — define `var fontFamily = "'CustomFont', sans-serif"` once and concatenate it everywhere. This avoids quoting errors when doing bulk find-and-replace across vizs.

    Always include a system font fallback (e.g., `sans-serif`) so the viz renders legibly if the embedded font fails to load.

11. **JSON data files** (e.g., lookup tables, coordinate maps) can be placed next to `visualization.js` and loaded with `require('../filename.json')` — webpack will bundle them inline.

12. **No `this` in helper functions**. Keep drawing helpers as pure functions that take `ctx`, dimensions, and data as arguments. Only the four lifecycle methods (`initialize`, `getInitialDataParams`, `formatData`, `updateView`) plus `destroy` should use `this`.

13. **Flash/animation timers**: If the viz needs animation (e.g., flashing LEDs), use `setInterval` with `this.invalidateReflow()` to trigger redraws. Always store the timer ID on `this` and clear it in `destroy()`. Guard against creating duplicate timers.

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

    This pattern ensures:
    - First load with no data: shows "Awaiting data" message (correct)
    - Data flowing: renders normally (correct)
    - Brief gap between batches: keeps showing last known data instead of flashing error (correct)

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
        if (!data || !data.rows || data.rows.length === 0) return false;
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

25. **Drilldown from Canvas-based visualizations**. Splunk custom vizs can fire drilldown events when the user clicks a data element. For Canvas vizs, this requires: (a) tracking which canvas regions map to data, (b) listening for click events, and (c) calling `this.drilldown()` with the correct payload.

    **In `initialize` — set up click and hover handlers:**
    ```javascript
    initialize: function() {
        // ... canvas setup ...
        this._hitRects = [];
        this._drilldownField = 'name'; // updated in updateView from config

        var self = this;
        this.canvas.addEventListener('click', function(event) {
            if (!self._hitRects || self._hitRects.length === 0) return;

            var canvasRect = self.canvas.getBoundingClientRect();
            var clickX = event.clientX - canvasRect.left;
            var clickY = event.clientY - canvasRect.top;

            for (var i = 0; i < self._hitRects.length; i++) {
                var t = self._hitRects[i];
                if (clickX >= t.x && clickX <= t.x + t.w &&
                    clickY >= t.y && clickY <= t.y + t.h) {
                    var drilldownData = {};
                    drilldownData[self._drilldownField] = t.name;
                    event.preventDefault();
                    self.drilldown({
                        action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                        data: drilldownData
                    }, event);
                    break;
                }
            }
        });

        // Pointer cursor on hover
        this.canvas.addEventListener('mousemove', function(event) {
            var canvasRect = self.canvas.getBoundingClientRect();
            var mx = event.clientX - canvasRect.left;
            var my = event.clientY - canvasRect.top;
            var over = false;
            for (var i = 0; i < self._hitRects.length; i++) {
                var t = self._hitRects[i];
                if (mx >= t.x && mx <= t.x + t.w &&
                    my >= t.y && my <= t.y + t.h) {
                    over = true;
                    break;
                }
            }
            self.canvas.style.cursor = over ? 'pointer' : 'default';
        });
    }
    ```

    **In `updateView` — store hit rects during drawing:**
    ```javascript
    this._drilldownField = config[ns + 'fieldName'] || 'name';
    this._hitRects = [];

    // While drawing each element:
    this._hitRects.push({
        x: elementX, y: elementY, w: elementW, h: elementH,
        name: dataValue  // the value to pass in the drilldown
    });
    ```

    **Dashboard Studio drilldown configuration** (required — Studio has no default drilldown action):

    The visualization fires the event, but Dashboard Studio requires the user to configure a drilldown action on the panel:
    1. Select the panel → open **Drilldown** settings
    2. Click **+ Add Drilldown** → set action to **Link to search**
    3. Use `$row.<fieldname>.value$` as the drilldown token (where `<fieldname>` matches the key in the `drilldownData` object)

    Example drilldown search for a component status board:
    ```spl
    index=_internal sourcetype=splunkd component="$row.component.value$" (log_level=ERROR OR log_level=WARN)
    ```

    **Important**: Always quote the token in SPL (`"$row.field.value$"`) because values may contain special characters like colons.

    In Classic SimpleXML dashboards, the default drilldown behaviour (open in Search) works automatically without additional configuration.

    **Document drilldown setup in the viz README** — always include a "Drilldown" section explaining the token format and example search, since Dashboard Studio users must configure it manually.

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

    **`_drawStatusMessage` method** — renders the message centered on the canvas with auto-scaling text and an optional emoji icon above it:
    ```javascript
    _ensureCanvas: function() {
        if (!this.canvas) {
            this.el.innerHTML = '';
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);
        }
        var rect = this.el.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
    },

    _drawStatusMessage: function(message) {
        var rect = this.el.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        var ctx = this.canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        var w = rect.width;
        var h = rect.height;
        ctx.clearRect(0, 0, w, h);

        var maxTextW = w * 0.85;
        var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
        var emojiSize = Math.round(fontSize * 1.6);
        var gap = fontSize * 0.5;

        ctx.font = '500 ' + fontSize + 'px sans-serif';
        while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
            fontSize -= 1;
            emojiSize = Math.round(fontSize * 1.6);
            ctx.font = '500 ' + fontSize + 'px sans-serif';
        }

        // Emoji above text, full opacity (use any relevant Unicode emoji)
        ctx.font = emojiSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.fillText('\u23F3', w / 2, h / 2 - fontSize * 0.5 - gap);

        // Message text below emoji, dimmed
        ctx.font = '500 ' + fontSize + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
    ```

    **Key design points:**
    - The text auto-scales down to fit 85% of the container width, preventing overflow on small panels
    - The emoji renders at full opacity above the dimmed text for visual hierarchy
    - The message string comes from the SPL `_status` field, so it can be changed without rebuilding the viz
    - If using a custom font (e.g., Formula1), replace `sans-serif` in the `_drawStatusMessage` with the custom font family
    - The `_ensureCanvas` helper is needed because `updateView` may be called before the canvas exists (e.g., on first load with the status fallback)

    **When NOT to use this pattern**: If the viz's SPL search uses `| stats` commands that always return a row (e.g., `| stats count` returns 0 instead of empty), Dashboard Studio will always pass data to the viz and the default placeholder never appears. In that case, `_status`/`appendpipe` is unnecessary.

## Step 3: Generate Build Script

Generate one build shell script per viz. **Do not generate deploy scripts** — apps should be installed via the Splunk UI (Manage Apps → Install app from file).

### build-{name}.sh
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/{app_name}"
VIZ_DIR="$APP_DIR/appserver/static/visualizations/{app_name}"
APP_NAME="{app_name}"
OUTPUT_DIR="$SCRIPT_DIR"

VERSION=$(grep '^version' "$APP_DIR/default/app.conf" | cut -d= -f2 | tr -d ' ')
TARBALL="$OUTPUT_DIR/${APP_NAME}-${VERSION}.tar.gz"

echo "=== {Display Label} Splunk App Builder ==="
echo "Version: $VERSION"
echo ""

if [ ! -d "$VIZ_DIR/node_modules" ]; then
    echo "[1/3] Installing npm dependencies..."
    (cd "$VIZ_DIR" && npm install)
else
    echo "[1/3] Dependencies already installed, skipping."
fi

echo "[2/3] Building visualization bundle..."
(cd "$VIZ_DIR" && npm run build)

echo "[3/3] Packaging $TARBALL..."
xattr -rc "$APP_DIR" 2>/dev/null || true

COPYFILE_DISABLE=1 tar --disable-copyfile --no-xattrs --no-mac-metadata \
    --exclude='.*' --exclude='._*' --exclude='__MACOSX' \
    --exclude="$APP_NAME/appserver/static/visualizations/{app_name}/node_modules" \
    --exclude="$APP_NAME/appserver/static/visualizations/{app_name}/src" \
    --exclude="$APP_NAME/appserver/static/visualizations/{app_name}/package.json" \
    --exclude="$APP_NAME/appserver/static/visualizations/{app_name}/package-lock.json" \
    --exclude="$APP_NAME/appserver/static/visualizations/{app_name}/webpack.config.js" \
    -cvzf "$TARBALL" \
    -C "$SCRIPT_DIR" \
    "$APP_NAME"

echo ""
echo "Done! Install with:"
echo "  \$SPLUNK_HOME/bin/splunk install app $TARBALL"
```

## Common Canvas 2D Recipes

When the user's requirements match one of these common patterns, use these recipes as a starting point for the drawing code in `updateView`.

### Color Scales
```javascript
// Linear interpolation between two hex colors
function lerpColor(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

// Map a value to a color on a gradient (low → mid → high)
function valueToColor(val, min, max, lowColor, midColor, highColor) {
    var t = Math.max(0, Math.min(1, (val - min) / (max - min)));
    if (t <= 0.5) return lerpColor(lowColor, midColor, t * 2);
    return lerpColor(midColor, highColor, (t - 0.5) * 2);
}
```

### Rounded Rectangles
```javascript
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
```

### Arcs / Gauges
```javascript
function drawArc(ctx, cx, cy, radius, startDeg, endDeg, color, lineWidth) {
    var startRad = (startDeg - 90) * Math.PI / 180;
    var endRad = (endDeg - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startRad, endRad, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
}
```

### Legends
```javascript
function drawLegend(ctx, items, x, y, fontSize) {
    var swatchSize = fontSize;
    var padding = fontSize * 0.5;
    var currentX = x;
    ctx.font = fontSize + 'px sans-serif';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < items.length; i++) {
        ctx.fillStyle = items[i].color;
        ctx.fillRect(currentX, y, swatchSize, swatchSize);
        ctx.fillStyle = '#333';
        currentX += swatchSize + padding;
        ctx.fillText(items[i].label, currentX, y + swatchSize / 2);
        currentX += ctx.measureText(items[i].label).width + padding * 2;
    }
}
```

### Grid / Table Layouts
```javascript
// Calculate cell positions for a grid layout
function gridLayout(totalWidth, totalHeight, rows, cols, padding) {
    var cellW = (totalWidth - padding * (cols + 1)) / cols;
    var cellH = (totalHeight - padding * (rows + 1)) / rows;
    var cells = [];
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            cells.push({
                x: padding + c * (cellW + padding),
                y: padding + r * (cellH + padding),
                w: cellW,
                h: cellH
            });
        }
    }
    return { cells: cells, cellW: cellW, cellH: cellH };
}
```

### Responsive Text
```javascript
// Fit text to a maximum width by reducing font size
function fitText(ctx, text, maxWidth, maxFontSize, fontFamily) {
    var size = maxFontSize;
    ctx.font = size + 'px ' + fontFamily;
    while (ctx.measureText(text).width > maxWidth && size > 8) {
        size--;
        ctx.font = size + 'px ' + fontFamily;
    }
    return size;
}
```

### Drilldown Hit Testing
```javascript
// Store hit rects during drawing, test on click
// hitRects is an array of {x, y, w, h, name} built in updateView
function findHitRect(hitRects, clickX, clickY) {
    for (var i = 0; i < hitRects.length; i++) {
        var t = hitRects[i];
        if (clickX >= t.x && clickX <= t.x + t.w &&
            clickY >= t.y && clickY <= t.y + t.h) {
            return t;
        }
    }
    return null;
}
```

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
- [ ] `.gitignore` excludes `node_modules`
- [ ] Build script excludes src/, node_modules/, package.json, webpack.config.js from tarball
- [ ] `harness.json` exists with correct fields, formatter (matching JS defaults), and data mode
- [ ] `harness.json` sampleRows use strings only (Splunk passes strings)
- [ ] Viz name added to `harness-manifest.json`
- [ ] **If modifying an existing viz**: `README.md` updated to reflect new/changed columns, settings, and features
- [ ] **If modifying an existing viz**: `savedsearches.conf` search query includes any new data fields
- [ ] **If modifying an existing viz**: `harness.json` updated with new field controls and data columns

## Step 5: Generate Test Harness Config (MANDATORY)

**This step is NOT optional.** Every new viz MUST have a `harness.json` file and MUST be added to `harness-manifest.json`. Generate these files as part of the scaffolding — do not skip them or defer them. When modifying an existing viz (adding/removing fields or settings), update its `harness.json` to match.

Every viz app includes a `harness.json` file that enables local browser testing without deploying to Splunk. A generic `test-harness.html` (containing zero viz-specific code) reads these files and renders any viz with interactive controls.

### harness-manifest.json

A single manifest at the project root registers all vizs and optional shared config:

```json
{
  "fontCSS": "shared/fonts.css",
  "pathTemplate": "examples/{name}/appserver/static/visualizations/{name}",
  "vizs": [
    "my_viz_1",
    "my_viz_2"
  ]
}
```

- `fontCSS` (optional): path to a shared CSS file with `@font-face` declarations. Loaded once when any viz is selected.
- `pathTemplate` (optional): URL path pattern to locate each viz's files. `{name}` is replaced with the viz name. Defaults to `{name}/appserver/static/visualizations/{name}` if omitted. Use this when viz apps live under a subdirectory (e.g., `examples/`) or when the repo layout differs from the standard flat structure.
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
- `dynamicColumnName` (optional): renames a column based on a formatter setting. Used when the viz has a configurable "Field Name" setting (rule 18).

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
- **Column overrides**: when a non-`_` field name matches a column name, the slider value replaces that column's value in every row. This lets users change a value (e.g., `track_id`) across all sample rows interactively.

### Usage

To test locally:

```bash
cd splunk_app && python3 -m http.server 8080
```

Open `http://localhost:8080/test-harness.html`. Select a viz from the dropdown. Adjust data fields and formatter settings — the canvas re-renders in real-time.

### Adding a new viz to the harness

1. Create `harness.json` in the viz's `appserver/static/visualizations/{name}/` directory
2. Add the viz name to the `vizs` array in `harness-manifest.json`

No changes to `test-harness.html` are needed — it discovers everything from JSON.

## Step 6: Scaffold a Dashboard Studio App (Optional)

When the user asks to scaffold a Splunk Dashboard Studio app with custom visualization support, generate the full app skeleton with the `vizs/` build pipeline. This creates a parent app that can bundle one or more custom vizs alongside Dashboard Studio dashboards.

The master reference for this pattern is [`splunk-custom-visualizations`](https://github.com/rcastley/splunk-custom-visualizations). The `test-harness.html` file should be copied from that repo — it is generic (zero viz-specific code) and works with any viz that has a valid `harness.json`.

### What to ask the user

1. **App name**: short lowercase identifier (e.g., `my_dashboard_app`). Used as the `[package] id` in `app.conf`.
2. **Display label**: human-readable name for the Splunk UI (e.g., "My Dashboard App").
3. **Author**: who to credit in `app.conf`.
4. **Description**: one-line description.

### Directory structure to generate

```
{app_name}/
  .gitignore
  README.md
  default/
    app.conf
    visualizations.conf           (empty — populated by build.sh merge)
    savedsearches.conf            (empty — populated by build.sh merge)
    data/ui/
      nav/default.xml
      views/                      (dashboards go here)
  metadata/
    default.meta
  README/
    savedsearches.conf.spec       (empty — populated by build.sh merge)
  static/
    appIcon.png                   (36x36 app icon)
    appIcon_2x.png                (72x72 HiDPI app icon)
    appIconAlt.png                (36x36 alternate app icon)
    appIconAlt_2x.png             (72x72 HiDPI alternate app icon)
  vizs/
    build.sh                      (build + merge + package script)
    harness-manifest.json
    test-harness.html             (copy from splunk-custom-visualizations repo)
```

### File templates

#### .gitignore
```
.DS_Store
vizs/*.tar.gz
node_modules/
```

#### default/app.conf
```
[id]
name = {app_name}
version = 1.0.0

[install]
is_configured = true
build = 1

[ui]
is_visible = true
label = {display_label}
show_in_nav = true

[launcher]
author = {author}
description = {description}
version = 1.0.0

[package]
id = {app_name}
check_for_updates = false
```

#### metadata/default.meta
```
[]
access = read : [ * ], write : [ admin, sc_admin, power ]

[app/local]
access = read : [ * ], write : [ admin, sc_admin ]

[views]
access = read : [ * ], write : [ admin, sc_admin, power ]

[nav]
access = read : [ * ], write : [ admin, sc_admin ]
```

The `[visualizations/*]` export stanzas are appended automatically by `build.sh` during the merge phase.

#### default/data/ui/nav/default.xml
```xml
<nav>
  <view name="home" default="true" />
</nav>
```

#### vizs/harness-manifest.json

Start with an empty vizs array. Each viz is added here as it is scaffolded.

```json
{
  "vizs": []
}
```

If the app uses shared fonts, add `"fontCSS": "shared/fonts.css"` and create `vizs/shared/fonts.css`.

#### vizs/build.sh

```bash
#!/usr/bin/env bash
# Build, merge, and package custom visualizations into {app_name}.
#
# Usage: ./vizs/build.sh [viz_name]
#
# With no arguments, builds and merges all vizs. Pass a name for one:
#   ./vizs/build.sh my_viz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_APP="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="$(basename "$TARGET_APP")"
PARENT_DIR="$(dirname "$TARGET_APP")"

APPS=(
    # Add viz names here as they are created, e.g.:
    # my_first_viz
    # my_second_viz
)

if [ ! -d "$TARGET_APP/default" ]; then
    echo "ERROR: Target app not found at $TARGET_APP"
    exit 1
fi

shopt -s nullglob
BUILT=()
MERGED=0

# ── Spinner ────────────────────────────────────────────────────────────

spin() {
    local pid=$1
    local msg=$2
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${frames[$i]} %s" "$msg"
        i=$(( (i + 1) % ${#frames[@]} ))
        sleep 0.08
    done
    wait "$pid" 2>/dev/null
    local exit_code=$?
    if [ $exit_code -eq 0 ]; then
        printf "\r  ✓ %s\n" "$msg"
    else
        printf "\r  ✗ %s\n" "$msg"
    fi
    return $exit_code
}

run_with_spinner() {
    local msg=$1
    shift
    "$@" > /dev/null 2>&1 &
    spin $! "$msg"
}

# ── Helper: remove a conf stanza by exact name ────────────────────────

remove_stanza() {
    local file="$1"
    local stanza="$2"
    [ -f "$file" ] || return 0
    grep -qF "[$stanza]" "$file" || return 0
    awk -v s="[$stanza]" 'BEGIN{skip=0} /^\[/{skip=($0==s)?1:0} !skip{print}' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# ── Build ──────────────────────────────────────────────────────────────

build_viz() {
    local VIZ_NAME="$1"
    local SRC_APP="$SCRIPT_DIR/$VIZ_NAME"
    local SRC_VIZ="$SRC_APP/appserver/static/visualizations/$VIZ_NAME"

    if [ ! -d "$SRC_APP" ]; then
        printf "  ✗ %s (not found)\n" "$VIZ_NAME"
        return 1
    fi

    if [ ! -d "$SRC_VIZ/node_modules" ]; then
        run_with_spinner "$VIZ_NAME → npm install" bash -c "cd '$SRC_VIZ' && npm install" || return 1
    fi

    run_with_spinner "$VIZ_NAME → webpack build" bash -c "cd '$SRC_VIZ' && npm run build" || return 1

    # Prepend shared font CSS if it exists
    local FONT_CSS="$SCRIPT_DIR/shared/fonts.css"
    local VIZ_CSS="$SRC_VIZ/visualization.css"
    if [ -f "$FONT_CSS" ] && [ -f "$VIZ_CSS" ]; then
        if ! grep -q "@font-face" "$VIZ_CSS"; then
            cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp"
            mv "$VIZ_CSS.tmp" "$VIZ_CSS"
        fi
    fi

    if [ ! -f "$SRC_VIZ/visualization.js" ]; then
        printf "  ✗ %s → build failed\n" "$VIZ_NAME"
        return 1
    fi

    BUILT+=("$VIZ_NAME")
    return 0
}

# ── Merge ──────────────────────────────────────────────────────────────

merge_viz() {
    local VIZ_NAME="$1"
    local SRC_APP="$SCRIPT_DIR/$VIZ_NAME"
    local SRC_VIZ="$SRC_APP/appserver/static/visualizations/$VIZ_NAME"

    # Copy visualization files
    local VIZ_DEST="$TARGET_APP/appserver/static/visualizations/$VIZ_NAME"
    mkdir -p "$VIZ_DEST"
    for f in "$SRC_VIZ"/*.{js,css,html,json,png,svg}; do
        [ -f "$f" ] || continue
        local fname
        fname=$(basename "$f")
        case "$fname" in
            package.json|package-lock.json|webpack.config.js|harness.json|preview.png) continue ;;
        esac
        cp "$f" "$VIZ_DEST/"
    done

    # Update visualizations.conf
    local VIZ_CONF="$TARGET_APP/default/visualizations.conf"
    remove_stanza "$VIZ_CONF" "$VIZ_NAME"
    { echo ""; cat "$SRC_APP/default/visualizations.conf"; } >> "$VIZ_CONF"

    # Update saved searches
    local SAVED_SEARCH_FILE="$TARGET_APP/default/savedsearches.conf"
    local SRC_SAVED="$SRC_APP/default/savedsearches.conf"
    if [ -f "$SRC_SAVED" ]; then
        while IFS= read -r line; do
            local sname="${line#[}"
            sname="${sname%]}"
            remove_stanza "$SAVED_SEARCH_FILE" "$sname"
        done < <(grep '^\[' "$SRC_SAVED")
        { echo ""; cat "$SRC_SAVED"; } >> "$SAVED_SEARCH_FILE"
    fi

    # Merge spec entries
    local SPEC_SRC="$SRC_APP/README/savedsearches.conf.spec"
    local SPEC_DEST="$TARGET_APP/README/savedsearches.conf.spec"
    if [ -f "$SPEC_SRC" ]; then
        mkdir -p "$TARGET_APP/README"
        if [ -f "$SPEC_DEST" ]; then
            grep -v "^display\\.visualizations\\.custom\\.$VIZ_NAME\\." "$SPEC_DEST" \
                > "$SPEC_DEST.tmp" || true
            mv "$SPEC_DEST.tmp" "$SPEC_DEST"
        fi
        { echo ""; cat "$SPEC_SRC"; } >> "$SPEC_DEST"
    fi

    # Update metadata
    local META_FILE="$TARGET_APP/metadata/default.meta"
    if ! grep -q "visualizations/$VIZ_NAME" "$META_FILE"; then
        { echo ""; echo "[visualizations/$VIZ_NAME]"; echo "export = system"; } >> "$META_FILE"
    fi

    MERGED=$((MERGED + 1))
    return 0
}

# ── Run ────────────────────────────────────────────────────────────────

echo ""
echo "  {app_name} build"

# Phase 1: Build all visualizations
echo ""
echo "  Building..."
if [ $# -ge 1 ]; then
    build_viz "$1" || true
else
    for app in "${APPS[@]}"; do
        build_viz "$app" || true
    done
fi

# Phase 2: Merge all successfully built visualizations
if [ ${#BUILT[@]} -gt 0 ]; then
    echo ""
    echo "  Merging..."
    for app in "${BUILT[@]}"; do
        merge_viz "$app" > /dev/null 2>&1 && printf "  ✓ %s\n" "$app" || printf "  ✗ %s\n" "$app"
    done
fi

# Clean up conf files — collapse multiple blank lines
for f in \
    "$TARGET_APP/README/savedsearches.conf.spec" \
    "$TARGET_APP/default/savedsearches.conf" \
    "$TARGET_APP/default/visualizations.conf"; do
    if [ -f "$f" ]; then
        awk 'NF{blank=0; print; next} !blank++{print}' "$f" \
            | sed '/./,$!d' > "$f.tmp"
        mv "$f.tmp" "$f"
    fi
done

# Bump patch version (updates both [id] and [launcher] stanzas)
if [ "$MERGED" -gt 0 ]; then
    CURRENT_VERSION=$(grep '^version' "$TARGET_APP/default/app.conf" | head -1 | cut -d= -f2 | tr -d ' ')
    MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
    MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
    PATCH=$(echo "$CURRENT_VERSION" | cut -d. -f3)
    NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
    sed -i '' "s/^version = .*/version = ${NEW_VERSION}/" "$TARGET_APP/default/app.conf"
    echo ""
    printf "  ✓ Version bump: %s → %s\n" "$CURRENT_VERSION" "$NEW_VERSION"
fi

# Phase 3: Package
echo ""
echo "  Packaging..."
xattr -rc "$TARGET_APP" 2>/dev/null || true

run_with_spinner "$APP_NAME.tar.gz" bash -c "
    COPYFILE_DISABLE=1 tar --disable-copyfile \
        --exclude='.git' \
        --exclude='.github' \
        --exclude='.DS_Store' \
        --exclude='.gitignore' \
        --exclude='._*' \
        --exclude='vizs' \
        --exclude='local' \
        --exclude='README.md' \
        --exclude='node_modules' \
        -czf '$PARENT_DIR/$APP_NAME.tar.gz' \
        -C '$PARENT_DIR' \
        '$APP_NAME'
"

echo ""
echo "  📦 $PARENT_DIR/$APP_NAME.tar.gz"
echo ""
```

Mark `build.sh` as executable (`chmod +x vizs/build.sh`).

#### vizs/test-harness.html

**Do not generate this file.** Copy it from the master repository:

```bash
curl -sL https://raw.githubusercontent.com/rcastley/splunk-custom-visualizations/main/test-harness.html \
  -o vizs/test-harness.html
```

Or if the repo is cloned locally:

```bash
cp /path/to/splunk-custom-visualizations/test-harness.html vizs/test-harness.html
```

The test harness is fully generic — it reads `harness-manifest.json` to discover vizs and `harness.json` in each viz directory for controls and sample data. No modifications are needed.

### Workflow after scaffolding

Once the app skeleton exists, individual vizs are created using the normal Steps 1–5 of this skill. Each viz is scaffolded as a standalone app under `vizs/{viz_name}/` with its own `default/`, `metadata/`, `README/`, and `appserver/`. After scaffolding a new viz:

1. Add the viz name to the `APPS` array in `vizs/build.sh`
2. Add the viz name to the `vizs` array in `vizs/harness-manifest.json`
3. Run `./vizs/build.sh` to build, merge, and package

The build script handles everything: npm install, webpack build, merging config stanzas into the parent app, version bump, and tarball packaging. The `appserver/static/visualizations/` directory in the parent app is a build artifact — source code lives only under `vizs/`.

### Namespace reminder

When a viz is embedded in a parent app, the Splunk config namespace changes. In `savedsearches.conf` and `savedsearches.conf.spec` inside each `vizs/{viz_name}/` directory, use the parent app's package ID:

```
display.visualizations.custom.type = {parent_app_id}.{viz_name}
display.visualizations.custom.{parent_app_id}.{viz_name}.{setting} = {value}
```

The `formatter.html` and `visualization_source.js` auto-resolve the namespace via `{{VIZ_NAMESPACE}}` and `getPropertyNamespaceInfo()` — no code changes needed.

## Splunk Version Requirements

Custom visualizations using this framework require **Splunk Enterprise 10.2+** or **Splunk Cloud**. The `visualizations.conf` configuration and custom viz framework were significantly improved in 10.2. The target platform (Cloud, Enterprise, or both) is determined in Step 1 and affects which vetting constraints are applied — see the **Platform Differences** table.
