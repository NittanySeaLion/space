'use strict';

// ── Milky Way spine ─────────────────────────────────────────────────────────
const MWP = [];
(function buildMW() {
  for (let l = 0; l <= 360; l += 2) {
    const DEC_NGP = 27.128336, RA_NGP = 192.859508, L_NCP = 122.932;
    const lr2 = (l - L_NCP + 180) * D2R;
    const sinD = cos(DEC_NGP * D2R) * cos(lr2);
    const dec2 = asin(Math.max(-1, Math.min(1, sinD))) * R2D;
    const cosH = -sin(DEC_NGP * D2R) * sinD / (cos(dec2 * D2R) * cos(DEC_NGP * D2R) + 1e-12);
    let ha = acos(Math.max(-1, Math.min(1, cosH))) * R2D;
    if (sin(lr2) < 0) ha = 360 - ha;
    const dense = (l > 330 || l < 30 || abs(l - 60) < 25 || abs(l - 300) < 20) ? 2.0 : 1.0;
    MWP.push({ ra: n360(RA_NGP - ha), dec: dec2, dense });
  }
})();
