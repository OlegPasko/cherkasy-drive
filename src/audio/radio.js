// The car radio: Oleg's own tracks, off until the player turns it on. Nothing is fetched before that – not even the
// track list – and then only the track that plays, streamed by an <audio> element (no decoding of whole files).
//
//   createRadio({ engine, base? }) -> radio
//     engine: src/audio/engine.js (the music goes through its `music` bus, so it ducks under the dispatcher)
//     base: folder with tracks.json ([{ file, title, artist }]) and the files, default 'assets/radio/'
//   radio.toggle()  on / off (on resumes the current track where it stopped)
//   radio.next()    the next track (turns the radio on)
//   radio.state -> { on, loading, title, artist, i, n, empty }   radio.onChange = fn(state)
//   The order is shuffled once per session; a track that ends or fails moves on to the next.
export function createRadio({ engine, base = 'assets/radio/' }) {
  let list = null, order = [], at = 0, on = false, loading = false, el = null, wired = false, fails = 0;
  const state = () => {
    const t = list?.[order[at]];
    return { on, loading, title: t?.title || '', artist: t?.artist || '', i: at, n: list?.length || 0, empty: !!list && !list.length };
  };
  const changed = () => { try { radio.onChange?.(state()); } catch (e) { console.error('[radio]', e); } };

  async function loadList() {
    if (list) return list;
    try {
      const r = await fetch(base + 'tracks.json');
      list = r.ok ? (await r.json()).filter((t) => t?.file) : [];
    } catch { list = []; }
    order = list.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return list;
  }
  function player() {
    if (el) return el;
    el = new Audio();
    el.muted = !!engine?.silent; // ?nosound: the radio still runs its list, inaudibly
    el.preload = 'none';
    el.addEventListener('ended', () => next());
    el.addEventListener('error', () => { // a missing / broken file: skip it, but give up after a full round of failures
      if (on && ++fails < list.length) next(); else { on = false; loading = false; fails = 0; changed(); }
    });
    el.addEventListener('playing', () => { loading = false; fails = 0; changed(); });
    el.addEventListener('waiting', () => { loading = true; changed(); });
    return el;
  }
  // route through the engine once its context exists (the key press that turns the radio on is the needed gesture)
  function wire() {
    if (wired || !engine?.ac || !engine.bus.music) return;
    try { engine.ac.createMediaElementSource(el).connect(engine.bus.music); wired = true; } catch (e) { console.warn('[radio] direct output', e); wired = true; }
  }
  function load(i) {
    at = (i + list.length) % list.length;
    player().src = base + encodeURI(list[order[at]].file);
  }
  async function play() {
    loading = true; changed();
    await loadList();
    if (!on) { loading = false; changed(); return; }
    if (!list.length) { on = false; loading = false; changed(); return; }
    if (!player().src) load(at);
    wire();
    engine?.ac?.resume?.().catch(() => {});
    try { await el.play(); } catch { loading = false; changed(); }
  }

  function toggle() {
    on = !on;
    if (on) play(); else { el?.pause(); loading = false; changed(); }
  }
  async function next() {
    await loadList();
    if (!list.length) return;
    load(at + 1);
    on = true; play();
  }

  const radio = { toggle, next, get state() { return state(); }, onChange: null };
  return radio;
}
