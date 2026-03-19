# Gauge

A multi-mode gauge visualization for Splunk with four display modes, eight colour schemes, and optional LED indicators.

## Display Modes

| Mode | Description |
| --- | --- |
| **Arc** | Full 270-degree arc gauge with segmented colour zones, needle, tick marks, and centre readout |
| **Donut** | Thick ring gauge with centre value — compact and clean |
| **Bar** | Horizontal segmented bar with label and value — ideal for narrow panels |
| **Status** | On/off pill indicator for binary states (active/inactive, open/closed) |

## Installation

```bash
./build.sh gauge
$SPLUNK_HOME/bin/splunk install app dist/gauge-1.0.0.tar.gz
$SPLUNK_HOME/bin/splunk restart
```

## SPL Examples

### CPU Usage (Arc Gauge)

```spl
index=_internal source=*metrics.log group=pipeline
| stats avg(cpu_seconds) as value
| eval value=round(value, 1)
```

Settings: Max Value `100`, Unit `%`, Label `CPU USAGE`, Colour Scheme `Green to Red (gradual)`

### Memory Usage (Donut)

```spl
| rest /services/server/status/resource-usage/hostwide
| eval value=round(mem_used / mem * 100, 1)
| table value
```

Settings: Display Mode `donut`, Max Value `100`, Unit `%`, Label `MEMORY`

### Response Time (Arc Gauge)

```spl
index=web sourcetype=access_combined
| stats avg(response_time) as value
| eval value=round(value, 0)
```

Settings: Max Value `5000`, Unit `ms`, Label `RESPONSE TIME`, Colour Scheme `Blue to Red`

### Disk Usage (Bar)

```spl
| rest /services/server/status/partitions-space
| eval value=round((capacity - free) / capacity * 100, 1)
| table value
```

Settings: Display Mode `bar`, Max Value `100`, Unit `%`, Label `DISK`, Colour Scheme `Red to Green (inverted)`

### Service Status (Status Mode)

```spl
index=_internal source=*metrics.log group=pipeline name=typing
| stats latest(cpu_seconds) as cpu
| eval value=if(cpu > 0, "ACTIVE", "DOWN")
```

Settings: Display Mode `status`, Field Name `value`

### Quick Test

```spl
| makeresults | eval value=75
```

## Colour Schemes

| Scheme | Gradient |
| --- | --- |
| Teal to Red | Teal → white → orange → red |
| Green to Red (stepped) | Green → yellow → orange → red → magenta |
| Green to Red (gradual) | Green → yellow → orange → red |
| Green to Red (early) | Green → yellow → orange → red (shifts earlier) |
| Blue to Red | Blue → teal → yellow → orange → red |
| Blue-Green to Red | Blue → green → orange → red |
| Red to Green (inverted) | Red → orange → yellow → green |
| Green to Purple | Green → yellow → orange → red → magenta |

## Formatter Settings

### Gauge Settings

| Setting | Default | Description |
| --- | --- | --- |
| Display Mode | `arc` | Arc, Donut, Bar, or Status |
| Field Name | `value` | Column name from your search |
| Max Value | `100` | Maximum value for the scale |
| Unit | `%` | Label shown below the value |
| Label | (empty) | Title shown above the gauge |
| Label Align | `center` | Left, centre, or right |
| Colour Scheme | `Teal to Red` | Predefined colour gradient |
| Show LED Indicators | `false` | Row of LED dots above the arc |
| LED Indicator Field | `led_percent` | Column for LED percentage (0-100) |

### Appearance

| Setting | Default | Description |
| --- | --- | --- |
| Show Tick Marks | `true` | Major and minor ticks around the arc |
| Show Glow Effect | `true` | Subtle glow on the leading edge |
| Font Size | `0` (auto) | Override value font size in pixels |
| Alignment | `center` | Horizontal alignment for Status mode |

## Screenshot

![Gauge](../../screenshots/gauge.png)
