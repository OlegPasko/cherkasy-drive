// A spot on the road next to a point of interest, for links like ?at=49.44412,32.05912 (the Telegram bot sends them
// with a finished request): the nearest stretch of motor road, the car in the right-hand lane, heading so the point
// sits ahead on the passenger side (one-way roads keep their own direction). Service alleys only win when nothing better
// is close. A street name (&road=, from the address) wins over a nearer unnamed side street: a building's address is
// the street it faces.
//   roadSpotNear(map, x, z, { maxR = 300, road? }) -> { x, z, yaw, dist, bridge } | null   map: map.json (roads[{ p, w, c, k, ow, n }])
//   yaw follows the car's convention: forward = (sin yaw, cos yaw)
// metres: what a service road / a road off the named street "costs", and how far before the point the car starts
const SERVICE_PENALTY = 25, OFF_STREET = 60, BACK = 25;
// the core of a street name: no street-type words, no punctuation ("проспект Хіміків" and "Хіміків проспект" -> "хіміків")
const TYPE = new Set(['вулиця', 'вул', 'проспект', 'просп', 'пр', 'провулок', 'пров', 'бульвар', 'бул', 'площа', 'пл', 'шосе', 'набережна', 'узвіз', 'проїзд']);
const core = (s) => String(s || '').toLowerCase().replace(/[.,«»"'’]/g, ' ').split(/\s+/).filter((w) => w && !TYPE.has(w)).join(' '); // (\b is ASCII-only)

export function roadSpotNear(map, x, z, { maxR = 300, road = '' } = {}) {
  let best = null;
  const want = core(road);
  for (const r of map?.roads || []) {
    if (r.k !== 'm' || !r.p) continue;
    const named = want && r.n && core(r.n).includes(want);
    const pen = (r.c === 'service' ? SERVICE_PENALTY : 0) + (want && !named ? OFF_STREET : 0), P = r.p;
    for (let i = 0; i + 3 < P.length; i += 2) {
      const ax = P[i], az = P[i + 1], dx = P[i + 2] - ax, dz = P[i + 3] - az, L2 = dx * dx + dz * dz;
      if (L2 < 1e-6) continue;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d > maxR || (best && d + pen >= best.score)) continue;
      best = { score: d + pen, px, pz, dx, dz, w: r.w || 6, ow: !!r.ow, dist: d, t, br: !!r.br };
    }
  }
  if (!best) return null;
  const L = Math.hypot(best.dx, best.dz);
  let ux = best.dx / L, uz = best.dz / L;
  // the point on the right: right of (ux, uz) in this x/z frame is (-uz, ux) when y is up and z points "down" the map
  const side = (x - best.px) * -uz + (z - best.pz) * ux;
  if (!best.ow && side < 0) { ux = -ux; uz = -uz; }
  // right-hand lane, a little before the point – but never past the segment's end behind us (a corner, a dead end)
  const room = (side < 0 && !best.ow ? 1 - best.t : best.t) * L;
  const off = best.ow ? 0 : best.w / 4, back = Math.min(BACK, best.dist, room);
  return { x: best.px - uz * off - ux * back, z: best.pz + ux * off - uz * back, yaw: Math.atan2(ux, uz), dist: best.dist, bridge: best.br };
}
