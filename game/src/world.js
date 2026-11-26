// world.js — the valley the race is flown in: terrain height, the lake, the town, the forests,
// the runway and the ten-ring course. Pure data and pure functions; the renderer asks, this
// module answers. The valley is grown from a fixed seed, so it is the same on every visit.

import { makeRng, range, smoothstep } from './random.js';

/** The runway: a flat strip on the valley floor, pointing north (heading 000). */
export const RUNWAY = {
  x: 0,
  zSouth: 170,
  zNorth: -1180,
  width: 46,
  /** Parked start position, near the south threshold, facing north. */
  start: { x: 0, z: 96 },
};

/** The lake in the south-west bowl of the valley; its shore is where the terrain dips under. */
export const LAKE = { x: -1750, z: 1550, rx: 1180, rz: 780, waterY: 1.4 };

/** The town east of the runway: a grid of blocks a pilot can recognise from the air. */
export const TOWN = { x: 980, z: 1050, radius: 430 };

/** Gaussian hills: centre, height in metres, radius in metres. */
const HILLS = [
  { x: 2650, z: -2650, h: 440, r: 1500 },
  { x: -2550, z: -950, h: 215, r: 1150 },
  { x: 2350, z: 2550, h: 175, r: 1050 },
  { x: -750, z: -3500, h: 270, r: 1250 },
  { x: 3500, z: 350, h: 155, r: 950 },
  { x: -3400, z: 2150, h: 195, r: 1150 },
  { x: 800, z: -2900, h: 120, r: 800 },
];

/** Distance from a point to the runway rectangle (0 when inside it). */
function runwayDistance(x, z) {
  const dx = Math.max(Math.abs(x) - 130, 0);
  const dz = Math.max(RUNWAY.zNorth - 190 - z, 0, z - (RUNWAY.zSouth + 190));
  return Math.hypot(dx, dz);
}

/** How deep inside the lake ellipse a point sits: 1 at the centre, 0 on the shore. */
function lakeDepth(x, z) {
  const lx = (x - LAKE.x) / LAKE.rx;
  const lz = (z - LAKE.z) / LAKE.rz;
  return 1 - (lx * lx + lz * lz);
}

/**
 * The height of the ground at (x, z), in metres. Rolling grass with real hills, a bowl scooped
 * out for the lake, and the ground pressed flat where people build: the runway strip and the
 * town. The flight model and the renderer both read the world through this one function.
 */
export function terrainHeight(x, z) {
  let h = 7
    + 11 * Math.sin(x * 0.0011 + 1.7) * Math.cos(z * 0.00093 + 0.4)
    + 6 * Math.sin(x * 0.0041) * Math.sin(z * 0.0034 + 0.6)
    + 3 * Math.sin(x * 0.013 + 4.0) * Math.cos(z * 0.011);
  for (const hill of HILLS) {
    const dx = x - hill.x;
    const dz = z - hill.z;
    const d2 = (dx * dx + dz * dz) / (hill.r * hill.r);
    if (d2 < 4.5) h += hill.h * Math.exp(-d2 * 1.55);
  }
  const depth = lakeDepth(x, z);
  if (depth > -0.35) {
    const shore = smoothstep(-0.35, 0.25, depth);
    h = h * (1 - shore) + -5 * shore;
  }
  const flat = smoothstep(30, 320, runwayDistance(x, z));
  h *= 0.04 + 0.96 * flat;
  const townD = Math.hypot(x - TOWN.x, z - TOWN.z);
  const townFlat = smoothstep(TOWN.radius * 0.55, TOWN.radius * 1.25, townD);
  h = h * (0.12 + 0.88 * townFlat) + 2.5 * (1 - townFlat);
  return h;
}

/** True when (x, z) is on the runway strip itself, where a landing can count. */
export function onRunway(x, z) {
  return Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 && z >= RUNWAY.zNorth && z <= RUNWAY.zSouth;
}

/** The ten rings of the course, in the order they are flown, each with the way it faces. */
export const RINGS = buildCourse();

function buildCourse() {
  const points = [
    { x: 0, y: 95, z: -950 },
    { x: -380, y: 125, z: -1750 },
    { x: -860, y: 155, z: -2450 },
    { x: -520, y: 135, z: -3250 },
    { x: 330, y: 165, z: -3650 },
    { x: 1150, y: 145, z: -3050 },
    { x: 1560, y: 120, z: -2150 },
    { x: 1240, y: 100, z: -1250 },
    { x: 560, y: 85, z: -620 },
    { x: 60, y: 60, z: -260 },
  ];
  return points.map((point, index) => {
    const prev = index === 0 ? { x: RUNWAY.start.x, y: 40, z: RUNWAY.start.z } : points[index - 1];
    const dx = point.x - prev.x;
    const dy = point.y - prev.y;
    const dz = point.z - prev.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { ...point, radius: 27, nx: dx / len, ny: dy / len, nz: dz / len };
  });
}

/** A tree planted by the world builder: position and crown size. */
function growForests() {
  const rng = makeRng(20261126);
  const trees = [];
  for (let i = 0; i < 2600 && trees.length < 780; i += 1) {
    const x = range(rng, -5200, 5200);
    const z = range(rng, -5200, 5200);
    const h = terrainHeight(x, z);
    if (h < 4 || h > 190) continue;
    if (runwayDistance(x, z) < 120) continue;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.radius + 60) continue;
    if (lakeDepth(x, z) > -0.05) continue;
    trees.push({ x, z, h, size: range(rng, 7, 13), shade: rng() });
  }
  return trees;
}

/** The town's buildings: flat-roofed blocks on a jittered grid, plus the airfield's own. */
function buildTown() {
  const rng = makeRng(977351);
  const buildings = [];
  for (let gx = -3; gx <= 3; gx += 1) {
    for (let gz = -2; gz <= 2; gz += 1) {
      if (rng() < 0.18) continue;
      buildings.push({
        x: TOWN.x + gx * 118 + range(rng, -22, 22),
        z: TOWN.z + gz * 118 + range(rng, -22, 22),
        w: range(rng, 44, 74),
        d: range(rng, 44, 74),
        h: range(rng, 16, 58),
        tone: rng(),
      });
    }
  }
  // The airfield: a hangar and a control tower east of the runway, and a windsock by the threshold.
  buildings.push({ x: 150, z: -260, w: 90, d: 46, h: 17, tone: 0.9, hangar: true });
  buildings.push({ x: 168, z: -60, w: 16, d: 16, h: 40, tone: 0.55, tower: true });
  return buildings;
}

/** Clouds: soft billboards drifting high above the valley. */
function seedClouds() {
  const rng = makeRng(5150);
  const clouds = [];
  for (let i = 0; i < 30; i += 1) {
    clouds.push({
      x: range(rng, -5600, 5600),
      z: range(rng, -5600, 5600),
      y: range(rng, 470, 760),
      size: range(rng, 150, 340),
      puff: rng(),
    });
  }
  return clouds;
}

/** Everything the renderer draws that is not terrain: trees, buildings, clouds. */
export const SCENERY = {
  trees: growForests(),
  buildings: buildTown(),
  clouds: seedClouds(),
};
