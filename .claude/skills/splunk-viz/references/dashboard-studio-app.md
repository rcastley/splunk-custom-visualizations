# Scaffold a Dashboard Studio App (Step 6)

When the user asks to scaffold a Splunk Dashboard Studio app with custom visualization support, generate the full app skeleton with the `vizs/` build pipeline. This creates a parent app that can bundle one or more custom vizs alongside Dashboard Studio dashboards.

The master reference for this pattern is [`splunk-custom-visualizations`](https://github.com/rcastley/splunk-custom-visualizations). The `test-harness.html` file should be copied from that repo — it is generic (zero viz-specific code) and works with any viz that has a valid `harness.json`.

## What to ask the user

1. **App name**: short lowercase identifier (e.g., `my_dashboard_app`). Used as the `[package] id` in `app.conf`.
2. **Display label**: human-readable name for the Splunk UI (e.g., "My Dashboard App").
3. **Author**: who to credit in `app.conf`.
4. **Description**: one-line description.

## Directory structure to generate

```
{app_name}/
  .gitignore                      (dev-only — excluded from tarball by build.sh)
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

## File templates

### .gitignore

**Dev-only** — must NOT be included in the packaged tarball. Splunk Cloud vetting rejects `.git*` files.

```
.DS_Store
vizs/*.tar.gz
node_modules/
```

### default/app.conf
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

### metadata/default.meta
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

### default/data/ui/nav/default.xml
```xml
<nav>
  <view name="home" default="true" />
</nav>
```

### vizs/harness-manifest.json

Start with empty arrays. Each viz is added here as it is scaffolded.

```json
{
  "categories": {},
  "vizs": []
}
```

If the app uses shared fonts, add `"fontCSS": "shared/fonts.css"` and create `vizs/shared/fonts.css`. See the `harness-manifest.json` schema in Step 5 for the full `categories` format.

### vizs/build.sh

This is the key script that makes the Dashboard Studio app pattern work. Each viz is developed as a standalone app under `vizs/{viz_name}/` with its own `default/`, `metadata/`, and `appserver/`. The build script compiles them and **merges** their configs and assets into the parent Splunk app so everything ships as a single installable package.

Read the template from `shared/dashboard-app-build-template.sh` and copy it to `vizs/build.sh`. Replace `{app_name}` in the echo statement with the actual app name. Add viz names to the `APPS` array as they are scaffolded. Mark as executable (`chmod +x vizs/build.sh`).

What it does for each viz in `APPS`:

1. **Build** — npm install + webpack bundle in `vizs/{viz_name}/appserver/static/visualizations/{viz_name}/`
2. **Font CSS** — prepends `shared/fonts.css` to the viz's `visualization.css` (if not already present)
3. **Merge into parent** — copies built assets (`visualization.js`, `visualization.css`, `formatter.html`) into the parent app's `appserver/static/visualizations/{viz_name}/`, and appends config stanzas from the viz's `default/` and `README/` into the parent app's `visualizations.conf`, `savedsearches.conf`, `savedsearches.conf.spec`, and `default.meta`
4. **Version bump** — increments the parent app's patch version
5. **Package** — tarballs the parent app (excluding `vizs/`, `node_modules/`, dev files, `.git*`)

### vizs/test-harness.html

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

## Workflow after scaffolding

Once the app skeleton exists, individual vizs are created using the normal Steps 1–5 of this skill. Each viz is scaffolded as a standalone app under `vizs/{viz_name}/` with its own `default/`, `metadata/`, `README/`, and `appserver/`. After scaffolding a new viz:

1. Add the viz name to the `APPS` array in `vizs/build.sh`
2. Add the viz name to the `vizs` array and appropriate `categories` group in `vizs/harness-manifest.json`
3. Run `./vizs/build.sh` to build, merge, and package

The build script handles everything: npm install, webpack build, merging config stanzas into the parent app, version bump, and tarball packaging. The `appserver/static/visualizations/` directory in the parent app is a build artifact — source code lives only under `vizs/`.

## Namespace reminder

When a viz is embedded in a parent app, the Splunk config namespace changes. In `savedsearches.conf` and `savedsearches.conf.spec` inside each `vizs/{viz_name}/` directory, use the parent app's package ID:

```
display.visualizations.custom.type = {parent_app_id}.{viz_name}
display.visualizations.custom.{parent_app_id}.{viz_name}.{setting} = {value}
```

The `formatter.html` and `visualization_source.js` auto-resolve the namespace via `{{VIZ_NAMESPACE}}` and `getPropertyNamespaceInfo()` — no code changes needed.
