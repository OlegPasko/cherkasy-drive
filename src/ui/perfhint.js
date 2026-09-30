// Slow-frame watch and the "simpler graphics" pill at the bottom of the screen. It samples real frame intervals, and once
// the frame rate has stayed low for several seconds (and the quality is not already the lowest) it offers G – or a click –
// to drop one quality step. G works any time and goes round: one step down, and from the lowest back to the highest;
// the pill then confirms the new level.
//
//   createPerfHint({ container, getQuality, setQuality, levels = ['low', 'medium', 'high'], canAdapt? }) -> perf
//     container: where the pill goes (the HUD root, so F2 hides it too); getQuality() / setQuality(q): the core's
//     canAdapt() -> true while the adaptive resolution (render/adaptive.js) still has a lower step: slow windows do not
//     count then, so the pill only offers G once the softer image alone has not been enough
//     perf.update()      once per running frame (not while paused: a pause shows up as a gap and restarts the watch)
//     perf.cycle()       one quality step down, the lowest wraps to the highest (G), with a confirmation
//     perf.restart()     judge afresh after a quality change from anywhere (F9 as well as G; the core calls it)
//     perf.fps           the last window's average frame rate (0 before the first one), perf.shown, perf.dispose()
// Tuning: WINDOW s windows, a window is slow under SLOW_FPS; SLOW_RUN slow windows in a row raise the pill. Nothing counts
// for GRACE s after start or a quality change (shader compiles, tile uploads). An ignored pill hides after SHOW_S and
// comes back no sooner than the cooldown, which doubles each time.
const WINDOW = 2, SLOW_FPS = 40, SLOW_RUN = 3, GRACE = 10, SHOW_S = 12, COOLDOWN = 90, GAP = 0.5;
const NAMES = { low: 'низька', medium: 'середня', high: 'висока' };

export function createPerfHint({ container, getQuality, setQuality, levels = ['low', 'medium', 'high'], canAdapt = () => false }) {
  const doc = container.ownerDocument;
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'hud-perf';
  container.appendChild(pill);

  let last = 0, winT = 0, winN = 0, slowRun = 0, fps = 0;
  let grace = GRACE, shownT = 0, mode = null, cooldown = 0, nextCooldown = COOLDOWN;

  const show = (m, html, secs) => { mode = m; shownT = secs; pill.innerHTML = html; pill.classList.add('on'); };
  const hide = () => { mode = null; pill.classList.remove('on'); };
  const restart = (g) => { winT = 0; winN = 0; slowRun = 0; grace = Math.max(grace, g); };

  function cycle() {
    const i = levels.indexOf(getQuality()), q = levels[i > 0 ? i - 1 : levels.length - 1];
    setQuality(q);
    show('info', `Графіка: ${NAMES[q] || q}`, 2.5);
    restart(GRACE / 2); // judge the new level on fresh frames
  }
  pill.addEventListener('click', (e) => { e.stopPropagation(); if (mode === 'offer') cycle(); });

  function update() {
    const now = performance.now() / 1000, dt = last ? now - last : 0;
    last = now;
    if (!(dt > 0)) return;
    if (mode && (shownT -= dt) <= 0) {
      if (mode === 'offer') { cooldown = nextCooldown; nextCooldown *= 2; } // ignored: ask again later, and less often
      hide();
    }
    cooldown = Math.max(0, cooldown - dt);
    if (dt > GAP || doc.visibilityState === 'hidden') { restart(1); return; } // a pause or a background tab, not slowness
    if (grace > 0) { grace -= dt; return; }
    winT += dt; winN++;
    if (winT < WINDOW) return;
    fps = winN / winT;
    slowRun = fps < SLOW_FPS && !canAdapt() ? slowRun + 1 : 0;
    winT = 0; winN = 0;
    if (slowRun >= SLOW_RUN && !mode && !cooldown && levels.indexOf(getQuality()) > 0) {
      show('offer', 'Гра гальмує? <kbd>G</kbd> – простіша графіка', SHOW_S);
      slowRun = 0;
    }
  }

  return {
    update, cycle,
    restart() { if (mode === 'offer') hide(); restart(GRACE / 2); }, // a stale offer goes too
    get fps() { return fps; },
    get shown() { return mode; },
    dispose() { pill.remove(); },
  };
}
