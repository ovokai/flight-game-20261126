// render.js — the eye of the game: a hand-rolled perspective renderer on a 2D canvas.
// A chase camera follows the aircraft; the valley is drawn as coloured terrain strips with
// the lake, the town, the forests and the runway laid over them, the ring course hung in the
// air, and the aircraft itself painted in the centre of the frame, where a chase view keeps it.

import { FOV_DEGREES, VIEW_DISTANCE } from './config.js';
import { clamp, rad, smoothstep } from './random.js';
import { LAKE, RINGS, RUNWAY, SCENERY, terrainHeight } from './world.js';
import { forwardVector } from './flight.js';

const SKY_TOP = '#2f6db4';
const SKY_HORIZON = '#cfe3ef';
const FOG = { r: 207, g: 227, b: 239 };
const SUN_DIR = norm({ x: 0.42, y: 0.34, z: -0.84 });

function norm(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgb(c) {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function hexColor(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Create the renderer bound to a canvas; call draw(state) once a frame. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let focal = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    W = Math.floor(canvas.clientWidth * dpr);
    H = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    focal = H / 2 / Math.tan(rad(FOV_DEGREES) / 2);
  }

  /** The chase camera for this frame, derived purely from the aircraft's state. */
  function cameraFor(state) {
    const fwd = forwardVector(state);
    const pos = {
      x: state.x - fwd.x * 30,
      y: state.y - fwd.y * 30 + 6.8,
      z: state.z - fwd.z * 30,
    };
    const target = {
      x: state.x + fwd.x * 42,
      y: state.y + fwd.y * 42 + 0.6,
      z: state.z + fwd.z * 42,
    };
    const f = norm({ x: target.x - pos.x, y: target.y - pos.y, z: target.z - pos.z });
    // Right is cross(forward, world up); up is then rebuilt orthogonal to both.
    const r = norm(cross(f, { x: 0, y: 1, z: 0 }));
    let u = cross(r, f);
    // The camera banks with the aircraft, but only part of the way: the world tilts, the
    // aircraft stays nearly upright in frame, and the horizon reads the turn.
    const a = -state.roll * 0.55;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rr = { x: r.x * ca + u.x * sa, y: r.y * ca + u.y * sa, z: r.z * ca + u.z * sa };
    const uu = { x: u.x * ca - r.x * sa, y: u.y * ca - r.y * sa, z: u.z * ca - r.z * sa };
    return { pos, f, r: rr, u: uu };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  /** Project a world point; returns screen x/y and the point scale, or null behind the camera. */
  function project(cam, p) {
    const dx = p.x - cam.pos.x;
    const dy = p.y - cam.pos.y;
    const dz = p.z - cam.pos.z;
    const cz = dx * cam.f.x + dy * cam.f.y + dz * cam.f.z;
    if (cz < 2.5) return null;
    const cx = dx * cam.r.x + dy * cam.r.y + dz * cam.r.z;
    const cy = dx * cam.u.x + dy * cam.u.y + dz * cam.u.z;
    const s = focal / cz;
    return { x: W / 2 + cx * s, y: H / 2 - cy * s, s, z: cz };
  }

  function drawSky(cam) {
    const far = { x: cam.pos.x + cam.f.x * 3000, y: cam.pos.y, z: cam.pos.z + cam.f.z * 3000 };
    const horizon = project(cam, far);
    const hy = horizon ? horizon.y : H * 0.42;
    const grad = ctx.createLinearGradient(0, hy - H * 0.75, 0, hy + H * 0.06);
    grad.addColorStop(0, SKY_TOP);
    grad.addColorStop(0.72, '#7db1dd');
    grad.addColorStop(1, SKY_HORIZON);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // The sun, low in the north-east, with a soft glow.
    const sun = project(cam, {
      x: cam.pos.x + SUN_DIR.x * 2700,
      y: cam.pos.y + SUN_DIR.y * 2700,
      z: cam.pos.z + SUN_DIR.z * 2700,
    });
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, H * 0.24);
      glow.addColorStop(0, 'rgba(255,244,200,0.85)');
      glow.addColorStop(0.25, 'rgba(255,238,180,0.35)');
      glow.addColorStop(1, 'rgba(255,238,180,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - H * 0.24, sun.y - H * 0.24, H * 0.48, H * 0.48);
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, Math.max(9, H * 0.016), 0, Math.PI * 2);
      ctx.fill();
    }
    return hy;
  }

  /** Ground colour for a patch of valley: shore, meadow, dry hill, rock and snow by height. */
  function groundColor(h, gx, gz, dist) {
    const lx = (gx - LAKE.x) / LAKE.rx;
    const lz = (gz - LAKE.z) / LAKE.rz;
    const onShore = lx * lx + lz * lz < 1.35 && h < LAKE.waterY + 2.6;
    let base;
    if (onShore) base = hexColor('#c9b586');
    else if (h < 42) base = hexColor('#6fae52');
    else if (h < 95) base = hexColor('#79a653');
    else if (h < 165) base = hexColor('#8b9a5f');
    else if (h < 300) base = hexColor('#8d8577');
    else base = hexColor('#eef3f4');
    const patch = Math.sin(gx * 0.021 + gz * 0.017) * Math.sin(gx * 0.006 - gz * 0.009);
    const shade = 1 + patch * 0.055;
    const fogT = smoothstep(1300, VIEW_DISTANCE, dist);
    return rgb(mix(
      { r: Math.min(255, base.r * shade), g: Math.min(255, base.g * shade), b: Math.min(255, base.b * shade) },
      FOG,
      fogT,
    ));
  }

  function drawTerrain(cam, horizonY) {
    // Underfill: the ground below the nearest strip (almost under the aircraft) is one flat
    // wash of the local colour, so no sky ever leaks through the bottom of the frame.
    const under = terrainHeight(cam.pos.x, cam.pos.z);
    ctx.fillStyle = groundColor(under, cam.pos.x, cam.pos.z, 40);
    ctx.fillRect(0, horizonY - 2, W, H - horizonY + 2);
    // Strips run away from the camera along its ground heading, sampled across their width.
    let gf = norm({ x: cam.f.x, y: 0, z: cam.f.z });
    if (Math.hypot(gf.x, gf.z) < 0.05) gf = { x: 0, y: 0, z: -1 };
    const gr = { x: -gf.z, y: 0, z: gf.x };
    const SEGMENTS = 14;
    let dNear = 7;
    let prev = null;
    for (let strip = 0; strip < 46 && dNear < VIEW_DISTANCE; strip += 1) {
      const dFar = dNear * 1.145 + 6;
      const row = [];
      for (const d of [dNear, dFar]) {
        const halfW = Math.min(3600, 240 + d * 1.3);
        const pts = [];
        for (let i = 0; i <= SEGMENTS; i += 1) {
          const t = (i / SEGMENTS) * 2 - 1;
          const gx = cam.pos.x + gf.x * d + gr.x * t * halfW;
          const gz = cam.pos.z + gf.z * d + gr.z * t * halfW;
          pts.push({ gx, gz, gy: terrainHeight(gx, gz) });
        }
        row.push(pts);
      }
      for (let i = 0; i < SEGMENTS; i += 1) {
        const a = row[0][i];
        const b = row[0][i + 1];
        const c = row[1][i + 1];
        const e = row[1][i];
        const pa = project(cam, { x: a.gx, y: a.gy, z: a.gz });
        const pb = project(cam, { x: b.gx, y: b.gy, z: b.gz });
        const pc = project(cam, { x: c.gx, y: c.gy, z: c.gz });
        const pe = project(cam, { x: e.gx, y: e.gy, z: e.gz });
        if (!pa || !pb || !pc || !pe) continue;
        const hAvg = (a.gy + b.gy + c.gy + e.gy) / 4;
        const midX = (a.gx + c.gx) / 2;
        const midZ = (a.gz + c.gz) / 2;
        ctx.fillStyle = groundColor(hAvg, midX, midZ, (dNear + dFar) / 2);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.lineTo(pe.x, pe.y);
        ctx.closePath();
        ctx.fill();
      }
      prev = row;
      dNear = dFar;
    }
    return prev;
  }

  function drawWater(cam) {
    const pts = [];
    for (let i = 0; i < 44; i += 1) {
      const a = (i / 44) * Math.PI * 2;
      const p = project(cam, {
        x: LAKE.x + Math.cos(a) * LAKE.rx,
        y: LAKE.waterY,
        z: LAKE.z + Math.sin(a) * LAKE.rz,
      });
      if (p) pts.push(p); // a shore point behind the camera simply chords across
    }
    if (pts.length < 3) return;
    const grad = ctx.createLinearGradient(0, H * 0.3, 0, H);
    grad.addColorStop(0, 'rgba(64,130,180,0.92)');
    grad.addColorStop(1, 'rgba(38,96,146,0.95)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawRunway(cam) {
    const hw = RUNWAY.width / 2;
    // The strip is drawn in segments along its length, so the part behind the camera (the
    // threshold you have already rolled past) never cancels the part ahead.
    ctx.fillStyle = '#3d4148';
    const SEG = 96;
    for (let z = RUNWAY.zSouth; z > RUNWAY.zNorth; z -= SEG) {
      const z2 = Math.max(RUNWAY.zNorth, z - SEG);
      const quad = [
        { x: RUNWAY.x - hw, y: 0.12, z },
        { x: RUNWAY.x + hw, y: 0.12, z },
        { x: RUNWAY.x + hw, y: 0.12, z: z2 },
        { x: RUNWAY.x - hw, y: 0.12, z: z2 },
      ].map((p) => project(cam, p));
      if (quad.some((p) => !p)) continue;
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Centreline dashes and threshold bars, each a true projected quad: a flat rectangle on
    // screen would smear into a slab when a dash passes close under the camera.
    ctx.fillStyle = '#e8e6da';
    const paintQuad = (pts) => {
      if (pts.some((p) => !p)) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    };
    for (let z = RUNWAY.zSouth - 60; z > RUNWAY.zNorth + 40; z -= 95) {
      paintQuad([
        project(cam, { x: RUNWAY.x - 0.75, y: 0.16, z }),
        project(cam, { x: RUNWAY.x + 0.75, y: 0.16, z }),
        project(cam, { x: RUNWAY.x + 0.75, y: 0.16, z: z - 34 }),
        project(cam, { x: RUNWAY.x - 0.75, y: 0.16, z: z - 34 }),
      ]);
    }
    for (const endZ of [RUNWAY.zSouth - 8, RUNWAY.zNorth + 8]) {
      for (let i = -3; i <= 3; i += 1) {
        if (i === 0) continue;
        const cx = RUNWAY.x + i * 3.1;
        paintQuad([
          project(cam, { x: cx - 1.05, y: 0.16, z: endZ - 7 }),
          project(cam, { x: cx + 1.05, y: 0.16, z: endZ - 7 }),
          project(cam, { x: cx + 1.05, y: 0.16, z: endZ + 7 }),
          project(cam, { x: cx - 1.05, y: 0.16, z: endZ + 7 }),
        ]);
      }
    }
    // Edge lights: a double row of amber dots a pilot lines up on at dusk.
    ctx.fillStyle = '#ffca6a';
    for (let z = RUNWAY.zSouth; z > RUNWAY.zNorth; z -= 118) {
      for (const side of [-1, 1]) {
        const p = project(cam, { x: RUNWAY.x + side * (hw + 3), y: 0.5, z });
        if (!p) continue;
        const r = clamp(p.s * 0.55, 0.7, 3.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBuilding(cam, b) {
    const base = terrainHeight(b.x, b.z);
    const hw = b.w / 2;
    const hd = b.d / 2;
    const corner = (dx, dz, y) => project(cam, { x: b.x + dx, y, z: b.z + dz });
    const b0 = corner(-hw, -hd, base);
    const b1 = corner(hw, -hd, base);
    const b2 = corner(hw, hd, base);
    const b3 = corner(-hw, hd, base);
    const t0 = corner(-hw, -hd, base + b.h);
    const t1 = corner(hw, -hd, base + b.h);
    const t2 = corner(hw, hd, base + b.h);
    const t3 = corner(-hw, hd, base + b.h);
    if (!b0 || !b1 || !b2 || !b3 || !t0 || !t1 || !t2 || !t3) return;
    const palette = ['#b3a58d', '#c0b198', '#a89a83', '#bcab90'];
    const side = palette[Math.floor(b.tone * 4) % 4];
    const face = (pts, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    };
    // Two walls facing the camera, then the roof; a tower gets a glass cab on top.
    const camEast = cam.pos.x > b.x;
    const camSouth = cam.pos.z > b.z;
    if (camEast) face([b1, b2, t2, t1], shadeOf(side, 0.88));
    else face([b3, b0, t0, t3], shadeOf(side, 0.88));
    if (camSouth) face([b2, b3, t3, t2], shadeOf(side, 0.74));
    else face([b0, b1, t1, t0], shadeOf(side, 0.74));
    face([t0, t1, t2, t3], b.hangar ? '#7d8a94' : shadeOf(side, 1.12));
    if (b.tower) {
      const cab = project(cam, { x: b.x, y: base + b.h + 3.4, z: b.z });
      if (cab) {
        ctx.fillStyle = '#274b5c';
        const w = Math.max(3, b.w * cab.s * 0.62);
        ctx.fillRect(cab.x - w / 2, cab.y - w * 0.3, w, w * 0.6);
      }
    }
  }

  function shadeOf(hex, factor) {
    const c = hexColor(hex);
    return rgb({
      r: clamp(Math.round(c.r * factor), 0, 255),
      g: clamp(Math.round(c.g * factor), 0, 255),
      b: clamp(Math.round(c.b * factor), 0, 255),
    });
  }

  function drawTree(cam, t) {
    const p = project(cam, { x: t.x, y: t.h, z: t.z });
    if (!p) return;
    const crown = t.size * p.s;
    if (crown < 1.1) return;
    ctx.fillStyle = 'rgba(74,52,32,1)';
    ctx.fillRect(p.x - crown * 0.05, p.y - crown * 0.4, crown * 0.1, crown * 0.42);
    ctx.fillStyle = t.shade > 0.5 ? '#2e6b2e' : '#35793a';
    ctx.beginPath();
    ctx.arc(p.x, p.y - crown * 0.72, crown * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(p.x - crown * 0.16, p.y - crown * 0.9, crown * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawScenery(cam, state) {
    const items = [];
    for (const t of SCENERY.trees) {
      const d = Math.hypot(t.x - state.x, t.z - state.z);
      if (d < VIEW_DISTANCE * 0.85) items.push({ d, kind: 'tree', o: t });
    }
    for (const b of SCENERY.buildings) {
      const d = Math.hypot(b.x - state.x, b.z - state.z);
      if (d < VIEW_DISTANCE * 0.9) items.push({ d, kind: 'building', o: b });
    }
    items.sort((a, b) => b.d - a.d);
    for (const item of items) {
      if (item.kind === 'tree') drawTree(cam, item.o);
      else drawBuilding(cam, item.o);
    }
    // Clouds drift above everything, drawn as soft overlapping puffs.
    for (const c of SCENERY.clouds) {
      const p = project(cam, { x: c.x, y: c.y, z: c.z });
      if (!p) continue;
      const w = c.size * p.s;
      if (w < 6) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      for (const [ox, oy, ow] of [[0, 0, 1], [-0.5, 0.1, 0.62], [0.52, 0.12, 0.58], [0.1, -0.16, 0.5]]) {
        ctx.beginPath();
        ctx.ellipse(p.x + ox * w, p.y + oy * w * 0.4, w * 0.5 * ow, w * 0.17 * ow, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRings(cam, state) {
    for (let i = RINGS.length - 1; i >= 0; i -= 1) {
      const ring = RINGS[i];
      const ringDist = Math.hypot(ring.x - state.x, ring.y - state.y, ring.z - state.z);
      if (ringDist > VIEW_DISTANCE) continue; // a speck on the horizon helps nobody
      const n = { x: ring.nx, y: ring.ny, z: ring.nz };
      let up = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      const u = norm(cross(n, up));
      const v = cross(u, n);
      const isNext = i === state.nextRing && (state.phase === 'rings' || state.phase === 'takeoff');
      const passed = i < state.nextRing;
      const pts = [];
      let visible = true;
      for (let k = 0; k < 30; k += 1) {
        const a = (k / 30) * Math.PI * 2;
        const p = project(cam, {
          x: ring.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * ring.radius,
          y: ring.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * ring.radius,
          z: ring.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * ring.radius,
        });
        if (!p) { visible = false; break; }
        pts.push(p);
      }
      if (!visible || pts.length === 0) continue;
      const centre = project(cam, ring);
      const tube = clamp((centre ? centre.s : 1) * ring.radius * 0.085, 1.2, 9);
      ctx.lineJoin = 'round';
      if (isNext) {
        ctx.strokeStyle = 'rgba(255,170,0,0.35)';
        ctx.lineWidth = tube * 2.6;
        strokePath(pts);
      }
      ctx.strokeStyle = passed ? 'rgba(64,200,110,0.85)' : isNext ? '#ffb400' : 'rgba(240,244,248,0.9)';
      ctx.lineWidth = tube;
      strokePath(pts);
      if (isNext && centre) {
        // A chevron over the live ring, so the pilot always knows the way.
        const bob = Math.sin(performance.now() / 300) * centre.s * 2.2;
        ctx.fillStyle = '#ffb400';
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y - ring.radius * centre.s - 16 + bob);
        ctx.lineTo(centre.x - 9, centre.y - ring.radius * centre.s - 30 + bob);
        ctx.lineTo(centre.x + 9, centre.y - ring.radius * centre.s - 30 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function strokePath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.stroke();
  }

  /** The aircraft, painted at the centre of the chase view: built, lit and banking. */
  function drawPlane(cam, state) {
    const anchor = project(cam, state);
    if (!anchor) return;
    // The shadow first: an ellipse on the ground that grows honest as she climbs.
    const groundY = terrainHeight(state.x, state.z);
    const shadow = project(cam, { x: state.x, y: groundY + 0.25, z: state.z });
    if (shadow && state.y - groundY < 260) {
      const sw = clamp(anchor.s * 15 * (1 - (state.y - groundY) / 340), 4, 90);
      ctx.fillStyle = `rgba(20,30,20,${clamp(0.4 - (state.y - groundY) / 700, 0.05, 0.4)})`;
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, sw, sw * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const s = anchor.s; // pixels per metre at the aircraft
    const cx = anchor.x;
    const cy = anchor.y + state.pitch * H * 0.12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-state.roll * 0.22);
    const m = s * 0.8; // one metre, in pixels, the airframe drawn a touch compact
    // Tailplane and fin, furthest from the eye.
    ctx.fillStyle = '#d8433a';
    poly([[-7.4 * m, -0.4 * m], [-4.6 * m, -0.9 * m], [-4.4 * m, 0.1 * m], [-7.2 * m, 0.5 * m]]);
    poly([[4.6 * m, -0.9 * m], [7.4 * m, -0.4 * m], [7.2 * m, 0.5 * m], [4.4 * m, 0.1 * m]]);
    poly([[-0.55 * m, -3.4 * m], [0.55 * m, -3.4 * m], [0.42 * m, -0.6 * m], [-0.42 * m, -0.6 * m]]);
    // Main wing: a long bar with dihedral, red tips.
    const wingGrad = ctx.createLinearGradient(0, -1.2 * m, 0, 1.2 * m);
    wingGrad.addColorStop(0, '#f2f0ea');
    wingGrad.addColorStop(1, '#cfd0cc');
    ctx.fillStyle = wingGrad;
    poly([[-10.6 * m, 0.55 * m], [-9.8 * m, -0.5 * m], [9.8 * m, -0.5 * m], [10.6 * m, 0.55 * m], [2 * m, 1.15 * m], [-2 * m, 1.15 * m]]);
    ctx.fillStyle = '#d8433a';
    poly([[-10.6 * m, 0.55 * m], [-9.8 * m, -0.5 * m], [-8.2 * m, -0.5 * m], [-8.6 * m, 0.55 * m]]);
    poly([[8.2 * m, -0.5 * m], [9.8 * m, -0.5 * m], [10.6 * m, 0.55 * m], [8.6 * m, 0.55 * m]]);
    // Fuselage: a rounded body seen from behind and above, with its cheatline.
    const bodyGrad = ctx.createLinearGradient(0, -3.2 * m, 0, 2.4 * m);
    bodyGrad.addColorStop(0, '#faf8f2');
    bodyGrad.addColorStop(0.75, '#e8e5da');
    bodyGrad.addColorStop(1, '#c9c6b8');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.55 * m, 2.6 * m, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8433a';
    ctx.fillRect(-1.55 * m, 0.55 * m, 3.1 * m, 0.5 * m);
    // The canopy, dark glass catching the sky.
    const glass = ctx.createLinearGradient(0, -2.6 * m, 0, -0.6 * m);
    glass.addColorStop(0, '#9fd4e8');
    glass.addColorStop(0.5, '#2c5d78');
    glass.addColorStop(1, '#17394e');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.ellipse(0, -1.55 * m, 1.02 * m, 1.25 * m, 0, 0, Math.PI * 2);
    ctx.fill();
    // The propeller's ghost disc ahead of the nose and its spinner.
    if (state.throttle > 0.03 || state.speed > 4) {
      ctx.fillStyle = 'rgba(230,235,238,0.20)';
      ctx.beginPath();
      ctx.ellipse(0, -2.95 * m, 2.5 * m, 0.5 * m, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#33383d';
    ctx.beginPath();
    ctx.ellipse(0, -2.8 * m, 0.42 * m, 0.5 * m, 0, 0, Math.PI * 2);
    ctx.fill();
    // Gear: legs and wheels when down, doors shut when up.
    if (state.gearDown) {
      ctx.strokeStyle = '#3a3f45';
      ctx.lineWidth = Math.max(1.2, 0.22 * m);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 1.1 * m, 1.6 * m);
        ctx.lineTo(side * 2.2 * m, 3.1 * m);
        ctx.stroke();
        ctx.fillStyle = '#191c1f';
        ctx.beginPath();
        ctx.arc(side * 2.2 * m, 3.35 * m, 0.62 * m, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#191c1f';
      ctx.beginPath();
      ctx.arc(0, 3.6 * m, 0.5 * m, 0, Math.PI * 2);
      ctx.fill();
    }
    // Navigation lights: red to port, green to starboard, white astern.
    light(-10.5 * m, 0.1 * m, '#ff4444');
    light(10.5 * m, 0.1 * m, '#44ff77');
    light(0, 2.6 * m, '#ffffff');
    ctx.restore();

    function poly(points) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    function light(x, y, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.4, 0.24 * m), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Draw one whole frame: sky, valley, course, aircraft. The HUD is hud.js's job. */
  function draw(state) {
    resize();
    const cam = cameraFor(state);
    const horizonY = drawSky(cam);
    drawTerrain(cam, horizonY);
    drawWater(cam);
    drawRunway(cam);
    drawScenery(cam, state);
    drawRings(cam, state);
    drawPlane(cam, state);
    // A whisper of vignette, so the frame feels photographed rather than rendered flat.
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    vig.addColorStop(0, 'rgba(10,16,24,0)');
    vig.addColorStop(1, 'rgba(10,16,24,0.20)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    return { width: W, height: H };
  }

  return { draw, resize };
}
