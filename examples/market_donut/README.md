# Market Depth Donut — Splunk Custom Visualization

Nested donut chart where the outer ring shows bet type categories (Match Result, Goal Scorer, etc.) and the inner ring shows specific markets within each category. Segment size is proportional to betting volume with color coding per category. Designed for World Cup betting dashboards with a dark NOC display aesthetic.

## Install

1. Copy or symlink the `market_donut/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Market Depth Donut" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| category | string | Parent bet category (e.g., "Match Result") |
| market | string | Specific market (e.g., "England Win", "Draw") |
| volume | number | Betting volume for this market |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| profit_loss | number | P&L indicator: positive = profit, negative = loss |

## Notes

- Each row represents one specific market within a category.
- Categories are automatically grouped and colored from the selected palette.
- Inner ring segments inherit shaded variants of their parent category color.
- Hover over any segment to see a tooltip with name, volume, and percentage.
- The center displays the grand total of all betting volume.

## Search

```spl
index=betting sourcetype=worldcup_bets
| stats sum(volume) as volume by category, market
| appendpipe [| stats count | where count=0 | eval _status="Awaiting betting data", category="", market="", volume=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| palette | Color palette: vibrant, pastel, neon | vibrant |
| showLabels | Display category labels around the outer ring | true |
| showCenter | Display total volume in the center | true |
| showInnerLabels | Display market labels on the inner ring | false |
| gapAngle | Degrees of gap between segments (0-5) | 1 |
| ringRatio | Inner ring radius as fraction of outer (0.3-0.9) | 0.6 |
| outerThickness | Outer ring thickness in pixels (0 = auto) | 0 |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh market_donut
```

The tarball is output to `dist/market_donut-1.0.0.tar.gz`.
