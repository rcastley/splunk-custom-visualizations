/*
 * Component Status Board — Splunk Custom Visualization
 *
 * NOC-style grid of status tiles showing Splunk component health.
 * Each tile displays a component name, error/warning counts, and
 * a status indicator. Click a tile to drilldown to that component.
 *
 * Expected SPL columns: component, errors, warns, status
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Status palette ──────────────────────────────────────────

    var STATUS = {
        critical: {
            accent:   '#FF1744',
            tint:     'rgba(255,23,68,0.10)',
            badgeBg:  'rgba(255,23,68,0.25)',
            border:   'rgba(255,23,68,0.25)'
        },
        warning: {
            accent:   '#FFB300',
            tint:     'rgba(255,179,0,0.08)',
            badgeBg:  'rgba(255,179,0,0.20)',
            border:   'rgba(255,179,0,0.25)'
        },
        ok: {
            accent:   '#00C853',
            tint:     'rgba(0,200,83,0.06)',
            badgeBg:  'rgba(0,200,83,0.15)',
            border:   'rgba(0,200,83,0.25)'
        }
    };

    // ── Canvas helpers ──────────────────────────────────────────

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

    function fitText(ctx, text, maxWidth, maxSize, weight, family) {
        var size = maxSize;
        ctx.font = weight + ' ' + size + 'px ' + family;
        while (ctx.measureText(text).width > maxWidth && size > 8) {
            size--;
            ctx.font = weight + ' ' + size + 'px ' + family;
        }
        return size;
    }

    function drawBadge(ctx, label, count, x, y, h, bgColor, textColor) {
        var text = label + ' ' + count;
        ctx.font = 'bold ' + (h - 2) + 'px monospace';
        var tw = ctx.measureText(text).width;
        var pw = 8;
        var bw = tw + pw * 2;
        var br = h / 2;

        roundRect(ctx, x, y, bw, h, br);
        ctx.fillStyle = bgColor;
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + pw, y + h / 2);

        return bw;
    }

    function getThemeColors(isDark) {
        return {
            textPrimary:   isDark ? 'rgba(255,255,255,0.90)' : 'rgba(0,0,0,0.85)',
            textSecondary: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.45)',
            badgeText:     isDark ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.90)',
            separator:     isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            tileBg:        isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
        };
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('component-status-board-viz');
            this.el.style.overflowY = 'auto';

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._tileRects = [];
            this._componentField = 'component';

            // Drilldown click handler
            var self = this;
            this.canvas.addEventListener('click', function(event) {
                if (!self._tileRects || self._tileRects.length === 0) return;

                var canvasRect = self.canvas.getBoundingClientRect();
                var clickX = event.clientX - canvasRect.left;
                var clickY = event.clientY - canvasRect.top;

                for (var i = 0; i < self._tileRects.length; i++) {
                    var t = self._tileRects[i];
                    if (clickX >= t.x && clickX <= t.x + t.w &&
                        clickY >= t.y && clickY <= t.y + t.h) {
                        var drilldownData = {};
                        drilldownData[self._componentField] = t.name;
                        event.preventDefault();
                        self.drilldown({
                            action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                            data: drilldownData
                        }, event);
                        break;
                    }
                }
            });

            // Pointer cursor on tile hover
            this.canvas.addEventListener('mousemove', function(event) {
                var rect = self.canvas.getBoundingClientRect();
                var mx = event.clientX - rect.left;
                var my = event.clientY - rect.top;
                var over = false;

                for (var i = 0; i < self._tileRects.length; i++) {
                    var t = self._tileRects[i];
                    if (mx >= t.x && mx <= t.x + t.w &&
                        my >= t.y && my <= t.y + t.h) {
                        over = true;
                        break;
                    }
                }
                self.canvas.style.cursor = over ? 'pointer' : 'default';
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
                    'Awaiting data \u2014 Component Status Board'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            var result = { colIdx: colIdx, rows: data.rows };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (!data) return;

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var componentField = config[ns + 'componentField'] || 'component';
            var errorsField    = config[ns + 'errorsField']    || 'errors';
            var warningsField  = config[ns + 'warningsField']  || 'warns';
            var statusField    = config[ns + 'statusField']    || 'status';
            this._componentField = componentField;
            var title          = config[ns + 'title']          || 'COMPONENT STATUS';
            var sortOrder      = config[ns + 'sortOrder']      || 'severity';
            var showLegend     = (config[ns + 'showLegend'] || 'true') === 'true';
            var showGlow       = (config[ns + 'showGlow']   || 'true') === 'true';
            var mutedOk        = (config[ns + 'mutedOk']    || 'true') === 'true';

            // ── Extract items from rows ──
            var colIdx = data.colIdx;
            var rows = data.rows;
            var items = [];

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var name = colIdx[componentField] !== undefined ? String(row[colIdx[componentField]] || '') : '';
                var errors = colIdx[errorsField] !== undefined ? parseInt(row[colIdx[errorsField]], 10) : 0;
                var warnings = colIdx[warningsField] !== undefined ? parseInt(row[colIdx[warningsField]], 10) : 0;
                var status = colIdx[statusField] !== undefined ? String(row[colIdx[statusField]] || 'ok').toLowerCase() : 'ok';

                if (isNaN(errors)) errors = 0;
                if (isNaN(warnings)) warnings = 0;
                if (!STATUS[status]) status = 'ok';

                items.push({
                    name: name,
                    errors: errors,
                    warnings: warnings,
                    status: status
                });
            }

            // ── Sort ──
            if (sortOrder === 'severity') {
                items.sort(function(a, b) {
                    var order = { critical: 0, warning: 1, ok: 2 };
                    var sa = order[a.status] !== undefined ? order[a.status] : 2;
                    var sb = order[b.status] !== undefined ? order[b.status] : 2;
                    if (sa !== sb) return sa - sb;
                    if (sa === 2) return a.name.localeCompare(b.name);
                    return (b.errors + b.warnings) - (a.errors + a.warnings);
                });
            } else {
                items.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            }

            // ── Grid layout (calculate before sizing canvas) ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var w = rect.width;
            var headerH = 32;
            var gap = 6;
            var tileH = 80;
            var minTileW = 180;
            var maxTileW = 280;
            var cornerRadius = 4;

            var availW = w - gap;
            var cols = Math.max(1, Math.floor(availW / (minTileW + gap)));
            var tileW = Math.min(maxTileW, (availW - gap * (cols - 1)) / cols);
            var gridW = cols * tileW + (cols - 1) * gap;
            var offsetX = (w - gridW) / 2;
            var totalRows = Math.ceil(items.length / cols);

            // Calculate total content height — canvas grows to fit all tiles
            var contentH = headerH + gap + totalRows * tileH + (totalRows - 1) * gap + gap;
            var h = Math.max(rect.height, contentH);

            // ── Size canvas to full content height ──
            var dpr = window.devicePixelRatio || 1;
            this.canvas.style.height = h + 'px';
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            ctx.clearRect(0, 0, w, h);

            // ── Theme ──
            var theme = SplunkVisualizationUtils.getCurrentTheme();
            var isDark = (theme === 'dark');
            var colors = getThemeColors(isDark);

            // ── Count statuses for legend ──
            var counts = { critical: 0, warning: 0, ok: 0 };
            for (var c = 0; c < items.length; c++) {
                counts[items[c].status] = (counts[items[c].status] || 0) + 1;
            }

            // ── Header ──
            // Title (left)
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = colors.textSecondary;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(title.toUpperCase(), 10, headerH / 2);

            // Legend (right)
            if (showLegend) {
                var legendItems = [
                    { label: 'Critical', count: counts.critical, color: STATUS.critical.accent },
                    { label: 'Warning',  count: counts.warning,  color: STATUS.warning.accent },
                    { label: 'OK',       count: counts.ok,       color: STATUS.ok.accent }
                ];

                var lx = w - 10;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';

                for (var li = legendItems.length - 1; li >= 0; li--) {
                    var item = legendItems[li];

                    // Count
                    ctx.font = 'bold 11px monospace';
                    ctx.fillStyle = colors.textPrimary;
                    var countStr = String(item.count);
                    var countW = ctx.measureText(countStr).width;
                    ctx.fillText(countStr, lx, headerH / 2);
                    lx -= countW + 4;

                    // Label
                    ctx.font = 'normal 10px sans-serif';
                    ctx.fillStyle = colors.textSecondary;
                    var labelW = ctx.measureText(item.label).width;
                    ctx.fillText(item.label, lx, headerH / 2);
                    lx -= labelW + 4;

                    // Dot
                    ctx.beginPath();
                    ctx.arc(lx, headerH / 2, 4, 0, Math.PI * 2);
                    ctx.fillStyle = item.color;
                    ctx.fill();
                    lx -= 16;
                }
            }

            // Header separator
            ctx.fillStyle = colors.separator;
            ctx.fillRect(0, headerH - 1, w, 1);

            // ── Font scaling ──
            var nameFontSize = 13;
            var badgeFontSize = 11;
            var statusFontSize = 9;

            // ── Draw tiles ──
            this._tileRects = [];

            for (var ti = 0; ti < items.length; ti++) {
                var tItem = items[ti];
                var col = ti % cols;
                var row2 = Math.floor(ti / cols);
                var tx = offsetX + col * (tileW + gap);
                var ty = headerH + gap + row2 * (tileH + gap);

                // Store rect for drilldown hit testing
                this._tileRects.push({
                    x: tx, y: ty, w: tileW, h: tileH,
                    name: tItem.name
                });

                var pal = STATUS[tItem.status] || STATUS.ok;
                var isMuted = mutedOk && tItem.status === 'ok';

                // Set opacity for muted OK tiles
                if (isMuted) ctx.globalAlpha = 0.55;

                // Critical glow
                if (showGlow && tItem.status === 'critical') {
                    ctx.save();
                    ctx.shadowColor = '#FF1744';
                    ctx.shadowBlur = 8;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                    ctx.fillStyle = pal.tint;
                    ctx.fill();
                    ctx.restore();
                }

                // Tile base fill
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.fillStyle = colors.tileBg;
                ctx.fill();

                // Status tint overlay
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.fillStyle = pal.tint;
                ctx.fill();

                // Subtle gradient overlay for depth
                var grad = ctx.createLinearGradient(tx, ty, tx, ty + tileH);
                grad.addColorStop(0, 'rgba(255,255,255,0.03)');
                grad.addColorStop(1, 'rgba(0,0,0,0.03)');
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.fillStyle = grad;
                ctx.fill();

                // Tile border
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.strokeStyle = pal.border;
                ctx.lineWidth = 1;
                ctx.stroke();

                // Left status accent bar
                var barInset = 4;
                ctx.fillStyle = pal.accent;
                ctx.fillRect(tx + 1, ty + barInset, 4, tileH - barInset * 2);

                // ── Tile content layout (proportional to tileH) ──
                var contentX = tx + 14;
                var contentW = tileW - 28;

                // Component name
                var nSize = fitText(ctx, tItem.name.toUpperCase(), contentW, nameFontSize, 'bold', 'sans-serif');
                ctx.font = 'bold ' + nSize + 'px sans-serif';
                ctx.fillStyle = colors.textPrimary;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(tItem.name.toUpperCase(), contentX, ty + tileH * 0.12);

                // Error/warning badges
                var badgeY = ty + tileH * 0.42;
                var badgeH = Math.max(12, badgeFontSize + 2);
                var bx = contentX;

                if (tItem.errors > 0) {
                    var ew = drawBadge(ctx, 'ERR', tItem.errors, bx, badgeY, badgeH,
                        STATUS.critical.badgeBg, colors.badgeText);
                    bx += ew + 6;
                }
                if (tItem.warnings > 0) {
                    drawBadge(ctx, 'WARN', tItem.warnings, bx, badgeY, badgeH,
                        STATUS.warning.badgeBg, colors.badgeText);
                }

                // Separator line
                var sepY = ty + tileH * 0.68;
                ctx.fillStyle = colors.separator;
                ctx.fillRect(contentX, sepY, contentW, 1);

                // Status label
                ctx.font = '600 ' + statusFontSize + 'px sans-serif';
                ctx.fillStyle = pal.accent;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(tItem.status.toUpperCase(), contentX, ty + tileH * 0.74);

                // Reset opacity
                if (isMuted) ctx.globalAlpha = 1.0;
            }

            // ── No data state ──
            if (items.length === 0) {
                ctx.font = 'bold 14px sans-serif';
                ctx.fillStyle = colors.textSecondary;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('AWAITING COMPONENT DATA', w / 2, h / 2 - 12);

                ctx.font = 'normal 11px sans-serif';
                ctx.fillText('Expected columns: component, errors, warns, status', w / 2, h / 2 + 12);
            }
        },

        reflow: function() {
            this.invalidateUpdateView();
        }
    });
});
