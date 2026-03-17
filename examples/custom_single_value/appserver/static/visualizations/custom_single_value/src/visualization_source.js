/*
 * Custom Single Value — Splunk Custom Visualization
 *
 * Displays any search field value with configurable colour, weight,
 * alignment, and an optional label. Uses system fonts by default.
 *
 * Expected SPL columns: any single field (configurable via "field" setting)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper: fit text to max width ───────────────────────────

    function fitText(ctx, text, maxWidth, maxSize, weight, family) {
        var size = maxSize;
        ctx.font = weight + ' ' + size + 'px ' + family;
        while (ctx.measureText(text).width > maxWidth && size > 8) {
            size--;
            ctx.font = weight + ' ' + size + 'px ' + family;
        }
        return size;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('custom-single-value-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
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
                    'Awaiting data \u2014 Custom Single Value'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            var row = data.rows[data.rows.length - 1];
            var result = { colIdx: colIdx, row: row };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (!data) return;

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var fieldName  = config[ns + 'field']      || 'value';
            var color      = config[ns + 'color']      || '#E20082';
            var weight     = config[ns + 'weight']     || 'bold';
            var align      = config[ns + 'align']      || 'center';
            var valign     = config[ns + 'valign']     || 'middle';
            var label      = config[ns + 'label']      || '';
            var labelColor = config[ns + 'labelColor'] || '#888888';
            var labelAlign = config[ns + 'labelAlign'] || 'center';
            var showGlow   = (config[ns + 'showGlow'] || 'false') === 'true';

            // ── Extract value ──
            var displayText = '';
            if (data.colIdx[fieldName] !== undefined) {
                displayText = String(data.row[data.colIdx[fieldName]] || '');
            }

            // ── Size canvas ──
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

            var fontFamily = 'sans-serif';
            var pad = Math.min(w, h) * 0.08;
            var hasLabel = label.length > 0;

            // ── Layout: label always at top, value fills remaining space ──
            var valueArea;
            var labelH = 0;
            var labelGap = 0;

            if (hasLabel) {
                labelH = Math.max(14, h * 0.22);
                labelGap = Math.max(4, h * 0.04);
            }

            valueArea = {
                x: pad,
                y: pad + labelH + labelGap,
                w: w - pad * 2,
                h: h - pad * 2 - labelH - labelGap
            };

            // ── Draw label (always at top) ──
            if (hasLabel) {
                var labelFontSize = Math.min(labelH * 0.7, 20);
                var lSize = fitText(ctx, label.toUpperCase(), w - pad * 2, labelFontSize, 'normal', fontFamily);
                ctx.font = 'normal ' + lSize + 'px ' + fontFamily;
                ctx.fillStyle = labelColor;
                ctx.textBaseline = 'middle';
                ctx.textAlign = labelAlign;

                var lx;
                if (labelAlign === 'left') lx = pad;
                else if (labelAlign === 'right') lx = w - pad;
                else lx = w / 2;

                ctx.fillText(label.toUpperCase(), lx, pad + labelH / 2);
            }

            // ── Draw value ──
            if (valueArea.w <= 0 || valueArea.h <= 0) return;

            var maxValueSize = valueArea.h * 0.85;
            var vSize = fitText(ctx, displayText, valueArea.w, maxValueSize, weight, fontFamily);
            ctx.font = weight + ' ' + vSize + 'px ' + fontFamily;
            ctx.fillStyle = color;

            ctx.textAlign = align;
            var vx;
            if (align === 'left') vx = valueArea.x;
            else if (align === 'right') vx = valueArea.x + valueArea.w;
            else vx = valueArea.x + valueArea.w / 2;

            var vy;
            if (valign === 'top') {
                ctx.textBaseline = 'top';
                vy = valueArea.y;
            } else if (valign === 'bottom') {
                ctx.textBaseline = 'bottom';
                vy = valueArea.y + valueArea.h;
            } else {
                ctx.textBaseline = 'middle';
                vy = valueArea.y + valueArea.h / 2;
            }

            if (showGlow) {
                ctx.shadowColor = color;
                ctx.shadowBlur = Math.max(10, vSize * 0.3);
            }
            ctx.fillText(displayText, vx, vy);
            ctx.shadowBlur = 0;
        },

        reflow: function() {
            this.invalidateUpdateView();
        }
    });
});
