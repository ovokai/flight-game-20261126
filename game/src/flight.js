// flight.js — the aircraft and the sortie: a forgiving but honest flight model (throttle,
// lift, stalls, coordinated turns) and the mission wrapped around it — take off, fly the ten
// rings in order, come home and land. Fuel, damage and the clock turn a flight into decisions.

import { COURSE, FUEL, PLANE } from './config.js';
import { clamp, deg, rad } from './random.js';
import { RINGS, RUNWAY, onRunway, terrainHeight } from './world.js';

/** Mission phases, in the order a sortie flies them. */
export const PHASE_TAKEOFF = 'takeoff';
export const PHASE_RINGS = 'rings';
export const PHASE_RETURN = 'return';
export const PHASE_DONE = 'done';
export const PHASE_CRASHED = 'crashed';

/** Events stepFlight reports so the page can announce them and the HUD can flash them. */
export const EVENT_TOOK_OFF = 1;
export const EVENT_RING = 2;
export const EVENT_LANDED = 4;
export const EVENT_CRASHED = 8;
export const EVENT_GEAR = 16;

/** A fresh sortie: parked at the south threshold, engine idling, tanks full. */
export function createFlight() {
  return {
    // The aircraft.
    x: RUNWAY.start.x,
    y: PLANE.gearHeight,
    z: RUNWAY.start.z,
    heading: 0, // radians, 0 is north, positive turns east
    pitch: 0, // radians, positive is nose up
    roll: 0, // radians, positive banks right
    speed: 0, // metres a second along the nose
    throttle: PLANE.startThrottle,
    gearDown: true,
    onGround: true,
    verticalSpeed: 0,
    // The airframe and the tanks.
    fuel: FUEL.capacity,
    damage: 0,
    flamedOut: false,
    // The mission.
    phase: PHASE_TAKEOFF,
    nextRing: 0,
    ringsFlown: 0,
    score: 0,
    clock: 0, // seconds since takeoff; the sortie is timed from wheels-up
    airTime: 0,
    started: false,
    stopped: false,
    crashReason: '',
    landingGrade: '',
    message: '',
    messageT: 0,
    ringFlashT: 0,
  };
}

/** The unit vector the nose points along. */
export function forwardVector(state) {
  const cp = Math.cos(state.pitch);
  return {
    x: Math.sin(state.heading) * cp,
    y: Math.sin(state.pitch),
    z: -Math.cos(state.heading) * cp,
  };
}

/** Compass heading in degrees, 0-359, as the HUD shows it. */
export function headingDeg(state) {
  return (deg(state.heading) % 360 + 360) % 360;
}

/** Altitude above the valley floor datum, in feet, as the HUD shows it. */
export function altitudeFeet(state) {
  return Math.max(0, Math.round(state.y * 3.281));
}

/** Airspeed in knots, as the HUD shows it. */
export function speedKnots(state) {
  return Math.round(state.speed * 1.944);
}

function say(state, text, seconds = 3.2) {
  state.message = text;
  state.messageT = seconds;
}

/** Toggle the landing gear, if the airframe is intact enough to move it. */
export function toggleGear(state) {
  state.gearDown = !state.gearDown;
  say(state, state.gearDown ? 'GEAR DOWN' : 'GEAR UP', 1.4);
  return EVENT_GEAR;
}

/**
 * Advance the sortie by `dt` seconds under `input` ({pitch, roll, throttleDelta, brake}).
 * Returns the bitmask of events that happened in this slice.
 */
export function stepFlight(state, input, dt) {
  let events = 0;
  if (state.phase === PHASE_DONE || state.phase === PHASE_CRASHED) return events;
  state.messageT = Math.max(0, state.messageT - dt);
  state.ringFlashT = Math.max(0, state.ringFlashT - dt);

  // Throttle and fuel: a dry tank means gliding home or not at all.
  state.throttle = clamp(state.throttle + input.throttleDelta * dt, 0, 1);
  const burn = FUEL.burnAtIdle + (FUEL.burnAtFullThrottle - FUEL.burnAtIdle) * state.throttle;
  state.fuel = Math.max(0, state.fuel - burn * dt);
  if (state.fuel <= 0 && !state.flamedOut) {
    state.flamedOut = true;
    say(state, 'FUEL EMPTY — GLIDE HER HOME', 5);
  }
  const thrust = state.flamedOut ? 0 : state.throttle * PLANE.thrust;

  // Stick: roll answers first, pitch follows, and the turn comes from the bank.
  const speedAuthority = clamp(state.speed / 34, 0.25, 1);
  state.roll += input.roll * PLANE.rollRate * speedAuthority * dt;
  if (input.roll === 0) state.roll -= state.roll * Math.min(1, 1.5 * dt); // wings settle level
  state.roll = clamp(state.roll, rad(-72), rad(72));
  state.pitch += input.pitch * PLANE.pitchRate * speedAuthority * dt;
  state.pitch = clamp(state.pitch, rad(-38), rad(30));
  if (!state.onGround) {
    state.heading += Math.sin(state.roll) * (9.4 / Math.max(state.speed, 18)) * dt * 1.35;
    state.heading += (input.yaw || 0) * 0.35 * dt;
  }

  // Speed: thrust against drag, gravity along the nose, brakes and grass on the ground.
  const drag = (PLANE.thrust / (PLANE.maxSpeed * PLANE.maxSpeed)) * state.speed * state.speed;
  let accel = thrust - drag - Math.sin(state.pitch) * 8.6;
  if (state.onGround) {
    accel -= state.speed * 0.12;
    if (input.brake) accel -= 6.5;
    if (!onRunway(state.x, state.z)) accel -= state.speed * 0.22; // rough grass drags
  }
  state.speed = Math.max(0, state.speed + accel * dt);

  // Overspeed stress: the airframe complains, then breaks.
  if (state.speed > PLANE.overspeed && !state.onGround) {
    state.damage += (state.speed - PLANE.overspeed) * 0.55 * dt;
    if (state.damage >= 100) return crash(state, 'The airframe came apart in an overspeed dive.');
  }

  // Move: along the nose, with a stall sink when the wing gives up.
  const fwd = forwardVector(state);
  const stalled = !state.onGround && state.speed < PLANE.stallSpeed;
  const sink = stalled ? (PLANE.stallSpeed - state.speed) * 0.55 : 0;
  if (stalled) state.pitch -= 0.35 * dt; // the nose drops through the stall
  const prevY = state.y;
  state.x += fwd.x * state.speed * dt;
  state.z += fwd.z * state.speed * dt;
  state.y += (fwd.y * state.speed - sink) * dt;
  state.verticalSpeed = dt > 0 ? (state.y - prevY) / dt : 0;

  // The ground, and what meeting it means.
  const ground = terrainHeight(state.x, state.z);
  const floor = ground + PLANE.gearHeight;
  if (state.y <= floor) {
    state.y = floor;
    events |= meetGround(state, ground);
    if (state.phase === PHASE_CRASHED || state.phase === PHASE_DONE) return events;
  } else if (state.onGround && state.y > floor + 0.4) {
    state.onGround = false;
    state.started = true;
    events |= EVENT_TOOK_OFF;
    say(state, 'AIRBORNE — GEAR UP (G), CHASE THE GOLD RING', 4);
    if (state.phase === PHASE_TAKEOFF) state.phase = PHASE_RINGS;
  }
  if (!state.onGround) {
    state.airTime += dt;
    if (state.started && !state.stopped) state.clock += dt;
  }

  // The course: crossing the next ring's plane inside its hoop scores.
  if (state.phase === PHASE_RINGS && state.nextRing < RINGS.length) {
    const ring = RINGS[state.nextRing];
    const dx = state.x - ring.x;
    const dy = state.y - ring.y;
    const dz = state.z - ring.z;
    const along = dx * ring.nx + dy * ring.ny + dz * ring.nz;
    const px = dx - along * ring.nx;
    const py = dy - along * ring.ny;
    const pz = dz - along * ring.nz;
    const offAxis = Math.hypot(px, py, pz);
    if (Math.abs(along) < Math.max(4, state.speed * dt * 1.6) && offAxis < ring.radius) {
      state.nextRing += 1;
      state.ringsFlown += 1;
      state.score += COURSE.ringPoints;
      state.ringFlashT = 0.9;
      events |= EVENT_RING;
      if (state.nextRing >= RINGS.length) {
        state.phase = PHASE_RETURN;
        say(state, 'COURSE COMPLETE — BRING HER HOME AND LAND', 5);
      } else {
        say(state, `RING ${state.ringsFlown} OF ${RINGS.length} — +${COURSE.ringPoints}`, 2.2);
      }
    }
  }
  return events;
}

/** The moment the wheels (or the belly) meet the ground: landing, rolling, or wreckage. */
function meetGround(state, ground) {
  const wasAirborne = !state.onGround;
  state.onGround = true;
  if (!wasAirborne) return 0; // still rolling from before

  const sinkRate = Math.abs(Math.min(0, state.verticalSpeed));
  const onStrip = onRunway(state.x, state.z);
  if (!state.gearDown) return crash(state, 'A belly landing tore the aircraft apart. The gear was up.');
  if (sinkRate > 11) return crash(state, `A ${Math.round(sinkRate * 3.281)} ft/min arrival smashed the gear.`);
  if (!onStrip && state.speed > 52) return crash(state, 'Too fast to put down in rough country.');
  if (!onStrip) {
    state.damage += 18;
    say(state, 'ROUGH FIELD LANDING — AIRFRAME BENT, ROLL HER BACK TO THE STRIP', 4);
    if (state.damage >= 100) return crash(state, 'One rough landing too many: the airframe gave up.');
    return 0;
  }
  // A proper runway touchdown: graded on sink, speed and the centreline.
  const centre = Math.abs(state.x - RUNWAY.x);
  let grade = 'SMOOTH';
  if (sinkRate > 6.5 || state.speed > 46 || centre > 15) grade = 'FIRM';
  if (sinkRate > 9 || state.speed > 55 || centre > 20) grade = 'HARD';
  state.landingGrade = grade;
  if (state.phase === PHASE_RETURN) {
    const centreBonus = Math.max(0, (RUNWAY.width / 2 - centre) / (RUNWAY.width / 2));
    const touchBonus = grade === 'SMOOTH' ? 1 : grade === 'FIRM' ? 0.6 : 0.3;
    const timeBonus = Math.max(0, Math.round((COURSE.parSeconds - state.clock) * COURSE.timeBonusPerSecond));
    state.score += Math.round(COURSE.landingBonus * (0.45 * centreBonus + 0.55 * touchBonus)) + timeBonus;
    state.phase = PHASE_DONE;
    state.stopped = true;
    say(state, '', 0);
    return EVENT_LANDED;
  }
  say(state, `${grade} TOUCHDOWN — THROTTLE UP AND GO AROUND, OR BRAKE (B) AND TAXI BACK`, 3.6);
  return EVENT_LANDED;
}

/** End the sortie in wreckage, with the reason the report will carry. */
function crash(state, reason) {
  state.phase = PHASE_CRASHED;
  state.crashReason = reason;
  state.damage = 100;
  state.speed = 0;
  return EVENT_CRASHED;
}
