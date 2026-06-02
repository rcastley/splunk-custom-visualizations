/*
 * Single Value + Delta — Splunk Custom Visualization
 *
 * An executive KPI tile: a large headline value with optional prefix/suffix,
 * an optional colour-coded delta badge with trailing text, and an optional
 * sparkline. Transparent by default with an optional fill and rounded border.
 * Renders in the bundled Clash Display font.
 *
 * Data contract:
 *   - One row per time bucket (e.g. from `timechart`). The viz reads the LAST
 *     row for the headline value and delta, and the full series of the value
 *     column for the sparkline.
 *   - value  column (configurable name, default "value") — the metric.
 *   - delta  column (configurable name, default "delta") — optional, pre-computed.
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    var FONT = "'Clash Display', sans-serif";

    // ── Pure helpers (no `this`) ────────────────────────────────

    function hexToRgba(hex, a) {
        if (!hex || hex === 'transparent') return 'rgba(0,0,0,0)';
        var h = String(hex).replace('#', '');
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        var r = parseInt(h.substring(0, 2), 16);
        var g = parseInt(h.substring(2, 4), 16);
        var b = parseInt(h.substring(4, 6), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(255,255,255,' + a + ')';
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function groupThousands(numStr) {
        var neg = numStr.charAt(0) === '-';
        var s = neg ? numStr.substring(1) : numStr;
        var parts = s.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (neg ? '-' : '') + parts.join('.');
    }

    // Total drawn width of prefix+value+suffix at a given value font size.
    function composedWidth(ctx, prefix, value, suffix, vSize) {
        var t = 0;
        if (prefix) {
            ctx.font = '700 ' + (vSize * 0.55) + 'px ' + FONT;
            t += ctx.measureText(prefix).width + vSize * 0.05;
        }
        ctx.font = '700 ' + vSize + 'px ' + FONT;
        t += ctx.measureText(value).width;
        if (suffix) {
            ctx.font = '600 ' + (vSize * 0.52) + 'px ' + FONT;
            t += vSize * 0.07 + ctx.measureText(suffix).width;
        }
        return t;
    }

    function fitValueSize(ctx, prefix, value, suffix, maxW, maxH) {
        var vSize = maxH;
        while (vSize > 8 && composedWidth(ctx, prefix, value, suffix, vSize) > maxW) {
            vSize -= 1;
        }
        return vSize;
    }

    function drawSparkline(ctx, x, y, w, h, series, color, fill) {
        if (!series || series.length < 2) return;
        var min = series[0], max = series[0], i;
        for (i = 1; i < series.length; i++) {
            if (series[i] < min) min = series[i];
            if (series[i] > max) max = series[i];
        }
        var range = (max - min) || 1;
        var n = series.length;
        var pts = [];
        for (i = 0; i < n; i++) {
            var px = x + (i / (n - 1)) * w;
            var py = y + h - ((series[i] - min) / range) * (h * 0.86) - h * 0.07;
            pts.push([px, py]);
        }
        if (fill) {
            var grad = ctx.createLinearGradient(0, y, 0, y + h);
            grad.addColorStop(0, hexToRgba(color, 0.38));
            grad.addColorStop(1, hexToRgba(color, 0));
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.lineTo(pts[n - 1][0], y + h);
            ctx.lineTo(pts[0][0], y + h);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    // ── Visualization class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('single-value-delta-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._fontReady = false;
            this._fontCheckDone = false;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            };
        },

        formatData: function(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data — Single Value + Delta'
                );
            }
            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }
            var result = { colIdx: colIdx, rows: data.rows };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Wait for the embedded font before first paint.
            if (!this._fontReady && !this._fontCheckDone) {
                this._fontCheckDone = true;
                var self = this;
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(function() {
                        self._fontReady = true;
                        self.invalidateUpdateView();
                    });
                } else {
                    setTimeout(function() {
                        self._fontReady = true;
                        self.invalidateUpdateView();
                    }, 200);
                }
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            var ns = this.getPropertyNamespaceInfo().propertyNamespace;

            // Data fields
            var fieldName  = config[ns + 'field']      || 'value';
            var deltaField = config[ns + 'deltaField'] || 'delta';

            // Value
            var title       = config[ns + 'title']       || '';
            var align       = config[ns + 'align']       || 'left';
            var valuePrefix = config[ns + 'valuePrefix'] || '';
            var valueSuffix = config[ns + 'valueSuffix'] || '';
            var groupT      = (config[ns + 'groupThousands'] || 'true') === 'true';
            var valueColor  = config[ns + 'valueColor']  || '#ffffff';

            // Delta
            var deltaSuffix    = config[ns + 'deltaSuffix']    || '';
            var deltaText      = config[ns + 'deltaText']      || '';
            var showArrow      = (config[ns + 'showArrow']      || 'true') === 'true';
            var higherIsBetter = (config[ns + 'higherIsBetter'] || 'true') === 'true';
            var upColor        = config[ns + 'upColor']   || '#61D27E';
            var downColor      = config[ns + 'downColor'] || '#D5225D';

            // Sparkline
            var showSparkline = (config[ns + 'showSparkline'] || 'true') === 'true';
            var sparkColor    = config[ns + 'sparklineColor'] || '#61D27E';
            var sparkFill     = (config[ns + 'sparklineFill'] || 'true') === 'true';

            // Appearance
            var fillColor    = config[ns + 'fillColor']    || 'transparent';
            var showBorder   = (config[ns + 'showBorder']  || 'true') === 'true';
            var borderColor  = config[ns + 'borderColor']  || '#2A3566';
            var cornerRadius = parseInt(config[ns + 'cornerRadius'], 10);
            if (isNaN(cornerRadius)) cornerRadius = 16;

            // ── Extract value, delta, series ──
            var rows = data.rows;
            var colIdx = data.colIdx;
            var lastRow = rows[rows.length - 1];

            var valueStr = '—';
            if (colIdx[fieldName] !== undefined && lastRow[colIdx[fieldName]] !== undefined && lastRow[colIdx[fieldName]] !== null) {
                valueStr = String(lastRow[colIdx[fieldName]]);
                if (groupT && /^-?\d+(\.\d+)?$/.test(valueStr)) {
                    valueStr = groupThousands(valueStr);
                }
            }

            var deltaStr = '';
            if (colIdx[deltaField] !== undefined && lastRow[colIdx[deltaField]] !== undefined && lastRow[colIdx[deltaField]] !== null) {
                deltaStr = String(lastRow[colIdx[deltaField]]);
            }
            var deltaNum = parseFloat(deltaStr);
            var hasDelta = deltaStr !== '' && !isNaN(deltaNum);

            var series = [];
            if (showSparkline && colIdx[fieldName] !== undefined) {
                for (var r = 0; r < rows.length; r++) {
                    var v = parseFloat(rows[r][colIdx[fieldName]]);
                    if (!isNaN(v)) series.push(v);
                }
            }
            var hasSpark = showSparkline && series.length >= 2;

            // ── Canvas setup (HiDPI) ──
            var rect = this.el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            var w = rect.width, h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // Clip the root element to the rounded radius so any background fill
            // (the viz fillColor OR a Dashboard Studio panel background) cannot
            // bleed past the rounded corners into the rectangular element box.
            this.el.style.borderRadius = cornerRadius + 'px';
            this.el.style.overflow = 'hidden';

            // ── Panel background + border ──
            roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, cornerRadius);
            if (fillColor && fillColor !== 'transparent') {
                ctx.fillStyle = fillColor;
                ctx.fill();
            }
            if (showBorder) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // ── Layout zones ──
            // The value is the hero: keep padding/gaps tight so it dominates.
            var padX = Math.max(14, w * 0.05);
            var padY = Math.max(12, h * 0.09);
            var innerW = w - padX * 2;
            var ax = (align === 'left') ? padX : (align === 'right') ? (w - padX) : (w / 2);

            var curY = padY;

            // Title
            if (title) {
                var titleSize = Math.max(9, Math.min(13, h * 0.10));
                ctx.font = '500 ' + titleSize + 'px ' + FONT;
                ctx.fillStyle = hexToRgba(valueColor, 0.55);
                ctx.textAlign = align;
                ctx.textBaseline = 'top';
                if ('letterSpacing' in ctx) { try { ctx.letterSpacing = '1px'; } catch (e) {} }
                ctx.fillText(title.toUpperCase(), ax, curY);
                if ('letterSpacing' in ctx) { try { ctx.letterSpacing = '0px'; } catch (e2) {} }
                curY += titleSize + Math.max(4, h * 0.035);
            }

            // Reserve sparkline (bottom)
            var sparkH = hasSpark ? Math.max(18, h * 0.18) : 0;
            var sparkY = h - padY - sparkH;
            var bottomLimit = hasSpark ? (sparkY - Math.max(5, h * 0.04)) : (h - padY);

            // Reserve delta row
            var deltaH = hasDelta ? Math.max(17, h * 0.14) : 0;
            var deltaY = bottomLimit - deltaH;
            var valueBottom = hasDelta ? (deltaY - Math.max(3, h * 0.02)) : bottomLimit;

            var valueZoneH = valueBottom - curY;
            if (valueZoneH < 12) valueZoneH = 12;

            // ── Value (prefix + number + suffix) ──
            var maxValSize = Math.min(valueZoneH * 0.98, h * 0.52);
            var vSize = fitValueSize(ctx, valuePrefix, valueStr, valueSuffix, innerW, maxValSize);
            var pSize = vSize * 0.55, sSize = vSize * 0.52;
            var totalW = composedWidth(ctx, valuePrefix, valueStr, valueSuffix, vSize);

            var startX = (align === 'left') ? padX : (align === 'right') ? (w - padX - totalW) : (w - totalW) / 2;
            var baseY = curY + valueZoneH / 2 + vSize * 0.35;

            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            var x = startX;
            if (valuePrefix) {
                ctx.font = '700 ' + pSize + 'px ' + FONT;
                ctx.fillStyle = hexToRgba(valueColor, 0.7);
                ctx.fillText(valuePrefix, x, baseY);
                x += ctx.measureText(valuePrefix).width + vSize * 0.05;
            }
            ctx.font = '700 ' + vSize + 'px ' + FONT;
            ctx.fillStyle = valueColor;
            ctx.fillText(valueStr, x, baseY);
            x += ctx.measureText(valueStr).width;
            if (valueSuffix) {
                x += vSize * 0.07;
                ctx.font = '600 ' + sSize + 'px ' + FONT;
                ctx.fillStyle = hexToRgba(valueColor, 0.65);
                ctx.fillText(valueSuffix, x, baseY);
            }

            // ── Delta badge + trailing text ──
            if (hasDelta) {
                var dColor;
                var positive = deltaNum > 0, negative = deltaNum < 0;
                if (deltaNum === 0) dColor = '#9aa7c7';
                else dColor = (higherIsBetter ? positive : negative) ? upColor : downColor;

                var arrow = positive ? '▲' : (negative ? '▼' : '');
                var shownDelta = showArrow ? deltaStr.replace(/^-/, '') : deltaStr;
                var pillText = (showArrow && arrow ? (arrow + ' ') : '') + shownDelta + deltaSuffix;

                var dFont = Math.max(10, Math.min(14, deltaH * 0.58));
                ctx.font = '600 ' + dFont + 'px ' + FONT;
                var tw = ctx.measureText(pillText).width;
                var pillPad = dFont * 0.65;
                var pillH = dFont * 1.75;
                var pillW = tw + pillPad * 2;

                ctx.font = '500 ' + dFont + 'px ' + FONT;
                var trailW = deltaText ? ctx.measureText(deltaText).width : 0;
                var gap = dFont * 0.7;
                var rowW = pillW + (deltaText ? (gap + trailW) : 0);

                var sx = (align === 'left') ? padX : (align === 'right') ? (w - padX - rowW) : (w - rowW) / 2;
                var cy = deltaY + deltaH / 2;

                roundRect(ctx, sx, cy - pillH / 2, pillW, pillH, pillH / 2);
                ctx.fillStyle = hexToRgba(dColor, 0.15);
                ctx.fill();

                ctx.font = '600 ' + dFont + 'px ' + FONT;
                ctx.fillStyle = dColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(pillText, sx + pillPad, cy + 0.5);

                if (deltaText) {
                    ctx.font = '500 ' + dFont + 'px ' + FONT;
                    ctx.fillStyle = hexToRgba(valueColor, 0.65);
                    ctx.fillText(deltaText, sx + pillW + gap, cy + 0.5);
                }
            }

            // ── Sparkline ──
            if (hasSpark) {
                drawSparkline(ctx, padX, sparkY, innerW, sparkH, series, sparkColor, sparkFill);
            }
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            SplunkVisualizationBase.prototype.destroy.call(this);
        }
    });
});
