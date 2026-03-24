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

// ── Procedural lunar surface ────────────────────────────────────────────────
// Seeded hash for deterministic noise (same surface every load)
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;  // 0..1
}

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = hash(ix, iy), n10 = hash(ix+1, iy);
  const n01 = hash(ix, iy+1), n11 = hash(ix+1, iy+1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmNoise(x, y, octaves) {
  let val = 0, amp = 0.5, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    val += smoothNoise(x * freq, y * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return val / total;
}

// Pre-generate surface texture (once)
let surfaceCanvas = null;
let surfaceGenerated = false;
const SURF_W = 2048;  // wraps around 360°
const SURF_H = 256;

function generateSurface() {
  if (surfaceGenerated) return;
  surfaceGenerated = true;

  surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = SURF_W;
  surfaceCanvas.height = SURF_H;
  const sc = surfaceCanvas.getContext('2d');
  const imgData = sc.createImageData(SURF_W, SURF_H);
  const d = imgData.data;

  // Pre-compute crater positions (seeded)
  const craters = [];
  for (let i = 0; i < 120; i++) {
    craters.push({
      x: hash(i * 7, 31) * SURF_W,
      y: hash(i * 13, 47) * SURF_H * 0.7 + SURF_H * 0.05,
      r: 3 + hash(i * 19, 61) * 25,
      depth: 0.15 + hash(i * 23, 71) * 0.25
    });
  }

  for (let py = 0; py < SURF_H; py++) {
    // Distance from horizon: near top = far away (lighter), bottom = close (darker details)
    const distFrac = py / SURF_H;  // 0=horizon, 1=foreground
    const detailScale = 0.5 + distFrac * 1.5;

    for (let px = 0; px < SURF_W; px++) {
      const idx = (py * SURF_W + px) * 4;

      // Multi-octave noise for regolith texture
      const nx = px / SURF_W * 32;
      const ny = py / SURF_H * 16;
      let n = fbmNoise(nx, ny, 6);

      // Fine grain noise (close-up regolith texture)
      n += (hash(px, py) - 0.5) * 0.06 * detailScale;

      // Crater shadows
      for (let ci = 0; ci < craters.length; ci++) {
        const c = craters[ci];
        let dx = px - c.x;
        // Wrap around
        if (dx > SURF_W / 2) dx -= SURF_W;
        if (dx < -SURF_W / 2) dx += SURF_W;
        const dy = py - c.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < c.r) {
          const rimDist = dist / c.r;
          // Rim is brighter, inside is darker
          if (rimDist > 0.75) {
            n += (rimDist - 0.75) * 4 * c.depth * 0.5;  // bright rim
          } else {
            n -= (1 - rimDist / 0.75) * c.depth;  // dark interior
          }
        } else if (dist < c.r * 1.3) {
          // Ejecta blanket: slightly brighter
          n += (1 - (dist - c.r) / (c.r * 0.3)) * c.depth * 0.15;
        }
      }

      // Distance fog: far objects (near horizon) are lighter/hazier
      const fogMix = Math.max(0, 1 - distFrac * 1.8);
      n = n * (1 - fogMix * 0.4) + 0.55 * fogMix * 0.4;

      // Map noise to gray value (lunar regolith is ~7-12% albedo)
      let gray = Math.max(0, Math.min(1, n)) * 180 + 30;

      // Warm lunar tint
      d[idx]     = Math.min(255, gray * 1.02);  // R
      d[idx + 1] = Math.min(255, gray * 0.97);  // G
      d[idx + 2] = Math.min(255, gray * 0.90);  // B
      d[idx + 3] = 255;
    }
  }

  sc.putImageData(imgData, 0, 0);
  document.getElementById('hsrc').textContent = 'PROCEDURAL REGOLITH \u00b7 MARE TRANQUILLITATIS';
}

// ── Load Apollo foreground photos ────────────────────────────────────────────
const PHOTO_SRCS = [
  '/static/photos/as11-40-5961.jpg',   // wide landscape, LM distant, clean regolith
  '/static/photos/as11-40-5931.jpg',   // mid-ground regolith, LM behind
  '/static/photos/as11-40-5886.jpg',   // flag scene, good surface texture
];
let photoImgs = [];
let photosReady = false;
// Offscreen canvas for cropped+normalized photo strip
let photoStrip = null;

function loadPhotos() {
  generateSurface();
  let loaded = 0;
  PHOTO_SRCS.forEach((src, i) => {
    const img = new Image();
    img.onload = () => {
      photoImgs[i] = img;
      loaded++;
      if (loaded === PHOTO_SRCS.length) buildPhotoStrip();
    };
    img.onerror = () => { loaded++; if (loaded === PHOTO_SRCS.length) buildPhotoStrip(); };
    img.src = src;
  });
}

function buildPhotoStrip() {
  const valid = photoImgs.filter(Boolean);
  if (!valid.length) return;

  // Build a wide strip from the bottom crop of each photo (regolith only)
  const stripH = 300;       // output strip height
  const perW = 800;         // output width per photo
  const totalW = valid.length * perW;

  photoStrip = document.createElement('canvas');
  photoStrip.width = totalW;
  photoStrip.height = stripH;
  const pc = photoStrip.getContext('2d');

  valid.forEach((img, i) => {
    // Crop bottom 35% of each photo (pure regolith ground)
    const cropFrac = 0.35;
    const srcY = Math.round(img.naturalHeight * (1 - cropFrac));
    const srcH = img.naturalHeight - srcY;
    const srcX = 0, srcW = img.naturalWidth;

    pc.drawImage(img, srcX, srcY, srcW, srcH, i * perW, 0, perW, stripH);

    // Feather left/right edges for seamless tiling between photos
    if (i > 0) {
      const feather = 60;
      const grad = pc.createLinearGradient(i * perW - feather, 0, i * perW + feather, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.6)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      // Don't cover — blend by drawing slight overlap
    }
  });

  // Normalize brightness — boost to full daylight level
  const id = pc.getImageData(0, 0, totalW, stripH);
  const d = id.data;
  // Find average brightness
  let sum = 0, count = 0;
  for (let j = 0; j < d.length; j += 16) {
    sum += d[j] * 0.299 + d[j+1] * 0.587 + d[j+2] * 0.114;
    count++;
  }
  const avgBright = sum / count;
  // Target ~160 brightness (well-lit lunar surface)
  const scale = Math.min(2.0, 160 / Math.max(1, avgBright));
  for (let j = 0; j < d.length; j += 4) {
    d[j]   = Math.min(255, d[j] * scale);
    d[j+1] = Math.min(255, d[j+1] * scale);
    d[j+2] = Math.min(255, d[j+2] * scale);
  }
  pc.putImageData(id, 0, 0);

  // Top fade-to-transparent (blend into procedural terrain above)
  const topFade = pc.createLinearGradient(0, 0, 0, stripH * 0.45);
  topFade.addColorStop(0, 'rgba(0,0,0,1)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  pc.globalCompositeOperation = 'destination-out';
  pc.fillStyle = topFade;
  pc.fillRect(0, 0, totalW, stripH * 0.45);
  pc.globalCompositeOperation = 'source-over';

  photosReady = true;
}

// ── Draw lunar surface horizon ──────────────────────────────────────────────
function drawHorizon() {
  const scale  = W / (2 * Math.tan(HFOV / 2));
  const surfH  = Math.round(H * 0.40);
  const groundY = CY;

  // Compute sun lighting
  const jdNow = toJD(new Date());
  const sunAlt = sunAltTranquility(jdNow);
  const pf = moonPhaseFrac(jdNow);
  const eIllum = earthIllumination(pf);

  // Surface brightness: 0 = pitch black, 1 = full sunlight
  let sunBright = 0;
  if (sunAlt > 5)       sunBright = 1.0;
  else if (sunAlt > -2) sunBright = (sunAlt + 2) / 7;

  // Earthshine during lunar night
  const earthshineBright = (1 - sunBright) * eIllum * 0.12;
  const darkOverlay = 1.0 - Math.max(0.08, sunBright * 0.85 + earthshineBright);

  // Generate surface texture on first call
  if (!surfaceGenerated) generateSurface();

  cx.save();
  cx.beginPath(); cx.rect(0, groundY, W, H - groundY); cx.clip();

  if (surfaceCanvas) {
    // Map view azimuth to texture X offset (seamless wrap)
    const texOffset = (viewAz / 360) * SURF_W;

    // Draw surface texture, wrapping seamlessly
    for (const shift of [0, SURF_W, -SURF_W]) {
      const srcX = texOffset + shift;
      // Map screen pixels to texture coordinates
      // Full 360° = SURF_W pixels; visible FOV maps to screen width
      const fovDeg = HFOV * R2D;
      const texPerDeg = SURF_W / 360;
      const texVisible = fovDeg * texPerDeg * 1.3;  // slight over-draw
      const screenPerTex = W / (fovDeg * texPerDeg);

      const drawX = -((srcX % SURF_W + SURF_W) % SURF_W) * screenPerTex + CX;
      const drawTotalW = SURF_W * screenPerTex;

      if (drawX + drawTotalW < 0 || drawX > W) continue;
      cx.drawImage(surfaceCanvas, 0, 0, SURF_W, SURF_H, drawX, groundY, drawTotalW, surfH);
    }
  }

  // Surface always shown at max brightness for visibility
  // Light overlay only for subtle depth (no full darkening)
  const surfaceDim = Math.max(0, darkOverlay * 0.15);  // at most 15% dim
  cx.fillStyle = `rgba(0,0,0,${surfaceDim.toFixed(3)})`;
  cx.fillRect(0, groundY, W, H - groundY);

  // ── Photo foreground overlay ────────────────────────────────────────────
  if (photosReady && photoStrip) {
    const photoH = Math.round(surfH * 0.55);  // photos fill bottom 55% of surface area
    const photoY = H - photoH;

    // Map viewAz to photo strip offset (parallax scroll)
    const stripW = photoStrip.width;
    const photoScale = W / (stripW * 0.4);  // show ~40% of strip at a time
    const drawW = stripW * photoScale;
    const scrollX = -(viewAz / 360) * drawW * 0.6;

    cx.save();
    cx.beginPath(); cx.rect(0, photoY, W, photoH); cx.clip();

    // Draw with wrapping
    for (const shift of [0, drawW, -drawW]) {
      const dx = (scrollX + shift) % drawW;
      const drawX = ((dx % drawW) + drawW) % drawW - drawW * 0.15;
      cx.drawImage(photoStrip, 0, 0, stripW, photoStrip.height,
                   drawX, photoY, drawW, photoH);
    }
    cx.restore();
  }

  // Gentle bottom vignette (much lighter than before)
  const bot = cx.createLinearGradient(0, H - surfH * 0.15, 0, H);
  bot.addColorStop(0, 'rgba(0,0,0,0)');
  bot.addColorStop(1, 'rgba(0,0,0,0.35)');
  cx.fillStyle = bot;
  cx.fillRect(0, groundY, W, H - groundY);

  // Horizon contact shadow
  const seam = cx.createLinearGradient(0, groundY - 4, 0, groundY + 14);
  seam.addColorStop(0, 'rgba(0,0,0,0)');
  seam.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  seam.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = seam;
  cx.fillRect(0, groundY - 4, W, 18);

  cx.restore();

  // Horizon line with terrain undulation
  cx.beginPath();
  for (let px = 0; px <= W; px += 3) {
    const az = viewAz + (px - CX) / scale * R2D;
    const bump = 1.2*sin(az*.31) + 0.8*sin(az*.59) + 0.5*sin(az*1.1) + 0.25*sin(az*2.3);
    px === 0 ? cx.moveTo(px, groundY + bump) : cx.lineTo(px, groundY + bump);
  }
  cx.strokeStyle = `rgba(120,108,85,${(0.2 + sunBright * 0.4).toFixed(2)})`;
  cx.lineWidth = 1.0;
  cx.stroke();

  // Compass bearing strip
  if (showLabels) {
    cx.font = '8px Courier New';
    cx.fillStyle = `rgba(190,175,140,${(0.15 + sunBright * 0.35).toFixed(2)})`;
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
