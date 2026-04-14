# World Cup Bracket — Splunk Custom Visualization

Tournament bracket visualization where match nodes pulse/glow based on current betting activity.

## Overview

Displays a horizontal bracket layout progressing from Round of 16 through Quarter Finals, Semi Finals, to the Final. Each match is a rounded rectangle card showing two team names and betting volume. Cards glow based on volume intensity (brighter = more active). Connecting lines between rounds show progression, and winners are highlighted with an accent color.

## Expected SPL Columns

| Column | Required | Description |
| --- | --- | --- |
| `round` | Yes | Round identifier: "R16", "QF", "SF", "F" |
| `position` | Yes | Position within round (1-8 for R16, etc.) |
| `team1` | Yes | First team name |
| `team2` | Yes | Second team name |
| `volume` | Yes | Betting volume (numeric) |
| `winner` | No | Winning team name (empty if undecided) |

## Configuration Settings

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `colorLow` | Color picker | `#1a2a4a` | Color for low betting volume cards |
| `colorHigh` | Color picker | `#ff6600` | Color for high betting volume cards |
| `showVolume` | Radio | `true` | Show/hide volume numbers on cards |
| `cardWidth` | Text | `0` | Fixed card width in px (0 = auto) |
| `showConnectors` | Radio | `true` | Show/hide connecting lines between rounds |
| `accentColor` | Color picker | `#00ff88` | Highlight color for winning teams |

## Build

```bash
cd appserver/static/visualizations/wc_bracket
npm install
npm run build
```

## Sample SPL

```spl
| makeresults count=15
| streamstats count as pos
| eval round=case(pos<=8,"R16",pos<=12,"QF",pos<=14,"SF",pos<=15,"F")
| eval position=case(round="R16",pos,round="QF",pos-8,round="SF",pos-12,round="F",1)
| eval team1=case(pos=1,"England",pos=2,"France",pos=3,"Brazil",pos=4,"Argentina",pos=5,"Spain",pos=6,"Germany",pos=7,"Netherlands",pos=8,"Portugal",pos=9,"England",pos=10,"Brazil",pos=11,"Spain",pos=12,"TBD",pos=13,"TBD",pos=14,"TBD",pos=15,"TBD")
| eval team2=case(pos=1,"Japan",pos=2,"Poland",pos=3,"South Korea",pos=4,"Australia",pos=5,"Morocco",pos=6,"Denmark",pos=7,"USA",pos=8,"Switzerland",pos=9,"France",pos=10,"Argentina",pos=11,"TBD",pos=12,"TBD",pos=13,"TBD",pos=14,"TBD",pos=15,"TBD")
| eval volume=case(pos=1,8500,pos=2,7200,pos=3,9100,pos=4,6800,pos=5,5400,pos=6,4900,pos=7,6200,pos=8,5800,pos=9,12500,pos=10,15000,pos=11,3200,pos=12,1800,pos=13,800,pos=14,600,pos=15,400)
| eval winner=case(pos=1,"England",pos=2,"France",pos=3,"Brazil",pos=4,"Argentina",pos=5,"Spain",1=1,"")
| table round position team1 team2 volume winner
```
