// Seeded randomness for stable per-place variation.
//   hash2(a, b, c?) -> uint32 from integer inputs; rng(seed) -> () => float in [0, 1)
export function hash2(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) + Math.imul(b | 0, 0x165667b1) + Math.imul(c | 0, 0x61c88647) + 0x3c6ef372;
  for (const [sh, mul] of [[13, 0x5bd1e995], [11, 0x68e31da4], [16, 0x1b873593]]) h = Math.imul(h ^ (h >>> sh), mul);
  return (h ^ (h >>> 14)) >>> 0;
}
// xorshift-multiply stream; a zero seed is nudged so it never sticks
export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (Math.imul(s, 0x2545f491) >>> 8) / 16777216;
  };
}
