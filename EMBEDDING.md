# Embedding Custom Visualizations in a Splunk App

By default, each visualization in this repo is a standalone Splunk app. But you can also embed visualizations into an existing app — useful when you want to ship vizs alongside dashboards, saved searches, or other app content without requiring separate installs.

There are two approaches:

| Approach | Best for |
| --- | --- |
| **[Automated build pipeline](#automated-build-pipeline)** | New apps or apps that will bundle multiple vizs. Handles building, merging configs, version bumping, and packaging automatically. |
| **[Manual embedding](#manual-embedding)** | Adding a single viz to an existing app quickly. |

---

## Automated Build Pipeline

Use the `/splunk-viz` skill to scaffold a complete Dashboard Studio app with a `vizs/` build pipeline. This generates:

```text
your_app/
  .gitignore
  default/
    app.conf
    visualizations.conf           ← populated by build.sh
    savedsearches.conf            ← populated by build.sh
    data/ui/views/                ← your dashboards
  metadata/
    default.meta                  ← viz exports added by build.sh
  README/
    savedsearches.conf.spec       ← populated by build.sh
  vizs/
    build.sh                      ← builds, merges, packages
    harness-manifest.json         ← test harness registry
    test-harness.html             ← browser-based testing
    my_first_viz/                 ← standalone viz app (source)
    my_second_viz/                ← standalone viz app (source)
  appserver/
    static/
      visualizations/
        my_first_viz/             ← build output (merged)
        my_second_viz/            ← build output (merged)
```

### How it works

Each viz lives under `vizs/` as a standalone Splunk app with its own `default/`, `metadata/`, and source code. The `vizs/build.sh` script:

1. **Builds** each viz (npm install + webpack)
2. **Merges** the compiled output (`visualization.js`, `visualization.css`, `formatter.html`) into the parent app's `appserver/static/visualizations/`
3. **Consolidates** config stanzas from each viz into the parent app's `visualizations.conf`, `savedsearches.conf`, `savedsearches.conf.spec`, and `default.meta`
4. **Bumps** the app version in `app.conf`
5. **Packages** the app into a `.tar.gz` tarball (excluding `vizs/`, `node_modules/`, and dev files)

### Scaffolding a new app

```text
Using /splunk-viz, scaffold a Splunk Dashboard Studio app called "my_app"
with custom visualization support.
```

### Adding vizs to an existing app

Scaffold individual vizs into the `vizs/` directory using the normal `/splunk-viz` workflow, then add the viz name to the `APPS` array in `vizs/build.sh` and the `vizs` array in `vizs/harness-manifest.json`.

### Building

```bash
./vizs/build.sh              # Build and merge all vizs
./vizs/build.sh my_first_viz # Build and merge one viz
```

The tarball is output to the parent directory: `../{app_name}.tar.gz`

### Testing locally

```bash
cd vizs && python3 -m http.server 8080
```

Open `http://localhost:8080/test-harness.html` — the harness discovers all vizs from `harness-manifest.json`.

---

## Manual Embedding

For adding a single viz to an existing app without the full build pipeline.

## Directory Structure

Copy the visualization files into your existing app, preserving this layout:

```text
your_existing_app/
  default/
    app.conf                          (already exists)
    visualizations.conf               (add viz stanza)
    savedsearches.conf                (add example search, optional)
  metadata/
    default.meta                      (add viz export)
  README/
    savedsearches.conf.spec           (add viz settings)
  appserver/
    static/
      visualizations/
        {viz_name}/
          visualization.js            (built webpack bundle)
          visualization.css
          formatter.html
```

You only need the built `visualization.js` — not the `src/`, `node_modules/`, `webpack.config.js`, or `package.json` files. Those stay in this repo for development.

## Step-by-Step

### 1. Build the visualization

From this repo's root:

```bash
./build.sh {viz_name}
```

### 2. Copy the built files into your app

```bash
# Create the viz directory in your app
mkdir -p $SPLUNK_HOME/etc/apps/your_app/appserver/static/visualizations/{viz_name}

# Copy the three required viz files
cp examples/{viz_name}/appserver/static/visualizations/{viz_name}/visualization.js \
   $SPLUNK_HOME/etc/apps/your_app/appserver/static/visualizations/{viz_name}/

cp examples/{viz_name}/appserver/static/visualizations/{viz_name}/visualization.css \
   $SPLUNK_HOME/etc/apps/your_app/appserver/static/visualizations/{viz_name}/

cp examples/{viz_name}/appserver/static/visualizations/{viz_name}/formatter.html \
   $SPLUNK_HOME/etc/apps/your_app/appserver/static/visualizations/{viz_name}/
```

### 3. Add the visualization stanza to `visualizations.conf`

In your app's `default/visualizations.conf`, add:

```ini
[{viz_name}]
label = {Display Label}
description = {Description}
default_height = 400
allow_user_selection = true
disabled = 0
search_fragment = {example SPL fragment}
```

The stanza name must match the directory name under `appserver/static/visualizations/`.

### 4. Export the visualization

In your app's `metadata/default.meta`, add:

```ini
[visualizations/{viz_name}]
export = system
```

Without this, the visualization will only be visible within your app's dashboards.

### 5. Add settings to `savedsearches.conf.spec`

In your app's `README/savedsearches.conf.spec`, add every custom setting from the viz's formatter:

```ini
display.visualizations.custom.your_app.{viz_name}.setting1 = <string>
display.visualizations.custom.your_app.{viz_name}.setting2 = <boolean>
```

**Important**: The namespace changes when embedding. The setting prefix becomes `your_app.{viz_name}` instead of `{viz_name}.{viz_name}`. This is because Splunk uses the app name (not the viz app name) as the first part of the namespace.

### 6. Restart Splunk

```bash
$SPLUNK_HOME/bin/splunk restart
```

The visualization will now appear in the viz picker across all apps.

## Referencing the Viz in Dashboards

When using the embedded viz in saved searches or dashboard XML, the custom type reference uses your app name:

```ini
display.visualizations.custom.type = your_app.{viz_name}
```

## Embedding Multiple Visualizations

You can embed multiple vizs in the same app. Each one gets its own directory under `appserver/static/visualizations/` and its own stanza in `visualizations.conf`:

```text
your_existing_app/
  appserver/
    static/
      visualizations/
        custom_single_value/
          visualization.js
          visualization.css
          formatter.html
        component_status_board/
          visualization.js
          visualization.css
          formatter.html
```

When bundling multiple vizs, make sure every viz's custom settings are listed in the **single** `README/savedsearches.conf.spec` file in your app. Missing entries cause `splunk btool check` errors.

## Updating an Embedded Viz

When the visualization source changes:

1. Rebuild in this repo: `./build.sh {viz_name}`
2. Copy the updated `visualization.js` to your app
3. Navigate to `http://<splunk>:8000/en-US/_bump` and click "Bump version"
4. Hard-refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)

No Splunk restart needed unless you changed `visualizations.conf` or `savedsearches.conf`.
