// config.js — the numbers that tune Ring Runner Air Race: field, aircraft and course.
// Everything the other modules need to agree on lives here, so the feel of the game can be
// retuned in one place.

/** Fixed simulation step, in seconds: the flight model always advances in these slices. */
export const STEP = 1 / 120;

/** Canvas-friendly view: vertical field of view of the chase camera, in degrees. */
export const FOV_DEGREES = 63;

/** How far the world is drawn, in metres; past this the fog takes over. */
export const VIEW_DISTANCE = 2900;

/** The aircraft: speeds in metres a second, rates in radians a second. */
export const PLANE = {
  /** Weight of the airframe on the ground: the fuselage sits this far above the surface. */
  gearHeight: 1.7,
  /** Throttle at spawn, parked at the south end of the runway. */
  startThrottle: 0,
  /** Full-throttle acceleration before drag, metres a second squared. */
  thrust: 15.5,
  /** Speed where drag balances full thrust in level flight. */
  maxSpeed: 96,
  /** Below this speed the wing stops holding the nose up. */
  stallSpeed: 27,
  /** Best climb is flown near this speed. */
  bestClimbSpeed: 42,
  /** How fast the pilot can roll the aircraft, radians a second at full stick. */
  rollRate: 1.9,
  /** How fast the pilot can pitch the aircraft, radians a second at full stick. */
  pitchRate: 0.85,
  /** Structural limit: past this speed the airframe takes stress damage. */
  overspeed: 92,
};

/** The course: ten rings, each worth this many points, plus a landing bonus. */
export const COURSE = {
  ringPoints: 100,
  /** Extra points a second under par when the sortie is complete. */
  parSeconds: 300,
  timeBonusPerSecond: 2,
  /** Landing quality: a gentle touchdown on the centreline earns up to this. */
  landingBonus: 300,
};

/** Fuel: a full tank, and how fast each throttle setting drinks it (units a second). */
export const FUEL = {
  capacity: 100,
  burnAtFullThrottle: 0.62,
  burnAtIdle: 0.05,
};
