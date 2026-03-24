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

// ── Observer: Apollo 11 landing site, Sea of Tranquility ────────────────────
const OBS = { lat: 0.6741, lon: 23.4322, elev: 0.00 };  // deg, deg, km

// ── Lunar synodic constants ─────────────────────────────────────────────────
const SYNODIC          = 29.530588853;       // days
const JD_NEWMOON_REF  = 2451550.2597;       // Jan 6 2000 18:14 UTC

// ── Projection ──────────────────────────────────────────────────────────────
const HFOV = 100 * D2R;   // horizontal field of view (radians)
