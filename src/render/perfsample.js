// One-off frame-rate reports for analytics: how the game really runs on this machine after a minute and after five.
// Pure logic: no DOM, no three.js; fed real loop intervals like render/adaptive.js.
//
//   createPerfSample({ marks = [60, 300], onSample }) -> sample
//     sample.update(dt, active, work?)   one real animation-frame interval in seconds; active = false while nothing
//                                        renders (the map, a hidden tab); work: the frame's own JS time in seconds
//     onSample({ at, fps, low, js_ms })  once per mark, when that many seconds of running play have been watched:
//       fps: the average over the stretch since the last mark, low: the frame rate of its slowest tenth of frames
//       (the p90 interval), js_ms: the mean JS time per frame (near the frame time = the CPU is the limit)
// The first GRACE s (shader compiles, tiles uploading) and intervals over MAX_DT (a pause, a stall) count for nothing.
const GRACE = 10, MAX_DT = 0.5;

export function createPerfSample({ marks = [60, 300], onSample } = {}) {
  let grace = GRACE, t = 0, next = 0, ds = [], work = 0;
  function update(dt, active = true, w = 0) {
    if (next >= marks.length || !active || !(dt > 0) || dt > MAX_DT) return;
    if (grace > 0) { grace -= dt; return; }
    t += dt; ds.push(dt); work += w;
    if (t < marks[next]) return;
    const n = ds.length, sum = ds.reduce((a, b) => a + b, 0), sorted = ds.slice().sort((a, b) => a - b);
    const p90 = sorted[Math.min(n - 1, Math.floor(0.9 * n))];
    onSample?.({ at: marks[next], fps: Math.round(n / sum), low: Math.round(1 / p90), js_ms: Math.round(work / n * 1e4) / 10 });
    next++; ds = []; work = 0;
  }
  return { update, get done() { return next >= marks.length; } };
}
