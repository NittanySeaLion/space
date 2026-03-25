'use strict';

// ── Lunar events panel ──────────────────────────────────────────────────────

function sunAltitude(jd) {
  const pf = moonPhaseFrac(jd);
  const ssl = n360(pf * 360 - 180);
  const dlon = (OBS.lon - ssl) * D2R;
  const sinAlt = cos(OBS.lat * D2R) * cos(dlon);
  return asin(Math.max(-1, Math.min(1, sinAlt))) * R2D;
}

function nextSunEvent(jd, rising) {
  const step = 1/24;
  let a0 = sunAltitude(jd);
  for (let i = 1; i < 750; i++) {
    const jd1 = jd + i * step;
    const a1 = sunAltitude(jd1);
    const cross = rising ? (a0 < 0 && a1 >= 0) : (a0 >= 0 && a1 < 0);
    if (cross) {
      let lo = jd + (i-1)*step, hi = jd1;
      for (let b = 0; b < 20; b++) {
        const mid = (lo + hi) / 2;
        (sunAltitude(mid) < 0) === rising ? lo = mid : hi = mid;
      }
      return (lo + hi) / 2;
    }
    a0 = a1;
  }
  return null;
}

function earthAltitude(jd) {
  return earthFromMoon(jd).alt;
}

function nextEarthEvent(jd, rising) {
  const step = 1/24;
  let a0 = earthAltitude(jd);
  for (let i = 1; i < 750; i++) {
    const jd1 = jd + i * step;
    const a1 = earthAltitude(jd1);
    const cross = rising ? (a0 < 0 && a1 >= 0) : (a0 >= 0 && a1 < 0);
    if (cross) {
      let lo = jd + (i-1)*step, hi = jd1;
      for (let b = 0; b < 20; b++) {
        const mid = (lo + hi) / 2;
        (earthAltitude(mid) < 0) === rising ? lo = mid : hi = mid;
      }
      return (lo + hi) / 2;
    }
    a0 = a1;
  }
  return null;
}

function formatCountdown(jdEvent, jdNow) {
  const days = jdEvent - jdNow;
  if (days < 0) return 'PAST';
  const d = Math.floor(days);
  const h = Math.floor((days - d) * 24);
  const m = Math.floor(((days - d) * 24 - h) * 60);
  if (d > 0) return `IN  ${d}d ${h}h ${m}m`;
  if (h > 0) return `IN  ${h}h ${m}m`;
  return `IN  ${m}m`;
}

function jdToHouston(jd) {
  const date = new Date((jd - 2440587.5) * 86400000);
  return houstonTime(date).replace(/\s+/g, ' ');
}

let lastEventUpdate = 0;

function updateEventsPanel(jd) {
  if (jd - lastEventUpdate < 1/1440) return;
  lastEventUpdate = jd;

  const pf = moonPhaseFrac(jd);
  const sunAlt = sunAltitude(jd);
  const eAlt = earthAltitude(jd);
  const earthIllum = earthIllumination(pf);

  const jdSunrise = nextSunEvent(jd, true);
  const jdSunset  = nextSunEvent(jd, false);

  const isDaytime = sunAlt > 0;
  const phase_pct = Math.round(earthIllum * 100);

  const sunStateEl = document.getElementById('ep-sunstate');
  if (isDaytime) {
    sunStateEl.innerHTML = `<span class="ep-val">\u2600  LUNAR DAY</span>  ${sunAlt.toFixed(1)}\u00b0`;
  } else {
    sunStateEl.innerHTML = `<span class="ep-val">\u23fe  LUNAR NIGHT</span>  ${sunAlt.toFixed(1)}\u00b0`;
  }

  const srEl = document.getElementById('ep-sunrise');
  if (jdSunrise) {
    const cd = formatCountdown(jdSunrise, jd);
    const isSoon = (jdSunrise - jd) < 2;
    srEl.innerHTML = `${LOC.sunLabels[0]}  <span class="${isSoon?'ep-soon':'ep-val'}">${cd}</span><br>` +
      `<span class="ep-dim">${jdToHouston(jdSunrise)}</span>`;
  }

  const ssEl = document.getElementById('ep-sunset');
  if (jdSunset) {
    const cd = formatCountdown(jdSunset, jd);
    const isSoon = (jdSunset - jd) < 2;
    ssEl.innerHTML = `${LOC.sunLabels[1]}  <span class="${isSoon?'ep-soon':'ep-val'}">${cd}</span><br>` +
      `<span class="ep-dim">${jdToHouston(jdSunset)}</span>`;
  }

  // Earth altitude
  const earthAbove = eAlt > 0;
  document.getElementById('ep-earthalt').innerHTML =
    `EARTH  <span class="ep-val">${eAlt.toFixed(1)}\u00b0 ALT</span>  ${earthAbove ? 'ABOVE' : 'BELOW'} HORIZON`;

  // Earth rise/set events (only meaningful where Earth moves near horizon)
  const earthEvEl = document.getElementById('ep-earthevent');
  if (earthEvEl) {
    if (LOC.earthOnHorizon) {
      const jdER = nextEarthEvent(jd, true);
      const jdES = nextEarthEvent(jd, false);
      const nextEv = [];
      if (jdER) nextEv.push({ label: 'EARTHRISE', jd: jdER });
      if (jdES) nextEv.push({ label: 'EARTHSET',  jd: jdES });
      nextEv.sort((a, b) => a.jd - b.jd);
      if (nextEv.length) {
        const ev = nextEv[0];
        const cd = formatCountdown(ev.jd, jd);
        const isSoon = (ev.jd - jd) < 2;
        earthEvEl.innerHTML = `${ev.label}  <span class="${isSoon?'ep-soon':'ep-val'}">${cd}</span><br>` +
          `<span class="ep-dim">${jdToHouston(ev.jd)}</span>`;
      } else {
        earthEvEl.innerHTML = `<span class="ep-dim">NO EARTHRISE/SET FOUND</span>`;
      }
    } else {
      earthEvEl.innerHTML = `<span class="ep-dim">EARTH ALWAYS VISIBLE</span>`;
    }
  }

  const phaseNames = ['NEW','WAXING CRESCENT','FIRST QUARTER','WAXING GIBBOUS',
                      'FULL','WANING GIBBOUS','LAST QUARTER','WANING CRESCENT'];
  const phaseName = phaseNames[Math.round(pf * 8) % 8];
  document.getElementById('ep-earthphase').innerHTML =
    `EARTH PHASE  <span class="ep-val">${phase_pct}%</span><br>` +
    `<span class="ep-dim">${phaseName} (LUNAR VIEW)</span>`;

  const shineEl = document.getElementById('ep-earthshine');
  if (!isDaytime) {
    if (phase_pct > 80) shineEl.innerHTML = `<span class="ep-soon">EARTHSHINE  BRIGHT</span>`;
    else if (phase_pct > 40) shineEl.innerHTML = `EARTHSHINE  <span class="ep-val">MODERATE</span>`;
    else shineEl.innerHTML = `EARTHSHINE  <span class="ep-dim">FAINT</span>`;
  } else {
    shineEl.innerHTML = `<span class="ep-dim">EARTHSHINE  (DAYTIME)</span>`;
  }
}
