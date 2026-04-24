/*
 * Splunk Status Board — Splunk Custom Visualization
 *
 * Glass-themed grid of component health tiles with animated liquid fill,
 * wave surface, bubble particles, and threshold-based coloring.
 * Matches the glass-skeuomorphic design language of the Indexing Pipeline Flow.
 *
 * Expected SPL columns: component, status, errors, warns, health_score
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

    function drawGlassTube(ctx, x, y, w, h, r, theme) {
        // Glass tint fill
        roundRect(ctx, x, y, w, h, r);
        ctx.fillStyle = theme.tubeGlass;
        ctx.fill();
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Left-edge reflection gradient
        var highlightW = Math.max(2, w * 0.08);
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x, y, w, h, r);
        ctx.clip();
        var hlGrad = ctx.createLinearGradient(x, y, x + highlightW * 3, y);
        hlGrad.addColorStop(0, 'rgba(255,255,255,0.0)');
        hlGrad.addColorStop(0.3, 'rgba(255,255,255,0.08)');
        hlGrad.addColorStop(0.6, 'rgba(255,255,255,0.03)');
        hlGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = hlGrad;
        ctx.fillRect(x + 2, y, highlightW * 3, h);
        ctx.restore();
    }

    function drawTileLiquid(ctx, x, y, tileW, tileH, r, fillPct, color, showGlow, time) {
        if (fillPct <= 0) return;

        var inset = 3;
        var lx = x + inset;
        var lw = tileW - inset * 2;
        var lr = Math.max(1, r - inset);
        var maxFillH = tileH - inset * 2;
        var fillH = maxFillH * (fillPct / 100);
        var ly = y + tileH - inset - fillH;

        ctx.save();

        // Clip to tile interior
        roundRect(ctx, x + inset, y + inset, lw, maxFillH, lr);
        ctx.clip();

        // Liquid gradient (darker at bottom, lighter at top)
        var lGrad = ctx.createLinearGradient(lx, ly, lx, ly + fillH);
        lGrad.addColorStop(0, color);
        lGrad.addColorStop(0.4, color);
        lGrad.addColorStop(1, lerpColor(color, '#000000', 0.35));
        ctx.fillStyle = lGrad;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(lx, ly, lw, fillH);

        // Animated wave on the liquid surface (compound sine)
        var waveAmp = Math.min(4, fillH * 0.12);
        var wavePeriod1 = lw * 0.35;
        var wavePeriod2 = lw * 0.55;

        function waveY(wx, t) {
            return Math.sin((wx / wavePeriod1) * Math.PI * 2 + t * 3.5) * waveAmp
                 + Math.sin((wx / wavePeriod2) * Math.PI * 2 - t * 2.2) * waveAmp * 0.4;
        }

        ctx.beginPath();
        ctx.moveTo(lx, ly + waveY(0, time));
        for (var wx = 1; wx <= lw; wx += 2) {
            ctx.lineTo(lx + wx, ly + waveY(wx, time));
        }
        ctx.lineTo(lx + lw, ly + fillH + 5);
        ctx.lineTo(lx, ly + fillH + 5);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Surface highlight line
        ctx.beginPath();
        ctx.moveTo(lx, ly + waveY(0, time));
        for (var sx = 1; sx <= lw; sx += 2) {
            ctx.lineTo(lx + sx, ly + waveY(sx, time));
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Bubble particles
        var bubbleCount = Math.max(2, Math.floor(fillPct / 12));
        for (var b = 0; b < bubbleCount; b++) {
            var seed = b * 137.508;
            var bx = lx + (((seed * 7.3) % lw));
            var rawBy = ly + fillH * 0.15 + ((seed * 3.7 + time * 30) % (fillH * 0.75));
            var by = Math.min(rawBy, ly + fillH - 4);
            var br = 1 + (seed % 2);
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();
        }

        ctx.restore();

        // Glow effect for high-fill tiles
        if (showGlow && fillPct > 50) {
            var glowIntensity = (fillPct - 50) / 50;
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 12 * glowIntensity;
            roundRect(ctx, x, y, tileW, tileH, r);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.2 * glowIntensity;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawStatusIcon(ctx, cx, cy, size, status, theme) {
        ctx.save();
        ctx.lineWidth = Math.max(1.5, size * 0.15);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (status === 'ok') {
            // Checkmark
            ctx.strokeStyle = theme.liquidLow;
            ctx.beginPath();
            ctx.moveTo(cx - size * 0.4, cy);
            ctx.lineTo(cx - size * 0.1, cy + size * 0.35);
            ctx.lineTo(cx + size * 0.4, cy - size * 0.3);
            ctx.stroke();
        } else if (status === 'warning') {
            // Warning triangle
            ctx.strokeStyle = theme.liquidMid;
            ctx.beginPath();
            ctx.moveTo(cx, cy - size * 0.4);
            ctx.lineTo(cx + size * 0.4, cy + size * 0.35);
            ctx.lineTo(cx - size * 0.4, cy + size * 0.35);
            ctx.closePath();
            ctx.stroke();
            // Exclamation dot
            ctx.fillStyle = theme.liquidMid;
            ctx.beginPath();
            ctx.arc(cx, cy + size * 0.2, size * 0.06, 0, Math.PI * 2);
            ctx.fill();
            // Exclamation line
            ctx.beginPath();
            ctx.moveTo(cx, cy - size * 0.15);
            ctx.lineTo(cx, cy + size * 0.08);
            ctx.stroke();
        } else {
            // X for critical
            ctx.strokeStyle = theme.liquidHigh;
            ctx.beginPath();
            ctx.moveTo(cx - size * 0.3, cy - size * 0.3);
            ctx.lineTo(cx + size * 0.3, cy + size * 0.3);
            ctx.moveTo(cx + size * 0.3, cy - size * 0.3);
            ctx.lineTo(cx - size * 0.3, cy + size * 0.3);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawBadge(ctx, x, y, count, color, fontSize) {
        if (count <= 0) return;
        var label = String(count);
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        var tw = ctx.measureText(label).width;
        var badgeW = tw + fontSize * 0.8;
        var badgeH = fontSize + 4;
        var badgeR = badgeH / 2;
        var bx = x - badgeW / 2;
        var by = y - badgeH / 2;

        // Badge background
        roundRect(ctx, bx, by, badgeW, badgeH, badgeR);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Badge text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('splunk-status-board-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._animTime = 0;
            this._timer = null;
            this._hitRects = [];
            this._boundClick = this._onClick.bind(this);
            this._boundMouseMove = this._onMouseMove.bind(this);
            this.canvas.addEventListener('click', this._boundClick);
            this.canvas.addEventListener('mousemove', this._boundMouseMove);
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
                    'Awaiting data \u2014 Splunk Status Board'
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

            function getStr(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                return row[colIdx[name]] || fallback;
            }

            var components = [];
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var compName = getStr(row, 'component', '');
                if (!compName) continue;
                components.push({
                    component: compName,
                    status: getStr(row, 'status', 'ok'),
                    errors: Math.round(getVal(row, 'errors', 0)),
                    warns: Math.round(getVal(row, 'warns', 0)),
                    health_score: clamp(getVal(row, 'health_score', 0), 0, 100)
                });
            }

            var result = { components: components };
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

            if (!data || !data.components) {
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    return;
                }
            }

            var components = data.components;
            if (!components || components.length === 0) return;

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var warningThreshold = parseInt(config[ns + 'warningThreshold'], 10) || 50;
            var criticalThreshold = parseInt(config[ns + 'criticalThreshold'], 10) || 80;
            var showCounts = (config[ns + 'showCounts'] || 'true') === 'true';
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var gridCols = parseInt(config[ns + 'columns'], 10) || 3;

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

            ctx.clearRect(0, 0, w, h);

            // ── Layout calculations ──
            var padX = Math.max(12, w * 0.03);
            var padY = Math.max(8, h * 0.02);
            var legendH = Math.max(20, h * 0.06);

            var availW = w - padX * 2;
            var availH = h - padY * 2 - legendH;

            gridCols = Math.max(1, Math.min(gridCols, components.length));
            var gridRows = Math.ceil(components.length / gridCols);

            var gapX = Math.max(8, availW * 0.025);
            var gapY = Math.max(8, availH * 0.03);
            var tileW = (availW - gapX * (gridCols - 1)) / gridCols;
            var tileH = (availH - gapY * (gridRows - 1)) / gridRows;
            tileW = Math.max(60, tileW);
            tileH = Math.max(50, tileH);
            var tileR = Math.min(10, tileW * 0.06, tileH * 0.06);

            // Center the grid
            var totalGridW = tileW * gridCols + gapX * (gridCols - 1);
            var totalGridH = tileH * gridRows + gapY * (gridRows - 1);
            var offsetX = padX + (availW - totalGridW) / 2;
            var offsetY = padY + (availH - totalGridH) / 2;

            // ── Draw tiles ──
            this._hitRects = [];
            var time = this._animTime * speed;

            for (var i = 0; i < components.length; i++) {
                var comp = components[i];
                var col = i % gridCols;
                var row = Math.floor(i / gridCols);
                var tx = offsetX + col * (tileW + gapX);
                var ty = offsetY + row * (tileH + gapY);

                // Store hit rect for drilldown
                this._hitRects.push({
                    x: tx,
                    y: ty,
                    w: tileW,
                    h: tileH,
                    component: comp.component
                });

                var fillPct = comp.health_score;
                var fillColor = getFillColor(fillPct, warningThreshold, criticalThreshold, theme);

                // Draw glass tile background
                drawGlassTube(ctx, tx, ty, tileW, tileH, tileR, theme);

                // Draw liquid fill
                drawTileLiquid(ctx, tx, ty, tileW, tileH, tileR, fillPct, fillColor, showGlow, time);

                // ── Tile content: name, icon, counts ──
                var centerX = tx + tileW / 2;
                var nameFS = Math.max(9, Math.min(14, Math.min(tileW * 0.1, tileH * 0.12)));
                var iconSize = Math.max(14, Math.min(28, tileH * 0.2));
                var countFS = Math.max(8, Math.min(12, tileH * 0.09));

                var gapH = Math.max(4, tileH * 0.04);
                var nameH = nameFS + 2;
                var iconH = iconSize;
                var hasCount = showCounts && (comp.errors > 0 || comp.warns > 0);
                var countH = hasCount ? countFS + 2 : 0;
                var totalH = nameH + gapH + iconH + (hasCount ? gapH + countH : 0);
                var curY = ty + (tileH - totalH) / 2;

                // Component name
                ctx.font = '600 ' + nameFS + 'px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(comp.component, centerX, curY);
                curY += nameH + gapH;

                // Status icon (bigger, centered)
                if (showGlow && comp.status === 'critical') {
                    ctx.shadowColor = fillColor;
                    ctx.shadowBlur = 10;
                }
                drawStatusIcon(ctx, centerX, curY + iconSize / 2, iconSize, comp.status, theme);
                ctx.shadowBlur = 0;
                curY += iconH;

                // Error/warn count (single line, e.g. "23 err · 15 warn")
                if (hasCount) {
                    curY += gapH;
                    var parts = [];
                    if (comp.errors > 0) parts.push(comp.errors + ' err');
                    if (comp.warns > 0) parts.push(comp.warns + ' warn');
                    ctx.font = countFS + 'px sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(parts.join(' \u00B7 '), centerX, curY);
                }
            }

            // ── Draw legend ──
            var legendFS = Math.max(8, Math.min(11, w * 0.018));
            var legendY = h - Math.max(6, legendH * 0.4);
            var legendItems = [
                { color: theme.liquidLow, label: 'OK (<' + warningThreshold + ')' },
                { color: theme.liquidMid, label: 'Warn (' + warningThreshold + '-' + criticalThreshold + ')' },
                { color: theme.liquidHigh, label: 'Crit (>' + criticalThreshold + ')' }
            ];
            ctx.font = legendFS + 'px sans-serif';
            ctx.textBaseline = 'middle';

            var swatchSize = legendFS;
            var legendPad = legendFS * 0.6;
            var totalLegendW = 0;
            for (var li = 0; li < legendItems.length; li++) {
                totalLegendW += swatchSize + legendPad + ctx.measureText(legendItems[li].label).width;
                if (li < legendItems.length - 1) totalLegendW += legendPad * 2;
            }
            var lx = (w - totalLegendW) / 2;

            for (var lj = 0; lj < legendItems.length; lj++) {
                ctx.fillStyle = legendItems[lj].color;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(lx, legendY - swatchSize / 2, swatchSize, swatchSize);
                ctx.globalAlpha = 1;
                lx += swatchSize + legendPad;
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.textAlign = 'left';
                ctx.fillText(legendItems[lj].label, lx, legendY);
                lx += ctx.measureText(legendItems[lj].label).width + legendPad * 2;
            }

            // ── Start animation loop ──
            this._startAnimation();
        },

        // ── Drilldown support ──

        _onClick: function(e) {
            var rect = this.canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            for (var i = 0; i < this._hitRects.length; i++) {
                var hr = this._hitRects[i];
                if (mx >= hr.x && mx <= hr.x + hr.w && my >= hr.y && my <= hr.y + hr.h) {
                    var payload = {
                        action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                        data: { 'component': hr.component }
                    };
                    this.drilldown(payload, e);
                    break;
                }
            }
        },

        _onMouseMove: function(e) {
            var rect = this.canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;
            var hovering = false;

            for (var i = 0; i < this._hitRects.length; i++) {
                var hr = this._hitRects[i];
                if (mx >= hr.x && mx <= hr.x + hr.w && my >= hr.y && my <= hr.y + hr.h) {
                    hovering = true;
                    break;
                }
            }

            this.canvas.style.cursor = hovering ? 'pointer' : 'default';
        },

        // ── Animation ──

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
            if (this.canvas) {
                this.canvas.removeEventListener('click', this._boundClick);
                this.canvas.removeEventListener('mousemove', this._boundMouseMove);
            }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
