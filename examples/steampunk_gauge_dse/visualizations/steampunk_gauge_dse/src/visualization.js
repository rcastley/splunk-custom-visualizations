/*
 * Steampunk Gauge (10.4+) — Splunk Dashboard Studio custom visualization.
 *
 * Same visual design as the legacy `steampunk_gauge` app but built on the
 * Splunk 10.4+ Dashboard Studio Extension framework
 * (`@splunk/dashboard-studio-extension`). The viz runs in an iframe that
 * Dashboard Studio injects into the dashboard, and receives state via
 * VisualizationAPI listeners — `loading`, `dataSources`, `options`,
 * `dimensions`. Because we are explicitly told when a data-source
 * refresh is in flight, we keep the previous frame on screen during the
 * loading window instead of repainting an empty shell. That removes the
 * visible repaint that the classic (legacy_visualization) viz exhibits
 * on scheduled refreshes in Splunk 10.4.
 *
 * Expected data: a single search returning numeric `value` and string
 * `label` columns (column names are configurable). Up to three optional
 * zones colour the matching arc, ticks, and centre readout.
 */
import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import './visualization.css';

// ── Pure helpers ───────────────────────────────────────────────────────

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

function getZoneForValue(value, zones) {
    for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (!z.enabled) continue;
        if (value >= z.min && value <= z.max) return z;
    }
    return null;
}

function valueToAngle(value, minValue, maxValue, startAngle, endAngle) {
    const totalAngle = endAngle - startAngle;
    let t = (value - minValue) / (maxValue - minValue);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return startAngle + totalAngle * t;
}

function seededRand(seed) {
    let s = seed;
    return function () {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

// djb2-style hash → positive 31-bit integer; used to derive a stable per-
// panel wear seed from config so two gauges on the same dashboard do not
// share identical stains and speckles.
function hashString(s) {
    if (!s) return 0;
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h * 33) ^ s.charCodeAt(i)) | 0;
    }
    h = h < 0 ? -h : h;
    return h || 1;
}

function formatTick(val, step) {
    const absStep = Math.abs(step);
    const absVal = Math.abs(val);
    if (absVal >= 10000) return Math.round(val / 1000) + 'k';
    if (absStep >= 1 || absVal >= 100) return String(Math.round(val));
    if (absStep >= 0.1) return val.toFixed(1);
    return val.toFixed(2);
}

function escapeForText(text) {
    // Canvas does not interpret HTML, but normalize control characters and
    // strip anything that could surface in a copy/paste or accessibility tree.
    if (text == null) return '';
    return String(text).replace(/[\u0000-\u001F\u007F]/g, '');
}

// ── Drawing primitives (ported verbatim from the legacy viz) ───────────

function drawBezel(ctx, cx, cy, outerR, innerR, showRivets) {
    const bezelGrad = ctx.createRadialGradient(
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

    ctx.beginPath();
    ctx.arc(cx, cy, innerR + (outerR - innerR) * 0.18, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, (outerR - innerR) * 0.06);
    ctx.strokeStyle = 'rgba(232, 188, 122, 0.55)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, innerR + 1, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, (outerR - innerR) * 0.10);
    ctx.strokeStyle = 'rgba(20, 10, 4, 0.85)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.stroke();

    if (showRivets) {
        const rivetRadius = (outerR - innerR) * 0.18;
        const rivetCircleR = (outerR + innerR) * 0.5;
        const n = 8;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2;
            const rx = cx + Math.cos(a) * rivetCircleR;
            const ry = cy + Math.sin(a) * rivetCircleR;

            const rg = ctx.createRadialGradient(
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
    const faceGrad = ctx.createRadialGradient(
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

    const rand = seededRand(wearSeed || 1337);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.clip();

    const stainCount = 18;
    for (let i = 0; i < stainCount; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = rand() * r * 0.95;
        const sx = cx + Math.cos(angle) * dist;
        const sy = cy + Math.sin(angle) * dist;
        const stainR = r * (0.04 + rand() * 0.12);
        const alpha = 0.04 + rand() * 0.10;

        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, stainR);
        sg.addColorStop(0, 'rgba(80, 45, 18, ' + alpha + ')');
        sg.addColorStop(1, 'rgba(80, 45, 18, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(sx, sy, stainR, 0, Math.PI * 2);
        ctx.fill();
    }

    const speckCount = 32;
    for (let j = 0; j < speckCount; j++) {
        const sa = rand() * Math.PI * 2;
        const sd = rand() * r * 0.93;
        const px = cx + Math.cos(sa) * sd;
        const py = cy + Math.sin(sa) * sd;
        ctx.fillStyle = 'rgba(60, 35, 15, ' + (0.10 + rand() * 0.18) + ')';
        ctx.beginPath();
        ctx.arc(px, py, 0.4 + rand() * 1.1, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawTicksAndArc(ctx, cx, cy, r, startAngle, endAngle, zones, minValue, maxValue) {
    const defaultInk = '#2a1a08';
    const defaultMinorInk = 'rgba(42, 26, 8, 0.85)';

    for (let z = 0; z < zones.length; z++) {
        const zone = zones[z];
        if (!zone.enabled) continue;
        const lo = Math.max(zone.min, minValue);
        const hi = Math.min(zone.max, maxValue);
        if (hi <= lo) continue;
        const a0 = valueToAngle(lo, minValue, maxValue, startAngle, endAngle);
        const a1 = valueToAngle(hi, minValue, maxValue, startAngle, endAngle);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.82, a0, a1);
        ctx.lineWidth = Math.max(2, r * 0.05);
        ctx.strokeStyle = zone.color;
        ctx.lineCap = 'butt';
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, startAngle, endAngle);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(60, 35, 15, 0.85)';
    ctx.stroke();

    const majorCount = 10;
    const minorPerMajor = 5;
    const totalAngle = endAngle - startAngle;
    const valueRange = maxValue - minValue;
    const majorStep = valueRange / majorCount;

    for (let i = 0; i <= majorCount; i++) {
        const t = i / majorCount;
        const a = startAngle + totalAngle * t;
        const inMajor = r * 0.70;
        const outMajor = r * 0.86;

        const tickValue = minValue + valueRange * t;
        const majorZone = getZoneForValue(tickValue, zones);
        const majorColor = majorZone ? majorZone.color : defaultInk;

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inMajor, cy + Math.sin(a) * inMajor);
        ctx.lineTo(cx + Math.cos(a) * outMajor, cy + Math.sin(a) * outMajor);
        ctx.lineWidth = Math.max(1.5, r * 0.025);
        ctx.strokeStyle = majorColor;
        ctx.lineCap = 'butt';
        ctx.stroke();

        const labelR = r * 0.58;
        const lx = cx + Math.cos(a) * labelR;
        const ly = cy + Math.sin(a) * labelR;
        const fontPx = Math.max(8, r * 0.10);
        ctx.font = 'bold ' + fontPx + 'px sans-serif';
        ctx.fillStyle = majorColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatTick(tickValue, majorStep), lx, ly);

        if (i < majorCount) {
            for (let m = 1; m < minorPerMajor; m++) {
                const ma = a + (totalAngle / majorCount) * (m / minorPerMajor);
                const minorValue = tickValue + majorStep * (m / minorPerMajor);
                const minorZone = getZoneForValue(minorValue, zones);
                const minorColor = minorZone ? minorZone.color : defaultMinorInk;
                const inMinor = r * 0.74;
                const outMinor = r * 0.82;
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

    const len = r * 0.78;
    const tailLen = r * 0.18;
    const baseW = Math.max(3, r * 0.07);

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

    const ng = ctx.createLinearGradient(0, 0, len, 0);
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
    const hubR = Math.max(4, r * 0.09);
    const hg = ctx.createRadialGradient(
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
        const valY = cy + r * 0.30;
        const valFont = Math.max(10, r * 0.20);
        ctx.font = 'bold ' + valFont + 'px monospace';
        ctx.fillStyle = readoutColor;
        ctx.fillText(valueText + (unit ? ' ' + unit : ''), cx, valY);
    } else if (unit) {
        const unitY = cy + r * 0.32;
        const unitFont = Math.max(8, r * 0.13);
        ctx.font = 'bold ' + unitFont + 'px sans-serif';
        ctx.fillStyle = 'rgba(42, 26, 8, 0.85)';
        ctx.fillText(unit, cx, unitY);
    }

    if (label) {
        const labelY = cy + r * 0.55;
        let labelFont = Math.max(8, r * 0.13);
        ctx.font = 'bold ' + labelFont + 'px sans-serif';

        const maxW = r * 1.30;
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

// ── DOM setup ──────────────────────────────────────────────────────────

const root = document.getElementById('root') || document.body;
root.classList.add('steampunk-gauge-viz');

const canvas = document.createElement('canvas');
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.display = 'block';
root.appendChild(canvas);

if (typeof console !== 'undefined' && console.info) {
    console.info('[steampunk_gauge_dse v1.0.0] initialized');
}

// ── State (module-scope; persists across listener invocations because
// the iframe host keeps a single execution context for the viz) ────────

const state = {
    loading: false,
    rawData: null,          // last good { fields, columns } payload, post-load
    parsed: null,           // { value, label } parsed from rawData
    statusMsg: null,        // string, set when SPL emits a _status row
    options: {},            // last known options (from addOptionsListener)
    width: 0,
    height: 0,
    target: 0,              // value the needle is easing toward
    current: 0,             // currently-rendered value
    firstSample: true,      // snap on the very first data sample
    animFrame: null,
    lastFrameTs: 0,
    idleFrames: 0,
};

// ── Parse column-major data into a single { value, label } sample ──────
//
// Dashboard Studio passes data as { fields, columns } where columns is an
// array of string arrays, one per field. For a single-value gauge we want
// the last row's value/label. The _status field is the no-data SPL
// fallback (see legacy formatData) — if present and non-empty, surface
// it as a status message instead of a value.
function parseData(data, options) {
    if (!data || !data.fields || !data.columns) return null;
    const valueField = (options.valueField || 'value');
    const labelField = (options.labelField || 'label');

    const fieldIdx = {};
    for (let i = 0; i < data.fields.length; i++) {
        const f = data.fields[i];
        const name = f && f.name ? f.name : f;
        fieldIdx[name] = i;
    }

    if (fieldIdx._status !== undefined) {
        const col = data.columns[fieldIdx._status];
        if (col && col.length > 0) {
            const status = col[col.length - 1];
            if (status) return { status: String(status) };
        }
    }

    const vIdx = fieldIdx[valueField];
    if (vIdx === undefined) return null;
    const vCol = data.columns[vIdx];
    if (!vCol || vCol.length === 0) return null;
    const last = vCol.length - 1;
    const value = parseFloat(vCol[last]);
    if (isNaN(value)) return null;

    let label = '';
    const lIdx = fieldIdx[labelField];
    if (lIdx !== undefined) {
        const lCol = data.columns[lIdx];
        if (lCol && lCol[last] != null) label = String(lCol[last]);
    }

    return { value, label };
}

// ── Canvas sizing (HiDPI-aware, only resize when dimensions actually
// change so the bitmap is not implicitly cleared on every refresh) ─────

function sizeCanvas(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.max(1, Math.floor(w * dpr));
    const targetH = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
}

// ── Main draw ──────────────────────────────────────────────────────────

function getOpt(name, fallback) {
    const v = state.options[name];
    return v === undefined || v === null ? fallback : v;
}

function asBool(v, fallback) {
    if (v === undefined || v === null) return fallback;
    if (typeof v === 'boolean') return v;
    return String(v) === 'true';
}

function asNum(v, fallback) {
    const n = parseFloat(v);
    return isNaN(n) ? fallback : n;
}

function draw() {
    if (state.statusMsg) {
        drawStatusMessage(state.statusMsg);
        return;
    }

    const w = state.width;
    const h = state.height;
    if (w <= 0 || h <= 0) return;

    sizeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // ── Layout ──
    const pad = Math.max(6, Math.min(w, h) * 0.04);
    const outerR = Math.min(w, h) / 2 - pad;
    if (outerR < 24) return;
    const cx = w / 2;
    const cy = h / 2;
    const bezelWidth = outerR * 0.14;
    const innerR = outerR - bezelWidth;

    // ── Resolved options ──
    const minValue = asNum(state.options.minValue, 0);
    let maxValue = asNum(state.options.maxValue, 100);
    if (maxValue <= minValue) maxValue = minValue + 100;
    const unit = String(getOpt('unit', ''));
    let decimals = asNum(state.options.decimals, 0);
    decimals = decimals < 0 ? 0 : (decimals > 6 ? 6 : Math.floor(decimals));
    const showReadout = asBool(state.options.showReadout, true);
    const showRivets = asBool(state.options.showRivets, true);
    const showWear = asBool(state.options.showWear, true);

    // ── Zones ──
    function parseZone(num, fallbackColor) {
        const minRaw = state.options['zone' + num + 'min'];
        const maxRaw = state.options['zone' + num + 'max'];
        let color = state.options['zone' + num + 'color'];
        if (color === undefined || color === null || color === '') color = fallbackColor;
        const zMin = parseFloat(minRaw);
        const zMax = parseFloat(maxRaw);
        const enabled = !isNaN(zMin) && !isNaN(zMax) && zMax > zMin;
        return { enabled, min: zMin, max: zMax, color: String(color) };
    }
    const zones = [
        parseZone(1, '#a52319'),
        parseZone(2, '#2e7d32'),
        parseZone(3, '#a52319'),
    ];

    // ── Per-panel wear seed (config-only inputs) ──
    const wearSeed = hashString(
        unit + '|' +
        (state.options.valueField || '') + '|' +
        (state.options.labelField || '') + '|' +
        minValue + '|' + maxValue + '|' +
        (state.options.zone1min || '') + '|' + (state.options.zone1max || '') + '|' +
        (state.options.zone2min || '') + '|' + (state.options.zone2max || '') + '|' +
        (state.options.zone3min || '') + '|' + (state.options.zone3max || '')
    ) || 1337;

    drawBezel(ctx, cx, cy, outerR, innerR, showRivets);
    drawDialFace(ctx, cx, cy, innerR, showWear, wearSeed);

    const startAngle = Math.PI * 0.75;   // 135° (lower-left)
    const endAngle = Math.PI * 2.25;     // 405° (lower-right) — 270° sweep
    const totalAngle = endAngle - startAngle;
    drawTicksAndArc(ctx, cx, cy, innerR, startAngle, endAngle, zones, minValue, maxValue);

    const displayVal = state.current;
    const pct = clamp((displayVal - minValue) / (maxValue - minValue), 0, 1);
    const needleAngle = startAngle + totalAngle * pct;
    const currentZone = getZoneForValue(displayVal, zones);
    const readoutColor = currentZone ? currentZone.color : '#2a1a08';

    const safeLabel = escapeForText(state.parsed ? state.parsed.label : '');
    const valueText = displayVal.toFixed(decimals);
    drawCenterText(ctx, cx, cy, innerR, valueText, unit, safeLabel, readoutColor, showReadout);

    drawNeedle(ctx, cx, cy, innerR, needleAngle);
    drawHub(ctx, cx, cy, innerR);

    // Subtle glass reflection across the upper half
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, innerR - 1, 0, Math.PI * 2);
    ctx.clip();
    const glassGrad = ctx.createLinearGradient(cx, cy - innerR, cx, cy);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR);
    ctx.restore();
}

function drawStatusMessage(message) {
    const w = state.width;
    const h = state.height;
    if (w <= 0 || h <= 0) return;
    sizeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const maxTextW = w * 0.85;
    let fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
    let emojiSize = Math.round(fontSize * 1.6);
    const gap = fontSize * 0.5;

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
}

// ── Animation (frame-rate-independent easing, only runs when target
// actually differs from current — avoids the 6-frame idle burst that
// the legacy viz had on every scheduled refresh) ───────────────────────

function startAnim() {
    if (state.animFrame !== null) return;
    state.lastFrameTs = 0;
    const step = function (ts) {
        if (!state.lastFrameTs) state.lastFrameTs = ts;
        let dt = (ts - state.lastFrameTs) / 1000;
        state.lastFrameTs = ts;
        if (dt < 0) dt = 0;
        if (dt > 0.25) dt = 0.25; // avoid huge jumps on tab switch

        let smoothness = asNum(state.options.smoothness, 8);
        if (smoothness <= 0) smoothness = 8;

        const diff = state.target - state.current;
        const factor = 1 - Math.exp(-smoothness * dt);
        state.current += diff * factor;

        draw();

        if (Math.abs(diff) < 1e-3) {
            state.idleFrames++;
            if (state.idleFrames > 6) {
                state.current = state.target;
                stopAnim();
                return;
            }
        } else {
            state.idleFrames = 0;
        }
        state.animFrame = window.requestAnimationFrame(step);
    };
    state.animFrame = window.requestAnimationFrame(step);
}

function stopAnim() {
    if (state.animFrame !== null) {
        window.cancelAnimationFrame(state.animFrame);
        state.animFrame = null;
    }
    state.lastFrameTs = 0;
    state.idleFrames = 0;
}

// ── Listeners ──────────────────────────────────────────────────────────

VisualizationAPI.addDimensionsListener(
    ({ width, height }) => {
        state.width = width || 0;
        state.height = height || 0;
        draw();
    },
    { invokeImmediately: true }
);

VisualizationAPI.addOptionsListener(
    ({ options }) => {
        state.options = options || {};
        // If options changed, the parsed value (with new valueField/etc.)
        // may have changed too. Re-parse from the cached raw payload.
        if (state.rawData) {
            const parsed = parseData(state.rawData, state.options);
            if (parsed && !parsed.status) {
                state.parsed = parsed;
                state.target = parsed.value;
                // Snap on options change so the needle does not creep when
                // the user picks a different valueField mid-view.
                state.current = parsed.value;
            } else if (parsed && parsed.status) {
                state.statusMsg = parsed.status;
            }
        }
        draw();
    },
    { invokeImmediately: true }
);

VisualizationAPI.addDataSourcesListener(
    ({ dataSources, loading }) => {
        // The key refresh-stability fix: while a data source is loading,
        // keep the previous frame on screen instead of repainting. The
        // Dashboard Studio host overlays its own refresh indicator in the
        // corner; we just hold our frame steady until the new data lands.
        state.loading = loading;
        if (loading) return;

        const raw = dataSources && dataSources.primary && dataSources.primary.data
            ? dataSources.primary.data
            : null;
        if (!raw) {
            // No data yet (first load, or empty result with no _lastGood).
            // Draw the empty shell so the panel is never blank.
            if (!state.rawData && !state.statusMsg) draw();
            return;
        }

        const parsed = parseData(raw, state.options);
        if (!parsed) {
            // Could not parse — keep the previous frame.
            draw();
            return;
        }

        if (parsed.status) {
            state.statusMsg = parsed.status;
            state.rawData = raw;
            drawStatusMessage(parsed.status);
            return;
        }

        state.statusMsg = null;
        state.rawData = raw;
        state.parsed = parsed;
        state.target = parsed.value;

        if (state.firstSample) {
            state.current = parsed.value;
            state.firstSample = false;
        }

        const smoothness = asNum(state.options.smoothness, 8);
        if (smoothness <= 0) {
            state.current = state.target;
            stopAnim();
            draw();
        } else if (Math.abs(state.target - state.current) <= 1e-3) {
            draw();
        } else {
            draw();
            startAnim();
        }
    },
    { invokeImmediately: true }
);
