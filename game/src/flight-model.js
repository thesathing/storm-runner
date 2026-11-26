// Storm Runner — flight model: throttle, pitch, bank, lift and stall, fuel
// burn and damage. State is plain numbers; the renderer and the missions
// only read it, they never write it.
import { FLIGHT, FUEL, DAMAGE, STEP } from './config.js';

export function createPlane(region, upgrades) {
  const fuelCap = FUEL.capacity * (1 + 0.25 * (upgrades.fuel || 0));
  const thrustMul = 1 + 0.12 * (upgrades.engine || 0);
  const hullBonus = 20 * (upgrades.hull || 0);
  const rodMul = Math.max(0.1, 1 - 0.30 * (upgrades.rod || 0));
  return {
    x: region.home.x, z: region.home.z,
    y: 130, heading: region.home.heading,
    pitch: 0, bank: 0, speed: 42,
    throttle: 0.55, fuel: fuelCap, fuelCap,
    damage: 0, damageMax: 100 + hullBonus,
    thrustMul, rodMul,
    gearDown: false, crashed: false, landed: false,
    verticalSpeed: 0, onGround: false, takeoffGrace: 0,
    time: 0, distanceFlown: 0,
  };
}

// ctrl: {throttleUp, throttleDown, pitchUp, pitchDown, bankLeft, bankRight, gear}
// isOnStrip(x, z) reports whether the plane is over a runway.
export function stepPlane(plane, ctrl, dt, terrain, gust, isOnStrip) {
  if (plane.crashed) return { event: 'crashed' };
  plane.time += dt;
  if (plane.takeoffGrace > 0) plane.takeoffGrace -= dt;

  // Throttle first: it is also the takeoff control.
  if (ctrl.throttleUp) plane.throttle = Math.min(1, plane.throttle + dt * 0.7);
  if (ctrl.throttleDown) plane.throttle = Math.max(0, plane.throttle - dt * 0.7);

  // Landed: spool the throttle past 0.65 to release the brakes and roll
  // for takeoff. Until then the plane sits on the strip.
  if (plane.landed) {
    if (plane.throttle > 0.65) {
      plane.landed = false;
      plane.onGround = true;
    } else {
      return { event: 'landed' };
    }
  }

  // Pitch and bank ease toward the commanded deflection. The autopilot
  // may pass proportional values (-1..1) instead of on/off keys.
  const pitchTarget = ctrl.pitchValue !== undefined
    ? Math.max(-1, Math.min(1, ctrl.pitchValue))
    : (ctrl.pitchUp ? 1 : 0) - (ctrl.pitchDown ? 1 : 0);
  const bankTarget = ctrl.bankValue !== undefined
    ? Math.max(-1, Math.min(1, ctrl.bankValue))
    : (ctrl.bankRight ? 1 : 0) - (ctrl.bankLeft ? 1 : 0);
  plane.pitch += (pitchTarget * 0.55 - plane.pitch) * Math.min(1, dt * 4);
  plane.bank += (bankTarget * 0.85 - plane.bank) * Math.min(1, dt * 3.2);

  // Speed: thrust minus drag, plus dive, minus climb; stall makes it mushy.
  const stalled = plane.speed < FLIGHT.stallSpeed;
  const thrust = plane.throttle * FLIGHT.accelPerThrottle * plane.thrustMul;
  const drag = FLIGHT.drag * plane.speed * plane.speed / 60 + (plane.gearDown ? FLIGHT.gearDrag * plane.speed : 0);
  const slope = -Math.sin(plane.pitch);
  let accel = thrust - drag + slope * (slope > 0 ? FLIGHT.diveAccel : FLIGHT.climbCost);
  if (stalled) accel -= 4;
  plane.speed = Math.max(0, plane.speed + accel * dt);

  // Turn follows the bank, scaled by speed; no turn when stalled.
  if (!stalled) plane.heading += plane.bank * FLIGHT.turnRate * (plane.speed / FLIGHT.cruiseSpeed) * dt;

  // Vertical speed from pitch and lift; below stall the nose drops.
  let vy = Math.sin(plane.pitch) * plane.speed;
  if (stalled) vy -= FLIGHT.sinkBelowStall * (1 - plane.speed / FLIGHT.stallSpeed);
  vy += gust.y * 0.6;
  plane.verticalSpeed = vy;

  // Position.
  const forwardX = Math.sin(plane.heading);
  const forwardZ = Math.cos(plane.heading);
  plane.x += (forwardX * plane.speed + gust.x) * dt;
  plane.z += (forwardZ * plane.speed + gust.z) * dt;
  plane.y += vy * dt;
  plane.distanceFlown += plane.speed * dt;

  // Fuel burn: throttle-driven, plus a little at idle.
  const burn = (FUEL.burnIdle + (FUEL.burnFullThrottle - FUEL.burnIdle) * plane.throttle) * dt;
  plane.fuel = Math.max(0, plane.fuel - burn);
  if (plane.fuel <= 0 && plane.throttle > 0) plane.throttle = 0;

  // Turbulence overstress: only fast flight deep inside a storm cell
  // wears the airframe; a gentle pilot in the rough is safe.
  if (gust.strength > 0.7 && plane.speed > 78) {
    plane.damage += DAMAGE.turbulencePerSec * (gust.strength - 0.7) * dt;
  }

  // Terrain / sea contact.
  const ground = terrain.groundAt(plane.x, plane.z);
  const events = {};
  if (plane.onGround) {
    // Rolling on the ground after a takeoff release: stay on it, roll,
    // and lift off when the pilot pulls up with flying speed.
    plane.y = ground + 0.5;
    if (plane.verticalSpeed > 1 && plane.speed > FLIGHT.stallSpeed) {
      plane.onGround = false;
      // Grace after liftoff: on a rising slope the ground can keep up
      // with the climb for a moment. Without this the plane "lands"
      // again on the same slope every step (+26 damage per bounce) and
      // dies seconds after a rough-field takeoff.
      plane.takeoffGrace = 1.5;
    }
  } else if (plane.y <= ground + 0.5) {
    plane.y = ground + 0.5;
    if (plane.takeoffGrace > 0) {
      // Still climbing out just after liftoff: ride the slope, do not
      // re-trigger a landing or a crash.
    } else {
      const vs = -vy; // positive = descending speed
      const onStrip = typeof isOnStrip === 'function' ? isOnStrip(plane.x, plane.z) : false;
      if (vs <= DAMAGE.hardVSpeed && plane.speed < 55 && onStrip) {
        plane.landed = true;
        plane.onGround = true;
        events.event = 'landed';
        if (vs > 4) plane.damage += DAMAGE.hardLanding * 0.4;
      } else if (vs <= 3 && plane.speed < 40 && ground <= 1.5) {
        // Gentle water ditching at low speed.
        plane.landed = true;
        events.event = 'ditched';
      } else if (vs <= DAMAGE.hardVSpeed && plane.speed < 55) {
        // Rough field landing: survivable, costly.
        plane.damage += DAMAGE.hardLanding;
        plane.landed = true;
        plane.onGround = true;
        events.event = 'rough-landing';
      } else {
        plane.crashed = true;
        events.event = 'crashed';
      }
    }
  }
  if (plane.damage >= plane.damageMax) {
    plane.crashed = true;
    events.event = 'crashed';
  }
  return events;
}

export function lightningStrike(plane) {
  plane.damage += DAMAGE.lightningHit * plane.rodMul;
  if (plane.damage >= plane.damageMax) plane.crashed = true;
  return plane.damage;
}

export function stepForShot(plane, targetHeading, targetAlt, dt, terrain, gust, isOnStrip, opts) {
  // Autopilot for staged screenshots: proportional steering toward a
  // heading and altitude with the same physics as the player, so the
  // flight stays smooth instead of porpoising between extremes.
  // opts.landing: approach speed and a gentler pitch for a real flare.
  const dh = normAngle(targetHeading - plane.heading);
  const altErr = targetAlt - plane.y;
  const landing = opts && opts.landing;
  const ctrl = {
    throttleUp: plane.speed < (landing ? 42 : 50),
    throttleDown: plane.speed > (landing ? 48 : 56),
    pitchValue: landing
      ? Math.max(-0.35, Math.min(0.35, altErr * 0.012))
      : Math.max(-0.6, Math.min(0.6, altErr * 0.012)),
    bankValue: Math.max(-0.8, Math.min(0.8, dh * 1.2)),
    gear: false,
  };
  return stepPlane(plane, ctrl, dt, terrain, gust, isOnStrip);
}

export function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export { STEP };
