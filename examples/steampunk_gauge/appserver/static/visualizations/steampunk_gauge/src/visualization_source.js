/*
 * Steampunk Gauge — Splunk Custom Visualization
 *
 * Round brass body with an aged ivory dial face, classic pointed needle,
 * decorative bezel rivets and a value/label readout. The label text is
 * rendered on the dial below the centre hub.
 *
 * Up to three configurable zones (zone1/zone2/zone3) colour the matching
 * arc segment, tick marks, tick numbers and centre readout when the value
 * falls within their min/max range. Each zone has independent min, max and
 * colour. Empty min/max disables that zone — gauges can use 0, 1, 2 or 3
 * zones freely.
 *
 * Expected SPL columns: value (numeric), label (string).
 *   - The column names are configurable via the Value Field / Label Field
 *     formatter settings (defaults: value, label).
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper functions (pure, no `this`) ──────────────────────

    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    // Returns the first zone whose [min, max] range contains the value, or
    // null if the value falls outside every enabled zone. Zones are checked
    // in order — zone1 wins over zone2 wins over zone3 if they overlap.
    function getZoneForValue(value, zones) {
        for (var i = 0; i < zones.length; i++) {
            var z = zones[i];
            if (!z.enabled) continue;
            if (value >= z.min && value <= z.max) return z;
        }
        return null;
    }

    function valueToAngle(value, minValue, maxValue, startAngle, endAngle) {
        var totalAngle = endAngle - startAngle;
        var t = (value - minValue) / (maxValue - minValue);
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        return startAngle + totalAngle * t;
    }

    // Seeded pseudo-random for deterministic wear stains
    function seededRand(seed) {
        var s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    // djb2-style string hash → positive 31-bit integer. Used to turn the
    // panel's identity (label + a few stable config values) into a
    // unique-but-stable wear seed so two gauges on the same dashboard
    // do not share the same stains and speckles.
    function hashString(s) {
        if (!s) return 0;
        var h = 5381;
        for (var i = 0; i < s.length; i++) {
            h = ((h * 33) ^ s.charCodeAt(i)) | 0;
        }
        h = h < 0 ? -h : h;
        return h || 1;
    }

    function drawBezel(ctx, cx, cy, outerR, innerR, showRivets) {
        // Outer body — dark brown ring with brass highlights
        var bezelGrad = ctx.createRadialGradient(
            cx - outerR * 0.3, cy - outerR * 0.3, outerR * 0.2,
            cx, cy, outerR
        );
        bezelGrad.addColorStop(0.0, '#c39253');
        bezelGrad.addColorStop(0.25, '#8a5a2b');
        bezelGrad.addColorStop(0.55, '#5a3a1c');
        bezelGrad.addColorStop(0.85, '#3a2410');
        bezelGrad.addColorStop(1.0, '#231507');

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = bezelGrad;
        ctx.fill();

        // Bright highlight ring near the inner edge of the bezel
        ctx.beginPath();
        ctx.arc(cx, cy, innerR + (outerR - innerR) * 0.18, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, (outerR - innerR) * 0.06);
        ctx.strokeStyle = 'rgba(232, 188, 122, 0.55)';
        ctx.stroke();

        // Dark inner shadow ring
        ctx.beginPath();
        ctx.arc(cx, cy, innerR + 1, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, (outerR - innerR) * 0.10);
        ctx.strokeStyle = 'rgba(20, 10, 4, 0.85)';
        ctx.stroke();

        // Outer rim shadow
        ctx.beginPath();
        ctx.arc(cx, cy, outerR - 1, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.stroke();

        // Decorative brass rivets/screws
        if (showRivets) {
            var rivetRadius = (outerR - innerR) * 0.18;
            var rivetCircleR = (outerR + innerR) * 0.5;
            var n = 8;
            for (var i = 0; i < n; i++) {
                var a = (i / n) * Math.PI * 2 - Math.PI / 2;
                var rx = cx + Math.cos(a) * rivetCircleR;
                var ry = cy + Math.sin(a) * rivetCircleR;

                // Rivet body
                var rg = ctx.createRadialGradient(
                    rx - rivetRadius * 0.4, ry - rivetRadius * 0.4, rivetRadius * 0.1,
                    rx, ry, rivetRadius
                );
                rg.addColorStop(0, '#e8c478');
                rg.addColorStop(0.5, '#a87a3a');
                rg.addColorStop(1, '#3a2410');
                ctx.beginPath();
                ctx.arc(rx, ry, rivetRadius, 0, Math.PI * 2);
                ctx.fillStyle = rg;
                ctx.fill();

                // Slot in the screw head
                ctx.beginPath();
                ctx.moveTo(rx - rivetRadius * 0.6, ry);
                ctx.lineTo(rx + rivetRadius * 0.6, ry);
                ctx.lineWidth = Math.max(1, rivetRadius * 0.18);
                ctx.strokeStyle = 'rgba(30, 18, 8, 0.85)';
                ctx.lineCap = 'round';
                ctx.stroke();
                ctx.lineCap = 'butt';
            }
        }
    }

    function drawDialFace(ctx, cx, cy, r, showWear, wearSeed) {
        // Base ivory cream colour with subtle radial darkening at the edges
        var faceGrad = ctx.createRadialGradient(
            cx - r * 0.25, cy - r * 0.3, r * 0.1,
            cx, cy, r
        );
        faceGrad.addColorStop(0, '#f1e6c9');
        faceGrad.addColorStop(0.55, '#e3d2a8');
        faceGrad.addColorStop(0.9, '#b89a6a');
        faceGrad.addColorStop(1, '#8c7148');

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = faceGrad;
        ctx.fill();

        if (!showWear) return;

        // Deterministic wear stains so the look is stable between renders.
        // Seed is panel-specific (see _draw) so each gauge has its own
        // unique pattern of stains and speckles.
        var rand = seededRand(wearSeed || 1337);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
        ctx.clip();

        // Brownish blotches
        var stainCount = 18;
        for (var i = 0; i < stainCount; i++) {
            var angle = rand() * Math.PI * 2;
            var dist = rand() * r * 0.95;
            var sx = cx + Math.cos(angle) * dist;
            var sy = cy + Math.sin(angle) * dist;
            var stainR = r * (0.04 + rand() * 0.12);
            var alpha = 0.04 + rand() * 0.10;

            var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, stainR);
            sg.addColorStop(0, 'rgba(80, 45, 18, ' + alpha + ')');
            sg.addColorStop(1, 'rgba(80, 45, 18, 0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(sx, sy, stainR, 0, Math.PI * 2);
            ctx.fill();
        }

        // A few small dark speckles
        var speckCount = 32;
        for (var j = 0; j < speckCount; j++) {
            var sa = rand() * Math.PI * 2;
            var sd = rand() * r * 0.93;
            var px = cx + Math.cos(sa) * sd;
            var py = cy + Math.sin(sa) * sd;
            ctx.fillStyle = 'rgba(60, 35, 15, ' + (0.10 + rand() * 0.18) + ')';
            ctx.beginPath();
            ctx.arc(px, py, 0.4 + rand() * 1.1, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Format a tick label so it stays readable across very different
    // scales (0–1, 0–100, 0–4000, …) without exploding the digit count.
    function formatTick(val, step) {
        var absStep = Math.abs(step);
        var absVal = Math.abs(val);
        if (absVal >= 10000) {
            // Compact form: 12500 → "12k", 40000 → "40k"
            return Math.round(val / 1000) + 'k';
        }
        if (absStep >= 1 || absVal >= 100) {
            return String(Math.round(val));
        }
        if (absStep >= 0.1) return val.toFixed(1);
        return val.toFixed(2);
    }

    function drawTicksAndArc(ctx, cx, cy, r, startAngle, endAngle, zones, minValue, maxValue) {
        var defaultInk = '#2a1a08';
        var defaultMinorInk = 'rgba(42, 26, 8, 0.85)';

        // Coloured arc segments per enabled zone, drawn first so tick marks
        // sit on top of them. Each zone is clipped to the gauge's value range.
        for (var z = 0; z < zones.length; z++) {
            var zone = zones[z];
            if (!zone.enabled) continue;
            var lo = Math.max(zone.min, minValue);
            var hi = Math.min(zone.max, maxValue);
            if (hi <= lo) continue;
            var a0 = valueToAngle(lo, minValue, maxValue, startAngle, endAngle);
            var a1 = valueToAngle(hi, minValue, maxValue, startAngle, endAngle);
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.82, a0, a1);
            ctx.lineWidth = Math.max(2, r * 0.05);
            ctx.strokeStyle = zone.color;
            ctx.lineCap = 'butt';
            ctx.stroke();
        }

        // Outer guide arc (thin)
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.82, startAngle, endAngle);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(60, 35, 15, 0.85)';
        ctx.stroke();

        // Major and minor tick marks
        var majorCount = 10;
        var minorPerMajor = 5;
        var totalAngle = endAngle - startAngle;
        var valueRange = maxValue - minValue;
        var majorStep = valueRange / majorCount;

        for (var i = 0; i <= majorCount; i++) {
            var t = i / majorCount;
            var a = startAngle + totalAngle * t;
            var inMajor = r * 0.70;
            var outMajor = r * 0.86;

            var tickValue = minValue + valueRange * t;
            var majorZone = getZoneForValue(tickValue, zones);
            var majorColor = majorZone ? majorZone.color : defaultInk;

            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * inMajor, cy + Math.sin(a) * inMajor);
            ctx.lineTo(cx + Math.cos(a) * outMajor, cy + Math.sin(a) * outMajor);
            ctx.lineWidth = Math.max(1.5, r * 0.025);
            ctx.strokeStyle = majorColor;
            ctx.lineCap = 'butt';
            ctx.stroke();

            // Tick number labels — scaled to the configured min/max range
            var labelR = r * 0.58;
            var lx = cx + Math.cos(a) * labelR;
            var ly = cy + Math.sin(a) * labelR;
            var fontPx = Math.max(8, r * 0.10);
            ctx.font = 'bold ' + fontPx + 'px sans-serif';
            ctx.fillStyle = majorColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatTick(tickValue, majorStep), lx, ly);

            // Minor ticks between this major and the next
            if (i < majorCount) {
                for (var m = 1; m < minorPerMajor; m++) {
                    var ma = a + (totalAngle / majorCount) * (m / minorPerMajor);
                    var minorValue = tickValue + majorStep * (m / minorPerMajor);
                    var minorZone = getZoneForValue(minorValue, zones);
                    var minorColor = minorZone ? minorZone.color : defaultMinorInk;
                    var inMinor = r * 0.74;
                    var outMinor = r * 0.82;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(ma) * inMinor, cy + Math.sin(ma) * inMinor);
                    ctx.lineTo(cx + Math.cos(ma) * outMinor, cy + Math.sin(ma) * outMinor);
                    ctx.lineWidth = Math.max(0.75, r * 0.012);
                    ctx.strokeStyle = minorColor;
                    ctx.stroke();
                }
            }
        }
    }

    function drawNeedle(ctx, cx, cy, r, angle) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        var len = r * 0.78;
        var tailLen = r * 0.18;
        var baseW = Math.max(3, r * 0.07);

        // Soft shadow under the needle
        ctx.beginPath();
        ctx.moveTo(0, baseW * 0.6);
        ctx.lineTo(len, 1.5);
        ctx.lineTo(len, -1.5);
        ctx.lineTo(0, -baseW * 0.6);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.translate(2, 2);
        ctx.fill();
        ctx.translate(-2, -2);

        // Pointer (tip)
        var ng = ctx.createLinearGradient(0, 0, len, 0);
        ng.addColorStop(0, '#5e1410');
        ng.addColorStop(0.5, '#a8221a');
        ng.addColorStop(1, '#3a0a08');
        ctx.beginPath();
        ctx.moveTo(0, baseW * 0.5);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, -baseW * 0.5);
        ctx.closePath();
        ctx.fillStyle = ng;
        ctx.fill();
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = 'rgba(20, 4, 2, 0.7)';
        ctx.stroke();

        // Tail (counterweight)
        ctx.beginPath();
        ctx.moveTo(0, baseW * 0.55);
        ctx.lineTo(-tailLen, 0);
        ctx.lineTo(0, -baseW * 0.55);
        ctx.closePath();
        ctx.fillStyle = '#2a1408';
        ctx.fill();
        ctx.strokeStyle = 'rgba(20, 4, 2, 0.8)';
        ctx.stroke();

        ctx.restore();
    }

    function drawHub(ctx, cx, cy, r) {
        var hubR = Math.max(4, r * 0.09);
        var hg = ctx.createRadialGradient(
            cx - hubR * 0.35, cy - hubR * 0.35, hubR * 0.1,
            cx, cy, hubR
        );
        hg.addColorStop(0, '#f1d089');
        hg.addColorStop(0.55, '#a07535');
        hg.addColorStop(1, '#2a1a08');

        ctx.beginPath();
        ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
        ctx.fillStyle = hg;
        ctx.fill();

        // Cross slot to suggest a brass screw
        ctx.beginPath();
        ctx.moveTo(cx - hubR * 0.55, cy);
        ctx.lineTo(cx + hubR * 0.55, cy);
        ctx.moveTo(cx, cy - hubR * 0.55);
        ctx.lineTo(cx, cy + hubR * 0.55);
        ctx.lineWidth = Math.max(1, hubR * 0.18);
        ctx.strokeStyle = 'rgba(20, 12, 4, 0.85)';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    function drawCenterText(ctx, cx, cy, r, valueText, unit, label, readoutColor, showReadout) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showReadout) {
            // Digital readout — value (and optional unit suffix) between the
            // hub and the label.
            var valY = cy + r * 0.30;
            var valFont = Math.max(10, r * 0.20);
            ctx.font = 'bold ' + valFont + 'px monospace';
            ctx.fillStyle = readoutColor;
            ctx.fillText(valueText + (unit ? ' ' + unit : ''), cx, valY);
        } else if (unit) {
            // Authentic dial inscription — only the unit text, smaller and
            // rendered in the default dial ink regardless of the active zone.
            var unitY = cy + r * 0.32;
            var unitFont = Math.max(8, r * 0.13);
            ctx.font = 'bold ' + unitFont + 'px sans-serif';
            ctx.fillStyle = 'rgba(42, 26, 8, 0.85)';
            ctx.fillText(unit, cx, unitY);
        }

        // Label sits below the readout/unit, still on the dial face
        if (label) {
            var labelY = cy + r * 0.55;
            var labelFont = Math.max(8, r * 0.13);
            ctx.font = 'bold ' + labelFont + 'px sans-serif';

            // Auto-shrink the label so it never spills off the dial
            var maxW = r * 1.30;
            while (ctx.measureText(label).width > maxW && labelFont > 6) {
                labelFont -= 1;
                ctx.font = 'bold ' + labelFont + 'px sans-serif';
            }

            ctx.fillStyle = 'rgba(42, 26, 8, 0.85)';
            ctx.fillText(label, cx, labelY);
        }

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('steampunk-gauge-viz');

            // Version marker — visible in the browser console to help
            // verify which build is active after an app upgrade. Splunk
            // caches static assets aggressively; if you see an older
            // version logged here, hit /en-US/_bump and hard-refresh.
            if (typeof console !== 'undefined' && console.info) {
                console.info('[steampunk_gauge v1.3.2] initialized');
            }

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            // Internal state
            this._lastGoodData = null;
            this._target = 0;          // most recent value from data
            this._current = 0;         // currently-displayed (tweened) value
            this._lastFrameTs = 0;     // for frame-rate-independent easing
            this._animFrame = null;
            this._idleFrames = 0;
            this._firstSample = true;  // snap on the very first sample
            this._lastConfig = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 50  // single-value viz — only need the latest row
            };
        },

        formatData: function(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                // Return a truthy sentinel so updateView is still called
                // and can render the empty shell. Throwing
                // VisualizationError here would surface as an unhandled
                // promise rejection in the browser console and would
                // replace our shell with Dashboard Studio's default
                // overlay.
                return { _empty: true };
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Status fallback via SPL appendpipe (see rule 27)
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            var row = data.rows[data.rows.length - 1];

            var result = { colIdx: colIdx, row: row };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            this._lastConfig = config;

            // Dashboard Studio can call updateView with no data while a
            // scheduled data-source refresh is in flight, and can also
            // re-mount the panel — which gives us a fresh viz instance
            // with no cached payload. formatData may also return the
            // _empty sentinel on first load (no data seen yet). In all
            // these cases, prefer the last good payload to maintain
            // visual continuity; otherwise fall through to _draw() so
            // the bezel/dial/ticks render and the panel is never blank.
            if (!data || data._empty) {
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    this._draw();
                    return;
                }
            }

            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var valueFieldName = config[ns + 'valueField'] || 'value';
            var labelFieldName = config[ns + 'labelField'] || 'label';

            // Extract value
            var rawVal = 0;
            if (data.colIdx && data.colIdx[valueFieldName] !== undefined && data.row) {
                var v = parseFloat(data.row[data.colIdx[valueFieldName]]);
                if (!isNaN(v)) rawVal = v;
            }

            // Extract label (string)
            var labelStr = '';
            if (data.colIdx && data.colIdx[labelFieldName] !== undefined && data.row) {
                var raw = data.row[data.colIdx[labelFieldName]];
                if (raw !== null && raw !== undefined) {
                    labelStr = String(raw);
                }
            }
            this._labelStr = labelStr;

            // Update tween target and (on the first sample) snap current
            this._target = rawVal;
            if (this._firstSample) {
                this._current = rawVal;
                this._firstSample = false;
            }

            // Kick off the animation loop only when there is a value to
            // close toward; if smoothing is disabled or the target equals
            // the current displayed value, just draw once. Without this
            // guard the rAF loop runs for ~6 idle frames after every
            // updateView even when the data is unchanged, causing a brief
            // burst of full redraws on every scheduled refresh.
            var smoothness = parseFloat(config[ns + 'smoothness']);
            if (isNaN(smoothness) || smoothness <= 0) {
                this._current = this._target;
                this._stopAnim();
                this._draw();
            } else if (Math.abs(this._target - this._current) <= 1e-3) {
                this._draw();
            } else {
                this._draw();
                this._startAnim();
            }
        },

        _startAnim: function() {
            if (this._animFrame !== null) return;
            var self = this;
            this._lastFrameTs = 0;
            var step = function(ts) {
                if (!self._lastFrameTs) self._lastFrameTs = ts;
                var dt = (ts - self._lastFrameTs) / 1000;
                self._lastFrameTs = ts;
                if (dt < 0) dt = 0;
                if (dt > 0.25) dt = 0.25; // avoid huge jumps on tab switch

                var cfg = self._lastConfig || {};
                var ns = self.getPropertyNamespaceInfo().propertyNamespace;
                var smoothness = parseFloat(cfg[ns + 'smoothness']);
                if (isNaN(smoothness) || smoothness <= 0) smoothness = 8;

                var diff = self._target - self._current;
                var factor = 1 - Math.exp(-smoothness * dt);
                self._current += diff * factor;

                self._draw();

                if (Math.abs(diff) < 1e-3) {
                    self._idleFrames++;
                    if (self._idleFrames > 6) {
                        self._current = self._target;
                        self._stopAnim();
                        return;
                    }
                } else {
                    self._idleFrames = 0;
                }
                self._animFrame = window.requestAnimationFrame(step);
            };
            this._animFrame = window.requestAnimationFrame(step);
        },

        _stopAnim: function() {
            if (this._animFrame !== null) {
                window.cancelAnimationFrame(this._animFrame);
                this._animFrame = null;
            }
            this._lastFrameTs = 0;
            this._idleFrames = 0;
        },

        _draw: function() {
            var config = this._lastConfig || {};
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;

            // Reattach the canvas if a parent re-render (e.g. Dashboard
            // Studio refreshing the panel) replaced this.el's children
            // and left our canvas orphaned. Without this, drawing would
            // target a detached element and the panel would stay blank.
            if (!this.canvas || this.canvas.parentNode !== this.el) {
                if (this.canvas && this.canvas.parentNode) {
                    this.canvas.parentNode.removeChild(this.canvas);
                }
                this.canvas = document.createElement('canvas');
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.style.display = 'block';
                this.el.appendChild(this.canvas);
            }

            var minValue = parseFloat(config[ns + 'minValue']);
            if (isNaN(minValue)) minValue = 0;
            var maxValue = parseFloat(config[ns + 'maxValue']);
            if (isNaN(maxValue) || maxValue <= minValue) maxValue = minValue + 100;

            var unit = config[ns + 'unit'];
            if (unit === undefined || unit === null) unit = '';
            unit = String(unit);

            var decimals = parseInt(config[ns + 'decimals'], 10);
            if (isNaN(decimals) || decimals < 0) decimals = 0;
            if (decimals > 6) decimals = 6;

            // Parse three optional zones. Each zone is enabled only when min
            // and max are both numeric and max > min. Empty min/max disables
            // the zone entirely so the user can use 1, 2, or 3 zones freely.
            function parseZone(num, fallbackColor) {
                var minRaw = config[ns + 'zone' + num + 'min'];
                var maxRaw = config[ns + 'zone' + num + 'max'];
                var color = config[ns + 'zone' + num + 'color'];
                if (color === undefined || color === null || color === '') {
                    color = fallbackColor;
                }
                var zMin = parseFloat(minRaw);
                var zMax = parseFloat(maxRaw);
                var enabled = !isNaN(zMin) && !isNaN(zMax) && zMax > zMin;
                return { enabled: enabled, min: zMin, max: zMax, color: String(color) };
            }
            var zones = [
                parseZone(1, '#a52319'),
                parseZone(2, '#2e7d32'),
                parseZone(3, '#a52319')
            ];

            var showRivets = config[ns + 'showRivets'];
            showRivets = (showRivets === undefined) ? true : (String(showRivets) === 'true');

            var showWear = config[ns + 'showWear'];
            showWear = (showWear === undefined) ? true : (String(showWear) === 'true');

            var showReadout = config[ns + 'showReadout'];
            showReadout = (showReadout === undefined) ? true : (String(showReadout) === 'true');

            // ── Size canvas for HiDPI ──
            //
            // Assigning canvas.width / canvas.height resets the bitmap
            // unconditionally — even when the values are unchanged. That
            // implicit clear can surface as a one-frame flash on every
            // scheduled refresh, even when the dimensions did not change.
            // Resize only when the pixel size actually differs, and use
            // setTransform on every draw to (re-)establish the dpr scale
            // (which the canvas reset would otherwise have wiped).
            var rect = this.el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            var newW = Math.floor(rect.width * dpr);
            var newH = Math.floor(rect.height * dpr);
            if (this.canvas.width !== newW || this.canvas.height !== newH) {
                this.canvas.width = newW;
                this.canvas.height = newH;
            }
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // ── Layout ──
            var pad = Math.max(6, Math.min(w, h) * 0.04);
            var outerR = Math.min(w, h) / 2 - pad;
            if (outerR < 24) return;
            var cx = w / 2;
            var cy = h / 2;
            var bezelWidth = outerR * 0.14;
            var innerR = outerR - bezelWidth;

            // ── Per-panel wear seed ──
            // Derive a stable but unique seed from CONFIG-only inputs.
            // We deliberately avoid using this._labelStr here because
            // it is unavailable during the empty-shell phase (first
            // updateView after a panel re-mount, before any data has
            // arrived). If the seed depended on the label, the wear
            // pattern would visibly shift between the shell frame and
            // the first data frame — a visible refresh artifact. By
            // hashing only formatter settings, the pattern is stable
            // from the very first frame onward.
            var wearSeed = hashString(
                (config[ns + 'unit'] || '') + '|' +
                (config[ns + 'valueField'] || '') + '|' +
                (config[ns + 'labelField'] || '') + '|' +
                (config[ns + 'minValue'] || '') + '|' +
                (config[ns + 'maxValue'] || '') + '|' +
                (config[ns + 'zone1min'] || '') + '|' +
                (config[ns + 'zone1max'] || '') + '|' +
                (config[ns + 'zone2min'] || '') + '|' +
                (config[ns + 'zone2max'] || '') + '|' +
                (config[ns + 'zone3min'] || '') + '|' +
                (config[ns + 'zone3max'] || '')
            ) || 1337;

            // ── Bezel and rivets ──
            drawBezel(ctx, cx, cy, outerR, innerR, showRivets);

            // ── Ivory dial ──
            drawDialFace(ctx, cx, cy, innerR, showWear, wearSeed);

            // ── Ticks and zone arcs ──
            var startAngle = Math.PI * 0.75;          // 135° (lower-left)
            var endAngle = Math.PI * 2.25;            // 405° (lower-right) — 270° sweep
            var totalAngle = endAngle - startAngle;
            drawTicksAndArc(ctx, cx, cy, innerR, startAngle, endAngle, zones, minValue, maxValue);

            // ── Value, label, needle ──
            var displayVal = this._current;
            var pct = (displayVal - minValue) / (maxValue - minValue);
            pct = clamp(pct, 0, 1);
            var needleAngle = startAngle + totalAngle * pct;
            // Readout colour follows the zone the current value falls into.
            var currentZone = getZoneForValue(displayVal, zones);
            var readoutColor = currentZone ? currentZone.color : '#2a1a08';

            // Sanitise label for DOM-style insertion safety even though we
            // only draw to canvas. escapeHtml strips control characters.
            var safeLabel = this._labelStr || '';
            if (SplunkVisualizationUtils && SplunkVisualizationUtils.escapeHtml) {
                // Canvas does not interpret HTML, but escapeHtml normalises
                // any unexpected angle brackets / quotes from search results.
                safeLabel = SplunkVisualizationUtils.escapeHtml(safeLabel);
            }

            var valueText = displayVal.toFixed(decimals);
            drawCenterText(ctx, cx, cy, innerR, valueText, unit, safeLabel, readoutColor, showReadout);

            drawNeedle(ctx, cx, cy, innerR, needleAngle);
            drawHub(ctx, cx, cy, innerR);

            // ── Subtle glass reflection across the upper half ──
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, innerR - 1, 0, Math.PI * 2);
            ctx.clip();
            var glassGrad = ctx.createLinearGradient(cx, cy - innerR, cx, cy);
            glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
            glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = glassGrad;
            ctx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR);
            ctx.restore();
        },

        // ── Custom no-data message support (see rule 27) ──

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
            ctx.fillText('\u2699', w / 2, h / 2 - fontSize * 0.5 - gap);

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
            this._stopAnim();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
