# Category Breakdown — Splunk Custom Visualization

A snapshot ranked breakdown that replaces legend-heavy multi-series charts (a
dominant series plus a long tail of categories). A single-value-style headline
sits above `top_markets`-style ranked bars, aggregated over the time window.

- Set a **primary category** (e.g. `SUCCESS`) and the headline becomes a
  RAG-coloured rate (`primary ÷ total %`); that category is excluded from the
  bars so you see the failure/category mix.
- Leave it unset and the headline is the **grand total** and every category
  ranks.
- The long tail collapses into a single **"Other"** bar (Top N + Other), so the
  shares add to 100%.

Renders in the bundled Clash Display font.

## Install

This viz ships inside the **World Cup Dashboard** app. Build that app
(`./vizs/build.sh` from the app root) and install the resulting tarball; the
"Category Breakdown" visualization then appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| `category` | string | The category name (one row per category). Configurable. |
| `count` | number | The aggregated value for that category. Configurable. |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| `delta` | number | Precomputed headline delta (e.g. rate vs prior window). Read from the primary category's row, else the first row. Omit to hide the badge. |

## Notes

- Aggregate to **one row per category** in SPL (`stats ... by category`); the
  viz handles ranking, Top N and the "Other" roll-up.
- Share % is `value ÷ breakdown total`. With a primary category the denominator
  is the non-primary total, so failure shares answer "of all failures, how many
  are X?".
- Headline RAG via the `colorMode` + threshold stops (fixed by default).

## Search

```spl
index="sportsbook-shared" host="ie*-scosbg*-prd.prd.betfair" respStatus=* sourcetype="cougar-server"
| stats count by respStatus
| rename respStatus as category, count as value
```

Set Primary Category = `SUCCESS` → the headline becomes the cashout success
rate and the bars show the failure reasons.

For SBG Bingo (leave Primary Category blank → headline = total, top games rank):

```spl
index="gaming-gap-uki" deployment_tag=sbg product=BINGO sourcetype=custom_log4j gameName=*
| stats count by gameName
| rename gameName as category, count as value
```

> The source dashboards use `timechart count by <field>` (wide, one column per
> category). This viz wants the **long** form — swap `timechart` for `stats` and
> rename to `category` / `value`. The viz handles ranking, Top N and the "Other"
> roll-up, so you don't need `timechart`'s `useother`.

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| Category Field | Column with the category name | `category` |
| Value Field | Column with the aggregated value | `count` |
| Delta Field | Optional headline delta column | `delta` |
| Primary Category | Category that becomes the headline rate (excluded from bars) | (empty) |
| Headline Label | Text to the right of the headline | (empty) |
| Headline Suffix | Text after the headline number (e.g. `%`) | (empty) |
| Headline Colour | Headline colour when Colour Mode is Fixed | `#ffffff` |
| Abbreviate Values | Shorten numbers (54100 → 54.1K) | `true` |
| Delta Suffix | Text after the delta (e.g. `pt`) | (empty) |
| Show Arrow | Show a ▲/▼ arrow on the delta | `true` |
| Higher Is Better | Invert good/bad colouring | `true` |
| Positive / Negative Colour | Delta badge colours | green / red |
| Colour Mode | `fixed` or `thresholds` (RAG headline) | `fixed` |
| Stop 1–5 Threshold / Colour | RAG stops (value ≥ threshold, highest wins) | red→green ramp |
| Title / Tag Text / Tag Colour | Panel header | (empty) / (empty) / `#F8CD4B` |
| Top N | Categories shown as bars | `6` |
| Roll Up Tail | Sum the remainder into an "Other" bar | `true` |
| Other Label | Label for the rolled-up bar | `Other` |
| Show Share % | Show each bar's share | `true` |
| Bar Start / End Colour | Bar gradient | blue → sky |
| Fill Colour | Panel background | `transparent` |
| Show Border / Border Colour / Corner Radius | Panel frame | on / `#2A3566` / `16` |
| Show Accent / Position / Colour | Accent strip on an edge: left/top/right (brand colours) | off / `top` / `#0285FF` |

## Time Range

`-60m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk
Cloud vetting rejects real-time saved searches.

## Build

From the World Cup Dashboard app root:

```bash
./vizs/build.sh category_breakdown
```

The viz is merged into the app and packaged to
`dist/worldcup_dashboard.tar.gz`.
