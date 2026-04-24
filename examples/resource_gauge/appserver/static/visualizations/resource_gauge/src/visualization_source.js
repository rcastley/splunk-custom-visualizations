/*
 * Resource Gauge — Splunk Custom Visualization
 *
 * Three concentric arc gauges displaying CPU, Memory, and Disk I/O
 * utilization. Each arc fills with liquid-style color based on usage
 * percentage, with animated particles and progressive glow effects.
 * Uses glass-skeuomorphic design language.
 *
 * Expected SPL columns: cpu_pct, mem_pct, disk_pct
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var DEG = Math.PI / 180;
    var START_ANGLE = 135 * DEG;
    var END_ANGLE = 405 * DEG;
    var SWEEP_ANGLE = END_ANGLE - START_ANGLE; // 270 degrees

    var SPEED_MAP = { slow: 0.3, medium: 0.7, fast: 1.4 };

    var METRIC_ORDER = ['cpu', 'mem', 'disk'];
    var METRIC_LABELS = { cpu: 'CPU', mem: 'MEM', disk: 'DISK' };

    var THEMES = {
        default: {
            tubeStroke: 'rgba(100,180,255,0.25)',
            tubeGlass: 'rgba(60,130,220,0.06)',
            liquidLow: '#00d4aa',
            liquidMid: '#ffcc00',
            liquidHigh: '#ff3355',
            particle: 'rgba(100,200,255,0.8)',
            connector: 'rgba(100,180,255,0.15)',
            text: 'rgba(255,255,255,0.6)',
            valueBg: 'rgba(0,0,0,0.3)'
        },
        dark: {
            tubeStroke: 'rgba(80,80,120,0.3)',
            tubeGlass: 'rgba(30,30,60,0.1)',
            liquidLow: '#00b894',
            liquidMid: '#fdcb6e',
            liquidHigh: '#e17055',
            particle: 'rgba(150,150,200,0.7)',
            connector: 'rgba(80,80,120,0.15)',
            text: 'rgba(255,255,255,0.5)',
            valueBg: 'rgba(0,0,0,0.4)'
        },
        neon: {
            tubeStroke: 'rgba(0,255,200,0.3)',
            tubeGlass: 'rgba(0,255,200,0.04)',
            liquidLow: '#00ff88',
            liquidMid: '#ffff00',
            liquidHigh: '#ff0066',
            particle: 'rgba(0,255,200,0.9)',
            connector: 'rgba(0,255,200,0.2)',
            text: 'rgba(0,255,200,0.7)',
            valueBg: 'rgba(0,0,0,0.5)'
        }
    };

    // ── Helper functions ────────────────────────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function parseColor(c) {
        if (c.charAt(0) === '#') {
            return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        }
        var m = c.match(/(\d+)/g);
        if (m && m.length >= 3) {
            return [parseInt(m[0], 10), parseInt(m[1], 10), parseInt(m[2], 10)];
        }
        return [0, 0, 0];
    }

    function lerpColor(a, b, t) {
        var ac = parseColor(a);
        var bc = parseColor(b);
        var r = Math.round(ac[0] + (bc[0] - ac[0]) * t);
        var g = Math.round(ac[1] + (bc[1] - ac[1]) * t);
        var bl = Math.round(ac[2] + (bc[2] - ac[2]) * t);
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    function getFillColor(pct, warnThresh, critThresh, theme) {
        if (pct >= critThresh) return theme.liquidHigh;
        if (pct >= warnThresh) {
            var t = (pct - warnThresh) / (critThresh - warnThresh);
            return lerpColor(theme.liquidMid, theme.liquidHigh, t);
        }
        if (pct >= warnThresh * 0.5) {
            var t2 = (pct - warnThresh * 0.5) / (warnThresh * 0.5);
            return lerpColor(theme.liquidLow, theme.liquidMid, t2);
        }
        return theme.liquidLow;
    }

    function colorWithAlpha(color, alpha) {
        var c = parseColor(color);
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
    }

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

    // ── Arc Drawing Functions ───────────────────────────────────

    function drawArcTrack(ctx, cx, cy, radius, arcWidth, theme) {
        // 1. Outer border arc (full 270 degree sweep)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, START_ANGLE, END_ANGLE, false);
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = arcWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 2. Glass tint fill (slightly thinner)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, START_ANGLE, END_ANGLE, false);
        ctx.strokeStyle = theme.tubeGlass;
        ctx.lineWidth = arcWidth - 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 3. Inner edge highlight (subtle white line on inner edge)
        ctx.beginPath();
        ctx.arc(cx, cy, radius - arcWidth / 2 + 1, START_ANGLE, END_ANGLE, false);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 4. Outer edge highlight (subtle white line on outer edge)
        ctx.beginPath();
        ctx.arc(cx, cy, radius + arcWidth / 2 - 1, START_ANGLE, END_ANGLE, false);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    function drawArcFill(ctx, cx, cy, radius, arcWidth, pct, fillColor, showGlow, time) {
        if (pct <= 0) return;

        var fillAngle = START_ANGLE + SWEEP_ANGLE * (pct / 100);

        ctx.save();

        // Draw the filled arc with slight alpha for liquid feel
        ctx.beginPath();
        ctx.arc(cx, cy, radius, START_ANGLE, fillAngle, false);
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = arcWidth - 4;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.85;
        ctx.stroke();

        // Lighter overlay for glass liquid sheen
        ctx.beginPath();
        ctx.arc(cx, cy, radius + arcWidth * 0.15, START_ANGLE, fillAngle, false);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = arcWidth * 0.2;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 1;
        ctx.stroke();

        ctx.restore();

        // Glow effect for high-usage arcs
        if (showGlow && pct > 50) {
            var glowIntensity = (pct - 50) / 50;
            var pulseAlpha = 0.15 + Math.sin(time * 3) * 0.05;

            ctx.save();
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = 12 * glowIntensity;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, START_ANGLE, fillAngle, false);
            ctx.strokeStyle = fillColor;
            ctx.lineWidth = arcWidth - 4;
            ctx.lineCap = 'round';
            ctx.globalAlpha = pulseAlpha * glowIntensity;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawArcParticles(ctx, cx, cy, radius, arcWidth, pct, time, speed, theme) {
        if (pct <= 2) return;

        var fillAngle = START_ANGLE + SWEEP_ANGLE * (pct / 100);
        var arcLen = SWEEP_ANGLE * (pct / 100);
        var particleCount = Math.max(3, Math.min(6, Math.floor(pct / 15)));

        for (var i = 0; i < particleCount; i++) {
            var seed = i * 137.508;
            var baseOffset = (seed % arcLen);
            var animOffset = (time * speed * 0.8 + i * 0.7) % arcLen;
            var angle = START_ANGLE + animOffset;

            // Stay within the filled portion
            if (angle > fillAngle) continue;

            var px = cx + Math.cos(angle) * radius;
            var py = cy + Math.sin(angle) * radius;
            var pSize = 1.5 + (seed % 2);
            var pAlpha = 0.4 + Math.sin(time * 4 + i * 1.5) * 0.3;

            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
            ctx.fillStyle = theme.particle;
            ctx.globalAlpha = clamp(pAlpha, 0.2, 0.9);
            ctx.shadowColor = theme.particle;
            ctx.shadowBlur = 4;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function getHealthStatus(cpu, mem, disk, warnThresh, critThresh) {
        var worst = Math.max(cpu, mem, disk);
        if (worst >= critThresh) return { label: 'CRITICAL', color: '#ff3355' };
        if (worst >= warnThresh) return { label: 'WARNING', color: '#ffcc00' };
        return { label: 'HEALTHY', color: '#00d4aa' };
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('resource-gauge-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._animTime = 0;
            this._timer = null;
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
                    'Awaiting data \u2014 Resource Gauge'
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

            // Pass through raw data for updateView to resolve field names
            var result = { colIdx: colIdx, rows: data.rows };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Custom no-data message
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                this._stopAnimation();
                return;
            }

            if (!data) {
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    return;
                }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var warningThreshold = parseInt(config[ns + 'warningThreshold'], 10) || 70;
            var criticalThreshold = parseInt(config[ns + 'criticalThreshold'], 10) || 85;
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var cpuField = config[ns + 'cpuField'] || 'cpu_pct';
            var memField = config[ns + 'memField'] || 'mem_pct';
            var diskField = config[ns + 'diskField'] || 'disk_pct';

            var theme = THEMES[colorTheme] || THEMES['default'];
            var speed = SPEED_MAP[animSpeed] || SPEED_MAP.medium;

            // ── Resolve field values ──
            var colIdx = data.colIdx;
            var row = data.rows[data.rows.length - 1];

            function getVal(fieldName) {
                if (colIdx[fieldName] === undefined) return 0;
                var v = parseFloat(row[colIdx[fieldName]]);
                return isNaN(v) ? 0 : clamp(v, 0, 100);
            }

            var cpuPct = getVal(cpuField);
            var memPct = getVal(memField);
            var diskPct = getVal(diskField);

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

            ctx.clearRect(0, 0, w, h);

            // ── Layout calculations ──
            var minDim = Math.min(w, h);
            var R = minDim * 0.42;
            var arcWidth = Math.max(10, Math.min(30, R * 0.14));
            var gap = Math.max(4, arcWidth * 0.35);

            var cx = w / 2;
            var cy = h / 2;

            // Radii for three concentric arcs
            var radii = [
                R,                              // CPU (outermost)
                R - arcWidth - gap,             // Memory (middle)
                R - 2 * (arcWidth + gap)        // Disk (innermost)
            ];

            var metrics = [
                { key: 'cpu', pct: cpuPct },
                { key: 'mem', pct: memPct },
                { key: 'disk', pct: diskPct }
            ];

            // ── Draw arc tracks and fills ──
            for (var a = 0; a < 3; a++) {
                var metric = metrics[a];
                var radius = radii[a];
                var fillColor = getFillColor(metric.pct, warningThreshold, criticalThreshold, theme);

                // Glass track background
                drawArcTrack(ctx, cx, cy, radius, arcWidth, theme);

                // Liquid fill arc
                drawArcFill(ctx, cx, cy, radius, arcWidth, metric.pct, fillColor, showGlow, this._animTime);

                // Animated particles
                drawArcParticles(ctx, cx, cy, radius, arcWidth, metric.pct, this._animTime, speed, theme);
            }

            // ── Center area: laid out as a single vertical block ──
            // Available space inside the innermost arc
            var innerR = radii[2] - arcWidth / 2 - 4;
            var availCenter = innerR * 2 * 0.85;

            // Calculate font sizes constrained by available space
            var titleFS = Math.max(8, Math.min(14, availCenter * 0.11));
            var statusFS = Math.max(7, Math.min(12, availCenter * 0.09));
            var labelFS = showLabels ? Math.max(7, Math.min(12, availCenter * 0.09)) : 0;
            var valueFS = showLabels ? Math.max(8, Math.min(14, availCenter * 0.11)) : 0;

            // Measure total block height
            var titleH = titleFS + 2;
            var statusH = statusFS + 4;
            var metricGap = showLabels ? Math.max(4, availCenter * 0.03) : 0;
            var rowH = showLabels ? Math.max(14, valueFS + 4) : 0;
            var metricsBlockH = showLabels ? rowH * 3 : 0;
            var totalBlockH = titleH + statusH + metricGap + metricsBlockH;

            // Vertically center the whole block
            var blockTopY = cy - totalBlockH / 2;

            // Title
            ctx.font = '600 ' + titleFS + 'px sans-serif';
            ctx.fillStyle = theme.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('RESOURCES', cx, blockTopY);

            // Health status
            var health = getHealthStatus(cpuPct, memPct, diskPct, warningThreshold, criticalThreshold);
            ctx.font = '700 ' + statusFS + 'px sans-serif';
            ctx.fillStyle = health.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.globalAlpha = 0.8 + Math.sin(this._animTime * 2) * 0.1;
            ctx.fillText(health.label, cx, blockTopY + titleH);
            ctx.globalAlpha = 1;

            // Metric rows: swatch + label + value
            if (showLabels) {
                var metricsTopY = blockTopY + titleH + statusH + metricGap;
                var swatchSize = Math.max(5, labelFS * 0.65);
                var swatchGap = Math.max(3, swatchSize * 0.5);
                var rowContentW = innerR * 1.4;
                var rowLeft = cx - rowContentW / 2;
                var rowRight = cx + rowContentW / 2;

                for (var m = 0; m < 3; m++) {
                    var met = metrics[m];
                    var mLabel = METRIC_LABELS[met.key];
                    var mPct = Math.round(met.pct);
                    var mColor = getFillColor(met.pct, warningThreshold, criticalThreshold, theme);
                    var rowMidY = metricsTopY + m * rowH + rowH / 2;

                    // Color swatch
                    ctx.save();
                    roundRect(ctx, rowLeft, rowMidY - swatchSize / 2, swatchSize, swatchSize, 2);
                    ctx.fillStyle = mColor;
                    ctx.globalAlpha = 0.9;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.restore();

                    // Metric label
                    ctx.font = '600 ' + labelFS + 'px sans-serif';
                    ctx.fillStyle = theme.text;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(mLabel, rowLeft + swatchSize + swatchGap, rowMidY);

                    // Percentage value
                    ctx.font = 'bold ' + valueFS + 'px monospace';
                    ctx.fillStyle = mColor;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(mPct + '%', rowRight, rowMidY);
                }
            }

            // ── Arc endpoint labels ──
            for (var e = 0; e < 3; e++) {
                var eMet = metrics[e];
                var eRadius = radii[e];
                var eColor = getFillColor(eMet.pct, warningThreshold, criticalThreshold, theme);
                var eLabelFS = Math.max(7, Math.min(11, minDim * 0.032));

                // Label at start of arc (bottom-left)
                var startLabelAngle = START_ANGLE - 0.12;
                var slx = cx + Math.cos(startLabelAngle) * (eRadius + arcWidth * 0.8);
                var sly = cy + Math.sin(startLabelAngle) * (eRadius + arcWidth * 0.8);
                ctx.font = '600 ' + eLabelFS + 'px sans-serif';
                ctx.fillStyle = theme.text;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = 0.7;
                ctx.fillText(METRIC_LABELS[eMet.key], slx, sly);
                ctx.globalAlpha = 1;
            }

            // ── Legend at bottom ──
            var legendFS = Math.max(8, Math.min(11, w * 0.018));
            var legendY = h - Math.max(8, h * 0.03);
            var legendItems = [
                { color: theme.liquidLow, label: 'Normal (<' + warningThreshold + '%)' },
                { color: theme.liquidMid, label: 'Warning (' + warningThreshold + '-' + criticalThreshold + '%)' },
                { color: theme.liquidHigh, label: 'Critical (>' + criticalThreshold + '%)' }
            ];
            ctx.font = legendFS + 'px sans-serif';
            ctx.textBaseline = 'middle';

            var swSz = legendFS;
            var legendPad = legendFS * 0.6;
            var totalLegendW = 0;
            for (var li = 0; li < legendItems.length; li++) {
                totalLegendW += swSz + legendPad + ctx.measureText(legendItems[li].label).width;
                if (li < legendItems.length - 1) totalLegendW += legendPad * 2;
            }
            var lx = (w - totalLegendW) / 2;

            for (var lj = 0; lj < legendItems.length; lj++) {
                ctx.fillStyle = legendItems[lj].color;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(lx, legendY - swSz / 2, swSz, swSz);
                ctx.globalAlpha = 1;
                lx += swSz + legendPad;
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.textAlign = 'left';
                ctx.fillText(legendItems[lj].label, lx, legendY);
                lx += ctx.measureText(legendItems[lj].label).width + legendPad * 2;
            }

            // ── Start animation loop ──
            this._startAnimation();
        },

        _startAnimation: function() {
            if (this._timer) return;
            var self = this;
            this._timer = setInterval(function() {
                self._animTime += 0.016;
                self.invalidateUpdateView();
            }, 50);
        },

        _stopAnimation: function() {
            if (this._timer) {
                clearInterval(this._timer);
                this._timer = null;
            }
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

            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u23F3', w / 2, h / 2 - fontSize * 0.5 - gap);

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
            this._stopAnimation();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
