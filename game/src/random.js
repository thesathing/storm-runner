// Storm Runner — deterministic seeded random numbers. The same seed always
// gives the same world, the same weather and the same mission layout, which
// is what makes the ?shot= scenes reproducible.
export function createRandom(seed) {
  let s = (seed >>> 0) || 1;
  function next() {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  }
  return {
    next,
    range(min, max) { return min + (max - min) * next(); },
    int(min, max) { return Math.floor(min + (max - min + 1) * next()); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    // Smooth 1-D value noise in [-1, 1] for terrain and gusts.
    noise1(x) {
      const i = Math.floor(x);
      const f = x - i;
      const a = hash1(i);
      const b = hash1(i + 1);
      const u = f * f * (3 - 2 * f);
      return a + (b - a) * u;
    },
    // Smooth 2-D value noise in [-1, 1].
    noise2(x, y) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const a = hash2(ix, iy);
      const b = hash2(ix + 1, iy);
      const c = hash2(ix, iy + 1);
      const d = hash2(ix + 1, iy + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    },
  };
}

function hash1(n) {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) / 4294967296) * 2 - 1;
}

function hash2(x, y) {
  let h = ((x | 0) * 374761393 + (y | 0) * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) / 4294967296) * 2 - 1;
}
