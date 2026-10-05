// OWNER: cherkasy. The street cards of «Таємниці Черкас» (src/game/quests/secrets.js) made visible at their spots: a small
// heritage corner beside the road at each card's ll, next to the quest's grey light, so a player who has found the light
// also has something to look at.
//   kavkazka     Кавказька біля Казбету – an enamel plate «вул. Кавказька · 1893» under today's, a stand with the names
//                the street went through and the «Кавказ» story (mountains on it);
//   gogol        вулиця Гоголя at Грушевського – the old enamel plate «вул. Новочигиринська · до 1908 р.» under today's,
//                a wooden arrow «НА ЧИГИРИН» (pointing the real way), a stand with the «А хто такий Гоголь?» story;
//   gurzhiivska  Гуржіївська – the plate «вул. Кладовищенська · 1908–1916», a stand with the six names and a frog in the reeds;
//   rozkopna     Розкопна under Замкова гора – the plate «вул. Розкопна · з 1884 р.», a stand «Вулиця, що не змінювала
//                назви», and the street read as old: the one-storey OSM houses along it (those whose outline is near a
//                rectangle) rebuilt as 19th-century town houses – whitewashed or pastel plastered walls on a high plinth,
//                windows in white casings with painted shutters on the street side, a cornice, a hipped roof of painted
//                sheet iron, a chimney. No street photos were found: the look is the type, not the individual houses;
//   cherkasy2    the end of Грушевського at Кавказька – a stand with the never-built 1847 m bridge to Черкаси-2 drawn as a
//                dashed blueprint (two navigable spans, «НЕ ЗБУДОВАНО»), and a white concrete marker «0 м» whose arrow
//                points along the bridge's axis toward the river. Nothing that reads as a real bridge.
// Each corner stands on the pavement a couple of metres off the carriageway beside the card's point, on the first spot
// (searched along the street, both sides) that is clear of the motor roads and the buildings; the stand faces the road.
// Texts are canvas textures (Ukrainian), one 1024 x 1024 atlas per corner: the board, two plates, an extra (arrow /
// marker face). The boards and plates glow a little at night (nightK), as if a lamp were on them.
//   QUESTSTREETS_SKIP: the OSM ids of the Rozkopna houses rebuilt here
//   ROZKOPNA_HOUSES: those ids (places.js marks them as one improved object)
//   buildQuestStreets({ root, map, geo, solids, heightAt }) -> { update(), clear(x, z), footprints, corners } | null
//     corners: { [card id]: { x, z, y, yaw, fx, fz } } – where each stand stands and the way it faces (tests)
import * as THREE from 'three';
import { MB, M4 } from '../../kit/mesh.js';
import { nightK } from '../../render/daylight.js';
import { canvasTex } from './sculpt.js';
import { obb, rng } from './geo.js';
import { hipRoof } from './civic.js';
import { SECRETS } from '../../game/quests/secrets.js';

// one-storey houses on Розкопна whose OSM outline fills >= 0.8 of its bounding rectangle (rebuilt on that rectangle)
export const ROZKOPNA_HOUSES = [400651147, 710718771, 400651135, 924834486, 710718772, 402017390, 727552942, 401291143, 401291111, 924855257];
export const QUESTSTREETS_SKIP = new Set(ROZKOPNA_HOUSES);

const CHYHYRYN = [49.0806, 32.6587];   // where the old road led: the arrow on Гоголя points this way
const PAPER = '#f1e8d2', INK = '#1d2a22', GREEN = '#24453a', GOLD = '#c8a24a', RED = '#a8302a', ENAMEL_BLUE = '#1c3f7a';

// the corners: the card, its street (a name match), the plates and the board text
const CORNERS = [
  { id: 'kavkazka', road: /^Кавказька/, plates: [['вул. Кавказька', 'з 1893 р.'], ['вул. Кавказька']], art: 'mountains',
    title: '«Кавказ» посеред Черкас',
    body: 'Кавказьку вулицю вперше згадано 1893 року. Назва – від людей, що тут оселялися: вихідців із Кавказу або відставних солдатів Кавказької війни 1817–1864 років. Ще 1914 року всю цю місцевість звали «Кавказом» – нині це Казбет.',
    chain: ['Кавказька 1893', 'Дзержинського', 'Грінченка', 'Кавказька 1992'] },
  { id: 'gogol', road: /Гоголя/, plates: [['вул. Новочигиринська', 'до 1908 р.'], ['вул. Гоголя']], art: 'quill', arrow: 'НА ЧИГИРИН',
    title: '«А хто такий Гоголь?»',
    body: 'До 1908 року вулиця звалася Новочигиринською – з неї починалася дорога на Чигирин. Коли інтелігенція запропонувала назвати її Гоголівською, гласний думи Дробот спитав: «А хто такий Гоголь?» І зрештою погодився: «Хай буде Гоголівська, вона коштів не вимагає».',
    chain: ['Новочигиринська', 'Гоголівська 1908', 'вулиця Гоголя'] },
  { id: 'gurzhiivska', road: /Гуржіївська/, plates: [['вул. Кладовищенська', '1908–1916'], ['вул. Гуржіївська']], art: 'frog',
    title: 'Вулиця Кладовищенська',
    body: 'У середині XIX століття тут була околиця Черкас: чагарники, цвинтарі, а на схід у низині – Гуржіївські болота. Назва – ймовірно, від хутора Гуржіїв. З 1908 по 1916 рік вулиця звалася Кладовищенською через цвинтар.',
    chain: ['Кладовищенська', 'Московська', 'Борисівська', 'Рози Люксембург', 'Богуна', 'Гуржіївська 2016'] },
  { id: 'rozkopna', road: /^Розкопна/, plates: [['вул. Розкопна', 'з 1884 р.'], ['вул. Розкопна']], art: 'shovel',
    title: 'Вулиця, що не змінювала назви',
    body: 'Розкопну вперше згадано 1884 року. Назва – від піщаних і глиняних розкопів, а може, й від того, що для вулиці довелося розкопати дніпровську кручу. Імперія, радянщина, незалежність – а вона весь час Розкопна. Деякі хати тут стоять ще з XIX століття.',
    chain: ['1884 Розкопна', '1917 Розкопна', '1991 Розкопна', 'нині Розкопна'] },
  { id: 'cherkasy2', road: /Грушевського/, plates: null, art: 'bridge', marker: true,
    title: 'Міст у місто, якого немає',
    body: 'Звідси, продовженням вулиці Грушевського, мав іти міст на Черкаси-2 – місто-супутник на 120–180 тисяч мешканців на намивних островах водосховища. 1847 м завдовжки, 25 м завширшки, кошторис 1984 року – 117 млн карбованців. Проєкт заглух.' },
];

// ------------------------------------------------------------------------------------------------ the textures
const REG = { board: [0, 0, 1024, 704], old: [0, 704, 640, 864], now: [0, 864, 640, 1024], extra: [640, 704, 1024, 1024] };

function wrap(g, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (line && g.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
// fillText squeezed to maxW, anchored by the current textAlign at x
function fitText(g, text, x, y, maxW) {
  const w = g.measureText(text).width || 1, k = Math.min(1, maxW / w);
  g.save(); g.translate(x, y); g.scale(k, 1); g.fillText(text, 0, 0); g.restore();
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const ART = {
  mountains(g, x, y, w, h) {
    g.fillStyle = '#dfe8ee'; g.fillRect(x, y, w, h);
    const peak = (cx, top, half, col) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(cx - half, y + h); g.lineTo(cx, top); g.lineTo(cx + half, y + h); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx, top); g.lineTo(cx - half * 0.28, top + (y + h - top) * 0.28);
      g.lineTo(cx - half * 0.08, top + (y + h - top) * 0.22); g.lineTo(cx + half * 0.1, top + (y + h - top) * 0.3); g.lineTo(cx + half * 0.28, top + (y + h - top) * 0.28); g.fill();
    };
    peak(x + w * 0.3, y + h * 0.25, w * 0.32, '#6d7f8c'); peak(x + w * 0.68, y + h * 0.08, w * 0.4, '#56697a');
    g.fillStyle = '#7a8d4c'; g.fillRect(x, y + h * 0.86, w, h * 0.14);           // the hut row of the «Кавказ» below them
    for (let i = 0; i < 4; i++) { const hx = x + 20 + i * (w - 40) / 4; g.fillStyle = '#f2efe6'; g.fillRect(hx, y + h * 0.78, 46, 30); g.fillStyle = '#7b4a2c'; g.beginPath(); g.moveTo(hx - 6, y + h * 0.79); g.lineTo(hx + 23, y + h * 0.7); g.lineTo(hx + 52, y + h * 0.79); g.fill(); }
  },
  quill(g, x, y, w, h) {
    g.fillStyle = '#efe3c4'; g.fillRect(x, y, w, h);
    g.save(); g.translate(x + w * 0.52, y + h * 0.5); g.rotate(-0.55);
    g.fillStyle = '#f8f6f0'; g.strokeStyle = '#4a4036'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -h * 0.42); g.quadraticCurveTo(w * 0.2, -h * 0.1, 0, h * 0.32); g.quadraticCurveTo(-w * 0.16, -h * 0.1, 0, -h * 0.42); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, -h * 0.4); g.lineTo(0, h * 0.42); g.stroke();
    for (let k = -6; k < 6; k++) { g.beginPath(); g.moveTo(0, k * 22); g.lineTo(k % 2 ? 40 : -34, k * 22 - 26); g.stroke(); }
    g.restore();
    g.fillStyle = '#1f1f2a'; rrect(g, x + w * 0.16, y + h * 0.72, w * 0.3, h * 0.2, 8); g.fill();          // the inkwell
    g.fillStyle = '#3b3b4a'; g.fillRect(x + w * 0.22, y + h * 0.66, w * 0.18, h * 0.07);
    g.fillStyle = INK; g.font = 'italic 30px Georgia, serif'; g.textAlign = 'center'; g.fillText('Н. В. Гоголь', x + w / 2, y + h - 10);
  },
  frog(g, x, y, w, h) {
    g.fillStyle = '#d7e3c8'; g.fillRect(x, y, w, h);
    g.fillStyle = '#5f7f8f'; g.fillRect(x, y + h * 0.72, w, h * 0.28);                 // the bog water
    g.strokeStyle = '#6c7a3a'; g.lineWidth = 6;
    for (let i = 0; i < 9; i++) { const rx = x + 14 + i * w / 9; g.beginPath(); g.moveTo(rx, y + h * 0.9); g.quadraticCurveTo(rx + 10, y + h * 0.4, rx + (i % 2 ? 22 : -8), y + h * (0.12 + 0.05 * (i % 3))); g.stroke();
      g.fillStyle = '#6b4a2a'; g.fillRect(rx + (i % 2 ? 14 : -10), y + h * (0.12 + 0.05 * (i % 3)), 9, 34); }
    g.fillStyle = '#4f8a2e'; g.beginPath(); g.ellipse(x + w * 0.5, y + h * 0.72, w * 0.22, h * 0.12, 0, 0, Math.PI * 2); g.fill(); // the lily pad
    const fx = x + w * 0.5, fy = y + h * 0.64;                                          // the frog
    g.fillStyle = '#6fae3a'; g.beginPath(); g.ellipse(fx, fy, 56, 36, 0, 0, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * 30, fy - 34, 16, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * 30, fy - 36, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#111'; for (const s of [-1, 1]) { g.beginPath(); g.arc(fx + s * 30, fy - 36, 4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#2f5a1a'; g.lineWidth = 3; g.beginPath(); g.arc(fx, fy - 6, 26, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = INK; g.font = 'italic 30px Georgia, serif'; g.textAlign = 'center'; g.fillText('ква!', fx + 90, fy - 70);
  },
  shovel(g, x, y, w, h) {
    g.fillStyle = '#cfe0ea'; g.fillRect(x, y, w, h);
    const bands = ['#e8cf8f', '#d7b46f', '#c08f55', '#a87245', '#d8be84'];               // the sand and clay of the cut bank
    bands.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(x, y + h * (0.3 + i * 0.14)); g.lineTo(x + w * (0.55 + i * 0.05), y + h * (0.3 + i * 0.14)); g.lineTo(x + w * (0.62 + i * 0.05), y + h * (0.44 + i * 0.14)); g.lineTo(x, y + h * (0.44 + i * 0.14)); g.fill(); });
    g.fillStyle = '#4d7da0'; g.fillRect(x + w * 0.62, y + h * 0.86, w * 0.38, h * 0.14);   // the Dnipro at its foot
    g.save(); g.translate(x + w * 0.74, y + h * 0.5); g.rotate(0.45);
    g.fillStyle = '#8a5a30'; g.fillRect(-6, -h * 0.42, 12, h * 0.55);
    g.fillStyle = '#6f7378'; g.beginPath(); g.moveTo(-26, h * 0.12); g.lineTo(26, h * 0.12); g.lineTo(20, h * 0.3); g.lineTo(0, h * 0.37); g.lineTo(-20, h * 0.3); g.fill();
    g.restore();
  },
};

// the blueprint of the bridge: the bank on the left, the islands on the right, the dashed deck with its two navigable
// spans, the dimensions and a red stamp
function bridgeArt(g, x, y, w, h) {
  g.fillStyle = '#1d4a7a'; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (let k = x; k < x + w; k += 24) { g.beginPath(); g.moveTo(k, y); g.lineTo(k, y + h); g.stroke(); }
  for (let k = y; k < y + h; k += 24) { g.beginPath(); g.moveTo(x, k); g.lineTo(x + w, k); g.stroke(); }
  const wl = y + h * 0.74, deck = y + h * 0.5, x0 = x + 120, x1 = x + w - 130;
  g.fillStyle = 'rgba(160,200,240,0.35)'; g.fillRect(x0, wl, x1 - x0, y + h - wl);
  g.strokeStyle = '#e8f0ff'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, deck + 6); g.lineTo(x0, deck + 6); g.lineTo(x0, y + h); g.stroke();            // the right bank
  g.beginPath(); g.moveTo(x1, y + h); g.lineTo(x1, wl - 8); g.lineTo(x + w, wl - 8); g.stroke();             // the islands
  g.setLineDash([14, 9]);
  const sp = (a) => x0 + (x1 - x0) * a;
  // the deck: low over the piers, humped over the two navigable spans
  g.beginPath(); g.moveTo(x0, deck + 6);
  const hump = (a, b, lift) => { g.lineTo(sp(a), deck); g.quadraticCurveTo((sp(a) + sp(b)) / 2, deck - lift, sp(b), deck); };
  hump(0.32, 0.43, 52); hump(0.47, 0.6, 62); g.lineTo(x1, wl - 8); g.stroke();
  for (let i = 1; i < 18; i++) { const px = x0 + (x1 - x0) * i / 18; if (px > sp(0.33) && px < sp(0.42) || px > sp(0.48) && px < sp(0.59)) continue; g.beginPath(); g.moveTo(px, deck + 4); g.lineTo(px, y + h - 4); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = '#e8f0ff'; g.font = '24px Arial, sans-serif'; g.textAlign = 'center';
  g.fillText('120 м', (sp(0.32) + sp(0.43)) / 2, deck - 34); g.fillText('140 м', (sp(0.47) + sp(0.6)) / 2, deck - 40);
  g.beginPath(); g.moveTo(x0, y + 26); g.lineTo(x1, y + 26); g.stroke();
  for (const px of [x0, x1]) { g.beginPath(); g.moveTo(px, y + 14); g.lineTo(px, y + 38); g.stroke(); }
  g.fillStyle = '#1d4a7a'; g.fillRect((x0 + x1) / 2 - 70, y + 12, 140, 28);
  g.fillStyle = '#ffffff'; g.font = 'bold 26px Arial, sans-serif'; g.fillText('1847 м', (x0 + x1) / 2, y + 35);
  g.font = '22px Arial, sans-serif'; g.textAlign = 'left'; g.fillText('вул. Грушевського', x + 8, deck - 10);
  g.textAlign = 'right'; g.fillText('Черкаси-2', x + w - 8, wl - 40);
  g.save(); g.translate(x + w * 0.3, y + h * 0.84); g.rotate(-0.08);                                         // the stamp
  g.strokeStyle = '#e0433a'; g.fillStyle = '#e0433a'; g.lineWidth = 4; g.strokeRect(-130, -26, 260, 46);
  g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('НЕ ЗБУДОВАНО', 0, 9); g.restore();
}

function cornerTex(C, arrowRight) {
  return canvasTex(1024, 1024, (g) => {
    // ---- the board
    g.fillStyle = GREEN; g.fillRect(0, 0, 1024, 704);
    g.fillStyle = PAPER; g.fillRect(18, 76, 988, 610);
    g.fillStyle = GOLD; g.font = 'bold 34px Georgia, "Times New Roman", serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillText('ТАЄМНИЦІ ЧЕРКАС', 34, 52);
    g.textAlign = 'right'; g.font = '26px Georgia, serif'; g.fillText('історія вулиці', 990, 50);
    g.textAlign = 'left'; g.fillStyle = INK; g.font = 'bold 54px Georgia, "Times New Roman", serif';
    fitText(g, C.title, 44, 146, 940);
    g.fillStyle = RED; g.fillRect(44, 164, 260, 5);
    const bridge = C.art === 'bridge', textW = bridge ? 936 : 590;
    // the body as large as fits between the title and the drawing / the names row
    const room = (bridge ? 384 : 590) - 214;
    let px = 38, lines;
    for (; px > 24; px -= 1) { g.font = `${px}px Georgia, "Times New Roman", serif`; lines = wrap(g, C.body, textW); if (lines.length * px * 1.22 <= room) break; }
    g.fillStyle = INK;
    lines.forEach((l, i) => g.fillText(l, 44, 214 + i * px * 1.22));
    if (bridge) bridgeArt(g, 44, 400, 936, 266);
    else {
      ART[C.art]?.(g, 660, 190, 324, 300);
      g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(660, 190, 324, 300);
    }
    if (C.chain) { // the names, as a row of chips with arrows
      g.font = 'bold 24px Arial, sans-serif';
      const pad = 12, gap = 26, ws = C.chain.map((t) => g.measureText(t).width + 2 * pad || 120);
      const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1), k = Math.min(1, 936 / total);
      g.save(); g.translate(44, 0); g.scale(k, 1);
      let cx = 0;
      C.chain.forEach((t, i) => {
        const last = i === C.chain.length - 1 || i === 0;
        g.fillStyle = last ? ENAMEL_BLUE : '#e2d6b8'; rrect(g, cx, 606, ws[i], 46, 10); g.fill();
        g.fillStyle = last ? '#ffffff' : INK; g.textAlign = 'left'; g.fillText(t, cx + pad, 638);
        if (i < C.chain.length - 1) { g.fillStyle = RED; g.font = 'bold 26px Arial, sans-serif'; g.fillText('→', cx + ws[i] + 2, 638); g.font = 'bold 24px Arial, sans-serif'; }
        cx += ws[i] + gap;
      });
      g.restore();
    }
    g.fillStyle = '#6b6252'; g.font = 'italic 20px Georgia, serif'; g.textAlign = 'right'; g.fillText('Джерело: Вікіпедія', 990, 678);

    // ---- the plates: the old enamel one (white, blue rim and letters, its years), today's (blue, white letters)
    const plate = ([x0, y0, x1, y1], [name, years], old) => {
      const w = x1 - x0, h = y1 - y0;
      g.fillStyle = old ? '#9aa3ad' : '#d8dde4'; g.fillRect(x0, y0, w, h);
      g.fillStyle = old ? '#f4f1e8' : ENAMEL_BLUE; rrect(g, x0 + 6, y0 + 6, w - 12, h - 12, 18); g.fill();
      g.strokeStyle = old ? ENAMEL_BLUE : '#ffffff'; g.lineWidth = 6; rrect(g, x0 + 16, y0 + 16, w - 32, h - 32, 12); g.stroke();
      g.fillStyle = old ? ENAMEL_BLUE : '#ffffff'; g.textAlign = 'center';
      g.font = old ? 'bold 56px Georgia, "Times New Roman", serif' : 'bold 60px Arial, sans-serif';
      fitText(g, name, x0 + w / 2, y0 + (years ? 88 : 102), w - 64);
      if (years) { g.font = 'italic 30px Georgia, serif'; g.fillText(years, x0 + w / 2, y0 + 130); }
      if (old) { g.fillStyle = 'rgba(70,60,40,0.35)'; for (const [cx, cy, r] of [[x0 + 40, y0 + 120, 9], [x1 - 70, y0 + 30, 6], [x1 - 34, y1 - 40, 11]]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); } } // enamel chips
    };
    if (C.plates) { g.textAlign = 'left'; plate(REG.old, C.plates[0], true); plate(REG.now, C.plates[1], false); }

    // ---- the extra: the arrow plank's face (top) or the marker's face (whole)
    const [ex, ey, ex1, ey1] = REG.extra;
    if (C.arrow) {
      g.fillStyle = '#b98a52'; g.fillRect(ex, ey, ex1 - ex, 96);
      g.fillStyle = 'rgba(90,60,30,0.25)'; for (let k = 0; k < 6; k++) g.fillRect(ex, ey + 8 + k * 15, ex1 - ex, 2);
      g.fillStyle = '#2b1d10'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center';
      fitText(g, arrowRight ? `${C.arrow} →` : `← ${C.arrow}`, (ex + ex1) / 2, ey + 64, ex1 - ex - 40);
    }
    if (C.marker) {
      g.fillStyle = '#ecebe6'; g.fillRect(ex, ey, ex1 - ex, ey1 - ey);
      g.fillStyle = '#1b1b1b'; g.fillRect(ex, ey1 - 40, ex1 - ex, 40);
      g.textAlign = 'center'; g.font = 'bold 120px Arial, sans-serif'; g.fillText('0 м', ex + 192, ey + 130);
      g.font = 'bold 44px Arial, sans-serif'; g.fillText(arrowRight ? '1847 м →' : '← 1847 м', ex + 192, ey + 200);
      g.font = '28px Arial, sans-serif'; g.fillText('міст на Черкаси-2', ex + 192, ey + 246);
      g.font = 'italic 24px Georgia, serif'; g.fillText('проєкт 1970–80-х', ex + 192, ey + 274);
    }
  }, { repeat: false });
}

// ------------------------------------------------------------------------------------------------ the spot search
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
function inRing(p, x, z) {
  let s = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < p[i] + (z - p[i + 1]) * (p[j] - p[i]) / (p[j + 1] - p[i + 1])) s = !s;
  return s;
}
function ringDist(p, x, z) {
  let d = 1e9;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) d = Math.min(d, segDist(x, z, p[j], p[j + 1], p[i], p[i + 1]));
  return d;
}
// the point at arc length s along a polyline, with the direction there
function along(P, s) {
  let acc = 0;
  for (let i = 0; i + 3 < P.length; i += 2) {
    const dx = P[i + 2] - P[i], dz = P[i + 3] - P[i + 1], l = Math.hypot(dx, dz);
    if (acc + l >= s || i + 4 >= P.length) { const t = Math.max(0, Math.min(1, (s - acc) / (l || 1))); return { x: P[i] + dx * t, z: P[i + 1] + dz * t, dx: dx / (l || 1), dz: dz / (l || 1) }; }
    acc += l;
  }
  return null;
}
// where the corner stands: beside the street's way nearest (x, z), a little off its edge, every sample point clear
export function findSpot(map, x, z, re, samples = [-2.1, 0, 1.7], { blds = map.buildings || [] } = {}) {
  let best = null;
  for (const r of map.roads || []) {
    if (!re.test(r.n || '')) continue;
    const P = r.p; let acc = 0;
    for (let i = 0; i + 3 < P.length; i += 2) {
      const ax = P[i], az = P[i + 1], dx = P[i + 2] - ax, dz = P[i + 3] - az, l = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l))), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (!best || d < best.d) best = { d, r, s: acc + t * l };
      acc += l;
    }
  }
  if (!best) return null;
  const motor = (map.roads || []).filter((r) => r.k === 'm' && r.p.some((v, i) => i % 2 === 0 && Math.abs(v - x) < 120 && Math.abs(r.p[i + 1] - z) < 120));
  const near = blds.filter((b) => { for (let i = 0; i < b.p.length; i += 2) if (Math.abs(b.p[i] - x) < 60 && Math.abs(b.p[i + 1] - z) < 60) return true; return false; });
  const clearAt = (px, pz) => {
    for (const r of motor) for (let i = 0; i + 3 < r.p.length; i += 2) if (segDist(px, pz, r.p[i], r.p[i + 1], r.p[i + 2], r.p[i + 3]) < (r.w || 7) / 2 + 0.9) return false;
    for (const b of near) if (inRing(b.p, px, pz) || ringDist(b.p, px, pz) < 0.9) return false;
    return true;
  };
  const w = best.r.w || 7;
  for (let k = 0; k <= 16; k++) for (const sg of [1, -1]) for (const off of [w / 2 + 1.6, w / 2 + 2.4]) {
    const t = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5, a = along(best.r.p, best.s + t);
    if (!a) continue;
    const nx = -a.dz * sg, nz = a.dx * sg, cx = a.x + nx * off, cz = a.z + nz * off; // n: from the road out to the spot
    if (samples.every((q) => clearAt(cx + a.dx * q - nx * 0.3, cz + a.dz * q - nz * 0.3) && clearAt(cx + a.dx * q + nx * 0.3, cz + a.dz * q + nz * 0.3))) {
      return { x: cx, z: cz, fx: -nx, fz: -nz, ax: a.dx, az: a.dz }; // f: the stand's front, toward the road
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ the build
export function buildQuestStreets({ root, map, geo, solids: S, heightAt }) {
  if (!geo || !map?.roads) return null;
  const t0 = performance.now();
  const g = (x, z) => { const h = heightAt(x, z); return Number.isFinite(h) ? h : 0; };
  const cards = Object.fromEntries(SECRETS.cards.map((c) => [c.id, c]));
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  const lamps = [], corners = {}, clears = [];
  let nV = 0, nMesh = 0;

  for (const C of CORNERS) {
    const card = cards[C.id];
    if (!card) continue;
    const [x, z] = geo.toXZ(card.ll[0], card.ll[1]);
    const samples = C.marker ? [-0.4, 0.8, 1.7, 3.0] : [-2.1, -1, 0, 0.8, 1.7];
    const sp = findSpot(map, x, z, C.road, samples);
    if (!sp) { console.warn(`[cherkasy] quest corner ${C.id}: no free spot`); continue; }
    const yaw = Math.atan2(sp.fx, sp.fz), cy = Math.cos(yaw), sy = Math.sin(yaw);
    const W = (a, d) => [sp.x + a * cy + d * sy, sp.z - a * sy + d * cy]; // local (x right, z front) -> world
    const Y = Math.min(...[-2.1, 0, 1.7].map((a) => g(...W(a, 0)))) - 0.05;
    const P = M4(sp.x, Y, sp.z, yaw), ang = -yaw;
    const box = (a, d, ha, hd, y0, y1, kind = 'wall') => { const [bx, bz] = W(a, d); S?.obox?.(bx, bz, ha, hd, ang, Y + y0, Y + y1, kind); };
    // which way the arrow points in the stand's frame: Chyhyryn for Гоголя, the bridge's axis (along Грушевського,
    // away from the city) for the marker
    let arrowRight = true;
    if (C.arrow) { const [tx, tz] = geo.toXZ(...CHYHYRYN); arrowRight = (tx - sp.x) * cy + (tz - sp.z) * -sy > 0; }
    let axis = null;
    if (C.marker) {
      const r = map.roads.filter((q) => C.road.test(q.n || '')).sort((p, q) => Math.hypot(p.p[0] - x, p.p[1] - z) - Math.hypot(q.p[0] - x, q.p[1] - z))[0];
      const P2 = r.p, n = P2.length, e0 = Math.hypot(P2[0] - x, P2[1] - z) < Math.hypot(P2[n - 2] - x, P2[n - 1] - z);
      const [ax, az, bx, bz] = e0 ? [P2[2], P2[3], P2[0], P2[1]] : [P2[n - 4], P2[n - 3], P2[n - 2], P2[n - 1]];
      const l = Math.hypot(bx - ax, bz - az) || 1; axis = [(bx - ax) / l, (bz - az) / l];
      arrowRight = axis[0] * cy + axis[1] * -sy > 0;
    }
    const tex = cornerTex(C, arrowRight);
    const tmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    const D = new MB(), T = new MB();
    const uvq = (q, reg, pts, flip = false) => { // a textured quad over an atlas region: pts bl, br, tr, tl in local metres
      const [px0, py0, px1, py1] = reg, u0 = px0 / 1024, u1 = px1 / 1024, vb = 1 - py1 / 1024, vt = 1 - py0 / 1024;
      const [A, B2, C2, E] = pts, nrm = flip ? [0, 0, -1] : [0, 0, 1];
      const ua = flip ? u1 : u0, ub = flip ? u0 : u1;
      const i0 = q.vert(...A, ...nrm, ua, vb), i1 = q.vert(...B2, ...nrm, ub, vb), i2 = q.vert(...C2, ...nrm, ub, vt), i3 = q.vert(...E, ...nrm, ua, vt);
      if (flip) q.quad(i1, i0, i3, i2); else q.quad(i0, i1, i2, i3);
    };
    const rect = (x0, y0, x1, y1, zz, flip, reg, q = T) => uvq(q, reg, flip ? [[x1, y0, zz], [x0, y0, zz], [x0, y1, zz], [x1, y1, zz]] : [[x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz]], flip);

    // ---- the stand: two oak posts, the board in a dark green frame, a little gabled cap; the back plain green
    const BX = C.marker ? 0.6 : 0.8, BW = 1.84, BH = BW * 704 / 1024, B0 = 0.95, BT = 0.06;
    D.with(P, (q) => {
      q.setColor('#5a4128');
      for (const s of [-1, 1]) q.box(BX + s * (BW / 2 + 0.06) - 0.06, -0.3, -0.06, BX + s * (BW / 2 + 0.06) + 0.06, B0 + BH + 0.2, 0.06);
      q.setColor(GREEN).box(BX - BW / 2 - 0.03, B0 - 0.06, -BT, BX + BW / 2 + 0.03, B0 + BH + 0.06, BT, 1 | 2 | 4 | 8 | 32);
      q.setColor('#3a2a1a');
      const ya = B0 + BH + 0.2, yb = ya + 0.24, xa = BX - BW / 2 - 0.2, xb = BX + BW / 2 + 0.2;
      q.face([[xa, ya, 0.3], [xb, ya, 0.3], [xb, yb, 0], [xa, yb, 0]]); q.face([[xb, ya, -0.3], [xa, ya, -0.3], [xa, yb, 0], [xb, yb, 0]]);
      q.face([[xa, ya, -0.3], [xb, ya, -0.3], [xb, ya, 0.3], [xa, ya, 0.3]], [0, -1, 0]);
      q.face([[xa, ya, 0.3], [xa, yb, 0], [xa, ya, -0.3]]); q.face([[xb, ya, -0.3], [xb, yb, 0], [xb, ya, 0.3]]);
    });
    T.setColor('#ffffff').with(P, (q) => rect(BX - BW / 2, B0, BX + BW / 2, B0 + BH, BT + 0.004, false, REG.board, q));
    box(BX, 0, BW / 2 + 0.12, 0.1, 0, B0 + BH + 0.4);
    lamps.push(tmat);

    // ---- the post with the plates (old enamel under today's), a ball on top; Гоголя's arrow plank above them
    if (C.plates) {
      const PX = -2.0, pw = 1.3, ph = pw * 160 / 640, y1 = 2.5, y0 = 2.06;
      D.with(P, (q) => {
        q.setColor('#1f2e27').cyl(PX, -0.3, 0, 0.055, 0.05, 3.6, 10).cyl(PX, -0.3, 0, 0.09, 0.07, 0.75, 10).ellipsoid([PX, 3.36, 0], [0.08, 0.08, 0.08], 8, 5);
        for (const yb of [y0, y1]) {
          q.setColor('#9aa3ad').box(PX + 0.06, yb, -0.012, PX + 0.06 + pw, yb + ph, 0.012, 1 | 2 | 4 | 8);
          q.setColor('#1f2e27').box(PX + 0.03, yb + 0.05, -0.02, PX + 0.08, yb + 0.1, 0.02).box(PX + 0.03, yb + ph - 0.1, -0.02, PX + 0.08, yb + ph - 0.05, 0.02);
        }
      });
      T.with(P, (q) => {
        for (const [yb, reg] of [[y0, REG.old], [y1, REG.now]]) for (const flip of [false, true])
          rect(PX + 0.06, yb, PX + 0.06 + pw, yb + ph, flip ? -0.013 : 0.013, flip, reg, q);
      });
      box(PX, 0, 0.07, 0.07, 0, 3.4);
      if (C.arrow) { // a plank with a pointed end, its face the extra's top strip (96 px of 384)
        const ya = 2.98, h = 0.26, l = 1.2, dir = arrowRight ? 1 : -1, xs = PX + dir * 0.04, xe = xs + dir * l, xt = xe + dir * 0.18;
        D.with(P, (q) => {
          q.setColor('#8c6438');
          for (const zz of [0.025, -0.025]) q.face([[xs, ya, zz], [xe, ya, zz], [xt, ya + h / 2, zz], [xe, ya + h, zz], [xs, ya + h, zz]], [0, 0, Math.sign(zz)]);
          q.face([[xs, ya + h, 0.025], [xe, ya + h, 0.025], [xe, ya + h, -0.025], [xs, ya + h, -0.025]], [0, 1, 0]);
        });
        const reg = [REG.extra[0], REG.extra[1], REG.extra[2], REG.extra[1] + 96], lo = Math.min(xs, xe), hi = Math.max(xs, xe);
        T.with(P, (q) => { rect(lo, ya + 0.01, hi, ya + h - 0.01, 0.027, false, reg, q); rect(lo, ya + 0.01, hi, ya + h - 0.01, -0.027, true, reg, q); });
      }
    }

    // ---- the «0 м» marker: a white concrete pillar left of the stand, its face to the road, the arrow along the axis
    if (C.marker) {
      const MX = -0.75, hw = 0.3, mh = 1.15;
      D.with(P, (q) => { q.setColor('#e6e4dd').box(MX - hw, -0.3, -hw, MX + hw, mh, hw); q.setColor('#2a2a2a').box(MX - hw - 0.01, mh - 0.08, -hw - 0.01, MX + hw + 0.01, mh, hw + 0.01, 1 | 2 | 4 | 16 | 32); });
      const fh = 2 * hw * 320 / 384;
      T.with(P, (q) => rect(MX - hw, mh - 0.1 - fh, MX + hw, mh - 0.1, hw + 0.012, false, REG.extra, q));
      box(MX, 0, hw, hw, 0, mh);
    }

    const grp = Object.assign(new THREE.Group(), { name: `queststreets-${C.id}` });
    root.add(grp);
    for (const [B, M, sh] of [[D, paint, true], [T, tmat, false]]) {
      if (!B.v) continue;
      grp.add(Object.assign(new THREE.Mesh(B.build(), M), { name: `queststreets-${C.id}`, castShadow: sh, receiveShadow: true }));
      nV += B.v; nMesh++;
    }
    corners[C.id] = { x: sp.x, z: sp.z, y: Y, yaw, fx: sp.fx, fz: sp.fz, arrowRight };
    clears.push([...W(BX - 1.5, 0), 3.5]);
  }

  // ---------------------------------------------------------------- Розкопна: the old one-storey houses
  const footprints = [], houses = buildRozkopnaHouses(map, g, S);
  if (houses) {
    const grp = Object.assign(new THREE.Group(), { name: 'queststreets-rozkopna-houses' });
    root.add(grp);
    for (const [k, B] of Object.entries(houses.B)) {
      if (!B.v) continue;
      grp.add(Object.assign(new THREE.Mesh(B.build(), houses.M[k]), { name: `rozkopna-${k}`, castShadow: k !== 'lit' && k !== 'glass', receiveShadow: true }));
      nV += B.v; nMesh++;
    }
    footprints.push(...houses.footprints);
  }

  console.log(`[cherkasy] quest street corners: ${Object.keys(corners).length}, Rozkopna houses ${footprints.length}, ${(nV / 1000).toFixed(1)}k verts in ${nMesh} meshes, ${(performance.now() - t0).toFixed(0)} ms`);
  const lit = houses?.M.lit;
  return {
    corners, footprints, stats: { verts: nV, meshes: nMesh },
    clear: (x, z) => clears.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r) || footprints.some((f) => inRing(f.flat, x, z) || ringDist(f.flat, x, z) < 1.5),
    update() {
      const k = Math.min(1, 3 * nightK.value);
      for (const m of lamps) m.emissiveIntensity = 0.32 * k;
      if (lit) lit.emissiveIntensity = 1.4 * k;
    },
  };
}

// each house on its outline's bounding rectangle: plinth, plastered walls, windows in white casings (shutters on the
// side toward the street), a cornice, a hipped sheet-iron roof and a chimney; a few windows lit at night
const WALLS = ['#f3f0e6', '#efe6c8', '#dfe7ea', '#f1e2cf', '#e9eedf', '#f3efe9'];
const ROOFS = ['#4f6f4c', '#8a4434', '#6f7779', '#3f5f6e', '#7a5232'];
const SHUTTERS = ['#3d6b8f', '#4e7a45', '#7b3f2f', '#2f5f73', '#8c6b2a'];
function buildRozkopnaHouses(map, g, S) {
  const byId = new Map((map.buildings || []).map((b) => [b.id, b]));
  const street = (map.roads || []).filter((r) => /^Розкопна/.test(r.n || ''));
  const all = (map.roads || []).filter((r) => r.k === 'm');
  const B = { wall: new MB(), roof: new MB(), glass: new MB(), lit: new MB() };
  const M = {
    wall: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.15, metalness: 0.4 }),
    lit: new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.3, emissive: 0xffc77a, emissiveIntensity: 0 }),
  };
  const footprints = [];
  for (const id of ROZKOPNA_HOUSES) {
    const b = byId.get(id);
    if (!b) continue;
    const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    const o = obb(P);
    if (!o) continue;
    const r = rng(id % 65521);
    // the local frame: +x along the long side, +z across; the street side is the long face nearer a Розкопна way
    const ux = o.ux, uz = o.uz, L = o.L, Wd = o.W, yaw = Math.atan2(-uz, ux);
    const W = (a, d) => [o.cx + a * ux - d * uz, o.cz + a * uz + d * ux]; // M4: local +z -> (sin yaw, cos yaw) = (-uz, ux)
    const near = (px, pz, roads) => Math.min(...roads.flatMap((q) => { const out = []; for (let i = 0; i + 3 < q.p.length; i += 2) out.push(segDist(px, pz, q.p[i], q.p[i + 1], q.p[i + 2], q.p[i + 3]) - (q.w || 7) / 2); return out; }));
    const sides = [[1, 0, L / 2], [-1, 0, L / 2], [0, 1, Wd / 2], [0, -1, Wd / 2]].map(([a, d, h]) => {
      const [px, pz] = W(a * h, d * h); return { a, d, dist: street.length ? near(px, pz, street) : 99 };
    });
    const front = sides.reduce((p, q) => (q.dist < p.dist ? q : p));
    // a footprint corner in a carriageway would block the street: shrink the rectangle back off it
    let sh = 0;
    for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [px, pz] = W(a * L / 2, d * Wd / 2); sh = Math.max(sh, -near(px, pz, all) + 0.4); }
    const hl = L / 2 - Math.max(0, sh), hw = Wd / 2 - Math.max(0, sh);
    if (hl < 2.5 || hw < 2) continue;
    const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([a, d]) => W(a, d));
    const hs = corners.map(([px, pz]) => g(px, pz)), gLo = Math.min(...hs), gHi = Math.max(...hs);
    const y0 = gHi + 0.55, y1 = y0 + 3.1, Y = gLo - 0.4;
    const Mx = M4(o.cx, 0, o.cz, yaw);
    const wallC = WALLS[Math.floor(r() * WALLS.length)], roofC = ROOFS[Math.floor(r() * ROOFS.length)], shC = SHUTTERS[Math.floor(r() * SHUTTERS.length)];
    B.wall.with(Mx, (q) => {
      q.setColor(r() < 0.5 ? '#8b8178' : '#9b5a43').box(-hl - 0.06, Y, -hw - 0.06, hl + 0.06, y0, hw + 0.06, 1 | 2 | 16 | 32 | 4);  // the plinth (stone or brick)
      q.setColor(wallC).box(-hl, y0, -hw, hl, y1, hw, 1 | 2 | 16 | 32);
      q.setColor('#f7f5ef').box(-hl - 0.12, y1 - 0.22, -hw - 0.12, hl + 0.12, y1, hw + 0.12, 1 | 2 | 8 | 16 | 32);       // the cornice
    });
    // windows round all four walls; shutters and fuller casings on the front
    for (const [a, d] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const isFront = a === front.a && d === front.d, span = a ? hw : hl, nWin = Math.max(1, Math.floor((2 * span - 1.2) / (isFront ? 2.1 : 2.8)));
      const pitch = (2 * span) / nWin;
      for (let k = 0; k < nWin; k++) {
        const s = -span + pitch * (k + 0.5), ww = 0.95, wh = 1.45, wy = y0 + 0.85;
        const doorHere = !isFront && a === 0 && d === -front.d && k === 0 && nWin > 1;
        // the face frame: s along the wall (the viewer's right seen from outside), o outward -> the house frame
        const toH = (sv, yv, ov) => (a ? [a * (hl + ov), yv, -a * sv] : [d * sv, yv, d * (hw + ov)]);
        const boxF = (q, s0, s1, ya, yb, o0, o1) => { const A = toH(s0, ya, o0), C2 = toH(s1, yb, o1); q.box(A[0], A[1], A[2], C2[0], C2[1], C2[2]); };
        const quadF = (q, s0, s1, ya, yb, ov) => { const n = a ? [a, 0, 0] : [0, 0, d]; q.face([toH(s0, ya, ov), toH(s1, ya, ov), toH(s1, yb, ov), toH(s0, yb, ov)], n); };
        if (doorHere) {
          B.wall.with(Mx, (q) => { q.setColor('#6b4a2e'); quadF(q, s - 0.5, s + 0.5, y0, y0 + 2.2, 0.03); q.setColor('#f7f5ef'); boxF(q, s - 0.62, s + 0.62, y0 + 2.2, y0 + 2.36, 0, 0.1);
            q.setColor('#7d7770'); boxF(q, s - 0.8, s + 0.8, Y, y0, 0, 0.9); });
          continue;
        }
        const lit = r() < 0.35;
        B.wall.with(Mx, (q) => {
          q.setColor('#fbfaf6'); // the casing round it, a sill, a little pediment-like top on the front
          boxF(q, s - ww / 2 - 0.12, s + ww / 2 + 0.12, wy - 0.12, wy, 0, 0.09);
          boxF(q, s - ww / 2 - 0.12, s - ww / 2, wy, wy + wh, 0, 0.05); boxF(q, s + ww / 2, s + ww / 2 + 0.12, wy, wy + wh, 0, 0.05);
          boxF(q, s - ww / 2 - 0.12, s + ww / 2 + 0.12, wy + wh, wy + wh + (isFront ? 0.22 : 0.12), 0, isFront ? 0.08 : 0.05);
          if (isFront) { // the shutters, open, flat to the wall either side
            q.setColor(shC); quadF(q, s - ww / 2 - 0.12 - ww / 2, s - ww / 2 - 0.13, wy, wy + wh, 0.03); quadF(q, s + ww / 2 + 0.13, s + ww / 2 + 0.12 + ww / 2, wy, wy + wh, 0.03);
            q.setColor('#fbfaf6'); quadF(q, s - 0.03, s + 0.03, wy, wy + wh, 0.025); quadF(q, s - ww / 2, s + ww / 2, wy + wh * 0.68, wy + wh * 0.68 + 0.05, 0.025); // the cross bar
          }
        });
        (lit ? B.lit : B.glass).with(Mx, (q) => quadF(q, s - ww / 2, s + ww / 2, wy, wy + wh, 0.012));
      }
    }
    // the hipped roof of painted sheet iron, eaves out past the cornice; a brick chimney through it
    const ov = 0.45, rise = Math.min(hl, hw) * Math.tan(0.52);
    B.roof.setColor(roofC).with(Mx, (q) => {
      hipRoof(q, -hl - ov, -hw - ov, hl + ov, hw + ov, y1 - 0.05, rise + ov * Math.tan(0.52));
      q.setColor('#3a3a38').box(-hl - ov, y1 - 0.12, -hw - ov, hl + ov, y1 - 0.05, hw + ov, 8);
      q.setColor('#8e4a36').box(hl * 0.35 - 0.25, y1 + rise * 0.4, -0.25, hl * 0.35 + 0.25, y1 + rise + 0.55, 0.25);
      q.setColor('#5a5a58').box(hl * 0.35 - 0.31, y1 + rise + 0.55, -0.31, hl * 0.35 + 0.31, y1 + rise + 0.65, 0.31);
    });
    S?.obox?.(o.cx, o.cz, hl, hw, Math.atan2(uz, ux), Y, y1 + 0.1, 'wall');
    footprints.push({ poly: corners, flat: corners.flat(), h: y1 + rise - gLo, kind: 'house', name: 'вул. Розкопна', id });
  }
  return footprints.length ? { B, M, footprints } : null;
}
