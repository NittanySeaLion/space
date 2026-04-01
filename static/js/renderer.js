'use strict';

// ── Planet metadata ─────────────────────────────────────────────────────────
const PDEF = [
  { name: 'Sun',     col: [255,245,220], sz: 10, cr: 0,  isSun: true },
  { name: 'Mercury', col: [185,170,150], sz: 2,  cr: 0 },
  { name: 'Venus',   col: [255,210,160], sz: 3,  cr: 3 },
  { name: 'Mars',    col: [230,100,60],  sz: 2,  cr: 2 },
  { name: 'Jupiter', col: [255,200,130], sz: 4,  cr: 5 },
  { name: 'Saturn',  col: [228,208,168], sz: 3,  cr: 4 },
  { name: 'Uranus',  col: [155,225,235], sz: 2,  cr: 2 },
  { name: 'Neptune', col: [100,145,255], sz: 2,  cr: 2 },
  { name: 'Earth',   col: [80,150,255],  sz: 0,  cr: 0, isEarth: true },
];

// ── Canvas globals (set by main.js resize) ──────────────────────────────────
let W, H, CX, CY, SR;

function rg(x, y, r0, r1, stops) {
  const g = cx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

// ── Equirectangular projection helpers ──────────────────────────────────────
function pxPerDeg() {
  const base = W / (HFOV * R2D);
  // Cap VFOV at 90° to prevent extreme distortion on tall/narrow screens
  const skyH = H * (1 - GROUND_FRAC);
  const minPpd = skyH / 90;
  return Math.max(base, minPpd);
}

function computeViewAlt() {
  if (LOC.fixedViewAlt !== null) return LOC.fixedViewAlt;
  const skyH = H * (1 - GROUND_FRAC);
  const vfovSky = skyH / pxPerDeg();
  // Earth near horizon — place it in lower third of sky zone
  return vfovSky * 0.3;
}

// ── Projection (equirectangular, mapped to sky zone) ────────────────────────
function proj(alt, az) {
  let daz = ((az - viewAz + 540) % 360) - 180;
  const ppd = pxPerDeg();
  const skyH = H * (1 - GROUND_FRAC);
  const skyCY = skyH / 2;
  const x = CX + daz * ppd;
  const y = skyCY - (alt - viewAlt) * ppd;
  return { x, y };
}

function inView(alt, az) {
  let daz = ((az - viewAz + 540) % 360) - 180;
  const skyH = H * (1 - GROUND_FRAC);
  const vfovSky = skyH / pxPerDeg();
  const dalt = alt - viewAlt;
  return abs(daz) < HFOV * R2D * 0.55 && abs(dalt) < vfovSky * 0.55;
}

// ── B-V color index to RGB (Ballesteros 2012 → Tanner Helland color temp) ───
function bv2rgb(bv) {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  const t = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  const x = t / 100;
  // Tanner Helland color temperature → RGB
  const r = x > 66 ? 329.7 * pow(x - 60, -0.1332) : 255;
  const g = x > 66 ? 288.1 * pow(x - 60, -0.0755) : 99.47 * Math.log(x) - 161.12;
  const bl = x >= 66 ? 255 : (x > 20 ? 138.52 * Math.log(x - 10) - 305.04 : 0);
  return [Math.max(0, Math.min(255, r)) | 0,
          Math.max(0, Math.min(255, g)) | 0,
          Math.max(0, Math.min(255, bl)) | 0];
}

// ── Draw star (airless Moon — perfectly steady, no scintillation) ───────────
function drawStar(x, y, sz, rgb, alpha) {
  if (alpha < .015) return;
  const [r, g, b] = rgb;
  const outer = Math.max(1.5, sz * 2.4);
  const grd = rg(x, y, 0, outer, [
    [0,   `rgba(${r},${g},${b},${alpha})`],
    [.15, `rgba(${r},${g},${b},${alpha*.78})`],
    [.48, `rgba(${r},${g},${b},${alpha*.16})`],
    [1,   `rgba(${r},${g},${b},0)`]
  ]);
  cx.beginPath(); cx.arc(x, y, outer, 0, TAU); cx.fillStyle = grd; cx.fill();
  cx.beginPath(); cx.arc(x, y, Math.max(.2, sz * .25), 0, TAU);
  cx.fillStyle = `rgba(255,255,255,${alpha*.98})`; cx.fill();
}

// ── Draw Earth (phase-correct, rotating EPIC photo or procedural) ───────────
let earthImg = null;
let earthImgLoading = false;
let earthCaptureTime = null;  // milliseconds since epoch

function fetchEarthImage() {
  if (earthImgLoading) return;
  earthImgLoading = true;
  fetch('/api/earth-image')
    .then(resp => {
      const ct = resp.headers.get('X-EPIC-Capture-Time');
      if (ct) earthCaptureTime = new Date(ct.replace(' ', 'T') + 'Z').getTime();
      return resp.blob();
    })
    .then(blob => {
      if (blob.size < 100) { earthImgLoading = false; return; }
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { earthImg = img; };
      img.onerror = () => { earthImgLoading = false; };
      img.src = url;
    })
    .catch(() => { earthImgLoading = false; });
}

function drawEarth(x, y, alt, az, phase) {
  if (alt < -2 || !inView(alt, az)) return;
  const r = Math.max(8, 0.95 * pxPerDeg() * 1.6);

  cx.save();
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.clip();

  // Black base fill — matches space background at clip edges
  cx.fillStyle = '#000';
  cx.fillRect(x-r, y-r, r*2, r*2);

  if (earthImg) {
    // Rotate Earth image based on elapsed time since EPIC capture
    cx.save();
    cx.translate(x, y);
    if (earthCaptureTime) {
      const elapsedHrs = (Date.now() - earthCaptureTime) / 3600000;
      cx.rotate(-elapsedHrs * 15 * D2R);  // Earth rotates 15°/hr west-to-east
    }
    const imgSz = Math.min(earthImg.naturalWidth, earthImg.naturalHeight);
    const sx = (earthImg.naturalWidth - imgSz) / 2;
    const sy = (earthImg.naturalHeight - imgSz) / 2;
    // Scale up 40% so Earth disk overfills clip (EPIC Earth fills ~75% of frame)
    const rs = r * 1.4;
    cx.drawImage(earthImg, sx, sy, imgSz, imgSz, -rs, -rs, rs*2, rs*2);
    cx.restore();
  } else {
    // Procedural blue marble fallback
    const earthGrd = rg(x-r*.3, y-r*.3, r*.1, r*1.1, [
      [0,'rgba(130,180,255,1)'],[.25,'rgba(70,140,230,1)'],[.55,'rgba(30,90,200,1)'],[1,'rgba(10,50,150,1)']
    ]);
    cx.fillStyle = earthGrd; cx.fillRect(x-r, y-r, r*2, r*2);
    cx.fillStyle = 'rgba(50,120,50,.65)';
    const patches = [[-.3,-.2,.25,.18],[.05,-.3,.32,.22],[-.5,.05,.18,.28],[.3,.1,.22,.16],[-.1,.25,.28,.16],[.25,-.15,.15,.2]];
    patches.forEach(([ox,oy,w,h]) => { cx.beginPath(); cx.ellipse(x+ox*r, y+oy*r, w*r, h*r, ox*.5, 0, TAU); cx.fill(); });
  }

  // Phase terminator (not rotated — based on Sun-Earth-Moon geometry)
  const phaseAngle = phase * TAU;
  cx.fillStyle = 'rgba(0,0,0,.82)';
  cx.beginPath();
  const startA = PI/2, endA = -PI/2;
  cx.arc(x, y, r, startA, endA);
  const ellW = r * abs(cos(phaseAngle));
  cx.ellipse(x, y, ellW < 1 ? 1 : ellW, r, 0, endA, startA, phase < .5 ? false : true);
  cx.fill();

  cx.restore();

  if (showLabels) {
    cx.font = '10px Courier New';
    cx.fillStyle = 'rgba(150,200,255,.6)';
    if (x + r + 60 > W) {
      cx.textAlign = 'right';
      cx.fillText('EARTH', x - r - 8, y - r);
      cx.textAlign = 'left';
    } else {
      cx.fillText('EARTH', x + r + 8, y - r);
    }
  }
}

// ── Draw Sun ────────────────────────────────────────────────────────────────
// On airless Moon: sharp disk, no atmospheric halo. Only a tiny retinal bloom.
function drawSun(x, y, alt, az) {
  if (alt < -2 || !inView(alt, az)) return;
  const r = SR * (.5 / 90) * 2;  // ~0.5° angular diameter
  // Tiny retinal bloom (eye overload, not atmospheric) — radius ~2x disk only
  const bloom = rg(x, y, r, r * 3, [[0,'rgba(255,255,220,0.18)'],[1,'rgba(255,255,200,0)']]);
  cx.beginPath(); cx.arc(x, y, r * 3, 0, TAU); cx.fillStyle = bloom; cx.fill();
  // Sharp solar disk — white-hot center, slightly yellow-white limb
  const disk = rg(x, y, 0, r, [[0,'rgba(255,255,255,1)'],[.7,'rgba(255,252,230,1)'],[1,'rgba(255,248,200,1)']]);
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fillStyle = disk; cx.fill();
  if (showLabels && alt > 0) { cx.font = '9px Courier New'; cx.fillStyle = 'rgba(255,240,180,.5)'; cx.fillText('SUN', x+r+6, y-r); }
}

// ── Draw generic planet ─────────────────────────────────────────────────────
function drawPlanet(p, sun) {
  if (p.alt < -2 || !inView(p.alt, p.az)) return null;
  const { x, y } = proj(p.alt, p.az);
  if (x < -80 || x > W+80 || y < -80 || y > H+80) return null;
  const ext = Math.min(1, Math.max(0, (p.alt + 0.5) / 1.5));
  const [r, g, b] = p.col, sz = p.sz;
  if (p.cr > 0) {
    const cg = rg(x, y, 0, sz+p.cr, [[0,`rgba(${r},${g},${b},${ext*.5})`],[.3,`rgba(${r},${g},${b},${ext*.15})`],[1,`rgba(${r},${g},${b},0)`]]);
    cx.beginPath(); cx.arc(x, y, sz+p.cr, 0, TAU); cx.fillStyle = cg; cx.fill();
  }
  const dg = rg(x, y, 0, sz, [[0,'rgba(255,255,255,1)'],[.4,`rgba(${r},${g},${b},${ext})`],[1,`rgba(${Math.max(0,r-50)},${Math.max(0,g-50)},${Math.max(0,b-50)},${ext})`]]);
  cx.beginPath(); cx.arc(x, y, sz, 0, TAU); cx.fillStyle = dg; cx.fill();

  // Phase terminator — only when phase data available and planet is noticeably non-full
  if (p.phaseAngle !== undefined && p.illum < 0.97 && sun) {
    const { x: sx, y: sy } = proj(sun.alt, sun.az);
    const sunAngle = atan2(sy - y, sx - x);
    cx.save();
    cx.beginPath(); cx.arc(x, y, sz, 0, TAU); cx.clip();
    cx.translate(x, y);
    cx.rotate(sunAngle + PI); // dark hemisphere faces away from Sun
    // Right half = lit (toward Sun after rotation). Draw dark half on left side.
    // Terminator ellipse width: sz * |cos(phaseAngle)|
    // When phaseAngle=0 (full), ellW=sz → terminator is behind lit hemisphere (no dark)
    // When phaseAngle=PI/2 (quarter), ellW=0 → straight terminator
    // When phaseAngle=PI (new), ellW=sz → full dark
    const ellW = Math.max(0.05, sz * Math.abs(cos(p.phaseAngle)));
    cx.fillStyle = 'rgba(0,0,0,0.90)';
    cx.beginPath();
    // Left semicircle (always dark)
    cx.arc(0, 0, sz, PI/2, -PI/2, false);
    // Terminator ellipse: convex toward right (lit) when illum>0.5, convex toward left when illum<0.5
    cx.ellipse(0, 0, ellW, sz, 0, -PI/2, PI/2, p.illum > 0.5);
    cx.fill();
    cx.restore();
  }

  if (showLabels && p.alt > 1) { cx.font = '9px Courier New'; cx.fillStyle = `rgba(200,220,240,${ext*.5})`; cx.fillText(p.name, x+sz+6, y-sz-2); }
  return { x, y };
}


// ── Panorama-based lunar surface ────────────────────────────────────────────
let panoramaImg = null;
let panoramaReady = false;

function loadPhotos() {
  if (LOC.hasPanorama) {
    const img = new Image();
    img.onload = () => {
      panoramaImg = img;
      panoramaReady = true;
      document.getElementById('hsrc').textContent = 'ALDRIN PANORAMA \u00b7 LUNAR SURFACE';
    };
    img.onerror = () => {
      document.getElementById('hsrc').textContent = LOC.name;
    };
    img.src = '/static/photos/panorama.jpg';
  }
  loadMilkyWay();
  fetchEarthImage();
}

// ── Draw lunar surface ──────────────────────────────────────────────────────
function drawHorizon() {
  if (GROUND_FRAC <= 0) return;  // Tranquility mode: no ground

  const groundY = Math.round(H * (1 - GROUND_FRAC));
  const surfH = H - groundY;

  const jdNow = toJD(new Date());
  const pf = moonPhaseFrac(jdNow);
  const eIllum = earthIllumination(pf);

  let darkOverlay, earthshineBright;

  if (LOC.shadowedFloor) {
    // Permanently shadowed crater — only earthshine illuminates
    const eAlt = earthFromMoon(jdNow).alt;
    const earthVisible = eAlt > 0 ? Math.min(1, eAlt / 5) : 0;
    earthshineBright = earthVisible * eIllum * 0.15;
    darkOverlay = 1.0 - Math.max(0.03, earthshineBright);
  } else if (LOC.dayNightSurface) {
    // Normal day/night cycle (Orientale, etc.)
    const sunAlt = sunAltitude(jdNow);
    let sunBright = 0;
    if (sunAlt > 5) sunBright = 1.0;
    else if (sunAlt > -2) sunBright = (sunAlt + 2) / 7;
    earthshineBright = (1 - sunBright) * eIllum * 0.12;
    darkOverlay = 1.0 - Math.max(0.08, sunBright * 0.85 + earthshineBright);
  } else {
    darkOverlay = 0;
    earthshineBright = 0;
  }

  cx.save();
  cx.beginPath(); cx.rect(0, groundY, W, surfH); cx.clip();

  if (panoramaReady && panoramaImg) {
    const imgW = panoramaImg.naturalWidth;
    const imgH = panoramaImg.naturalHeight;
    // Scroll panorama with viewAz — tile at screen width
    const ppd = pxPerDeg();
    const dAz = ((viewAz - defaultAz + 540) % 360) - 180;
    const offsetPx = dAz * ppd;
    // Shift modulo screen width, draw current + neighbors for seamless wrap
    const shift = ((-offsetPx % W) + W) % W;
    cx.drawImage(panoramaImg, 0, 0, imgW, imgH, shift - W, groundY, W, surfH);
    cx.drawImage(panoramaImg, 0, 0, imgW, imgH, shift,     groundY, W, surfH);
  } else {
    const grad = cx.createLinearGradient(0, groundY, 0, H);
    grad.addColorStop(0, '#4a453b');
    grad.addColorStop(0.4, '#3a362e');
    grad.addColorStop(1, '#2a2620');
    cx.fillStyle = grad;
    cx.fillRect(0, groundY, W, surfH);
  }

  if (darkOverlay > 0.01) {
    cx.fillStyle = `rgba(0,0,0,${darkOverlay.toFixed(3)})`;
    cx.fillRect(0, groundY, W, surfH);
  }

  if (earthshineBright > 0.01) {
    cx.fillStyle = `rgba(40,80,160,${(earthshineBright * 0.4).toFixed(3)})`;
    cx.fillRect(0, groundY, W, surfH);
  }

  // Golden hour tint (only for locations with day/night cycle)
  if (LOC.dayNightSurface) {
    const sunAlt = sunAltitude(jdNow);
    if (sunAlt > -2 && sunAlt < 12) {
      const golden = Math.max(0, 1 - abs(sunAlt - 3) / 10) * 0.12;
      if (golden > 0.005) {
        cx.fillStyle = `rgba(200,140,50,${golden.toFixed(3)})`;
        cx.fillRect(0, groundY, W, surfH);
      }
    }
  }

  // Softly blend top edge of panorama (just enough to hide the hard pixel edge)
  const surfFadeH = Math.max(8, surfH * 0.06);
  const surfFade = cx.createLinearGradient(0, groundY, 0, groundY + surfFadeH);
  surfFade.addColorStop(0, 'rgba(0,0,0,0.35)');
  surfFade.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = surfFade;
  cx.fillRect(0, groundY, W, surfFadeH);

  // Bottom vignette
  const bot = cx.createLinearGradient(0, H - surfH * 0.25, 0, H);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,0.3)');
  cx.fillStyle = bot;
  cx.fillRect(0, groundY, W, surfH);

  cx.restore();

  // No sky-side fade — the Moon has no atmosphere, sky stays uniform to horizon

  // Compass bearings
  if (showLabels) {
    const ppd = pxPerDeg();
    cx.font = '8px Courier New';
    cx.fillStyle = 'rgba(190,175,140,0.4)';
    cx.textAlign = 'center';
    for (let az2 = 0; az2 < 360; az2 += 10) {
      const daz = ((az2 - viewAz + 540) % 360) - 180;
      if (abs(daz) > HFOV * R2D * 0.54) continue;
      const px = CX + daz * ppd;
      cx.fillText(az2 % 30 === 0 ? az2 + '\u00b0' : '\u00b7', px, groundY - 5);
    }
    cx.textAlign = 'left';
  }
}
