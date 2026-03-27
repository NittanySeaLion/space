'use strict';

// ── Milky Way panorama (ESO/S. Brunier, equirectangular in RA/Dec) ──────────
let mwImg = null;
let mwReady = false;
let mwCanvas = null;   // offscreen canvas with pre-rendered projection
let mwLastLST = -999;  // LST when last rendered
let mwLastAz = -999;

function loadMilkyWay() {
  const img = new Image();
  img.onload = () => { mwImg = img; mwReady = true; };
  img.src = '/static/photos/milkyway.jpg';
}

// Pre-render the Milky Way projection to an offscreen canvas.
// Only regenerated when LST or viewAz changes significantly.
function renderMWToCache(lst, lat) {
  if (!mwCanvas || mwCanvas.width !== W || mwCanvas.height !== H) {
    mwCanvas = document.createElement('canvas');
    mwCanvas.width = W;
    mwCanvas.height = H;
  }

  const mc = mwCanvas.getContext('2d');
  mc.clearRect(0, 0, W, H);

  const ppd = pxPerDeg();
  const skyH = H * (1 - GROUND_FRAC);
  const imgW = mwImg.naturalWidth;
  const imgH = mwImg.naturalHeight;

  const raStep = 3;   // coarser = faster
  const decStep = 3;

  mc.globalAlpha = 0.35;

  for (let ra = 0; ra < 360; ra += raStep) {
    for (let dec = -80; dec <= 80; dec += decStep) {
      const aa = altaz(ra, dec, lat, lst);
      if (aa.alt < -5) continue;

      let daz = ((aa.az - viewAz + 540) % 360) - 180;
      if (abs(daz) > HFOV * R2D * 0.55) continue;
      const dalt = aa.alt - viewAlt;
      const vfov = skyH / ppd;
      if (abs(dalt) > vfov * 0.55) continue;

      const x = CX + daz * ppd;
      const y = skyH / 2 - dalt * ppd;

      // Source position in panorama: RA 0-360 left-to-right, Dec +90 top to -90 bottom
      const srcX = ((ra / 360) * imgW) | 0;
      const srcY = (((90 - dec) / 180) * imgH) | 0;
      const srcW = Math.max(1, ((raStep / 360) * imgW) | 0);
      const srcH = Math.max(1, ((decStep / 180) * imgH) | 0);

      const destSz = Math.max(3, raStep * ppd * 1.15);
      mc.drawImage(mwImg, srcX, srcY, srcW, srcH, x - destSz/2, y - destSz/2, destSz, destSz);
    }
  }

  mwLastLST = lst;
  mwLastAz = viewAz;
}

let mwDeferred = true;  // skip first few frames so sky loads fast
let mwFrameCount = 0;

function drawMW(lst, lat) {
  if (!mwReady) return;

  // Defer MW rendering — let stars/Earth paint first
  if (mwDeferred) {
    mwFrameCount++;
    if (mwFrameCount < 10) return;  // skip first ~10 frames
    mwDeferred = false;
  }

  // Re-render cache if LST or viewAz changed significantly, or canvas resized
  const needsUpdate = !mwCanvas ||
    mwCanvas.width !== W ||
    abs(lst - mwLastLST) > 0.5 ||
    abs(viewAz - mwLastAz) > 0.5;

  if (needsUpdate) renderMWToCache(lst, lat);

  cx.drawImage(mwCanvas, 0, 0);
}
