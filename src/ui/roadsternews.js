// The one-time news card for the Roadster (the second car, game/garage.js): shown once on the next game start to every
// player, after the consent card, in the HUD's style. What the car does, how to earn it (every sight), the player's
// progress, the key. A player who already has every sight sees it as unlocked. Seen once -> 'cherkasy.news.roadster'.
// While it is open the keys go to it, not to the game (any key or a click closes it; V also switches the car when it is
// unlocked), so the car does not start rolling underneath.
//   showRoadsterNews({ container, visited, total, unlocked, onSwitch?, storage? }) -> { isOpen, close() } | null (seen)
import './roadsternews.css';

export const NEWS_KEY = 'cherkasy.news.roadster';
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function showRoadsterNews({ container = globalThis.document?.body, visited = 0, total = 0, unlocked = false, onSwitch = null, storage } = {}) {
  try { storage ??= globalThis.localStorage; if (storage?.getItem(NEWS_KEY)) return null; } catch { return null; } // storage off: never nag every start
  if (!container) return null;
  const doc = container.ownerDocument, left = Math.max(0, total - visited), pct = total ? Math.round(visited / total * 100) : 0;
  const el = doc.createElement('div');
  el.className = 'rd-news';
  el.innerHTML = `<div class="rd-card" role="dialog" aria-label="Новий автомобіль: Roadster">
    <div class="rd-tag">НОВЕ АВТО</div>
    <h3>Roadster</h3>
    <p class="rd-lead">Низький гострий клин із нержавійки, скляний купол і двері-крила. Замість крил і турбін – двигуни на стиснутому газі: він стрибає вгору й тримається в повітрі на струменях.</p>
    <ul>
      <li><kbd>Shift</kbd> на землі – тримай, тиск газу росте до 10 с; відпусти – стрибок. Повний заряд ≈ 48 м: над 15-поверхівкою.</li>
      <li>У повітрі <kbd>Shift</kbd> тримає авто на струменях і повільно піднімає, <kbd>W</kbd> – тяга вперед, <kbd>S</kbd> – гальмо, <kbd>A</kbd> <kbd>D</kbd> – поворот.</li>
      <li>Швидший за Cybertruck приблизно в півтора раза, низький і чіпкий; машини на шляху підкидає вгору.</li>
    </ul>
    <div class="rd-goal ${unlocked ? 'open' : ''}">
      ${unlocked
    ? '<b>Відкрито!</b> Ти вже знайшов усі пам’ятки. <kbd>V</kbd> – пересісти в Roadster.'
    : `<b>Як отримати:</b> відкрий усі пам’ятки міста (📍 лічильник під грошима, вони на мапі <kbd>M</kbd>).
      <div class="rd-bar"><i style="width:${pct}%"></i></div><span class="rd-n">${esc(visited)} з ${esc(total)} · залишилось ${esc(left)}</span>
      Потім <kbd>V</kbd> – пересісти.`}
    </div>
    <button type="button">${unlocked ? 'Сісти в Roadster' : 'Зрозуміло'}</button>
    <div class="rd-foot">Будь-яка клавіша – закрити${unlocked ? ' · V – одразу пересісти' : ''}</div>
  </div>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const born = performance.now();
  let open = true;
  function close(swap = false) {
    if (!open) return;
    open = false;
    try { storage?.setItem(NEWS_KEY, '1'); } catch { /* storage off */ }
    removeEventListener('keydown', onKey, true);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 350);
    if (swap && unlocked) onSwitch?.();
  }
  // keys belong to the card while it is up (a held key from the start screen is not a close)
  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || /^(Meta|Control|Alt|OS|Tab|F\d+)/.test(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || performance.now() - born < 600) return;
    close(e.code === 'KeyV');
  }
  addEventListener('keydown', onKey, true);
  el.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); close(true); });
  el.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === el) close(false); });
  return { get isOpen() { return open; }, close };
}
