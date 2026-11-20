// The player's two cars: the Cybertruck and the Roadster, both open from the start. V (or the HUD chip) switches
// between them. The choice is kept in localStorage ('cherkasy.car') and restored on the next start.
//   createGarage({ car, hud?, storage? (localStorage) }) -> { kind, toggle() -> bool (switched), onSwap: fn(kind) | null }
//   car: game/car/car.js (swap(kind), kind)
//   hud: setGarage({ kind }) (the chip), mission.banner(title, sub, color)
//   CAR_KEY
export const CAR_KEY = 'cherkasy.car';

export function createGarage({ car, hud = null, storage }) {
  let want = 'cybertruck';
  try { storage ??= globalThis.localStorage; } catch { storage = null; } // a blocked storage throws on access
  try { want = storage?.getItem(CAR_KEY) === 'roadster' ? 'roadster' : 'cybertruck'; } catch { /* storage off */ }
  if (want === 'roadster' && car.kind !== 'roadster') car.swap('roadster');
  const chip = () => hud?.setGarage?.({ kind: car.kind });
  chip();

  const g = {
    get kind() { return car.kind; },
    onSwap: null,
    toggle() {
      const next = car.kind === 'roadster' ? 'cybertruck' : 'roadster';
      if (!car.swap(next)) return false;
      try { storage?.setItem(CAR_KEY, next); } catch { /* storage off */ }
      chip();
      hud?.mission?.banner?.(next === 'roadster' ? '🚀 Roadster' : 'Cybertruck', next === 'roadster'
        ? 'Тримай Shift – тиск газу, відпусти – стрибок' : 'Тримай Shift – крила і тяга', '#f2c14e');
      g.onSwap?.(next);
      return true;
    },
  };
  return g;
}
