# Dashboard Studio Extension Framework (Splunk 10.4+) — Track B Reference

Use this reference when [Step 0 of the parent skill](../SKILL.md#step-0-choose-framework) selects **Track B** — that is, when the target Splunk version is 10.4+ **and** the viz only needs to run inside Dashboard Studio (not Simple XML), and refresh-stability matters.

The complete worked example is `examples/steampunk_gauge_dse/`. Read it alongside this document.

## Why this track exists

Splunk 10.4 Dashboard Studio repaints `legacy_visualization` panels visibly on every scheduled-search refresh: the canvas briefly clears, the empty shell is drawn, then the next frame paints. On 10.2 the panel held the previous frame; on 10.4 it does not. The fix is not in the legacy viz code — it is in the framework choice.

The new `@splunk/dashboard-studio-extension` framework runs each viz in an iframe injected by the host dashboard and exposes an explicit `loading` boolean alongside the data. When `loading` is true we **silently skip the redraw** and keep the previous frame on screen. The Dashboard Studio host overlays its own "refreshing" indicator in the corner of the panel, so the user still sees that data is loading — they just no longer see the panel flicker.

Trade-offs:

- Will not load on Splunk 10.2 or in Simple XML dashboards.
- Build pipeline is more complex (esbuild + custom packaging script, with upstream bugs that must be patched locally).
- Settings UI uses a JSON schema rather than HTML, which makes some advanced layouts (multi-tab formatter, conditional fields) harder.

## Project layout

```
examples/{app_name}/
  README.md
  .gitignore                              (excludes node_modules, dist, stage)
  package.json                            (npm + esbuild + tar deps; build scripts)
  package-lock.json
  build.mjs                               (esbuild driver — vendored from @splunk/create)
  package.mjs                             (assembles .spl — vendored from @splunk/create, patched)
  build-plugins/
    css-and-size.mjs                      (esbuild plugin: inlines CSS, warns on >2MB bundles)
  package/
    app/
      app.conf                            (source of truth for the [id]/[package]/[launcher] stanzas)
    metadata/                             (optional — packager writes default.meta automatically)
  visualizations/
    {app_name}/
      config.json                         (replaces formatter.html AND savedsearches.conf defaults)
      src/
        visualization.js                  (ESM module — VisualizationAPI listeners)
        visualization.css                 (imported from visualization.js — inlined by esbuild)
  dist/                                   (build output: dist/{app_name}/visualization.js[.map])
  stage/                                  (packager staging area — gitignored)
```

Notes:

- **No `appserver/` directory in source.** The packager (`package.mjs`) creates `appserver/static/visualizations/{app_name}/` inside the staged tarball and copies `dist/{app_name}/visualization.js` and `config.json` into it.
- **No hand-written `default/visualizations.conf`.** The packager generates it from the discovered `config.json` files, including `framework_type = studio_visualization`.
- **No `formatter.html`, no `savedsearches.conf`, no `savedsearches.conf.spec`.** All settings live in `config.json` → `optionsSchema` (with defaults) + `editorConfig` (UI layout).
- **`harness.json` IS supported** (as of harness v2). Place it at `visualizations/{app_name}/harness.json` alongside `config.json`, and add the viz to the `studio.vizs` array in `harness-manifest.json`. The harness mounts the production ESM bundle in an iframe with a `DashboardExtensionAPI` shim — see [Testing](#testing).

## Step-by-step scaffolding

### 1. Initialise the project

From the repo root:

```bash
cd examples
npx -y @splunk/create@latest dashboard-studio-extension {app_name}
```

This produces a viable starting layout, but its `package.mjs` and `package/app/app.conf` contain bugs that block Splunk Cloud appinspect. Apply the fixes documented in [`upstream-bugfix/`](../../../../upstream-bugfix/) immediately:

1. **`package/app/app.conf`** — add the `[id]` stanza and `check_for_updates = false`. See [App configuration](#app-configuration) below.
2. **`package.mjs` → `stageConfFiles()`** — `mkdirSync(defaultDir, { recursive: true })` before writing `visualizations.conf` (the upstream template assumes `default/` already exists, which it does not by the time this code runs).
3. **`package.mjs` → `main()`** — reorder so `app.conf` is parsed first, then `stage/{appId}/` is wiped and re-created, then `stageAppConf()` runs. The upstream sequence writes `app.conf` and immediately deletes it.
4. **`package.mjs` → `generateDefaultMeta()`** — prepend a global `[]\naccess = read : [ * ], write : [ admin, sc_admin ]` stanza so Splunk Cloud's `check_meta_default_write_access` rule passes.

Easier: copy `examples/steampunk_gauge_dse/{build.mjs,package.mjs,build-plugins/}` into the new project as-is. Those copies already include the fixes.

### 2. Configure `package.json`

```json
{
    "name": "{app_name}",
    "version": "1.0.0",
    "description": "{description}",
    "author": "{author}",
    "type": "module",
    "scripts": {
        "build": "node build.mjs --entry=visualization.js",
        "build:prod": "NODE_ENV=production node build.mjs --entry=visualization.js",
        "dev": "node build.mjs --entry=visualization.js --watch",
        "package": "node package.mjs"
    },
    "devDependencies": {
        "@splunk/dashboard-studio-extension": "^1.0.0",
        "chalk": "^5.3.0",
        "esbuild": "^0.27.3",
        "tar": "^7.4.3"
    }
}
```

Keep `"type": "module"` — the build/package scripts are ESM.

### 3. Author `config.json`

`config.json` is the single source of truth for:

- The visualization's identity (`name`, `description`, `category`, `icon`)
- Its data contract (`requiredDataSources`, `optionalDataSources`)
- Default panel size (`initialWidth`, `initialHeight`)
- All user-configurable options and their default values (`optionsSchema`)
- The Format-panel UI layout that exposes those options (`editorConfig`)

Full schema:

```json
{
    "showTitleAndDescription": true,
    "includeInToolbar": true,
    "includeInVizSwitcher": true,
    "showDrilldown": false,
    "canSetTokens": [],
    "hasEventHandlers": false,
    "config": {
        "name": "{Display Label}",
        "description": "{One-line description}",
        "category": "Custom",
        "icon": null,
        "dataContract": {
            "requiredDataSources": ["primary"],
            "optionalDataSources": []
        },
        "size": {
            "initialWidth": 320,
            "initialHeight": 320
        },
        "optionsSchema": {
            "{optionName}": { "type": "string|number|boolean", "default": <value> }
        },
        "editorConfig": [
            {
                "label": "{Tab label}",
                "layout": [
                    [{ "editor": "editor.text", "label": "{Field label}", "option": "{optionName}" }]
                ]
            }
        ]
    }
}
```

**`optionsSchema` field types:**

| `type` | Editor surface | Notes |
|--------|----------------|-------|
| `"string"` | `editor.text`, `editor.color`, `editor.select` | Free text or one of a fixed list |
| `"number"` | `editor.number` | Comes through as a JS number when the user has set one. Falls back to schema `default` if unset; `undefined` if no default. |
| `"boolean"` | `editor.toggle` | Comes through as a JS boolean. |

If a setting needs no default value (only enabled when the user fills it in), omit `default` — the option will be `undefined` in the runtime payload and your code should handle that case.

**`editorConfig`** — an array of tabs. Each tab has `label` and `layout`. Each `layout` is an array of rows; each row is an array of editor objects:

| `editor` | Use for | Required keys |
|----------|---------|---------------|
| `editor.text` | Strings | `label`, `option` |
| `editor.number` | Numeric input | `label`, `option` |
| `editor.color` | Hex colour picker | `label`, `option` |
| `editor.toggle` | Boolean switch | `label`, `option` |
| `editor.select` | Drop-down | `label`, `option`, `editorProps.values` (array of `{ label, value }`) |

Avoid baking colour palettes or fonts into `editorConfig` — the host applies the user's theme around the iframe. Use `editor.color` and accept any hex.

**Defaults discipline:** the value sent to the viz at runtime is always `optionsSchema[name].default` (if set) until the user changes it in the Format panel. Your `visualization.js` code should still defend with `||` / `??` fallbacks because:

- The user may have explicitly set the option to `null` or empty string.
- Options without a `default` will be `undefined` on first load.

### 4. Author `visualization.js`

```js
import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import './visualization.css';

// ── Module-scope state survives across listener invocations because
//    the iframe host keeps a single execution context per viz panel.
const state = {
    loading: false,
    rawData: null,
    options: {},
    width: 0,
    height: 0,
    statusMsg: null,
};

// ── DOM setup runs once at module load.
const root = document.getElementById('root') || document.body;
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:100%;height:100%;display:block;';
root.appendChild(canvas);

function sizeCanvas(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(w * dpr));
    const targetH = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
}

function draw() {
    const { width: w, height: h } = state;
    if (w <= 0 || h <= 0) return;
    sizeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // ... draw using state.rawData and state.options ...
}

VisualizationAPI.addDimensionsListener(
    ({ width, height }) => {
        state.width = width || 0;
        state.height = height || 0;
        draw();
    },
    { invokeImmediately: true }
);

VisualizationAPI.addOptionsListener(
    ({ options }) => {
        state.options = options || {};
        draw();
    },
    { invokeImmediately: true }
);

VisualizationAPI.addDataSourcesListener(
    ({ dataSources, loading }) => {
        // The refresh-stability fix: keep the previous frame on screen
        // while the data source is reloading. The Dashboard Studio host
        // shows its own refresh indicator in the corner.
        state.loading = loading;
        if (loading) return;

        const raw = dataSources?.primary?.data ?? null;
        if (!raw) {
            // First load with no data yet — render the empty shell.
            if (!state.rawData) draw();
            return;
        }
        state.rawData = raw;
        draw();
    },
    { invokeImmediately: true }
);
```

#### Listener cookbook

| API | Payload | Use for |
|-----|---------|---------|
| `addDimensionsListener` | `{ width, height }` | Panel resize. Always pass `{ invokeImmediately: true }` so the first frame has dimensions. |
| `addOptionsListener` | `{ options }` | Format panel changes. `options` is keyed by the names in `optionsSchema`. Values are already type-coerced. |
| `addDataSourcesListener` | `{ dataSources, loading }` | New data arrived, or a refresh started. **Always early-return when `loading` is true** — this is the whole reason for using Track B. |
| `VisualizationAPI.setError({ title, message })` | — | Surface a user-visible error inside the panel. The host renders this; you do not draw it yourself. |
| `VisualizationAPI.clearError()` | — | Clear a previously set error. Call this when valid data starts flowing again. |
| `VisualizationAPI.setTrellisGroupBy(field)` | — | Optional — for vizs that participate in trellis layouts. Most custom vizs do not need this. |

#### Data shape (very different from Track A)

Dashboard Studio passes data **column-major**, not row-major:

```js
dataSources.primary.data === {
    fields: [{ name: 'value' }, { name: 'label' }, { name: '_status' }],
    columns: [
        ['42'],                    // value column
        ['Pressure'],              // label column
        ['Awaiting telemetry']     // _status column (only present if SPL emitted it)
    ]
    // Optionally also: meta, requestParams
}
```

To extract values:

```js
function parseData(data, options) {
    if (!data?.fields || !data?.columns) return null;
    const idx = {};
    for (let i = 0; i < data.fields.length; i++) {
        idx[data.fields[i].name] = i;
    }
    const vCol = data.columns[idx[options.valueField || 'value']];
    if (!vCol || vCol.length === 0) return null;
    return { value: parseFloat(vCol[vCol.length - 1]) };
}
```

A worked example with `_status` fallback handling lives in `examples/steampunk_gauge_dse/visualizations/steampunk_gauge_dse/src/visualization.js` — search for `parseData`.

#### `_status` no-data pattern

The SPL `appendpipe` trick from Track A rule 27 still works, but the JS side detects it via the column-major shape:

```js
if (idx._status !== undefined) {
    const col = data.columns[idx._status];
    if (col?.length && col[col.length - 1]) {
        return { status: String(col[col.length - 1]) };
    }
}
```

When `parseData` returns a `{ status }` sentinel, draw a centred status message on the canvas instead of the normal viz. See `drawStatusMessage()` in the steampunk gauge studio for an emoji-plus-text implementation that auto-scales to fit 85% of the panel width.

#### Smoothing / animation

`requestAnimationFrame` works exactly as in Track A. State lives in module scope rather than `this`:

```js
const state = { /* ... */, target: 0, current: 0, animFrame: null, idleFrames: 0, lastFrameTs: 0 };

function startAnim() {
    if (state.animFrame !== null) return;
    state.lastFrameTs = 0;
    const step = (ts) => {
        if (!state.lastFrameTs) state.lastFrameTs = ts;
        const dt = Math.min(0.25, Math.max(0, (ts - state.lastFrameTs) / 1000));
        state.lastFrameTs = ts;
        const smoothness = state.options.smoothness ?? 8;
        const diff = state.target - state.current;
        state.current += diff * (1 - Math.exp(-smoothness * dt));
        draw();
        if (Math.abs(diff) < 1e-3) {
            if (++state.idleFrames > 6) { state.current = state.target; state.animFrame = null; return; }
        } else {
            state.idleFrames = 0;
        }
        state.animFrame = requestAnimationFrame(step);
    };
    state.animFrame = requestAnimationFrame(step);
}
```

The host iframes are torn down when the panel is removed, so explicit cleanup of the rAF handle is rarely necessary in practice, but cancel it on visibility change if you observe sustained background CPU.

### 5. Author `visualization.css`

The CSS file is imported from `visualization.js` and inlined into the bundle by the `cssInjectAndSizeWarnPlugin` esbuild plugin. Keep it minimal and transparent so the dashboard background shows through:

```css
html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
}

#root,
.{app_name}-viz {
    width: 100%;
    height: 100%;
    background: transparent;
}

.{app_name}-viz canvas {
    display: block;
    width: 100%;
    height: 100%;
}
```

The iframe inherits the host theme; do not set explicit text colours in CSS — pick them at draw time based on a setting or a theme-detection helper.

## App configuration

### `package/app/app.conf`

```ini
[id]
name = {app_name}
version = 1.0.0

[install]
is_configured = 0
build = <@- buildNumber @>

[package]
id = {app_name}
check_for_updates = false

[ui]
is_visible = 0
label = {Display Label}
show_in_nav = 0

[launcher]
author = {author}
description = {description}
version = 1.0.0

[manifest]
category = Custom
```

Key requirements:

- **`[id]` stanza is mandatory.** Without it, Splunk Cloud's `check_version_is_valid_semver` rule fails. `name` must match `[package] id`, `version` must be valid SemVer.
- **`check_for_updates = false`** in `[package]` keeps Splunk Cloud's `check_app_update_uri` quiet for private apps.
- **`<@- buildNumber @>`** is a template placeholder that `package.mjs` replaces with the build number it derives from the git short hash. Leave it as-is.
- **`is_visible = 0` and `show_in_nav = 0`** — a custom viz app is invisible in the launcher; users discover it through the viz picker.

The packager's `parseAppConf()` only reads the keys it cares about (id, version, author, description, label, category). Any extra keys are preserved in the staged file but ignored by the build.

### `metadata/` (optional in source)

The packager generates `metadata/default.meta` from the discovered visualizations. The patched `generateDefaultMeta()` (see [Upstream bugs](#upstream-bugs)) writes:

```ini
[]
access = read : [ * ], write : [ admin, sc_admin ]

[visualizations/{app_name}]
export = system
```

If you need extra metadata stanzas, add a `package/metadata/default.meta` source file. The packager will copy it instead of regenerating.

## Build and package

Two equivalent entry points. Either works.

**From the app directory** (useful during development for `npm run dev` watch mode):

```bash
npm install                # one-time
npm run build              # dev build (sourcemaps, no minify) → dist/{app_name}/visualization.js
npm run build:prod         # production build (minified, no maps)
npm run dev                # esbuild watch mode for iterative development
npm run package            # builds .spl into dist/{app_name}-{version}-{git}.spl
```

**From the repo root** (unified across Track A and Track B):

```bash
./build.sh {app_name}      # auto-detects Track B, runs build:prod + package,
                           # copies the .spl to dist/ at the repo root
./build.sh                 # builds every app in examples/, mixing Track A and B
```

`build.sh` invokes `npm run build:prod` followed by `npm run package` for Track B apps, then copies the per-app `.spl` to the top-level `dist/` so all outputs end up in one place. Use `npm run dev` directly when iterating — `build.sh` does not support watch mode.

The packager's flow:

1. Validate project structure (`package.json`, `visualizations/*/config.json`, `dist/*/visualization.js`).
2. Parse `package/app/app.conf` for `id` and `version`.
3. Clear `stage/{appId}/`, recreate it.
4. Stage `default/app.conf` (with `buildNumber` interpolated).
5. Copy `dist/{viz}/visualization.js` and `config.json` to `stage/{appId}/appserver/static/visualizations/{viz}/`.
6. Generate `default/visualizations.conf` listing every viz with `framework_type = studio_visualization`.
7. Generate `metadata/default.meta` with the global `[]` stanza and per-viz `[visualizations/{name}]` stanzas.
8. Generate `app.manifest` (Splunk app metadata).
9. Create `dist/{appId}-{version}-{shortHash}.spl` (gzipped tar).

The `.spl` filter excludes dotfiles, so any `.DS_Store` / `.gitkeep` left behind in `stage/` will not end up in the tarball.

## Install in Splunk

1. Apps → Manage Apps → Install app from file
2. Upload `dist/{app_name}-{version}-{git}.spl`
3. Splunk may prompt for a restart — restart if asked
4. Open a Dashboard Studio dashboard, then Visualization picker → Custom → **{Display Label}**

## Upstream bugs

The `@splunk/create@11.0.0` template that scaffolds these projects has four known defects. The vendored `package.mjs` and `package/app/app.conf` in `examples/steampunk_gauge_dse/` already work around all four. See [`upstream-bugfix/BUG_REPORT.md`](../../../../upstream-bugfix/BUG_REPORT.md) for the full reproduction, root cause, and patch.

| # | File | Defect | Workaround |
|---|------|--------|------------|
| 1 | `package.mjs` → `stageConfFiles` | Writes `default/visualizations.conf` without creating `default/`. Build fails with `ENOENT`. | `mkdirSync(defaultDir, { recursive: true })` before the write. |
| 2 | `package.mjs` → `main()` | Writes `app.conf`, then `rmSync`s the entire stage dir, deleting it. The `.spl` ships without `default/app.conf`. Splunk rejects the install. | Parse `app.conf` first, clear stage, then write `app.conf`. |
| 3 | `package.mjs` → `generateDefaultMeta` | Emits per-viz stanzas only. No global `[]` access stanza. Splunk Cloud `check_meta_default_write_access` fails. | Prepend `[]\naccess = read : [ * ], write : [ admin, sc_admin ]`. |
| 4 | `package/app/app.conf.template` | Missing `[id]` stanza and `check_for_updates`. Splunk Cloud `check_version_is_valid_semver` warns. | Add `[id]` with `name` and `version`; add `check_for_updates = false` to `[package]`. |

When generating a new Track B project, copy the patched files from the steampunk gauge studio rather than re-running `@splunk/create` and re-patching by hand.

## Splunk Cloud appinspect

Run before submission:

```bash
splunk-appinspect inspect dist/{app_name}-{version}-{git}.spl --mode test --included-tags cloud
```

A correctly built Track B app passes with no failures and no warnings, provided:

- `app.conf` has the `[id]` stanza with valid SemVer.
- `metadata/default.meta` has the global `[]` write-access stanza (the patched `generateDefaultMeta` handles this).
- No dotfiles (`.DS_Store`, `.gitignore`) ended up in the tarball (the packager's `.spl` filter handles this).
- `visualizations.conf` uses `framework_type = studio_visualization` (the packager generates this).

## Testing

Track B vizs work in the **same `test-harness.html`** as Track A — the harness mounts each studio viz in an `<iframe>` and installs a `window.DashboardExtensionAPI` shim before the production ESM bundle loads. The `@splunk/dashboard-studio-extension` package is a thin proxy (`const API = globalThis.DashboardExtensionAPI ?? FallbackProxy`), so the bundled viz binds to the shim with no rebuild needed.

### Adding a studio viz to the harness

1. **Create `visualizations/{app_name}/harness.json`** alongside `config.json`. Use the same schema as Track A `harness.json` (fields, formatter, data, defaultSize, noDataMessage). The harness translates the row-major data it builds into column-major before pushing it via the shim, and strips the `display.visualizations.custom.test.test.` namespace from option keys before passing them to your viz. Option **types** are coerced based on `config.json` → `optionsSchema` (`type: "number"` → number, `type: "boolean"` → boolean, otherwise string), so your viz receives the same typed values the real Dashboard Studio runtime would send.

2. **Register the viz in `harness-manifest.json`** under the `studio` block — NOT the top-level `vizs` array:

   ```json
   {
     "studio": {
       "pathTemplate": "examples/{name}/visualizations/{name}",
       "bundleTemplate": "examples/{name}/dist/{name}/visualization.js",
       "vizs": ["your_app_name"]
     },
     "categories": { "General": [ "...", "your_app_name" ] }
   }
   ```

   Also add the name to its `categories` group so it shows up in the picker.

3. **Build the bundle once** so `dist/{app_name}/visualization.js` exists:

   ```bash
   ./build.sh your_app_name   # or: cd examples/your_app_name && npm run build:prod
   ```

   The harness fetches the bundle from `examples/{name}/dist/{name}/visualization.js`. If you re-run `./build.sh` or `npm run build:prod`, just hard-refresh the harness tab.

4. **Serve the repo over HTTP** (`python3 -m http.server 8080` from the repo root) and open `http://localhost:8080/test-harness.html`. The studio viz appears in the picker — selecting it spins up the iframe; the formatter controls and data sliders work exactly like Track A.

### Dev loop

For active development, run esbuild in watch mode AND keep the harness open:

```bash
cd examples/your_app_name
npm run dev          # esbuild --watch → updates dist/{app_name}/visualization.js on every save
```

In another terminal:

```bash
python3 -m http.server 8080   # at repo root
```

Save a `src/visualization.js` change → hard-refresh the harness tab → the new bundle loads. (Soft refresh sometimes hits the browser's module cache.)

### What the harness cannot test

The iframe shim is a faithful proxy of the listener model but doesn't reproduce every host behaviour. Always do a final pass in real Splunk 10.4 to verify:

- `setError`/`clearError` UX (the harness logs but doesn't display the error chrome the same way).
- Trellis grouping, drilldown handling.
- `_bump`/install-time caching, app icons, preview rendering inside the picker.
- The refresh-stability behaviour with a `*` scheduled search (the harness has no `loading: true` toggle in the UI — you can drive it manually from devtools via `document.querySelector('iframe').contentWindow.__harnessBridge.setDataSources(currentDS, true)`).

### Installing into real Splunk

When you're ready to test in Splunk:

1. `npm run package` (or `./build.sh your_app_name`) → produces a `.spl` in the top-level `dist/`.
2. In Splunk: Apps → Manage Apps → Install app from file → upload the `.spl`. Choose "Upgrade app" if it already exists.
3. Hard-refresh the dashboard tab (`Cmd+Shift+R`).

A faster inner loop, once the app is installed: edit the file directly inside `$SPLUNK_HOME/etc/apps/{app_name}/appserver/static/visualizations/{app_name}/visualization.js`, then `/_bump` and hard-refresh. Reserve this for tight tweaks — always re-package + re-install before submitting to Splunk Cloud.

## Verify Completeness

For a new Track B viz, check:

- [ ] `package.json` has `"type": "module"`, depends on `@splunk/dashboard-studio-extension`, `esbuild`, `chalk`, `tar`.
- [ ] `build.mjs`, `package.mjs`, `build-plugins/css-and-size.mjs` copied from the patched reference (see [Upstream bugs](#upstream-bugs)).
- [ ] `package/app/app.conf` has `[id]` stanza with matching `name` and SemVer `version`.
- [ ] `package/app/app.conf` `[package]` includes `check_for_updates = false`.
- [ ] `visualizations/{app_name}/config.json` has `name`, `description`, `category`, `dataContract`, `optionsSchema` (with defaults), and `editorConfig`.
- [ ] Every option referenced from `editorConfig` exists in `optionsSchema`.
- [ ] `visualizations/{app_name}/src/visualization.js` uses `import { VisualizationAPI } from '@splunk/dashboard-studio-extension'`.
- [ ] `addDataSourcesListener` early-returns when `loading` is true (refresh-stability fix).
- [ ] All three listeners pass `{ invokeImmediately: true }` so first paint has dimensions, options, and data.
- [ ] Canvas sizing is HiDPI-aware and only resizes when target dimensions change.
- [ ] `_status` SPL fallback handled if a custom no-data message is requested.
- [ ] `visualization.css` keeps `background: transparent` on root and canvas.
- [ ] `visualizations/{app_name}/harness.json` exists with fields, formatter (defaults matching `optionsSchema` defaults), data mode, and `defaultSize`.
- [ ] Viz name added to `studio.vizs` in `harness-manifest.json` AND the appropriate `categories` group.
- [ ] `npm run build:prod && npm run package` produces a `.spl` in `dist/`.
- [ ] (For Cloud) `splunk-appinspect inspect dist/...spl --mode test --included-tags cloud` reports no failures and no warnings.
- [ ] README documents the columns, SPL examples, and the 10.4-only minimum version.

## Migrating a Track A viz to Track B

If you already have a Track A viz and want a Track B counterpart (rather than a wholesale migration), build it as a **separate sibling app** and ship them side by side. Users on 10.2 install the legacy app; users on 10.4 install the studio app; the picker shows both as distinct entries. This is what `examples/steampunk_gauge/` and `examples/steampunk_gauge_dse/` do.

Porting checklist (legacy → studio):

| Legacy concept | Studio equivalent |
|---|---|
| `formatter.html` `<splunk-control-group>` | `config.json` `editorConfig` entry |
| `formatter.html` `value="..."` default | `config.json` `optionsSchema[name].default` |
| `savedsearches.conf` `display.visualizations.custom.*` | Not needed — defaults come from `optionsSchema` |
| `savedsearches.conf.spec` | Not needed |
| `SplunkVisualizationBase.extend({...})` | Module-scope code + listeners |
| `initialize` | Top-level module code |
| `getInitialDataParams` | Not needed — Splunk hands you the full data each refresh |
| `formatData` | `parseData(rawData, options)` called inside `addDataSourcesListener` |
| `updateView` | `draw()` called from any listener |
| `reflow` | `addDimensionsListener` |
| `destroy` | iframe teardown; rAF cleanup if needed |
| `this._lastGoodData` cache | Module-scope `state.rawData` (the `loading` guard already prevents the flashing the cache was working around) |
| `throw VisualizationError(...)` | `VisualizationAPI.setError({ title, message })` |
| Row-major data (`data.rows`) | Column-major data (`data.columns[idx[fieldName]]`) |
| `config[ns + 'name']` | `options.name` (no namespace prefix) |
| `parseFloat(config[ns + 'n']) \|\| 0` | `options.n ?? 0` (already typed if schema says so) |

The drawing helpers themselves (Canvas 2D primitives) port over verbatim — they were already pure functions of `ctx`, dimensions, and data in Track A (per legacy Rule 12). Modernise the JS to ESM `const`/`let`/arrow functions while you're there — Track B targets `es2017` via esbuild, so the ES5-only Rule 1 of Track A no longer applies.

## Reference example

`examples/steampunk_gauge_dse/` — production-ready studio extension viz with:

- Refresh-stable rendering (no visible repaint on scheduled refresh in Splunk 10.4)
- All Track A patterns ported: zones, wear seed derived from config, smoothing animation, `_status` no-data message, HiDPI canvas
- All four upstream `@splunk/create` bugs patched
- Passes Splunk Cloud appinspect with no failures or warnings

Read the source alongside this reference whenever you need a concrete example of any pattern described above.
