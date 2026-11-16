// Slow-frame watch and the "simpler graphics" pill at the bottom of the screen. It samples real frame intervals, and once
// the frame rate has stayed low for several seconds (and the quality is not already the lowest) it drops one quality step
// (the post chain and what the world draws: main.js QUALITY_LEVELS, city.js DETAIL): by itself while the level is still
// the game's own pick (auto), saying so in the pill; once the player has chosen a level by hand it only offers G – or a
// click. G works any time and goes round: one step down, and from the lowest back to the highest; the pill then confirms
// the new level. The automatic steps only go down: a level is never raised behind the player's back.
//
//   createPerfHint({ container, getQuality, setQuality, levels = ['low', 'medium', 'high'], canAdapt?, auto? }) -> perf
//     container: where the pill goes (the HUD root, so F2 hides it too); getQuality() / setQuality(q, by): the core's,
//     by = 'user' (G, the pill's click) | 'auto' (the watch's own step)
//     auto() -> true while the level is the game's pick, not the player's (main.js ctx.qualityBy): slow frames step it down
//     canAdapt() -> true while the adaptive resolution (render/adaptive.js) still has a lower step: slow windows do not
//     count then, so the pill only offers G once the softer image alone has not been enough
//     perf.update()      once per running frame (not while paused: a pause shows up as a gap and restarts the watch)
//     perf.cycle()       one quality step down, the lowest wraps to the highest (G), with a confirmation
//     perf.restart()     judge afresh after a quality change from anywhere (F9 as well as G; the core calls it)
//     perf.fps           the last window's average frame rate (0 before the first one), perf.shown, perf.dispose()
// Tuning: WINDOW s windows, a window is slow under SLOW_FPS; SLOW_RUN slow windows in a row raise the pill. An automatic
// step wants AUTO_RUN of them (it changes the picture unasked, so a little more proof), or SLOW_RUN when they are all
// under BAD_FPS (unplayable: no point in waiting). Nothing counts for GRACE s after start or a quality change (shader
// compiles, tile uploads). An ignored pill hides after SHOW_S and comes back no sooner than the cooldown, which doubles
// each time.
const WINDOW = 2, SLOW_FPS = 40, BAD_FPS = 25, SLOW_RUN = 3, AUTO_RUN = 5, GRACE = 10, SHOW_S = 12, AUTO_S = 7, COOLDOWN = 90, GAP = 0.5;
const NAMES = { low: 'низька', medium: 'середня', high: 'висока' };

export function createPerfHint({ container, getQuality, setQuality, levels = ['low', 'medium', 'high'], canAdapt = () => false, auto = () => false }) {
  const doc = container.ownerDocument;
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'hud-perf';
  container.appendChild(pill);

  let last = 0, winT = 0, winN = 0, slowRun = 0, badRun = 0, fps = 0;
  let grace = GRACE, shownT = 0, mode = null, cooldown = 0, nextCooldown = COOLDOWN;

  const show = (m, html, secs) => { mode = m; shownT = secs; pill.innerHTML = html; pill.classList.add('on'); };
  const hide = () => { mode = null; pill.classList.remove('on'); };
  const restart = (g) => { winT = 0; winN = 0; slowRun = 0; badRun = 0; grace = Math.max(grace, g); };

  function cycle() {
    const i = levels.indexOf(getQuality()), q = levels[i > 0 ? i - 1 : levels.length - 1];
    setQuality(q, 'user');
    show('info', `Графіка: ${NAMES[q] || q}`, 2.5);
    restart(GRACE / 2); // judge the new level on fresh frames
  }
  // the watch's own step down (the level is still the game's pick): say what happened and how to undo it
  function lower() {
    const q = levels[levels.indexOf(getQuality()) - 1];
    setQuality(q, 'auto');
    show('info', `Гра гальмувала – графіка тепер ${NAMES[q] || q}. <kbd>G</kbd> – змінити`, AUTO_S);
    restart(GRACE / 2);
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
    const slow = fps < SLOW_FPS && !canAdapt();
    slowRun = slow ? slowRun + 1 : 0; badRun = slow && fps < BAD_FPS ? badRun + 1 : 0;
    winT = 0; winN = 0;
    if (levels.indexOf(getQuality()) <= 0) return; // nothing simpler left
    if (auto()) { if (slowRun >= AUTO_RUN || badRun >= SLOW_RUN) lower(); }
    else if (slowRun >= SLOW_RUN && !mode && !cooldown) {
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
