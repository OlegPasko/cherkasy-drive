// Tiny synchronous pub/sub shared between systems.
//   createEvents() -> bus { on(type, fn) -> off(), once(type, fn) -> off(), off(type, fn), emit(type, payload), clear(type?), count(type) }
// Listeners run in subscription order; a throwing listener is logged and does not stop the others. Unsubscribing from
// inside a handler is safe (emit iterates over a snapshot).

export function createEvents() {
  const table = new Map();

  function on(type, fn) {
    let list = table.get(type);
    if (!list) table.set(type, (list = []));
    list.push(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    const list = table.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) table.delete(type);
  }

  function once(type, fn) {
    const wrap = (p) => { off(type, wrap); fn(p); };
    return on(type, wrap);
  }

  function emit(type, payload) {
    const list = table.get(type);
    if (!list) return 0;
    const snap = list.slice();
    for (const fn of snap) {
      try { fn(payload); } catch (err) { console.error(`[events] "${type}" handler failed`, err); }
    }
    return snap.length;
  }

  const clear = (type) => (type === undefined ? table.clear() : table.delete(type));
  const count = (type) => table.get(type)?.length ?? 0;

  return { on, once, off, emit, clear, count };
}
