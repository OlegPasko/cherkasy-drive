// Keyboard + mouse + gamepad -> one action state per frame.
//
//   createInput({ target = window, element = null, lockOnClick = true, lookUnlocked = false, bindings }) -> input
//     input.update(dt)        latch the frame: the game loop calls it once, before any system runs
//     input.poll(dt)          -> the latched frame object (the car's contract; calling it many times is fine):
//                              { move:{x,y}, look:{dx,dy}, throttle, pitch, jump, drop, sprint, horn, wheel,
//                                cameraPressed, resetPressed, helpPressed, pausePressed, gamepad }
//                              move.x: right +, move.y: forward + (W/S, arrows, left stick, triggers);
//                              throttle: W/S + triggers only (arrows pitch in the air); pitch: +1 = nose down (arrow up)
//     input.held(a) / input.pressed(a) / input.released(a)   named actions (see DEFAULT_BINDINGS), pressed = this frame
//     input.axis('moveX' | 'moveY' | 'throttle' | 'pitch' | 'lookX' | 'lookY' | 'wheel')
//     input.bind(action, codes[])  codes are KeyboardEvent.code values or 'Mouse0'..'Mouse4'
//     input.locked, input.lock(), input.unlock(), input.gamepadId, input.dispose()
// Keys typed into form fields are ignored. Focus loss or a hidden tab releases everything (no stuck keys).

export const DEFAULT_BINDINGS = {
  gas: ['KeyW'],
  brake: ['KeyS'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  noseDown: ['ArrowUp'],
  noseUp: ['ArrowDown'],
  jump: ['Space'],
  drop: ['ControlLeft', 'ControlRight', 'KeyX'],
  horn: ['KeyF'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  camera: ['KeyC'],
  reset: ['KeyR'],
  help: ['KeyH', 'F1'],
  pause: ['KeyP'],
  fire: ['Mouse0'],
};

// standard-mapping gamepad buttons per action (Xbox names)
const PAD_BUTTONS = { jump: [0], drop: [1], reset: [2], camera: [3], sprint: [5, 10], horn: [11], pause: [8], help: [9] };
const PAD_DEAD = 0.14, PAD_LOOK = 900; // look speed in "mouse pixels" per second at full stick

const clamp1 = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
const dead = (v) => (Math.abs(v) < PAD_DEAD ? 0 : (v - Math.sign(v) * PAD_DEAD) / (1 - PAD_DEAD));
const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));

export function createInput({ target = globalThis.window, element = null, lockOnClick = true, lookUnlocked = false, bindings } = {}) {
  const binds = {};
  const codeToActions = new Map();
  const down = new Set();             // codes held right now
  const hitCodes = new Set();          // codes that went down since the last latch
  const upCodes = new Set();           // codes that went up since the last latch
  let mdx = 0, mdy = 0, wheelAcc = 0;
  let locked = false, padId = null;
  const padPrev = new Map();           // action -> held last frame (gamepad)

  const frame = {
    move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, throttle: 0, pitch: 0, wheel: 0,
    jump: false, drop: false, sprint: false, horn: false, fire: false,
    cameraPressed: false, resetPressed: false, helpPressed: false, pausePressed: false, gamepad: false,
  };
  const heldA = new Set(), pressedA = new Set(), releasedA = new Set();

  function rebuild() {
    codeToActions.clear();
    for (const [a, codes] of Object.entries(binds)) for (const c of codes) {
      if (!codeToActions.has(c)) codeToActions.set(c, []);
      codeToActions.get(c).push(a);
    }
  }
  function bind(action, codes) { binds[action] = [...codes]; rebuild(); }
  for (const [a, c] of Object.entries({ ...DEFAULT_BINDINGS, ...bindings })) binds[a] = [...c];
  rebuild();

  // ------------------------------------------------------------------ DOM listeners
  const press = (code) => { if (!down.has(code)) { down.add(code); hitCodes.add(code); } };
  const lift = (code) => { if (down.delete(code)) upCodes.add(code); };
  const releaseAll = () => { for (const c of down) upCodes.add(c); down.clear(); };

  function onKeyDown(e) {
    if (isTyping(e.target)) return;
    if (codeToActions.has(e.code)) e.preventDefault(); // no page scroll on Space / arrows, no browser help on F1
    if (!e.repeat) press(e.code);
  }
  const onKeyUp = (e) => lift(e.code);
  function onMouseDown(e) {
    if (element && e.target !== element) return;
    press('Mouse' + e.button);
    if (lockOnClick && element && !locked) lock();
  }
  const onMouseUp = (e) => lift('Mouse' + e.button);
  function onMouseMove(e) {
    if (!locked && !lookUnlocked) return;
    mdx += e.movementX || 0; mdy += e.movementY || 0;
  }
  const onWheel = (e) => { if (!element || e.target === element) wheelAcc += Math.sign(e.deltaY); };
  const onBlur = () => releaseAll();
  const onVisibility = () => { if (globalThis.document?.hidden) releaseAll(); };
  const onLockChange = () => { locked = !!element && globalThis.document?.pointerLockElement === element; };
  const onContext = (e) => { if (element && e.target === element) e.preventDefault(); };

  const doc = globalThis.document;
  const listen = [
    [target, 'keydown', onKeyDown], [target, 'keyup', onKeyUp], [target, 'mousedown', onMouseDown],
    [target, 'mouseup', onMouseUp], [target, 'mousemove', onMouseMove], [target, 'wheel', onWheel, { passive: true }],
    [target, 'blur', onBlur], [target, 'contextmenu', onContext],
    [doc, 'visibilitychange', onVisibility], [doc, 'pointerlockchange', onLockChange],
  ].filter(([t]) => t && t.addEventListener);
  for (const [t, type, fn, opt] of listen) t.addEventListener(type, fn, opt);

  function lock() {
    try { const p = element?.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* not allowed right now */ }
  }
  function unlock() { if (locked) doc?.exitPointerLock?.(); }

  // ------------------------------------------------------------------ gamepad
  function readPad() {
    const pads = globalThis.navigator?.getGamepads?.() || [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // ------------------------------------------------------------------ latch one frame
  function update(dt = 1 / 60) {
    const was = new Set(heldA);
    heldA.clear(); pressedA.clear(); releasedA.clear();
    for (const c of down) for (const a of codeToActions.get(c) || []) heldA.add(a);
    for (const c of hitCodes) for (const a of codeToActions.get(c) || []) pressedA.add(a);

    const pad = readPad();
    padId = pad ? pad.id : null;
    let px = 0, py = 0, lx = 0, ly = 0, trig = 0;
    if (pad) {
      const ax = pad.axes, b = pad.buttons;
      px = dead(ax[0] || 0); py = -dead(ax[1] || 0);
      lx = dead(ax[2] || 0); ly = dead(ax[3] || 0);
      trig = (b[7]?.value || 0) - (b[6]?.value || 0);
      for (const [a, idx] of Object.entries(PAD_BUTTONS)) {
        const on = idx.some((i) => b[i]?.pressed);
        if (on) { heldA.add(a); if (!padPrev.get(a)) pressedA.add(a); }
        padPrev.set(a, on);
      }
    } else padPrev.clear();

    for (const a of was) if (!heldA.has(a)) releasedA.add(a);
    for (const c of upCodes) for (const a of codeToActions.get(c) || []) if (!heldA.has(a)) releasedA.add(a);

    const k = (a) => (heldA.has(a) || pressedA.has(a) ? 1 : 0);
    frame.throttle = clamp1(k('gas') - k('brake') + trig);
    frame.pitch = clamp1(k('noseDown') - k('noseUp') + py);
    frame.move.x = clamp1(k('right') - k('left') + px);
    frame.move.y = clamp1(frame.throttle + k('noseDown') - k('noseUp') + py);
    frame.look.dx = mdx + lx * PAD_LOOK * dt;
    frame.look.dy = mdy + ly * PAD_LOOK * dt;
    frame.wheel = wheelAcc;
    frame.jump = heldA.has('jump'); frame.drop = heldA.has('drop'); frame.sprint = heldA.has('sprint'); frame.horn = heldA.has('horn') || pressedA.has('horn'); // a tap between two frames still toots
    frame.fire = heldA.has('fire');
    frame.cameraPressed = pressedA.has('camera'); frame.resetPressed = pressedA.has('reset');
    frame.helpPressed = pressedA.has('help'); frame.pausePressed = pressedA.has('pause');
    frame.gamepad = !!pad;

    mdx = mdy = wheelAcc = 0;
    hitCodes.clear(); upCodes.clear();
    return frame;
  }

  const AXES = {
    moveX: () => frame.move.x, moveY: () => frame.move.y, throttle: () => frame.throttle, pitch: () => frame.pitch,
    lookX: () => frame.look.dx, lookY: () => frame.look.dy, wheel: () => frame.wheel,
  };

  return {
    update,
    poll: () => frame,
    get state() { return frame; },
    held: (a) => heldA.has(a),
    pressed: (a) => pressedA.has(a),
    released: (a) => releasedA.has(a),
    axis: (name) => AXES[name]?.() ?? 0,
    bind,
    get bindings() { return binds; },
    get locked() { return locked; },
    get gamepadId() { return padId; },
    lock, unlock,
    // test / automation hooks: synthesize key and mouse input without DOM events
    inject: { down: press, up: lift, mouse(dx, dy) { mdx += dx; mdy += dy; } },
    dispose() { for (const [t, type, fn, opt] of listen) t.removeEventListener(type, fn, opt); releaseAll(); unlock(); },
  };
}
