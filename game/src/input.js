// Storm Runner — input: keyboard state plus mouse clicks on menu buttons.
// The game reads a fresh snapshot every frame; menus consume clicks.
export function createInput(canvas) {
  const keys = new Set();
  let mouse = { x: -1, y: -1, clicked: false, down: false };
  let actions = 0;

  const ACTION_CONFIRM = 1;
  const ACTION_PAUSE = 2;
  const ACTION_GEAR = 4;
  const ACTION_DROP = 8;
  const ACTION_CAMERA = 16;

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.key.toLowerCase());
    if (e.key === ' ' || e.key === 'Enter') actions |= ACTION_CONFIRM;
    if (e.key.toLowerCase() === 'p' || e.key === 'Escape') actions |= ACTION_PAUSE;
    if (e.key.toLowerCase() === 'g') actions |= ACTION_GEAR;
    if (e.key.toLowerCase() === 'c') actions |= ACTION_DROP;
    if (e.key.toLowerCase() === 'v') actions |= ACTION_CAMERA;
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  }
  function onMouseDown(e) {
    onMouseMove(e);
    mouse.down = true;
    mouse.clicked = true;
  }
  function onMouseUp() { mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  function read() {
    const down = (k) => keys.has(k);
    return {
      // Throttle: Shift up, Ctrl down (or R / F as a fallback).
      throttleUp: down('shift') || down('r'),
      throttleDown: down('control') || down('f'),
      // Pitch: W / Up climbs, S / Down dives.
      pitchUp: down('w') || down('arrowup'),
      pitchDown: down('s') || down('arrowdown'),
      // Bank: A / Left banks left, D / Right banks right.
      bankLeft: down('a') || down('arrowleft'),
      bankRight: down('d') || down('arrowright'),
      gear: down('g'),
    };
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  function takeClick() {
    const c = mouse.clicked;
    mouse.clicked = false;
    return c ? { x: mouse.x, y: mouse.y } : null;
  }

  function hover() { return { x: mouse.x, y: mouse.y }; }

  return { read, takeActions, takeClick, hover, ACTION_CONFIRM, ACTION_PAUSE, ACTION_GEAR, ACTION_DROP, ACTION_CAMERA };
}
