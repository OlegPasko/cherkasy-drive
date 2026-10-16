// The player's two cars: the Cybertruck from the start, and the Roadster once every sight of the city is found
// (game/explore.js: visited === total). V (or the HUD chip) switches between them; while the Roadster is locked it says
// how many sights are left. The choice is kept in localStorage ('cherkasy.car'); being unlocked is not stored, it
// follows the sights (a sight added to places.js later locks it again until it is visited too). When the last sight
// is found mid-ride the unlock is announced at once (after the "all sights" banner).
//   createGarage({ car, explore, hud?, storage? (localStorage), force? (dev: unlocked regardless) })
//     -> { kind, unlocked, left, total, toggle() -> bool (switched), update(dt), onSwap: fn(kind) | null }
//   car: game/car/car.js (swap(kind), kind); explore: { visited, total }
//   hud: setGarage({ kind, unlocked, left, total, fresh? }) (the chip), mission.banner(title, sub, color)
//   isUnlocked(explore) -> bool (pure); CAR_KEY
export const CAR_KEY = 'cherkasy.car';
export const isUnlocked = (ex) => !!ex && ex.total > 0 && ex.visited >= ex.total;
const NAME = { cybertruck: 'Cybertruck', roadster: 'Roadster' };
const ANNOUNCE_AFTER = 3.4; // s: the explore banner for the last sight shows first

export function createGarage({ car, explore, hud = null, storage, force = false }) {
  let want = 'cybertruck';
  try { storage ??= globalThis.localStorage; } catch { storage = null; } // a blocked storage throws on access
  try { want = storage?.getItem(CAR_KEY) === 'roadster' ? 'roadster' : 'cybertruck'; } catch { /* storage off */ }
  const unlocked = () => force || isUnlocked(explore);
  const left = () => Math.max(0, (explore?.total || 0) - (explore?.visited || 0));
  let was = unlocked(), announceT = -1, shown = '';
  if (want === 'roadster' && was && car.kind !== 'roadster') car.swap('roadster');
  const chip = (fresh = false) => {
    const key = `${car.kind}|${unlocked()}|${left()}`;
    if (key === shown && !fresh) return;
    shown = key;
    hud?.setGarage?.({ kind: car.kind, unlocked: unlocked(), left: left(), total: explore?.total || 0, fresh });
  };
  chip();
  const banner = (t, sub, col) => hud?.mission?.banner?.(t, sub, col);

  const g = {
    get kind() { return car.kind; },
    get unlocked() { return unlocked(); },
    get left() { return left(); },
    get total() { return explore?.total || 0; },
    onSwap: null,
    toggle() {
      if (!unlocked()) {
        const n = left(), t = explore?.total || 0;
        banner('🔒 Відкрий усі пам’ятки, щоб сісти в Roadster', `Залишилось ${n} з ${t} · 📍 на мапі (M)`, '#f2c14e');
        return false;
      }
      const next = car.kind === 'roadster' ? 'cybertruck' : 'roadster';
      if (!car.swap(next)) return false;
      want = next;
      try { storage?.setItem(CAR_KEY, next); } catch { /* storage off */ }
      chip();
      banner(next === 'roadster' ? '🚀 Roadster' : 'Cybertruck', next === 'roadster'
        ? 'Тримай Shift – тиск газу, відпусти – стрибок' : 'Тримай Shift – крила і тяга', '#f2c14e');
      g.onSwap?.(next);
      return true;
    },
    update(dt) {
      const u = unlocked();
      if (u && !was) announceT = ANNOUNCE_AFTER; // the last sight just fell
      was = u;
      if (announceT > 0 && (announceT -= dt) <= 0) {
        banner('🚀 Roadster відкрито!', 'Натисни V, щоб пересісти', '#f2c14e');
        chip(true);
      } else chip();
    },
  };
  return g;
}
