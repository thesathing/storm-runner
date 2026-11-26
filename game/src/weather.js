// Storm Runner — weather: storm cells with rain, gusts, turbulence and
// lightning. Cells drift slowly; flying inside one is loud, shaky and
// dangerous, which is exactly the point of a storm-chaser game.
import { createRandom } from './random.js';

export function createWeather(seed, regionId) {
  const rng = createRandom(seed * 31 + regionId * 97);
  const cells = [];
  const count = regionId === 1 ? 2 : regionId === 2 ? 5 : 6;
  for (let i = 0; i < count; i += 1) {
    cells.push({
      x: rng.range(-1800, 1800),
      z: rng.range(-1800, 1800),
      r: rng.range(380, 700),
      intensity: rng.range(0.45, 1),
      drift: rng.range(0, Math.PI * 2),
      driftSpeed: rng.range(2, 6),
      base: rng.range(260, 520), // cloud base height
    });
  }
  // The Eye (region 3) keeps a calm circle at its centre.
  const eye = regionId === 3 ? { x: 300, z: 300, r: 520 } : null;

  let bolt = null; // active lightning bolt {points, life}
  let flash = 0; // screen flash 0..1
  let strikeTimer = rng.range(4, 9);
  let time = 0;

  function inCell(x, z) {
    let worst = 0;
    for (const c of cells) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < c.r) worst = Math.max(worst, c.intensity * (1 - d / c.r));
    }
    if (eye) {
      const dx = x - eye.x;
      const dz = z - eye.z;
      if (Math.sqrt(dx * dx + dz * dz) < eye.r) return 0;
    }
    return worst;
  }

  function update(dt, plane) {
    time += dt;
    for (const c of cells) {
      c.x += Math.cos(c.drift) * c.driftSpeed * dt;
      c.z += Math.sin(c.drift) * c.driftSpeed * dt;
      if (c.x > 2200) c.x = -2200;
      if (c.x < -2200) c.x = 2200;
      if (c.z > 2200) c.z = -2200;
      if (c.z < -2200) c.z = 2200;
    }
    strikeTimer -= dt;
    const storm = inCell(plane.x, plane.z);
    // Lightning prefers to strike near the plane when it is inside a cell,
    // but a near strike is an event, not a metronome.
    if (strikeTimer <= 0) {
      strikeTimer = rng.range(6, 12) / (0.4 + storm);
      const near = storm > 0.25 && rng.next() < 0.35;
      const bx = near ? plane.x + rng.range(-200, 200) : rng.range(-1200, 1200) + plane.x * 0.3;
      const bz = near ? plane.z + rng.range(-200, 200) : rng.range(-1200, 1200) + plane.z * 0.3;
      // Short bolt: cloud base (~430 m) down to the ground, tight jitter
      // so it reads as a strike, not a ribbon across the sky.
      const topY = 430;
      const pts = [{ x: bx, y: topY, z: bz }];
      let px = bx;
      let pz = bz;
      for (let y = topY - 70; y > 0; y -= 70) {
        px += rng.range(-28, 28);
        pz += rng.range(-28, 28);
        pts.push({ x: px, y, z: pz });
      }
      pts.push({ x: px, y: 0, z: pz });
      bolt = { points: pts, life: 0.22, near, x: px, z: pz };
      flash = 0.85;
    }
    if (bolt) {
      bolt.life -= dt;
      if (bolt.life <= 0) bolt = null;
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 3.2);
    return storm;
  }

  // Smoothed gust vector at the plane, stronger inside cells.
  function gustAt(x, z, t) {
    const storm = inCell(x, z);
    if (storm <= 0) return { x: 0, y: 0, z: 0, strength: 0 };
    const g = rng.noise1(t * 0.7 + x * 0.002) * 7 * storm;
    const g2 = rng.noise1(t * 0.9 + z * 0.002 + 50) * 7 * storm;
    const up = rng.noise1(t * 0.5 + x * 0.001 + z * 0.001) * 5 * storm;
    return { x: g, y: up, z: g2, strength: storm };
  }

  return {
    cells, eye,
    get bolt() { return bolt; },
    get flash() { return flash; },
    inCell, update, gustAt,
  };
}
