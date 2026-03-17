# Splunk Custom Visualizations

This repo contains a Claude Code skill for building Splunk custom visualizations and working examples.

## Key Paths

- **Skill**: `.claude/skills/splunk-viz/SKILL.md` — the full skill definition
- **Examples**: `examples/` — each subdirectory is a standalone Splunk viz app
- **Build**: `./build.sh [app_name]` — builds and packages viz apps into `dist/`

## Rules

- All visualizations go in `examples/{app_name}/`
- Follow the directory structure defined in the skill (do not deviate)
- Use ES5 syntax only in visualization_source.js (var, function, for — no const/let/arrow)
- Always handle HiDPI, null ctx, and zero-size canvas
- Keep `visualization.css` background transparent by default
- Every setting in `formatter.html` must also appear in `savedsearches.conf.spec`
- JS defaults must match formatter HTML defaults (Splunk doesn't send formatter defaults on first load)
- Never read `config` in `formatData` — do it in `updateView`
- Use `./build.sh` to package — it excludes src/, node_modules/, and dev files from the tarball
