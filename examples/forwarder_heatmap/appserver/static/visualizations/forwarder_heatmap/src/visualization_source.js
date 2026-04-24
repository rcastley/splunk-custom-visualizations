/*
 * Forwarder Heatmap — Splunk Custom Visualization
 *
 * Glass-themed heatmap grid showing forwarder health. Each cell represents
 * one forwarder with liquid fill based on staleness (minutes since last seen).
 * Fresh forwarders show green, stale show yellow, missing show red.
 *
 * Expected SPL columns: host, mins_ago, eps (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var SPEED_MAP = { slow: 0.3, medium: 0.7, fast: 1.4 };

    var CELL_SIZES = {
        small: 60,
        medium: 90,
        large: 120
    };

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

    function getFillColor(minsAgo, warnThresh, critThresh, theme) {
        if (minsAgo >= critThresh) return theme.liquidHigh;
        if (minsAgo >= warnThresh) {
            var t = (minsAgo - warnThresh) / (critThresh - warnThresh);
            return lerpColor(theme.liquidMid, theme.liquidHigh, clamp(t, 0, 1));
        }
        if (minsAgo >= warnThresh * 0.5) {
            var t2 = (minsAgo - warnThresh * 0.5) / (warnThresh * 0.5);
            return lerpColor(theme.liquidLow, theme.liquidMid, clamp(t2, 0, 1));
        }
        return theme.liquidLow;
    }

    function getFillPct(minsAgo, warnThresh, critThresh) {
        // Map staleness to fill percentage: 0 mins = 15% fill, critThresh+ = 95% fill
        if (minsAgo <= 0) return 15;
        if (minsAgo >= critThresh) return 95;
        var t = minsAgo / critThresh;
        return 15 + t * 80;
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

    function drawGlassCell(ctx, x, y, w, h, r, theme) {
        // Outer glass border
        roundRect(ctx, x, y, w, h, r);
        ctx.fillStyle = theme.tubeGlass;
        ctx.fill();
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Glass highlight (left edge reflection)
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

    function drawLiquidCell(ctx, x, y, cellW, cellH, r, fillPct, color, showGlow, time, isCritical) {
        if (fillPct <= 0) return;

        var inset = 2;
        var lx = x + inset;
        var lw = cellW - inset * 2;
        var lr = Math.max(1, r - inset);
        var maxFillH = cellH - inset * 2;
        var fillH = maxFillH * (fillPct / 100);
        var ly = y + cellH - inset - fillH;

        ctx.save();

        // Clip to cell interior
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

        // Liquid surface highlight
        ctx.beginPath();
        ctx.moveTo(lx, ly + waveY(0, time));
        for (var sx = 1; sx <= lw; sx += 2) {
            ctx.lineTo(lx + sx, ly + waveY(sx, time));
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Bubble particles inside liquid for high-fill cells
        if (fillPct > 40) {
            var bubbleCount = Math.max(1, Math.floor(fillPct / 20));
            for (var b = 0; b < bubbleCount; b++) {
                var seed = b * 137.508;
                var bx = lx + (((seed * 7.3) % lw));
                var rawBy = ly + fillH * 0.15 + ((seed * 3.7 + time * 25) % (fillH * 0.7));
                var by = Math.min(rawBy, ly + fillH - 3);
                var br = 0.8 + (seed % 1.5);
                ctx.beginPath();
                ctx.arc(bx, by, br, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fill();
            }
        }

        ctx.restore();

        // Glow effect for critical cells
        if (showGlow && isCritical) {
            var pulseAlpha = Math.sin(time * 4) * 0.3;
            var glowAlpha = clamp(0.3 + pulseAlpha, 0.1, 0.6);
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            roundRect(ctx, x, y, cellW, cellH, r);
            ctx.strokeStyle = color;
            ctx.globalAlpha = glowAlpha;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function truncateText(ctx, text, maxW) {
        if (ctx.measureText(text).width <= maxW) return text;
        var ellipsis = '...';
        var eW = ctx.measureText(ellipsis).width;
        var len = text.length;
        while (len > 0 && ctx.measureText(text.slice(0, len)).width + eW > maxW) {
            len--;
        }
        return text.slice(0, len) + ellipsis;
    }

    function sortForwarders(forwarders, sortBy) {
        var sorted = forwarders.slice();
        if (sortBy === 'name') {
            sorted.sort(function(a, b) {
                return a.host.toLowerCase().localeCompare(b.host.toLowerCase());
            });
        } else if (sortBy === 'eps') {
            sorted.sort(function(a, b) {
                return b.eps - a.eps;
            });
        } else {
            // status: critical first (highest mins_ago)
            sorted.sort(function(a, b) {
                return b.mins_ago - a.mins_ago;
            });
        }
        return sorted;
    }

    function calcGridLayout(count, containerW, containerH, cellSizeSetting, headerH, legendH) {
        var availW = containerW - 16; // 8px padding each side
        var availH = containerH - headerH - legendH - 8;
        var gap = 5;
        var cellW, cellH, cols;

        if (cellSizeSetting === 'small') {
            cellW = 60;
        } else if (cellSizeSetting === 'medium') {
            cellW = 90;
        } else if (cellSizeSetting === 'large') {
            cellW = 120;
        } else {
            // auto: calculate optimal cell size to fit everything
            // Try to fit all cells within the available area
            var bestCellW = 90;
            for (var testW = 140; testW >= 50; testW -= 5) {
                var testCols = Math.floor((availW + gap) / (testW + gap));
                if (testCols < 1) testCols = 1;
                var testRows = Math.ceil(count / testCols);
                var testH = testW * 0.85;
                var totalH = testRows * (testH + gap) - gap;
                if (totalH <= availH && testCols > 0) {
                    bestCellW = testW;
                    break;
                }
            }
            cellW = Math.max(50, bestCellW);
        }

        // Cap columns to actual count so few forwarders expand to fill width
        cols = Math.max(1, Math.floor((availW + gap) / (cellW + gap)));
        if (cols > count) cols = Math.max(1, count);

        // When few forwarders, expand cells to use available width
        if (count <= cols) {
            cellW = Math.min(300, Math.floor((availW - (cols - 1) * gap) / cols));
        }

        cellH = Math.min(Math.round(cellW * 0.85), 120);
        var rows = Math.ceil(count / cols);

        // Center the grid horizontally
        var gridW = cols * cellW + (cols - 1) * gap;
        var offsetX = Math.max(8, (containerW - gridW) / 2);

        return {
            cellW: cellW,
            cellH: cellH,
            cols: cols,
            rows: rows,
            gap: gap,
            offsetX: offsetX,
            startY: headerH
        };
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('forwarder-heatmap-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._animTime = 0;
            this._timer = null;
            this._drillGrid = null;
            this._drillForwarders = null;
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
                    'Awaiting data \u2014 Forwarder Heatmap'
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

            var forwarders = [];
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var host = getStr(row, 'host', '');
                if (!host) continue;
                forwarders.push({
                    host: host,
                    mins_ago: getVal(row, 'mins_ago', 0),
                    eps: getVal(row, 'eps', 0)
                });
            }

            var result = { forwarders: forwarders };
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

            if (!data.forwarders || data.forwarders.length === 0) return;

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var warningThreshold = parseFloat(config[ns + 'warningThreshold']) || 5;
            var criticalThreshold = parseFloat(config[ns + 'criticalThreshold']) || 15;
            var showEps = (config[ns + 'showEps'] || 'true') === 'true';
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var cellSizeSetting = config[ns + 'cellSize'] || 'auto';
            var sortBy = config[ns + 'sortBy'] || 'status';

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

            // ── Sort forwarders ──
            var forwarders = sortForwarders(data.forwarders, sortBy);
            var count = forwarders.length;

            // ── Layout calculations ──
            var headerH = 4;
            var legendH = 28;

            var grid = calcGridLayout(count, w, h, cellSizeSetting, headerH, legendH);
            var cellW = grid.cellW;
            var cellH = grid.cellH;
            var cols = grid.cols;
            var gap = grid.gap;
            var offsetX = grid.offsetX;
            var startY = grid.startY;
            var cellR = Math.min(6, cellW * 0.08);

            // ── Draw cells ──
            var hostFS = Math.max(7, Math.min(11, cellW * 0.13));
            var valFS = Math.max(8, Math.min(16, cellW * 0.18));
            var epsFS = Math.max(6, Math.min(9, cellW * 0.1));
            var time = this._animTime * speed;

            for (var i = 0; i < count; i++) {
                var fwd = forwarders[i];
                var col = i % cols;
                var row = Math.floor(i / cols);
                var cx = offsetX + col * (cellW + gap);
                var cy = startY + row * (cellH + gap);

                // Skip cells outside visible area
                if (cy + cellH < 0 || cy > h) continue;

                var minsAgo = fwd.mins_ago;
                var fillPct = getFillPct(minsAgo, warningThreshold, criticalThreshold);
                var fillColor = getFillColor(minsAgo, warningThreshold, criticalThreshold, theme);
                var isCritical = minsAgo >= criticalThreshold;

                // Draw glass cell
                drawGlassCell(ctx, cx, cy, cellW, cellH, cellR, theme);

                // Draw liquid fill
                drawLiquidCell(ctx, cx, cy, cellW, cellH, cellR, fillPct, fillColor, showGlow, time, isCritical);

                // Draw hostname label (top of cell)
                ctx.save();
                ctx.font = hostFS + 'px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                var displayHost = truncateText(ctx, fwd.host, cellW - 8);
                ctx.fillText(displayHost, cx + cellW / 2, cy + 4);
                ctx.restore();

                // Draw mins_ago value (center of cell, in pill)
                ctx.save();
                ctx.font = 'bold ' + valFS + 'px monospace';
                var valStr = minsAgo < 100 ? minsAgo.toFixed(1) + 'm' : Math.round(minsAgo) + 'm';
                var valTextW = ctx.measureText(valStr).width + 10;
                var valPillH = valFS + 4;
                var valPillX = cx + cellW / 2 - valTextW / 2;
                var valPillY = cy + cellH / 2 - valPillH / 2;

                roundRect(ctx, valPillX, valPillY, valTextW, valPillH, 3);
                ctx.fillStyle = theme.valueBg;
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                if (showGlow && isCritical) {
                    ctx.shadowColor = fillColor;
                    ctx.shadowBlur = 8;
                }
                ctx.fillText(valStr, cx + cellW / 2, cy + cellH / 2);
                ctx.shadowBlur = 0;
                ctx.restore();

                // Draw EPS (bottom of cell)
                if (showEps && fwd.eps > 0) {
                    ctx.save();
                    ctx.font = epsFS + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    var epsStr = fwd.eps >= 1000 ? (fwd.eps / 1000).toFixed(1) + 'k' : fwd.eps.toFixed(0);
                    ctx.fillText(epsStr + ' eps', cx + cellW / 2, cy + cellH - 3);
                    ctx.restore();
                }
            }

            // ── Draw legend ──
            var legendFS2 = Math.max(7, Math.min(10, w * 0.016));
            var legendY = h - 10;
            var legendItems = [
                { color: theme.liquidLow, label: 'OK (<' + warningThreshold + 'm)' },
                { color: theme.liquidMid, label: 'Warning (' + warningThreshold + '-' + criticalThreshold + 'm)' },
                { color: theme.liquidHigh, label: 'Critical (>' + criticalThreshold + 'm)' }
            ];
            ctx.font = legendFS2 + 'px sans-serif';
            ctx.textBaseline = 'middle';

            var swatchSize = legendFS2;
            var legendPad = legendFS2 * 0.5;
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

            // Cache layout state for drilldown
            this._drillGrid = grid;
            this._drillForwarders = forwarders;

            // ── Start animation loop ──
            this._startAnimation();
        },

        drilldown: function(event) {
            // Fire drilldown when a cell is clicked
            if (!this._drillGrid || !this._drillForwarders) return;

            var mouseX = event.originalEvent ? event.originalEvent.offsetX : event.offsetX;
            var mouseY = event.originalEvent ? event.originalEvent.offsetY : event.offsetY;

            var grid = this._drillGrid;
            var forwarders = this._drillForwarders;

            for (var i = 0; i < forwarders.length; i++) {
                var col = i % grid.cols;
                var row = Math.floor(i / grid.cols);
                var cx = grid.offsetX + col * (grid.cellW + grid.gap);
                var cy = grid.startY + row * (grid.cellH + grid.gap);

                if (mouseX >= cx && mouseX <= cx + grid.cellW &&
                    mouseY >= cy && mouseY <= cy + grid.cellH) {
                    var payload = {
                        action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                        data: { 'host': forwarders[i].host }
                    };
                    this.drilldownRedirect(payload);
                    return;
                }
            }
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
