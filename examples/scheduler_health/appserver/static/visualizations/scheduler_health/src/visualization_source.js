/*
 * Scheduler Health — Splunk Custom Visualization
 *
 * Three horizontal glass tubes displaying scheduler vital signs:
 * success rate, skip rate, and average runtime. Each tube fills
 * like a thermometer with animated liquid, wave effects, and
 * bubble particles.
 *
 * Expected SPL columns: skip_pct, success_pct, avg_runtime, total, skipped
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var SPEED_MAP = { slow: 0.3, medium: 0.7, fast: 1.4 };

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

    var TUBE_LABELS = ['SUCCESS', 'SKIPPED', 'RUNTIME'];

    // ── Helper Functions ────────────────────────────────────────

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

    function formatNumber(n) {
        if (n >= 1000) {
            var s = n.toString();
            var result = '';
            var count = 0;
            for (var i = s.length - 1; i >= 0; i--) {
                result = s.charAt(i) + result;
                count++;
                if (count % 3 === 0 && i > 0) {
                    result = ',' + result;
                }
            }
            return result;
        }
        return n.toString();
    }

    // ── Color Logic ─────────────────────────────────────────────

    function getMetricColor(value, type, theme) {
        if (type === 'success') {
            // High is good: >= 95% green, 80-95% lerp mid-to-low, < 80% lerp high-to-mid
            if (value >= 95) return theme.liquidLow;
            if (value >= 80) {
                var t = (value - 80) / 15;
                return lerpColor(theme.liquidMid, theme.liquidLow, t);
            }
            var t2 = value / 80;
            return lerpColor(theme.liquidHigh, theme.liquidMid, t2);
        }
        if (type === 'skip') {
            // Low is good (inverted): 0-5% green, 5-15% yellow, >15% red
            if (value <= 5) return theme.liquidLow;
            if (value <= 15) {
                var t3 = (value - 5) / 10;
                return lerpColor(theme.liquidLow, theme.liquidMid, t3);
            }
            var t4 = clamp((value - 15) / 15, 0, 1);
            return lerpColor(theme.liquidMid, theme.liquidHigh, t4);
        }
        if (type === 'runtime') {
            // Based on % of threshold: < 50% green, 50-80% yellow, > 80% red
            if (value < 50) return theme.liquidLow;
            if (value <= 80) {
                var t5 = (value - 50) / 30;
                return lerpColor(theme.liquidLow, theme.liquidMid, t5);
            }
            var t6 = clamp((value - 80) / 20, 0, 1);
            return lerpColor(theme.liquidMid, theme.liquidHigh, t6);
        }
        return theme.liquidLow;
    }

    function shouldGlow(type, value) {
        if (type === 'success') return value < 70;
        if (type === 'skip') return value > 10;
        if (type === 'runtime') return value > 70;
        return false;
    }

    // ── Bubble Particles ────────────────────────────────────────

    function initBubbles(count) {
        var bubbles = [];
        for (var i = 0; i < count; i++) {
            bubbles.push({
                x: Math.random(),
                y: Math.random(),
                size: 1 + Math.random() * 2,
                speed: 0.005 + Math.random() * 0.01,
                alpha: 0.1 + Math.random() * 0.15,
                wobble: Math.random() * Math.PI * 2
            });
        }
        return bubbles;
    }

    // ── Drawing Functions ───────────────────────────────────────

    function drawGlassTube(ctx, x, y, w, h, r, theme) {
        // Glass fill
        roundRect(ctx, x, y, w, h, r);
        ctx.fillStyle = theme.tubeGlass;
        ctx.fill();

        // Glass border
        roundRect(ctx, x, y, w, h, r);
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Top-edge highlight gradient (horizontal tube — highlight runs along top)
        ctx.save();
        var hlGrad = ctx.createLinearGradient(x, y, x, y + h);
        hlGrad.addColorStop(0, 'rgba(255,255,255,0)');
        hlGrad.addColorStop(0.15, 'rgba(255,255,255,0.08)');
        hlGrad.addColorStop(0.4, 'rgba(255,255,255,0.03)');
        hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
        roundRect(ctx, x, y, w, h, r);
        ctx.fillStyle = hlGrad;
        ctx.fill();
        ctx.restore();
    }

    function drawHorizontalLiquid(ctx, tubeX, tubeY, tubeW, tubeH, tubeR, pct, fillColor, time, bubbles, showGlow, glowActive, type) {
        if (pct <= 0) return;

        var inset = 3;
        var innerX = tubeX + inset;
        var innerY = tubeY + inset;
        var innerW = tubeW - inset * 2;
        var innerH = tubeH - inset * 2;
        var innerR = Math.max(1, tubeR - inset);

        // Ensure minimum visual fill of 3%
        var displayPct = Math.max(3, pct);
        var fillWidth = (displayPct / 100) * innerW;

        // Wave parameters for the right edge
        var waveAmp = Math.max(1, innerH * 0.06);
        var wavePeriod = innerH * 0.8;

        // Build the liquid path: straight left, top, wavy right edge, bottom
        ctx.save();

        // Clip to the inner tube area
        roundRect(ctx, innerX, innerY, innerW, innerH, innerR);
        ctx.clip();

        // Draw liquid body with horizontal gradient
        var liquidGrad = ctx.createLinearGradient(innerX, 0, innerX + fillWidth, 0);
        liquidGrad.addColorStop(0, fillColor);
        liquidGrad.addColorStop(1, lerpColor(fillColor, '#000000', 0.35));

        ctx.beginPath();

        // Left side (straight, uses inner rounded rect left edge)
        var leftR = Math.min(innerR, fillWidth / 2);
        ctx.moveTo(innerX + leftR, innerY);

        // Top edge
        ctx.lineTo(innerX + fillWidth, innerY);

        // Wavy right edge (going down)
        var steps = Math.max(8, Math.round(innerH / 2));
        var stepH = innerH / steps;
        for (var i = 0; i <= steps; i++) {
            var sy = innerY + stepH * i;
            var wave = Math.sin((sy / wavePeriod) * Math.PI * 2 + time * 2) * waveAmp;
            var wx = innerX + fillWidth + wave;
            if (i === 0) {
                ctx.lineTo(wx, sy);
            } else {
                ctx.lineTo(wx, sy);
            }
        }

        // Bottom edge (going left)
        ctx.lineTo(innerX + leftR, innerY + innerH);

        // Left rounded corner bottom
        ctx.arcTo(innerX, innerY + innerH, innerX, innerY + innerH - leftR, leftR);

        // Left side going up
        ctx.lineTo(innerX, innerY + leftR);

        // Left rounded corner top
        ctx.arcTo(innerX, innerY, innerX + leftR, innerY, leftR);

        ctx.closePath();

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = liquidGrad;
        ctx.fill();

        // Draw bubbles inside the liquid
        if (bubbles && bubbles.length > 0) {
            var visibleCount = Math.max(2, Math.round(bubbles.length * (displayPct / 100)));
            for (var b = 0; b < visibleCount; b++) {
                var bubble = bubbles[b];
                // Advance bubble position
                bubble.x += bubble.speed * 0.3;
                bubble.y += Math.sin(time * 3 + bubble.wobble) * 0.002;
                if (bubble.x > 1) bubble.x -= 1;
                if (bubble.y > 1) bubble.y = 0;
                if (bubble.y < 0) bubble.y = 1;

                var bx = innerX + bubble.x * fillWidth;
                var by = innerY + bubble.y * innerH;

                ctx.beginPath();
                ctx.arc(bx, by, bubble.size, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.globalAlpha = bubble.alpha * (0.6 + Math.sin(time * 4 + b) * 0.4);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;
        ctx.restore();

        // Glow effect
        if (showGlow && glowActive) {
            ctx.save();
            var glowPulse = 0.4 + Math.sin(time * 3) * 0.3;
            roundRect(ctx, innerX, innerY, fillWidth, innerH, innerR);
            ctx.fillStyle = fillColor;
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = 12;
            ctx.globalAlpha = 0.15 * glowPulse;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawLabel(ctx, text, x, y, fontSize, theme) {
        ctx.save();
        ctx.font = '600 ' + fontSize + 'px sans-serif';
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    function drawValuePill(ctx, text, x, y, tubeH, fillColor, theme) {
        ctx.save();
        var fontSize = Math.max(9, Math.min(14, tubeH * 0.5));
        ctx.font = 'bold ' + fontSize + 'px monospace';

        var textW = ctx.measureText(text).width;
        var pillW = textW + 12;
        var pillH = fontSize + 8;
        var pillX = x - pillW - 4;
        var pillY = y - pillH / 2;
        var pillR = Math.min(pillH / 2, 6);

        // Pill background
        roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
        ctx.fillStyle = theme.valueBg;
        ctx.fill();

        // Value text
        ctx.fillStyle = fillColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, pillX + pillW / 2, y);

        ctx.restore();
    }

    function drawSummaryStats(ctx, total, skipped, avgRuntime, w, y, theme) {
        ctx.save();
        var fontSize = Math.max(8, Math.min(12, w * 0.018));
        ctx.font = fontSize + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        var totalStr = formatNumber(Math.round(total));
        var skippedStr = formatNumber(Math.round(skipped));
        var runtimeStr = avgRuntime.toFixed(1) + 's';
        var summary = 'Total: ' + totalStr + ' searches | ' + skippedStr + ' skipped | Avg: ' + runtimeStr;
        ctx.fillText(summary, w / 2, y);

        ctx.restore();
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('scheduler-health-viz');

            // Create canvas element
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            // Internal state
            this._lastGoodData = null;
            this._animTime = 0;
            this._animTimer = null;
            this._bubbles = [
                initBubbles(12),
                initBubbles(12),
                initBubbles(12)
            ];
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 50
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Scheduler Health'
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

            function getVal(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                var v = parseFloat(row[colIdx[name]]);
                return isNaN(v) ? fallback : v;
            }

            var row = data.rows[data.rows.length - 1];

            var result = {
                skipPct: getVal(row, 'skip_pct', 0),
                successPct: getVal(row, 'success_pct', 0),
                avgRuntime: getVal(row, 'avg_runtime', 0),
                total: getVal(row, 'total', 0),
                skipped: getVal(row, 'skipped', 0)
            };

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

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var runtimeThreshold = parseInt(config[ns + 'runtimeThreshold'], 10) || 30;

            var theme = THEMES[colorTheme] || THEMES['default'];
            var speed = SPEED_MAP[animSpeed] || SPEED_MAP.medium;

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

            // ── Layout ──
            var padX = Math.max(12, w * 0.03);
            var padY = Math.max(8, h * 0.03);

            // Reserve space for labels on the left and summary at the bottom
            var labelFontSize = Math.max(8, Math.min(13, w * 0.02));
            var labelAreaW = Math.max(60, w * 0.15);
            var summaryH = Math.max(16, h * 0.1);

            var tubeAreaX = padX + labelAreaW + 8;
            var tubeAreaW = w - tubeAreaX - padX;
            var availH = h - padY * 2 - summaryH;
            var gap = Math.max(8, availH * 0.08);
            var tubeH = (availH - 2 * gap) / 3;
            var tubeR = Math.min(tubeH / 2, 12);

            // ── Data values ──
            var successPct = clamp(data.successPct, 0, 100);
            var skipPct = clamp(data.skipPct, 0, 100);
            var avgRuntime = Math.max(0, data.avgRuntime);
            var runtimePct = clamp((avgRuntime / runtimeThreshold) * 100, 0, 100);

            // Metric percentages for fill
            var metrics = [
                { label: TUBE_LABELS[0], pct: successPct, type: 'success', displayVal: successPct.toFixed(1) + '%' },
                { label: TUBE_LABELS[1], pct: skipPct, type: 'skip', displayVal: skipPct.toFixed(1) + '%' },
                { label: TUBE_LABELS[2], pct: runtimePct, type: 'runtime', displayVal: avgRuntime.toFixed(1) + 's' }
            ];

            // ── Draw each tube ──
            for (var i = 0; i < 3; i++) {
                var metric = metrics[i];
                var tubeY = padY + i * (tubeH + gap);
                var tubeCenterY = tubeY + tubeH / 2;

                // Get fill color
                var fillColorVal = metric.type === 'runtime' ? runtimePct : metric.pct;
                var fillColor = getMetricColor(fillColorVal, metric.type, theme);
                var glowActive = shouldGlow(metric.type, fillColorVal);

                // Draw label
                drawLabel(ctx, metric.label, tubeAreaX - 12, tubeCenterY, labelFontSize, theme);

                // Draw glass tube
                drawGlassTube(ctx, tubeAreaX, tubeY, tubeAreaW, tubeH, tubeR, theme);

                // Draw liquid fill
                drawHorizontalLiquid(
                    ctx, tubeAreaX, tubeY, tubeAreaW, tubeH, tubeR,
                    metric.pct, fillColor, this._animTime,
                    this._bubbles[i], showGlow, glowActive, metric.type
                );

                // Draw value pill (right side of tube)
                drawValuePill(ctx, metric.displayVal, tubeAreaX + tubeAreaW, tubeCenterY, tubeH, fillColor, theme);
            }

            // ── Summary stats ──
            var summaryY = padY + 3 * (tubeH + gap) - gap + 8;
            drawSummaryStats(ctx, data.total, data.skipped, data.avgRuntime, w, summaryY, theme);

            // Store current speed so timer can read it
            this._currentSpeed = speed;

            // ── Start animation timer ──
            if (!this._animTimer) {
                var self = this;
                this._animTimer = setInterval(function() {
                    self._animTime += 0.016 * (self._currentSpeed || 0.7);
                    self.invalidateUpdateView();
                }, 50);
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
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gapSize = fontSize * 0.5;

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
            ctx.fillText('\u23F3', w / 2, h / 2 - fontSize * 0.5 - gapSize);

            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            if (this._animTimer) {
                clearInterval(this._animTimer);
                this._animTimer = null;
            }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
