// Brand logos (public/assets/brand/*.svg) as textures: the SVG is rasterised at the asked width and recoloured to one
// flat colour (its own alpha and fill-opacity steps are kept), so one file serves a car plate and a lit roof sign.
//   logoTexture(name, { width = 1024, color = '#111', pad = 0.04, plate? }) -> CanvasTexture (blank until the SVG loads)
//     plate: { bg, edge } paints a number-plate blank (rounded, rimmed) behind the logo
//     .userData.aspect: height / width of the whole texture
import * as THREE from 'three';

const ASPECT = { everlabs: 78 / 392 }; // viewBox h / w, so the texture has its final shape before the file arrives
const url = (name) => `${import.meta.env?.BASE_URL ?? '/'}assets/brand/${name}.svg`;

function tinted(img, w, h, color) { // the logo alone, every pixel set to `color` at its own alpha
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h }), x = cv.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, w, h);
  return cv;
}

export function logoTexture(name, { width = 1024, color = '#111', pad = 0.04, plate = null } = {}) {
  const lw = width, lh = Math.round(width * (ASPECT[name] ?? 0.25));
  const px = Math.round(width * (plate ? 0.1 : pad)), py = Math.round(plate ? lh * 0.26 : width * pad);
  const out = Object.assign(document.createElement('canvas'), { width: lw + 2 * px, height: lh + 2 * py });
  const tex = new THREE.CanvasTexture(out);
  Object.assign(tex, { colorSpace: THREE.SRGBColorSpace, anisotropy: 8 });
  tex.userData.aspect = out.height / out.width;
  if (typeof Image === 'undefined') return tex; // headless (node tests): the blank texture is enough
  const img = new Image();
  img.onload = () => {
    const ctx = out.getContext('2d'), W = out.width, H = out.height;
    if (plate) {
      const r = H * 0.14, rim = Math.max(3, H * 0.045);
      ctx.fillStyle = plate.edge ?? '#1a1b1e'; ctx.beginPath(); ctx.roundRect(0, 0, W, H, r); ctx.fill();
      ctx.fillStyle = plate.bg ?? '#f3f4f1'; ctx.beginPath(); ctx.roundRect(rim, rim, W - 2 * rim, H - 2 * rim, r - rim); ctx.fill();
    }
    ctx.drawImage(tinted(img, lw, lh, color), px, py);
    tex.needsUpdate = true;
  };
  img.onerror = () => console.warn(`[logo] ${name}.svg did not load`);
  img.src = url(name);
  return tex;
}
