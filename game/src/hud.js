// hud.js — everything painted over the world: the instrument panel a pilot actually flies by
// (airspeed, altitude, heading tape, attitude indicator, throttle, fuel, gear and damage),
// the race director's messages, and the title, pause and report screens.

import { clamp, deg, rad } from './random.js';
import { RINGS } from './world.js';
import {
  PHASE_CRASHED,
  PHASE_DONE,
  PHASE_RETURN,
  PHASE_RINGS,
  altitudeFeet,
  headingDeg,
  speedKnots,
} from './flight.js';

const INK = '#eaf4ea';
const PANEL = 'rgba(10,18,14,0.62)';
const AMBER = '#ffb400';
const GREEN = '#57e389';
const RED = '#ff5a4e';

/** Create the HUD bound to the same canvas the renderer draws on. */
export function createHud(canvas) {
  const ctx = canvas.getContext('2d');

  function box(x, y, w, h) {
    ctx.fillStyle = PANEL;
    ctx.strokeStyle = 'rgba(160,220,170,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 7);
    ctx.fill();
    ctx.stroke();
  }

  function label(x, y, text, size, color = 'rgba(190,225,195,0.85)', align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }

  function value(x, y, text, size, color = INK, align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px "Consolas", "SF Mono", monospace`;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  }

  /** A horizontal gauge: a labelled bar with a coloured fill and a numeric readout. */
  function gauge(x, y, w, text, fraction, readout, color) {
    label(x, y - 5, text, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, 9, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w * clamp(fraction, 0, 1), 9, 4);
    ctx.fill();
    label(x + w + 8, y + 9, readout, 12, INK);
  }

  /** The heading tape along the top: a sliding compass ribbon with the bug in the middle. */
  function headingTape(state, W) {
    const cx = W / 2;
    box(cx - 170, 12, 340, 40);
    const hdg = headingDeg(state);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 166, 14, 332, 36);
    ctx.clip();
    for (let d = -60; d <= 60; d += 5) {
      const at = Math.round(hdg / 5) * 5 + d;
      const x = cx + (at - hdg) * 4.4;
      const norm = ((at % 360) + 360) % 360;
      ctx.strokeStyle = 'rgba(220,240,220,0.7)';
      ctx.beginPath();
      ctx.moveTo(x, 44);
      ctx.lineTo(x, norm % 30 === 0 ? 34 : 39);
      ctx.stroke();
      if (norm % 30 === 0) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        label(x, 30, names[norm] || String(norm / 10).padStart(2, '0'), 12, INK, 'center');
      }
    }
    ctx.restore();
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(cx, 52);
    ctx.lineTo(cx - 6, 60);
    ctx.lineTo(cx + 6, 60);
    ctx.closePath();
    ctx.fill();
    value(cx, 76, `${String(Math.round(hdg)).padStart(3, '0')}°`, 15, AMBER, 'center');
  }

  /** The attitude indicator: a little gyro horizon that rolls and pitches with the aircraft. */
  function attitude(state, x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-state.roll);
    const pitchPx = clamp(state.pitch, rad(-30), rad(30)) * (r / rad(30)) * 0.9;
    ctx.fillStyle = '#3f7fbf';
    ctx.fillRect(-r, -r, r * 2, r + pitchPx);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r, pitchPx, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r, pitchPx);
    ctx.lineTo(r, pitchPx);
    ctx.stroke();
    for (const p of [-20, -10, 10, 20]) {
      const yy = pitchPx - p * (r / 30) * 0.9;
      const w = p % 20 === 0 ? r * 0.36 : r * 0.22;
      ctx.beginPath();
      ctx.moveTo(-w, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#d8e6d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // The fixed aircraft symbol in the middle.
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.62, y);
    ctx.lineTo(x - r * 0.18, y);
    ctx.lineTo(x - r * 0.18, y + r * 0.16);
    ctx.moveTo(x + r * 0.62, y);
    ctx.lineTo(x + r * 0.18, y);
    ctx.lineTo(x + r * 0.18, y + r * 0.16);
    ctx.stroke();
    ctx.fillStyle = AMBER;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }

  /** The full instrument layout, flown in every screenshot and every second of play. */
  function drawInstruments(state, W, H) {
    headingTape(state, W);
    // Airspeed, bottom left, with the throttle under it.
    box(16, H - 118, 168, 102);
    label(28, H - 92, 'AIRSPEED · KT', 11);
    value(28, H - 58, String(speedKnots(state)), 40);
    gauge(28, H - 40, 108, 'THROTTLE', state.throttle, `${Math.round(state.throttle * 100)}%`, GREEN);
    // Altitude and vertical speed, bottom right.
    box(W - 184, H - 118, 168, 102);
    label(W - 172, H - 92, 'ALTITUDE · FT', 11);
    value(W - 172, H - 58, String(altitudeFeet(state)), 40);
    const vs = Math.round(state.verticalSpeed * 196.85);
    label(W - 172, H - 30, `VERT SPEED ${vs > 0 ? '+' : ''}${vs} FT/MIN`, 12, vs < -700 ? RED : 'rgba(190,225,195,0.9)');
    // Attitude, centre bottom.
    attitude(state, W / 2, H - 62, 44);
    // The race panel, top left: phase, rings, score, clock, fuel and the airframe's health.
    box(16, 12, 218, 142);
    label(28, 36, phaseTitle(state), 13, AMBER);
    label(28, 59, `RINGS  ${state.ringsFlown} / ${RINGS.length}`, 14, INK);
    label(28, 81, `SCORE  ${state.score}`, 14, INK);
    label(28, 103, `TIME   ${formatClock(state.clock)}`, 14, INK);
    gauge(28, 126, 118, 'FUEL', state.fuel / 100, `${Math.round(state.fuel)}`, state.fuel < 22 ? RED : GREEN);
    // Gear and damage, top right.
    box(W - 196, 12, 180, 76);
    label(W - 184, 38, 'GEAR', 11);
    value(W - 128, 39, state.gearDown ? 'DOWN' : 'UP', 15, state.gearDown ? GREEN : AMBER);
    label(W - 184, 66, 'HULL', 11);
    gauge(W - 128, 58, 74, '', 1 - state.damage / 100, `${Math.max(0, Math.round(100 - state.damage))}%`, state.damage > 55 ? RED : GREEN);
    // Warnings and the race director's voice.
    if (!state.onGround && state.speed < 27 && state.phase !== PHASE_DONE) {
      label(W / 2, 108, 'STALL', 22, RED, 'center');
    }
    if (state.message && state.messageT > 0) {
      ctx.font = '700 19px "Segoe UI", system-ui, sans-serif';
      const w = ctx.measureText(state.message).width + 36;
      box(W / 2 - w / 2, 122, w, 34);
      label(W / 2, 146, state.message, 19, state.ringFlashT > 0 ? AMBER : INK, 'center');
    }
    if (state.ringFlashT > 0) {
      label(W / 2, H * 0.34, '+100', 44, `rgba(255,180,0,${clamp(state.ringFlashT, 0, 1)})`, 'center');
    }
  }

  function phaseTitle(state) {
    switch (state.phase) {
      case PHASE_RINGS: return `FLY THE COURSE — RING ${state.nextRing + 1}`;
      case PHASE_RETURN: return 'COURSE DONE — LAND AT HOME';
      case PHASE_DONE: return 'SORTIE COMPLETE';
      case PHASE_CRASHED: return 'SORTIE LOST';
      default: return 'TAKE OFF — FULL THROTTLE (W)';
    }
  }

  function formatClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function centrePanel(W, H, title, titleColor, lines) {
    ctx.fillStyle = 'rgba(6,12,10,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(620, W - 60);
    const h = 118 + lines.length * 27;
    box(W / 2 - w / 2, H / 2 - h / 2, w, h);
    label(W / 2, H / 2 - h / 2 + 52, title, 30, titleColor, 'center');
    lines.forEach((line, i) => {
      label(W / 2, H / 2 - h / 2 + 92 + i * 27, line, 15, 'rgba(230,242,230,0.92)', 'center');
    });
  }

  /** Draw the HUD for this frame; `screen` says which overlay, if any, sits on top. */
  function draw(state, screen, W, H) {
    drawInstruments(state, W, H);
    if (screen === 'title') {
      centrePanel(W, H, 'RING RUNNER AIR RACE', AMBER, [
        'Take off from the valley strip, race all ten gold rings over the hills,',
        'then bring her home and land on the runway. Fuel and hull are finite.',
        '',
        'STEER  Arrow keys or mouse      THROTTLE  W / S  (or Shift / Ctrl)',
        'GEAR  G      BRAKES  B or Space      PAUSE  P      RESTART  R',
        '',
        'Press ENTER or click to line up on the runway',
      ]);
    } else if (screen === 'paused') {
      centrePanel(W, H, 'PAUSED', INK, ['Press P to fly on']);
    } else if (screen === 'over') {
      centrePanel(W, H, 'CRASHED', RED, [
        state.crashReason,
        `Rings flown: ${state.ringsFlown} of ${RINGS.length} · Score ${state.score}`,
        '',
        'Press R to walk away and fly again',
      ]);
    } else if (screen === 'done') {
      centrePanel(W, H, 'HOME SAFE', GREEN, [
        `Touchdown graded ${state.landingGrade} — the valley applauds.`,
        `Rings ${state.ringsFlown}/${RINGS.length} · Air time ${formatClock(state.airTime)} · Fuel left ${Math.round(state.fuel)}%`,
        `FINAL SCORE  ${state.score}`,
        '',
        'Press R to fly the course again',
      ]);
    }
  }

  return { draw };
}
