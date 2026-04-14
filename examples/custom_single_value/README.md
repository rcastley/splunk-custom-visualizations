# Custom Single Value — Splunk Custom Visualization

General-purpose single value display. Point it at any search field to render the value with configurable colour, weight (bold/regular), alignment, glow effect, and an optional label. Uses system fonts — no external dependencies.

## Install

1. Copy or symlink the `custom_single_value/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Custom Single Value" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| (configurable) | string/number | The field to display — set via the "Field Name" setting (default: `value`) |

## Notes

- Text auto-scales to fit the available panel space
- Works with any search — just set the field name to match your column
- Leave the label empty for value-only display

## Search

```spl
| makeresults | eval value="Hello Splunk!"
```

Or use with any real search:

```spl
index=main sourcetype=access_combined
| stats count as value
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| field | Column name from your search to display | value |
| color | Hex colour for the value text | #E20082 |
| weight | Font weight: bold or normal | bold |
| align | Horizontal alignment: left, center, right | center |
| valign | Vertical alignment: top, middle, bottom | middle |
| label | Optional label text (leave empty for none) | (empty) |
| labelColor | Hex colour for the label text | #888888 |
| labelAlign | Label horizontal alignment: left, center, right | center |
| showGlow | Add glow effect using the text colour | false |

## Time Range

Any — works with both real-time and historical searches.

## Build

From the repo root:

```bash
./build.sh custom_single_value
```

The tarball is output to `dist/custom_single_value-1.0.0.tar.gz`.
