// The "no graphics card" card: shown at the game's start when the browser draws WebGL in software (SwiftShader, the
// Microsoft Basic Render Driver, llvmpipe: render/gpuinfo.js isSoftware). The graphics acceleration is off or the driver
// is blocked, so no graphics level will make the game smooth; the card says how to turn it on. At most once a day
// ('cherkasy.softwarn' keeps the last time), since a player on a virtual machine cannot fix it.
// While it is open the keys go to it, not to the game: Enter / Space / Esc or the button close it, the rest wait, so a
// player who is already holding W does not dismiss it unread.
//   showSoftwareWarning({ container, gpu, lowered?, onClose?, storage?, now? }) -> { isOpen, close() } | null (shown today)
//     gpu: the renderer's name for the card; lowered: the game has put the graphics on the lowest level (say so)
// The styles are ui/softwarewarn.css (imported by main.js: node tests load this module without a css loader).
export const WARN_KEY = 'cherkasy.softwarn';
const DAY = 864e5;
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function showSoftwareWarning({ container = globalThis.document?.body, gpu = '', lowered = false, onClose = null, storage, now = Date.now() } = {}) {
  try { storage ??= globalThis.localStorage; if (now - (+storage?.getItem(WARN_KEY) || 0) < DAY) return null; } catch { /* storage off: show it */ }
  if (!container) return null;
  const doc = container.ownerDocument, el = doc.createElement('div');
  el.className = 'sw-warn';
  el.innerHTML = `<div class="sw-card" role="dialog" aria-label="Гра йде без відеокарти">
    <div class="sw-tag">УВАГА</div>
    <h3>Гра йде без відеокарти</h3>
    <p class="sw-lead">Браузер зараз малює гру процесором, тому вона гальмуватиме на будь-якій графіці. Майже завжди це
    вимкнене апаратне прискорення – вмикається за хвилину:</p>
    <ul>
      <li><b>Chrome, Edge, Opera:</b> Налаштування → Система → увімкни перемикач про апаратне (графічне) прискорення → перезапусти браузер.</li>
      <li><b>Firefox:</b> Налаштування → Загальні → Продуктивність → «Використовувати апаратне прискорення».</li>
      <li><b>Ноутбук із двома відеокартами:</b> Параметри Windows → Система → Дисплей → Графіка → додай браузер → «Висока продуктивність».</li>
      <li>Уже ввімкнено? Онови драйвер відеокарти. Перевірити можна на сторінці <code>chrome://gpu</code>: рядки «Software only» – це воно.</li>
    </ul>
    <div class="sw-now">Зараз гру малює: <b>${esc(gpu || 'програмний рендер')}</b>.${lowered ? ' Графіку поставлено на найпростішу.' : ''}</div>
    <button type="button">Зрозуміло, грати так</button>
    <div class="sw-foot">Enter – закрити</div>
  </div>`;
  container.appendChild(el);
  globalThis.requestAnimationFrame?.(() => el.classList.add('on'));
  try { storage?.setItem(WARN_KEY, String(now)); } catch { /* storage off */ }
  const born = globalThis.performance?.now() ?? 0;
  let open = true;
  function close() {
    if (!open) return;
    open = false;
    globalThis.removeEventListener?.('keydown', onKey, true);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 350);
    onClose?.();
  }
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(Meta|Control|Alt|OS|Tab|F\d+)/.test(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || (globalThis.performance?.now() ?? 1e9) - born < 600) return;
    if (/^(Enter|NumpadEnter|Space|Escape)$/.test(e.code)) close();
  }
  globalThis.addEventListener?.('keydown', onKey, true);
  el.querySelector('button')?.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  return { get isOpen() { return open; }, close, el };
}
