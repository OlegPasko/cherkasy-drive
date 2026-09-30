// A one-way line from the simulation to the sound system, so world modules (wrecks, trees, people, missions) can ask
// for a sound without holding a reference to it. Silent until src/audio/game.js plugs a listener in; demos and tests
// that never do simply drop the cues.
//
//   cue(name, data?)      e.g. cue('wreck', { x, y, z, k }), cue('mission', { what: 'begin', type })
//   setCueListener(fn)    fn(name, data) or null
let listener = null;

export function cue(name, data) {
  if (listener) { try { listener(name, data); } catch (e) { console.error('[audio] cue', name, e); } }
}
export function setCueListener(fn) { listener = typeof fn === 'function' ? fn : null; }
