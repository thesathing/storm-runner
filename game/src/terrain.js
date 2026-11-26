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

// Coastal settlements, generated from the terrain seed so every region
// has its own town in the same place every flight. One sits beside the
// region's home strip (on the flattened ground, clear of the runway),
// one on the shore of the region's largest island. Buildings are small
// shaded blocks with varied roofs; the renderer extrudes them with the
// projector, so they are real 3-D boxes in the world, not decals. All
// deterministic. `heightAt` filters the island town to the flat coastal
// band (2-30 m): a town on a steep dome slope reads as floating white
// boxes, so only shore-level plots are kept.
function townsFor(seed, islands, heightAt) {
  const rng = createRandom(seed * 31 + 7);
  const towns = [];
  const roofs = [
    [176, 92, 58], [74, 80, 92], [122, 88, 60], [96, 104, 88], [188, 172, 140],
  ];
  // `rot` is the town frame: { fx, fz } along, { px, pz } across. The
  // strip town uses the strip's frame so its spread never crosses the
  // runway; the island town uses the world axes.
  function makeTown(cx, cz, spreadAlong, spreadAcross, count, seaDir, rot, maxH) {
    const buildings = [];
    const fx = rot ? rot.fx : 1;
    const fz = rot ? rot.fz : 0;
    const px = rot ? rot.px : 0;
    const pz = rot ? rot.pz : 1;
    for (let i = 0; i < count; i += 1) {
      // Jittered grid with gaps left as streets.
      const ga = (i % 7) - 3;
      const gc = Math.floor(i / 7) - 2;
      if (rng.next() < 0.22) continue;
      const along = ga * (spreadAlong / 3.4) + rng.range(-14, 14);
      const across = gc * (spreadAcross / 2.4) + rng.range(-12, 12);
      const bx = cx + along * fx + across * px;
      const bz = cz + along * fz + across * pz;
      if (heightAt) {
        const hC = heightAt(bx, bz);
        // No building above 40 m anywhere: a locally flat patch near
        // a peak still passes the slope test, and a strip town from
        // another region can otherwise leave a house on a mountaintop.
        // Real strip towns sit at ~14 m, island towns at 2-30 m.
        if (hC > 40) continue;
        if (maxH !== undefined && (hC < 2 || hC > maxH)) continue;
        // Only flat plots: a building on a slope reads as a floating
        // box, however deep its base is sunk. The mountain face keeps
        // 2-30 m patches where the hill noise cancels the dome, so
        // height alone cannot filter it — slope can.
        const hSlope = Math.max(
          Math.abs(heightAt(bx + 25, bz) - hC),
          Math.abs(heightAt(bx - 25, bz) - hC),
          Math.abs(heightAt(bx, bz + 25) - hC),
          Math.abs(heightAt(bx, bz - 25) - hC),
        );
        if (hSlope > 10) continue;
      }
      const dist = Math.hypot(ga / 3, gc / 2);
      buildings.push({
        x: bx, z: bz,
        w: rng.range(10, 20), d: rng.range(8, 16),
        h: rng.range(6, 11) + Math.max(0, 1 - dist) * 7,
        roof: roofs[Math.floor(rng.next() * roofs.length)],
        swap: rng.next() < 0.5,
        shade: rng.range(0.62, 0.95),
      });
    }
    return { x: cx, z: cz, buildings, seaDir: seaDir || null, rot: rot || null };
  }
  // One town per region, beside its strip, ON the flattened ground:
  // the flat corridor around a strip is |along| < 550 and |across| <
  // 110 (smooth falloff to 750/170), so the town sits at along
  // 130-390, across 95-145 — beside the runway and past its far end,
  // never on the mountain slope beyond the flat zone (the first
  // placement, across 140-260, put houses up the mountain).
  for (const region of REGIONS) {
    const strip = region.strip;
    const fx = Math.sin(strip.heading);
    const fz = Math.cos(strip.heading);
    const px = Math.cos(strip.heading);
    const pz = -Math.sin(strip.heading);
    towns.push(makeTown(
      strip.x + fx * 260 + px * 120,
      strip.z + fz * 260 + pz * 120,
      260, 50, 42, null, { fx, fz, px, pz },
    ));
  }
  // One more on the shore of the largest island, facing the strip:
  // 0.85 of the island radius out, where the dome has fallen almost
  // to sea level, and only shore-level plots are kept.
  let big = islands[0];
  for (const isl of islands) if (isl.r > big.r) big = isl;
  const strip0 = REGIONS[0].strip;
  const dx = strip0.x - big.x;
  const dz = strip0.z - big.z;
  const dl = Math.hypot(dx, dz) || 1;
  towns.push(makeTown(
    big.x + (dx / dl) * big.r * 0.85,
    big.z + (dz / dl) * big.r * 0.85,
    260, 170, 36, [dx / dl, dz / dl], null, 30,
  ));
  return towns;
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

  // Towns need height() to filter shore plots, so they are built here,
  // after height is defined.
  const towns = townsFor(seed, islands, height);

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

  return { height, groundAt, colour, hashCell, islands, towns, makeProjector };
}
