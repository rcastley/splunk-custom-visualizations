/*
 * F1 Track Info — Splunk Custom Visualization
 *
 * Renders a track info card with miniature track silhouette colored by sector,
 * sector boundary markers, track name, length (km), and number of turns.
 *
 * Expected SPL columns: track_id, track_length, sector2_lap_distance_start, sector3_lap_distance_start
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    var TRACK_SPLINES = require('../track_splines.json');

    var SECTOR_COLORS = ['#00BFFF', '#FFD700', '#e10600'];

    var TRACK_NAMES = {
        0: 'Melbourne', 2: 'Shanghai', 3: 'Sakhir',
        4: 'Catalunya', 5: 'Monaco', 6: 'Montreal',
        7: 'Silverstone', 9: 'Hungaroring', 10: 'Spa-Francorchamps',
        11: 'Monza', 12: 'Singapore', 13: 'Suzuka',
        14: 'Abu Dhabi', 15: 'Texas (COTA)', 16: 'Interlagos',
        17: 'Austria', 19: 'Mexico City', 20: 'Baku',
        26: 'Zandvoort', 27: 'Imola', 29: 'Jeddah',
        30: 'Miami', 31: 'Las Vegas', 32: 'Losail',
        39: 'Silverstone (R)', 40: 'Austria (R)', 41: 'Zandvoort (R)'
    };

    var TRACK_TURNS = {
        0: 16, 2: 16, 3: 15, 4: 16, 5: 19, 6: 14,
        7: 18, 9: 14, 10: 19, 11: 11, 12: 23, 13: 18,
        14: 21, 15: 20, 16: 15, 17: 10, 19: 17, 20: 20,
        26: 14, 27: 19, 29: 27, 30: 19, 31: 17, 32: 16,
        39: 18, 40: 10, 41: 14
    };

    // ── Helpers ───────────────────────────────────────────────────

    function splineBounds(pts) {
        var minX = Infinity, maxX = -Infinity;
        var minZ = Infinity, maxZ = -Infinity;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i][0] < minX) minX = pts[i][0];
            if (pts[i][0] > maxX) maxX = pts[i][0];
            if (pts[i][1] < minZ) minZ = pts[i][1];
            if (pts[i][1] > maxZ) maxZ = pts[i][1];
        }
        return { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    }

    function clamp(val, lo, hi) {
        return Math.max(lo, Math.min(hi, val));
    }

    function roundedRect(ctx, x, y, w, h, r) {
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

    // ── Visualization ────────────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('f1-track-info-viz');
            this.canvas = null;
            this._fontReady = false;
            this._fontCheckDone = false;
            this._lastGoodData = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10
            };
        },

        formatData: function(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Track Info'
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

            if (colIdx.track_id === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Search results must include column: track_id. ' +
                    'Optional: track_length, sector2_lap_distance_start, sector3_lap_distance_start.'
                );
            }

            var row = data.rows[data.rows.length - 1];

            function getVal(name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                var v = parseFloat(row[colIdx[name]]);
                return isNaN(v) ? fallback : v;
            }

            var result = {
                trackId:      getVal('track_id', -1),
                trackLength:  getVal('track_length', 0),
                sector2Start: getVal('sector2_lap_distance_start', 0),
                sector3Start: getVal('sector3_lap_distance_start', 0)
            };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (!this._fontReady && !this._fontCheckDone) {
                this._fontCheckDone = true;
                var self = this;
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(function() {
                        self._fontReady = true;
                        self.invalidateUpdateView();
                    });
                } else {
                    setTimeout(function() {
                        self._fontReady = true;
                        self.invalidateUpdateView();
                    }, 200);
                }
                return;
            }

            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else {
                    this.el.innerHTML = '<div class="f1-track-info-empty">' +
                        'Waiting for session data</div>';
                    this.canvas = null;
                    return;
                }
            }

            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var showTrackMap    = config[ns + 'showTrackMap'] !== 'false';
            var trackWidth      = parseFloat(config[ns + 'trackWidth']) || 4;
            var showTrackName   = config[ns + 'showTrackName'] !== 'false';
            var showSectors     = config[ns + 'showSectorMarkers'] !== 'false';
            var textColor       = config[ns + 'textColor'] || '#ffffff';

            // Canvas setup
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
            var ctx = this.canvas.getContext('2d');
            ctx.scale(dpr, dpr);

            var w = rect.width;
            var h = rect.height;

            ctx.clearRect(0, 0, w, h);

            var trackId = Math.round(data.trackId);
            var trackName = TRACK_NAMES[trackId] || ('Track ' + trackId);
            var turns = TRACK_TURNS[trackId];
            var spline = TRACK_SPLINES[String(trackId)];

            if (!showTrackMap || !spline || spline.length < 3) {
                if (showTrackName) {
                    this._drawTextOnly(ctx, w, h, trackName, data.trackLength, turns, textColor);
                }
                return;
            }

            // Layout: track silhouette top 65%, text bottom 35%
            var padding = Math.max(12, w * 0.04);
            var trackAreaH = showTrackName ? h * 0.65 : h;
            var textAreaTop = trackAreaH;

            var hasSectors = this._drawTrack(ctx, spline, w, trackAreaH, padding, trackWidth,
                            data.trackLength, data.sector2Start, data.sector3Start, showSectors);

            if (showTrackName) {
                this._drawText(ctx, w, h, textAreaTop, trackName,
                               data.trackLength, turns, textColor, hasSectors && showSectors);
            }
        },

        _drawTrack: function(ctx, spline, w, areaH, padding, lineWidthBase,
                             trackLength, s2Start, s3Start, showSectors) {
            // Scale line width with panel size
            var lineWidth = Math.max(lineWidthBase, Math.min(w, areaH) * 0.012);
            var bounds = splineBounds(spline);
            var rangeX = bounds.maxX - bounds.minX || 1;
            var rangeZ = bounds.maxZ - bounds.minZ || 1;
            var scale = Math.min(
                (w - 2 * padding) / rangeX,
                (areaH - 2 * padding) / rangeZ
            );
            var offsetX = (w - rangeX * scale) / 2;
            var offsetZ = (areaH - rangeZ * scale) / 2;

            function toCanvas(pt) {
                return {
                    x: offsetX + (pt[0] - bounds.minX) * scale,
                    y: offsetZ + (pt[1] - bounds.minZ) * scale
                };
            }

            var numPts = spline.length;

            // Sector boundary indices
            var s2Idx, s3Idx;
            var hasSectors = showSectors && trackLength > 0 && s2Start > 0 && s3Start > s2Start;

            if (hasSectors) {
                s2Idx = clamp(Math.round((s2Start / trackLength) * numPts), 0, numPts - 1);
                s3Idx = clamp(Math.round((s3Start / trackLength) * numPts), s2Idx, numPts - 1);
            }

            // Background outline — full track, subtle
            ctx.beginPath();
            var p0 = toCanvas(spline[0]);
            ctx.moveTo(p0.x, p0.y);
            for (var i = 1; i < numPts; i++) {
                var p = toCanvas(spline[i]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.lineWidth = lineWidth + 4;
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            if (hasSectors) {
                // Draw three sector segments
                var segments = [
                    { start: 0, end: s2Idx, color: SECTOR_COLORS[0] },
                    { start: s2Idx, end: s3Idx, color: SECTOR_COLORS[1] },
                    { start: s3Idx, end: numPts - 1, color: SECTOR_COLORS[2] }
                ];

                for (var s = 0; s < segments.length; s++) {
                    var seg = segments[s];
                    ctx.beginPath();
                    var sp = toCanvas(spline[seg.start]);
                    ctx.moveTo(sp.x, sp.y);
                    for (var j = seg.start + 1; j <= seg.end; j++) {
                        var pt = toCanvas(spline[j]);
                        ctx.lineTo(pt.x, pt.y);
                    }
                    // Close S3 back to start
                    if (s === 2) {
                        var closeP = toCanvas(spline[0]);
                        ctx.lineTo(closeP.x, closeP.y);
                    }
                    ctx.lineWidth = lineWidth;
                    ctx.strokeStyle = seg.color;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.stroke();
                }

                // Sector boundary dots
                var dotRadius = Math.max(3, lineWidth * 1.2);
                var boundaryIdxs = [s2Idx, s3Idx];

                for (var b = 0; b < boundaryIdxs.length; b++) {
                    var bp = toCanvas(spline[boundaryIdxs[b]]);
                    ctx.beginPath();
                    ctx.arc(bp.x, bp.y, dotRadius, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 6;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            } else {
                // No sector data — draw single-colour track
                ctx.beginPath();
                var fp = toCanvas(spline[0]);
                ctx.moveTo(fp.x, fp.y);
                for (var k = 1; k < numPts; k++) {
                    var kp = toCanvas(spline[k]);
                    ctx.lineTo(kp.x, kp.y);
                }
                ctx.closePath();
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = SECTOR_COLORS[0];
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }

            // Start/finish marker
            var sf = toCanvas(spline[0]);
            ctx.beginPath();
            ctx.arc(sf.x, sf.y, Math.max(4, lineWidth * 1.4), 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;

            return hasSectors;
        },

        _drawText: function(ctx, w, h, textTop, trackName, trackLength, turns, textColor, showLegend) {
            var textH = h - textTop;
            var slots = showLegend ? 4 : 3;
            var slotH = textH / (slots + 1);

            // Track name
            var nameY = textTop + slotH;
            var nameFontSize = clamp(Math.min(w, h) * 0.06, 14, 48);
            ctx.font = '700 ' + nameFontSize + 'px "Formula1", sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(trackName, w / 2, nameY);

            // Metadata: length + turns
            var metaY = textTop + slotH * 2;
            var metaFontSize = clamp(Math.min(w, h) * 0.035, 10, 28);
            ctx.font = '500 ' + metaFontSize + 'px "Formula1", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.55)';

            var parts = [];
            if (trackLength > 0) {
                parts.push((trackLength / 1000).toFixed(3) + ' km');
            }
            if (turns !== undefined) {
                parts.push(turns + ' turns');
            }
            if (parts.length > 0) {
                ctx.fillText(parts.join('  \u00B7  '), w / 2, metaY);
            }

            // Sector legend
            if (showLegend) {
                var legendY = textTop + slotH * 3;
                var legendFontSize = clamp(Math.min(w, h) * 0.03, 9, 22);
                var swatchW = legendFontSize * 1.8;
                var swatchH = legendFontSize * 0.5;
                var itemGap = legendFontSize * 1.2;
                var labels = ['S1', 'S2', 'S3'];

                // Measure total legend width
                ctx.font = '600 ' + legendFontSize + 'px "Formula1", sans-serif';
                var totalW = 0;
                for (var i = 0; i < 3; i++) {
                    totalW += swatchW + 4 + ctx.measureText(labels[i]).width;
                    if (i < 2) totalW += itemGap;
                }

                var lx = (w - totalW) / 2;
                for (var j = 0; j < 3; j++) {
                    // Colour swatch
                    ctx.fillStyle = SECTOR_COLORS[j];
                    ctx.globalAlpha = 0.85;
                    roundedRect(ctx, lx, legendY - swatchH / 2, swatchW, swatchH, 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    // Label
                    lx += swatchW + 4;
                    ctx.font = '600 ' + legendFontSize + 'px "Formula1", sans-serif';
                    ctx.fillStyle = SECTOR_COLORS[j];
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(labels[j], lx, legendY);
                    lx += ctx.measureText(labels[j]).width + itemGap;
                }
            }

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        _drawTextOnly: function(ctx, w, h, trackName, trackLength, turns, textColor) {
            var centerY = h * 0.40;
            var metaY = h * 0.55;

            var fontSize = clamp(Math.min(w, h) * 0.08, 14, 48);
            ctx.font = '700 ' + fontSize + 'px "Formula1", sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(trackName, w / 2, centerY);

            var metaSize = clamp(Math.min(w, h) * 0.045, 10, 28);
            ctx.font = '500 ' + metaSize + 'px "Formula1", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.55)';

            var parts = [];
            if (trackLength > 0) {
                parts.push((trackLength / 1000).toFixed(3) + ' km');
            }
            if (turns !== undefined) {
                parts.push(turns + ' turns');
            }
            if (parts.length > 0) {
                ctx.fillText(parts.join('  \u00B7  '), w / 2, metaY);
            }

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

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
            var fontSize = clamp(Math.min(w, h) * 0.09, 10, 32);
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            ctx.font = '500 ' + fontSize + 'px "Formula1", sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px "Formula1", sans-serif';
            }

            // Emoji above text, full opacity
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\uD83C\uDFCE\uFE0F', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji, dimmed
            ctx.font = '500 ' + fontSize + 'px "Formula1", sans-serif';
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
