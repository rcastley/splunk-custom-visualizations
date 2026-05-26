/*
 * Steampunk Odometer (10.4+) — Splunk Dashboard Studio custom visualization.
 *
 * Same visual design as the legacy `steampunk_odometer` app but built on the
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
 * `label` columns (column names are configurable).
 */
import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import './visualization.css';

// ── Pure helpers ───────────────────────────────────────────────────────

function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

function seededRand(seed) {
    let s = seed;
    return function () {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

// djb2-style hash → positive 31-bit integer; used to derive a stable per-
// panel wear seed from config so two odometers on the same dashboard do
// not share identical stains and drum smudges.
function hashString(s) {
    if (!s) return 0;
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h * 33) ^ s.charCodeAt(i)) | 0;
    }
    h = h < 0 ? -h : h;
    return h || 1;
}

function pow10(n) {
    let p = 1;
    for (let i = 0; i < n; i++) p *= 10;
    return p;
}

// Wrap an angle in radians into the range (-PI, PI]. The drum surface
// texture and digit positions are parameterized by angle around the
// cylinder; this keeps a slowly-rolling drum producing stable theta
// values as currentValue grows continuously.
function normalizeAngle(a) {
    const TWO_PI = Math.PI * 2;
    a = a - Math.floor(a / TWO_PI) * TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    return a;
}

function escapeForText(text) {
    if (text == null) return '';
    return String(text).replace(/[\u0000-\u001F\u007F]/g, '');
}

// ── Drawing primitives (ported verbatim from the legacy viz) ───────────

function roundedRect(ctx, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function drawRivet(ctx, cx, cy, r) {
    const rg = ctx.createRadialGradient(
        cx - r * 0.4, cy - r * 0.4, r * 0.1,
        cx, cy, r
    );
    rg.addColorStop(0, '#e8c478');
    rg.addColorStop(0.5, '#a87a3a');
    rg.addColorStop(1, '#3a2410');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rg;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy);
    ctx.lineTo(cx + r * 0.6, cy);
    ctx.lineWidth = Math.max(1, r * 0.22);
    ctx.strokeStyle = 'rgba(30, 18, 8, 0.85)';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
}

// Frame: brass outer ring + ivory back plate. Returns the inner ivory-plate
// bounds so the caller knows where to place the drums and label.
function drawFrame(ctx, x, y, w, h, showRivets, showWear, wearSeed) {
    const outerR = Math.min(w, h) * 0.10;
    let bezelWidth = Math.min(w, h) * 0.12;
    if (bezelWidth < 8) bezelWidth = 8;

    // Outer brass body
    const bezelGrad = ctx.createRadialGradient(
        x + w * 0.3, y + h * 0.3, Math.min(w, h) * 0.2,
        x + w * 0.5, y + h * 0.5, Math.max(w, h) * 0.95
    );
    bezelGrad.addColorStop(0.0, '#c39253');
    bezelGrad.addColorStop(0.25, '#8a5a2b');
    bezelGrad.addColorStop(0.55, '#5a3a1c');
    bezelGrad.addColorStop(0.85, '#3a2410');
    bezelGrad.addColorStop(1.0, '#231507');
    roundedRect(ctx, x, y, w, h, outerR);
    ctx.fillStyle = bezelGrad;
    ctx.fill();

    // Inner ivory plate bounds
    const ix = x + bezelWidth;
    const iy = y + bezelWidth;
    const iw = w - bezelWidth * 2;
    const ih = h - bezelWidth * 2;
    const innerR = Math.max(2, outerR - bezelWidth * 0.6);

    // Bright highlight ring near the inner edge of the bezel
    roundedRect(
        ctx,
        ix - bezelWidth * 0.18, iy - bezelWidth * 0.18,
        iw + bezelWidth * 0.36, ih + bezelWidth * 0.36,
        innerR + bezelWidth * 0.18
    );
    ctx.lineWidth = Math.max(1, bezelWidth * 0.10);
    ctx.strokeStyle = 'rgba(232, 188, 122, 0.55)';
    ctx.stroke();

    // Dark inner shadow ring around the plate
    roundedRect(ctx, ix - 1, iy - 1, iw + 2, ih + 2, innerR + 1);
    ctx.lineWidth = Math.max(2, bezelWidth * 0.16);
    ctx.strokeStyle = 'rgba(20, 10, 4, 0.85)';
    ctx.stroke();

    // Outer rim shadow
    roundedRect(ctx, x + 1, y + 1, w - 2, h - 2, outerR - 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.stroke();

    // Ivory back plate
    roundedRect(ctx, ix, iy, iw, ih, innerR);
    ctx.save();
    ctx.clip();

    const faceGrad = ctx.createRadialGradient(
        ix + iw * 0.4, iy + ih * 0.3, Math.min(iw, ih) * 0.1,
        ix + iw * 0.5, iy + ih * 0.5, Math.max(iw, ih) * 0.8
    );
    faceGrad.addColorStop(0, '#f1e6c9');
    faceGrad.addColorStop(0.55, '#e3d2a8');
    faceGrad.addColorStop(0.9, '#b89a6a');
    faceGrad.addColorStop(1, '#8c7148');
    ctx.fillStyle = faceGrad;
    ctx.fillRect(ix, iy, iw, ih);

    // Wear on the ivory plate (deterministic; seed is panel-specific)
    if (showWear) {
        const rand = seededRand(wearSeed || 4242);
        const stainCount = 32;
        for (let i = 0; i < stainCount; i++) {
            const sx = ix + rand() * iw;
            const sy = iy + rand() * ih;
            const sr = Math.min(iw, ih) * (0.05 + rand() * 0.14);
            const alpha = 0.10 + rand() * 0.20;
            const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            sg.addColorStop(0, 'rgba(70, 40, 14, ' + alpha + ')');
            sg.addColorStop(1, 'rgba(70, 40, 14, 0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
        const speckCount = 70;
        for (let j = 0; j < speckCount; j++) {
            const px = ix + rand() * iw;
            const py = iy + rand() * ih;
            ctx.fillStyle = 'rgba(50, 28, 10, ' + (0.20 + rand() * 0.28) + ')';
            ctx.beginPath();
            ctx.arc(px, py, 0.5 + rand() * 1.3, 0, Math.PI * 2);
            ctx.fill();
        }
        const streakPlateCount = 6;
        for (let st = 0; st < streakPlateCount; st++) {
            const x0 = ix + rand() * iw;
            const y0 = iy + rand() * ih;
            const lenS = Math.min(iw, ih) * (0.15 + rand() * 0.30);
            const ang = rand() * Math.PI * 2;
            const x1 = x0 + Math.cos(ang) * lenS;
            const y1 = y0 + Math.sin(ang) * lenS;
            const sgrad = ctx.createLinearGradient(x0, y0, x1, y1);
            const sa = 0.06 + rand() * 0.10;
            sgrad.addColorStop(0, 'rgba(60, 32, 12, 0)');
            sgrad.addColorStop(0.5, 'rgba(60, 32, 12, ' + sa + ')');
            sgrad.addColorStop(1, 'rgba(60, 32, 12, 0)');
            ctx.strokeStyle = sgrad;
            ctx.lineWidth = 0.7 + rand() * 1.2;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        }
    }
    ctx.restore();

    // Decorative brass rivets at the four corners
    if (showRivets) {
        const rivetR = Math.max(3, bezelWidth * 0.32);
        const rxL = x + bezelWidth / 2;
        const rxR = x + w - bezelWidth / 2;
        const ryT = y + bezelWidth / 2;
        const ryB = y + h - bezelWidth / 2;
        drawRivet(ctx, rxL, ryT, rivetR);
        drawRivet(ctx, rxR, ryT, rivetR);
        drawRivet(ctx, rxL, ryB, rivetR);
        drawRivet(ctx, rxR, ryB, rivetR);
    }

    return { x: ix, y: iy, w: iw, h: ih };
}

// Brass end-cap (axle disc seen from a slight angle): narrow vertical brass
// tab with a tiny dark axle pin in the middle. Top and bottom darken to
// imply the disc curving away from the viewer. Two of these flank every drum.
function drawDrumEndCap(ctx, x, y, w, h) {
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.fillStyle = '#180e04';
    ctx.fillRect(x, y, w, h);

    const inset = Math.max(0.5, Math.min(w * 0.10, 1.5));
    const rg = ctx.createRadialGradient(
        cx - w * 0.35, cy - h * 0.30, 0,
        cx, cy, h * 0.65
    );
    rg.addColorStop(0.00, '#f0d597');
    rg.addColorStop(0.35, '#b88a48');
    rg.addColorStop(0.80, '#6b4a22');
    rg.addColorStop(1.00, '#2a1a0a');

    const rr = Math.min(w * 0.45, h * 0.06);
    roundedRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, rr);
    ctx.fillStyle = rg;
    ctx.fill();

    // Top and bottom shadow bands — the disc's curvature falling away at the rim
    const bandH = h * 0.18;
    const topG = ctx.createLinearGradient(x, y, x, y + bandH);
    topG.addColorStop(0, 'rgba(15, 8, 2, 0.85)');
    topG.addColorStop(1, 'rgba(15, 8, 2, 0)');
    ctx.fillStyle = topG;
    ctx.fillRect(x, y, w, bandH);

    const botG = ctx.createLinearGradient(x, y + h - bandH, x, y + h);
    botG.addColorStop(0, 'rgba(15, 8, 2, 0)');
    botG.addColorStop(1, 'rgba(15, 8, 2, 0.85)');
    ctx.fillStyle = botG;
    ctx.fillRect(x, y + h - bandH, w, bandH);

    // Subtle vertical highlight on the left edge
    const hiW = Math.max(0.6, w * 0.18);
    const hiG = ctx.createLinearGradient(x, cy, x + hiW, cy);
    hiG.addColorStop(0, 'rgba(255, 230, 170, 0.45)');
    hiG.addColorStop(1, 'rgba(255, 230, 170, 0)');
    ctx.fillStyle = hiG;
    ctx.fillRect(x + inset, y + h * 0.20, hiW, h * 0.60);

    // Central axle pin
    const pinR = Math.max(0.7, Math.min(w * 0.28, h * 0.055));
    ctx.beginPath();
    ctx.arc(cx, cy, pinR, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0602';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - pinR * 0.35, cy - pinR * 0.35, pinR * 0.40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248, 218, 150, 0.6)';
    ctx.fill();
}

// Single rolling digit drum. The drum is rendered as a cylinder seen from
// the front. Digits live on the cylinder surface at evenly-spaced angular
// positions (10 digits → 36° apart). Each visible digit is projected onto
// the screen using sinusoidal positioning (y = cy − R·sinθ), vertically
// foreshortened (scale = cosθ), and dimmed toward the back edges
// (alpha = cosθ^1.3). Up to five digits are visible at any moment.
function drawDigitDrum(ctx, x, y, w, h, digit, rollFrac, fontPx, showWear, drumIndex, wearSeed) {
    // ── Geometry ──
    let endCapW = clamp(w * 0.11, 2.5, Math.max(2.5, h * 0.08));
    let faceX = x + endCapW;
    let faceW = w - endCapW * 2;
    if (faceW < 4) { faceW = 4; endCapW = (w - faceW) / 2; faceX = x + endCapW; }

    const cx = faceX + faceW / 2;
    const cy = y + h / 2;
    const radius = h / 2;

    const anglePerDigit = (Math.PI * 2) / 10;
    const maxAngle = Math.PI / 2 - 0.015;
    const currentValue = digit + rollFrac;

    // ── Drop shadow under the whole drum assembly ──
    ctx.save();
    ctx.shadowColor = 'rgba(15, 8, 2, 0.55)';
    ctx.shadowBlur = Math.max(3, w * 0.14);
    ctx.shadowOffsetX = Math.max(1, w * 0.035);
    ctx.shadowOffsetY = Math.max(1, w * 0.06);
    ctx.fillStyle = 'rgba(15, 8, 2, 0.55)';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.restore();

    // ── Brass end-caps on both sides ──
    drawDrumEndCap(ctx, x, y, endCapW, h);
    drawDrumEndCap(ctx, x + w - endCapW, y, endCapW, h);

    // ── Clip to the cylinder front face ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(faceX, y, faceW, h);
    ctx.clip();

    // Base cylinder face — strong vertical gradient suggesting curvature
    const dg = ctx.createLinearGradient(faceX, y, faceX, y + h);
    dg.addColorStop(0.00, '#2a1d0c');
    dg.addColorStop(0.06, '#5a4524');
    dg.addColorStop(0.18, '#a08e63');
    dg.addColorStop(0.32, '#d6c596');
    dg.addColorStop(0.46, '#f3e8c3');
    dg.addColorStop(0.50, '#fbf3da');
    dg.addColorStop(0.54, '#f3e8c3');
    dg.addColorStop(0.68, '#d6c596');
    dg.addColorStop(0.82, '#a08e63');
    dg.addColorStop(0.94, '#5a4524');
    dg.addColorStop(1.00, '#2a1d0c');
    ctx.fillStyle = dg;
    ctx.fillRect(faceX, y, faceW, h);

    // Surface wear — anchored to angular positions on the cylinder so it
    // scrolls vertically as the drum rolls. Seed mixes the panel-wide
    // wearSeed with the drum index so every drum has its own pattern and
    // two odometers on the same dashboard do not share drum patinas.
    if (showWear) {
        const rand = seededRand((wearSeed || 1009) * 31 + drumIndex * 311 + 1);

        // 1) Smudges — small dark blobs at fixed angles on the cylinder
        const smudgeCount = 24;
        for (let sIdx = 0; sIdx < smudgeCount; sIdx++) {
            const smudgeX = faceX + rand() * faceW;
            const smudgeW = 0.7 + rand() * 2.2;
            const smudgeAxialFrac = 0.05 + rand() * 0.12;
            const smudgeAnchor = rand() * Math.PI * 2;
            const smudgeBaseAlpha = 0.22 + rand() * 0.32;

            const sTheta = normalizeAngle(smudgeAnchor + anglePerDigit * currentValue);
            if (Math.abs(sTheta) > maxAngle) continue;

            const sSin = Math.sin(sTheta);
            const sCos = Math.cos(sTheta);
            const sYScreen = cy - radius * sSin;
            const sScreenH = Math.max(0.6, radius * smudgeAxialFrac * sCos);
            const sAlpha = smudgeBaseAlpha * Math.pow(sCos, 1.1);

            ctx.fillStyle = 'rgba(30, 16, 6, ' + sAlpha + ')';
            ctx.fillRect(smudgeX, sYScreen - sScreenH / 2, smudgeW, sScreenH);
        }

        // 2) Circumferential grime rings — horizontal lines drifting up/down
        // as the drum spins. Strongest visual cue that the surface is moving.
        const ringCount = 8;
        for (let rIdx = 0; rIdx < ringCount; rIdx++) {
            const ringAnchor = rand() * Math.PI * 2;
            const ringThickness = 0.8 + rand() * 2.2;
            const ringBaseAlpha = 0.14 + rand() * 0.22;

            const rTheta = normalizeAngle(ringAnchor + anglePerDigit * currentValue);
            if (Math.abs(rTheta) > maxAngle) continue;

            const rCos = Math.cos(rTheta);
            const rSin = Math.sin(rTheta);
            const rYScreen = cy - radius * rSin;
            const rThickness = Math.max(0.5, ringThickness * rCos);
            const rAlpha = ringBaseAlpha * rCos;

            ctx.fillStyle = 'rgba(30, 16, 6, ' + rAlpha + ')';
            ctx.fillRect(faceX, rYScreen - rThickness / 2, faceW, rThickness);
        }

        // 3) Per-drum dust specks
        const dustCount = 30;
        for (let dIdx = 0; dIdx < dustCount; dIdx++) {
            const dustX = faceX + rand() * faceW;
            const dustR = 0.35 + rand() * 0.9;
            const dustAnchor = rand() * Math.PI * 2;
            const dustBaseAlpha = 0.18 + rand() * 0.28;

            const dTheta = normalizeAngle(dustAnchor + anglePerDigit * currentValue);
            if (Math.abs(dTheta) > maxAngle) continue;

            const dCos = Math.cos(dTheta);
            const dSin = Math.sin(dTheta);
            const dY = cy - radius * dSin;
            const dRy = Math.max(0.3, dustR * dCos);
            const dAlpha = dustBaseAlpha * Math.pow(dCos, 1.0);

            ctx.fillStyle = 'rgba(28, 14, 5, ' + dAlpha + ')';
            ctx.beginPath();
            ctx.ellipse(dustX, dY, dustR, dRy, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Digits with cylindrical projection ──
    ctx.font = 'bold ' + fontPx + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const visibleRange = 3;
    const slots = [];
    for (let n = -visibleRange; n <= visibleRange; n++) {
        const theta = anglePerDigit * (rollFrac - n);
        if (Math.abs(theta) > maxAngle) continue;
        slots.push({ n, theta });
    }
    // Draw back-most digits first so closer (brighter) digits paint over them
    slots.sort((a, b) => Math.abs(b.theta) - Math.abs(a.theta));

    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const digitVal = (((digit + slot.n) % 10) + 10) % 10;
        const sin = Math.sin(slot.theta);
        const cos = Math.cos(slot.theta);
        const yScreen = cy - radius * sin;
        const vScale = cos < 0.05 ? 0.05 : cos;
        const alphaD = Math.pow(cos < 0 ? 0 : cos, 1.3);
        if (alphaD < 0.04) continue;

        ctx.save();
        ctx.globalAlpha = alphaD;
        ctx.translate(cx, yScreen);
        ctx.scale(1, vScale);
        ctx.fillStyle = '#0d0805';
        ctx.fillText(String(digitVal), 0, 0);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Cylinder lighting overlays
    const topShade = ctx.createLinearGradient(faceX, y, faceX, y + h * 0.50);
    topShade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    topShade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topShade;
    ctx.fillRect(faceX, y, faceW, h * 0.50);

    const botShade = ctx.createLinearGradient(faceX, y + h * 0.50, faceX, y + h);
    botShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    botShade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = botShade;
    ctx.fillRect(faceX, y + h * 0.50, faceW, h * 0.50);

    // Specular-style highlight band at the very front (theta ≈ 0)
    const hiH = Math.max(2, h * 0.12);
    const hiY = cy - hiH / 2;
    const hiBand = ctx.createLinearGradient(faceX, hiY, faceX, hiY + hiH);
    hiBand.addColorStop(0, 'rgba(255, 245, 215, 0)');
    hiBand.addColorStop(0.5, 'rgba(255, 245, 215, 0.22)');
    hiBand.addColorStop(1, 'rgba(255, 245, 215, 0)');
    ctx.fillStyle = hiBand;
    ctx.fillRect(faceX, hiY, faceW, hiH);

    ctx.restore(); // unclip

    // Thin dark frame around the cylinder face
    ctx.lineWidth = Math.max(0.6, faceW * 0.03);
    ctx.strokeStyle = 'rgba(30, 16, 6, 0.95)';
    ctx.strokeRect(faceX + 0.5, y + 0.5, faceW - 1, h - 1);

    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
}

// Decimal-point dot drawn between two drums on the ivory plate
function drawDecimalPoint(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 12, 4, 0.9)';
    ctx.fill();
}

// Carry-cascade roll fraction. Given a non-negative scaled integer-ish
// value, return the visual roll fraction for digit position k (0 =
// rightmost). Higher digits only roll when the digit below them is in
// the last 10% of its own roll — same way a real car odometer behaves.
function computeRollFracs(scaledValue, numDrums) {
    const rolls = new Array(numDrums);
    rolls[0] = scaledValue - Math.floor(scaledValue);

    for (let k = 1; k < numDrums; k++) {
        const lowerPos = scaledValue / pow10(k - 1);
        const lowerDigit = Math.floor(lowerPos) % 10;
        if (lowerDigit === 9 && rolls[k - 1] >= 0.9) {
            rolls[k] = (rolls[k - 1] - 0.9) * 10;
        } else {
            rolls[k] = 0;
        }
    }
    return rolls;
}

// ── DOM setup ──────────────────────────────────────────────────────────

const root = document.getElementById('root') || document.body;
root.classList.add('steampunk-odometer-viz');

const canvas = document.createElement('canvas');
canvas.style.width = '100%';
canvas.style.height = '100%';
canvas.style.display = 'block';
root.appendChild(canvas);

if (typeof console !== 'undefined' && console.info) {
    console.info('[steampunk_odometer_dse v1.0.0] initialized');
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
    target: 0,              // value the drums are easing toward
    current: 0,             // currently-rendered value
    firstSample: true,      // snap on the very first data sample
    animFrame: null,
    lastFrameTs: 0,
    idleFrames: 0,
};

// ── Parse column-major data into a single { value, label } sample ──────
//
// Dashboard Studio passes data as { fields, columns }. For an odometer
// we want the last row's value/label. The _status field is the no-data
// SPL fallback — if present and non-empty, surface it as a status
// message instead of a value.
function parseData(data, options) {
    if (!data || !data.fields || !data.columns) return null;
    const valueField = options.valueField || 'value';
    const labelField = options.labelField || 'label';

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
    let value = parseFloat(vCol[last]);
    if (isNaN(value)) return null;
    if (value < 0) value = 0; // odometers count up only

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

// ── Option accessors (defensive against undefined / wrong types) ───────

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
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? fallback : n;
}

// ── Main draw ──────────────────────────────────────────────────────────

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

    // ── Resolved options ──
    let digits = Math.floor(asNum(state.options.digits, 6));
    if (digits < 1) digits = 1;
    if (digits > 12) digits = 12;

    let decimals = Math.floor(asNum(state.options.decimals, 0));
    if (decimals < 0) decimals = 0;
    if (decimals > 4) decimals = 4;

    const unit = String(getOpt('unit', ''));
    const showRivets = asBool(state.options.showRivets, true);
    const showWear = asBool(state.options.showWear, true);

    let digitSpacing = Math.floor(asNum(state.options.digitSpacing, 50));
    if (digitSpacing < 0) digitSpacing = 0;
    if (digitSpacing > 100) digitSpacing = 100;

    // ── Brass-ring + ivory-plate frame ──
    const panelPad = Math.max(4, Math.min(w, h) * 0.025);
    const panelX = panelPad;
    const panelY = panelPad;
    const panelW = w - panelPad * 2;
    const panelH = h - panelPad * 2;
    if (panelW < 30 || panelH < 30) return;

    // Per-panel wear seed: derive a stable but unique seed from CONFIG-only
    // inputs (not from the label string, which is unavailable during the
    // empty-shell phase). Hashing only formatter settings keeps the wear
    // pattern stable from the very first frame onward.
    const wearSeed = hashString(
        unit + '|' +
        (state.options.valueField || '') + '|' +
        (state.options.labelField || '') + '|' +
        digits + '|' + decimals + '|' + digitSpacing + '|' +
        (showRivets ? '1' : '0') + '|' +
        (showWear ? '1' : '0')
    ) || 4242;

    const plate = drawFrame(ctx, panelX, panelY, panelW, panelH, showRivets, showWear, wearSeed);

    // ── Layout: drums on the ivory plate, label engraved below ──
    const inset = Math.max(6, Math.min(plate.w, plate.h) * 0.06);
    const bayX = plate.x + inset;
    const bayY = plate.y + inset;
    const bayW = plate.w - inset * 2;
    const safeLabel = escapeForText(state.parsed ? state.parsed.label : '');
    const labelReserve = safeLabel ? Math.max(18, plate.h * 0.22) : 0;
    let bayH = plate.h - inset * 2 - labelReserve;
    if (bayH < 20) bayH = 20;

    // Reserve room on the right for the unit text if present
    let unitGap = 0;
    let unitFontPx = 0;
    if (unit) {
        unitFontPx = Math.max(8, bayH * 0.28);
        ctx.font = 'bold ' + unitFontPx + 'px sans-serif';
        unitGap = ctx.measureText(unit).width + bayH * 0.18;
    }

    // ── Drum slot sizing (1:1.75 aspect; cylindrical projection wants
    // more vertical room than the flat legacy drum) ──
    const totalDrums = digits + decimals;
    const decimalPointW = decimals > 0 ? bayH * 0.16 : 0;
    const availDrumW = bayW - decimalPointW - unitGap;
    const drumAspect = 1.75;
    const maxDrumW = availDrumW / totalDrums;
    let drumH = Math.min(bayH, maxDrumW * drumAspect);
    let drumW = Math.min(maxDrumW, drumH / drumAspect);
    drumH = drumW * drumAspect;
    if (drumH < bayH * 0.95) {
        const scale = Math.min(bayH / drumH, (availDrumW / totalDrums) / drumW);
        drumW *= scale;
        drumH *= scale;
    }
    if (drumH > bayH) drumH = bayH;

    const totalRowW = totalDrums * drumW + decimalPointW;
    const rowStartX = bayX + (bayW - totalRowW - unitGap) / 2;
    const rowY = bayY + (bayH - drumH) / 2;

    // ── Compute rolling state ──
    let displayVal = state.current;
    if (displayVal < 0) displayVal = 0;
    let scaledVal = displayVal * pow10(decimals);

    // Cap so we never overflow the drum count
    const maxScaled = pow10(totalDrums) - 1;
    if (scaledVal > maxScaled) scaledVal = maxScaled;

    const rolls = computeRollFracs(scaledVal, totalDrums);

    // Font sized from the user-controlled spacing setting. With bold
    // monospace and 36° angular spacing, the mapping below makes digits
    // visibly overlap at spacing=0 and leaves clear breathing room at 100.
    const fontFactor = 0.50 - (digitSpacing / 100) * 0.20;
    const digitFontPx = Math.max(8, drumH * fontFactor);

    // Draw drums from left (highest position) to right (lowest)
    let cursorX = rowStartX;
    for (let k = totalDrums - 1; k >= 0; k--) {
        const dx = cursorX;
        const dy = rowY;
        const digit = Math.floor(scaledVal / pow10(k)) % 10;
        const rollFrac = rolls[k];

        drawDigitDrum(ctx, dx, dy, drumW, drumH, digit, rollFrac, digitFontPx, showWear, k, wearSeed);

        cursorX += drumW;

        // Decimal point on the ivory plate between integer and fractional drums
        if (decimals > 0 && k === decimals) {
            const dotSize = decimalPointW * 0.32;
            drawDecimalPoint(
                ctx,
                cursorX + decimalPointW / 2,
                dy + drumH * 0.82,
                dotSize
            );
            cursorX += decimalPointW;
        }
    }

    // Unit text on the right of the drums (engraved style)
    if (unit) {
        ctx.font = 'bold ' + unitFontPx + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(42, 26, 8, 0.85)';
        ctx.fillText(unit, cursorX + bayH * 0.10, rowY + drumH / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    // Engraved label on the ivory plate below the drums
    if (safeLabel) {
        const labelY = rowY + drumH + labelReserve / 2;
        let labelFontPx = clamp(plate.h * 0.14, 10, 28);

        ctx.font = 'bold ' + labelFontPx + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const maxLabelW = plate.w * 0.86;
        while (ctx.measureText(safeLabel).width > maxLabelW && labelFontPx > 6) {
            labelFontPx -= 1;
            ctx.font = 'bold ' + labelFontPx + 'px sans-serif';
        }

        // Engraved look — dark fill with a subtle ivory highlight peeking
        // out below to imply depth
        const cxLab = plate.x + plate.w / 2;
        ctx.fillStyle = 'rgba(255, 230, 180, 0.45)';
        ctx.fillText(safeLabel, cxLab, labelY + 1.2);
        ctx.fillStyle = 'rgba(42, 26, 8, 0.90)';
        ctx.fillText(safeLabel, cxLab, labelY);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
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

// ── Animation (frame-rate-independent easing; only runs when target
// actually differs from current — no idle-frame burst on every refresh) ─

function startAnim() {
    if (state.animFrame !== null) return;
    state.lastFrameTs = 0;
    const step = (ts) => {
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

        // Treat as settled when the per-frame change is small enough that
        // no drum can move a noticeable amount.
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
        // If options changed, re-parse the cached raw payload so a
        // changed valueField / labelField is picked up immediately.
        if (state.rawData) {
            const parsed = parseData(state.rawData, state.options);
            if (parsed && !parsed.status) {
                state.parsed = parsed;
                state.target = parsed.value;
                // Snap on options change so the drums do not creep when
                // the user picks a different valueField mid-view.
                state.current = parsed.value;
                state.statusMsg = null;
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
        // The refresh-stability fix: while a data source is loading, keep
        // the previous frame on screen instead of repainting. The Dashboard
        // Studio host overlays its own refresh indicator in the corner; we
        // just hold our frame steady until the new data lands.
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
