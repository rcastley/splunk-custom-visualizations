/*
 * Radar Chart — Splunk Custom Visualization
 *
 * Renders a radar (spider) chart with multiple overlaid series as
 * semi-transparent filled polygons on a shared radial grid.
 *
 * Features:
 *   - Click legend to toggle series on/off
 *   - Entrance animation (polygons grow from center)
 *   - Hover tooltip with axis values
 *   - Per-series custom colors via formatter color pickers
 *
 * Expected SPL columns: <series_col>, <axis1>, <axis2>, ... <axisN>
 * First column = series name, remaining columns = numeric axis values.
 * Column headers become axis labels. Each row = one polygon.
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Color Palettes ──────────────────────────────────────────

    var PALETTES = {
        warm: [
            { r: 255, g: 160, b: 50 },
            { r: 255, g: 100, b: 30 },
            { r: 255, g: 200, b: 80 },
            { r: 220, g: 80,  b: 40 },
            { r: 255, g: 140, b: 100 },
            { r: 200, g: 120, b: 50 },
            { r: 255, g: 180, b: 60 },
            { r: 180, g: 60,  b: 30 }
        ],
        cool: [
            { r: 80,  g: 160, b: 255 },
            { r: 100, g: 200, b: 240 },
            { r: 140, g: 120, b: 255 },
            { r: 60,  g: 200, b: 180 },
            { r: 180, g: 140, b: 255 },
            { r: 80,  g: 220, b: 200 },
            { r: 120, g: 140, b: 255 },
            { r: 60,  g: 180, b: 220 }
        ],
        green: [
            { r: 80,  g: 200, b: 120 },
            { r: 120, g: 220, b: 80 },
            { r: 60,  g: 180, b: 160 },
            { r: 160, g: 220, b: 60 },
            { r: 80,  g: 160, b: 100 },
            { r: 100, g: 240, b: 140 },
            { r: 140, g: 200, b: 60 },
            { r: 60,  g: 220, b: 120 }
        ]
    };

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

    // Match a series name against a pattern (supports * wildcard)
    function matchPattern(pattern, name) {
        if (!pattern) return false;
        pattern = pattern.trim();
        name = name.trim();
        if (pattern === '*') return true;
        if (pattern.indexOf('*') === -1) {
            return pattern.toLowerCase() === name.toLowerCase();
        }
        // Convert wildcard pattern to regex
        var escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        var regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$', 'i');
        return regex.test(name);
    }

    function getSeriesRgb(palette, index, colorMatches, seriesName) {
        // Check name-based color matches first
        for (var i = 0; i < colorMatches.length; i++) {
            if (matchPattern(colorMatches[i].name, seriesName)) {
                return hexToRgb(colorMatches[i].color);
            }
        }
        // Fallback to palette
        var colors = PALETTES[palette] || PALETTES.warm;
        return colors[index % colors.length];
    }

    function rgbaStr(rgb, alpha) {
        return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
    }

    // ── Easing ──────────────────────────────────────────────────

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    // ── Drawing Helpers ─────────────────────────────────────────

    function drawPolygonPath(ctx, cx, cy, radius, numAxes) {
        ctx.beginPath();
        for (var i = 0; i < numAxes; i++) {
            var angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            var x = cx + radius * Math.cos(angle);
            var y = cy + radius * Math.sin(angle);
            if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.closePath();
    }

    function drawGrid(ctx, cx, cy, radius, numAxes, numRings) {
        for (var r = 1; r <= numRings; r++) {
            drawPolygonPath(ctx, cx, cy, (radius / numRings) * r, numAxes);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        for (var i = 0; i < numAxes; i++) {
            var angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawAxisLabels(ctx, cx, cy, radius, axisNames, fontSize) {
        ctx.font = fontSize + 'px sans-serif';
        ctx.fillStyle = 'rgba(255, 200, 80, 0.9)';
        ctx.textBaseline = 'middle';
        var pad = fontSize * 1.2;
        for (var i = 0; i < axisNames.length; i++) {
            var angle = (Math.PI * 2 * i / axisNames.length) - Math.PI / 2;
            var lx = cx + (radius + pad) * Math.cos(angle);
            var ly = cy + (radius + pad) * Math.sin(angle);
            var cosA = Math.cos(angle);
            ctx.textAlign = cosA > 0.1 ? 'left' : cosA < -0.1 ? 'right' : 'center';
            var sinA = Math.sin(angle);
            if (sinA < -0.5) { ly -= fontSize * 0.3; }
            else if (sinA > 0.5) { ly += fontSize * 0.3; }
            ctx.fillText(axisNames[i], lx, ly);
        }
    }

    function drawSeriesPolygon(ctx, cx, cy, radius, values, maxValues, fillColor, strokeColor, scale) {
        var n = values.length;
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
            var angle = (Math.PI * 2 * i / n) - Math.PI / 2;
            var ratio = maxValues[i] > 0 ? values[i] / maxValues[i] : 0;
            ratio = Math.max(0, Math.min(1, ratio)) * scale;
            var x = cx + radius * ratio * Math.cos(angle);
            var y = cy + radius * ratio * Math.sin(angle);
            if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function drawCenterGlow(ctx, cx, cy, radius, rgb) {
        var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.6);
        gradient.addColorStop(0, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ', 0.25)');
        gradient.addColorStop(0.5, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ', 0.08)');
        gradient.addColorStop(1, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ', 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLegend(ctx, seriesNames, palette, colorMatches, hiddenSet, w, y, fontSize) {
        var swatchW = fontSize * 1.5;
        var swatchH = fontSize * 0.85;
        var gap = fontSize * 1.5;
        var hitRects = [];

        ctx.font = fontSize + 'px sans-serif';

        var totalWidth = 0;
        for (var i = 0; i < seriesNames.length; i++) {
            var tw = ctx.measureText(seriesNames[i]).width;
            totalWidth += swatchW + fontSize * 0.5 + tw;
            if (i < seriesNames.length - 1) totalWidth += gap;
        }

        var currentX = (w - totalWidth) / 2;

        for (var j = 0; j < seriesNames.length; j++) {
            var hidden = hiddenSet[seriesNames[j]];
            var itemStartX = currentX;
            var rgb = getSeriesRgb(palette, j, colorMatches, seriesNames[j]);

            var sr = swatchH * 0.25;
            var sy = y - swatchH / 2;
            ctx.globalAlpha = hidden ? 0.3 : 1;
            ctx.fillStyle = rgbaStr(rgb, 0.85);
            ctx.beginPath();
            ctx.moveTo(currentX + sr, sy);
            ctx.lineTo(currentX + swatchW - sr, sy);
            ctx.arcTo(currentX + swatchW, sy, currentX + swatchW, sy + sr, sr);
            ctx.lineTo(currentX + swatchW, sy + swatchH - sr);
            ctx.arcTo(currentX + swatchW, sy + swatchH, currentX + swatchW - sr, sy + swatchH, sr);
            ctx.lineTo(currentX + sr, sy + swatchH);
            ctx.arcTo(currentX, sy + swatchH, currentX, sy + swatchH - sr, sr);
            ctx.lineTo(currentX, sy + sr);
            ctx.arcTo(currentX, sy, currentX + sr, sy, sr);
            ctx.closePath();
            ctx.fill();

            currentX += swatchW + fontSize * 0.5;

            ctx.fillStyle = hidden ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.75)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(seriesNames[j], currentX, y);

            if (hidden) {
                var textW = ctx.measureText(seriesNames[j]).width;
                ctx.beginPath();
                ctx.moveTo(currentX, y);
                ctx.lineTo(currentX + textW, y);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            ctx.globalAlpha = 1;

            var itemEndX = currentX + ctx.measureText(seriesNames[j]).width;
            hitRects.push({
                x: itemStartX,
                y: sy - 4,
                w: itemEndX - itemStartX,
                h: swatchH + 8,
                name: seriesNames[j]
            });

            currentX = itemEndX + gap;
        }

        return hitRects;
    }

    // ── Tooltip Drawing ─────────────────────────────────────────

    function drawTooltip(ctx, mx, my, seriesName, axisNames, values, rgb, w, h) {
        var pad = 10;
        var lineH = 18;
        var headerH = 24;
        var tooltipH = headerH + axisNames.length * lineH + pad;
        var tooltipW = 0;

        ctx.font = 'bold 13px sans-serif';
        tooltipW = Math.max(tooltipW, ctx.measureText(seriesName).width);
        ctx.font = '12px monospace';
        for (var i = 0; i < axisNames.length; i++) {
            var line = axisNames[i] + ':  ' + values[i];
            tooltipW = Math.max(tooltipW, ctx.measureText(line).width);
        }
        tooltipW += pad * 2 + 16; // extra for color dot

        // Position: avoid going off-screen
        var tx = mx + 16;
        var ty = my - tooltipH / 2;
        if (tx + tooltipW > w - 4) tx = mx - tooltipW - 16;
        if (ty < 4) ty = 4;
        if (ty + tooltipH > h - 4) ty = h - tooltipH - 4;

        // Background
        var cornerR = 6;
        ctx.fillStyle = 'rgba(20, 22, 40, 0.92)';
        ctx.strokeStyle = rgbaStr(rgb, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx + cornerR, ty);
        ctx.lineTo(tx + tooltipW - cornerR, ty);
        ctx.arcTo(tx + tooltipW, ty, tx + tooltipW, ty + cornerR, cornerR);
        ctx.lineTo(tx + tooltipW, ty + tooltipH - cornerR);
        ctx.arcTo(tx + tooltipW, ty + tooltipH, tx + tooltipW - cornerR, ty + tooltipH, cornerR);
        ctx.lineTo(tx + cornerR, ty + tooltipH);
        ctx.arcTo(tx, ty + tooltipH, tx, ty + tooltipH - cornerR, cornerR);
        ctx.lineTo(tx, ty + cornerR);
        ctx.arcTo(tx, ty, tx + cornerR, ty, cornerR);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Header: color dot + series name
        var dotR = 5;
        ctx.fillStyle = rgbaStr(rgb, 1);
        ctx.beginPath();
        ctx.arc(tx + pad + dotR, ty + headerH / 2 + 2, dotR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(seriesName, tx + pad + dotR * 2 + 6, ty + headerH / 2 + 2);

        // Separator line
        ctx.beginPath();
        ctx.moveTo(tx + pad, ty + headerH);
        ctx.lineTo(tx + tooltipW - pad, ty + headerH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Axis values
        ctx.font = '12px monospace';
        for (var j = 0; j < axisNames.length; j++) {
            var ly = ty + headerH + pad / 2 + j * lineH + lineH / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.textAlign = 'left';
            ctx.fillText(axisNames[j], tx + pad, ly);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.textAlign = 'right';
            ctx.fillText(String(values[j]), tx + tooltipW - pad, ly);
        }
    }

    // ── Find closest polygon to mouse ───────────────────────────

    function findClosestRow(mx, my, cx, cy, radius, rows, maxValues, hiddenSeries, seriesColorIdx) {
        // Compute distance from mouse to center
        var dx = mx - cx;
        var dy = my - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius * 1.1) return null;

        // Find mouse angle
        var mouseAngle = Math.atan2(dy, dx);

        var bestRow = null;
        var bestDist = Infinity;

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            if (hiddenSeries[row.series]) continue;

            // Compute the polygon's radial distance at the mouse angle
            var n = row.values.length;
            // Find which two axes the mouse is between
            for (var i = 0; i < n; i++) {
                var a1 = (Math.PI * 2 * i / n) - Math.PI / 2;
                var a2 = (Math.PI * 2 * ((i + 1) % n) / n) - Math.PI / 2;

                // Normalize angles
                var ma = mouseAngle;
                var start = a1;
                var end = a2;
                if (end < start) end += Math.PI * 2;
                if (ma < start) ma += Math.PI * 2;

                if (ma >= start && ma <= end) {
                    // Interpolate the polygon radius at this angle
                    var t = (ma - start) / (end - start);
                    var r1 = maxValues[i] > 0 ? (row.values[i] / maxValues[i]) * radius : 0;
                    var r2 = maxValues[(i + 1) % n] > 0 ? (row.values[(i + 1) % n] / maxValues[(i + 1) % n]) * radius : 0;
                    var polyR = r1 + (r2 - r1) * t;
                    var d = Math.abs(dist - polyR);
                    if (d < bestDist) {
                        bestDist = d;
                        bestRow = row;
                    }
                    break;
                }
            }
        }

        // Only show tooltip if reasonably close
        if (bestDist > radius * 0.15) return null;
        return bestRow;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('radar-chart-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._hiddenSeries = {};
            this._legendHitRects = [];

            // Animation state
            this._animProgress = 0;  // 0..1
            this._animStart = 0;
            this._animTimer = null;
            this._animTriggered = false;

            // Hover state
            this._mouseX = -1;
            this._mouseY = -1;
            this._hoverRow = null;

            // Render state cache for hover/animation redraws
            this._renderState = null;

            var self = this;

            // ── Legend click ──
            this.canvas.addEventListener('click', function(event) {
                if (!self._legendHitRects || self._legendHitRects.length === 0) return;
                var canvasRect = self.canvas.getBoundingClientRect();
                var clickX = event.clientX - canvasRect.left;
                var clickY = event.clientY - canvasRect.top;
                for (var i = 0; i < self._legendHitRects.length; i++) {
                    var t = self._legendHitRects[i];
                    if (clickX >= t.x && clickX <= t.x + t.w &&
                        clickY >= t.y && clickY <= t.y + t.h) {
                        if (self._hiddenSeries[t.name]) {
                            delete self._hiddenSeries[t.name];
                        } else {
                            self._hiddenSeries[t.name] = true;
                        }
                        // Re-trigger animation on toggle
                        self._animTriggered = false;
                        self.invalidateUpdateView();
                        break;
                    }
                }
            });

            // ── Mouse move for hover + cursor ──
            this.canvas.addEventListener('mousemove', function(event) {
                var canvasRect = self.canvas.getBoundingClientRect();
                self._mouseX = event.clientX - canvasRect.left;
                self._mouseY = event.clientY - canvasRect.top;

                // Check legend hover for cursor
                var overLegend = false;
                for (var i = 0; i < self._legendHitRects.length; i++) {
                    var t = self._legendHitRects[i];
                    if (self._mouseX >= t.x && self._mouseX <= t.x + t.w &&
                        self._mouseY >= t.y && self._mouseY <= t.y + t.h) {
                        overLegend = true;
                        break;
                    }
                }
                self.canvas.style.cursor = overLegend ? 'pointer' : 'default';

                // Redraw for tooltip (only if animation is done)
                if (self._animProgress >= 1 && self._renderState) {
                    self._drawFrame();
                }
            });

            // ── Mouse leave ──
            this.canvas.addEventListener('mouseleave', function() {
                self._mouseX = -1;
                self._mouseY = -1;
                self._hoverRow = null;
                if (self._animProgress >= 1 && self._renderState) {
                    self._drawFrame();
                }
            });
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
                    'Awaiting data \u2014 Radar Chart'
                );
            }

            var fields = data.fields;
            if (fields.length < 3) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Need at least 3 columns: series + 2 axes'
                );
            }

            var axisNames = [];
            for (var f = 1; f < fields.length; f++) {
                axisNames.push(fields[f].name);
            }

            var rows = [];
            var uniqueSeriesMap = {};
            var uniqueSeriesOrder = [];
            var axisMaxes = [];
            for (var m = 0; m < axisNames.length; m++) {
                axisMaxes.push(0);
            }

            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var name = row[0] || 'Unknown';
                if (!uniqueSeriesMap[name]) {
                    uniqueSeriesMap[name] = true;
                    uniqueSeriesOrder.push(name);
                }
                var values = [];
                for (var v = 0; v < axisNames.length; v++) {
                    var val = parseFloat(row[v + 1]);
                    if (isNaN(val)) val = 0;
                    values.push(val);
                    if (val > axisMaxes[v]) axisMaxes[v] = val;
                }
                rows.push({ series: name, values: values });
            }

            var result = {
                axisNames: axisNames,
                rows: rows,
                uniqueSeries: uniqueSeriesOrder,
                axisMaxes: axisMaxes
            };

            this._lastGoodData = result;
            return result;
        },

        // ── Internal draw method (called by animation + hover) ──

        _drawFrame: function() {
            var rs = this._renderState;
            if (!rs) return;

            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            var dpr = window.devicePixelRatio || 1;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var w = rs.w;
            var h = rs.h;
            ctx.clearRect(0, 0, w, h);

            var scale = easeOutCubic(this._animProgress);

            // Title
            if (rs.title) {
                ctx.font = 'bold ' + rs.titleSize + 'px sans-serif';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(rs.title, w / 2, 12);
            }

            // Center glow
            drawCenterGlow(ctx, rs.cx, rs.cy, rs.radius, rs.glowRgb);

            // Grid
            drawGrid(ctx, rs.cx, rs.cy, rs.radius, rs.numAxes, rs.gridRings);

            // Axis labels
            drawAxisLabels(ctx, rs.cx, rs.cy, rs.radius, rs.axisNames, rs.labelSize);

            // Polygons
            var visibleRows = rs.visibleRows;
            var rows = rs.rows;
            var effectiveMaxes = rs.effectiveMaxes;

            // Find hover row
            this._hoverRow = null;
            if (this._mouseX >= 0 && this._mouseY >= 0 && this._animProgress >= 1) {
                this._hoverRow = findClosestRow(
                    this._mouseX, this._mouseY,
                    rs.cx, rs.cy, rs.radius,
                    rows, effectiveMaxes, rs.hiddenSeries, rs.seriesColorIdx
                );
            }

            for (var d = 0; d < visibleRows.length; d++) {
                var row = rows[visibleRows[d].idx];
                var colorIdx = rs.seriesColorIdx[row.series] || 0;
                var rgb = getSeriesRgb(rs.colorTheme, colorIdx, rs.colorMatches, row.series);
                var isHovered = this._hoverRow && this._hoverRow === row;
                var fillAlpha = isHovered ? 0.35 : (0.12 + (visibleRows[d].avgRatio * 0.18));
                var strokeAlpha = isHovered ? 1.0 : 0.7;
                var lineW = isHovered ? 2.5 : 1.5;

                var n = row.values.length;
                ctx.beginPath();
                for (var i = 0; i < n; i++) {
                    var angle = (Math.PI * 2 * i / n) - Math.PI / 2;
                    var ratio = effectiveMaxes[i] > 0 ? row.values[i] / effectiveMaxes[i] : 0;
                    ratio = Math.max(0, Math.min(1, ratio)) * scale;
                    var x = rs.cx + rs.radius * ratio * Math.cos(angle);
                    var y = rs.cy + rs.radius * ratio * Math.sin(angle);
                    if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
                }
                ctx.closePath();
                ctx.fillStyle = rgbaStr(rgb, fillAlpha);
                ctx.fill();
                ctx.strokeStyle = rgbaStr(rgb, strokeAlpha);
                ctx.lineWidth = lineW;
                ctx.stroke();

                // Draw vertex dots on hovered polygon
                if (isHovered && this._animProgress >= 1) {
                    for (var vi = 0; vi < n; vi++) {
                        var va = (Math.PI * 2 * vi / n) - Math.PI / 2;
                        var vr = effectiveMaxes[vi] > 0 ? row.values[vi] / effectiveMaxes[vi] : 0;
                        vr = Math.max(0, Math.min(1, vr));
                        var vx = rs.cx + rs.radius * vr * Math.cos(va);
                        var vy = rs.cy + rs.radius * vr * Math.sin(va);
                        ctx.beginPath();
                        ctx.arc(vx, vy, 4, 0, Math.PI * 2);
                        ctx.fillStyle = rgbaStr(rgb, 1);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                }
            }

            // Legend
            this._legendHitRects = [];
            if (rs.showLegend && rs.uniqueSeries.length > 0) {
                this._legendHitRects = drawLegend(
                    ctx, rs.uniqueSeries, rs.colorTheme, rs.colorMatches,
                    rs.hiddenSeries, w, rs.legendY, rs.legendFontSize
                );
            }

            // Tooltip
            if (this._hoverRow && this._animProgress >= 1) {
                var hColorIdx = rs.seriesColorIdx[this._hoverRow.series] || 0;
                var hRgb = getSeriesRgb(rs.colorTheme, hColorIdx, rs.colorMatches, this._hoverRow.series);
                drawTooltip(ctx, this._mouseX, this._mouseY,
                    this._hoverRow.series, rs.axisNames, this._hoverRow.values, hRgb, w, h);
            }

            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
        },

        updateView: function(data, config) {
            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var title = config[ns + 'title'] || '';
            var maxValue = parseInt(config[ns + 'maxValue'], 10) || 0;
            var gridRings = parseInt(config[ns + 'gridRings'], 10) || 4;
            var showLegend = (config[ns + 'showLegend'] || 'true') === 'true';
            var colorTheme = config[ns + 'colorTheme'] || 'warm';
            var animDuration = parseInt(config[ns + 'animDuration'], 10);
            if (isNaN(animDuration)) animDuration = 800;

            // Parse color overrides: "name:#hex, name:#hex"
            var colorMatches = [];
            var overridesRaw = config[ns + 'colorOverrides'] || '';
            if (overridesRaw) {
                var parts = overridesRaw.split(',');
                for (var ci = 0; ci < parts.length; ci++) {
                    var part = parts[ci].trim();
                    var colonIdx = part.lastIndexOf(':');
                    if (colonIdx > 0) {
                        var mn = part.substring(0, colonIdx).trim();
                        var mc = part.substring(colonIdx + 1).trim();
                        if (mn && mc && mc.indexOf('#') === 0) {
                            colorMatches.push({ name: mn, color: mc });
                        }
                    }
                }
            }

            // ── Size canvas for HiDPI ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;

            var w = rect.width;
            var h = rect.height;

            // ── Data ──
            var axisNames = data.axisNames;
            var rows = data.rows;
            var uniqueSeries = data.uniqueSeries;
            var numAxes = axisNames.length;
            var hiddenSeries = this._hiddenSeries;

            var seriesColorIdx = {};
            for (var si = 0; si < uniqueSeries.length; si++) {
                seriesColorIdx[uniqueSeries[si]] = si;
            }

            // Effective max per axis
            var effectiveMaxes = [];
            for (var i = 0; i < numAxes; i++) {
                if (maxValue > 0) {
                    effectiveMaxes.push(maxValue);
                } else {
                    var visMax = 0;
                    for (var ri = 0; ri < rows.length; ri++) {
                        if (!hiddenSeries[rows[ri].series]) {
                            if (rows[ri].values[i] > visMax) visMax = rows[ri].values[i];
                        }
                    }
                    if (visMax <= 0) visMax = 1;
                    var mag = Math.pow(10, Math.floor(Math.log10(visMax)));
                    effectiveMaxes.push(Math.ceil(visMax / mag) * mag);
                }
            }

            // Layout
            var titleH = title ? 40 : 10;
            var legendH = showLegend ? 50 : 10;
            var labelPad = Math.max(40, Math.min(70, w * 0.08));
            var availW = w - labelPad * 2;
            var availH = h - titleH - legendH - labelPad * 2;
            var radius = Math.min(availW, availH) / 2;
            radius = Math.max(40, radius);
            var cx = w / 2;
            var cy = titleH + labelPad + radius;

            // Visible rows sorted for drawing
            var visibleRows = [];
            for (var vr = 0; vr < rows.length; vr++) {
                if (!hiddenSeries[rows[vr].series]) {
                    var sumRatio = 0;
                    for (var ar = 0; ar < numAxes; ar++) {
                        sumRatio += effectiveMaxes[ar] > 0 ? rows[vr].values[ar] / effectiveMaxes[ar] : 0;
                    }
                    visibleRows.push({ idx: vr, avgRatio: sumRatio / numAxes });
                }
            }
            visibleRows.sort(function(a, b) { return b.avgRatio - a.avgRatio; });

            // Glow RGB from first visible series or fallback
            var firstSeries = uniqueSeries.length > 0 ? uniqueSeries[0] : '';
            var glowRgb = getSeriesRgb(colorTheme, 0, colorMatches, firstSeries);

            // Cache render state
            this._renderState = {
                w: w, h: h, cx: cx, cy: cy, radius: radius,
                title: title,
                titleSize: Math.max(12, Math.min(22, w * 0.035)),
                gridRings: gridRings,
                numAxes: numAxes,
                axisNames: axisNames,
                labelSize: Math.max(10, Math.min(16, radius * 0.12)),
                rows: rows,
                visibleRows: visibleRows,
                effectiveMaxes: effectiveMaxes,
                uniqueSeries: uniqueSeries,
                seriesColorIdx: seriesColorIdx,
                colorTheme: colorTheme,
                colorMatches: colorMatches,
                hiddenSeries: hiddenSeries,
                showLegend: showLegend,
                legendY: h - legendH / 2,
                legendFontSize: Math.max(11, Math.min(15, w * 0.02)),
                glowRgb: glowRgb
            };

            // ── Animation ──
            if (animDuration > 0 && !this._animTriggered) {
                this._animTriggered = true;
                this._animProgress = 0;
                this._animStart = performance.now();

                // Clear any existing timer
                if (this._animTimer) {
                    cancelAnimationFrame(this._animTimer);
                    this._animTimer = null;
                }

                var self = this;
                var duration = animDuration;

                function tick() {
                    var elapsed = performance.now() - self._animStart;
                    self._animProgress = Math.min(1, elapsed / duration);
                    self._drawFrame();
                    if (self._animProgress < 1) {
                        self._animTimer = requestAnimationFrame(tick);
                    } else {
                        self._animTimer = null;
                    }
                }
                self._animTimer = requestAnimationFrame(tick);
            } else {
                this._animProgress = 1;
                this._drawFrame();
            }
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            if (this._animTimer) {
                cancelAnimationFrame(this._animTimer);
                this._animTimer = null;
            }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
