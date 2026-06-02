# Single Value + Delta — Splunk Custom Visualization

An executive KPI tile: a large headline value with optional prefix and suffix,
an optional colour-coded delta badge with trailing text, and an optional
sparkline. Transparent by default with an optional fill colour and a rounded
border. Renders in the bundled Clash Display font.

The four panels in the Flutter "Customer Growth & Experience" mockup — active
customers (`128.4K · ▲ 3.1×`), new registrations (`9,847 · 62%`), customer
experience (`99.4% · ▲ 0.3pt`) and live stakes (`£4.7M · ▲ 2.8×`) — are all the
same visualization with different settings.

## Install

1. Copy or symlink the `single_value_delta/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Single Value + Delta" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| `value` | number | The metric. The latest row is the headline; the full series feeds the sparkline. Column name is configurable. |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| `delta` | number | Pre-computed delta shown in the badge. Sign drives the arrow and colour. Omit the column to hide the badge. Column name is configurable. |

## Notes

- The viz reads the **last** row for the headline value and delta, and the full
  series of the value column for the sparkline — feed it a `timechart`.
- The delta is **supplied by your SPL**, not computed by the viz, so it can be a
  percentage, a multiplier (`×`), points (`pt`) or anything else.
- Colour is automatic from the delta's sign. "Higher Is Better" inverts it for
  metrics where lower is good (latency, churn).
- Background is transparent by default so the tile inherits the dashboard.

## Search

```spl
index=prod_session action=login brand IN (paddypower, betfair)
| timechart span=5m dc(customer_id) as value
| eventstats avg(eval(if(_time < relative_time(now(), "-90m"), value, null()))) as baseline
| eval delta = round(value / baseline, 1)
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| Value Field | Column holding the metric | `value` |
| Delta Field | Column holding the pre-computed delta | `delta` |
| Title | Optional heading above the value | (empty) |
| Alignment | Aligns title, value and delta row | `left` |
| Value Prefix | Text before the value (e.g. `£`) | (empty) |
| Value Suffix | Text after the value (e.g. `K`, `%`) | (empty) |
| Group Thousands | Insert thousands separators | `true` |
| Value Colour | Headline value colour | `#ffffff` |
| Delta Suffix | Text after the delta (e.g. `×`, `%`, `pt`) | (empty) |
| Trailing Text | Text to the right of the badge | (empty) |
| Show Arrow | Show a ▲/▼ direction arrow | `true` |
| Higher Is Better | Invert good/bad colouring | `true` |
| Positive Colour | Badge colour for the good direction | `#61D27E` |
| Negative Colour | Badge colour for the bad direction | `#D5225D` |
| Show Sparkline | Plot the value series | `true` |
| Sparkline Colour | Line and fill colour | `#61D27E` |
| Sparkline Fill | Soft gradient under the line | `true` |
| Fill Colour | Panel background | `transparent` |
| Show Border | Draw a rounded border | `true` |
| Border Colour | Border colour | `#2A3566` |
| Corner Radius | Border corner radius (px) | `16` |

## Time Range

`-3h` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk
Cloud vetting rejects real-time saved searches
(`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh single_value_delta
```

The tarball is output to `dist/single_value_delta-1.0.0.tar.gz`. The build
prepends the shared Clash Display `@font-face` CSS into `visualization.css`
automatically.
