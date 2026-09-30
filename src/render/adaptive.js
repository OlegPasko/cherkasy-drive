// Adaptive render resolution: on a machine that cannot hold the frame budget it lowers the render pixel ratio in a few
// coarse steps (a slightly softer image instead of stutter), and gives it back once there is room. A capable machine
// never leaves full resolution. Pure logic: no DOM, no three.js, driven by real frame intervals.
//
//   createAdaptiveRes({ getBase, apply, onStep?, budget = 1/48 }) -> ares
//     getBase() -> the quality's own pixel ratio (post.baseDpr); apply(f): render at base * f (post.setAdaptive)
//     onStep({ from, to, dpr, reason, ms }) after each change; reason 'slow' | 'headroom' | 'probe' | 'nogain'
//     ares.update(dt, active, work?)  one real animation-frame interval in seconds (NOT the clamped sim dt, NOT tick()
//                              steps); active = false while nothing renders (map open, hidden tab): the watch restarts;
//                              work: the frame's own JS time in seconds (the whole step, draw submission included)
//     ares.restart(grace?)     back to full resolution, unlocked, nothing counts for `grace` s (quality change; a new
//                              display's pixel ratio does the same by itself)
//     ares.settle()            the canvas was resized: drop the samples and any pending gain check
//     ares.level (0 = full), ares.factor, ares.dpr, ares.ladder, ares.locked, ares.cpuBound
//     ares.atFloor             true when no lower step is left (floor, CPU-bound, or a step bought nothing): the G offer
//                              may show
//   ladder(base) -> effective pixel ratios, base first, ~0.2 apart, down to min(base, 1) (never below the quality's own base)
//
// Down: the mean interval over DOWN_WIN s (hitches over 3x the median left out) above the budget; shorter dips (a
// district streaming in, a crash, another app) pass. Not the median: GPU-bound frames land on vsync ticks, so 43 fps on
// a 60 Hz display is a 16.7 / 33.3 ms mix whose median says 60. Steps are COOLDOWN s apart (each one reallocates the
// composer, AO, bloom, SMAA and reflection targets, a hitch). A step that does not cut that mean (over GAIN_WIN s at the
// new size) by MIN_GAIN is undone and nothing deeper is tried (CPU-bound, or a frame cap). No step is tried at all while
// the frame's own JS time is over CPU_K x budget or CPU_R of the interval: the CPU is the limit, fewer pixels do not help
// (WebGL calls only queue work for the GPU process, so a GPU-bound frame shows as a gap after the JS, not in it).
// Up: UP_AFTER s since the last step down and UP_WIN s with the p90 under UP_K x budget, and then either the mean scaled
// by the pixel growth still fits UP_FIT x budget (real headroom, e.g. at 120 Hz), or – when vsync hides the headroom –
// PROBE s have passed. A step up followed by a step down within REV_WIN s failed: the next probe waits twice as long, and
// after MAX_FAIL of them nothing steps up any more (locked; a heavier load can still step down). Intervals over MAX_DT (a pause, a stall, a background tab) restart the watch.
const GRACE = 10, SETTLE = 1, MAX_DT = 0.25, EVAL = 0.5, DOWN_WIN = 4, GAIN_WIN = 3, COOLDOWN = 3, MIN_GAIN = 0.08, STEP = 0.2, KEEP = 8;
const CPU_K = 0.9, CPU_R = 0.8, UP_WIN = 8, UP_K = 0.85, UP_FIT = 0.8, UP_AFTER = 20, PROBE = 60, REV_WIN = 30, MAX_FAIL = 2;

export function ladder(base) {
  const floor = Math.min(base, 1);
  const n = base - floor < 0.05 ? 0 : Math.max(1, Math.round((base - floor) / STEP));
  return Array.from({ length: n + 1 }, (_, i) => (n ? +(base - (base - floor) * i / n).toFixed(4) : base));
}

// median and p90 of the intervals newer than `since` (internal clock, s), and the mean interval and JS work per frame
// without the hitches (over 3x the median)
function stats(ts, ds, ws, since) {
  const v = [];
  for (let i = 0; i < ts.length; i++) if (ts[i] >= since) v.push(i);
  const d = v.map((i) => ds[i]).sort((a, b) => a - b);
  const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : 0);
  const median = q(0.5);
  let s = 0, w = 0, n = 0;
  for (const i of v) if (ds[i] <= 3 * median) { s += ds[i]; w += ws[i]; n++; } // a hitch (a shader compile) is neither
  return { median, p90: q(0.9), mean: n ? s / n : 0, work: n ? w / n : 0 };
}

export function createAdaptiveRes({ getBase, apply, onStep = null, budget = 1 / 48 } = {}) {
  let t = 0, grace = GRACE, base = getBase(), steps = ladder(base), level = 0;
  let ts = [], ds = [], ws = [], since = 0, lastEval = 0, lastStep = -1e9, lastDown = -1e9, lastUp = -1e9, fails = 0;
  let locked = false, deepest = Infinity, pending = null, cpuBound = false;

  const clear = (g) => { ts = []; ds = []; ws = []; since = t; grace = Math.max(grace, g); };
  function set(to, reason, sec) {
    const from = level;
    if (to === from) return;
    if (reason === 'slow' && t - lastUp < REV_WIN && ++fails >= MAX_FAIL) locked = true; // the step up did not hold
    if (reason === 'probe' || reason === 'headroom') lastUp = t;
    level = to; lastStep = t; if (to > from) lastDown = t;
    apply(steps[level] / base);
    clear(SETTLE); // the resize hitch and the first frames at the new size say nothing
    onStep?.({ from, to, dpr: steps[level], reason, ms: Math.round(sec * 1e4) / 10 });
  }

  function update(dt, active = true, work = 0) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    t += dt;
    if (!active || dt > MAX_DT) {
      if (!active) pending = null; // what comes back (another place, another load) cannot judge the last step
      clear(SETTLE);
      return;
    }
    if (Math.abs(getBase() - base) > 1e-3) { restart(SETTLE); return; } // another display: start over at full resolution
    if (grace > 0) { grace -= dt; if (grace <= 0) since = t; return; }
    ts.push(t); ds.push(dt); ws.push(work);
    if (ts[0] < t - KEEP - 1) {
      const k = ts.findIndex((x) => x >= t - KEEP);
      ts = ts.slice(k); ds = ds.slice(k); ws = ws.slice(k);
    }
    if (t - lastEval < EVAL) return;
    lastEval = t;
    const span = t - since;
    if (pending) { // did the last step down pay off?
      if (span < GAIN_WIN) return;
      const now = stats(ts, ds, ws, t - GAIN_WIN).mean;
      if (now > pending.before * (1 - MIN_GAIN)) { deepest = pending.from; set(pending.from, 'nogain', now); }
      pending = null;
      return;
    }
    if (span >= DOWN_WIN && t - lastStep >= COOLDOWN && level < Math.min(steps.length - 1, deepest)) {
      const s = stats(ts, ds, ws, t - DOWN_WIN);
      cpuBound = s.work > Math.min(CPU_K * budget, CPU_R * s.mean);
      if (s.mean > budget && !cpuBound) { pending = { from: level, before: s.mean }; set(level + 1, 'slow', s.mean); return; }
    }
    if (level > 0 && !locked && span >= UP_WIN && t - lastDown >= UP_AFTER) {
      const s = stats(ts, ds, ws, t - UP_WIN), grow = (steps[level - 1] / steps[level]) ** 2;
      if (s.p90 >= UP_K * budget) return;
      if (s.mean * grow < UP_FIT * budget) set(level - 1, 'headroom', s.mean);
      else if (t - lastDown >= PROBE * 2 ** fails) set(level - 1, 'probe', s.mean);
    }
  }

  function settle() { pending = null; clear(SETTLE); } // the canvas was resized: the samples so far compare nothing

  function restart(g = GRACE) {
    base = getBase(); steps = ladder(base);
    if (level) { level = 0; apply(1); }
    lastStep = lastDown = lastUp = -1e9; fails = 0; locked = false; deepest = Infinity; pending = null; cpuBound = false;
    grace = 0; clear(g);
  }

  return {
    update, restart, settle,
    get level() { return level; },
    get factor() { return steps[level] / base; },
    get dpr() { return steps[level]; },
    get ladder() { return steps.slice(); },
    get locked() { return locked; },
    get cpuBound() { return cpuBound; },
    get atFloor() { return cpuBound || level >= Math.min(steps.length - 1, deepest); },
  };
}
