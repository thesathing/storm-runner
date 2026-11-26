// Storm Runner — terrain: a seeded heightmap with islands in a teal sea,
// three home strips, and the camera projection the renderer uses.
import { WORLD_SIZE, SEA_LEVEL, REGIONS } from './config.js';
import { createRandom } from './random.js';

// Island bumps: centre (x, z), radius, peak height. Hand-placed per region
// seed so every region reads as a different coastline.
function islandsFor(seed) {
  const rng = createRandom(seed * 7 + 13);
  const list = [];
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    list.push({
      x: rng.range(-1900, 1900),
      z: rng.range(-1900, 1900),
      r: rng.range(420, 900),
      h: rng.range(80, 170),
    });
  }
  return list;
}

export function createTerrain(seed) {
  const rng = createRandom(seed);
  const islands = islandsFor(seed);
  // A few sharp peaks for silhouette variety.
  const peaks = [];
  for (let i = 0; i < 5; i += 1) {
    peaks.push({ x: rng.range(-1800, 1800), z: rng.range(-1800, 1800), r: rng.range(180, 320), h: rng.range(100, 160) });
  }

  function height(x, z) {
    // Rolling base hills from layered noise.
    let h = rng.noise2(x * 0.00045, z * 0.00045) * 55
      + rng.noise2(x * 0.0016 + 40, z * 0.0016 - 17) * 22;
    // Island bumps lift the land out of the sea.
    for (const isl of islands) {
      const dx = x - isl.x;
      const dz = z - isl.z;
      const d2 = (dx * dx + dz * dz) / (isl.r * isl.r);
      if (d2 < 1) h += isl.h * (1 - d2) * (1 - d2);
    }
    for (const p of peaks) {
      const dx = x - p.x;
      const dz = z - p.z;
      // Rounded dome, not a cone: a squared falloff gives a curved
      // peak and a soft shoulder instead of a pyramid point. The
      // radius wobbles with direction so the silhouette is irregular,
      // never a straight-edged triangle.
      const ang = Math.atan2(dz, dx);
      const wob = 1 + 0.45 * rng.noise2(Math.cos(ang) * 1.2 + 9, Math.sin(ang) * 1.2 - 4);
      const re = p.r * wob;
      const d2 = (dx * dx + dz * dz) / (re * re);
      if (d2 < 1) {
        const dome = (1 - d2) * (1 - d2);
        h += p.h * dome;
        // Ridge variation on the flanks so the faces are not flat.
        h += p.h * 0.20 * rng.noise2(x * 0.02 + 3, z * 0.02 - 8) * (1 - d2);
      }
      // Two lower shoulder bumps, one on each side, break the
      // symmetry so no single straight slope defines the silhouette.
      for (const [ox, oz, hh] of [[0.45, 0.30, 0.45], [-0.40, 0.35, 0.35]]) {
        const sx = dx - p.r * ox;
        const sz = dz - p.r * oz;
        const sd2 = (sx * sx + sz * sz) / ((p.r * 0.6) * (p.r * 0.6));
        if (sd2 < 1) h += p.h * hh * (1 - sd2) * (1 - sd2);
      }
    }
    // World rim falls away into open sea so the horizon is water.
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (WORLD_SIZE / 2);
    if (edge > 0.82) h -= (edge - 0.82) * 900;
    // Flatten the ground around every home strip so runways sit on flat
    // land, and keep a flat approach corridor along the strip axis so no
    // hill blocks the view of the runway on final.
    for (const region of REGIONS) {
      const strip = region.strip;
      const dx = x - strip.x;
      const dz = z - strip.z;
      const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
      const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
      let s = 0;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 340) {
        const t = d < 130 ? 1 : 1 - (d - 130) / 210;
        s = Math.max(s, t * t * (3 - 2 * t));
      }
      if (Math.abs(along) < 750 && Math.abs(across) < 170) {
        const ea = Math.abs(along) < 550 ? 1 : 1 - (Math.abs(along) - 550) / 200;
        const ec = Math.abs(across) < 110 ? 1 : 1 - (Math.abs(across) - 110) / 60;
        const t = Math.min(ea, ec);
        s = Math.max(s, t * t * (3 - 2 * t));
      }
      if (s > 0) h = h * (1 - s) + 14 * s;
    }
    return h;
  }

  function groundAt(x, z) {
    return Math.max(height(x, z), SEA_LEVEL);
  }

  // Deterministic 0..1 speckle for one cell, from its world position:
  // cheap, stateless, and the same every frame, so texture never shimmers.
  function hashCell(x, z) {
    let h = ((Math.floor(x * 0.11) | 0) * 374761393 + (Math.floor(z * 0.11) | 0) * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    return (((h ^ (h >> 16)) >>> 0) / 4294967296);
  }

  // Textured colour of a terrain cell as [r, g, b]: seeded noise varies
  // every facet (no flat fills, no checkerboard), height bands pick the
  // material, and steep faces shade dark like cliffs. `slope` is the
  // height drop across the cell divided by its size, 0 on flat ground.
  // Water is textured too: layered noise gives wave facets instead of a
  // solid sheet, and the renderer adds sun glitter on top.
  // Realism pass: softer noise (low amplitude, broad patches dominate)
  // so facets blend instead of reading as a grid, a deeper blue-green
  // ocean, and a land palette a real coastline has from the air:
  // warm sand, muted green lowland, darker forest, brown rock, grey
  // cliff on steep faces.
  function colour(x, z, h, slope) {
    const n1 = rng.noise2(x * 0.004 + 7, z * 0.004 - 3); // broad patches
    const n2 = rng.noise2(x * 0.021 - 11, z * 0.021 + 5); // fine grain
    const v = 1 + n1 * 0.08 + n2 * 0.04;
    let base;
    if (h <= 1.5) {
      // Sea: deep blue-green. The variation is VERY low frequency
      // (wavelength ~800 m, far wider than one 95 m mesh cell) and
      // small, so neighbouring quads differ by ~1% and no square
      // boundary can read. The old 0.009/m noise flipped phase from
      // one quad to the next, which is what drew the tile grid.
      const w = 0.5 + 0.5 * rng.noise2(x * 0.0013 + 31, z * 0.0013 - 19);
      base = [12 + w * 5, 64 + w * 10, 74 + w * 9];
    } else if (h <= 6) {
      base = [208, 178, 120]; // warm sand beach ring
    } else if (h <= 30) {
      base = [58 + n1 * 10, 100 + n1 * 12, 52 + n2 * 8]; // green lowland
    } else if (h <= 55) {
      base = [46 + n1 * 9, 84 + n1 * 10, 46 + n2 * 7]; // darker forest
    } else if (h <= 120) {
      base = [94 + n1 * 11, 84 + n2 * 9, 56]; // dry brown hills
    } else if (h <= 175) {
      base = [100 + n1 * 9, 104 + n2 * 7, 110]; // rock
    } else {
      base = [132 + n1 * 9, 136 + n2 * 7, 144]; // high grey
    }
    // Cliff shading: steep faces go dark and desaturated.
    const cliff = Math.max(0, Math.min(1, (slope - 0.45) / 0.6));
    if (cliff > 0) {
      const dark = 1 - cliff * 0.45;
      base = [base[0] * dark * 0.9, base[1] * dark * 0.9, base[2] * dark];
    }
    // The sea gets an even gentler multiplier than the land: the
    // broad-patch noise would otherwise still step at quad edges.
    const vv = h <= 1.5 ? 1 + n1 * 0.02 + n2 * 0.01 : v;
    return [
      Math.max(0, Math.min(255, Math.round(base[0] * vv))),
      Math.max(0, Math.min(255, Math.round(base[1] * vv))),
      Math.max(0, Math.min(255, Math.round(base[2] * vv))),
    ];
  }

  // Camera basis from yaw/pitch/roll; project a world point to screen.
  // Returns null when behind the camera.
  function makeProjector(cam, focal, cx, cy) {
    const cyaw = Math.cos(cam.yaw);
    const syaw = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch);
    const sp = Math.sin(cam.pitch);
    const cr = Math.cos(cam.roll);
    const sr = Math.sin(cam.roll);
    return function project(px, py, pz) {
      const dx = px - cam.x;
      const dy = py - cam.y;
      const dz = pz - cam.z;
      // Rotate into camera space: forward = -Z in camera space. A point
      // straight ahead (along the camera yaw) must land at fx = 0, fz < 0.
      let fx = dx * cyaw - dz * syaw;
      let fy = dy;
      let fz = -(dx * syaw + dz * cyaw);
      // Pitch (rotate around X).
      let ty = fy * cp - fz * sp;
      let tz = fy * sp + fz * cp;
      fy = ty;
      fz = tz;
      // Roll (rotate around Z).
      const rx = fx * cr - fy * sr;
      const ry = fx * sr + fy * cr;
      fx = rx;
      fy = ry;
      const depth = -fz;
      if (depth < 8) return null;
      const s = focal / depth;
      return { x: cx + fx * s, y: cy - fy * s, depth, s };
    };
  }

  return { height, groundAt, colour, hashCell, islands, makeProjector };
}
