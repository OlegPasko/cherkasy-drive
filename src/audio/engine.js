// Sample player for the game's recorded sounds (public/assets/audio, made by tools/audio/gen.mjs).
//
//   createAudioEngine({ base?, silent? }) -> engine
//     silent (?nosound): no AudioContext is ever made and nothing is fetched; every call is a quiet no-op
//     engine.ac                      the AudioContext (null until the first key / pointer gesture: autoplay policy)
//     engine.bus.{ sfx, vo, pax, amb, motor, ui, music }   GainNodes into the master; other code may connect its own nodes to them
//     engine.onReady(fn)             fn(engine) once the context exists (at once if it already does)
//     engine.play(id, { pos?, vol?, rate?, jitter?, bus?, ref? }) -> voice | null
//         one random variant of `id`; with `pos` ({x,y,z}) it is placed around the listener: distance roll-off from
//         `ref` metres (default 8) and a left/right pan. Unknown or not yet decoded ids are skipped (and start loading).
//     engine.loop(id, { bus?, vol? }) -> { gain: AudioParam, rate: AudioParam, set(vol, tc?) }   a seamless loop, starts silent
//     engine.say(id, { force?, delay? }) -> bool   a voice line (dispatcher on the radio bus, or the taxi passenger): one at
//         a time (a busy channel drops non-forced lines), never the same variant twice in a row; ambience and motor duck under it
//     engine.setListener(pos, rightVec)   world listener for `play({ pos })`
//     engine.mute(['motor', ...], bool)   silences buses (fades) until unmuted; ducking leaves them silent
//     engine.setPaused(bool)              suspends the context (the city map is open); gestures meanwhile do not wake it
//     engine.has(id), engine.index        what index.json lists
//   Every file is levelled at generation time, so the index `gain` and the per-call `vol` are the whole mix.
const VOICE = new Set(['vo', 'pax']); // index groups that are speech (dispatcher / taxi passenger)

export function createAudioEngine({ base = 'assets/audio/', silent = false } = {}) {
  let ac = null, index = {}, paused = false, master = null;
  const bus = {}, buffers = new Map(), loading = new Map(), waiting = [], last = new Map();
  const L = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  let radio = null, radioEnd = 0;

  const indexReady = silent ? Promise.resolve() : fetch(base + 'index.json').then((r) => (r.ok ? r.json() : {})).then((j) => { index = j; }).catch(() => {});

  const url = (id, k) => `${base}${index[id].g}/${id}_${k}.mp3`;
  function fetchBuf(id, k) { // -> Promise<AudioBuffer | null>, once per file
    const key = id + '#' + k;
    if (!loading.has(key)) {
      loading.set(key, fetch(url(id, k)).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b))
        .then((buf) => { buffers.set(key, buf); return buf; }).catch(() => { loading.delete(key); return null; }));
    }
    return loading.get(key);
  }
  function load(id, k) { fetchBuf(id, k); return buffers.get(id + '#' + k) || null; }
  function pick(id) { // a random variant, not the one played last time
    const n = index[id].n;
    let k = Math.floor(Math.random() * n);
    if (n > 1 && k === last.get(id)) k = (k + 1) % n;
    last.set(id, k);
    return k;
  }
  // effects and loops are decoded up front, so the first crash is not silent; voice lines load on their first call
  function preload() {
    for (const [id, e] of Object.entries(index)) if (!VOICE.has(e.g)) for (let k = 0; k < e.n; k++) load(id, k);
  }

  function start() {
    if (paused || silent) return;
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    // a gentle bus compressor keeps a pile-up (crash + glass + voice) from clipping
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = 0.9; master.connect(comp); comp.connect(ac.destination);
    for (const [name, v] of Object.entries({ sfx: 0.8, vo: 0.8, pax: 0.75, amb: 0.55, motor: 0.8, ui: 0.6, music: 0.35 })) {
      const g = ac.createGain(); g.gain.value = v; g.connect(master); bus[name] = g; g.base = v;
    }
    // the dispatcher comes over the radio: a gentle band-limit (the passenger in the cabin stays dry)
    const hp = ac.createBiquadFilter(), lp = ac.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 250; lp.type = 'lowpass'; lp.frequency.value = 5000;
    bus.vo.disconnect(); bus.vo.connect(hp); hp.connect(lp); lp.connect(master);
    indexReady.then(preload);
    for (const fn of waiting.splice(0)) fn(engine);
  }
  addEventListener('keydown', start); addEventListener('pointerdown', start);

  function place(node, pos, ref) { // -> gain factor, or 0 when too far to bother
    const dx = pos.x - L.x, dy = (pos.y ?? L.y) - L.y, dz = pos.z - L.z;
    const d = Math.hypot(dx, dy, dz);
    const g = ref / Math.max(ref, d);
    if (g < 0.03) return 0;
    if (node.pan) node.pan.value = d > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * L.rx + dz * L.rz) / d)) : 0;
    return g;
  }

  function play(id, { pos = null, vol = 1, rate = 1, jitter = 0.06, bus: b = null, ref = 8 } = {}) {
    if (!ac || ac.state !== 'running' || !index[id]) return null;
    const e = index[id], k = pick(id), buf = load(id, k);
    if (!buf) return null;
    const src = ac.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ac.createGain();
    let out = g;
    if (pos) {
      const p = ac.createStereoPanner(); const f = place(p, pos, ref);
      if (!f) return null;
      vol *= f; g.connect(p); out = p;
    }
    g.gain.value = vol * e.gain;
    src.connect(g); out.connect(bus[b || (bus[e.g] && e.g !== 'amb' && e.g !== 'motor' ? e.g : 'sfx')]);
    src.start();
    return src;
  }

  function loop(id, { bus: b = 'amb', vol = 0 } = {}) {
    const src = ac.createBufferSource(), g = ac.createGain();
    g.gain.value = vol; src.loop = true; src.connect(g); g.connect(bus[b]);
    let started = false, gainK = 1;
    const tryStart = () => { // the index or the buffer may still be loading: attach the buffer when it lands
      const e = index[id];
      if (started || !e) return;
      const k = tryStart.k ??= pick(id);
      const buf = load(id, k);
      if (!buf) { setTimeout(tryStart, 250); return; }
      gainK = e.gain;
      src.buffer = buf; src.loopEnd = buf.duration;
      src.start(0, Math.random() * buf.duration); started = true; // random phase: two players never line up
    };
    indexReady.then(tryStart);
    return {
      gain: g.gain, rate: src.playbackRate,
      set(v, tc = 0.15) { g.gain.setTargetAtTime(v * gainK, ac.currentTime, tc); },
    };
  }

  // bus levels = base x (0 while muted) x (the duck under a voice line)
  const DUCK = { amb: 0.45, motor: 0.6, sfx: 0.8, music: 0.45 }, muted = new Set();
  let ducked = false;
  function levels(tc) {
    const t = ac.currentTime;
    for (const [n, g] of Object.entries(bus)) g.gain.setTargetAtTime(muted.has(n) ? 0 : g.base * (ducked ? DUCK[n] ?? 1 : 1), t, tc);
  }
  function duck(on) { ducked = on; levels(on ? 0.08 : 0.5); }
  // speech: one line at a time. A line not decoded yet is fetched and still said if it arrives within 1.5 s.
  function say(id, { force = false, delay = 0 } = {}) {
    if (!ac || ac.state !== 'running' || !index[id]) return false;
    if (ac.currentTime < radioEnd && !force) return false;
    const k = pick(id), asked = ac.currentTime;
    radioEnd = Math.max(radioEnd, asked + 1.5); // hold the channel while the file loads
    fetchBuf(id, k).then((buf) => {
      if (!buf || ac.currentTime - asked > 1.5) { radioEnd = 0; return; }
      try { radio?.stop(); } catch { /* already over */ }
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; g.gain.value = index[id].gain; src.connect(g); g.connect(bus[index[id].g] || bus.vo);
      const at = ac.currentTime + delay;
      src.start(at);
      radio = src; radioEnd = at + buf.duration + 0.4;
      duck(true);
      src.onended = () => { if (radio === src) { radio = null; duck(false); } };
    });
    return true;
  }

  const engine = {
    silent,
    get ac() { return ac; }, bus, get index() { return index; },
    has: (id) => !!index[id],
    onReady(fn) { if (ac) fn(engine); else waiting.push(fn); },
    play, loop, say,
    setListener(p, right) { L.x = p.x; L.y = p.y; L.z = p.z; if (right) { const n = Math.hypot(right.x, right.z) || 1; L.rx = right.x / n; L.rz = right.z / n; } },
    mute(names, on) { for (const n of names) on ? muted.add(n) : muted.delete(n); if (ac) levels(on ? 0.05 : 0.3); },
    setPaused(v) {
      paused = !!v;
      if (ac) (paused ? ac.suspend() : ac.resume())?.catch?.(() => {});
    },
  };
  return engine;
}
