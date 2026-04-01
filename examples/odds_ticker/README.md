# Live Odds Ticker — Splunk Custom Visualization

Horizontal scrolling ticker showing real-time World Cup betting odds changes. Think stock market ticker but for World Cup betting markets.

## Expected SPL Columns

| Column       | Required | Description                                  |
|--------------|----------|----------------------------------------------|
| `market`     | Yes      | Market name (e.g., "England to Win")         |
| `odds`       | Yes      | Current decimal odds (e.g., "2.50")          |
| `prev_odds`  | No       | Previous odds for direction calculation      |
| `bet_volume` | No       | Number of bets placed on this market         |

## Sample SPL

```spl
| makeresults count=10 | streamstats count as idx
| eval market=case(idx=1,"England to Win",idx=2,"France to Win",idx=3,"Draw",idx=4,"Mbappé First Goal",idx=5,"Kane Anytime Scorer",idx=6,"Over 2.5 Goals",idx=7,"Under 2.5 Goals",idx=8,"Both Teams to Score",idx=9,"England Clean Sheet",idx=10,"First Half Draw")
| eval odds=case(idx=1,"2.50",idx=2,"3.10",idx=3,"3.40",idx=4,"6.50",idx=5,"2.80",idx=6,"1.85",idx=7,"2.00",idx=8,"1.75",idx=9,"3.25",idx=10,"2.10")
| eval prev_odds=case(idx=1,"2.80",idx=2,"2.90",idx=3,"3.40",idx=4,"7.00",idx=5,"2.60",idx=6,"1.90",idx=7,"1.95",idx=8,"1.80",idx=9,"3.00",idx=10,"2.15")
| eval bet_volume=case(idx=1,"45230",idx=2,"38100",idx=3,"12500",idx=4,"8900",idx=5,"22100",idx=6,"31000",idx=7,"18700",idx=8,"27500",idx=9,"9800",idx=10,"14200")
| fields market odds prev_odds bet_volume
```

## Formatter Settings

| Setting       | Type         | Default     | Description                                    |
|---------------|--------------|-------------|------------------------------------------------|
| `scrollSpeed` | select       | `medium`    | Scroll speed: slow, medium, fast               |
| `bgColor`     | color picker | `#0d0d1a`   | Background color of the ticker strip           |
| `upColor`     | color picker | `#00cc66`   | Color for shortening odds (more bets)          |
| `downColor`   | color picker | `#ff4444`   | Color for lengthening odds (fewer bets)        |
| `showVolume`  | radio        | `true`      | Show/hide bet volume on each item              |
| `itemSpacing` | text         | `40`        | Pixels between ticker items                    |
| `fontSize`    | select       | `medium`    | Text size: small, medium, large                |

## Build

```bash
cd appserver/static/visualizations/odds_ticker
npm install
npm run build
```

## Deploy

Copy the `odds_ticker/` directory to `$SPLUNK_HOME/etc/apps/` and restart Splunk.
