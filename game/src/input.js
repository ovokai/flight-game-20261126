// input.js — the pilot's hands: keyboard and mouse gathered into one control picture the
// flight model reads. Arrow keys (or the mouse) work pitch and roll, W/S or Shift/Ctrl work
// the throttle, and the one-shot keys — gear, brake, restart — are latched for the page.

/** Create the input state and wire it to the window's keyboard and mouse events. */
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    pitch: 0, // -1 nose down .. 1 nose up
    roll: 0, // -1 bank left .. 1 bank right
    yaw: 0, // rudder, from A/D
    throttleDelta: 0, // -1 idle .. 1 full, applied as a rate
    brake: false,
    /** One-shot requests, consumed by the page each frame. */
    pressed: new Set(),
    mouse: { x: 0, y: 0, seen: false },
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyG') input.pressed.add('gear');
    if (event.code === 'Enter') input.pressed.add('start');
    if (event.code === 'KeyR') input.pressed.add('restart');
    if (event.code === 'KeyP' || event.code === 'Escape') input.pressed.add('pause');
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    input.mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    input.mouse.seen = true;
  });
  canvas.addEventListener('mousedown', () => input.pressed.add('start'));

  /** Recompute the continuous controls from the keys currently held and the mouse. */
  input.poll = function poll() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp')) pitch += 1;
    if (keys.has('ArrowDown')) pitch -= 1;
    if (keys.has('ArrowLeft')) roll -= 1;
    if (keys.has('ArrowRight')) roll += 1;
    if (pitch === 0 && roll === 0 && input.mouse.seen) {
      // The mouse steers when the keys are quiet: right of centre banks right, low climbs.
      roll = clampUnit(input.mouse.x * 1.15);
      pitch = clampUnit(-input.mouse.y * 0.9);
    }
    input.pitch = pitch;
    input.roll = roll;
    input.yaw = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    input.throttleDelta = 0;
    if (keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight')) input.throttleDelta += 1;
    if (keys.has('KeyS') || keys.has('ControlLeft') || keys.has('ControlRight')) input.throttleDelta -= 1;
    input.brake = keys.has('KeyB') || keys.has('Space');
    return input;
  };
  return input;
}

function clampUnit(value) {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Take a one-shot request ('gear', 'start', 'restart', 'pause') if it was pressed. */
export function consume(input, name) {
  if (!input.pressed.has(name)) return false;
  input.pressed.delete(name);
  return true;
}
