'use strict';

// ── Canvas setup ────────────────────────────────────────────────────────────
const cv = document.getElementById('c');
const cx = cv.getContext('2d');

function resize() {
  W = cv.width = window.innerWidth;
  H = cv.height = window.innerHeight;
  CX = W / 2;
  CY = H / 2;
  SR = Math.min(W, H) / 2;
}
resize();
window.addEventListener('resize', resize);

// ── State ───────────────────────────────────────────────────────────────────
let bodies = [];
let ff = true;
let lastBodyJD = 0;
let lastViewAz = -1;

function computeBodies(jd) {
  const lst = lunarLST(jd, OBS.lon), lat = OBS.lat, res = [];
  const sun = sunPos(jd);
  const sa = altaz(sun.ra, sun.dec, lat, lst);
  res.push({ ...PDEF[0], ra: sun.ra, dec: sun.dec, ...sa });

  const pNames = ['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'];
  pNames.forEach((nm, i) => {
    try {
      const p = geocentric(nm, jd);
      const aa = altaz(p.ra, p.dec, lat, lst);
      res.push({ ...PDEF[i+1], ra: p.ra, dec: p.dec, ...aa, dist: p.dist });
    } catch(e) {}
  });

  const em = earthFromMoon(jd);
  const moon = moonPos(jd);
  const ea = altaz(em.ra, em.dec, lat, lst);
  res.push({ ...PDEF[8], ra: em.ra, dec: em.dec, ...ea, phase: moon.phase, isEarth: true });
  return res;
}

// ── Horizons refinement from server cache ───────────────────────────────────
let horizonsData = {};

async function fetchEphemeris() {
  try {
    const resp = await fetch('/api/ephemeris', { signal: AbortSignal.timeout(6000) });
    const json = await resp.json();
    if (json.status === 'ok' && json.bodies) {
      horizonsData = json.bodies;
      document.getElementById('hsrc').textContent = 'HORIZONS + VSOP87';
    }
  } catch(_) {}
}

// ── Render loop ─────────────────────────────────────────────────────────────
function render(ts) {
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, W, H);

  const now = new Date(), jd = toJD(now);
  const lst = lunarLST(jd, OBS.lon);

  // Recompute planets every 5 seconds
  if (!bodies.length || abs(jd - lastBodyJD) > 5/86400) {
    bodies = computeBodies(jd);
    lastBodyJD = jd;
  }

  drawMW(lst, OBS.lat);

  // Stars — perfectly steady, no scintillation on airless Moon
  for (let i = 0; i < STARS.length; i++) {
    const s = STARS[i];
    const aa = altaz(s.ra, s.dec, OBS.lat, lst);
    if (aa.alt < 0 || !inView(aa.alt, aa.az)) continue;
    const { x, y } = proj(aa.alt, aa.az);
    if (x < -20 || x > W+20 || y < -20 || y > H+20) continue;
    // No atmosphere — stars are full brightness immediately above horizon
    const ext = Math.min(1, Math.max(0, (aa.alt + 0.2) / 0.8));
    const baseA = Math.min(1, Math.max(0, (7.0 - s.mag) / 6.0)) * ext;
    drawStar(x, y, Math.max(.4, 3.2 - s.mag * .52), bv2rgb(s.bv), Math.min(1, baseA * 1.2));
  }

  // Bodies
  bodies.forEach(p => {
    if (p.isEarth) { const { x, y } = proj(p.alt, p.az); drawEarth(x, y, p.alt, p.az, p.phase); }
    else if (p.isSun) { const { x, y } = proj(p.alt, p.az); drawSun(x, y, p.alt, p.az); }
    else drawPlanet(p);
  });

  drawHorizon();

  // HUD
  const z = n => String(n).padStart(2, '0');
  document.getElementById('ht-houston').textContent = houstonTime(now);
  document.getElementById('ht-utc').textContent = `${now.getUTCFullYear()}-${z(now.getUTCMonth()+1)}-${z(now.getUTCDate())} ${z(now.getUTCHours())}:${z(now.getUTCMinutes())}:${z(now.getUTCSeconds())} UTC`;

  if (viewAz !== lastViewAz) {
    document.getElementById('h-lun').textContent = `FACING  ${compassDir(viewAz)}  (${viewAz.toFixed(0)}\u00b0)`;
    lastViewAz = viewAz;
  }

  updateEventsPanel(jd);

  // Dismiss overlay on first frame
  if (ff) {
    ff = false;
    const ov = document.getElementById('ov');
    if (ov) { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 1400); }
  }

  requestAnimationFrame(render);
}

// ── Init ────────────────────────────────────────────────────────────────────
initDrag(cv);
initTooltip(cv, () => bodies);
initFullscreen();
loadPhotos();
requestAnimationFrame(render);

// Fetch from server cache instead of hitting NASA directly
setTimeout(fetchEphemeris, 800);
setInterval(fetchEphemeris, 5 * 60 * 1000);
