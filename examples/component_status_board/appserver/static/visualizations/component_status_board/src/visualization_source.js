/*
 * Component Status Board — Splunk Custom Visualization
 *
 * Material-inspired grid of status cards showing Splunk component health.
 * Each card has a status icon, component name, error/warning counts,
 * and card shadow for depth. Click a card to drilldown.
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
            accent:    '#EF5350',
            iconBg:    'rgba(239,83,80,0.15)',
            iconRing:  'rgba(239,83,80,0.30)',
            cardTint:  'rgba(239,83,80,0.04)',
            badgeBg:   'rgba(239,83,80,0.12)',
            badgeText: '#EF5350',
            shadow:    'rgba(239,83,80,0.25)'
        },
        warning: {
            accent:    '#FFA726',
            iconBg:    'rgba(255,167,38,0.15)',
            iconRing:  'rgba(255,167,38,0.30)',
            cardTint:  'rgba(255,167,38,0.04)',
            badgeBg:   'rgba(255,167,38,0.12)',
            badgeText: '#F57C00',
            shadow:    'rgba(255,167,38,0.15)'
        },
        ok: {
            accent:    '#66BB6A',
            iconBg:    'rgba(102,187,106,0.15)',
            iconRing:  'rgba(102,187,106,0.30)',
            cardTint:  'rgba(102,187,106,0.03)',
            badgeBg:   'rgba(102,187,106,0.12)',
            badgeText: '#43A047',
            shadow:    'rgba(0,0,0,0.06)'
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

    // ── Icon drawing (Canvas 2D paths) ──────────────────────────

    function drawCriticalIcon(ctx, cx, cy, r) {
        // X mark
        var s = r * 0.38;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.strokeStyle = STATUS.critical.accent;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    function drawWarningIcon(ctx, cx, cy, r) {
        // Exclamation triangle
        var s = r * 0.45;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s, cy + s * 0.7);
        ctx.lineTo(cx - s, cy + s * 0.7);
        ctx.closePath();
        ctx.strokeStyle = STATUS.warning.accent;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke();
        // Dot
        ctx.beginPath();
        ctx.arc(cx, cy + s * 0.25, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = STATUS.warning.accent;
        ctx.fill();
        // Line
        ctx.beginPath();
        ctx.moveTo(cx, cy - s * 0.25);
        ctx.lineTo(cx, cy + s * 0.05);
        ctx.strokeStyle = STATUS.warning.accent;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    function drawOkIcon(ctx, cx, cy, r) {
        // Checkmark
        var s = r * 0.35;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy);
        ctx.lineTo(cx - s * 0.2, cy + s * 0.7);
        ctx.lineTo(cx + s, cy - s * 0.5);
        ctx.strokeStyle = STATUS.ok.accent;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    function drawStatusIcon(ctx, cx, cy, r, status, pal) {
        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = pal.iconBg;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = pal.iconRing;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (status === 'critical') drawCriticalIcon(ctx, cx, cy, r);
        else if (status === 'warning') drawWarningIcon(ctx, cx, cy, r);
        else drawOkIcon(ctx, cx, cy, r);
    }

    function getThemeColors(isDark) {
        return {
            textPrimary:   isDark ? 'rgba(255,255,255,0.92)' : 'rgba(30,30,30,0.88)',
            textSecondary: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.42)',
            textTertiary:  isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)',
            cardBg:        isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
            cardBorder:    isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            cardShadow:    isDark ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.08)',
            headerLine:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
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

            // ── Grid layout ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var w = rect.width;
            var headerH = 44;
            var gap = 10;
            var tileH = 96;
            var minTileW = 220;
            var maxTileW = 340;
            var cornerRadius = 12;

            var availW = w - gap * 2;
            var cols = Math.max(1, Math.floor((availW + gap) / (minTileW + gap)));
            var tileW = Math.min(maxTileW, (availW - gap * (cols - 1)) / cols);
            var gridW = cols * tileW + (cols - 1) * gap;
            var offsetX = (w - gridW) / 2;
            var totalRows = Math.ceil(items.length / cols);

            var contentH = headerH + gap + totalRows * (tileH + gap) + gap;
            var h = Math.max(rect.height, contentH);

            // ── Size canvas ──
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
            ctx.font = '600 13px sans-serif';
            ctx.fillStyle = colors.textPrimary;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(title.toUpperCase(), offsetX, headerH / 2);

            // Legend (right) — pill badges
            if (showLegend) {
                var legendItems = [
                    { label: 'Critical', count: counts.critical, pal: STATUS.critical },
                    { label: 'Warning',  count: counts.warning,  pal: STATUS.warning },
                    { label: 'OK',       count: counts.ok,       pal: STATUS.ok }
                ];

                var pillH = 24;
                var pillGap = 6;
                var pillY = (headerH - pillH) / 2;

                // Measure total width first to right-align
                var totalPillW = 0;
                var pillWidths = [];
                for (var li = 0; li < legendItems.length; li++) {
                    var lItem = legendItems[li];
                    var pillText = lItem.count + ' ' + lItem.label;
                    ctx.font = '600 11px sans-serif';
                    var pw = ctx.measureText(pillText).width + 20;
                    pillWidths.push(pw);
                    totalPillW += pw + (li < legendItems.length - 1 ? pillGap : 0);
                }

                var px = w - offsetX - totalPillW;
                for (var li2 = 0; li2 < legendItems.length; li2++) {
                    var lItem2 = legendItems[li2];
                    var pillText2 = lItem2.count + ' ' + lItem2.label;
                    var pw2 = pillWidths[li2];

                    roundRect(ctx, px, pillY, pw2, pillH, pillH / 2);
                    ctx.fillStyle = lItem2.pal.iconBg;
                    ctx.fill();
                    roundRect(ctx, px, pillY, pw2, pillH, pillH / 2);
                    ctx.strokeStyle = lItem2.pal.iconRing;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.font = '600 11px sans-serif';
                    ctx.fillStyle = lItem2.pal.accent;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(pillText2, px + pw2 / 2, pillY + pillH / 2);

                    px += pw2 + pillGap;
                }
            }

            // Header line
            ctx.fillStyle = colors.headerLine;
            ctx.fillRect(offsetX, headerH - 1, gridW, 1);

            // ── Icon sizing ──
            var iconRadius = Math.min(18, tileH * 0.2);

            // ── Draw cards ──
            this._tileRects = [];

            for (var ti = 0; ti < items.length; ti++) {
                var tItem = items[ti];
                var col2 = ti % cols;
                var row2 = Math.floor(ti / cols);
                var tx = offsetX + col2 * (tileW + gap);
                var ty = headerH + gap + row2 * (tileH + gap);

                this._tileRects.push({
                    x: tx, y: ty, w: tileW, h: tileH,
                    name: tItem.name
                });

                var pal = STATUS[tItem.status] || STATUS.ok;
                var isMuted = mutedOk && tItem.status === 'ok';

                if (isMuted) ctx.globalAlpha = 0.5;

                // ── Card shadow ──
                ctx.save();
                if (showGlow && tItem.status === 'critical') {
                    ctx.shadowColor = pal.shadow;
                    ctx.shadowBlur = 16;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 2;
                } else {
                    ctx.shadowColor = colors.cardShadow;
                    ctx.shadowBlur = 8;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 2;
                }

                // Card background
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.fillStyle = colors.cardBg;
                ctx.fill();
                ctx.restore();

                // Status tint overlay
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.fillStyle = pal.cardTint;
                ctx.fill();

                // Card border
                roundRect(ctx, tx, ty, tileW, tileH, cornerRadius);
                ctx.strokeStyle = colors.cardBorder;
                ctx.lineWidth = 1;
                ctx.stroke();

                // ── Layout: icon left, content right ──
                var iconCX = tx + 16 + iconRadius;
                var iconCY = ty + tileH / 2;
                var contentX = iconCX + iconRadius + 14;
                var contentW = tileW - (contentX - tx) - 16;

                // Status icon circle
                drawStatusIcon(ctx, iconCX, iconCY, iconRadius, tItem.status, pal);

                // ── Text content ──
                // Component name
                var nameFontSize = 14;
                var nSize = fitText(ctx, tItem.name, contentW, nameFontSize, '600', 'sans-serif');
                ctx.font = '600 ' + nSize + 'px sans-serif';
                ctx.fillStyle = colors.textPrimary;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                var nameY = ty + 16;
                ctx.fillText(tItem.name, contentX, nameY);

                // Status label
                ctx.font = '500 10px sans-serif';
                ctx.fillStyle = pal.accent;
                ctx.textBaseline = 'top';
                ctx.fillText(tItem.status.toUpperCase(), contentX, nameY + nSize + 4);

                // ── Badges (bottom of card) ──
                var badgeY = ty + tileH - 28;
                var badgeH = 20;
                var bx = contentX;

                if (tItem.errors > 0) {
                    var errText = '\u2716 ' + tItem.errors + ' error' + (tItem.errors !== 1 ? 's' : '');
                    ctx.font = '600 10px sans-serif';
                    var errTW = ctx.measureText(errText).width;
                    var errBW = errTW + 14;

                    roundRect(ctx, bx, badgeY, errBW, badgeH, badgeH / 2);
                    ctx.fillStyle = STATUS.critical.badgeBg;
                    ctx.fill();

                    ctx.fillStyle = STATUS.critical.badgeText;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(errText, bx + 7, badgeY + badgeH / 2);
                    bx += errBW + 6;
                }

                if (tItem.warnings > 0) {
                    var warnText = '\u26A0 ' + tItem.warnings + ' warn' + (tItem.warnings !== 1 ? 's' : '');
                    ctx.font = '600 10px sans-serif';
                    var warnTW = ctx.measureText(warnText).width;
                    var warnBW = warnTW + 14;

                    roundRect(ctx, bx, badgeY, warnBW, badgeH, badgeH / 2);
                    ctx.fillStyle = STATUS.warning.badgeBg;
                    ctx.fill();

                    ctx.fillStyle = STATUS.warning.badgeText;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(warnText, bx + 7, badgeY + badgeH / 2);
                }

                // Show "All clear" for ok tiles with no issues
                if (tItem.errors === 0 && tItem.warnings === 0) {
                    ctx.font = '500 10px sans-serif';
                    ctx.fillStyle = colors.textTertiary;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('\u2713 All clear', contentX, badgeY + badgeH / 2);
                }

                if (isMuted) ctx.globalAlpha = 1.0;
            }

            // ── No data state ──
            if (items.length === 0) {
                ctx.font = '600 16px sans-serif';
                ctx.fillStyle = colors.textSecondary;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('AWAITING COMPONENT DATA', w / 2, h / 2 - 14);

                ctx.font = 'normal 12px sans-serif';
                ctx.fillStyle = colors.textTertiary;
                ctx.fillText('Expected columns: component, errors, warns, status', w / 2, h / 2 + 14);
            }
        },

        reflow: function() {
            this.invalidateUpdateView();
        }
    });
});
