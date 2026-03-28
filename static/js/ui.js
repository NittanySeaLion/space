'use strict';

// ── View state (with localStorage persistence) ─────────────────────────────
let viewAz = LOC.fixedViewAz !== null ? LOC.fixedViewAz : 0;
let viewAlt = 35;
let showLabels = localStorage.getItem('lunarsky-labels') !== 'off';
let showEvents = localStorage.getItem('lunarsky-events') !== 'off';  // default ON

// ── Pan & zoom state ────────────────────────────────────────────────────────
let userPanning = false;       // true while user has overridden default view
let panTimeout = null;         // timer to snap back after inactivity
let snapAnim = null;           // animation frame ID for snap-back tween
const PAN_SNAP_DELAY = 4000;   // ms of inactivity before snapping back
const SNAP_SPEED = 0.06;       // lerp factor per frame (0–1, higher = faster)

// Default view targets (updated each frame by main.js)
let defaultAz = viewAz;
let defaultAlt = viewAlt;

function setDefaultView(az, alt) {
  defaultAz = az;
  defaultAlt = alt;
}

function startUserPan() {
  userPanning = true;
  if (snapAnim) { cancelAnimationFrame(snapAnim); snapAnim = null; }
  clearTimeout(panTimeout);
  panTimeout = setTimeout(snapBack, PAN_SNAP_DELAY);
}

function snapBack() {
  if (!userPanning) return;
  // Smoothly animate back to default view
  function tick() {
    const dAz = ((defaultAz - viewAz + 540) % 360) - 180;
    const dAlt = defaultAlt - viewAlt;
    const dFov = BASE_HFOV - HFOV;
    if (abs(dAz) < 0.1 && abs(dAlt) < 0.1 && abs(dFov) < 0.002) {
      viewAz = defaultAz;
      viewAlt = defaultAlt;
      HFOV = BASE_HFOV;
      userPanning = false;
      snapAnim = null;
      return;
    }
    viewAz = ((viewAz + dAz * SNAP_SPEED) % 360 + 360) % 360;
    viewAlt += dAlt * SNAP_SPEED;
    HFOV += dFov * SNAP_SPEED;
    snapAnim = requestAnimationFrame(tick);
  }
  snapAnim = requestAnimationFrame(tick);
}

// ── Mouse drag ──────────────────────────────────────────────────────────────
let dragStart = null;
let dragAzStart = 0;
let dragAltStart = 0;

function initDrag(cv) {
  cv.addEventListener('mouseleave', () => {
    document.getElementById('tooltip').style.display = 'none';
    dragStart = null;
  });

  cv.addEventListener('mousedown', e => {
    if (e.button !== 0) return;  // left click only
    dragStart = { x: e.clientX, y: e.clientY };
    dragAzStart = viewAz;
    dragAltStart = viewAlt;
    document.getElementById('tooltip').style.display = 'none';
  });

  window.addEventListener('mousemove', e => {
    if (!dragStart) return;
    const ppd = pxPerDeg();
    const dAz = -(e.clientX - dragStart.x) / ppd;
    const dAlt = (e.clientY - dragStart.y) / ppd;
    viewAz = ((dragAzStart + dAz) % 360 + 360) % 360;
    viewAlt = Math.max(-10, Math.min(88, dragAltStart + dAlt));
    startUserPan();
  });

  window.addEventListener('mouseup', () => { dragStart = null; });

  // ── Mouse wheel zoom ───────────────────────────────────────────────────
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.08 : 0.93;
    HFOV = Math.max(HFOV_MIN, Math.min(HFOV_MAX, HFOV * zoomFactor));
    startUserPan();
  }, { passive: false });

  // ── Double-click to snap back ─────────────────────────────────────────
  cv.addEventListener('dblclick', e => {
    e.preventDefault();
    HFOV = BASE_HFOV;
    clearTimeout(panTimeout);
    snapBack();
  });

  // ── Touch support ─────────────────────────────────────────────────────
  let touchStart = null;
  let touchAzStart = 0;
  let touchAltStart = 0;
  let pinchDist0 = null;
  let pinchFov0 = 0;

  cv.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchAzStart = viewAz;
      touchAltStart = viewAlt;
    } else if (e.touches.length === 2) {
      touchStart = null;
      pinchDist0 = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      pinchFov0 = HFOV;
    }
  }, { passive: true });

  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && touchStart) {
      const ppd = pxPerDeg();
      const dAz = -(e.touches[0].clientX - touchStart.x) / ppd;
      const dAlt = (e.touches[0].clientY - touchStart.y) / ppd;
      viewAz = ((touchAzStart + dAz) % 360 + 360) % 360;
      viewAlt = Math.max(-10, Math.min(88, touchAltStart + dAlt));
      startUserPan();
    } else if (e.touches.length === 2 && pinchDist0) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      HFOV = Math.max(HFOV_MIN, Math.min(HFOV_MAX, pinchFov0 * (pinchDist0 / dist)));
      startUserPan();
    }
  }, { passive: false });

  cv.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
      touchStart = null;
      pinchDist0 = null;
    } else if (e.touches.length === 1) {
      // Transition from pinch back to single-finger pan
      pinchDist0 = null;
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchAzStart = viewAz;
      touchAltStart = viewAlt;
    }
  }, { passive: true });
}

// ── Tooltip ─────────────────────────────────────────────────────────────────
function initTooltip(cv, getBodies) {
  cv.addEventListener('mousemove', e => {
    if (dragStart) return;
    const now = new Date(), jd = toJD(now), lst = lunarLST(jd, OBS.lon);
    const tt = document.getElementById('tooltip');
    let hit = null, md = 24;
    const bodies = getBodies();

    bodies.forEach(p => {
      if (p.alt < 0 || !inView(p.alt, p.az)) return;
      const { x, y } = proj(p.alt, p.az);
      const d = Math.hypot(e.clientX - x, e.clientY - y);
      if (d < md) { md = d; hit = { ...p, type: 'planet' }; }
    });

    if (!hit) STARS.forEach(s => {
      const aa = altaz(s.ra, s.dec, OBS.lat, lst);
      if (aa.alt < 0 || !inView(aa.alt, aa.az)) return;
      const { x, y } = proj(aa.alt, aa.az);
      const r = Math.max(4, (2.9 - s.mag * .52) * 2.8);
      const d = Math.hypot(e.clientX - x, e.clientY - y);
      if (d < r && d < md && s.name) { md = d; hit = { name: s.name, mag: s.mag, ...aa, ra: s.ra, dec: s.dec, type: 'star' }; }
    });

    if (hit) {
      tt.style.display = 'block';
      tt.style.left = (e.clientX + 18) + 'px';
      tt.style.top = (e.clientY - 8) + 'px';
      const extra = hit.isEarth ? `<br>PHASE  ${(hit.phase*100).toFixed(0)}% LIT` : (hit.dist ? `<br>${hit.dist.toFixed(4)} AU` : '');
      tt.innerHTML = `<div class="ttn">${hit.name || '\u2013'}</div>ALT  ${hit.alt.toFixed(2)}\u00b0<br>AZ   ${hit.az.toFixed(2)}\u00b0<br>RA   ${hit.ra.toFixed(3)}\u00b0<br>DEC  ${hit.dec.toFixed(3)}\u00b0` + (hit.mag != null ? `<br>MAG  ${hit.mag.toFixed(2)}` : '') + extra;
    } else {
      tt.style.display = 'none';
    }
  });
}

// ── Button handlers ─────────────────────────────────────────────────────────
function toggleLabels() {
  showLabels = !showLabels;
  localStorage.setItem('lunarsky-labels', showLabels ? 'on' : 'off');
  const btn = document.getElementById('lblBtn');
  btn.textContent = showLabels ? 'LABELS ON' : 'LABELS OFF';
  btn.classList.toggle('off', !showLabels);
}

function toggleEvents() {
  showEvents = !showEvents;
  localStorage.setItem('lunarsky-events', showEvents ? 'on' : 'off');
  const btn = document.getElementById('evtBtn');
  const panel = document.getElementById('events-panel');
  btn.textContent = showEvents ? 'EVENTS ON' : 'EVENTS OFF';
  btn.classList.toggle('off', !showEvents);
  panel.classList.toggle('hidden', !showEvents);
}

// Apply initial state to DOM (called from main.js init)
function initToggleState() {
  const lblBtn = document.getElementById('lblBtn');
  lblBtn.textContent = showLabels ? 'LABELS ON' : 'LABELS OFF';
  lblBtn.classList.toggle('off', !showLabels);

  const evtBtn = document.getElementById('evtBtn');
  const panel = document.getElementById('events-panel');
  evtBtn.textContent = showEvents ? 'EVENTS ON' : 'EVENTS OFF';
  evtBtn.classList.toggle('off', !showEvents);
  panel.classList.toggle('hidden', !showEvents);
}

function toggleFS() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function initFullscreen() {
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement;
    document.getElementById('fsPath').setAttribute('d', isFs
      ? 'M8 3v2H4v4H2V3h6zm8 0h6v6h-2V5h-4V3zM2 13h2v4h4v2H2v-6zm14 4h4v-4h2v6h-6v-2z'
      : 'M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4h-4v2h6v-6h-2v4z');
    document.getElementById('fsLabel').textContent = isFs ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') toggleFS();
    // Escape also snaps back to default view
    if (e.key === 'Escape' && userPanning) {
      HFOV = BASE_HFOV;
      clearTimeout(panTimeout);
      snapBack();
    }
  });
}
