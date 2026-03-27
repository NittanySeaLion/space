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
  const skyH = Math.round(H * (1 - GROUND_FRAC));

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
    if (alt < -20 || alt > 92) continue;  // render below horizon — panorama covers it

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

      // Sample panorama (bilinear interpolation)
      const fx = (ra / 360) * mwPW;
      const fy = ((90 - decDeg) / 180) * mwPH;
      const x0 = fx | 0, y0 = fy | 0;
      if (x0 < 0 || x0 >= mwPW || y0 < 0 || y0 >= mwPH) continue;
      const x1 = Math.min(x0 + 1, mwPW - 1);
      const y1 = Math.min(y0 + 1, mwPH - 1);
      const dxf = fx - x0, dyf = fy - y0;
      const w00 = (1-dxf)*(1-dyf), w10 = dxf*(1-dyf), w01 = (1-dxf)*dyf, w11 = dxf*dyf;
      const i00 = (y0*mwPW+x0)*4, i10 = (y0*mwPW+x1)*4;
      const i01 = (y1*mwPW+x0)*4, i11 = (y1*mwPW+x1)*4;
      const r = (src[i00]*w00 + src[i10]*w10 + src[i01]*w01 + src[i11]*w11) | 0;
      const g = (src[i00+1]*w00 + src[i10+1]*w10 + src[i01+1]*w01 + src[i11+1]*w11) | 0;
      const b = (src[i00+2]*w00 + src[i10+2]*w10 + src[i01+2]*w01 + src[i11+2]*w11) | 0;

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

  cx.save();
  cx.filter = 'blur(2px)';
  cx.drawImage(mwCanvas, 0, 0);
  cx.restore();
}
