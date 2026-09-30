// OWNER: cherkasy. The low shore strip under the "Cherkaski berehovi skhyly" escarpment (the protected slopes of the
// Dnipro valley): from Sosnovyi bir to the old vul. Serzhanta Smirnova (now Zakhysnykiv Azovstali) in Mytnytsia the
// city stands on the third terrace ~30 m above the reservoir and drops to a floodplain / fill strip a few metres above
// the water along Haharina / Volodymyra Velykoho. That strip is mostly alluvial sand with thin grass and few trees
// (refs: the 2024 waterfront environmental assessment; beaches Sosnivskyi, Kazbetskyi, Riviera, Mytnytskyi).
//   shoreStrip(map) -> { A, B, lowK(x, y, z): 0..1 how much (x, z) at ground height y belongs to the sandy strip }
import { FRAME_OF } from './frame.js';

export const STRIP = { from: [49.4640, 32.0290], to: [49.4352, 32.0845], y0: 4.5, y1: 7.0 }; // y: map height (water -1.6)

export function shoreStrip(map) {
  const geo = FRAME_OF(map), A = geo.toXZ(...STRIP.from), B = geo.toXZ(...STRIP.to);
  const ex = B[0] - A[0], ez = B[1] - A[1], L2 = ex * ex + ez * ez;
  // cubic ease of v across [lo -> hi] (hi may sit below lo: a falling edge)
  const ease = (lo, hi, v) => { let u = (v - lo) / (hi - lo); u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - u - u); };
  return {
    A, B,
    lowK(x, y, z) { const t = ((x - A[0]) * ex + (z - A[1]) * ez) / L2; return ease(-0.08, -0.02, t) * ease(1.06, 1.0, t) * ease(STRIP.y1, STRIP.y0, y); },
  };
}
