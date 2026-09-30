// Procedural appearance of a person: body proportions, clothing parts and a grounded Cherkasy street palette.
//   makeLook(seed, kind?) -> { kind, sH, girth, mask, cols[8], speed, gib: { top, bottom, outer, skin, hair } }
//     sH: height scale of the 1.75 m template body; girth: width scale; mask: FEAT bits (+ stoop level at STOOP_SHIFT);
//     cols: 24-bit sRGB ints in slot order skin, hair, top, bottom, legwear, shoes, hat, bag; gib colours are linear.
//   FEAT, STOOP_SHIFT, SLOT: shared with body.js (geometry parts carry the feature bit that shows them)
import { rng } from './rng.js';

export const FEAT = { HAIR: 0, LONG: 1, BUN: 2, BEANIE: 3, CAP: 4, SCARF: 5, COAT: 6, SKIRT: 7, BAG: 8, BACKPACK: 9, BEARD: 10, GLASSES: 11, SHORTSLEEVE: 12, SHORTS: 13, FEM: 14 };
export const STOOP_SHIFT = 15;
export const SLOT = { SKIN: 0, HAIR: 1, TOP: 2, BOTTOM: 3, LEGWEAR: 4, SHOES: 5, HAT: 6, BAG: 7, DARK: 8, FOREARM: 9, SHIN: 10, HEADTOP: 11 };
export const KINDS = ['man', 'woman', 'elderW', 'elderM', 'young', 'child'];

const H = (s) => parseInt(s.slice(1), 16);
const L = (a) => a.map(H);
const SKIN = L(['#f0d2bc', '#e9c3a6', '#dfb293', '#d4a381', '#c89170', '#b57d5b', '#946043', '#6e4632']);
const SKIN_W = [18, 22, 20, 14, 10, 7, 5, 4];
const HAIR_Y = L(['#3a2a20', '#56402d', '#1f1b19', '#86683f', '#b3925c', '#cbb07e', '#72381f', '#5a1e28', '#8a3020']);
const HAIR_O = L(['#8e8a85', '#c7c3bc', '#5d5a56', '#6a4a36', '#5a1e28', '#8a3a24']);
const MUTED = L(['#2d2f33', '#1c1c1f', '#253049', '#888a8c', '#55593a', '#7c7357', '#bdad8f', '#98704a', '#5a3f31', '#5c2330', '#2f493a', '#4c6384', '#e2e0da', '#d6cdb6', '#4a596d', '#b58a88', '#6b6e73']);
const ACCENT = L(['#c4982f', '#a1502d', '#2f7876', '#a2322d', '#5f7dbd', '#d5b73b', '#8b79a4', '#2f784d', '#c46a2c', '#c26a88']);
const JEANS = L(['#3a4c6d', '#2b3954', '#5b6f8e', '#1d1d20', '#55575b', '#3e3128', '#a6967a', '#4c5237', '#6c6a66']);
const SKIRTS = L(['#1e1e22', '#262f47', '#5c2330', '#5a5c60', '#6b5a78', '#7a6446', '#3a4a3a']);
const TIGHTS = L(['#1a1a1c', '#3a3230', '#5a4a44']);
const SHOES = L(['#191919', '#39291f', '#dcdcd7', '#6a6a6a', '#8a6a4a', '#2b2b30']);
const COATS = L(['#1d1d20', '#2e3034', '#98704a', '#253049', '#4f5436', '#5c2330', '#6b6d70', '#b3a07c', '#34483a', '#5a4032']);
const COATS_OLD = L(['#1d1d20', '#3a3538', '#5a4032', '#6c5a78', '#4a3a48', '#6b6d70', '#35303a']);
const HATS = L(['#1c1c1f', '#58595c', '#5c2330', '#c4982f', '#253049', '#e0ded8', '#7c7357']);
const SCARVES = L(['#7a2a34', '#2b3552', '#b8a888', '#34503f', '#5a3b66', '#9a3a30', '#8a7a5a']);
const BAGS = L(['#1a1a1c', '#4a3226', '#8e6a44', '#253049', '#5c2330', '#6a6a6a', '#a2322d']);

const lin = (c) => [16, 8, 0].map(sh => ((c >>> sh) % 256 / 255) ** 2.2); // packed sRGB -> linear triplet (gibs)

export function makeLook(seed, kind = null) {
  const r = rng(seed * 7 + 13);
  const pick = (A) => A[Math.floor(r() * A.length) % A.length];
  const pickW = (A, W) => { let t = 0; for (const w of W) t += w; let u = r() * t; for (let i = 0; i < A.length; i++) { u -= W[i]; if (u <= 0) return A[i]; } return A[A.length - 1]; };
  const chance = (p) => r() < p;
  if (!kind) kind = pickW(KINDS, [30, 32, 10, 8, 14, 6]);
  const bit = (b) => { mask |= 1 << b; };
  let mask = 0, stoop = 0, sH, girth, speed = 0.9 + r() * 0.25;
  const skin = pickW(SKIN, SKIN_W);
  let hair = pick(HAIR_Y);
  const top0 = chance(0.2) ? pick(ACCENT) : pick(MUTED);
  let top = top0, bottom = pick(JEANS), legwear = -1, shoes = pick(SHOES), hat = pick(HATS), bag = pick(BAGS);
  const coat = (p, pal = COATS) => { if (chance(p)) { bit(FEAT.COAT); top = pick(pal); return true; } return false; };
  const hairStyle = (pShort, pLong, pBun) => { const u = r(); if (u < pShort) bit(FEAT.HAIR); else if (u < pShort + pLong) { bit(FEAT.HAIR); bit(FEAT.LONG); } else if (u < pShort + pLong + pBun) { bit(FEAT.HAIR); bit(FEAT.BUN); } };
  switch (kind) {
    case 'man':
      sH = 0.97 + r() * 0.13; girth = 0.95 + r() * 0.35;
      if (chance(0.92)) bit(FEAT.HAIR);
      if (chance(0.15)) bit(FEAT.BEARD);
      if (chance(0.12)) bit(FEAT.CAP); else if (chance(0.1)) bit(FEAT.BEANIE);
      if (!coat(0.3) && chance(0.25)) bit(FEAT.SHORTSLEEVE);
      if (chance(0.1)) bit(FEAT.BAG); else if (chance(0.13)) bit(FEAT.BACKPACK);
      if (chance(0.12)) bit(FEAT.GLASSES);
      break;
    case 'woman':
      bit(FEAT.FEM); sH = 0.9 + r() * 0.12; girth = 0.86 + r() * 0.34;
      hairStyle(0.25, 0.55, 0.2);
      if (chance(0.35)) { bit(FEAT.SKIRT); bottom = pick(SKIRTS); legwear = chance(0.6) ? pick(TIGHTS) : skin; }
      if (!coat(0.35) && chance(0.3)) bit(FEAT.SHORTSLEEVE);
      if (chance(0.08)) bit(FEAT.BEANIE);
      if (chance(0.55)) bit(FEAT.BAG);
      if (chance(0.1)) bit(FEAT.GLASSES);
      break;
    case 'elderW':
      bit(FEAT.FEM); sH = 0.88 + r() * 0.08; girth = 1.05 + r() * 0.35; stoop = 1 + (chance(0.4) ? 1 : 0); speed *= 0.72;
      hair = pick(HAIR_O);
      if (chance(0.45)) { bit(FEAT.SCARF); hat = pick(SCARVES); } else hairStyle(0.7, 0, 0.3);
      coat(0.7, COATS_OLD);
      if (chance(0.6)) { bit(FEAT.SKIRT); bottom = pick(SKIRTS); legwear = pick(TIGHTS); }
      if (chance(0.6)) bit(FEAT.BAG);
      if (chance(0.3)) bit(FEAT.GLASSES);
      shoes = pick([SHOES[0], SHOES[1], SHOES[5]]);
      break;
    case 'elderM':
      sH = 0.93 + r() * 0.09; girth = 1.0 + r() * 0.3; stoop = 1; speed *= 0.78;
      hair = pick(HAIR_O.slice(0, 3));
      if (chance(0.75)) bit(FEAT.HAIR);
      if (chance(0.35)) { bit(FEAT.CAP); hat = pick([HATS[0], HATS[1], HATS[6]]); }
      coat(0.55, COATS_OLD);
      if (chance(0.25)) bit(FEAT.GLASSES);
      if (chance(0.2)) bit(FEAT.BEARD);
      bottom = pick([JEANS[3], JEANS[4], JEANS[5], JEANS[8]]); shoes = pick([SHOES[0], SHOES[1]]);
      break;
    case 'young':
      sH = 0.92 + r() * 0.12; girth = 0.84 + r() * 0.18; speed *= 1.08;
      if (chance(0.5)) { bit(FEAT.FEM); hairStyle(0.2, 0.6, 0.2); } else if (chance(0.95)) bit(FEAT.HAIR);
      if (chance(0.35)) top = pick(ACCENT);
      if (chance(0.45)) bit(FEAT.BACKPACK);
      if (chance(0.2)) bit(FEAT.CAP);
      if (chance(0.4)) bit(FEAT.SHORTSLEEVE);
      if (chance(0.15)) bit(FEAT.SHORTS);
      if (chance(0.5)) shoes = SHOES[2];
      coat(0.12);
      break;
    default: // child
      kind = 'child'; sH = 0.62 + r() * 0.18; girth = 0.85 + r() * 0.15; speed *= 0.9;
      if (chance(0.5)) { bit(FEAT.FEM); hairStyle(0.3, 0.5, 0.2); } else bit(FEAT.HAIR);
      top = chance(0.6) ? pick(ACCENT) : pick(MUTED);
      if (chance(0.5)) bit(FEAT.BACKPACK);
      if (chance(0.3)) bit(FEAT.SHORTSLEEVE);
      if (chance(0.2)) bit(FEAT.BEANIE);
      shoes = chance(0.5) ? SHOES[2] : pick(SHOES);
  }
  if (legwear < 0) legwear = bottom;
  mask |= stoop << STOOP_SHIFT;
  const cols = [skin, hair, top, bottom, legwear, shoes, hat, bag];
  const hasHat = mask & ((1 << FEAT.BEANIE) | (1 << FEAT.CAP) | (1 << FEAT.SCARF));
  const gib = { top: lin(mask & (1 << FEAT.COAT) ? top0 : top), bottom: lin(bottom), outer: mask & (1 << FEAT.COAT) ? lin(top) : null, skin: lin(skin), hair: lin(hasHat ? hat : hair) };
  return { kind, sH, girth, mask, cols, speed, gib };
}
