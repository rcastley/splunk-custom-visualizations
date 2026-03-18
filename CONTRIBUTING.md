# Contributing

Thank you for your interest in contributing to the Splunk Custom Visualizations project. This guide covers everything you need to get started.

## Prerequisites

- **Node.js** (v16+) and **npm**
- **Splunk Enterprise** (for testing) — a local dev instance is recommended
- Familiarity with Canvas 2D and the [Splunk Custom Visualization API](https://docs.splunk.com/Documentation/Splunk/latest/AdvancedDev/CustomVizDevOverview)

## Project Structure

```text
splunk-custom-visualizations/
├── build.sh              # Build and package script
├── examples/             # Each subdirectory is a standalone Splunk viz app
│   └── {app_name}/
│       ├── default/
│       │   ├── app.conf
│       │   ├── savedsearches.conf
│       │   └── savedsearches.conf.spec
│       ├── metadata/
│       │   └── default.meta
│       └── appserver/static/visualizations/{app_name}/
│           ├── src/
│           │   └── visualization_source.js   # Source (ES5 only)
│           ├── formatter.html                # Settings UI
│           ├── visualization.css             # Styles
│           ├── package.json
│           └── webpack.config.js
├── dist/                 # Built tarballs (git-ignored)
└── screenshots/          # Screenshots used in documentation
```

## Creating a New Visualization

1. **Use the splunk-viz skill** — run `/splunk-viz` in Claude Code to scaffold a new visualization interactively. It generates all required files with the correct structure.

2. **Or copy an existing example** — duplicate an `examples/{app_name}/` directory, rename it, and update the identifiers in `app.conf`, `visualizations.conf`, and `package.json`.

## Development Rules

These rules are enforced by the project and must be followed in all contributions:

### ES5 Only

All code in `visualization_source.js` must use ES5 syntax. This is a Splunk framework requirement.

- Use `var`, not `const` or `let`
- Use `function` declarations, not arrow functions
- Use `for` loops, not `.map()` / `.forEach()` / `.filter()`
- No template literals, destructuring, or spread operators

### Canvas and Rendering

- Always handle **HiDPI displays** — scale the canvas by `window.devicePixelRatio`
- Guard against **null context** — check `ctx` before drawing
- Guard against **zero-size canvas** — bail early if width or height is 0
- Keep `visualization.css` background **transparent** by default

### Settings and Configuration

- Every setting in `formatter.html` **must** have a matching entry in `savedsearches.conf.spec`
- JS default values **must** match formatter HTML defaults — Splunk does not send formatter defaults on first load
- Never read `config` in `formatData` — do it in `updateView`

## Building

Use the build script at the project root — do not run npm/webpack manually:

```bash
# Build all visualizations
./build.sh

# Build a specific one
./build.sh component_status_board
```

This handles npm install, webpack bundling, and tarball packaging into `dist/`. The tarball excludes `src/`, `node_modules/`, and dev files automatically.

## Installing for Testing

After building:

```bash
$SPLUNK_HOME/bin/splunk install app dist/{app_name}-{version}.tar.gz
$SPLUNK_HOME/bin/splunk restart
```

Or copy the app directory directly for faster iteration during development:

```bash
cp -r examples/{app_name} $SPLUNK_HOME/etc/apps/
$SPLUNK_HOME/bin/splunk restart
```

Use `/_bump` in the Splunk URL to reload static assets without a full restart when changing only JS/CSS.

## Submitting Changes

1. Fork the repository and create a feature branch
2. Make your changes following the rules above
3. Test in Splunk — verify the visualization renders correctly in both light and dark themes
4. Run `./build.sh {app_name}` to confirm the build succeeds
5. Open a pull request with:
   - A description of what the visualization does
   - A screenshot showing it in action
   - The SPL query used for testing

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
