/*
 * Match Heatmap Grid — Splunk Custom Visualization
 *
 * Grid visualization showing World Cup matches with cells colored by
 * betting volume intensity. Rows = matches, columns = time slots,
 * cells colored by a three-stop gradient (cool blue to hot red).
 * Designed for NOC wall displays with a dark background.
 *
 * Expected SPL columns: match (required), time_slot (required), volume (required), peak (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function lerpColor(a, b, t) {
        var ar = parseInt(a.slice(1, 3), 16);
        var ag = parseInt(a.slice(3, 5), 16);
        var ab = parseInt(a.slice(5, 7), 16);
        var br = parseInt(b.slice(1, 3), 16);
        var bg = parseInt(b.slice(3, 5), 16);
        var bb = parseInt(b.slice(5, 7), 16);
        var r = Math.round(ar + (br - ar) * t);
        var g = Math.round(ag + (bg - ag) * t);
        var bl = Math.round(ab + (bb - ab) * t);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
    }

    function threeStopColor(t, low, mid, high) {
        t = clamp(t, 0, 1);
        if (t <= 0.5) return lerpColor(low, mid, t * 2);
        return lerpColor(mid, high, (t - 0.5) * 2);
    }

    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function formatNumber(n) {
        var s = Math.round(n).toString();
        var result = '';
        for (var i = s.length - 1, c = 0; i >= 0; i--, c++) {
            if (c > 0 && c % 3 === 0) result = ',' + result;
            result = s[i] + result;
        }
        return result;
    }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        if (r < 0) r = 0;
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

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('match-heatmap-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

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
                    'Awaiting data \u2014 Match Heatmap Grid'
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

            // Build 2D structure: unique matches x unique time_slots
            var matches = [];
            var matchIndex = {};
            var timeSlots = [];
            var timeSlotIndex = {};
            var grid = {};  // grid[matchName][timeSlot] = { volume, peak }

            var matchCol = colIdx.match;
            var slotCol = colIdx.time_slot;
            var volCol = colIdx.volume;
            var peakCol = colIdx.peak;

            if (matchCol === undefined || slotCol === undefined || volCol === undefined) {
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: match, time_slot, volume'
                );
            }

            var rows = data.rows;
            for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var matchName = row[matchCol] || '';
                var slotName = row[slotCol] || '';
                var vol = parseFloat(row[volCol]);
                if (isNaN(vol)) vol = 0;
                var isPeak = (peakCol !== undefined) ? (row[peakCol] === 'true') : false;

                if (matchName === '' || slotName === '') continue;

                // Track unique matches in order
                if (matchIndex[matchName] === undefined) {
                    matchIndex[matchName] = matches.length;
                    matches.push(matchName);
                }

                // Track unique time slots in order
                if (timeSlotIndex[slotName] === undefined) {
                    timeSlotIndex[slotName] = timeSlots.length;
                    timeSlots.push(slotName);
                }

                // Store in grid
                if (!grid[matchName]) grid[matchName] = {};
                grid[matchName][slotName] = { volume: vol, peak: isPeak };
            }

            // Find min and max volume for normalization
            var minVol = Infinity;
            var maxVol = -Infinity;
            for (var mi = 0; mi < matches.length; mi++) {
                var mName = matches[mi];
                for (var si = 0; si < timeSlots.length; si++) {
                    var sName = timeSlots[si];
                    if (grid[mName] && grid[mName][sName]) {
                        var v = grid[mName][sName].volume;
                        if (v < minVol) minVol = v;
                        if (v > maxVol) maxVol = v;
                    }
                }
            }
            if (minVol === Infinity) minVol = 0;
            if (maxVol === -Infinity) maxVol = 0;

            var result = {
                matches: matches,
                timeSlots: timeSlots,
                grid: grid,
                minVol: minVol,
                maxVol: maxVol
            };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Custom no-data message
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            if (!data.matches || data.matches.length === 0) return;

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorLow = config[ns + 'colorLow'] || '#0a1628';
            var colorMid = config[ns + 'colorMid'] || '#1a6baa';
            var colorHigh = config[ns + 'colorHigh'] || '#ff3333';
            var showValues = (config[ns + 'showValues'] || 'false') === 'true';
            var cellRadius = parseInt(config[ns + 'cellRadius'], 10);
            if (isNaN(cellRadius)) cellRadius = 4;
            var cellGap = parseInt(config[ns + 'cellGap'], 10);
            if (isNaN(cellGap)) cellGap = 3;
            var labelWidth = parseInt(config[ns + 'labelWidth'], 10);
            if (isNaN(labelWidth)) labelWidth = 120;

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

            // ── Dark background for NOC readability ──
            ctx.fillStyle = '#0b0e14';
            roundRect(ctx, 0, 0, w, h, 0);
            ctx.fill();

            // ── Layout calculations ──
            var matches = data.matches;
            var timeSlots = data.timeSlots;
            var grid = data.grid;
            var minVol = data.minVol;
            var maxVol = data.maxVol;
            var volRange = maxVol - minVol;
            if (volRange <= 0) volRange = 1;

            var numRows = matches.length;
            var numCols = timeSlots.length;

            // Title area
            var titleHeight = 36;
            var headerHeight = 28;
            var topPad = titleHeight + headerHeight + 8;
            var bottomPad = 16;
            var leftPad = 12;
            var rightPad = 12;

            // Available space for grid
            var gridLeft = leftPad + labelWidth;
            var gridTop = topPad;
            var gridWidth = w - gridLeft - rightPad;
            var gridHeight = h - gridTop - bottomPad;

            // Cell size (auto-scale)
            var cellW = (gridWidth - cellGap * (numCols - 1)) / numCols;
            var cellH = (gridHeight - cellGap * (numRows - 1)) / numRows;
            if (cellW < 4) cellW = 4;
            if (cellH < 4) cellH = 4;

            // ── Draw title ──
            var titleFontSize = Math.max(11, Math.min(20, w * 0.024));
            ctx.font = 'bold ' + titleFontSize + 'px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText('MATCH BETTING HEATMAP', leftPad, titleHeight / 2);

            // Subtitle with stats
            var subtitleFontSize = Math.max(8, titleFontSize * 0.6);
            ctx.font = '500 ' + subtitleFontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillText(
                numRows + ' matches \u00B7 ' + numCols + ' time slots \u00B7 range ' +
                formatNumber(minVol) + ' \u2013 ' + formatNumber(maxVol),
                leftPad, titleHeight / 2 + titleFontSize * 0.8
            );

            // ── Draw column headers ──
            var headerFontSize = Math.max(8, Math.min(13, cellW * 0.35));
            ctx.font = '600 ' + headerFontSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = 'rgba(255,255,255,0.45)';

            for (var ci = 0; ci < numCols; ci++) {
                var colX = gridLeft + ci * (cellW + cellGap) + cellW / 2;
                var colY = gridTop - 4;
                ctx.fillText(timeSlots[ci], colX, colY);
            }

            // ── Draw row labels ──
            var rowFontSize = Math.max(8, Math.min(14, cellH * 0.45));
            ctx.font = 'bold ' + rowFontSize + 'px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';

            for (var ri = 0; ri < numRows; ri++) {
                var rowY = gridTop + ri * (cellH + cellGap) + cellH / 2;
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.fillText(matches[ri], gridLeft - 8, rowY);
            }

            // ── Find the cell with the highest volume (for highlight) ──
            var maxCellVol = -1;
            var maxCellRow = -1;
            var maxCellCol = -1;
            for (var mri = 0; mri < numRows; mri++) {
                var mMatch = matches[mri];
                for (var mci = 0; mci < numCols; mci++) {
                    var mSlot = timeSlots[mci];
                    if (grid[mMatch] && grid[mMatch][mSlot]) {
                        var mVol = grid[mMatch][mSlot].volume;
                        if (mVol > maxCellVol) {
                            maxCellVol = mVol;
                            maxCellRow = mri;
                            maxCellCol = mci;
                        }
                    }
                }
            }

            // ── Draw grid cells ──
            var valFontSize = Math.max(6, Math.min(11, Math.min(cellW * 0.25, cellH * 0.3)));

            for (var row = 0; row < numRows; row++) {
                var matchName = matches[row];
                for (var col = 0; col < numCols; col++) {
                    var slotName = timeSlots[col];
                    var cellX = gridLeft + col * (cellW + cellGap);
                    var cellY = gridTop + row * (cellH + cellGap);

                    var volume = 0;
                    var isPeak = false;
                    if (grid[matchName] && grid[matchName][slotName]) {
                        volume = grid[matchName][slotName].volume;
                        isPeak = grid[matchName][slotName].peak;
                    }

                    // Normalize volume to 0-1
                    var t = (volume - minVol) / volRange;
                    t = clamp(t, 0, 1);

                    // Get cell color
                    var cellColor = threeStopColor(t, colorLow, colorMid, colorHigh);

                    // Check if this is the hottest cell
                    var isHottest = (row === maxCellRow && col === maxCellCol);

                    // Draw cell background
                    if (isHottest) {
                        ctx.shadowColor = cellColor;
                        ctx.shadowBlur = 12;
                    }

                    ctx.fillStyle = cellColor;
                    roundRect(ctx, cellX, cellY, cellW, cellH, cellRadius);
                    ctx.fill();

                    // Reset shadow
                    if (isHottest) {
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                    }

                    // Draw bright border on hottest cell
                    if (isHottest) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                        ctx.lineWidth = 1.5;
                        roundRect(ctx, cellX, cellY, cellW, cellH, cellRadius);
                        ctx.stroke();
                    }

                    // Draw peak indicator (small dot in top-right corner)
                    if (isPeak) {
                        var dotR = Math.max(2, Math.min(4, cellW * 0.06));
                        ctx.beginPath();
                        ctx.arc(cellX + cellW - dotR - 3, cellY + dotR + 3, dotR, 0, Math.PI * 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.globalAlpha = 0.8;
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    }

                    // Draw value text
                    if (showValues && volume > 0) {
                        ctx.font = '600 ' + valFontSize + 'px monospace';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        // Use white text on dark cells, dark text on bright cells
                        var brightness = t;
                        if (brightness > 0.6) {
                            ctx.fillStyle = 'rgba(255,255,255,0.9)';
                        } else {
                            ctx.fillStyle = 'rgba(255,255,255,0.6)';
                        }
                        ctx.fillText(formatNumber(volume), cellX + cellW / 2, cellY + cellH / 2);
                    }
                }
            }

            // ── Draw color legend at bottom-right ──
            var legendW = Math.min(120, w * 0.15);
            var legendH = 8;
            var legendX = w - rightPad - legendW;
            var legendY = h - bottomPad + 2;
            var legendGrad = ctx.createLinearGradient(legendX, 0, legendX + legendW, 0);
            legendGrad.addColorStop(0, colorLow);
            legendGrad.addColorStop(0.5, colorMid);
            legendGrad.addColorStop(1, colorHigh);

            roundRect(ctx, legendX, legendY, legendW, legendH, legendH / 2);
            ctx.fillStyle = legendGrad;
            ctx.fill();

            // Legend labels
            var legendFontSize = Math.max(7, Math.min(10, w * 0.012));
            ctx.font = '500 ' + legendFontSize + 'px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';

            ctx.textAlign = 'left';
            ctx.fillText(formatNumber(minVol), legendX, legendY + legendH + 3);
            ctx.textAlign = 'right';
            ctx.fillText(formatNumber(maxVol), legendX + legendW, legendY + legendH + 3);

            // Reset text alignment
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
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

            // Football emoji
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u26BD', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text
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
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
