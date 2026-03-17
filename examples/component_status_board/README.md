# Component Status Board — Splunk Custom Visualization

NOC-style grid of status tiles showing Splunk component health at a glance. Each tile displays a component name, error/warning counts, and a colour-coded status indicator. Critical components glow red and sort to the top; healthy components fade back. Click any tile to drilldown to that component's logs.

## Install

1. Copy or symlink the `component_status_board/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Component Status Board" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| -------- | ------ | ------------- |
| component | string | Component or host name (configurable via "Component Field" setting) |
| errors | integer | Error count for this component |
| warns | integer | Warning count for this component |
| status | string | One of: ok, warning, critical |

## Notes

- Tiles auto-flow into a responsive grid based on panel width
- Scrollable — the panel scrolls vertically when there are more tiles than fit
- Works on both light and dark Splunk dashboard themes
- Critical tiles glow and sort first; OK tiles are visually muted
- Click a tile to drilldown to that component's logs
- Supports real-time and historical searches

## Search

```spl
index=_internal sourcetype=splunkd log_level=* component=*
| stats count(eval(log_level="ERROR")) as errors
        count(eval(log_level="WARN")) as warns
        latest(_time) as last_seen
    by component
| eval status=if(errors>0,"critical",if(warns>0,"warning","ok"))
| sort -errors -warns
```

## Configuration

| Setting | Description | Default |
| --------- | ------------- | --------- |
| componentField | Column name for the component/host name | component |
| errorsField | Column name for the error count | errors |
| warningsField | Column name for the warning count | warns |
| statusField | Column name for the status value | status |
| title | Header text above the tile grid | COMPONENT STATUS |
| sortOrder | Tile ordering: severity or alphabetical | severity |
| showLegend | Show status legend in the header bar | true |
| showGlow | Red glow effect on critical tiles | true |
| mutedOk | Dim healthy component tiles to 55% opacity | true |

## Drilldown

Click any tile to drilldown to that component's error and warning logs. In Dashboard Studio, you need to configure the drilldown action on the panel:

1. Select the status board panel
2. Open **Drilldown** settings in the panel configuration sidebar
3. Click **+ Add Drilldown**
4. Set the action to **Link to search**
5. Use this search string:

```spl
index=_internal sourcetype=splunkd component="$row.component.value$" (log_level=ERROR OR log_level=WARN)
```

The `$row.component.value$` token receives the component name from the clicked tile. Quote the token value to handle component names with special characters (e.g., `AdminHandler:TCP`).

## Time Range

Controlled by the dashboard's global time picker. Use `-15m` to `now` for testing, or real-time (`rt-5m` to `rt`) for live monitoring.

## Build

From the repo root:

```bash
./build.sh component_status_board
```

The tarball is output to `dist/component_status_board-1.0.0.tar.gz`.
