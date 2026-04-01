/*
 * Live Odds Ticker — Splunk Custom Visualization
 *
 * Horizontal scrolling ticker showing real-time World Cup betting odds changes.
 * Each item displays market name, current odds, change direction arrow, change amount,
 * and optional bet volume. Color-coded green for shortening, red for lengthening.
 *
 * Expected SPL columns: market (required), odds (required), prev_odds (optional), bet_volume (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var SCROLL_SPEEDS = { slow: 0.5, medium: 1.2, fast: 2.5 };
    var ANIM_INTERVALS = { slow: 33, medium: 33, fast: 33 }; // ~30fps for all, speed controls pixel step
    var FONT_SIZES = { small: 12, medium: 15, large: 19 };
    var NEUTRAL_COLOR = '#888899';
    var DIVIDER_COLOR = 'rgba(255,255,255,0.12)';
    var CARD_RADIUS = 6;
    var CARD_PADDING_H = 14;
    var CARD_PADDING_V = 8;

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function formatVolume(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
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

    function getOddsDirection(current, prev) {
        if (prev <= 0 || current <= 0) return 'neutral';
        if (current < prev - 0.001) return 'shortening';  // odds dropped = more bets
        if (current > prev + 0.001) return 'lengthening';  // odds rose = fewer bets
        return 'neutral';
    }

    function getDirectionArrow(direction) {
        if (direction === 'shortening') return '\u25BC';  // down arrow (odds went down = good for punters watching)
        if (direction === 'lengthening') return '\u25B2';  // up arrow (odds went up)
        return '\u25C6';  // diamond for neutral
    }

    function getChangeAmount(current, prev) {
        if (prev <= 0 || current <= 0) return '';
        var diff = Math.abs(current - prev);
        return diff.toFixed(2);
    }

    // ── Measure a single ticker item width ──────────────────────

    function measureItemWidth(ctx, item, baseFontSize, showVolume) {
        var width = CARD_PADDING_H; // left padding

        // Market name
        ctx.font = '600 ' + baseFontSize + 'px sans-serif';
        width += ctx.measureText(item.market).width + 10;

        // Odds value
        ctx.font = 'bold ' + Math.round(baseFontSize * 1.2) + 'px monospace';
        width += ctx.measureText(item.oddsStr).width + 8;

        // Arrow + change
        if (item.direction !== 'neutral') {
            ctx.font = '600 ' + Math.round(baseFontSize * 0.85) + 'px sans-serif';
            var changeText = item.arrow + ' ' + item.changeAmt;
            width += ctx.measureText(changeText).width + 8;
        } else {
            ctx.font = '600 ' + Math.round(baseFontSize * 0.85) + 'px sans-serif';
            width += ctx.measureText(item.arrow).width + 8;
        }

        // Volume badge
        if (showVolume && item.volumeStr) {
            ctx.font = '500 ' + Math.round(baseFontSize * 0.75) + 'px sans-serif';
            width += ctx.measureText(item.volumeStr + ' bets').width + 10;
        }

        width += CARD_PADDING_H; // right padding
        return width;
    }

    // ── Draw a single ticker item ───────────────────────────────

    function drawItem(ctx, item, x, y, cardH, baseFontSize, showVolume, upColor, downColor) {
        var accentColor;
        if (item.direction === 'shortening') {
            accentColor = upColor;
        } else if (item.direction === 'lengthening') {
            accentColor = downColor;
        } else {
            accentColor = NEUTRAL_COLOR;
        }

        var cardW = measureItemWidth(ctx, item, baseFontSize, showVolume);

        // Card background
        var bgAlpha = item.direction === 'neutral' ? 0.06 : 0.1;
        roundRect(ctx, x, y, cardW, cardH, CARD_RADIUS);
        ctx.fillStyle = hexToRgba(accentColor, bgAlpha);
        ctx.fill();

        // Left accent stripe
        ctx.fillStyle = accentColor;
        roundRect(ctx, x, y, 3, cardH, 1.5);
        ctx.fill();

        // Draw content inside card
        var cx = x + CARD_PADDING_H;
        var midY = y + cardH / 2;

        // Market name
        ctx.font = '600 ' + baseFontSize + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(item.market, cx, midY);
        cx += ctx.measureText(item.market).width + 10;

        // Odds value with accent glow
        ctx.font = 'bold ' + Math.round(baseFontSize * 1.2) + 'px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 6;
        ctx.fillText(item.oddsStr, cx, midY);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        cx += ctx.measureText(item.oddsStr).width + 8;

        // Arrow + change amount
        ctx.font = '600 ' + Math.round(baseFontSize * 0.85) + 'px sans-serif';
        ctx.fillStyle = accentColor;
        if (item.direction !== 'neutral') {
            var changeText = item.arrow + ' ' + item.changeAmt;
            ctx.fillText(changeText, cx, midY);
            cx += ctx.measureText(changeText).width + 8;
        } else {
            ctx.fillText(item.arrow, cx, midY);
            cx += ctx.measureText(item.arrow).width + 8;
        }

        // Volume badge
        if (showVolume && item.volumeStr) {
            ctx.font = '500 ' + Math.round(baseFontSize * 0.75) + 'px sans-serif';
            var volText = item.volumeStr + ' bets';
            var volW = ctx.measureText(volText).width + 10;
            var volH = baseFontSize + 2;
            var volX = cx;
            var volY = midY - volH / 2;

            roundRect(ctx, volX, volY, volW, volH, volH / 2);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'left';
            ctx.fillText(volText, volX + 5, midY);
        }

        return cardW;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('odds-ticker-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._scrollOffset = 0;
            this._timer = null;
            this._currentSpeed = 'medium';
            this._totalContentWidth = 0;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 200
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Live Odds Ticker'
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

            // Require market and odds columns
            if (colIdx.market === undefined || colIdx.odds === undefined) {
                throw new SplunkVisualizationBase.VisualizationError(
                    'Missing required columns: market, odds'
                );
            }

            // Build items array from all rows
            var items = [];
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var market = row[colIdx.market];
                var oddsVal = parseFloat(row[colIdx.odds]);
                var prevOdds = 0;
                var betVolume = 0;

                if (!market || isNaN(oddsVal)) continue;

                if (colIdx.prev_odds !== undefined) {
                    var pv = parseFloat(row[colIdx.prev_odds]);
                    if (!isNaN(pv)) prevOdds = pv;
                }

                if (colIdx.bet_volume !== undefined) {
                    var bv = parseFloat(row[colIdx.bet_volume]);
                    if (!isNaN(bv)) betVolume = Math.round(bv);
                }

                var direction = getOddsDirection(oddsVal, prevOdds);

                items.push({
                    market: market,
                    odds: oddsVal,
                    oddsStr: oddsVal.toFixed(2),
                    prevOdds: prevOdds,
                    direction: direction,
                    arrow: getDirectionArrow(direction),
                    changeAmt: getChangeAmount(oddsVal, prevOdds),
                    volume: betVolume,
                    volumeStr: betVolume > 0 ? formatVolume(betVolume) : ''
                });
            }

            if (items.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'No valid odds data found'
                );
            }

            var result = { items: items };
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

            if (!data || !data.items) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var scrollSpeed = config[ns + 'scrollSpeed'] || 'medium';
            var bgColor = config[ns + 'bgColor'] || '#0d0d1a';
            var upColor = config[ns + 'upColor'] || '#00cc66';
            var downColor = config[ns + 'downColor'] || '#ff4444';
            var showVolume = (config[ns + 'showVolume'] || 'true') === 'true';
            var itemSpacing = parseInt(config[ns + 'itemSpacing'], 10) || 40;
            var fontSize = config[ns + 'fontSize'] || 'medium';

            var baseFontSize = FONT_SIZES[fontSize] || FONT_SIZES.medium;
            var pixelsPerFrame = SCROLL_SPEEDS[scrollSpeed] || SCROLL_SPEEDS.medium;

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
            var items = data.items;

            // ── Manage animation timer ──
            if (this._currentSpeed !== scrollSpeed) {
                this._stopAnimation();
                this._currentSpeed = scrollSpeed;
            }
            this._startAnimation();

            // ── Calculate total content width (all items + spacing) ──
            var cardH = Math.round(baseFontSize * 2.4 + CARD_PADDING_V * 2);
            var totalWidth = 0;
            var itemWidths = [];
            for (var i = 0; i < items.length; i++) {
                var iw = measureItemWidth(ctx, items[i], baseFontSize, showVolume);
                itemWidths.push(iw);
                totalWidth += iw + itemSpacing;
            }
            this._totalContentWidth = totalWidth;

            // Advance scroll offset
            this._scrollOffset += pixelsPerFrame;
            if (this._totalContentWidth > 0 && this._scrollOffset >= this._totalContentWidth) {
                this._scrollOffset = this._scrollOffset % this._totalContentWidth;
            }

            // ── Clear and draw background ──
            ctx.clearRect(0, 0, w, h);

            // Full background
            ctx.fillStyle = bgColor;
            roundRect(ctx, 0, 0, w, h, 4);
            ctx.fill();

            // Subtle top/bottom border lines
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, 0.5);
            ctx.lineTo(w, 0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, h - 0.5);
            ctx.lineTo(w, h - 0.5);
            ctx.stroke();

            // ── Draw scrolling items ──
            // We draw items starting from -scrollOffset and wrap around
            var cardY = Math.round((h - cardH) / 2);
            var startX = -this._scrollOffset;

            // Draw enough copies to fill the viewport
            var drawX = startX;
            var safetyLimit = items.length * 3; // prevent infinite loop
            var drawn = 0;

            while (drawX < w && drawn < safetyLimit) {
                for (var j = 0; j < items.length; j++) {
                    var itemX = drawX;
                    var itemW = itemWidths[j];

                    // Only draw if visible (or partially visible)
                    if (itemX + itemW > 0 && itemX < w) {
                        // Clip to viewport for clean edges
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(0, 0, w, h);
                        ctx.clip();

                        drawItem(ctx, items[j], itemX, cardY, cardH, baseFontSize, showVolume, upColor, downColor);

                        // Divider after item
                        var divX = itemX + itemW + itemSpacing / 2;
                        if (divX > 0 && divX < w) {
                            ctx.strokeStyle = DIVIDER_COLOR;
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(divX, cardY + 4);
                            ctx.lineTo(divX, cardY + cardH - 4);
                            ctx.stroke();
                        }

                        ctx.restore();
                    }

                    drawX += itemW + itemSpacing;
                    drawn++;

                    if (drawX >= w) break;
                }
            }

            // ── Edge fade gradients ──
            var fadeW = Math.min(60, w * 0.08);

            // Left fade
            var leftGrad = ctx.createLinearGradient(0, 0, fadeW, 0);
            leftGrad.addColorStop(0, bgColor);
            leftGrad.addColorStop(1, hexToRgba(bgColor, 0));
            ctx.fillStyle = leftGrad;
            ctx.fillRect(0, 0, fadeW, h);

            // Right fade
            var rightGrad = ctx.createLinearGradient(w - fadeW, 0, w, 0);
            rightGrad.addColorStop(0, hexToRgba(bgColor, 0));
            rightGrad.addColorStop(1, bgColor);
            ctx.fillStyle = rightGrad;
            ctx.fillRect(w - fadeW, 0, fadeW, h);

            // ── "LIVE ODDS" label at top-left ──
            var labelSize = Math.max(8, baseFontSize * 0.6);
            ctx.font = '700 ' + labelSize + 'px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillText('\u26BD LIVE ODDS', 8, 4);

            // Reset text alignment
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        // ── Animation Timer ─────────────────────────────────────

        _startAnimation: function() {
            if (this._timer) return;
            var self = this;
            var interval = ANIM_INTERVALS[self._currentSpeed] || 33;
            this._timer = setInterval(function() {
                self.invalidateUpdateView();
            }, interval);
        },

        _stopAnimation: function() {
            if (this._timer) {
                clearInterval(this._timer);
                this._timer = null;
            }
        },

        // ── Custom No-Data Message ──────────────────────────────

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
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // Dark background
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.25));
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
            this._stopAnimation();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
