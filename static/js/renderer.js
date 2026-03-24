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

// ── Projection (rectilinear) ────────────────────────────────────────────────
function proj(alt, az) {
  let daz = ((az - viewAz + 540) % 360) - 180;
  const scale = W / (2 * Math.tan(HFOV / 2));
  const x = CX + scale * Math.tan(daz * D2R);
  const y = CY - scale * Math.tan(alt * D2R);
  return { x, y };
}

function inView(alt, az) {
  let daz = ((az - viewAz + 540) % 360) - 180;
  const vfov = (H / W) * HFOV * R2D;
  return abs(daz) < HFOV * R2D * 0.62 && alt > -(vfov * 0.55) && alt < (vfov * 0.55);
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

// ── Draw Earth (large, phase-correct, blue marble) ──────────────────────────
function drawEarth(x, y, alt, az, phase) {
  if (alt < 0 || !inView(alt, az)) return;
  const ext = Math.min(1, Math.max(0, (alt + 4) / 15));
  const r = SR * (2 / 90) * 2.2;
  // Atmosphere glow
  const atmoR = r * 1.35;
  const atmo = rg(x, y, r*.7, atmoR, [
    [0,'rgba(60,120,255,0)'],[.3,`rgba(60,120,255,${ext*.15})`],[.7,`rgba(30,80,200,${ext*.08})`],[1,'rgba(10,40,140,0)']
  ]);
  cx.beginPath(); cx.arc(x, y, atmoR, 0, TAU); cx.fillStyle = atmo; cx.fill();
  // Phase shadow
  cx.save(); cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.clip();
  const earthGrd = rg(x-r*.3, y-r*.3, r*.1, r*1.1, [
    [0,'rgba(130,180,255,1)'],[.25,'rgba(70,140,230,1)'],[.55,'rgba(30,90,200,1)'],[1,'rgba(10,50,150,1)']
  ]);
  cx.fillStyle = earthGrd; cx.fillRect(x-r, y-r, r*2, r*2);
  // Land masses
  cx.fillStyle = 'rgba(60,130,60,.7)';
  const patches = [[-.3,-.2,.25,.18],[.05,-.25,.3,.2],[-.5,0,.15,.25],[.3,.1,.2,.15],[-.1,.2,.25,.15]];
  patches.forEach(([ox,oy,w,h]) => { cx.beginPath(); cx.ellipse(x+ox*r, y+oy*r, w*r, h*r, ox*.5, 0, TAU); cx.fill(); });
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
  // Rim
  cx.beginPath(); cx.arc(x, y, r, 0, TAU);
  cx.strokeStyle = `rgba(150,190,255,${ext*.6})`; cx.lineWidth = 1.2; cx.stroke();
  if (showLabels && alt > 3) { cx.font = '9px Courier New'; cx.fillStyle = `rgba(150,200,255,${ext*.6})`; cx.fillText('EARTH', x+r+5, y-r-2); }
}

// ── Draw Sun (harsh white, no corona from Moon's perspective) ────────────────
function drawSun(x, y, alt, az) {
  if (alt < 0 || !inView(alt, az)) return;
  const ext = Math.min(1, Math.max(0, (alt + 5) / 15));
  const r = SR * (.5 / 90) * 2;
  [r*18,r*10,r*5,r*2.5].forEach((gr, i) => {
    const a = [.015,.04,.10,.25][i] * ext;
    const g = rg(x, y, 0, gr, [[0,`rgba(255,255,230,${a})`],[1,'rgba(255,240,180,0)']]);
    cx.beginPath(); cx.arc(x, y, gr, 0, TAU); cx.fillStyle = g; cx.fill();
  });
  const cg = rg(x, y, r*.5, r*2.2, [[0,'rgba(255,255,255,1)'],[.4,'rgba(255,248,220,1)'],[1,'rgba(255,230,150,0)']]);
  cx.beginPath(); cx.arc(x, y, r*2.2, 0, TAU); cx.fillStyle = cg; cx.fill();
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fillStyle = 'rgba(255,255,255,1)'; cx.fill();
  if (ext > .3) {
    cx.save(); cx.globalAlpha = ext * .12; cx.strokeStyle = 'rgba(255,245,200,1)'; cx.lineWidth = .8;
    for (let a = 0; a < 12; a++) {
      const ar = a * (TAU/12);
      cx.beginPath(); cx.moveTo(x+cos(ar)*r*3, y+sin(ar)*r*3); cx.lineTo(x+cos(ar)*r*8, y+sin(ar)*r*8); cx.stroke();
    }
    cx.restore();
  }
  if (showLabels && alt > 4) { cx.font = '9px Courier New'; cx.fillStyle = `rgba(255,240,180,${ext*.5})`; cx.fillText('SUN', x+r*2.5+4, y-r-2); }
}

// ── Draw generic planet ─────────────────────────────────────────────────────
function drawPlanet(p) {
  if (p.alt < 0 || !inView(p.alt, p.az)) return null;
  const { x, y } = proj(p.alt, p.az);
  if (x < -80 || x > W+80 || y < -80 || y > H+80) return null;
  const ext = Math.min(1, Math.max(0, (p.alt + 4) / 15));
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

// ── Apollo photo strip (self-hosted) ────────────────────────────────────────
const PHOTO_FILES = [
  '/static/photos/as11-40-5961.jpg',
  '/static/photos/as11-40-5931.jpg',
  '/static/photos/as11-40-5873.jpg',
  '/static/photos/as11-40-5886.jpg',
  '/static/photos/as11-40-5927.jpg',
  '/static/photos/as11-40-5880.jpg',
];

let photoStrip = new Array(PHOTO_FILES.length).fill(null);
let photoStripReady = false;
let photosAttempted = 0;

function loadPhotos() {
  PHOTO_FILES.forEach((src, i) => {
    const img = new Image();
    img.onload = () => { photoStrip[i] = img; photosAttempted++; checkPhotoDone(); };
    img.onerror = () => { photosAttempted++; checkPhotoDone(); };
    img.src = src;
  });
}

function checkPhotoDone() {
  const total = PHOTO_FILES.length;
  const loaded = photoStrip.filter(p => p).length;
  if (photosAttempted < total) {
    document.getElementById('hsrc').textContent = `LOADING NASA PHOTOS ${photosAttempted}/${total}`;
    return;
  }
  photoStripReady = loaded > 0;
  document.getElementById('hsrc').textContent =
    loaded === total ? 'NASA AS11 HASSELBLAD \u00b7 JULY 20 1969' :
    loaded > 0       ? `NASA AS11 \u00b7 ${loaded}/${total} FRAMES` :
                       'NASA PHOTOS UNAVAILABLE';
}

// ── Normalize photos to uniform grayscale off-screen ────────────────────────
let normalizedStrip = new Array(PHOTO_FILES.length).fill(null);
let normalizeAttempted = false;

function normalizePhotos() {
  if (normalizeAttempted) return;
  normalizeAttempted = true;
  const TARGET_W = 800;  // normalize all to same resolution
  const TARGET_H = 400;

  photoStrip.forEach((img, i) => {
    if (!img) return;
    const offCv = document.createElement('canvas');
    offCv.width = TARGET_W;
    offCv.height = TARGET_H;
    const offCx = offCv.getContext('2d');

    // Draw cropped (skip top 40% = sky)
    const srcY = img.naturalHeight * 0.40;
    const srcH = img.naturalHeight * 0.60;
    offCx.drawImage(img, 0, srcY, img.naturalWidth, srcH, 0, 0, TARGET_W, TARGET_H);

    // Convert to grayscale + normalize brightness
    const imgData = offCx.getImageData(0, 0, TARGET_W, TARGET_H);
    const d = imgData.data;
    let sum = 0, count = 0;
    for (let j = 0; j < d.length; j += 4) {
      const gray = 0.299 * d[j] + 0.587 * d[j+1] + 0.114 * d[j+2];
      sum += gray; count++;
    }
    const avgBright = sum / count;
    // Target brightness: uniform mid-gray (~100)
    const targetBright = 100;
    const scale = targetBright / (avgBright + 1);

    for (let j = 0; j < d.length; j += 4) {
      let gray = 0.299 * d[j] + 0.587 * d[j+1] + 0.114 * d[j+2];
      gray = Math.min(255, gray * scale);
      // Slight warm lunar tint
      d[j]   = Math.min(255, gray * 1.02);  // R
      d[j+1] = Math.min(255, gray * 0.97);  // G
      d[j+2] = Math.min(255, gray * 0.90);  // B
    }
    offCx.putImageData(imgData, 0, 0);

    // Store as new Image from canvas
    const normImg = new Image();
    normImg.src = offCv.toDataURL('image/jpeg', 0.85);
    normImg.onload = () => { normalizedStrip[i] = normImg; };
    // Fallback: use canvas directly
    normalizedStrip[i] = offCv;
  });
}

// ── Draw lunar surface horizon ──────────────────────────────────────────────
function drawHorizon() {
  const scale  = W / (2 * Math.tan(HFOV / 2));
  const photoH = Math.round(H * 0.40);
  const groundY = CY;

  // Normalize photos once they're all loaded
  if (photoStripReady && !normalizeAttempted) normalizePhotos();

  const hasNorm = normalizedStrip.some(p => p);

  if (photoStripReady && hasNorm) {
    const AZ_PER_PHOTO = 60;
    const OVERLAP = 8;  // pixels of feathered overlap between panels
    cx.save();
    cx.beginPath(); cx.rect(0, groundY, W, H - groundY); cx.clip();

    // Draw each normalized photo panel
    for (let pi = 0; pi < normalizedStrip.length; pi++) {
      const src = normalizedStrip[pi];
      if (!src) continue;
      // src is either a canvas or an Image
      const srcW = src.width || src.naturalWidth;
      const srcH = src.height || src.naturalHeight;

      for (const shift of [0, -360, 360]) {
        const az0 = pi * AZ_PER_PHOTO + shift;
        const az1 = az0 + AZ_PER_PHOTO;
        let daz0 = ((az0 - viewAz + 540) % 360) - 180;
        let daz1 = ((az1 - viewAz + 540) % 360) - 180;
        if (Math.abs(daz1 - daz0) > AZ_PER_PHOTO + 2) continue;
        const x0 = CX + scale * Math.tan(daz0 * D2R);
        const x1 = CX + scale * Math.tan(daz1 * D2R);
        const drawW = x1 - x0;
        if (drawW < 0.5) continue;
        // Draw already-cropped normalized image (full source)
        cx.drawImage(src, 0, 0, srcW, srcH, x0, groundY, drawW, photoH);

        // Feather left edge
        if (OVERLAP > 0) {
          const featherW = Math.min(OVERLAP * 3, drawW * 0.1);
          const fL = cx.createLinearGradient(x0, 0, x0 + featherW, 0);
          fL.addColorStop(0, 'rgba(0,0,0,0.6)');
          fL.addColorStop(1, 'rgba(0,0,0,0)');
          cx.fillStyle = fL;
          cx.fillRect(x0, groundY, featherW, photoH);
          // Feather right edge
          const fR = cx.createLinearGradient(x1 - featherW, 0, x1, 0);
          fR.addColorStop(0, 'rgba(0,0,0,0)');
          fR.addColorStop(1, 'rgba(0,0,0,0.6)');
          cx.fillStyle = fR;
          cx.fillRect(x1 - featherW, groundY, featherW, photoH);
        }
      }
    }

    // Darken overall to match lunar night ambience
    cx.fillStyle = 'rgba(0,0,0,0.25)';
    cx.fillRect(0, groundY, W, H - groundY);

    // Bottom vignette
    const bot = cx.createLinearGradient(0, groundY + photoH * 0.45, 0, H);
    bot.addColorStop(0, 'rgba(0,0,0,0)');
    bot.addColorStop(1, 'rgba(0,0,0,0.88)');
    cx.fillStyle = bot;
    cx.fillRect(0, groundY, W, H - groundY);

    // Horizon contact shadow
    const seam = cx.createLinearGradient(0, groundY - 6, 0, groundY + 18);
    seam.addColorStop(0, 'rgba(0,0,0,0)');
    seam.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    seam.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = seam;
    cx.fillRect(0, groundY - 6, W, 24);

    cx.restore();

    cx.font = '8px Courier New';
    cx.fillStyle = 'rgba(180,165,130,0.28)';
    cx.fillText('NASA \u00b7 APOLLO 11 \u00b7 AS11-40 \u00b7 HASSELBLAD \u00b7 TRANQUILITY BASE \u00b7 JULY 20 1969', 10, H - 8);
  } else {
    // Procedural fallback
    const grad = cx.createLinearGradient(0, groundY, 0, H);
    grad.addColorStop(0,   'rgba(52,47,40,1)');
    grad.addColorStop(0.3, 'rgba(38,34,28,1)');
    grad.addColorStop(1,   'rgba(20,18,14,1)');
    cx.fillStyle = grad;
    cx.fillRect(0, groundY, W, H - groundY);

    if (!photoStripReady && photosAttempted < PHOTO_FILES.length) {
      cx.font = '9px Courier New';
      cx.fillStyle = 'rgba(160,140,100,0.4)';
      cx.textAlign = 'center';
      cx.fillText(`LOADING NASA SURFACE PHOTOS  ${photosAttempted}/${PHOTO_FILES.length}`, CX, groundY + 28);
      cx.textAlign = 'left';
    }
  }

  // Horizon line with terrain undulation
  cx.beginPath();
  for (let px = 0; px <= W; px += 3) {
    const az = viewAz + (px - CX) / scale * R2D;
    const bump = 1.2*sin(az*.31) + 0.8*sin(az*.59) + 0.5*sin(az*1.1) + 0.25*sin(az*2.3);
    px === 0 ? cx.moveTo(px, groundY + bump) : cx.lineTo(px, groundY + bump);
  }
  cx.strokeStyle = 'rgba(120,108,85,0.5)';
  cx.lineWidth = 1.0;
  cx.stroke();

  // Compass bearing strip
  if (showLabels) {
    cx.font = '8px Courier New';
    cx.fillStyle = 'rgba(190,175,140,0.48)';
    cx.textAlign = 'center';
    for (let az2 = 0; az2 < 360; az2 += 10) {
      const daz = ((az2 - viewAz + 540) % 360) - 180;
      if (abs(daz) > HFOV * R2D * 0.54) continue;
      const px = CX + scale * Math.tan(daz * D2R);
      cx.fillText(az2 % 30 === 0 ? az2 + '\u00b0' : '\u00b7', px, groundY - 8);
    }
    cx.textAlign = 'left';
  }
}
