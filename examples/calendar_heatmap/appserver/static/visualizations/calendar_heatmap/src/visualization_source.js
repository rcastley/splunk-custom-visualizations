/*
 * Calendar Heatmap — Splunk Custom Visualization
 *
 * GitHub-style daily activity heatmap. 53 weeks across (columns) by
 * 7 weekdays down (rows). Each cell is a rounded square coloured by
 * activity count using a 5-step scale from lowColor to highColor.
 *
 * Expected SPL columns: _time (epoch day bucket), count (numeric)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helpers (pure, no `this`) ───────────────────────────────

    var MS_PER_DAY = 86400000;
    var WEEKS = 53;

    function clamp(v, mn, mx) {
        return Math.max(mn, Math.min(mx, v));
    }

    function parseHex(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }

    function lerpColor(a, b, t) {
        var ac = parseHex(a);
        var bc = parseHex(b);
        var r = Math.round(ac.r + (bc.r - ac.r) * t);
        var g = Math.round(ac.g + (bc.g - ac.g) * t);
        var bl = Math.round(ac.b + (bc.b - ac.b) * t);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
    }

    // 5-step scale: level 0 (empty) → lowColor, level 4 → highColor
    function bucketLevel(count, maxCount) {
        if (count <= 0 || maxCount <= 0) return 0;
        var t = count / maxCount;
        if (t > 0.75) return 4;
        if (t > 0.5) return 3;
        if (t > 0.25) return 2;
        return 1;
    }

    function colorForLevel(level, low, high) {
        return lerpColor(low, high, level / 4);
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

    // UTC-based day-of-week, returns 0 (Mon) … 6 (Sun)
    function weekdayMon0(dayIdx) {
        return (new Date(dayIdx * MS_PER_DAY).getUTCDay() + 6) % 7;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('calendar-heatmap-viz');

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
                    'Awaiting data — Calendar Heatmap'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Status sentinel from appendpipe fallback
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            if (colIdx._time === undefined || colIdx.count === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: _time, count'
                );
            }

            var dayMap = {};
            var maxCount = 0;
            var maxDayIdx = -Infinity;

            var rows = data.rows;
            for (var r = 0; r < rows.length; r++) {
                var t = parseFloat(rows[r][colIdx._time]);
                var c = parseFloat(rows[r][colIdx.count]);
                if (isNaN(t) || isNaN(c)) continue;
                var dIdx = Math.floor(t / 86400);
                if (dayMap[dIdx] === undefined) dayMap[dIdx] = 0;
                dayMap[dIdx] += c;
                if (dayMap[dIdx] > maxCount) maxCount = dayMap[dIdx];
                if (dIdx > maxDayIdx) maxDayIdx = dIdx;
            }

            if (maxDayIdx === -Infinity) {
                maxDayIdx = Math.floor(Date.now() / MS_PER_DAY);
            }

            var result = {
                dayMap: dayMap,
                maxCount: maxCount,
                anchorDayIdx: maxDayIdx
            };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Settings (defaults MUST match formatter.html, rule 19) ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var lowColor = config[ns + 'lowColor'] || '#ebedf0';
            var highColor = config[ns + 'highColor'] || '#216e39';
            var cellSize = parseInt(config[ns + 'cellSize'], 10);
            if (isNaN(cellSize) || cellSize < 2) cellSize = 12;
            var cellGap = parseInt(config[ns + 'cellGap'], 10);
            if (isNaN(cellGap) || cellGap < 0) cellGap = 2;
            var showMonthLabels = (config[ns + 'showMonthLabels'] || 'yes') === 'yes';

            // ── Canvas sizing (HiDPI) ──
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

            // ── Layout ──
            var weekdayLabelWidth = 28;
            var monthLabelHeight = showMonthLabels ? 16 : 0;
            var padding = 6;

            var availW = w - weekdayLabelWidth - padding * 2;
            var availH = h - monthLabelHeight - padding * 2;
            if (availW <= 0 || availH <= 0) return;

            // Auto-shrink cellSize if it doesn't fit
            var maxByW = (availW - (WEEKS - 1) * cellGap) / WEEKS;
            var maxByH = (availH - 6 * cellGap) / 7;
            var effSize = Math.min(cellSize, maxByW, maxByH);
            if (effSize < 2) effSize = 2;

            var gridW = WEEKS * (effSize + cellGap) - cellGap;
            var gridH = 7 * (effSize + cellGap) - cellGap;

            var gridLeft = padding + weekdayLabelWidth + Math.max(0, (availW - gridW) / 2);
            var gridTop = padding + monthLabelHeight + Math.max(0, (availH - gridH) / 2);

            // ── Anchor week math ──
            // Column 52 is the anchor week (rightmost). Cells in that column
            // beyond the anchor weekday are left blank (future days).
            var anchor = data.anchorDayIdx;
            var anchorWeekday = weekdayMon0(anchor);
            var anchorMondayDayIdx = anchor - anchorWeekday;

            var dayMap = data.dayMap || {};
            var maxCount = data.maxCount || 0;

            // ── Month labels ──
            if (showMonthLabels) {
                var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                var labelFontSize = Math.max(9, Math.min(11, effSize * 0.85));
                ctx.font = '500 ' + labelFontSize + 'px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';

                var lastMonth = -1;
                for (var wc = 0; wc < WEEKS; wc++) {
                    var weeksAgo = (WEEKS - 1) - wc;
                    var mondayDayIdx = anchorMondayDayIdx - weeksAgo * 7;
                    var monthOfMonday = new Date(mondayDayIdx * MS_PER_DAY).getUTCMonth();
                    if (monthOfMonday !== lastMonth) {
                        var mx = gridLeft + wc * (effSize + cellGap);
                        ctx.fillText(monthNames[monthOfMonday], mx, gridTop - 3);
                        lastMonth = monthOfMonday;
                    }
                }
            }

            // ── Weekday labels (Mon, Wed, Fri on the left) ──
            var weekdayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
            var wkFontSize = Math.max(9, Math.min(11, effSize * 0.85));
            ctx.font = '500 ' + wkFontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (var dr = 0; dr < 7; dr++) {
                if (weekdayLabels[dr]) {
                    var ly = gridTop + dr * (effSize + cellGap) + effSize / 2;
                    ctx.fillText(weekdayLabels[dr], gridLeft - 6, ly);
                }
            }

            // ── Cells ──
            var cellRadius = Math.max(1, Math.min(3, effSize * 0.2));

            for (var col = 0; col < WEEKS; col++) {
                var colWeeksAgo = (WEEKS - 1) - col;
                var colMondayDayIdx = anchorMondayDayIdx - colWeeksAgo * 7;

                for (var row = 0; row < 7; row++) {
                    var dayIdx = colMondayDayIdx + row;

                    // Skip future dates in the anchor week's column
                    if (dayIdx > anchor) continue;

                    var x = gridLeft + col * (effSize + cellGap);
                    var y = gridTop + row * (effSize + cellGap);

                    var cnt = dayMap[dayIdx] || 0;
                    var level = bucketLevel(cnt, maxCount);
                    ctx.fillStyle = colorForLevel(level, lowColor, highColor);
                    roundRect(ctx, x, y, effSize, effSize, cellRadius);
                    ctx.fill();
                }
            }

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

            // Calendar emoji 📅
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('📅', w / 2, h / 2 - fontSize * 0.5 - gap);

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
