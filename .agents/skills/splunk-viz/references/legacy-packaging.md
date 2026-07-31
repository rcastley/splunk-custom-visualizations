# Legacy Build, Packaging, and Verification

Use this reference when building, packaging, vetting, or completing a legacy visualization.

## Contents

- [Build](#build)
- [Package](#package)
- [Vetting](#vetting)
- [Completion checklist](#completion-checklist)

## Build

Prefer the repository's existing shared build command. In this repository:

```bash
./build.sh {app_name}
```

The build must install dependencies when needed, run webpack, verify `visualization.js`, and preserve source files. Do not introduce a per-visualization build script when the repository already owns packaging centrally.

## Package

Package the app root, not its parent directory. Name the archive from the app ID and semantic version. Exclude:

- `node_modules/`, `src/`, caches, and temporary generators
- `package.json`, lockfiles, and webpack configuration unless the deployment explicitly requires them
- `.git`, `.github`, `.gitignore`, `.gitkeep`, `.DS_Store`, and other development artifacts
- harness fixtures and picker previews only when the repository's established package policy excludes them; keep runtime-required CSS, formatter, metadata, and visualization assets

Inspect the archive contents instead of assuming exclusion flags worked.

## Vetting

For Splunk Cloud or a dual target:

- Keep `[id]` and `[launcher]` semantic versions synchronized.
- Ship `is_configured = false`.
- Omit `[triggers]` for `visualizations.conf`.
- Include the global `[]` access stanza and `sc_admin` write access in `metadata/default.meta`.
- Use historical saved-search time ranges.
- Include all four app icons.
- Run the applicable AppInspect or Cloud vetting checks and resolve actionable findings.

## Completion checklist

- [ ] App ID, package ID, visualization stanza, directory name, and custom visualization type agree.
- [ ] Label, description, and search fragment satisfy picker limits.
- [ ] README documents fields, SPL, settings, time range, build, and drilldown where applicable.
- [ ] Formatter, runtime defaults, saved search, `.spec`, README, and harness agree.
- [ ] Runtime validates fields and handles loading, empty, invalid, valid, and recovered states.
- [ ] Canvas handles HiDPI, zero-size containers, null contexts, resize, and theme contrast.
- [ ] Teardown cancels listeners, animation frames, timers, observers, and owned DOM.
- [ ] Four app icons and the 116×76 picker preview exist and have correct dimensions.
- [ ] `harness.json` is registered and interactive controls cover meaningful ranges.
- [ ] Production bundle builds without errors.
- [ ] Archive contains required runtime files and excludes development artifacts.
- [ ] AppInspect/vetting passes for the selected deployment target.
- [ ] Installed package is smoke-tested on the minimum supported Splunk version when available.
