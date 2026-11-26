import { createTerrain } from '/home/hatch/workspace/makefun/best-flight-game-20261126-0057/storm-runner/game/src/terrain.js';
import { createWeather } from '/home/hatch/workspace/makefun/best-flight-game-20261126-0057/storm-runner/game/src/weather.js';
import { createPlane, stepPlane, stepForShot, normAngle } from '/home/hatch/workspace/makefun/best-flight-game-20261126-0057/storm-runner/game/src/flight-model.js';
import { createMission, currentTarget, stepMission, MISSION_DEFS } from '/home/hatch/workspace/makefun/best-flight-game-20261126-0057/storm-runner/game/src/missions.js';
import { REGIONS, STEP } from '/home/hatch/workspace/makefun/best-flight-game-20261126-0057/storm-runner/game/src/config.js';
function stripTest(strip) {
  return (x, z) => {
    const dx = x - strip.x, dz = z - strip.z;
    const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
    const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
    return Math.abs(along) < strip.length / 2 && Math.abs(across) < strip.width / 2 + 6;
  };
}
function landStep(plane, strip, dt, terrain, gust, isOnStrip, st) {
  // Traffic-pattern landing: outbound past the far end, downwind leg,
  // base turn, then a carrot-on-the-centreline final with a flare.
  const fx = Math.sin(strip.heading), fz = Math.cos(strip.heading);
  const rx = Math.cos(strip.heading), rz = -Math.sin(strip.heading);
  const half = strip.length / 2;
  const dx = plane.x - strip.x, dz = plane.z - strip.z;
  const along = dx * fx + dz * fz;
  const across = dx * rx + dz * rz;
  let tx, tz, targetAlt;
  if (isOnStrip(plane.x, plane.z) && plane.y < 22 && Math.abs(across) < 12) {
    // Flare: over the strip, centred and low, fly straight down the runway.
    tx = plane.x + fx * 400; tz = plane.z + fz * 400; targetAlt = 13.0; // below ground: descend INTO contact, no skimming
  } else if (st.phase === 'depart') {
    tx = strip.x + fx * (half + 700); tz = strip.z + fz * (half + 700); targetAlt = 60;
    if (along > half + 500) st.phase = 'downwind';
  } else if (st.phase === 'downwind') {
    tx = strip.x - fx * (half + 700) + rx * 350;
    tz = strip.z - fz * (half + 700) + rz * 350; targetAlt = 80;
    if (along < -half - 500) st.phase = 'base';
  } else if (st.phase === 'base') {
    tx = strip.x - fx * (half + 600); tz = strip.z - fz * (half + 600); targetAlt = 60;
    if (Math.hypot(plane.x - tx, plane.z - tz) < 150) st.phase = 'final';
  } else {
    // Final: carrot 400 m ahead of the current position on the centreline.
    const carrotAlong = Math.min(along + 400, half + 400);
    tx = strip.x + fx * carrotAlong; tz = strip.z + fz * carrotAlong;
    targetAlt = 14 + Math.max(0, -along - half - 150) * 0.10; // glide reaches the ground 150 m into the strip
    // Stay at 18 m until centred on the runway, so touchdown is on the
    // strip and not on the rough ground beside it.
    if (Math.abs(across) >= 12) targetAlt = Math.max(targetAlt, 18);
    if (along > half + 300) st.phase = 'depart'; // go around
  }
  const heading = Math.atan2(tx - plane.x, tz - plane.z);
  // Never target below 40 m above the local ground on the pattern
  // legs: a pilot climbs over the terrain instead of flying a fixed low
  // altitude into a hill. The final is exempt — the approach corridor
  // is flat by construction, and the flare is meant to reach the ground.
  if (st.phase !== 'final') {
    targetAlt = Math.max(targetAlt, terrain.groundAt(plane.x, plane.z) + 40);
  }
  const dh = normAngle(heading - plane.heading);
  const altErr = targetAlt - plane.y;
  const ctrl = {
    throttleUp: plane.speed < 42, throttleDown: plane.speed > 48,
    pitchValue: Math.max(-0.5, Math.min(0.5, altErr * 0.02)),
    bankValue: Math.max(-0.8, Math.min(0.8, dh * 1.2)),
    gear: false,
  };
  return stepPlane(plane, ctrl, dt, terrain, gust, isOnStrip);
}
function simMission(defId, seed, maxSec) {
  const def = MISSION_DEFS.find(m => m.id === defId);
  const region = REGIONS.find(r => r.id === def.region);
  const terrain = createTerrain(region.seed + seed);
  const weather = createWeather(region.seed + seed, region.id);
  const plane = createPlane(region, {});
  const mission = createMission(def, region, terrain);
  const isOnStrip = stripTest(region.strip);
  let result = null;
  let climbOut = 0;
  const landState = { phase: 'depart' };
  for (let t = 0; t < maxSec; t += STEP) {
    const target = currentTarget(mission);
    const gust = weather.gustAt(plane.x, plane.z, plane.time);
    weather.update(STEP, plane);
    if (target && !plane.landed) {
      const heading = Math.atan2(target.x - plane.x, target.z - plane.z);
      if (target.strip && !plane.onGround) landStep(plane, region.strip, STEP, terrain, gust, isOnStrip, landState);
      else if (target.strip && plane.onGround) {
        // Rolling after takeoff: climb out along the runway, then the
        // circuit brings the plane back for a second landing.
        if (climbOut > 0) {
          climbOut -= STEP;
          stepForShot(plane, region.strip.heading, 120, STEP, terrain, gust, isOnStrip);
        } else landStep(plane, region.strip, STEP, terrain, gust, isOnStrip, landState);
      }
      else stepForShot(plane, heading, target.y, STEP, terrain, gust, isOnStrip);
    } else if (plane.landed && mission.phase === 'pickup') {
      plane.throttle = 0;
    } else if (plane.landed) {
      // Take off again: after the pickup, or after a rough landing short
      // of the strip that never started the pickup. Spool up with the
      // real takeoff mechanic and fly the pattern again.
      stepPlane(plane, { throttleUp: true }, STEP, terrain, gust, isOnStrip);
      if (!plane.landed && plane.onGround) { climbOut = 12; landState.phase = 'depart'; }
    }
    if (def.kind === 'cargo' && mission.cratesDropped < def.count) {
      const drop = mission.drops.find(d => !d.done);
      if (drop) {
        const dx = plane.x - drop.x, dz = plane.z - drop.z;
        if (dx*dx + dz*dz < drop.r*drop.r && plane.y < 220) plane.dropRequested = true;
      }
    }
    result = stepMission(mission, plane, STEP, terrain, isOnStrip, () => {});
    plane.dropRequested = false;
    if (plane.crashed) { result = 'crashed'; break; }
    if (result || mission.done) break;
  }
  console.log(defId, '->', result || (mission.done ? 'complete' : 'timeout'), '| elapsed', mission.elapsed.toFixed(0) + 's', '| fuel', plane.fuel.toFixed(1), '| damage', plane.damage.toFixed(1));
}
simMission('M2', 1234, 600);
simMission('M4', 1234, 700);
simMission('M1', 1234, 400);
simMission('M3', 1234, 500);
simMission('M5', 1234, 700);
