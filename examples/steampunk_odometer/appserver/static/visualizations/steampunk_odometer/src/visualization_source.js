/*
 * Steampunk Odometer — Splunk Custom Visualization
 *
 * Brass panel with mechanical digit drums that physically roll between
 * values. Drums are rendered as true cylinders: digits live on the
 * cylinder surface and are projected onto the screen with sinusoidal
 * positioning, vertical foreshortening, and depth-based dimming so they
 * visibly roll away to the back and reappear rolling in from below.
 *
 * Each drum has a worn surface texture (smudges + circumferential grime
 * rings) anchored to angular positions on the cylinder, so the texture
 * scrolls together with the digits as the drum rotates. Brass end-caps
 * with a centre axle pin sit on each side of every drum.
 *
 * Drums use a classic odometer carry cascade — a higher digit only
 * begins rolling when the digit immediately below it is in the last
 * 10 % of its own roll. An engraved label sits below the drums.
 *
 * Expected SPL columns: value (numeric), label (string).
 *   - Both column names are configurable via the Value Field / Label
 *     Field formatter settings (defaults: value, label).
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper functions (pure, no `this`) ──────────────────────

    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }

    function seededRand(seed) {
        var s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    // djb2-style string hash → positive 31-bit integer. Used to turn the
    // panel's identity (label + a few stable config values) into a
    // unique-but-stable wear seed so two odometers on the same dashboard
    // do not share the same plate stains and drum smudges.
    function hashString(s) {
        if (!s) return 0;
        var h = 5381;
        for (var i = 0; i < s.length; i++) {
            h = ((h * 33) ^ s.charCodeAt(i)) | 0;
        }
        h = h < 0 ? -h : h;
        return h || 1;
    }

    function pow10(n) {
        // Math.pow can drift on negative exponents; we only need 0..16
        var p = 1;
        for (var i = 0; i < n; i++) p *= 10;
        return p;
    }

    // Wrap an angle in radians into the range (-PI, PI]. The drum's
    // surface texture and digit positions are all parameterized by
    // angle around the cylinder; we need this so a slowly-rolling drum
    // with a continuously-growing currentValue keeps producing stable
    // theta values for hit-testing against the visible arc.
    function normalizeAngle(a) {
        var TWO_PI = Math.PI * 2;
        a = a - Math.floor(a / TWO_PI) * TWO_PI;
        if (a > Math.PI) a -= TWO_PI;
        return a;
    }

    // ── Frame: brass outer ring + ivory back plate ──────────────
    //
    // Mirrors the steampunk_gauge bezel/dial structure but laid out as a
    // rounded rectangle. Returns the inner ivory-plate bounds so the
    // caller knows where to place the drums and label.

    function drawFrame(ctx, x, y, w, h, showRivets, showWear, wearSeed) {
        var outerR = Math.min(w, h) * 0.10;
        var bezelWidth = Math.min(w, h) * 0.12;
        if (bezelWidth < 8) bezelWidth = 8;

        // Outer brass body — radial gradient lit from the top-left,
        // matching the gauge bezel's tonal range.
        var bezelGrad = ctx.createRadialGradient(
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
        var ix = x + bezelWidth;
        var iy = y + bezelWidth;
        var iw = w - bezelWidth * 2;
        var ih = h - bezelWidth * 2;
        var innerR = Math.max(2, outerR - bezelWidth * 0.6);

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

        // Ivory back plate — same palette as the gauge dial face
        roundedRect(ctx, ix, iy, iw, ih, innerR);
        ctx.save();
        ctx.clip();

        var faceGrad = ctx.createRadialGradient(
            ix + iw * 0.4, iy + ih * 0.3, Math.min(iw, ih) * 0.1,
            ix + iw * 0.5, iy + ih * 0.5, Math.max(iw, ih) * 0.8
        );
        faceGrad.addColorStop(0, '#f1e6c9');
        faceGrad.addColorStop(0.55, '#e3d2a8');
        faceGrad.addColorStop(0.9, '#b89a6a');
        faceGrad.addColorStop(1, '#8c7148');
        ctx.fillStyle = faceGrad;
        ctx.fillRect(ix, iy, iw, ih);

        // Wear on the ivory plate (deterministic). Seed is panel-specific
        // (see _draw) so each odometer has its own pattern of stains.
        if (showWear) {
            var rand = seededRand(wearSeed || 4242);
            var stainCount = 32;
            for (var i = 0; i < stainCount; i++) {
                var sx = ix + rand() * iw;
                var sy = iy + rand() * ih;
                var sr = Math.min(iw, ih) * (0.05 + rand() * 0.14);
                var alpha = 0.10 + rand() * 0.20;
                var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
                sg.addColorStop(0, 'rgba(70, 40, 14, ' + alpha + ')');
                sg.addColorStop(1, 'rgba(70, 40, 14, 0)');
                ctx.fillStyle = sg;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
            // Dark speckles — more of them, more visible
            var speckCount = 70;
            for (var j = 0; j < speckCount; j++) {
                var px = ix + rand() * iw;
                var py = iy + rand() * ih;
                ctx.fillStyle = 'rgba(50, 28, 10, ' + (0.20 + rand() * 0.28) + ')';
                ctx.beginPath();
                ctx.arc(px, py, 0.5 + rand() * 1.3, 0, Math.PI * 2);
                ctx.fill();
            }
            // Long faint streaks crossing the plate — adds the look of
            // ink/oil rubs from years of use rather than just dust spots.
            var streakPlateCount = 6;
            for (var st = 0; st < streakPlateCount; st++) {
                var x0 = ix + rand() * iw;
                var y0 = iy + rand() * ih;
                var lenS = Math.min(iw, ih) * (0.15 + rand() * 0.30);
                var ang = rand() * Math.PI * 2;
                var x1 = x0 + Math.cos(ang) * lenS;
                var y1 = y0 + Math.sin(ang) * lenS;
                var sgrad = ctx.createLinearGradient(x0, y0, x1, y1);
                var sa = 0.06 + rand() * 0.10;
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

        // Decorative brass rivets sitting on the brass ring at the
        // four corner positions (centered on the bezel band).
        if (showRivets) {
            var rivetR = Math.max(3, bezelWidth * 0.32);
            var rxL = x + bezelWidth / 2;
            var rxR = x + w - bezelWidth / 2;
            var ryT = y + bezelWidth / 2;
            var ryB = y + h - bezelWidth / 2;
            drawRivet(ctx, rxL, ryT, rivetR);
            drawRivet(ctx, rxR, ryT, rivetR);
            drawRivet(ctx, rxL, ryB, rivetR);
            drawRivet(ctx, rxR, ryB, rivetR);
        }

        return { x: ix, y: iy, w: iw, h: ih };
    }

    function drawRivet(ctx, cx, cy, r) {
        var rg = ctx.createRadialGradient(
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

        // Slot
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.6, cy);
        ctx.lineTo(cx + r * 0.6, cy);
        ctx.lineWidth = Math.max(1, r * 0.22);
        ctx.strokeStyle = 'rgba(30, 18, 8, 0.85)';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

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

    // ── Brass end-cap (axle disc seen from a slight angle) ─────
    //
    // Drawn as a narrow vertical brass tab with a tiny dark axle pin
    // in the middle. Top and bottom darken to imply the disc curving
    // away from the viewer. Two of these flank every drum.

    function drawDrumEndCap(ctx, x, y, w, h) {
        var cx = x + w / 2;
        var cy = y + h / 2;

        // Dark backing rectangle — frames the brass tab and gives a
        // crisp dark seam against the ivory plate.
        ctx.fillStyle = '#180e04';
        ctx.fillRect(x, y, w, h);

        // Brass face — radial gradient lit from the top-left so the
        // end-cap shares the panel's lighting.
        var inset = Math.max(0.5, Math.min(w * 0.10, 1.5));
        var rg = ctx.createRadialGradient(
            cx - w * 0.35, cy - h * 0.30, 0,
            cx, cy, h * 0.65
        );
        rg.addColorStop(0.00, '#f0d597');
        rg.addColorStop(0.35, '#b88a48');
        rg.addColorStop(0.80, '#6b4a22');
        rg.addColorStop(1.00, '#2a1a0a');

        var rr = Math.min(w * 0.45, h * 0.06);
        roundedRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, rr);
        ctx.fillStyle = rg;
        ctx.fill();

        // Top and bottom shadow bands — the disc's curvature falling
        // away at the rim.
        var bandH = h * 0.18;
        var topG = ctx.createLinearGradient(x, y, x, y + bandH);
        topG.addColorStop(0, 'rgba(15, 8, 2, 0.85)');
        topG.addColorStop(1, 'rgba(15, 8, 2, 0)');
        ctx.fillStyle = topG;
        ctx.fillRect(x, y, w, bandH);

        var botG = ctx.createLinearGradient(x, y + h - bandH, x, y + h);
        botG.addColorStop(0, 'rgba(15, 8, 2, 0)');
        botG.addColorStop(1, 'rgba(15, 8, 2, 0.85)');
        ctx.fillStyle = botG;
        ctx.fillRect(x, y + h - bandH, w, bandH);

        // Subtle vertical highlight on the left edge — implies the disc
        // catching light on its forward rim.
        var hiW = Math.max(0.6, w * 0.18);
        var hiG = ctx.createLinearGradient(x, cy, x + hiW, cy);
        hiG.addColorStop(0, 'rgba(255, 230, 170, 0.45)');
        hiG.addColorStop(1, 'rgba(255, 230, 170, 0)');
        ctx.fillStyle = hiG;
        ctx.fillRect(x + inset, y + h * 0.20, hiW, h * 0.60);

        // Central axle pin — small dark dot with a faint highlight.
        var pinR = Math.max(0.7, Math.min(w * 0.28, h * 0.055));
        ctx.beginPath();
        ctx.arc(cx, cy, pinR, 0, Math.PI * 2);
        ctx.fillStyle = '#0c0602';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - pinR * 0.35, cy - pinR * 0.35, pinR * 0.40, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(248, 218, 150, 0.6)';
        ctx.fill();
    }

    // ── Single rolling digit drum ───────────────────────────────
    //
    // The drum is rendered as a cylinder seen from the front. Digits
    // live on the cylinder surface at evenly-spaced angular positions
    // (10 digits → 36° apart). Each visible digit is projected onto the
    // screen using sinusoidal positioning (y = cy − R·sinθ), vertically
    // foreshortened (scale = cosθ), and dimmed toward the back edges
    // (alpha = cosθ^1.3). Up to five digits are visible at any moment:
    // the current digit at the front, and ±1 / ±2 slot neighbours
    // curving away to the top and bottom of the drum.
    //
    // Surface texture (smudges + circumferential grime rings) is
    // anchored to angular positions on the cylinder, so the texture
    // scrolls together with the digits as the drum rotates — the
    // visible cue that the drum is physically spinning.

    function drawDigitDrum(ctx, x, y, w, h, digit, rollFrac, fontPx, showWear, drumIndex, wearSeed) {
        // ── Geometry ──
        var endCapW = clamp(w * 0.11, 2.5, Math.max(2.5, h * 0.08));
        var faceX = x + endCapW;
        var faceW = w - endCapW * 2;
        if (faceW < 4) { faceW = 4; endCapW = (w - faceW) / 2; }

        var cx = faceX + faceW / 2;
        var cy = y + h / 2;
        var radius = h / 2;

        var anglePerDigit = (Math.PI * 2) / 10;
        var maxAngle = Math.PI / 2 - 0.015;
        var currentValue = digit + rollFrac;

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

        // ── Base cylinder face — strong vertical gradient suggesting
        //    a true cylinder curving away at the top and bottom. The
        //    centre band is bright ivory; the edges fall off into
        //    deep brown shadow.
        var dg = ctx.createLinearGradient(faceX, y, faceX, y + h);
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

        // ── Surface wear — anchored to angular positions on the
        //    cylinder so it scrolls vertically as the drum rolls.
        //    Seed mixes the panel-wide wearSeed with the drum index so
        //    every drum has its own pattern AND two odometers on the
        //    same dashboard do not share drum patinas.
        if (showWear) {
            var rand = seededRand((wearSeed || 1009) * 31 + drumIndex * 311 + 1);

            // 1) Smudges — small dark blobs sitting at fixed angles on
            //    the cylinder surface. Each smudge has a screen y
            //    derived from y = cy − R·sin(θ) where θ shifts as the
            //    drum rotates, and is foreshortened + dimmed near the
            //    visible arc's edges.
            var smudgeCount = 24;
            var sIdx;
            for (sIdx = 0; sIdx < smudgeCount; sIdx++) {
                var smudgeX = faceX + rand() * faceW;
                var smudgeW = 0.7 + rand() * 2.2;
                var smudgeAxialFrac = 0.05 + rand() * 0.12;
                var smudgeAnchor = rand() * Math.PI * 2;
                var smudgeBaseAlpha = 0.22 + rand() * 0.32;

                var sTheta = normalizeAngle(smudgeAnchor + anglePerDigit * currentValue);
                if (Math.abs(sTheta) > maxAngle) continue;

                var sSin = Math.sin(sTheta);
                var sCos = Math.cos(sTheta);
                var sYScreen = cy - radius * sSin;
                var sScreenH = Math.max(0.6, radius * smudgeAxialFrac * sCos);
                var sAlpha = smudgeBaseAlpha * Math.pow(sCos, 1.1);

                ctx.fillStyle = 'rgba(30, 16, 6, ' + sAlpha + ')';
                ctx.fillRect(smudgeX, sYScreen - sScreenH / 2, smudgeW, sScreenH);
            }

            // 2) Circumferential grime rings — faint dark bands going
            //    all the way around the cylinder. On screen they appear
            //    as horizontal lines that drift down (or up) the front
            //    face as the drum spins. These are the strongest visual
            //    cue that the drum's surface is moving.
            var ringCount = 8;
            var rIdx;
            for (rIdx = 0; rIdx < ringCount; rIdx++) {
                var ringAnchor = rand() * Math.PI * 2;
                var ringThickness = 0.8 + rand() * 2.2;
                var ringBaseAlpha = 0.14 + rand() * 0.22;

                var rTheta = normalizeAngle(ringAnchor + anglePerDigit * currentValue);
                if (Math.abs(rTheta) > maxAngle) continue;

                var rCos = Math.cos(rTheta);
                var rSin = Math.sin(rTheta);
                var rYScreen = cy - radius * rSin;
                var rThickness = Math.max(0.5, ringThickness * rCos);
                var rAlpha = ringBaseAlpha * rCos;

                ctx.fillStyle = 'rgba(30, 16, 6, ' + rAlpha + ')';
                ctx.fillRect(faceX, rYScreen - rThickness / 2, faceW, rThickness);
            }

            // 3) Per-drum dust specks — many tiny dark dots anchored on
            //    the cylinder surface, scrolling with the rotation.
            //    Adds fine-grained patina between the larger smudges.
            var dustCount = 30;
            var dIdx;
            for (dIdx = 0; dIdx < dustCount; dIdx++) {
                var dustX = faceX + rand() * faceW;
                var dustR = 0.35 + rand() * 0.9;
                var dustAnchor = rand() * Math.PI * 2;
                var dustBaseAlpha = 0.18 + rand() * 0.28;

                var dTheta = normalizeAngle(dustAnchor + anglePerDigit * currentValue);
                if (Math.abs(dTheta) > maxAngle) continue;

                var dCos = Math.cos(dTheta);
                var dSin = Math.sin(dTheta);
                var dY = cy - radius * dSin;
                var dRy = Math.max(0.3, dustR * dCos);
                var dAlpha = dustBaseAlpha * Math.pow(dCos, 1.0);

                ctx.fillStyle = 'rgba(28, 14, 5, ' + dAlpha + ')';
                ctx.beginPath();
                ctx.ellipse(dustX, dY, dustR, dRy, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // ── Digits with cylindrical projection ──
        //
        // For digit at slot offset n from the current digit, the angle
        // around the cylinder is θ = anglePerDigit · (rollFrac − n).
        //   n =  0, rollFrac = 0  → θ =   0°  (centred at the front)
        //   n =  0, rollFrac = 1  → θ = +36°  (rolling up over the top)
        //   n =  1, rollFrac = 0  → θ = −36°  (waiting below the front)
        //   n = −1, rollFrac = 0  → θ = +36°  (just rolled away upward)
        //
        // Positive θ is above the centre on the screen, so increasing
        // rollFrac (or equivalently increasing currentValue) makes the
        // surface move UPWARD — the standard car-odometer direction.
        ctx.font = 'bold ' + fontPx + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var visibleRange = 3;
        var slots = [];
        var n;
        for (n = -visibleRange; n <= visibleRange; n++) {
            var theta = anglePerDigit * (rollFrac - n);
            if (Math.abs(theta) > maxAngle) continue;
            slots.push({ n: n, theta: theta });
        }
        // Draw the back-most digits first so that closer (brighter)
        // digits paint over them — emulates physical occlusion.
        slots.sort(function(a, b) {
            return Math.abs(b.theta) - Math.abs(a.theta);
        });

        var i;
        for (i = 0; i < slots.length; i++) {
            var slot = slots[i];
            var digitVal = (((digit + slot.n) % 10) + 10) % 10;
            var sin = Math.sin(slot.theta);
            var cos = Math.cos(slot.theta);
            var yScreen = cy - radius * sin;
            var vScale = cos < 0.05 ? 0.05 : cos;
            var alphaD = Math.pow(cos < 0 ? 0 : cos, 1.3);
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

        // ── Cylinder lighting overlays ──
        //
        // Even on a perfectly diffuse cylinder, the top and bottom
        // halves catch less light than the central band. These two
        // gradients deepen the perceived curvature on top of the digits.
        var topShade = ctx.createLinearGradient(faceX, y, faceX, y + h * 0.50);
        topShade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
        topShade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topShade;
        ctx.fillRect(faceX, y, faceW, h * 0.50);

        var botShade = ctx.createLinearGradient(faceX, y + h * 0.50, faceX, y + h);
        botShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
        botShade.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = botShade;
        ctx.fillRect(faceX, y + h * 0.50, faceW, h * 0.50);

        // Specular-style highlight band at the very front (theta ≈ 0).
        var hiH = Math.max(2, h * 0.12);
        var hiY = cy - hiH / 2;
        var hiBand = ctx.createLinearGradient(faceX, hiY, faceX, hiY + hiH);
        hiBand.addColorStop(0, 'rgba(255, 245, 215, 0)');
        hiBand.addColorStop(0.5, 'rgba(255, 245, 215, 0.22)');
        hiBand.addColorStop(1, 'rgba(255, 245, 215, 0)');
        ctx.fillStyle = hiBand;
        ctx.fillRect(faceX, hiY, faceW, hiH);

        ctx.restore(); // unclip

        // ── Thin dark frame around the cylinder face ──
        ctx.lineWidth = Math.max(0.6, faceW * 0.03);
        ctx.strokeStyle = 'rgba(30, 16, 6, 0.95)';
        ctx.strokeRect(faceX + 0.5, y + 0.5, faceW - 1, h - 1);

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    // Decimal-point dot drawn between two drums on the ivory plate —
    // small dark dot to match the engraved label aesthetic.
    function drawDecimalPoint(ctx, x, y, size) {
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20, 12, 4, 0.9)';
        ctx.fill();
    }

    // ── Carry-cascade roll fraction ─────────────────────────────
    //
    // Given a non-negative scaled integer-ish value (after multiplying
    // by 10^decimals so all drums are integer positions), return the
    // visual roll fraction for digit position k (0 = rightmost).
    // Higher digits only roll when the digit below them is in the last
    // 10 % of its own roll — the same way a real car odometer behaves.
    //
    // Returns an array of length numDrums:
    //   rolls[k] in [0, 1)  →  current digit floor(value / 10^k) % 10
    //                          plus this fractional roll toward the next.
    function computeRollFracs(scaledValue, numDrums) {
        var rolls = new Array(numDrums);
        rolls[0] = scaledValue - Math.floor(scaledValue);

        for (var k = 1; k < numDrums; k++) {
            var lowerPos = scaledValue / pow10(k - 1);
            var lowerDigit = Math.floor(lowerPos) % 10;
            if (lowerDigit === 9 && rolls[k - 1] >= 0.9) {
                rolls[k] = (rolls[k - 1] - 0.9) * 10;
            } else {
                rolls[k] = 0;
            }
        }
        return rolls;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('steampunk-odometer-viz');

            // Version marker — visible in the browser console to help
            // verify which build is active after an app upgrade. Splunk
            // caches static assets aggressively; if you see an older
            // version logged here, hit /en-US/_bump and hard-refresh.
            if (typeof console !== 'undefined' && console.info) {
                console.info('[steampunk_odometer v1.3.2] initialized');
            }

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._target = 0;          // latest value from data
            this._current = 0;         // tweened value used for rendering
            this._lastFrameTs = 0;
            this._animFrame = null;
            this._idleFrames = 0;
            this._firstSample = true;
            this._lastConfig = null;
            this._labelStr = '';
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
            // the brass frame and zeroed drums render and the panel is
            // never blank.
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

            var rawVal = 0;
            if (data.colIdx && data.colIdx[valueFieldName] !== undefined && data.row) {
                var v = parseFloat(data.row[data.colIdx[valueFieldName]]);
                if (!isNaN(v)) rawVal = v;
            }
            // Odometers count up only — clamp negatives to 0
            if (rawVal < 0) rawVal = 0;

            var labelStr = '';
            if (data.colIdx && data.colIdx[labelFieldName] !== undefined && data.row) {
                var raw = data.row[data.colIdx[labelFieldName]];
                if (raw !== null && raw !== undefined) {
                    labelStr = String(raw);
                }
            }
            this._labelStr = labelStr;

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
                if (dt > 0.25) dt = 0.25;

                var cfg = self._lastConfig || {};
                var ns = self.getPropertyNamespaceInfo().propertyNamespace;
                var smoothness = parseFloat(cfg[ns + 'smoothness']);
                if (isNaN(smoothness) || smoothness <= 0) smoothness = 8;

                var diff = self._target - self._current;
                var factor = 1 - Math.exp(-smoothness * dt);
                self._current += diff * factor;

                self._draw();

                // Treat as settled when the visible change-per-frame is
                // small enough that no drum can move a noticeable amount.
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

            var digits = parseInt(config[ns + 'digits'], 10);
            if (isNaN(digits) || digits < 1) digits = 6;
            if (digits > 12) digits = 12;

            var decimals = parseInt(config[ns + 'decimals'], 10);
            if (isNaN(decimals) || decimals < 0) decimals = 0;
            if (decimals > 4) decimals = 4;

            var unit = config[ns + 'unit'];
            if (unit === undefined || unit === null) unit = '';
            unit = String(unit);

            var showRivets = config[ns + 'showRivets'];
            showRivets = (showRivets === undefined) ? true : (String(showRivets) === 'true');

            var showWear = config[ns + 'showWear'];
            showWear = (showWear === undefined) ? true : (String(showWear) === 'true');

            // Digit spacing: 0 = tight (digits nearly touch on the drum),
            // 100 = loose (lots of breathing room). Linearly mapped to a
            // font-to-drum-height ratio in [0.50, 0.30].
            var digitSpacing = parseInt(config[ns + 'digitSpacing'], 10);
            if (isNaN(digitSpacing)) digitSpacing = 50;
            if (digitSpacing < 0) digitSpacing = 0;
            if (digitSpacing > 100) digitSpacing = 100;

            // ── Canvas sizing ──
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

            // ── Brass-ring + ivory-plate frame ──
            var panelPad = Math.max(4, Math.min(w, h) * 0.025);
            var panelX = panelPad;
            var panelY = panelPad;
            var panelW = w - panelPad * 2;
            var panelH = h - panelPad * 2;
            if (panelW < 30 || panelH < 30) return;

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
                (config[ns + 'digits'] || '') + '|' +
                (config[ns + 'decimals'] || '') + '|' +
                (config[ns + 'digitSpacing'] || '') + '|' +
                (config[ns + 'showRivets'] || '') + '|' +
                (config[ns + 'showWear'] || '')
            ) || 4242;

            var plate = drawFrame(ctx, panelX, panelY, panelW, panelH, showRivets, showWear, wearSeed);

            // ── Layout: drums on the ivory plate, label engraved below ──
            var inset = Math.max(6, Math.min(plate.w, plate.h) * 0.06);
            var bayX = plate.x + inset;
            var bayY = plate.y + inset;
            var bayW = plate.w - inset * 2;
            var safeLabel = this._labelStr || '';
            if (SplunkVisualizationUtils && SplunkVisualizationUtils.escapeHtml) {
                safeLabel = SplunkVisualizationUtils.escapeHtml(safeLabel);
            }
            var labelReserve = safeLabel ? Math.max(18, plate.h * 0.22) : 0;
            var bayH = plate.h - inset * 2 - labelReserve;
            if (bayH < 20) bayH = 20;

            // Reserve room on the right for the unit text if present
            var unitGap = 0;
            var unitText = unit;
            var unitFontPx = 0;
            if (unitText) {
                unitFontPx = Math.max(8, bayH * 0.28);
                ctx.font = 'bold ' + unitFontPx + 'px sans-serif';
                unitGap = ctx.measureText(unitText).width + bayH * 0.18;
            }

            // ── Drum slot sizing ──
            //
            // Aspect ratio is taller (1 : 1.75) than the old flat drum
            // (1 : 1.55) so the cylindrical projection has more vertical
            // room to spread the visible digits across.
            var totalDrums = digits + decimals;
            var decimalPointW = decimals > 0 ? bayH * 0.16 : 0;
            var availDrumW = bayW - decimalPointW - unitGap;
            var drumAspect = 1.75; // height / width
            var maxDrumW = availDrumW / totalDrums;
            var drumH = Math.min(bayH, maxDrumW * drumAspect);
            var drumW = Math.min(maxDrumW, drumH / drumAspect);
            drumH = drumW * drumAspect;
            // If we have plenty of horizontal room, scale up so the drums
            // fill the bay height for maximum legibility.
            if (drumH < bayH * 0.95) {
                var scale = Math.min(bayH / drumH, (availDrumW / totalDrums) / drumW);
                drumW *= scale;
                drumH *= scale;
            }
            if (drumH > bayH) drumH = bayH;

            var totalRowW = totalDrums * drumW + decimalPointW;
            var rowStartX = bayX + (bayW - totalRowW - unitGap) / 2;
            var rowY = bayY + (bayH - drumH) / 2;

            // ── Compute rolling state ──
            var displayVal = this._current;
            if (displayVal < 0) displayVal = 0;
            var scaledVal = displayVal * pow10(decimals);

            // Cap so we never overflow the drum count
            var maxScaled = pow10(totalDrums) - 1;
            if (scaledVal > maxScaled) scaledVal = maxScaled;

            var rolls = computeRollFracs(scaledVal, totalDrums);
            // Font sized from the user-controlled spacing setting.
            // The vertical screen distance between two adjacent slots
            // on the cylinder surface is R · sin(36°) ≈ 0.295 · drumH.
            // With bold monospace, the rendered glyph half-height is
            // ~0.36 · fontPx; the next-slot digit is foreshortened to
            // 0.81 · that. The mapping below makes digits visibly
            // overlap at spacing = 0 and leaves clear breathing room
            // at spacing = 100.
            var fontFactor = 0.50 - (digitSpacing / 100) * 0.20;
            var digitFontPx = Math.max(8, drumH * fontFactor);

            // Draw drums from left (highest position) to right (lowest)
            var cursorX = rowStartX;
            for (var k = totalDrums - 1; k >= 0; k--) {
                var dx = cursorX;
                var dy = rowY;
                var digit = Math.floor(scaledVal / pow10(k)) % 10;
                var rollFrac = rolls[k];

                drawDigitDrum(ctx, dx, dy, drumW, drumH, digit, rollFrac, digitFontPx, showWear, k, wearSeed);

                cursorX += drumW;

                // Decimal point sits on the ivory plate between integer
                // and fractional drums (just below the row baseline).
                if (decimals > 0 && k === decimals) {
                    var dotSize = decimalPointW * 0.32;
                    drawDecimalPoint(
                        ctx,
                        cursorX + decimalPointW / 2,
                        dy + drumH * 0.82,
                        dotSize
                    );
                    cursorX += decimalPointW;
                }
            }

            // ── Unit text on the right of the drums (engraved style) ──
            if (unitText) {
                ctx.font = 'bold ' + unitFontPx + 'px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(42, 26, 8, 0.85)';
                ctx.fillText(unitText, cursorX + bayH * 0.10, rowY + drumH / 2);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }

            // ── Engraved label on the ivory plate below the drums ──
            if (safeLabel) {
                var labelY = rowY + drumH + labelReserve / 2;
                var labelFontPx = clamp(plate.h * 0.14, 10, 28);

                ctx.font = 'bold ' + labelFontPx + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Auto-shrink so the label never overflows the plate
                var maxLabelW = plate.w * 0.86;
                while (ctx.measureText(safeLabel).width > maxLabelW && labelFontPx > 6) {
                    labelFontPx -= 1;
                    ctx.font = 'bold ' + labelFontPx + 'px sans-serif';
                }

                // Engraved look — dark fill with a subtle ivory highlight
                // peeking out below to imply depth.
                var cxLab = plate.x + plate.w / 2;
                ctx.fillStyle = 'rgba(255, 230, 180, 0.45)';
                ctx.fillText(safeLabel, cxLab, labelY + 1.2);
                ctx.fillStyle = 'rgba(42, 26, 8, 0.90)';
                ctx.fillText(safeLabel, cxLab, labelY);

                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }
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
