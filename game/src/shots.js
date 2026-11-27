// Storm Runner — screenshot staging: deterministic scenes from a fresh
// world with a fixed seed, steered by the autopilot in flight-model.js, so
// every shot is a real frame of a real flight, reproducible from its seed.
// Each scene paints twice, then sets window.__shotReady.
import { STEP, REGIONS } from './config.js';
import { createRandom } from './random.js';
import { createTerrain } from './terrain.js';
import { createWeather } from './weather.js';
import { createPlane, stepForShot, normAngle } from './flight-model.js';
import { createMission, currentTarget } from './missions.js';
import { MISSION_DEFS } from './missions.js';
import { blankSave } from './campaign.js';

function bearingTo(plane, target) {
  return Math.atan2(target.x - plane.x, target.z - plane.z);
}

// A deterministic lightning bolt ahead-right of the plane, for the cover
// frame: short, tight, from a cloud base down to the ground. The channel
// zigzags hard (±70 m per step): a near-straight line smoothed by the
// Catmull-Rom tube reads as a white ribbon, not lightning.
function stagedBolt(rng, plane, fx, fz, rx, rz) {
  const bx = plane.x + fx * 480 + rx * 200;
  const bz = plane.z + fz * 480 + rz * 200;
  const pts = [{ x: bx, y: 430, z: bz }];
  let px = bx;
  let pz = bz;
  for (let y = 360; y > 0; y -= 55) {
    px += rng.range(-70, 70);
    pz += rng.range(-70, 70);
    pts.push({ x: px, y, z: pz });
  }
  pts.push({ x: px, y: 0, z: pz });
  return { points: pts, life: 99, near: true, x: px, z: pz };
}

function buildWorld(regionId, missionId, seed, upgrades) {
  const region = REGIONS.find((r) => r.id === regionId);
  const terrain = createTerrain(region.seed + seed);
  const weather = createWeather(region.seed + seed, regionId);
  const plane = createPlane(region, upgrades || {});
  const def = MISSION_DEFS.find((m) => m.id === missionId);
  const mission = def ? createMission(def, region, terrain) : null;
  return { terrain, weather, plane, mission, region, seed };
}

function isOnStripFactory(strip) {
  return (x, z) => {
    const dx = x - strip.x;
    const dz = z - strip.z;
    const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
    const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
    return Math.abs(along) < strip.length / 2 && Math.abs(across) < strip.width / 2 + 6;
  };
}

// Fly the autopilot toward the current target for `seconds` of sim time.
function flyToward(world, seconds) {
  const { terrain, weather, plane, mission } = world;
  const isOnStrip = isOnStripFactory(world.region.strip);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const target = currentTarget(mission);
    const gust = weather.gustAt(plane.x, plane.z, plane.time);
    weather.update(STEP, plane);
    if (!target) break;
    const heading = bearingTo(plane, target);
    stepForShot(plane, heading, target.y, STEP, terrain, gust, isOnStrip);
    if (plane.crashed || plane.landed) break;
    // Advance mission rings so the autopilot chases the next one.
    const ring = mission.rings.find((r) => !r.done);
    if (ring) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dz = plane.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) ring.done = true;
    }
  }
  world.target = currentTarget(mission);
}

// Compose a flight frame: put the next ring dead ahead of the plane (a
// little above the nose so it is not hidden behind the sprite) and a
// lightning bolt off to one side. `bank` is the staged roll: the cover
// flies level with a gentle bank through the ring, the rings shot banks
// INTO the next ring.
function composeAhead(world, ringDist, boltSide, bank) {
  const { plane } = world;
  const target = currentTarget(world.mission);
  if (!target) return;
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  const rx = Math.cos(plane.heading);
  const rz = -Math.sin(plane.heading);
  target.x = plane.x + fx * ringDist;
  target.z = plane.z + fz * ringDist;
  target.y = plane.y + 75;
  plane.bank = bank;
  const rng = createRandom(4242);
  world.forcedBolt = stagedBolt(rng, plane, fx, fz, rx * boltSide, rz * boltSide);
  // The staged bolt lights its own frame: the renderer lifts the whole
  // scene (terrain, clouds, plane) by this flash, like a real strike.
  world.forcedFlash = 0.45;
  world.target = target;
}

export function stageShot(name) {
  if (name === 'campaign') {
    // Career screen with real progress: stars, credits, an upgrade bought.
    const save = blankSave();
    save.unlockedMissions = ['M1', 'M2', 'M3'];
    save.stars = { M1: 3, M2: 2 };
    save.credits = 420;
    save.upgrades = { fuel: 1, engine: 0, hull: 0, rod: 0 };
    save.best = { M1: 132, M2: 218 };
    return { screen: 'regions', save, world: null };
  }

  if (name === 'rings') {
    const world = buildWorld(2, 'M3', 77, {});
    // Fly through the first rings inside the storm, then compose the
    // frame with the next ring ahead and a bolt to the left, banking
    // INTO the ring. Bank stays ~29 deg: a hard bank was tried and
    // reverted — the chase camera rolls with the plane, so past ~0.6
    // the wings go vertical, the wingtips leave the frame and the
    // plane reads as a white stick, not a plane.
    flyToward(world, 26);
    composeAhead(world, 300, 1, 0.5);
    return { screen: 'play', save: blankSave(), world };
  }

  if (name === 'landing') {
    const world = buildWorld(1, 'M2', 55, {});
    const { plane, region } = world;
    const strip = region.strip;
    const fx = Math.sin(strip.heading);
    const fz = Math.cos(strip.heading);
    plane.x = strip.x - fx * 450;
    plane.z = strip.z - fz * 450;
    plane.y = 55;
    plane.heading = strip.heading;
    plane.pitch = -0.08;
    plane.speed = 52;
    plane.throttle = 0.32;
    plane.gearDown = true;
    const isOnStrip = isOnStripFactory(strip);
    const steps = Math.round(2 / STEP);
    for (let i = 0; i < steps; i += 1) {
      const gust = world.weather.gustAt(plane.x, plane.z, plane.time);
      world.weather.update(STEP, plane);
      const dist = Math.hypot(plane.x - strip.x, plane.z - strip.z);
      const glideAlt = 14 + dist * 0.06;
      stepForShot(plane, strip.heading, glideAlt, STEP, world.terrain, gust, isOnStrip, { landing: true });
      if (plane.landed || plane.crashed) break;
    }
    // The runway projects dead-centre behind the plane sprite; step the
    // staged plane to the side so the strip reads beside it. 100 m: the
    // offset views the strip at an angle, so it reads as a long diagonal
    // like v1 (the v2 55 m step left it head-on and foreshortened, small
    // and pushed to the edge), and the drop zone stays clear of the HUD
    // panels once the renderer clips it out of the panel rect.
    plane.x += Math.cos(strip.heading) * 100;
    plane.z += -Math.sin(strip.heading) * 100;
    plane.bank = 0.08;
    // Slight flare pose for the frame: nose a touch up on final, gear
    // down, aligned with the runway centreline.
    plane.pitch = 0.05;
    // The autopilot runs the throttle up in the sim; set a calm approach
    // speed for the frame.
    plane.speed = 50;
    world.target = currentTarget(world.mission);
    return { screen: 'play', save: blankSave(), world };
  }

  // Default: cover — storm-front ring rush, ring ahead, lightning, rain.
  // After a real 20 s autopilot flight, compose the frame: put the next
  // ring dead ahead at the plane's altitude and a bolt ahead-right, so
  // the cover shows the mission, the storm and the plane together.
  const world = buildWorld(2, 'M3', 99, {});
  const { plane } = world;
  plane.throttle = 0.78;
  flyToward(world, 20);
  // Gentle ~20 degree bank through the ring, level flight. (A hard
  // bank was tried and reverted: it turned the plane into a vertical
  // stick — see the rings shot's note.)
  composeAhead(world, 320, 1, 0.35);
  world.target = currentTarget(world.mission);
  return { screen: 'play', save: blankSave(), world };
}

export { normAngle };
