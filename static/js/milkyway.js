'use strict';

// ── Milky Way panorama (ESO/S. Brunier, equirectangular in RA/Dec) ──────────
// Pixel-based inverse projection: for each screen pixel, reverse-project to
// RA/Dec and sample the panorama.  Rendered to offscreen canvas, cached until
// LST or viewAz changes significantly.

let mwImg = null;
let mwReady = false;
let mwCanvas = null;
let mwLastLST = -999;
let mwLastAz  = -999;
let mwPixels  = null;   // ImageData of the panorama (extracted once)
let mwPW = 0, mwPH = 0;

function loadMilkyWay() {
  const img = new Image();
  img.onload = () => { mwImg = img; mwReady = true; };
  img.src = '/static/photos/milkyway.jpg';
}

// ── Render to offscreen cache ────────────────────────────────────────────────
function renderMWToCache(lst, lat) {
  if (!mwCanvas || mwCanvas.width !== W || mwCanvas.height !== H) {
    mwCanvas = document.createElement('canvas');
    mwCanvas.width  = W;
    mwCanvas.height = H;
  }

  // Extract panorama pixel data once
  if (!mwPixels) {
    const tc  = document.createElement('canvas');
    tc.width  = mwImg.naturalWidth;
    tc.height = mwImg.naturalHeight;
    const tctx = tc.getContext('2d');
    tctx.drawImage(mwImg, 0, 0);
    mwPixels = tctx.getImageData(0, 0, tc.width, tc.height);
    mwPW = tc.width;
    mwPH = tc.height;
  }

  const mc   = mwCanvas.getContext('2d');
  const ppd  = pxPerDeg();
  const skyH = (H * (1 - GROUND_FRAC)) | 0;

  // Work directly with pixel data for seamless result
  const imgData = mc.createImageData(W, skyH);
  const out = imgData.data;
  const src = mwPixels.data;

  const latR   = lat * D2R;
  const sinLat = sin(latR);
  const cosLat = cos(latR);
  const stride = 2;            // sample every 2nd pixel (fill 2×2 blocks)
  const alphaVal = (0.35 * 255) | 0;
  const hfovLim = HFOV * R2D * 0.55;

  for (let sy = 0; sy < skyH; sy += stride) {
    const dalt = (skyH / 2 - sy) / ppd;
    const alt  = viewAlt + dalt;
    if (alt < -5 || alt > 92) continue;

    const altR   = alt * D2R;
    const sinAlt = sin(altR);
    const cosAlt = cos(altR);

    for (let sx = 0; sx < W; sx += stride) {
      const daz = (sx - CX) / ppd;
      if (abs(daz) > hfovLim) continue;

      const az  = ((viewAz + daz) % 360 + 360) % 360;
      const azR = az * D2R;

      // Inverse horizontal → equatorial
      const sinDec = sinAlt * sinLat + cosAlt * cosLat * cos(azR);
      const decDeg = asin(Math.max(-1, Math.min(1, sinDec))) * R2D;
      if (decDeg < -85 || decDeg > 85) continue;

      const cosDec = cos(decDeg * D2R);
      let cosHA = (sinAlt - sinDec * sinLat) / (cosDec * cosLat + 1e-12);
      cosHA = Math.max(-1, Math.min(1, cosHA));
      let ha = acos(cosHA) * R2D;        // [0, 180]
      if (az <= 180) ha = 360 - ha;       // eastern sky → HA in [180, 360]

      const ra = ((lst - ha) % 360 + 360) % 360;

      // Sample panorama (nearest-neighbor)
      const px = ((ra / 360) * mwPW) | 0;
      const py = (((90 - decDeg) / 180) * mwPH) | 0;
      if (px < 0 || px >= mwPW || py < 0 || py >= mwPH) continue;

      const si = (py * mwPW + px) * 4;
      const r = src[si], g = src[si + 1], b = src[si + 2];

      // Fill stride × stride block
      for (let dy = 0; dy < stride && sy + dy < skyH; dy++) {
        for (let dx = 0; dx < stride && sx + dx < W; dx++) {
          const oi = ((sy + dy) * W + (sx + dx)) * 4;
          out[oi]     = r;
          out[oi + 1] = g;
          out[oi + 2] = b;
          out[oi + 3] = alphaVal;
        }
      }
    }
  }

  mc.clearRect(0, 0, W, H);
  mc.putImageData(imgData, 0, 0);
  mwLastLST = lst;
  mwLastAz  = viewAz;
}

// ── Draw (defers first few frames so stars/Earth appear first) ───────────────
let mwDeferred   = true;
let mwFrameCount = 0;

function drawMW(lst, lat) {
  if (!mwReady) return;

  if (mwDeferred) {
    mwFrameCount++;
    if (mwFrameCount < 10) return;
    mwDeferred = false;
  }

  const needsUpdate = !mwCanvas ||
    mwCanvas.width  !== W ||
    abs(lst - mwLastLST) > 0.5 ||
    abs(viewAz - mwLastAz) > 0.5;

  if (needsUpdate) renderMWToCache(lst, lat);

  cx.drawImage(mwCanvas, 0, 0);
}
