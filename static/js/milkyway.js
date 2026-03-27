'use strict';

// ── Milky Way panorama (ESO/S. Brunier, equirectangular in RA/Dec) ──────────
let mwImg = null;
let mwReady = false;

function loadMilkyWay() {
  const img = new Image();
  img.onload = () => { mwImg = img; mwReady = true; };
  img.src = '/static/photos/milkyway.jpg';
}

// Render the Milky Way by projecting strips of the panorama onto the sky.
// The panorama is equirectangular: x = RA (0-360°), y = Dec (+90 to -90°).
// We sample vertical strips at each RA and draw them at the corresponding
// alt/az screen position.
function drawMW(lst, lat) {
  if (!mwReady) return;

  const ppd = pxPerDeg();
  const skyH = H * (1 - GROUND_FRAC);
  const imgW = mwImg.naturalWidth;
  const imgH = mwImg.naturalHeight;

  // How many degrees each image pixel column spans
  const raPerPx = 360 / imgW;
  const decPerPx = 180 / imgH;

  // Step in RA degrees — wider steps = faster, finer = smoother
  const raStep = 2;
  // Vertical extent to draw at each strip (degrees of Dec above/below)
  const decExtent = 90;

  cx.save();
  cx.globalAlpha = 0.35;  // subtle background glow

  for (let ra = 0; ra < 360; ra += raStep) {
    // Check if any part of this RA strip is visible
    // Sample at Dec = 0 (galactic plane roughly) for quick visibility check
    const aa0 = altaz(ra, 0, lat, lst);
    const aa1 = altaz(ra, 30, lat, lst);
    const aa2 = altaz(ra, -30, lat, lst);
    const anyVisible = [aa0, aa1, aa2].some(a => a.alt > -10 && inView(a.alt, a.az));
    if (!anyVisible) continue;

    // Source x position in the panorama
    // ESO panorama: RA=0 at left edge, RA=360 at right edge
    const srcX = Math.round((ra / 360) * imgW) % imgW;
    const srcW = Math.max(1, Math.round(raStep / raPerPx));

    // Draw vertical segments of this RA strip
    for (let dec = -decExtent; dec < decExtent; dec += raStep) {
      const aa = altaz(ra, dec, lat, lst);
      if (aa.alt < -5 || !inView(aa.alt, aa.az)) continue;

      const { x, y } = proj(aa.alt, aa.az);
      if (x < -50 || x > W + 50 || y < -50 || y > skyH + 50) continue;

      // Source y position: Dec +90 at top (y=0), Dec -90 at bottom (y=imgH)
      const srcY = Math.round(((90 - dec) / 180) * imgH);
      const srcH = Math.max(1, Math.round(raStep / decPerPx));

      // Destination size in pixels
      const destSz = Math.max(2, raStep * ppd * 1.1);

      cx.drawImage(mwImg, srcX, srcY, srcW, srcH, x - destSz/2, y - destSz/2, destSz, destSz);
    }
  }

  cx.restore();
}
