// Headless checks for the adaptive render resolution (render/adaptive.js) on synthetic frame intervals, and the perf
// pill's hand-off to it (ui/perfhint.js). Run: node tests/adaptive.test.mjs
import { createAdaptiveRes, ladder } from '../src/render/adaptive.js';
import { createPerfHint } from '../src/ui/perfhint.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('FAIL', msg); } }

// a seeded jitter so every run is the same
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// A fake machine: per frame `cpu` s plus `gpu` s at full resolution, scaled by the pixel count; the GPU runs one frame
// behind (pipelined) and frames land on vsync ticks, so the intervals are vsync multiples whose mean tracks the real
// throughput – what Chrome's rAF shows on a GPU-bound page.
function machine({ base: base0 = 1.6, hz = 60, cpu = 0.004, gpu = 0.006, jitter = 0.1 } = {}) {
  const v = 1 / hz, log = [];
  let f = 1, now = 0, gpuFree = 0, base = base0;
  const ares = createAdaptiveRes({ getBase: () => base, apply: (k) => { f = k; }, onStep: (s) => log.push({ t: now, ...s }) });
  const m = {
    ares, log, cpu, gpu, setBase(b) { base = b; },
    get f() { return f; },
    run(secs, { active = true, extra = null } = {}) {
      const end = now + secs;
      while (now < end) {
        const c = m.cpu * (1 + jitter * (rnd() - 0.5)), g = m.gpu * f * f * (1 + jitter * (rnd() - 0.5));
        gpuFree = Math.max(gpuFree, now + c) + g;
        let next = Math.ceil((Math.max(now + Math.max(v, c), gpuFree - v) - 1e-9) / v) * v;
        const x = extra?.(now); if (x) next += x;
        const dt = next - now; now = next;
        ares.update(dt, active, c);
      }
      return m;
    },
  };
  return m;
}

// ---------------------------------------------------------------- the ladder
{
  const eq = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-3);
  ok(eq(ladder(1.6), [1.6, 1.4, 1.2, 1.0]), `retina high: 1.6 1.4 1.2 1.0 (got ${ladder(1.6)})`);
  ok(eq(ladder(1.25), [1.25, 1.0]), `retina medium: 1.25 1.0 (got ${ladder(1.25)})`);
  ok(eq(ladder(1.5), [1.5, 1.3333, 1.1667, 1.0]), `150% display: even steps to 1 (got ${ladder(1.5)})`);
  ok(eq(ladder(1), [1]), 'DPR 1: nothing to lower');
  ok(eq(ladder(0.75), [0.75]), 'low quality (0.75): never above or below its own base');
}

// ---------------------------------------------------------------- a capable machine never leaves full resolution
{
  const m = machine({ hz: 120, cpu: 0.003, gpu: 0.005 });
  // a hitch every ~7 s (tile upload, GC) and one long stall (> 0.25 s)
  m.run(120, { extra: (t) => (Math.abs(t % 7 - 3) < 0.005 ? 0.08 : Math.abs(t - 50) < 0.005 ? 0.4 : 0) });
  ok(m.log.length === 0 && m.f === 1, `120 Hz fast machine: no step in 120 s (${m.log.length})`);
  const m60 = machine({ hz: 60, cpu: 0.004, gpu: 0.009 }).run(120);
  ok(m60.log.length === 0 && m60.f === 1, `60 Hz display, 13 ms frames: no step (${m60.log.length})`);
  const edge = machine({ hz: 60, cpu: 0.004, gpu: 0.0135 }).run(120);
  ok(edge.log.length === 0, `~17.5 ms frames (57 fps) stay full resolution: the budget is 48 fps (${edge.log.length})`);
}

// ---------------------------------------------------------------- a GPU-bound weak machine steps down and settles
const fmt = (log) => log.map((s) => `${s.t.toFixed(0)}s:${s.dpr}/${s.reason}`).join(' ');
{
  const m = machine({ hz: 60, cpu: 0.004, gpu: 0.030 });
  m.run(8);
  ok(m.log.length === 0, 'nothing during the 10 s grace after load');
  m.run(32);
  ok(m.log.length >= 1 && m.log.every((s) => s.reason === 'slow') && m.f < 1, `34 ms frames: stepped down (${fmt(m.log)})`);
  ok(m.log.every((s, i) => i === 0 || s.t - m.log[i - 1].t >= 2.9), 'steps are at least ~3 s apart');
  ok(m.ares.dpr >= 1, `never below 1 device pixel per CSS pixel (${m.ares.dpr})`);

  // the load goes (left the heavy view): back to full resolution, not at once
  m.gpu = 0.006;
  const before = m.log.length;
  m.run(7.5);
  ok(m.log.length === before, 'no step up before 8 s of headroom');
  m.run(90);
  ok(m.f === 1 && m.ares.level === 0, `recovered to full resolution (${fmt(m.log.slice(before))})`);
  ok(m.log.slice(before).every((s) => s.to < s.from) && !m.ares.locked, 'a real load change: only steps up, nothing failed');
}
{
  // the load stays: vsync (60 Hz) hides any headroom, so at most MAX_FAIL probes up, far apart, then the level stays
  const m = machine({ hz: 60, cpu: 0.004, gpu: 0.030 }).run(900);
  const probes = m.log.filter((s) => s.reason === 'probe');
  ok(probes.length <= 2 && m.ares.locked, `steady heavy load, 15 min: ${probes.length} probes, then locked (${fmt(m.log)})`);
  ok(probes.every((s, i) => s.t - (i ? probes[i - 1].t : 0) >= 60), 'probes at least a minute apart');
  const last = m.log.length;
  m.run(600);
  ok(m.log.length === last && m.f < 1, 'nothing more once locked');
  m.gpu = 0.045; m.run(30);
  ok(m.log.length > last && m.log.at(-1).reason === 'slow' && m.ares.locked, `locked only stops steps up: a heavier load still steps down (${fmt(m.log.slice(last))})`);
}

// ---------------------------------------------------------------- CPU-bound: fewer pixels cannot help, so nothing is tried
{
  const m = machine({ hz: 60, cpu: 0.030, gpu: 0.004 }).run(120);
  ok(m.log.length === 0 && m.f === 1, `CPU-bound (30 ms of JS a frame): no step (${fmt(m.log)})`);
  ok(m.ares.cpuBound && m.ares.atFloor, 'reported CPU-bound: the G offer may show');
  m.cpu = 0.004; m.gpu = 0.030; m.run(30);
  ok(!m.ares.cpuBound && m.f < 1, 'the GPU becomes the limit: steps down after all');
}

// ---------------------------------------------------------------- JS fits the budget but fills most of the frame: still tried
{
  const m = machine({ hz: 60, cpu: 0.015, gpu: 0.020 }).run(60);
  ok(m.log[0]?.reason === 'slow' && m.f < 1, `15 ms JS + 20 ms GPU: a lower resolution is tried and kept (${fmt(m.log)})`);
}

// ---------------------------------------------------------------- a step that buys nothing is undone (a 30 fps cap)
{
  const m = machine({ hz: 30, cpu: 0.004, gpu: 0.012 }).run(120);
  ok(m.f === 1 && m.log.length === 2 && m.log[1].reason === 'nogain', `30 Hz cap: one probe, undone (${fmt(m.log)})`);
  ok(m.ares.atFloor, 'nothing deeper to try: the G offer may show');
  m.run(300);
  ok(m.log.length === 2, 'and it stays put');
}

// ---------------------------------------------------------------- on the edge, 120 Hz: real headroom steps back up
{
  // full res ~26 ms (slow), one step down ~19 ms: holds there, no probe spam
  const m = machine({ hz: 60, cpu: 0.002, gpu: 0.022 }).run(600);
  ok(m.log.filter((s) => s.reason === 'probe').length <= 2 && m.log.length <= 5, `edge machine, 10 min: ${fmt(m.log)}`);
  const h = machine({ hz: 120, cpu: 0.002, gpu: 0.022 }).run(30);
  h.gpu = 0.004; h.run(40);
  ok(h.f === 1 && h.log.at(-1).reason === 'headroom', `120 Hz: measured headroom brings it back (${fmt(h.log)})`);
}

// ---------------------------------------------------------------- inactive frames, restart
{
  const m = machine({ hz: 60, cpu: 0.004, gpu: 0.030 });
  m.run(60, { active: false });
  ok(m.log.length === 0, 'map open / hidden tab: nothing counts');
  m.run(30);
  ok(m.log.length >= 1, 'counts again once rendering resumes');
  const n = m.log.length;
  m.ares.restart();
  ok(m.f === 1 && m.ares.level === 0 && !m.ares.locked, 'restart (quality change): full resolution, unlocked');
  m.run(9);
  ok(m.log.length === n, 'and a fresh 10 s grace');
  // stepped intervals over MAX_DT (tick(), a breakpoint) never count as slowness
  const s = machine({ hz: 60, cpu: 0.004, gpu: 0.006 });
  for (let i = 0; i < 200; i++) s.ares.update(0.5, true);
  ok(s.log.length === 0, 'long gaps are ignored');
  // a resize mid gain check drops the check; another display starts over (locks and failed steps forgotten)
  const r = machine({ hz: 30, cpu: 0.004, gpu: 0.012 });
  r.run(15); // the first step down is pending its gain check
  ok(r.log.length === 1, 'a step is waiting for its gain check');
  r.ares.settle(); r.run(10);
  ok(!(r.log[1]?.reason === 'nogain' && r.log[1].to === 0), `settle() dropped the pending check (${fmt(r.log)})`);
  const d = machine({ hz: 30, cpu: 0.004, gpu: 0.012 }).run(60);
  ok(d.ares.atFloor && d.log.at(-1).reason === 'nogain', 'a no-gain step marks the floor');
  d.setBase(1.25); d.run(0.2);
  ok(!d.ares.atFloor && d.ares.ladder.join() === '1.25,1' && d.f === 1, 'a new display pixel ratio: new ladder, floor forgotten');
  const b = createAdaptiveRes({ getBase: () => 1, apply: () => { throw new Error('no apply at DPR 1'); } });
  for (let i = 0; i < 3000; i++) b.update(0.05, true);
  ok(b.level === 0 && b.atFloor, 'DPR 1: nothing to lower, atFloor from the start');
}

// ---------------------------------------------------------------- perf pill waits for the adaptive resolution
{
  let clock = 0;
  const realNow = performance.now.bind(performance);
  performance.now = () => clock;
  const el = () => ({ type: '', className: '', innerHTML: '', classList: { add() {}, remove() {} }, addEventListener() {}, remove() {} });
  const container = { ownerDocument: { createElement: el, visibilityState: 'visible' }, appendChild() {} };
  const run = (perf, secs, fps) => { for (let t = 0; t < secs; t += 1 / fps) { clock += 1000 / fps; perf.update(); } };
  let adapting = true, q = 'high';
  const perf = createPerfHint({ container, getQuality: () => q, setQuality: (x) => { q = x; }, canAdapt: () => adapting });
  run(perf, 40, 30);
  ok(!perf.shown, 'slow, but the resolution can still drop: no G offer');
  adapting = false;
  run(perf, 8, 30);
  ok(perf.shown === 'offer', 'at the adaptive floor and still slow: G is offered');
  const p2 = createPerfHint({ container, getQuality: () => q, setQuality: (x) => { q = x; } });
  run(p2, 15, 30);
  p2.restart();
  run(p2, 7, 30);
  ok(!p2.shown, 'restart (F9) gives a fresh grace and window');
  run(p2, 10, 30);
  ok(p2.shown === 'offer', 'slow again: offered');
  p2.restart();
  ok(!p2.shown, 'a quality change takes a standing offer away');
  performance.now = realNow;
}

if (process.env.VERBOSE) for (const [k, cfg] of Object.entries({ gpu30: { gpu: 0.030 }, gpu22: { cpu: 0.002, gpu: 0.022 }, cpu30: { cpu: 0.03, gpu: 0.004 }, cap30: { hz: 30, gpu: 0.012 } })) {
  const m = machine(cfg).run(300);
  console.log(k, m.log.map((s) => `${s.t.toFixed(1)}s ${s.dpr} ${s.reason} ${s.ms}ms`).join(' | '), m.ares.locked ? 'locked' : '');
}
console.log(`adaptive: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
