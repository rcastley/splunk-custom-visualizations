/*
 * Bet Type Radar Chart — Splunk Custom Visualization
 *
 * Renders a spider/radar chart showing the distribution of bet types
 * for a World Cup match. Optionally overlays current match vs tournament
 * average as a second polygon.
 *
 * Expected SPL columns: bet_type (string), volume (number), avg_volume (number, optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper functions (pure, no `this`) ──────────────────────

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

    function rgbaStr(rgb, alpha) {
        return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
    }

    function drawGrid(ctx, cx, cy, radius, numAxes, numRings) {
        var i, r, angle, ringRadius;

        // Concentric grid rings
        for (r = 1; r <= numRings; r++) {
            ringRadius = (radius / numRings) * r;
            ctx.beginPath();
            for (i = 0; i < numAxes; i++) {
                angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
                if (i === 0) {
                    ctx.moveTo(cx + ringRadius * Math.cos(angle), cy + ringRadius * Math.sin(angle));
                } else {
                    ctx.lineTo(cx + ringRadius * Math.cos(angle), cy + ringRadius * Math.sin(angle));
                }
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Spokes from center to each axis
        for (i = 0; i < numAxes; i++) {
            angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawGridLabels(ctx, cx, cy, radius, numRings, maxVal, fontSize) {
        ctx.font = fontSize + 'px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        for (var r = 1; r <= numRings; r++) {
            var ringRadius = (radius / numRings) * r;
            var labelVal = Math.round((maxVal / numRings) * r);
            ctx.fillText(labelVal.toLocaleString(), cx + 4, cy - ringRadius - 2);
        }
    }

    function drawAxisLabels(ctx, cx, cy, radius, labels, fontSize) {
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,200,80,0.9)';
        ctx.textBaseline = 'middle';
        var pad = fontSize * 1.2;
        var numAxes = labels.length;
        for (var i = 0; i < numAxes; i++) {
            var angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            var lx = cx + (radius + pad) * Math.cos(angle);
            var ly = cy + (radius + pad) * Math.sin(angle);
            var cosA = Math.cos(angle);
            ctx.textAlign = cosA > 0.1 ? 'left' : cosA < -0.1 ? 'right' : 'center';
            var sinA = Math.sin(angle);
            if (sinA < -0.5) {
                ly -= fontSize * 0.3;
            } else if (sinA > 0.5) {
                ly += fontSize * 0.3;
            }
            ctx.fillText(labels[i], lx, ly);
        }
    }

    function drawPolygon(ctx, cx, cy, radius, values, maxVal, rgb, fillOpacity, dashed) {
        var numAxes = values.length;
        var i, angle, ratio, x, y;

        ctx.beginPath();
        for (i = 0; i < numAxes; i++) {
            angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            ratio = maxVal > 0 ? values[i] / maxVal : 0;
            ratio = Math.max(0, Math.min(1, ratio));
            x = cx + radius * ratio * Math.cos(angle);
            y = cy + radius * ratio * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();

        // Fill
        ctx.globalAlpha = fillOpacity;
        ctx.fillStyle = rgbaStr(rgb, 1);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Stroke
        if (dashed) {
            ctx.setLineDash([6, 4]);
        } else {
            ctx.setLineDash([]);
        }
        ctx.strokeStyle = rgbaStr(rgb, 0.9);
        ctx.lineWidth = 2;

        // Glow effect on stroke
        ctx.shadowColor = rgbaStr(rgb, 0.6);
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
    }

    function drawVertices(ctx, cx, cy, radius, values, maxVal, rgb) {
        var numAxes = values.length;
        for (var i = 0; i < numAxes; i++) {
            var angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            var ratio = maxVal > 0 ? values[i] / maxVal : 0;
            ratio = Math.max(0, Math.min(1, ratio));
            var x = cx + radius * ratio * Math.cos(angle);
            var y = cy + radius * ratio * Math.sin(angle);

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = rgbaStr(rgb, 1);
            ctx.shadowColor = rgbaStr(rgb, 0.8);
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    function drawValueLabels(ctx, cx, cy, radius, values, maxVal, rgb, fontSize) {
        ctx.font = fontSize + 'px monospace';
        ctx.textBaseline = 'middle';
        var numAxes = values.length;
        for (var i = 0; i < numAxes; i++) {
            var angle = (Math.PI * 2 * i / numAxes) - Math.PI / 2;
            var ratio = maxVal > 0 ? values[i] / maxVal : 0;
            ratio = Math.max(0, Math.min(1, ratio));
            var x = cx + radius * ratio * Math.cos(angle);
            var y = cy + radius * ratio * Math.sin(angle);

            var label = values[i].toLocaleString();
            var cosA = Math.cos(angle);
            var sinA = Math.sin(angle);

            // Offset label away from center
            var offsetX = cosA > 0.1 ? 8 : cosA < -0.1 ? -8 : 0;
            var offsetY = sinA > 0.1 ? 10 : sinA < -0.1 ? -10 : 0;

            ctx.textAlign = cosA > 0.1 ? 'left' : cosA < -0.1 ? 'right' : 'center';
            ctx.fillStyle = rgbaStr(rgb, 0.9);
            ctx.fillText(label, x + offsetX, y + offsetY);
        }
    }

    function drawCenterDot(ctx, cx, cy, rgb) {
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = rgbaStr(rgb, 0.8);
        ctx.shadowColor = rgbaStr(rgb, 0.5);
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    function drawCenterGlow(ctx, cx, cy, radius, rgb) {
        var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.5);
        gradient.addColorStop(0, rgbaStr(rgb, 0.12));
        gradient.addColorStop(0.5, rgbaStr(rgb, 0.04));
        gradient.addColorStop(1, rgbaStr(rgb, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawLegend(ctx, w, y, fillRgb, avgRgb, showAvg, fontSize) {
        var items = [{ label: 'Current Match', rgb: fillRgb, dashed: false }];
        if (showAvg) {
            items.push({ label: 'Tournament Avg', rgb: avgRgb, dashed: true });
        }

        var swatchW = fontSize * 2;
        var gap = fontSize * 2;
        var totalW = 0;
        ctx.font = fontSize + 'px sans-serif';
        for (var i = 0; i < items.length; i++) {
            totalW += swatchW + fontSize * 0.5 + ctx.measureText(items[i].label).width;
            if (i < items.length - 1) totalW += gap;
        }

        var currentX = (w - totalW) / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (var j = 0; j < items.length; j++) {
            var item = items[j];

            // Draw swatch line
            ctx.beginPath();
            ctx.moveTo(currentX, y);
            ctx.lineTo(currentX + swatchW, y);
            ctx.strokeStyle = rgbaStr(item.rgb, 0.9);
            ctx.lineWidth = 2.5;
            if (item.dashed) {
                ctx.setLineDash([6, 4]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            currentX += swatchW + fontSize * 0.5;

            // Draw label
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText(item.label, currentX, y);
            currentX += ctx.measureText(item.label).width + gap;
        }
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('bet-radar-viz');

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
                    'Awaiting data \u2014 Bet Type Radar Chart'
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
            if (colIdx.bet_type === undefined || colIdx.volume === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: bet_type, volume'
                );
            }

            // Build array of bet type data
            var items = [];
            var hasAvg = colIdx.avg_volume !== undefined;
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var betType = row[colIdx.bet_type] || '';
                var volume = parseFloat(row[colIdx.volume]);
                if (isNaN(volume)) volume = 0;

                var avgVolume = 0;
                if (hasAvg) {
                    avgVolume = parseFloat(row[colIdx.avg_volume]);
                    if (isNaN(avgVolume)) avgVolume = 0;
                }

                items.push({
                    betType: betType,
                    volume: volume,
                    avgVolume: avgVolume
                });
            }

            var result = { items: items, hasAvg: hasAvg };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Custom no-data message from appendpipe fallback
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            if (!data.items || data.items.length === 0) {
                if (this._lastGoodData && this._lastGoodData.items) {
                    data = this._lastGoodData;
                } else {
                    return;
                }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var fillColor = config[ns + 'fillColor'] || '#0088ff';
            var avgColor = config[ns + 'avgColor'] || '#ff8800';
            var showAverage = (config[ns + 'showAverage'] || 'true') === 'true';
            var showValues = (config[ns + 'showValues'] || 'true') === 'true';
            var showGrid = (config[ns + 'showGrid'] || 'true') === 'true';
            var maxValueSetting = parseFloat(config[ns + 'maxValue'] || '0');
            if (isNaN(maxValueSetting)) maxValueSetting = 0;
            var fillOpacity = parseFloat(config[ns + 'fillOpacity'] || '0.25');
            if (isNaN(fillOpacity)) fillOpacity = 0.25;

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

            // ── Extract data arrays ──
            var items = data.items;
            var numAxes = items.length;
            if (numAxes < 3) return; // Need at least 3 axes for a radar chart

            var labels = [];
            var volumes = [];
            var avgVolumes = [];
            for (var i = 0; i < numAxes; i++) {
                labels.push(items[i].betType);
                volumes.push(items[i].volume);
                avgVolumes.push(items[i].avgVolume);
            }

            // ── Determine max value ──
            var maxVal = maxValueSetting;
            if (maxVal <= 0) {
                maxVal = 0;
                for (var m = 0; m < numAxes; m++) {
                    if (volumes[m] > maxVal) maxVal = volumes[m];
                    if (showAverage && data.hasAvg && avgVolumes[m] > maxVal) maxVal = avgVolumes[m];
                }
                // Add 10% headroom
                maxVal = Math.ceil(maxVal * 1.1);
            }
            if (maxVal <= 0) maxVal = 100;

            // ── Layout ──
            var legendReserve = 30;
            var labelFontSize = Math.max(9, Math.min(14, Math.min(w, h) * 0.028));
            var labelPad = labelFontSize * 2.5;
            var availW = w - labelPad * 2;
            var availH = h - labelPad * 2 - legendReserve;
            var radius = Math.max(40, Math.min(availW, availH) / 2);
            var cx = w / 2;
            var cy = legendReserve + labelPad + radius;

            var fillRgb = hexToRgb(fillColor);
            var avgRgb = hexToRgb(avgColor);

            // ── Draw center glow ──
            drawCenterGlow(ctx, cx, cy, radius, fillRgb);

            // ── Draw grid ──
            if (showGrid) {
                drawGrid(ctx, cx, cy, radius, numAxes, 4);
                var gridLabelSize = Math.max(8, Math.min(10, radius * 0.07));
                drawGridLabels(ctx, cx, cy, radius, 4, maxVal, gridLabelSize);
            }

            // ── Draw average polygon (behind current) ──
            if (showAverage && data.hasAvg) {
                drawPolygon(ctx, cx, cy, radius, avgVolumes, maxVal, avgRgb, fillOpacity * 0.6, true);
                drawVertices(ctx, cx, cy, radius, avgVolumes, maxVal, avgRgb);
                if (showValues) {
                    var avgValFontSize = Math.max(8, Math.min(11, radius * 0.08));
                    drawValueLabels(ctx, cx, cy, radius, avgVolumes, maxVal, avgRgb, avgValFontSize);
                }
            }

            // ── Draw current match polygon ──
            drawPolygon(ctx, cx, cy, radius, volumes, maxVal, fillRgb, fillOpacity, false);
            drawVertices(ctx, cx, cy, radius, volumes, maxVal, fillRgb);
            if (showValues) {
                var valFontSize = Math.max(8, Math.min(12, radius * 0.09));
                drawValueLabels(ctx, cx, cy, radius, volumes, maxVal, fillRgb, valFontSize);
            }

            // ── Draw center dot ──
            drawCenterDot(ctx, cx, cy, fillRgb);

            // ── Draw axis labels ──
            drawAxisLabels(ctx, cx, cy, radius, labels, labelFontSize);

            // ── Draw legend ──
            var legendY = h - 12;
            var legendFontSize = Math.max(9, Math.min(12, w * 0.022));
            drawLegend(ctx, w, legendY, fillRgb, avgRgb, showAverage && data.hasAvg, legendFontSize);
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
            if (!ctx) return;
            if (rect.width <= 0 || rect.height <= 0) return;
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

            // Football emoji above text
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u26BD', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.50)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
