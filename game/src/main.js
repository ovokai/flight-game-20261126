// main.js — the page itself: it owns the canvas, the clock and the screens, and it wires
// input, flight, renderer and HUD together. In play it runs the simulation in fixed steps
// behind requestAnimationFrame; behind ?shot=<name> it stages one scene, paints it twice and
// raises window.__shotReady so a screenshot can be taken of the game's own rendering.

import { STEP } from './config.js';
import { consume, createInput } from './input.js';
import {
  EVENT_CRASHED,
  EVENT_LANDED,
  PHASE_CRASHED,
  PHASE_DONE,
  createFlight,
  stepFlight,
  toggleGear,
} from './flight.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(canvas);
const input = createInput(canvas);
const params = new URLSearchParams(location.search);
const shot = params.get('shot');

let flight = createFlight();
let screen = 'title'; // title | play | paused | over | done
let accumulator = 0;
let lastTime = performance.now();

/** Say a line aloud for screen readers, the same line the HUD shows sighted pilots. */
function announce(text) {
  if (status && text) status.textContent = text;
}

function startSortie() {
  flight = createFlight();
  screen = 'play';
  announce('On the runway. Full throttle with W, rotate with the up arrow.');
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  if (screen === 'play') {
    input.poll();
    if (consume(input, 'gear')) toggleGear(flight);
    accumulator += dt;
    while (accumulator >= STEP) {
      const events = stepFlight(flight, input, STEP);
      accumulator -= STEP;
      if (events & EVENT_CRASHED) {
        screen = 'over';
        announce(`Crashed. ${flight.crashReason}`);
        break;
      }
      if ((events & EVENT_LANDED) && flight.phase === PHASE_DONE) {
        screen = 'done';
        announce(`Home safe. Final score ${flight.score}.`);
        break;
      }
    }
  } else {
    if (consume(input, 'start') && (screen === 'title')) startSortie();
    if (consume(input, 'restart') && (screen === 'over' || screen === 'done')) startSortie();
  }
  if (consume(input, 'pause')) {
    if (screen === 'play') screen = 'paused';
    else if (screen === 'paused') screen = 'play';
  }
  if (consume(input, 'restart') && screen === 'play') startSortie();
  const { width, height } = renderer.draw(flight);
  hud.draw(flight, screen === 'play' ? '' : screen, width, height);
  requestAnimationFrame(frame);
}

if (shot) {
  // A staged scene, painted by the same code that paints the game, then held for the camera.
  flight = stageShot(shot);
  renderer.draw(flight);
  const { width, height } = renderer.draw(flight);
  hud.draw(flight, '', width, height);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
