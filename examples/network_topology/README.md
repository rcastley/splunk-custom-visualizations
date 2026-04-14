# Network Topology — Splunk Custom Visualization

An interactive network topology visualization that shows nodes as circles connected by edges/links using a force-directed layout. Supports status-based node coloring, directional arrows, and configurable appearance.

## Install

1. Copy or symlink the `network_topology/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Network Topology" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| source | string | Source node name |
| dest | string | Destination node name |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| weight | number | Edge weight controlling line thickness (1-10) |
| status | string | Node status for coloring: ok, warning, or critical |

## Notes

- Each unique value in `source` and `dest` columns becomes a node
- Edges connect source to destination nodes
- The force-directed layout runs a configurable number of iterations per render
- Node status is determined by the last seen status value for that node
- Weight values scale the base edge thickness

## Search

```spl
| makeresults count=1
| eval raw="load-balancer-01,web-server-01,8,ok;load-balancer-01,web-server-02,7,ok;web-server-01,api-gateway-01,5,ok;api-gateway-01,auth-service,3,ok;api-gateway-01,order-service,6,ok;order-service,db-primary,7,ok;db-primary,db-replica-01,9,ok"
| makemv delim=";" raw
| mvexpand raw
| rex field=raw "(?<source>[^,]+),(?<dest>[^,]+),(?<weight>[^,]+),(?<status>[^,]+)"
| fields source dest weight status
| appendpipe [| stats count | where count=0 | eval _status="Awaiting network data", source="", dest="", weight="0", status="ok"]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| nodeColor | Default fill color for nodes | #4FC3F7 |
| edgeColor | Default color for edges | #555555 |
| nodeSize | Base radius of nodes in pixels | 8 |
| showLabels | Display node name labels | true |
| labelSize | Font size for node labels | 10 |
| edgeThickness | Base width of edges in pixels | 1.5 |
| layoutIterations | Force simulation iterations | 100 |
| showArrows | Directional arrows on edges | false |
| statusColors | Enable status-based node coloring | true |
| okColor | Node color for ok status | #4CAF50 |
| warnColor | Node color for warning status | #FF9800 |
| critColor | Node color for critical status | #F44336 |

## Time Range

`-60m` to `now` (or any range that produces the expected columns)

## Build

From the repo root:

```bash
./build.sh network_topology
```

The tarball is output to `dist/network_topology-1.0.0.tar.gz`.
