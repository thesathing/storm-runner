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
      const d2 = (dx * dx + dz * dz) / (p.r * p.r);
      if (d2 < 1) h += p.h * (1 - d2);
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

  // Colour of a terrain cell, flat-shaded by height and slope.
  function colour(x, z, h) {
    if (h <= 1.5) return '#1d6f6e'; // shallow teal water
    if (h <= 4) return '#c9a86a'; // sand
    if (h <= 55) return '#4d7a3f'; // green lowland
    if (h <= 120) return '#5d5a33'; // dry hills
    if (h <= 175) return '#6b6f75'; // rock
    return '#8d9299'; // high grey
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

  return { height, groundAt, colour, islands, makeProjector };
}
