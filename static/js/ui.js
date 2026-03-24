'use strict';

// ── View state ──────────────────────────────────────────────────────────────
let viewAz = 270;  // default facing West — Earth hangs near zenith at ~67° alt
let showLabels = true;
let showEvents = false;

// ── Drag to pan azimuth ─────────────────────────────────────────────────────
let dragStart = null;

function initDrag(cv) {
  cv.addEventListener('mousedown', e => {
    dragStart = { x: e.clientX, az: viewAz };
  });
  cv.addEventListener('mousemove', e => {
    if (dragStart) {
      const scale = W / (2 * Math.tan(HFOV / 2));
      const ddeg = (e.clientX - dragStart.x) / scale * R2D;
      viewAz = n360(dragStart.az - ddeg);
      document.getElementById('h-lun').textContent = `FACING  ${compassDir(viewAz)}  (${viewAz.toFixed(0)}\u00b0)`;
    }
  });
  cv.addEventListener('mouseup', () => { dragStart = null; });
  cv.addEventListener('mouseleave', () => { dragStart = null; document.getElementById('tooltip').style.display = 'none'; });
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
      if (d < r && d < md) { md = d; hit = { name: s.name || '\u2013', mag: s.mag, ...aa, ra: s.ra, dec: s.dec, type: 'star' }; }
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
  const btn = document.getElementById('lblBtn');
  btn.textContent = showLabels ? 'LABELS ON' : 'LABELS OFF';
  btn.classList.toggle('off', !showLabels);
}

function toggleEvents() {
  showEvents = !showEvents;
  const btn = document.getElementById('evtBtn');
  const panel = document.getElementById('events-panel');
  btn.textContent = showEvents ? 'EVENTS ON' : 'EVENTS OFF';
  btn.classList.toggle('off', !showEvents);
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
  document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') toggleFS(); });
}
