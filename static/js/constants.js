'use strict';

// ── Math constants & helpers ────────────────────────────────────────────────
const PI  = Math.PI;
const TAU = PI * 2;
const D2R = PI / 180;
const R2D = 180 / PI;

const sin   = Math.sin;
const cos   = Math.cos;
const tan   = Math.tan;
const atan2 = Math.atan2;
const asin  = Math.asin;
const acos  = Math.acos;
const sqrt  = Math.sqrt;
const abs   = Math.abs;
const pow   = Math.pow;
const floor = Math.floor;

function n360(a) { return ((a % 360) + 360) % 360; }
function toJD(d) { return d / 86400000 + 2440587.5; }

// ── Location templates ──────────────────────────────────────────────────────
const LOCATIONS = {
  shackleton: {
    key: 'shackleton',
    name: 'SHACKLETON CRATER',
    subtitle: 'LUNAR SOUTH POLE',
    badge: 'ARTEMIS III SITE',
    coordStr: '89.9\u00b0S  0.0\u00b0E',
    lat: -89.9, lon: 0.0,
    hfov: 90,
    groundFrac: 0.14,
    hasPanorama: true,
    shadowedFloor: true,
    dayNightSurface: false,
    earthOnHorizon: true,
    fixedViewAlt: null,
    fixedViewAz: 0,
    sunLabels: ['SUN ABOVE RIM', 'SUN BELOW RIM'],
    eventsNote: 'PERMANENT SHADOW \u00b7 LIBRATION \u00b17\u00b0',
  },
  tranquility: {
    key: 'tranquility',
    name: 'TRANQUILITY BASE',
    subtitle: 'SEA OF TRANQUILITY',
    badge: 'APOLLO 11 LANDING SITE',
    coordStr: '0.6741\u00b0N  23.4322\u00b0E',
    lat: 0.6741, lon: 23.4322,
    hfov: 90,
    groundFrac: 0,
    hasPanorama: false,
    shadowedFloor: false,
    dayNightSurface: false,
    earthOnHorizon: false,
    fixedViewAlt: 55,
    fixedViewAz: null,
    sunLabels: ['SUNRISE', 'SUNSET'],
    eventsNote: 'TIDAL LOCK \u00b7 EARTH ALWAYS VISIBLE',
  },
  orientale: {
    key: 'orientale',
    name: 'MARE ORIENTALE',
    subtitle: 'WESTERN LIMB',
    badge: 'THE EASTERN SEA',
    coordStr: '0\u00b0  87\u00b0W',
    lat: 0.0, lon: -87.0,
    hfov: 90,
    groundFrac: 0.14,
    hasPanorama: true,
    shadowedFloor: false,
    dayNightSurface: true,
    earthOnHorizon: true,
    fixedViewAlt: null,
    fixedViewAz: null,
    sunLabels: ['SUNRISE', 'SUNSET'],
    eventsNote: 'EARTH ON HORIZON \u00b7 LIBRATION \u00b17\u00b0',
  },
};

// ── Active location (from URL param) ────────────────────────────────────────
const _params = new URLSearchParams(window.location.search);
const LOC = LOCATIONS[_params.get('loc')] || LOCATIONS.orientale;

const OBS = { lat: LOC.lat, lon: LOC.lon, elev: 0.00 };
const BASE_HFOV = LOC.hfov * D2R;
let HFOV = BASE_HFOV;
const HFOV_MIN = 15 * D2R;   // max zoom in (15° FOV)
const HFOV_MAX = 120 * D2R;  // max zoom out (120° FOV)
const GROUND_FRAC = LOC.groundFrac;

// ── Lunar synodic constants ─────────────────────────────────────────────────
const SYNODIC          = 29.530588853;       // days
const JD_NEWMOON_REF  = 2451550.2597;       // Jan 6 2000 18:14 UTC
