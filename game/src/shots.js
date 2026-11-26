// shots.js — the screenshot scenes behind ?shot=takeoff|rings|overlook|approach.
// Each one places the aircraft in a real, reachable moment of a sortie — on the runway at
// rotation speed, banked onto a gold ring, high over the lake and town, and on final approach
// with the course complete — then lets the ordinary renderer and HUD paint it. Nothing here
// draws anything itself: a screenshot is the game, caught mid-flight.

import { createFlight } from './flight.js';
import { RINGS, RUNWAY } from './world.js';
import { rad } from './random.js';

/** Point the aircraft from one place toward another, the way a pilot lines up on a ring. */
function aim(state, from, to, extra = {}) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  state.x = from.x;
  state.y = from.y;
  state.z = from.z;
  state.heading = Math.atan2(dx, -dz);
  state.pitch = Math.atan2(to.y - from.y, Math.hypot(dx, dz));
  Object.assign(state, extra);
  return state;
}

/**
 * Build the named scene's flight state. Unknown names give the takeoff roll, the cover shot.
 */
export function stageShot(name) {
  const state = createFlight();
  switch (name) {
    case 'rings': {
      // Second ring in the bag, banking right onto the third, over the western hills.
      const target = RINGS[2];
      aim(state, { x: target.x + 210, y: target.y + 16, z: target.z + 330 }, target, {
        speed: 56, throttle: 0.82, gearDown: false, onGround: false,
        roll: rad(24), phase: 'rings', nextRing: 2, ringsFlown: 2, score: 200,
        clock: 74, airTime: 74, started: true, fuel: 88,
      });
      state.message = '';
      return state;
    }
    case 'overlook': {
      // High over the valley's heart: the lake spread out ahead, hills on the horizon.
      aim(state, { x: 300, y: 400, z: 3100 }, { x: -1600, y: 60, z: -200 }, {
        speed: 63, throttle: 0.66, gearDown: false, onGround: false,
        roll: rad(-9), phase: 'rings', nextRing: 4, ringsFlown: 4, score: 400,
        clock: 150, airTime: 150, started: true, fuel: 70,
      });
      state.message = '';
      return state;
    }
    case 'approach': {
      // The course complete, gear down, on final for the home runway from the south.
      aim(state, { x: 26, y: 46, z: 905 }, { x: 0, y: 2, z: RUNWAY.zSouth }, {
        speed: 35, throttle: 0.34, gearDown: true, onGround: false,
        roll: rad(2), phase: 'return', nextRing: RINGS.length, ringsFlown: RINGS.length,
        score: 1000, clock: 243, airTime: 243, started: true, fuel: 41,
      });
      state.message = 'COURSE COMPLETE — BRING HER HOME AND LAND';
      state.messageT = 99;
      return state;
    }
    default: {
      // Takeoff: rolling down the strip at rotation speed, the first ring waiting ahead.
      Object.assign(state, {
        z: -336, speed: 46, throttle: 1, pitch: rad(5), gearDown: true,
        phase: 'takeoff', fuel: 99,
      });
      state.message = 'FULL THROTTLE — ROTATE AT 90 KT';
      state.messageT = 99;
      return state;
    }
  }
}
