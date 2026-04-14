/*
 * Index Storage — Splunk Custom Visualization
 *
 * Glass-skeuomorphic tank grid showing index sizes with layered
 * hot/warm/cold data temperature fills. Fill height is relative
 * to the largest index.
 *
 * Expected SPL columns: title, sizeGB, hotGB (opt), warmGB (opt), coldGB (opt)
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

    var TEMP_COLORS = {
        default: { hot: '#ff3355', warm: '#ffcc00', cold: '#4dabf7' },
        dark:    { hot: '#e17055', warm: '#fdcb6e', cold: '#339af0' },
        neon:    { hot: '#ff0066', warm: '#ffff00', cold: '#00ff88' }
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

    function drawLayeredLiquid(ctx, x, y, cellW, cellH, r, idx, maxSize, tempColors, showGlow, time, totalStorageSize) {
        if (idx.sizeGB <= 0) return;

        var inset = 2;
        var lx = x + inset;
        var lw = cellW - inset * 2;
        var lr = Math.max(1, r - inset);
        var maxFillH = cellH - inset * 2;

        // Fill height = percentage of index capacity (maxGB)
        var capacity = idx.maxGB > 0 ? idx.maxGB : maxSize;
        var fillRatio = clamp(idx.sizeGB / capacity, 0, 1);
        var totalFillH = maxFillH * fillRatio;
        if (totalFillH < 2) totalFillH = 2;

        // Calculate layer heights
        var coldH = 0;
        var warmH = 0;
        var hotH = 0;
        var hasLayers = (idx.hotGB > 0 || idx.warmGB > 0 || idx.coldGB > 0);

        if (hasLayers) {
            var layerTotal = idx.hotGB + idx.warmGB + idx.coldGB;
            if (layerTotal > 0) {
                coldH = totalFillH * (idx.coldGB / layerTotal);
                warmH = totalFillH * (idx.warmGB / layerTotal);
                hotH = totalFillH * (idx.hotGB / layerTotal);
            } else {
                // All layers are zero but sizeGB > 0 — single fill
                coldH = totalFillH;
            }
        } else {
            // No layer data — single fill using cold color
            coldH = totalFillH;
        }

        ctx.save();

        // Clip to cell interior
        roundRect(ctx, x + inset, y + inset, lw, maxFillH, lr);
        ctx.clip();

        // Draw layers from bottom: cold, warm, hot
        var baseY = y + cellH - inset;

        // ── Cold layer (bottom) ──
        if (coldH > 0.5) {
            var coldTop = baseY - coldH;
            var coldGrad = ctx.createLinearGradient(lx, coldTop, lx, baseY);
            coldGrad.addColorStop(0, tempColors.cold);
            coldGrad.addColorStop(0.4, tempColors.cold);
            coldGrad.addColorStop(1, lerpColor(tempColors.cold, '#000000', 0.35));
            ctx.fillStyle = coldGrad;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(lx, coldTop, lw, coldH);
            ctx.globalAlpha = 1;
        }

        // ── Warm layer (middle) ──
        if (warmH > 0.5) {
            var warmTop = baseY - coldH - warmH;
            var warmGrad = ctx.createLinearGradient(lx, warmTop, lx, warmTop + warmH);
            warmGrad.addColorStop(0, tempColors.warm);
            warmGrad.addColorStop(0.4, tempColors.warm);
            warmGrad.addColorStop(1, lerpColor(tempColors.warm, '#000000', 0.35));
            ctx.fillStyle = warmGrad;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(lx, warmTop, lw, warmH);
            ctx.globalAlpha = 1;
        }

        // ── Hot layer (top) ──
        if (hotH > 0.5) {
            var hotTop = baseY - coldH - warmH - hotH;
            var hotGrad = ctx.createLinearGradient(lx, hotTop, lx, hotTop + hotH);
            hotGrad.addColorStop(0, tempColors.hot);
            hotGrad.addColorStop(0.4, tempColors.hot);
            hotGrad.addColorStop(1, lerpColor(tempColors.hot, '#000000', 0.35));
            ctx.fillStyle = hotGrad;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(lx, hotTop, lw, hotH);
            ctx.globalAlpha = 1;
        }

        // ── Wave surface on topmost liquid layer ──
        var topLayerH, topLayerY, topColor;
        if (hotH > 0.5) {
            topLayerH = hotH;
            topLayerY = baseY - coldH - warmH - hotH;
            topColor = tempColors.hot;
        } else if (warmH > 0.5) {
            topLayerH = warmH;
            topLayerY = baseY - coldH - warmH;
            topColor = tempColors.warm;
        } else {
            topLayerH = coldH;
            topLayerY = baseY - coldH;
            topColor = tempColors.cold;
        }

        if (totalFillH > 2) {
            var waveAmp = Math.min(4, topLayerH * 0.12);
            var wavePeriod1 = lw * 0.35;
            var wavePeriod2 = lw * 0.55;

            function waveY(wx, t) {
                return Math.sin((wx / wavePeriod1) * Math.PI * 2 + t * 3.5) * waveAmp
                     + Math.sin((wx / wavePeriod2) * Math.PI * 2 - t * 2.2) * waveAmp * 0.4;
            }

            // Wave overlay
            ctx.beginPath();
            ctx.moveTo(lx, topLayerY + waveY(0, time));
            for (var wx = 1; wx <= lw; wx += 2) {
                ctx.lineTo(lx + wx, topLayerY + waveY(wx, time));
            }
            ctx.lineTo(lx + lw, topLayerY + topLayerH + 5);
            ctx.lineTo(lx, topLayerY + topLayerH + 5);
            ctx.closePath();
            ctx.fillStyle = topColor;
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1;

            // Surface highlight line
            ctx.beginPath();
            ctx.moveTo(lx, topLayerY + waveY(0, time));
            for (var sx = 1; sx <= lw; sx += 2) {
                ctx.lineTo(lx + sx, topLayerY + waveY(sx, time));
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // ── Bubble particles ──
        var bubbleCount = Math.max(1, Math.floor(fillRatio * 5));
        for (var b = 0; b < bubbleCount; b++) {
            var seed = b * 137.508;
            var bx = lx + (((seed * 7.3) % lw));
            var liquidTop = baseY - totalFillH;
            var rawBy = liquidTop + totalFillH * 0.15 + ((seed * 3.7 + time * 25) % (totalFillH * 0.7));
            var by = Math.min(rawBy, baseY - 3);
            var br = 0.8 + (seed % 1.5);
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();
        }

        ctx.restore();

        // ── Glow effect when capacity usage exceeds 70% ──
        if (showGlow && fillRatio > 0.7) {
            var glowIntensity = (fillRatio - 0.7) / 0.3;
            var glowColor = fillRatio > 0.9 ? tempColors.hot : fillRatio > 0.8 ? tempColors.warm : topColor;
            var pulseAlpha = Math.sin(time * 4) * 0.15;
            var glowAlpha = clamp(0.2 * glowIntensity + pulseAlpha, 0.1, 0.5);
            var glowBlur = Math.max(6, 14 * glowIntensity);
            ctx.save();
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = glowBlur;
            roundRect(ctx, x, y, cellW, cellH, r);
            ctx.strokeStyle = glowColor;
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

    function formatSize(gb) {
        if (gb >= 1000) return (gb / 1000).toFixed(1) + ' TB';
        if (gb >= 1) return gb.toFixed(1) + ' GB';
        return (gb * 1024).toFixed(0) + ' MB';
    }

    function sortIndexes(indexes, sortBy) {
        var sorted = indexes.slice();
        if (sortBy === 'name') {
            sorted.sort(function(a, b) {
                return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
            });
        } else {
            // size: largest first
            sorted.sort(function(a, b) {
                return b.sizeGB - a.sizeGB;
            });
        }
        return sorted;
    }

    function calcGridLayout(count, containerW, containerH, cellSizeSetting, headerH, legendH) {
        var availW = containerW - 16;
        var availH = containerH - headerH - legendH - 8;
        var gap = 5;
        var cellW;

        if (cellSizeSetting === 'small') {
            cellW = 60;
        } else if (cellSizeSetting === 'medium') {
            cellW = 90;
        } else if (cellSizeSetting === 'large') {
            cellW = 120;
        } else {
            // auto: calculate optimal cell size to fit everything
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

        // Cap columns to actual count so few indexes expand to fill width
        var cols = Math.max(1, Math.floor((availW + gap) / (cellW + gap)));
        if (cols > count) cols = Math.max(1, count);

        // When few indexes, expand cells to use available width
        if (count <= cols) {
            cellW = Math.min(300, Math.floor((availW - (cols - 1) * gap) / cols));
        }

        var cellH = Math.min(Math.round(cellW * 0.85), 120);
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
            this.el.classList.add('index-storage-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._animTime = 0;
            this._timer = null;
            this._drillGrid = null;
            this._drillIndexes = null;

            // Cursor change on hover
            var self = this;
            this.canvas.addEventListener('mousemove', function(e) {
                if (!self._drillGrid || !self._drillIndexes) return;
                var mouseX = e.offsetX;
                var mouseY = e.offsetY;
                var grid = self._drillGrid;
                var indexes = self._drillIndexes;
                var hovering = false;

                for (var i = 0; i < indexes.length; i++) {
                    var col = i % grid.cols;
                    var row = Math.floor(i / grid.cols);
                    var cx = grid.offsetX + col * (grid.cellW + grid.gap);
                    var cy = grid.startY + row * (grid.cellH + grid.gap);

                    if (mouseX >= cx && mouseX <= cx + grid.cellW &&
                        mouseY >= cy && mouseY <= cy + grid.cellH) {
                        hovering = true;
                        break;
                    }
                }
                self.canvas.style.cursor = hovering ? 'pointer' : 'default';
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
                    'Awaiting data \u2014 Index Storage'
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

            var indexes = [];
            var maxSize = 0;
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var title = getStr(row, 'title', '');
                if (!title) continue;
                var sizeGB = getVal(row, 'sizeGB', 0);
                var maxGB = getVal(row, 'maxGB', 0);
                var hotGB = getVal(row, 'hotGB', 0);
                var warmGB = getVal(row, 'warmGB', 0);
                var coldGB = getVal(row, 'coldGB', 0);

                indexes.push({
                    title: title,
                    sizeGB: sizeGB,
                    maxGB: maxGB,
                    hotGB: hotGB,
                    warmGB: warmGB,
                    coldGB: coldGB
                });

                if (sizeGB > maxSize) maxSize = sizeGB;
            }

            var result = { indexes: indexes, maxSize: maxSize };
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

            if (!data.indexes || data.indexes.length === 0) return;

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var cellSizeSetting = config[ns + 'cellSize'] || 'auto';
            var sortBy = config[ns + 'sortBy'] || 'size';

            var theme = THEMES[colorTheme] || THEMES['default'];
            var tempColors = TEMP_COLORS[colorTheme] || TEMP_COLORS['default'];
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

            // ── Sort indexes ──
            var indexes = sortIndexes(data.indexes, sortBy);
            var count = indexes.length;
            var maxSize = data.maxSize;

            // Calculate total storage for glow threshold
            var totalStorageSize = 0;
            for (var ti = 0; ti < indexes.length; ti++) {
                totalStorageSize += indexes[ti].sizeGB;
            }

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
            var nameFS = Math.max(7, Math.min(11, cellW * 0.13));
            var valFS = Math.max(8, Math.min(16, cellW * 0.18));
            var time = this._animTime * speed;

            for (var i = 0; i < count; i++) {
                var idx = indexes[i];
                var col = i % cols;
                var row = Math.floor(i / cols);
                var cx = offsetX + col * (cellW + gap);
                var cy = startY + row * (cellH + gap);

                // Skip cells outside visible area
                if (cy + cellH < 0 || cy > h) continue;

                // Draw glass cell
                drawGlassCell(ctx, cx, cy, cellW, cellH, cellR, theme);

                // Draw layered liquid fill
                drawLayeredLiquid(ctx, cx, cy, cellW, cellH, cellR, idx, maxSize, tempColors, showGlow, time, totalStorageSize);

                // Draw index name label (top of cell)
                ctx.save();
                ctx.font = '600 ' + nameFS + 'px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                var displayName = truncateText(ctx, idx.title, cellW - 8);
                ctx.fillText(displayName, cx + cellW / 2, cy + 4);
                ctx.restore();

                // Draw capacity % and size (center of cell)
                ctx.save();
                var cap = idx.maxGB > 0 ? idx.maxGB : maxSize;
                var capPct = cap > 0 ? Math.round((idx.sizeGB / cap) * 100) : 0;
                var capColor = getFillColor(capPct, 70, 90, theme);

                // Capacity percentage
                ctx.font = 'bold ' + valFS + 'px monospace';
                var pctStr = capPct + '%';
                ctx.fillStyle = capColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pctStr, cx + cellW / 2, cy + cellH / 2 - valFS * 0.4);

                // Size below percentage
                var sizeFS = Math.max(6, valFS * 0.7);
                ctx.font = sizeFS + 'px sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(formatSize(idx.sizeGB) + ' / ' + formatSize(cap), cx + cellW / 2, cy + cellH / 2 + valFS * 0.5);
                ctx.restore();
            }

            // ── Draw legend ──
            var legendFS = Math.max(7, Math.min(10, w * 0.016));
            var legendY = h - 10;
            var legendItems = [
                { color: tempColors.hot, label: 'Hot' },
                { color: tempColors.warm, label: 'Warm' },
                { color: tempColors.cold, label: 'Cold' }
            ];
            ctx.font = legendFS + 'px sans-serif';
            ctx.textBaseline = 'middle';

            var swatchSize = legendFS;
            var legendPad = legendFS * 0.5;
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
            this._drillIndexes = indexes;

            // ── Start animation loop ──
            this._startAnimation();
        },

        drilldown: function(event) {
            if (!this._drillGrid || !this._drillIndexes) return;

            var mouseX = event.originalEvent ? event.originalEvent.offsetX : event.offsetX;
            var mouseY = event.originalEvent ? event.originalEvent.offsetY : event.offsetY;

            var grid = this._drillGrid;
            var indexes = this._drillIndexes;

            for (var i = 0; i < indexes.length; i++) {
                var col = i % grid.cols;
                var row = Math.floor(i / grid.cols);
                var cx = grid.offsetX + col * (grid.cellW + grid.gap);
                var cy = grid.startY + row * (grid.cellH + grid.gap);

                if (mouseX >= cx && mouseX <= cx + grid.cellW &&
                    mouseY >= cy && mouseY <= cy + grid.cellH) {
                    var payload = {
                        action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                        data: { 'title': indexes[i].title }
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
            this._stopAnimation();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
