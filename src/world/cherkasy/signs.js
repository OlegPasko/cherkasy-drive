// OWNER: cherkasy. Ukrainian storefront sign atlas for the facade shader (tSigns): same layout as
// public/assets/city/tex/signs.png – 1024 x 2048, 16 rows of 1024 x 128 sign boards (the shader picks a row per shop).
import * as THREE from 'three';

const ROWS = [ // [board, text, font]
  ['#1f5e2c', '#f6efc8', 'ПРОДУКТИ', 'sans'], ['#b01c1c', '#ffe27a', 'ПІЦА', 'serif'], ['#f2f4f2', '#1f8a3a', 'АПТЕКА', 'sans'],
  ['#2b211b', '#e8c48a', 'КАВА & ВИПІЧКА', 'serif'], ['#17488f', '#ffffff', 'БАНК', 'sans'], ['#f0c8d4', '#6a2440', 'САЛОН КРАСИ', 'sans'],
  ['#5a1426', '#f0dcb0', 'ВИНО & СИРИ', 'serif'], ['#e3a21a', '#1d1d1d', 'ГОСПТОВАРИ', 'sans'], ['#1c7a3e', '#ffe63a', 'ОВОЧІ-ФРУКТИ', 'sans'],
  ['#1e3a7a', '#ffd24a', 'ЇДАЛЬНЯ', 'serif'], ['#111111', '#ffffff', 'ВЗУТТЯ', 'sans'], ['#8a5a1c', '#2a1606', "М'ЯСО", 'serif'],
  ['#3a8cc8', '#ffffff', 'ХІМЧИСТКА', 'sans'], ['#f4f4f4', '#1b2a5a', 'ОПТИКА', 'sans'], ['#5a3a22', '#f3e6c8', 'ПЕКАРНЯ', 'serif'],
  ['#d0321c', '#ffffff', 'ШАУРМА', 'sans'],
];

export function ukrainianSigns() {
  const W = 1024, RH = 128, canvas = Object.assign(document.createElement('canvas'), { width: W, height: RH * ROWS.length });
  const g = canvas.getContext('2d');
  let top = 0;
  for (const [bg, fg, text, face] of ROWS) {
    const grad = g.createLinearGradient(0, top, 0, top + RH);
    [[0, bg], [1, shade(bg, -0.18)]].forEach(([at, c]) => grad.addColorStop(at, c));
    g.fillStyle = grad; g.fillRect(0, top, W, RH);
    Object.assign(g, { strokeStyle: shade(bg, -0.45), lineWidth: 6 }); g.strokeRect(3, top + 3, W - 6, RH - 6);
    g.font = face === 'serif' ? 'bold 76px Georgia, "Times New Roman", serif' : 'bold 72px "Arial Black", Arial, sans-serif';
    Object.assign(g, { textAlign: 'center', textBaseline: 'middle' });
    const squeeze = Math.min(1, 900 / g.measureText(text).width);
    g.save(); g.translate(W / 2, top + 68); g.scale(squeeze, 1);
    for (const [dx, col] of [[3, 'rgba(0,0,0,0.45)'], [0, fg]]) { g.fillStyle = col; g.fillText(text, dx, dx); } // drop shadow, then the letters
    g.restore();
    top += RH;
  }
  const tex = new THREE.CanvasTexture(canvas);
  Object.assign(tex, { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  return tex;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
