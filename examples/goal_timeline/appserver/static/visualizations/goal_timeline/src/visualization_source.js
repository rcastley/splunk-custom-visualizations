/*
 * Goal Event Timeline — Splunk Custom Visualization
 *
 * Renders a horizontal timeline for a match showing betting volume as
 * an area chart with event markers (goals, red cards, penalties, VAR
 * reviews) annotated at the corresponding time positions.
 *
 * Expected SPL columns: minute, volume, [event], [event_type]
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Color Utilities ─────────────────────────────────────────

    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    function rgbaStr(c, a) {
        return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
    }

    // ── Event Type Helpers ──────────────────────────────────────

    function getEventIcon(eventType) {
        switch (eventType) {
            case 'goal':     return '\u26BD';  // soccer ball
            case 'red_card': return '\uD83D\uDFE5'; // red square (fallback for red card)
            case 'var':      return '\uD83D\uDD35'; // blue circle
            case 'penalty':  return '\u26A1';  // lightning bolt
            default:         return '\u26BD';
        }
    }

    // ── Number Formatting ───────────────────────────────────────

    function formatVolume(v) {
        if (v >= 1000000) {
            return (v / 1000000).toFixed(1) + 'M';
        }
        if (v >= 1000) {
            return (v / 1000).toFixed(1) + 'K';
        }
        return '' + Math.round(v);
    }

    // ── Drawing Helpers ─────────────────────────────────────────

    function drawGrid(ctx, x, y, w, h, maxVol, gridColor) {
        var gridLines = 4;
        ctx.save();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 3]);

        for (var i = 0; i <= gridLines; i++) {
            var gy = y + (h / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(x, gy);
            ctx.lineTo(x + w, gy);
            ctx.stroke();
        }

        // Y-axis volume labels
        ctx.setLineDash([]);
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (var j = 0; j <= gridLines; j++) {
            var labelY = y + (h / gridLines) * j;
            var labelVal = maxVol * (1 - j / gridLines);
            ctx.fillText(formatVolume(labelVal), x - 6, labelY);
        }

        ctx.restore();
    }

    function drawXAxis(ctx, x, y, w, maxMinute) {
        var ticks = [0, 15, 30, 45, 60, 75, 90];
        ctx.save();
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (var i = 0; i < ticks.length; i++) {
            var t = ticks[i];
            if (t > maxMinute) break;
            var tx = x + (t / maxMinute) * w;
            // Tick mark
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx, y);
            ctx.lineTo(tx, y + 4);
            ctx.stroke();
            // Label
            ctx.fillText(t + "'", tx, y + 6);
        }

        ctx.restore();
    }

    function drawHalftimeLine(ctx, x, y, h, maxMinute, chartX) {
        if (maxMinute < 45) return;
        var htX = chartX + (45 / maxMinute) * (x);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(htX, y);
        ctx.lineTo(htX, y + h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Half-time label
        ctx.font = '9px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('HT', htX, y - 2);
        ctx.restore();
    }

    function drawAreaChart(ctx, points, chartX, chartY, chartW, chartH, maxMinute, maxVol, areaRgb, smooth) {
        if (points.length === 0) return;

        ctx.save();

        // Build path coordinates
        var coords = [];
        for (var i = 0; i < points.length; i++) {
            var px = chartX + (points[i].minute / maxMinute) * chartW;
            var py = chartY + chartH - (points[i].volume / maxVol) * chartH;
            coords.push({ x: px, y: py });
        }

        // Draw filled area
        ctx.beginPath();
        ctx.moveTo(coords[0].x, chartY + chartH); // start at baseline
        ctx.lineTo(coords[0].x, coords[0].y);

        if (smooth && coords.length > 2) {
            // Quadratic bezier smoothing
            for (var j = 0; j < coords.length - 1; j++) {
                var cpX = (coords[j].x + coords[j + 1].x) / 2;
                var cpY = (coords[j].y + coords[j + 1].y) / 2;
                ctx.quadraticCurveTo(coords[j].x, coords[j].y, cpX, cpY);
            }
            // Final segment to last point
            ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
        } else {
            for (var k = 1; k < coords.length; k++) {
                ctx.lineTo(coords[k].x, coords[k].y);
            }
        }

        ctx.lineTo(coords[coords.length - 1].x, chartY + chartH); // back to baseline
        ctx.closePath();

        // Gradient fill
        var gradient = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
        gradient.addColorStop(0, rgbaStr(areaRgb, 0.6));
        gradient.addColorStop(0.5, rgbaStr(areaRgb, 0.2));
        gradient.addColorStop(1, rgbaStr(areaRgb, 0.02));
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw the line on top
        ctx.beginPath();
        ctx.moveTo(coords[0].x, coords[0].y);

        if (smooth && coords.length > 2) {
            for (var m = 0; m < coords.length - 1; m++) {
                var cpX2 = (coords[m].x + coords[m + 1].x) / 2;
                var cpY2 = (coords[m].y + coords[m + 1].y) / 2;
                ctx.quadraticCurveTo(coords[m].x, coords[m].y, cpX2, cpY2);
            }
            ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y);
        } else {
            for (var n = 1; n < coords.length; n++) {
                ctx.lineTo(coords[n].x, coords[n].y);
            }
        }

        ctx.strokeStyle = rgbaStr(areaRgb, 0.9);
        ctx.lineWidth = 2;
        ctx.stroke();

        // Glow effect on line
        ctx.shadowBlur = 6;
        ctx.shadowColor = rgbaStr(areaRgb, 0.4);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    function drawEventMarkers(ctx, points, chartX, chartY, chartW, chartH, maxMinute, maxVol, colors, showLabels) {
        ctx.save();

        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            if (!p.event || !p.eventType) continue;

            var ex = chartX + (p.minute / maxMinute) * chartW;
            var ey = chartY + chartH - (p.volume / maxVol) * chartH;

            // Determine marker color
            var markerColor;
            switch (p.eventType) {
                case 'goal':     markerColor = colors.goal; break;
                case 'red_card': markerColor = colors.card; break;
                case 'var':      markerColor = colors.varReview; break;
                case 'penalty':  markerColor = colors.penalty; break;
                default:         markerColor = colors.goal; break;
            }

            var markerRgb = hexToRgb(markerColor);

            // Vertical dashed line from baseline to event point
            ctx.strokeStyle = rgbaStr(markerRgb, 0.5);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(ex, chartY + chartH);
            ctx.lineTo(ex, ey - 4);
            ctx.stroke();
            ctx.setLineDash([]);

            // Glowing dot at event position on the line
            ctx.beginPath();
            ctx.arc(ex, ey, 4, 0, Math.PI * 2);
            ctx.fillStyle = markerColor;
            ctx.fill();
            ctx.shadowBlur = 8;
            ctx.shadowColor = rgbaStr(markerRgb, 0.6);
            ctx.fill();
            ctx.shadowBlur = 0;

            // White ring around dot
            ctx.beginPath();
            ctx.arc(ex, ey, 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Event icon above the point
            var iconY = ey - 18;
            var icon = getEventIcon(p.eventType);
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText(icon, ex, iconY);

            // Event label
            if (showLabels && p.event) {
                // Minute badge
                ctx.font = 'bold 9px monospace';
                ctx.fillStyle = markerColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(p.minute + "'", ex, iconY - 10);

                // Description text
                ctx.font = '9px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.textBaseline = 'bottom';
                ctx.fillText(p.event, ex, iconY - 20);
            }
        }

        ctx.restore();
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('goal-timeline-viz');

            // Create canvas element
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            // Internal state
            this._lastGoodData = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Goal Event Timeline'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for status message from appendpipe fallback
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Validate required columns
            if (colIdx.minute === undefined || colIdx.volume === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: minute, volume'
                );
            }

            // Build sorted array of timeline points
            var points = [];
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var minute = parseFloat(row[colIdx.minute]);
                var volume = parseFloat(row[colIdx.volume]);

                if (isNaN(minute)) continue;
                if (isNaN(volume)) volume = 0;

                var event = '';
                var eventType = '';
                if (colIdx.event !== undefined) {
                    event = row[colIdx.event] || '';
                }
                if (colIdx.event_type !== undefined) {
                    eventType = row[colIdx.event_type] || '';
                }

                points.push({
                    minute: minute,
                    volume: volume,
                    event: event,
                    eventType: eventType
                });
            }

            // Sort by minute ascending
            points.sort(function(a, b) { return a.minute - b.minute; });

            var result = { points: points };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Handle custom status message
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            var points = data.points;
            if (!points || points.length === 0) return;

            // ── Size canvas for HiDPI ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            var w = rect.width;
            var h = rect.height;

            // ── Clear canvas ──
            ctx.clearRect(0, 0, w, h);

            // ── Read user settings ──
            // Defaults MUST match formatter.html defaults
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var areaColor = config[ns + 'areaColor'] || '#0088ff';
            var goalColor = config[ns + 'goalColor'] || '#00cc66';
            var cardColor = config[ns + 'cardColor'] || '#ff3333';
            var varColor = config[ns + 'varColor'] || '#3399ff';
            var penaltyColor = config[ns + 'penaltyColor'] || '#ffcc00';
            var showGrid = (config[ns + 'showGrid'] || 'true') === 'true';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var smooth = (config[ns + 'smoothing'] || 'true') === 'true';

            var areaRgb = hexToRgb(areaColor);

            // ── Dark background for NOC display ──
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, w, h);

            // ── Layout ──
            var padLeft = Math.max(50, w * 0.07);
            var padRight = Math.max(20, w * 0.03);
            var padTop = showLabels ? Math.max(60, h * 0.2) : Math.max(30, h * 0.08);
            var padBottom = Math.max(30, h * 0.1);

            var chartX = padLeft;
            var chartY = padTop;
            var chartW = w - padLeft - padRight;
            var chartH = h - padTop - padBottom;

            if (chartW <= 0 || chartH <= 0) return;

            // ── Compute data bounds ──
            var maxMinute = 90;
            var maxVol = 0;
            for (var i = 0; i < points.length; i++) {
                if (points[i].minute > maxMinute) maxMinute = points[i].minute;
                if (points[i].volume > maxVol) maxVol = points[i].volume;
            }
            // Add 10% headroom to max volume
            maxVol = maxVol * 1.1;
            if (maxVol === 0) maxVol = 1;

            // ── Draw grid ──
            if (showGrid) {
                drawGrid(ctx, chartX, chartY, chartW, chartH, maxVol, 'rgba(255,255,255,0.08)');
            }

            // ── Draw X-axis ──
            drawXAxis(ctx, chartX, chartY + chartH, chartW, maxMinute);

            // ── Draw half-time line ──
            drawHalftimeLine(ctx, chartW, chartY, chartH, maxMinute, chartX);

            // ── Draw area chart ──
            drawAreaChart(ctx, points, chartX, chartY, chartW, chartH, maxMinute, maxVol, areaRgb, smooth);

            // ── Draw event markers ──
            var colors = {
                goal: goalColor,
                card: cardColor,
                varReview: varColor,
                penalty: penaltyColor
            };
            drawEventMarkers(ctx, points, chartX, chartY, chartW, chartH, maxMinute, maxVol, colors, showLabels);

            // ── Title ──
            ctx.save();
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('MATCH TIMELINE', chartX, 8);

            // Subtle "minutes" label on x-axis
            ctx.font = '9px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.textAlign = 'right';
            ctx.fillText('minutes', chartX + chartW, chartY + chartH + 18);
            ctx.restore();
        },

        // ── Custom no-data message support ──

        _ensureCanvas: function() {
            if (!this.canvas) {
                this.el.innerHTML = '';
                this.canvas = document.createElement('canvas');
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.style.display = 'block';
                this.el.appendChild(this.canvas);
            }
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
        },

        _drawStatusMessage: function(message) {
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var ctx = this.canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            // Scale font down if text overflows container
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            // Soccer ball emoji above text
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u26BD', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji (dimmed)
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        }
    });
});
