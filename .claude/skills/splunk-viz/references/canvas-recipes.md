# Canvas 2D Recipes

Use these as starting points for drawing code in `updateView`. All functions use ES5 syntax and follow the helper-function pattern (pure functions, no `this`).

## Color Scales

```javascript
// Linear interpolation between two hex colors
function lerpColor(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bl = Math.round(ab + (bb - ab) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

// Map a value to a color on a gradient (low → mid → high)
function valueToColor(val, min, max, lowColor, midColor, highColor) {
    var t = Math.max(0, Math.min(1, (val - min) / (max - min)));
    if (t <= 0.5) return lerpColor(lowColor, midColor, t * 2);
    return lerpColor(midColor, highColor, (t - 0.5) * 2);
}
```

## Threshold (RAG) Colour Mapping

For status colouring where a value should snap to a discrete band (Red/Amber/Green,
or a finer N-step scale) rather than a continuous gradient, use threshold **stops**.
The value takes the colour of the highest stop whose threshold it meets/exceeds.

```javascript
// Up to N (threshold, colour) stops read from config. Returns the colour of the
// highest stop whose threshold `num` meets/exceeds, or null if below every stop
// (blank / non-numeric thresholds are skipped). Pure — takes config, not `this`.
function pickThresholdColor(config, ns, num, maxStops) {
    var stops = [];
    for (var i = 1; i <= (maxStops || 5); i++) {
        var t = config[ns + 'threshold' + i];
        if (t === undefined || t === null || t === '') continue;   // blank = disabled
        var tn = parseFloat(t);
        if (isNaN(tn)) continue;
        stops.push({ t: tn, c: config[ns + 'bandColor' + i] || '#ffffff' });
    }
    if (!stops.length) return null;
    stops.sort(function(a, b) { return a.t - b.t; });
    var chosen = null;
    for (var k = 0; k < stops.length; k++) {
        if (num >= stops[k].t) chosen = stops[k].c;
    }
    return chosen;            // null → caller keeps its fixed colour
}

// In updateView, after reading the numeric value:
var color = config[ns + 'valueColor'] || '#ffffff';
if ((config[ns + 'colorMode'] || 'fixed') === 'thresholds' && !isNaN(valueNum)) {
    var rag = pickThresholdColor(config, ns, valueNum, 5);
    if (rag) color = rag;
}
```

Formatter / config pattern that goes with it:

- **`colorMode` toggle** — `fixed` (default, uses the existing colour) vs `thresholds`.
  Default to `fixed` so existing panels are unchanged until the user opts in.
- **Paired stops** — `threshold1..N` (text inputs) + `bandColor1..N` (colour pickers).
  Leaving a threshold blank disables that stop, so 3 stops give classic RAG and up
  to N give a finer scale — no separate "how many bands" setting needed.
- **"Highest stop wins" + `>=`** is the model. Tell users to set the lowest stop to
  their minimum (e.g. `0`) so every value lands in a band; below all stops the
  helper returns `null` and the caller falls back to the fixed colour.
- **Scope deliberately.** Decide whether the colour applies to the value text only,
  or also the sparkline/border, and document it — don't recolour everything by default.
- Document every `thresholdN` / `bandColorN` key in `savedsearches.conf.spec`
  (`<float>` / `<string>`) and mirror the defaults in `savedsearches.conf`,
  `formatter.html`, and `harness.json` (rule 19).

## Rounded Rectangles

```javascript
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}
```

> **Note:** Modern browsers (Chrome 104+, Firefox 118+, Safari 16.4+) support the native `ctx.roundRect(x, y, w, h, r)` API, which can be used instead of this helper. The custom function provides broader compatibility for Splunk environments that may run older browsers.

## Arcs / Gauges

```javascript
function drawArc(ctx, cx, cy, radius, startDeg, endDeg, color, lineWidth) {
    var startRad = (startDeg - 90) * Math.PI / 180;
    var endRad = (endDeg - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startRad, endRad, false);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
}
```

## Legends

```javascript
// Swatch size per Splunk design guidelines: 16x12px
function drawLegend(ctx, items, x, y, fontSize) {
    var swatchW = 16, swatchH = 12;
    var padding = fontSize * 0.5;
    var currentX = x;
    ctx.font = fontSize + 'px sans-serif';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < items.length; i++) {
        ctx.fillStyle = items[i].color;
        ctx.fillRect(currentX, y, swatchW, swatchH);
        ctx.fillStyle = '#3C444D';
        currentX += swatchW + padding;
        ctx.fillText(items[i].label, currentX, y + swatchH / 2);
        currentX += ctx.measureText(items[i].label).width + padding * 2;
    }
}
```

## Grid / Table Layouts

```javascript
// Calculate cell positions for a grid layout
function gridLayout(totalWidth, totalHeight, rows, cols, padding) {
    var cellW = (totalWidth - padding * (cols + 1)) / cols;
    var cellH = (totalHeight - padding * (rows + 1)) / rows;
    var cells = [];
    for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
            cells.push({
                x: padding + c * (cellW + padding),
                y: padding + r * (cellH + padding),
                w: cellW,
                h: cellH
            });
        }
    }
    return { cells: cells, cellW: cellW, cellH: cellH };
}
```

## Responsive Text

```javascript
// Fit text to a maximum width by reducing font size
function fitText(ctx, text, maxWidth, maxFontSize, fontFamily) {
    var size = maxFontSize;
    ctx.font = size + 'px ' + fontFamily;
    while (ctx.measureText(text).width > maxWidth && size > 8) {
        size--;
        ctx.font = size + 'px ' + fontFamily;
    }
    return size;
}
```

## Drilldown Hit Testing

```javascript
// Store hit rects during drawing, test on click
// hitRects is an array of {x, y, w, h, name} built in updateView
function findHitRect(hitRects, clickX, clickY) {
    for (var i = 0; i < hitRects.length; i++) {
        var t = hitRects[i];
        if (clickX >= t.x && clickX <= t.x + t.w &&
            clickY >= t.y && clickY <= t.y + t.h) {
            return t;
        }
    }
    return null;
}
```
