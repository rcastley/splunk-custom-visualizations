/*
 * Search Activity — Splunk Custom Visualization
 *
 * Horizontal stacked glass tank showing search slot utilization.
 * Liquid fills from left to right, segmented by search type
 * (scheduled, ad-hoc, other). Empty space = remaining capacity.
 *
 * Expected SPL columns: type, count
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

    var SEARCH_COLORS = {
        default: { scheduled: '#00d4aa', adhoc: '#4dabf7', other: '#b197fc' },
        dark: { scheduled: '#00b894', adhoc: '#339af0', other: '#9775fa' },
        neon: { scheduled: '#00ff88', adhoc: '#ffff00', other: '#ff0066' }
    };

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

    function drawGlassTube(ctx, x, y, w, h, radius, theme) {
        // Glass fill
        roundRect(ctx, x, y, w, h, radius);
        ctx.fillStyle = theme.tubeGlass;
        ctx.fill();

        // Glass border
        roundRect(ctx, x, y, w, h, radius);
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Left-edge reflection gradient (vertical highlight)
        var refW = Math.max(4, w * 0.06);
        var grad = ctx.createLinearGradient(x, y, x + refW, y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.08, 'rgba(255,255,255,0.08)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.save();
        roundRect(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, refW, h);
        ctx.restore();
    }

    function mapTypeKey(type) {
        var lower = (type || '').toLowerCase().replace(/[^a-z]/g, '');
        if (lower === 'scheduled') return 'scheduled';
        if (lower === 'adhoc' || lower === 'ad-hoc' || lower === 'adoc') return 'adhoc';
        return 'other';
    }

    function typeLabel(key) {
        if (key === 'scheduled') return 'Scheduled';
        if (key === 'adhoc') return 'Ad-hoc';
        return 'Other';
    }

    function initBubbles(count) {
        var bubbles = [];
        for (var i = 0; i < count; i++) {
            bubbles.push({
                x: Math.random(),
                y: Math.random(),
                r: 1 + Math.random() * 1.5,
                speed: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2
            });
        }
        return bubbles;
    }

    function drawLiquidSegments(ctx, tankX, tankY, tankW, tankH, radius, segments, total, maxConcurrent, colors, time) {
        if (total <= 0 || maxConcurrent <= 0) return 0;

        var inset = 3;
        var innerX = tankX + inset;
        var innerY = tankY + inset;
        var innerW = tankW - inset * 2;
        var innerH = tankH - inset * 2;
        var innerR = Math.max(1, radius - inset);

        var fillRatio = clamp(total / maxConcurrent, 0, 1);
        var totalFillW = innerW * fillRatio;

        // Clip to tank interior
        ctx.save();
        roundRect(ctx, innerX, innerY, innerW, innerH, innerR);
        ctx.clip();

        var curX = innerX;

        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg.count <= 0) continue;

            var segW = totalFillW * (seg.count / total);
            if (segW < 0.5) continue;

            var baseColor = colors[seg.key] || colors.other;
            var darkColor = lerpColor(baseColor, '#000000', 0.35);

            // Vertical gradient — bright at left, darker at right
            var grad = ctx.createLinearGradient(curX, 0, curX + segW, 0);
            grad.addColorStop(0, baseColor);
            grad.addColorStop(1, darkColor);

            ctx.globalAlpha = 0.85;
            ctx.fillStyle = grad;
            ctx.fillRect(curX, innerY, segW, innerH);
            ctx.globalAlpha = 1;

            // Bubbles inside this segment
            var bubbleCount = Math.max(2, Math.round(segW / 30));
            for (var b = 0; b < bubbleCount; b++) {
                var bPhase = b * 1.7 + i * 3.1;
                var bx = curX + (((Math.sin(time * 0.5 + bPhase) * 0.5 + 0.5) * 0.8 + 0.1) * segW);
                var by = innerY + (((Math.cos(time * 0.7 + bPhase * 1.3) * 0.5 + 0.5) * 0.7 + 0.15) * innerH);
                var br = 1 + Math.sin(time * 2 + bPhase) * 0.5;

                ctx.beginPath();
                ctx.arc(bx, by, br, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fill();
            }

            curX += segW;
        }

        // Wave surface on the right edge of the liquid
        if (totalFillW > 2 && fillRatio < 0.99) {
            var waveAmp = Math.min(3, totalFillW * 0.02);
            var wavePeriod = innerH * 0.3;
            var waveX = innerX + totalFillW;

            ctx.beginPath();
            ctx.moveTo(waveX, innerY);
            for (var wy = innerY; wy <= innerY + innerH; wy += 1) {
                var wOffset = Math.sin(((wy - innerY) / wavePeriod) * Math.PI * 2 + time * 2) * waveAmp;
                ctx.lineTo(waveX + wOffset, wy);
            }
            ctx.lineTo(waveX - waveAmp - 2, innerY + innerH);
            ctx.lineTo(waveX - waveAmp - 2, innerY);
            ctx.closePath();

            // Use the last segment's color for the wave surface
            var lastColor = segments.length > 0 ? (colors[segments[segments.length - 1].key] || colors.other) : colors.other;
            ctx.fillStyle = lastColor;
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        return totalFillW;
    }

    function drawGlow(ctx, tankX, tankY, tankW, tankH, radius, pct, warnThresh, critThresh, fillColor, theme, time, showGlow) {
        if (!showGlow || pct <= 50) return;

        var intensity = (pct - 50) / 50;
        var pulse = 0.85 + Math.sin(time * 3) * 0.05;
        var glowColor = pct >= critThresh ? theme.liquidHigh : fillColor;

        ctx.save();
        roundRect(ctx, tankX, tankY, tankW, tankH, radius);
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12 * intensity;
        ctx.globalAlpha = 0.2 * intensity * pulse;
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawCenterStats(ctx, tankX, tankY, tankW, tankH, total, maxConcurrent, pct, warnThresh, critThresh, theme) {
        // Constrain font sizes to available space inside the tank
        var availW = tankW * 0.8;
        var availH = tankH * 0.8;

        var pctFS = Math.max(10, Math.min(36, Math.min(availW * 0.12, availH * 0.45)));
        var subFS = Math.max(7, Math.min(14, Math.min(availW * 0.05, availH * 0.2)));

        var cx = tankX + tankW / 2;
        var cy = tankY + tankH / 2;

        // Background pill for readability
        var pillW = Math.min(availW * 0.6, pctFS * 5);
        var pillH = pctFS + subFS + 12;
        var pillR = Math.min(6, pillH * 0.2);
        roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillR);
        ctx.fillStyle = theme.valueBg;
        ctx.fill();

        // Percentage text
        var pctStr = Math.round(pct) + '%';
        var fillColor = getFillColor(pct, warnThresh, critThresh, theme);

        ctx.font = 'bold ' + pctFS + 'px monospace';
        ctx.fillStyle = fillColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pctStr, cx, cy - subFS * 0.4);

        // Slots sub-text
        ctx.font = subFS + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var subStr = total + ' / ' + maxConcurrent + ' slots';
        ctx.fillText(subStr, cx, cy + pctFS * 0.4);
    }

    function drawLegend(ctx, w, legendY, segments, colors, theme) {
        var legendFS = Math.max(8, Math.min(11, w * 0.018));
        var swatchSize = legendFS;
        var legendPad = legendFS * 0.6;

        // Build legend items: one per segment type present + "Available"
        var items = [];
        for (var i = 0; i < segments.length; i++) {
            if (segments[i].count > 0) {
                items.push({
                    color: colors[segments[i].key] || colors.other,
                    label: typeLabel(segments[i].key) + ' (' + segments[i].count + ')'
                });
            }
        }
        items.push({
            color: theme.tubeGlass,
            label: 'Available'
        });

        ctx.font = legendFS + 'px sans-serif';
        ctx.textBaseline = 'middle';

        // Measure total legend width
        var totalLW = 0;
        for (var li = 0; li < items.length; li++) {
            totalLW += swatchSize + legendPad + ctx.measureText(items[li].label).width;
            if (li < items.length - 1) totalLW += legendPad * 2;
        }

        var lx = (w - totalLW) / 2;

        for (var lj = 0; lj < items.length; lj++) {
            ctx.fillStyle = items[lj].color;
            ctx.globalAlpha = 0.8;
            roundRect(ctx, lx, legendY - swatchSize / 2, swatchSize, swatchSize, 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            lx += swatchSize + legendPad;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'left';
            ctx.fillText(items[lj].label, lx, legendY);
            lx += ctx.measureText(items[lj].label).width + legendPad * 2;
        }
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('search-activity-viz');

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
                    'Awaiting data \u2014 Search Activity'
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

            // Build array of {type, count} from multi-row data
            var typeIdx = colIdx.type;
            var countIdx = colIdx.count;

            if (typeIdx === undefined || countIdx === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: type, count'
                );
            }

            var segments = [];
            var total = 0;
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var typeVal = row[typeIdx] || '';
                var countVal = parseInt(row[countIdx], 10);
                if (isNaN(countVal)) countVal = 0;
                if (typeVal === '' && countVal === 0) continue; // skip appendpipe fallback row

                var key = mapTypeKey(typeVal);
                // Merge duplicate keys
                var found = false;
                for (var s = 0; s < segments.length; s++) {
                    if (segments[s].key === key) {
                        segments[s].count += countVal;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    segments.push({ key: key, type: typeVal, count: countVal });
                }
                total += countVal;
            }

            // Sort: scheduled first, then adhoc, then other
            var order = { scheduled: 0, adhoc: 1, other: 2 };
            segments.sort(function(a, b) {
                return (order[a.key] || 99) - (order[b.key] || 99);
            });

            var result = { segments: segments, total: total };
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
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var maxConcurrent = parseInt(config[ns + 'maxConcurrent'], 10) || 50;
            var warningThreshold = parseInt(config[ns + 'warningThreshold'], 10) || 60;
            var criticalThreshold = parseInt(config[ns + 'criticalThreshold'], 10) || 80;

            var theme = THEMES[colorTheme] || THEMES['default'];
            var colors = SEARCH_COLORS[colorTheme] || SEARCH_COLORS['default'];
            var speed = SPEED_MAP[animSpeed] || SPEED_MAP.medium;

            var segments = data.segments || [];
            var total = data.total || 0;
            var pct = maxConcurrent > 0 ? clamp((total / maxConcurrent) * 100, 0, 100) : 0;

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

            // ── Layout: tank dimensions ──
            var pad = Math.max(12, Math.min(30, w * 0.04));
            var legendReserve = Math.max(16, h * 0.12);
            var tankX = pad;
            var tankW = w - pad * 2;
            var tankH = Math.max(30, Math.min(h * 0.5, (h - legendReserve - pad * 2) * 0.7));
            var tankY = (h - legendReserve - tankH) / 2;
            var radius = Math.min(12, tankH * 0.15);

            // Advance animation time
            var timeStep = 0.016 * (speed / 0.7);
            // (animation is driven by the timer, _animTime updated there)

            // ── Draw glass tank ──
            drawGlassTube(ctx, tankX, tankY, tankW, tankH, radius, theme);

            // ── Draw liquid segments ──
            var fillColor = getFillColor(pct, warningThreshold, criticalThreshold, theme);
            drawLiquidSegments(ctx, tankX, tankY, tankW, tankH, radius, segments, total, maxConcurrent, colors, this._animTime);

            // ── Glow ──
            drawGlow(ctx, tankX, tankY, tankW, tankH, radius, pct, warningThreshold, criticalThreshold, fillColor, theme, this._animTime, showGlow);

            // ── Center stats (inside the tank) ──
            drawCenterStats(ctx, tankX, tankY, tankW, tankH, total, maxConcurrent, pct, warningThreshold, criticalThreshold, theme);

            // ── Legend (below tank) ──
            var legendY = tankY + tankH + legendReserve * 0.6;
            drawLegend(ctx, w, legendY, segments, colors, theme);

            // ── Start animation loop ──
            this._startAnimation(speed);
        },

        _startAnimation: function(speed) {
            if (this._timer) return;
            var self = this;
            var s = speed || 0.7;
            this._timer = setInterval(function() {
                self._animTime += 0.016 * (s / 0.7);
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
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
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
