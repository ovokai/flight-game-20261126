// random.js — a tiny seeded random number generator (mulberry32).
// The world is grown from one seed so every pilot, and every screenshot, sees the same valley:
// the same forests, the same town, the same clouds.

/** Return a function that yields the next pseudo-random number in [0, 1) from `seed`. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random number in [min, max) drawn from `rng`. */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Clamp `value` into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Smooth 0-to-1 ramp between `edge0` and `edge1` (a smoothstep). */
export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Degrees to radians. */
export function rad(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Radians to degrees. */
export function deg(radians) {
  return (radians * 180) / Math.PI;
}
