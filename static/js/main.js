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
  viewAlt = computeViewAlt();
}
resize();
window.addEventListener('resize', resize);

// ── State ───────────────────────────────────────────────────────────────────
let bodies = [];
let ff = true;
let lastBodyJD = 0;

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
  const ea = em.directAltAz ? { alt: em.alt, az: em.az } : altaz(em.ra, em.dec, lat, lst);
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

// ── Dynamic text from location config ───────────────────────────────────────
function initLocationText() {
  document.title = 'Lunar Sky \u2014 ' + LOC.name;
  const badge = document.getElementById('mission-badge');
  if (badge) badge.innerHTML = `${LOC.name} \u00b7 ${LOC.subtitle} \u00b7 ${LOC.coordStr}<br>${LOC.badge} \u00b7 HOUSTON TIME (CDT/CST)`;
  const hudName = document.querySelector('#hud .hc.r .bright');
  if (hudName) hudName.textContent = LOC.name;
  const epTitle = document.querySelector('.ep-title');
  if (epTitle) epTitle.textContent = LOC.name + '  EVENTS';
  const epNote = document.getElementById('ep-note');
  if (epNote) epNote.textContent = LOC.eventsNote;

  // Highlight active location button (desktop + mobile menu)
  document.querySelectorAll('.loc-btn, .mm-btn[data-loc]').forEach(btn => {
    if (btn.dataset.loc) btn.classList.toggle('active', btn.dataset.loc === LOC.key);
  });
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

  // Track Earth azimuth for locations without fixed viewAz
  if (LOC.fixedViewAz === null) {
    const earthBody = bodies.find(b => b.isEarth);
    if (earthBody) viewAz = earthBody.az;
  }

  drawMW(lst, OBS.lat);

  // Stars
  const skyBottom = H * (1 - GROUND_FRAC);
  for (let i = 0; i < STARS.length; i++) {
    const s = STARS[i];
    const aa = altaz(s.ra, s.dec, OBS.lat, lst);
    if (aa.alt < 0 || !inView(aa.alt, aa.az)) continue;
    const { x, y } = proj(aa.alt, aa.az);
    if (x < -20 || x > W+20 || y < -20 || y > skyBottom) continue;
    const ext = Math.min(1, Math.max(0, (aa.alt + 0.2) / 0.8));
    const baseA = Math.min(1, Math.max(0, (7.0 - s.mag) / 6.0)) * ext;
    drawStar(x, y, Math.max(.4, 3.2 - s.mag * .52), bv2rgb(s.bv), Math.min(1, baseA * 1.2));
    if (showLabels && s.name && s.mag < 2.5) {
      cx.font = '8px Courier New';
      cx.fillStyle = `rgba(170,195,230,${Math.min(.55, baseA * .5)})`;
      cx.fillText(s.name, x + 6, y - 5);
    }
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
  document.getElementById('h-lun').textContent = `FACING  ${compassDir(viewAz)}  (${viewAz.toFixed(0)}\u00b0)`;

  updateEventsPanel(jd);

  if (ff) {
    ff = false;
    const ov = document.getElementById('ov');
    if (ov) { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 1400); }
  }

  requestAnimationFrame(render);
}

// ── Init ────────────────────────────────────────────────────────────────────
initLocationText();
initToggleState();
initDrag(cv);
initTooltip(cv, () => bodies);
initFullscreen();
loadPhotos();
requestAnimationFrame(render);

setTimeout(fetchEphemeris, 800);
setInterval(fetchEphemeris, 5 * 60 * 1000);
