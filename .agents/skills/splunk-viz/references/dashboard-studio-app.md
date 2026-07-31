# Parent Dashboard Studio App for Legacy Visualizations

When the user asks to scaffold a parent Splunk app containing Dashboard Studio dashboards and legacy custom visualizations, generate the app skeleton with the `vizs/` build pipeline. Each visualization remains independently buildable before its runtime files and configuration are merged into the parent app.

## Contents

- [What to ask the user](#what-to-ask-the-user)
- [Directory structure to generate](#directory-structure-to-generate)
- [File templates](#file-templates)
- [Workflow after scaffolding](#workflow-after-scaffolding)
- [Namespace reminder](#namespace-reminder)

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
    test-harness.html             (schema-driven legacy harness host)
    splunk-logo.png               (copy — referenced by test-harness.html chrome)
    shared/
      harness.css                 (copy — test-harness.html stylesheet)
      fonts.css                   (copy if vizs use the shared bundled fonts)
```

> **The test harness is not a single file.** `test-harness.html` references
> `shared/harness.css` (its stylesheet) and `splunk-logo.png` (header logo) by
> relative path. Copy **all three** from the master repo into `vizs/` — copying
> only `test-harness.html` leaves the local preview chrome unstyled (broken logo,
> collapsed layout). These are dev-only assets: `vizs/` is excluded from the
> packaged tarball, so they never ship to Splunk.

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
is_configured = false
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

If the app uses shared fonts, add `"fontCSS": "shared/fonts.css"` and create `vizs/shared/fonts.css`. See `legacy-harness.md` for the full manifest and categories contract.

### vizs/build.sh

This is the key script that makes the Dashboard Studio app pattern work. Each viz is developed as a standalone app under `vizs/{viz_name}/` with its own `default/`, `metadata/`, and `appserver/`. The build script compiles them and **merges** their configs and assets into the parent Splunk app so everything ships as a single installable package.

Copy `assets/dashboard-app-build.sh` from this skill to `vizs/build.sh`. Replace `{app_name}` in the status text with the actual app name, add visualization names to `APPS`, and mark the copied file executable.

What it does for each viz in `APPS`:

1. **Build** — npm install + webpack bundle in `vizs/{viz_name}/appserver/static/visualizations/{viz_name}/`
2. **Font CSS** — prepends `shared/fonts.css` to the viz's `visualization.css` (if not already present)
3. **Merge into parent** — copies built assets (`visualization.js`, `visualization.css`, `formatter.html`) into the parent app's `appserver/static/visualizations/{viz_name}/`, and appends config stanzas from the viz's `default/` and `README/` into the parent app's `visualizations.conf`, `savedsearches.conf`, `savedsearches.conf.spec`, and `default.meta`
4. **Version bump** — increments the parent app's patch version
5. **Package** — tarballs the parent app (excluding `vizs/`, `node_modules/`, dev files, `.git*`)
6. **Vet** — runs Splunk AppInspect with `--included-tags cloud` against the final tarball and
   **aborts the build** on any error/failure (report saved to `dist/appinspect-report.txt`).
   Requires `pip install splunk-appinspect` in the repo `.venv` (plus `brew install libmagic`
   on macOS); skips with a notice when not installed.

> **macOS cruft fails Splunk Cloud vetting** (`check_for_prohibited_files`). macOS
> scatters AppleDouble (`._*`) and `.DS_Store` files, and a `tar --exclude='._*'`
> pattern is anchored at the path root — it misses nested ones like
> `static/._appIconAlt.png`. The build template guards against this in four ways:
> (1) `xattr -rc` clears extended attributes; (2) `find … \( -name '._*' -o -name
> '.DS_Store' \) -delete` physically removes them before tarring (the reliable
> fix); (3) `tar --disable-copyfile --no-xattrs --no-mac-metadata` plus nested
> excludes (`*/._*`, `*/.DS_Store`, `__MACOSX`) stop tar re-creating them; and
> (4) a post-build assertion (`tar -tzf … | grep -qE '(^|/)\._|__MACOSX'`) aborts
> the build if any slip through. Keep all four when copying the template.

### vizs/test-harness.html (and its companion assets)

Reuse the target repository's schema-driven legacy harness when it has one. Otherwise create a generic host following `legacy-harness.md`: load `harness-manifest.json`, discover each visualization's `harness.json`, and generate interactive data and formatter controls without visualization-specific branches.

Keep all companion CSS, images, and optional shared font declarations beside the harness using paths that work from a local HTTP server. Do not fetch mutable harness files from an external repository during scaffolding. Validate the complete host rather than copying HTML without its assets.

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
