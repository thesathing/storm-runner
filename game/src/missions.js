// Storm Runner — missions: five sorties across three regions, each with a
// different goal. A mission is a list of objectives the plane works through
// in order; completing the last one finishes the sortie.
import { createRandom } from './random.js';

export const MISSION_DEFS = [
  {
    id: 'M1', region: 1, name: 'Ring Rush', goal: 'Fly all 8 storm rings',
    brief: 'Eight rings over the coast and the sea. Smooth throttle, tidy turns.',
    kind: 'rings', count: 8, par: 150,
  },
  {
    id: 'M2', region: 1, name: 'Cargo Drop', goal: 'Drop 3 crates on the island strip, then land',
    brief: 'Three crates for the island strip. Press C over the drop zone, then bring her home.',
    kind: 'cargo', count: 3, par: 240,
  },
  {
    id: 'M3', region: 2, name: 'Thunder Rings', goal: 'Fly all 10 rings inside the storm',
    brief: 'Ten rings inside the storm cells. Lightning is live — watch the rod, watch the fuel.',
    kind: 'rings', count: 10, par: 210,
  },
  {
    id: 'M4', region: 2, name: 'Rescue Run', goal: 'Land on the short strip, pick up the crew, take off',
    brief: 'A crew is stranded on the short strip. Land, hold 3 seconds for pickup, get out before the fuel goes.',
    kind: 'rescue', count: 1, par: 260,
  },
  {
    id: 'M5', region: 3, name: 'The Eye', goal: 'Slalom 8 rings in the eyewall, then land in the calm eye',
    brief: 'Eight rings around the eyewall, then a landing in the calm eye. The hardest sortie of the season.',
    kind: 'eye', count: 8, par: 280,
  },
];

function ringPath(rng, centre, count, radius, altBase, altVar) {
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + rng.range(-0.15, 0.15);
    rings.push({
      x: centre.x + Math.cos(a) * radius,
      z: centre.z + Math.sin(a) * radius,
      y: altBase + rng.range(-altVar, altVar),
      r: 45,
      done: false,
    });
  }
  return rings;
}

export function createMission(def, region, terrain) {
  const rng = createRandom(def.region * 1000 + def.id.charCodeAt(1) * 77);
  const state = {
    def, region,
    rings: [],
    drops: [],
    cratesLeft: def.kind === 'cargo' ? def.count : 0,
    cratesDropped: 0,
    phase: 'fly', // fly | pickup | return | done
    pickupTimer: 0,
    done: false,
    failed: false,
    elapsed: 0,
    startX: region.home.x, startZ: region.home.z,
  };
  const strip = region.strip;
  if (def.kind === 'rings') {
    const centre = { x: region.home.x + 500, z: region.home.z - 400 };
    state.rings = ringPath(rng, centre, def.count, 620, 195, 40);
  } else if (def.kind === 'cargo') {
    // Drop zones spaced along the strip, so they read as three separate
    // targets on approach instead of one overlapping blob.
    const fx = Math.sin(strip.heading);
    const fz = Math.cos(strip.heading);
    const px = Math.cos(strip.heading);
    const pz = -Math.sin(strip.heading);
    for (let i = 0; i < def.count; i += 1) {
      // Spaced 200 m apart: with the 85 m radius, 150 m spacing let the
      // circles overlap into a Venn mess on the runway.
      const along = (i - 1) * 200;
      const across = rng.range(-40, 40);
      state.drops.push({
        x: strip.x + fx * along + px * across,
        z: strip.z + fz * along + pz * across,
        // Radius 85 m: the plane's minimum turn radius at approach speed
        // is ~80 m, so a smaller zone could only be hit on a perfectly
        // lined-up straight pass. 85 m stays demanding but fair.
        y: 120, r: 85, done: false,
      });
    }
  } else if (def.kind === 'eye') {
    // Eyewall rings fly at 225-275 m: island bumps and sharp peaks can
    // stack to ~200 m where they overlap, and rings at 175-235 m flew
    // the plane straight into a hillside.
    state.rings = ringPath(rng, { x: 300, z: 300 }, def.count, 480, 250, 25);
  }
  return state;
}

// Distance from the plane to the current objective.
export function currentTarget(mission) {
  if (!mission) return null;
  if (mission.def.kind === 'rings' || mission.def.kind === 'eye') {
    return mission.rings.find((r) => !r.done) || null;
  }
  if (mission.def.kind === 'cargo') {
    if (mission.cratesDropped < mission.def.count) {
      return mission.drops.find((d) => !d.done) || null;
    }
    return { x: mission.region.strip.x, z: mission.region.strip.z, y: 60, r: 40, strip: true };
  }
  if (mission.def.kind === 'rescue') {
    if (mission.phase === 'fly') return { x: mission.region.strip.x, z: mission.region.strip.z, y: 60, r: 40, strip: true };
    if (mission.phase === 'pickup') return { x: mission.region.strip.x, z: mission.region.strip.z, y: 10, r: 40, strip: true };
    return { x: mission.region.home.x, z: mission.region.home.z, y: 60, r: 40, strip: true };
  }
  return null;
}

export function missionObjectiveText(mission) {
  if (!mission) return '';
  const d = mission.def;
  if (d.kind === 'rings' || d.kind === 'eye') {
    const done = mission.rings.filter((r) => r.done).length;
    return `${d.name}: rings ${done}/${d.count}`;
  }
  if (d.kind === 'cargo') {
    if (mission.cratesDropped < d.count) return `${d.name}: crates ${mission.cratesDropped}/${d.count} — press C over the zone`;
    return `${d.name}: all crates down — land on the strip`;
  }
  if (d.kind === 'rescue') {
    if (mission.phase === 'fly') return `${d.name}: land on the short strip`;
    if (mission.phase === 'pickup') return `${d.name}: picking up crew… hold still`;
    return `${d.name}: crew aboard — take off and land at home`;
  }
  return d.name;
}

// Advance the mission one step. Returns 'complete' | 'failed' | null.
// onEvent(text) reports progress lines for the debrief and HUD.
export function stepMission(mission, plane, dt, terrain, isOnStrip, onEvent) {
  if (!mission || mission.done || mission.failed) return null;
  mission.elapsed += dt;
  const d = mission.def;

  if (d.kind === 'rings' || d.kind === 'eye') {
    const ring = mission.rings.find((r) => !r.done);
    if (ring) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dz = plane.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
        ring.done = true;
        onEvent(`Ring ${mission.rings.filter((r) => r.done).length}/${d.count}`);
        if (mission.rings.every((r) => r.done)) {
          mission.done = true;
          return 'complete';
        }
      }
    }
  } else if (d.kind === 'cargo') {
    if (mission.cratesDropped < d.count) {
      const drop = mission.drops.find((x) => !x.done);
      if (drop && plane.dropRequested) {
        const dx = plane.x - drop.x;
        const dz = plane.z - drop.z;
        if (dx * dx + dz * dz < drop.r * drop.r && plane.y < 220) {
          drop.done = true;
          mission.cratesDropped += 1;
          onEvent(`Crate ${mission.cratesDropped}/${d.count} on target`);
        } else {
          onEvent('Drop missed — line up over the zone, below 220 m');
        }
        plane.dropRequested = false;
      }
    }
    if (mission.cratesDropped >= d.count && plane.landed) {
      mission.done = true;
      return 'complete';
    }
  } else if (d.kind === 'rescue') {
    if (mission.phase === 'fly' && plane.landed && isOnStrip(plane.x, plane.z)) {
      mission.phase = 'pickup';
      mission.pickupTimer = 3;
      onEvent('Crew boarding…');
    } else if (mission.phase === 'pickup') {
      if (!plane.onGround) {
        mission.phase = 'fly';
        onEvent('Pickup aborted — you left the strip');
      } else {
        mission.pickupTimer -= dt;
        if (mission.pickupTimer <= 0) {
          mission.phase = 'return';
          onEvent('Crew aboard — take off!');
        }
      }
    } else if (mission.phase === 'return' && plane.landed) {
      mission.done = true;
      return 'complete';
    }
  }

  if (plane.crashed) {
    mission.failed = true;
    return 'failed';
  }
  if (plane.fuel <= 0 && !plane.landed) {
    // Out of fuel over land or sea with no strip: the sortie is lost.
    mission.failed = true;
    return 'failed';
  }
  return null;
}

// Stars: 3 for beating par with little damage, 2 for finishing clean, 1 for finishing.
export function missionStars(mission, plane) {
  if (!mission.done) return 0;
  const damageFrac = plane.damage / plane.damageMax;
  if (mission.elapsed <= mission.def.par && damageFrac < 0.25) return 3;
  if (damageFrac < 0.6) return 2;
  return 1;
}
