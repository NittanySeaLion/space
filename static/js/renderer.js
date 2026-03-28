'use strict';

// ── Planet metadata ─────────────────────────────────────────────────────────
const PDEF = [
  { name: 'Sun',     col: [255,245,220], sz: 10, cr: 0,  isSun: true },
  { name: 'Mercury', col: [185,170,150], sz: 3,  cr: 0 },
  { name: 'Venus',   col: [255,210,160], sz: 5,  cr: 10 },
  { name: 'Mars',    col: [230,100,60],  sz: 4,  cr: 7 },
  { name: 'Jupiter', col: [255,200,130], sz: 7,  cr: 18 },
  { name: 'Saturn',  col: [228,208,168], sz: 6,  cr: 14 },
  { name: 'Uranus',  col: [155,225,235], sz: 4,  cr: 8 },
  { name: 'Neptune', col: [100,145,255], sz: 4,  cr: 8 },
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
function drawSun(x, y, alt, az) {
  if (alt < -2 || !inView(alt, az)) return;
  const r = SR * (.5 / 90) * 2;
  [r*18,r*10,r*5,r*2.5].forEach((gr, i) => {
    const a = [.015,.04,.10,.25][i];
    const g = rg(x, y, 0, gr, [[0,`rgba(255,255,230,${a})`],[1,'rgba(255,240,180,0)']]);
    cx.beginPath(); cx.arc(x, y, gr, 0, TAU); cx.fillStyle = g; cx.fill();
  });
  const cg = rg(x, y, r*.5, r*2.2, [[0,'rgba(255,255,255,1)'],[.4,'rgba(255,248,220,1)'],[1,'rgba(255,230,150,0)']]);
  cx.beginPath(); cx.arc(x, y, r*2.2, 0, TAU); cx.fillStyle = cg; cx.fill();
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fillStyle = 'rgba(255,255,255,1)'; cx.fill();
  if (showLabels && alt > 2) { cx.font = '9px Courier New'; cx.fillStyle = 'rgba(255,240,180,.5)'; cx.fillText('SUN', x+r*2.5+4, y-r-2); }
}

// ── Draw generic planet ─────────────────────────────────────────────────────
function drawPlanet(p) {
  if (p.alt < -2 || !inView(p.alt, p.az)) return null;
  const { x, y } = proj(p.alt, p.az);
  if (x < -80 || x > W+80 || y < -80 || y > H+80) return null;
  const ext = Math.min(1, Math.max(0, (p.alt + 0.5) / 1.5));
  const [r, g, b] = p.col, sz = p.sz;
  if (p.cr > 0) {
    const cg = rg(x, y, 0, sz+p.cr, [[0,`rgba(${r},${g},${b},${ext})`],[.3,`rgba(${r},${g},${b},${ext*.4})`],[.7,`rgba(${r},${g},${b},${ext*.08})`],[1,`rgba(${r},${g},${b},0)`]]);
    cx.beginPath(); cx.arc(x, y, sz+p.cr, 0, TAU); cx.fillStyle = cg; cx.fill();
  }
  const dg = rg(x, y, 0, sz, [[0,'rgba(255,255,255,1)'],[.4,`rgba(${r},${g},${b},${ext})`],[1,`rgba(${Math.max(0,r-50)},${Math.max(0,g-50)},${Math.max(0,b-50)},${ext})`]]);
  cx.beginPath(); cx.arc(x, y, sz, 0, TAU); cx.fillStyle = dg; cx.fill();
  if (showLabels && p.alt > 1 && sz >= 4) { cx.font = '9px Courier New'; cx.fillStyle = `rgba(200,220,240,${ext*.5})`; cx.fillText(p.name, x+sz+4, y-sz-2); }
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
    cx.drawImage(panoramaImg, 0, 0, imgW, imgH, 0, groundY, W, surfH);
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
