# World Cup Dashboard — Splunk App

An executive Dashboard Studio app for the World Cup, bundling two custom
visualizations and a ready-to-run dashboard that reframes operational telemetry
as business KPIs. Built to replace per-minute line charts and country pie
charts with delta-driven single values and ranked market bars.

## Contents

- **Single Value + Delta** (`single_value_delta`) — headline KPI tiles with an
  optional colour-coded delta badge and sparkline.
- **Top Markets** (`top_markets`) — ranked country bars with colour flags,
  values and share %, replacing pie charts.
- **World Cup Dashboard** — a Dashboard Studio view laying out four KPI tiles
  (active customers, registrations, experience, stakes) above two market-reach
  panels (logins and registrations by country).

Both visualizations render in the bundled Clash Display font.

## Demo data

The dashboard ships with self-contained `makeresults` queries so it renders
immediately after install. Swap each dataSource query in the dashboard editor
for your real searches — the visualizations expect:

- KPI tiles: a time series with `value` and `delta` columns (latest row drives
  the headline; the series drives the sparkline).
- Market panels: `country` (ISO code or name) and `count` columns.

## Install

1. Build the app (see below) to produce `worldcup_dashboard.tar.gz`.
2. In Splunk: **Apps → Manage Apps → Install app from file**, upload the tarball.
3. Open **World Cup Dashboard** from the app menu.

## Build

The visualizations live under `vizs/` as standalone source apps. The build
script compiles them, prepends the shared Clash Display font, merges their
assets and config into this app, bumps the version, and packages the tarball:

```bash
./vizs/build.sh
```

Output: `worldcup_dashboard.tar.gz` (one level above the app directory).

To rebuild a single visualization:

```bash
./vizs/build.sh top_markets
```

## Local preview

From the `vizs/` directory, serve the generic test harness to preview either
visualization with sample data and live controls:

```bash
cd vizs && python3 -m http.server 8080
```

Open `http://localhost:8080/test-harness.html`.

## Notes

- The app ID uses an underscore (`worldcup_dashboard`) — Splunk's custom-viz
  config namespace (`{app_id}.{viz}`) does not tolerate hyphens.
- `appserver/static/visualizations/` is a build artifact; source lives under
  `vizs/`.
