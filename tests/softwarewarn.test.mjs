// node tests/softwarewarn.test.mjs – the "no graphics card" card (ui/softwarewarn.js): once a day, keys held back until
// Enter / Space / Esc, the next card after it.
import assert from 'node:assert/strict';
import { showSoftwareWarning, WARN_KEY } from '../src/ui/softwarewarn.js';

const keyL = [];
globalThis.addEventListener = (t, fn) => { if (t === 'keydown') keyL.push(fn); };
globalThis.removeEventListener = (t, fn) => { const i = keyL.indexOf(fn); if (i >= 0) keyL.splice(i, 1); };
let clock = 0;
const realNow = performance.now.bind(performance);
performance.now = () => clock;
const mkEl = () => {
  const cls = new Set(), l = {};
  const btn = { addEventListener: (t, fn) => { l['btn:' + t] = fn; } };
  return { className: '', innerHTML: '', classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) }, cls, l, removed: false,
    querySelector: () => btn, addEventListener: (t, fn) => { l[t] = fn; }, remove() { this.removed = true; } };
};
const els = [];
const container = { ownerDocument: { createElement: () => { const e = mkEl(); els.push(e); return e; } }, appendChild() {} };
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };
const key = (code, extra = {}) => { const e = { code, prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra }; for (const fn of keyL.slice()) fn(e); return e; };

{
  const storage = store();
  let closed = 0;
  const T0 = 1.7e12;
  const w = showSoftwareWarning({ container, gpu: 'Vulkan <SwiftShader>', lowered: true, onClose: () => closed++, storage, now: T0 });
  assert.ok(w?.isOpen);
  const html = els.at(-1).innerHTML;
  assert.ok(html.includes('Vulkan &lt;SwiftShader&gt;'), 'the card name is escaped');
  assert.ok(html.includes('chrome://gpu') && html.includes('найпростішу'));
  assert.ok(!html.includes('—'), 'en-dashes only');
  assert.equal(storage.getItem(WARN_KEY), String(T0));
  clock = 100; assert.ok(key('Enter').prevented); assert.ok(w.isOpen, 'a key held through the load is not a close');
  clock = 1000;
  assert.ok(key('KeyW').prevented); assert.ok(w.isOpen, 'driving keys wait: the card is not dismissed unread');
  assert.ok(!key('KeyR', { ctrlKey: true }).prevented, 'browser shortcuts pass');
  key('Enter', { repeat: true }); assert.ok(w.isOpen);
  key('Enter');
  assert.ok(!w.isOpen); assert.equal(closed, 1); assert.equal(keyL.length, 0, 'the keys are the game\'s again');
  w.close(); assert.equal(closed, 1);
  // the same day: not again; the next day: again, without the "lowest level" line when the player keeps their own
  assert.equal(showSoftwareWarning({ container, storage, now: T0 + 3600e3 }), null);
  const w2 = showSoftwareWarning({ container, storage, now: T0 + 25 * 3600e3 });
  assert.ok(w2?.isOpen); assert.ok(!els.at(-1).innerHTML.includes('найпростішу'));
  els.at(-1).l['btn:click']({ stopPropagation() {} });
  assert.ok(!w2.isOpen, 'the button closes it');
}
// storage off: the card still shows
assert.ok(showSoftwareWarning({ container, storage: { getItem() { throw new Error('off'); }, setItem() { throw new Error('off'); } } })?.isOpen);
assert.equal(showSoftwareWarning({ container: null }), null);
performance.now = realNow;
console.log('softwarewarn ok');
process.exit(0); // the close timers
