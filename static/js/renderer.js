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

// Fixed ground zone: panorama always occupies bottom portion of screen
const GROUND_FRAC = 0.22;  // bottom 22% of screen

function rg(x, y, r0, r1, stops) {
  const g = cx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

// ── Compute viewAlt dynamically so Earth fits in sky zone ──────────────────
function computeViewAlt() {
  // Sky zone occupies top (1-GROUND_FRAC) of screen
  // We want Earth (~67° alt) near the top of sky zone
  // and horizon (0°) near the bottom of sky zone
  // Center the sky projection between 0° and ~70° → viewAlt ≈ 35°
  // But adjust for aspect ratio to keep both visible
  const skyH = H * (1 - GROUND_FRAC);
  const vfovSky = 2 * Math.atan(skyH / W * Math.tan(HFOV / 2)) * R2D;
  // Place Earth at ~85% up the sky zone, horizon at ~5% up
  // viewAlt = center of visible range
  return Math.min(50, Math.max(25, vfovSky * 0.48));
}

// ── Projection (rectilinear, mapped to sky zone) ────────────────────────────
function proj(alt, az) {
  let daz = ((az - viewAz + 540) % 360) - 180;
  const skyH = H * (1 - GROUND_FRAC);
  const skyCY = skyH / 2;  // vertical center of sky zone
  const scale = W / (2 * Math.tan(HFOV / 2));
  const x = CX + scale * Math.tan(daz * D2R);
  const y = skyCY - scale * Math.tan((alt - viewAlt) * D2R);
  return { x, y };
}

function inView(alt, az) {
  let daz = ((az - viewAz + 540) % 360) - 180;
  const skyH = H * (1 - GROUND_FRAC);
  const vfovSky = 2 * Math.atan(skyH / W * Math.tan(HFOV / 2)) * R2D;
  const dalt = alt - viewAlt;
  return abs(daz) < HFOV * R2D * 0.62 && abs(dalt) < vfovSky * 0.55;
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

// ── Draw Earth (phase-correct, EPIC photo or procedural) ────────────────────
let earthImg = null;
let earthImgLoading = false;

function fetchEarthImage() {
  if (earthImgLoading) return;
  earthImgLoading = true;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { earthImg = img; };
  img.onerror = () => { earthImgLoading = false; };
  img.src = '/api/earth-image';
}

function drawEarth(x, y, alt, az, phase) {
  if (alt < -2 || !inView(alt, az)) return;
  // Earth is ~1.9° angular diameter from Moon — exaggerate for visual impact
  const r = Math.max(24, SR * (2.0 / 90) * 9.0);

  // No halo — Earth rendered clean

  cx.save();
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.clip();

  if (earthImg) {
    const imgSz = Math.min(earthImg.naturalWidth, earthImg.naturalHeight);
    const sx = (earthImg.naturalWidth - imgSz) / 2;
    const sy = (earthImg.naturalHeight - imgSz) / 2;
    cx.drawImage(earthImg, sx, sy, imgSz, imgSz, x-r, y-r, r*2, r*2);
  } else {
    // Procedural blue marble
    const earthGrd = rg(x-r*.3, y-r*.3, r*.1, r*1.1, [
      [0,'rgba(130,180,255,1)'],[.25,'rgba(70,140,230,1)'],[.55,'rgba(30,90,200,1)'],[1,'rgba(10,50,150,1)']
    ]);
    cx.fillStyle = earthGrd; cx.fillRect(x-r, y-r, r*2, r*2);
    cx.fillStyle = 'rgba(50,120,50,.65)';
    const patches = [[-.3,-.2,.25,.18],[.05,-.3,.32,.22],[-.5,.05,.18,.28],[.3,.1,.22,.16],[-.1,.25,.28,.16],[.25,-.15,.15,.2]];
    patches.forEach(([ox,oy,w,h]) => { cx.beginPath(); cx.ellipse(x+ox*r, y+oy*r, w*r, h*r, ox*.5, 0, TAU); cx.fill(); });
    cx.strokeStyle = 'rgba(255,255,255,.2)';
    cx.lineWidth = r * 0.03;
    for (let i = 0; i < 5; i++) {
      const cy2 = y + (i - 2) * r * 0.3;
      cx.beginPath();
      cx.moveTo(x - r * 0.7, cy2);
      cx.quadraticCurveTo(x + (i % 2 ? .3 : -.2) * r, cy2 + r * 0.1, x + r * 0.6, cy2 + r * 0.05);
      cx.stroke();
    }
  }

  // Phase terminator
  const phaseAngle = phase * TAU;
  cx.fillStyle = 'rgba(0,0,0,.82)';
  cx.beginPath();
  const startA = PI/2, endA = -PI/2;
  cx.arc(x, y, r, startA, endA);
  const ellW = r * abs(cos(phaseAngle));
  cx.ellipse(x, y, ellW < 1 ? 1 : ellW, r, 0, endA, startA, phase < .5 ? false : true);
  cx.fill();

  cx.restore();

  // Label — position away from screen edge
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

// ── Milky Way ───────────────────────────────────────────────────────────────
function drawMW(lst, lat) {
  const pts = MWP.map(p => {
    const a = altaz(p.ra, p.dec, lat, lst);
    return { ...proj(a.alt, a.az), alt: a.alt, az: a.az, dense: p.dense, vis: inView(a.alt, a.az) };
  });
  const w = W * 0.055;
  cx.save();
  [w*1.6, w, w*.5].forEach((lw, pi) => {
    const op = [.020, .013, .006][pi];
    cx.lineWidth = lw; cx.lineCap = 'round'; cx.lineJoin = 'round';
    let on = false; cx.beginPath();
    pts.forEach(p => {
      if (!p.vis || p.alt < 0) { on = false; return; }
      const opa = Math.min(1, (p.alt + 8) / 22) * p.dense;
      cx.strokeStyle = `rgba(200,196,188,${op*opa})`;
      if (!on) { cx.moveTo(p.x, p.y); on = true; } else cx.lineTo(p.x, p.y);
    });
    cx.stroke();
  });
  const t = Date.now() * .000012;
  pts.forEach((p, i) => {
    if (!p.vis || p.alt < 0 || i % 2) return;
    const fade = Math.min(1, (p.alt + 3) / 20);
    for (let k = 0; k < 7; k++) {
      const ox = Math.sin(i*.7 + k*4.1 + t) * w*.85;
      const oy = Math.cos(i*.5 + k*2.9 + t*1.2) * w*.85;
      const br = Math.abs(Math.sin(i*1.3 + k*7.7));
      const a = br*br * .065 * fade;
      if (a < .004) continue;
      cx.beginPath(); cx.arc(p.x+ox, p.y+oy, br*1.7, 0, TAU);
      cx.fillStyle = `rgba(208,202,195,${a})`; cx.fill();
    }
  });
  cx.restore();
}

// ── Panorama-based lunar surface ────────────────────────────────────────────
let panoramaImg = null;
let panoramaReady = false;

function loadPhotos() {
  const img = new Image();
  img.onload = () => {
    panoramaImg = img;
    panoramaReady = true;
    document.getElementById('hsrc').textContent = 'ALDRIN PANORAMA \u00b7 MARE TRANQUILLITATIS';
  };
  img.onerror = () => {
    document.getElementById('hsrc').textContent = 'MARE TRANQUILLITATIS';
  };
  img.src = '/static/photos/panorama.jpg';
  fetchEarthImage();
}

// ── Draw lunar surface (fixed screen position, bottom 22%) ──────────────────
function drawHorizon() {
  const groundY = Math.round(H * (1 - GROUND_FRAC));
  const surfH = H - groundY;

  // Compute sun lighting for surface
  const jdNow = toJD(new Date());
  const sunAlt = sunAltTranquility(jdNow);
  const pf = moonPhaseFrac(jdNow);
  const eIllum = earthIllumination(pf);

  let sunBright = 0;
  if (sunAlt > 5)       sunBright = 1.0;
  else if (sunAlt > -2) sunBright = (sunAlt + 2) / 7;
  const earthshineBright = (1 - sunBright) * eIllum * 0.12;
  const darkOverlay = 1.0 - Math.max(0.08, sunBright * 0.85 + earthshineBright);

  // Clip to ground zone
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

  // Lunar night darkening
  if (darkOverlay > 0.01) {
    cx.fillStyle = `rgba(0,0,0,${darkOverlay.toFixed(3)})`;
    cx.fillRect(0, groundY, W, surfH);
  }

  // Earthshine blue tint during lunar night
  if (earthshineBright > 0.01) {
    cx.fillStyle = `rgba(40,80,160,${(earthshineBright * 0.4).toFixed(3)})`;
    cx.fillRect(0, groundY, W, surfH);
  }

  // Golden hour tint at low sun angles
  if (sunAlt > -2 && sunAlt < 12) {
    const golden = Math.max(0, 1 - abs(sunAlt - 3) / 10) * 0.12;
    if (golden > 0.005) {
      cx.fillStyle = `rgba(200,140,50,${golden.toFixed(3)})`;
      cx.fillRect(0, groundY, W, surfH);
    }
  }

  // Bottom vignette
  const bot = cx.createLinearGradient(0, H - surfH * 0.25, 0, H);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,0.3)');
  cx.fillStyle = bot;
  cx.fillRect(0, groundY, W, surfH);

  cx.restore();

  // Soft horizon blend
  const seamH = Math.min(15, surfH * 0.12);
  const seam = cx.createLinearGradient(0, groundY - seamH * 0.5, 0, groundY + seamH);
  seam.addColorStop(0, 'rgba(0,0,0,0)');
  seam.addColorStop(0.4, 'rgba(0,0,0,0.25)');
  seam.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = seam;
  cx.fillRect(0, groundY - seamH * 0.5, W, seamH * 1.5);

  // Compass bearings
  if (showLabels) {
    const scale = W / (2 * Math.tan(HFOV / 2));
    cx.font = '8px Courier New';
    cx.fillStyle = 'rgba(190,175,140,0.4)';
    cx.textAlign = 'center';
    for (let az2 = 0; az2 < 360; az2 += 10) {
      const daz = ((az2 - viewAz + 540) % 360) - 180;
      if (abs(daz) > HFOV * R2D * 0.54) continue;
      const px = CX + scale * Math.tan(daz * D2R);
      cx.fillText(az2 % 30 === 0 ? az2 + '\u00b0' : '\u00b7', px, groundY - 5);
    }
    cx.textAlign = 'left';
  }
}
