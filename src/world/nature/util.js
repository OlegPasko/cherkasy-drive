// Shared helpers for the nature modules (trees.js, water.js, nature/treegeo.js).
//   meshData({ name: [array, itemSize], ... }, index?) -> BufferGeometry
//   tileTexture(bytes, w, h, { wrapX = true, wrapY = true, mips = true }) -> RGBA DataTexture, linear data
//   patchShader(shader, uniforms, vertexEdits, fragmentEdits): merges uniforms, applies [chunk, replacement] pairs
//   rng32(seed) -> () => [0, 1)   xorshift32 with a scrambled seed
//   hashF(...values) -> [0, 1)     stable integer hash of up to four quantised floats
import { BufferGeometry, BufferAttribute, DataTexture, RGBAFormat, RepeatWrapping, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace } from 'three';

export function meshData(attrs, index = null) {
  const geo = new BufferGeometry();
  for (const name of Object.keys(attrs)) {
    const [arr, size] = attrs[name];
    geo.setAttribute(name, new BufferAttribute(arr instanceof Float32Array ? arr : Float32Array.from(arr), size));
  }
  if (index) geo.setIndex(index);
  return geo;
}

export function tileTexture(bytes, w, h, { wrapX = true, wrapY = true, mips = true } = {}) {
  const tex = new DataTexture(bytes, w, h, RGBAFormat);
  tex.wrapS = wrapX ? RepeatWrapping : ClampToEdgeWrapping;
  tex.wrapT = wrapY ? RepeatWrapping : ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = mips ? LinearMipmapLinearFilter : LinearFilter;
  tex.generateMipmaps = mips;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function patchShader(shader, uniforms, vertexEdits = [], fragmentEdits = []) {
  for (const key in uniforms) shader.uniforms[key] = uniforms[key];
  for (const [chunk, text] of vertexEdits) shader.vertexShader = shader.vertexShader.replace(`#include <${chunk}>`, text);
  for (const [chunk, text] of fragmentEdits) shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, text);
}

export function rng32(seed) {
  let s = (Math.imul(seed | 0, 0x9e3779b1) ^ 0x2545f491) >>> 0 || 0x1234567;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function hashF(a, b = 0, c = 0, d = 0) {
  let h = 0x811c9dc5;
  for (const v of [a, b, c, d]) { h = Math.imul(h ^ Math.round(v * 4096), 0x01000193); h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
