// Default action → key-code bindings. Actions decouple gameplay from physical keys
// so they can be rebound (#13) and resolved from keyboard OR gamepad. Defaults match
// the original hardcoded controls so existing behavior is unchanged.
export const DEFAULT_BINDINGS = {
  thrust: ['Space'],
  brake: ['ShiftLeft', 'ControlLeft'],
  pitchUp: ['KeyW', 'ArrowUp'],
  pitchDown: ['KeyS', 'ArrowDown'],
  yawLeft: ['KeyA', 'ArrowLeft'],
  yawRight: ['KeyD', 'ArrowRight'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  fire: ['KeyJ'],
  secondary: ['KeyL'],
  land: ['KeyF'],
  interact: ['KeyE'],
  map: ['KeyM'],
  menu: ['Escape'],
  lookUp: ['KeyR'],   // on-foot camera tilt up
  lookDown: ['KeyF'], // on-foot camera tilt down
};

// Order + labels shown in the remap UI.
export const BINDABLE = [
  ['thrust', 'Thrust'], ['brake', 'Brake'],
  ['pitchUp', 'Pitch up / forward'], ['pitchDown', 'Pitch down / back'],
  ['yawLeft', 'Yaw left'], ['yawRight', 'Yaw right'],
  ['rollLeft', 'Roll left / strafe L'], ['rollRight', 'Roll right / strafe R'],
  ['fire', 'Fire'], ['secondary', 'Fire missile'], ['land', 'Land'], ['interact', 'Interact'],
  ['map', 'Star map'], ['menu', 'Menu / pause'],
];

const BINDINGS_KEY = 'voidcorsair.bindings.v1';

// Keyboard + mouse + gamepad input state. Renderer-agnostic; tracks pressed keys, a
// small axis API, a normalized mouse position for mouse-steer flight, and a rebindable
// action map resolved from keyboard or gamepad.
export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, active: false }; // x,y in [-1,1] from screen center
    this.mouseLeft = false;
    this.mouseFlight = true; // steer the ship toward the cursor (toggle in settings)
    this.touchMove = { x: 0, y: 0, active: false }; // virtual stick for on-foot movement
    // accumulated relative mouse motion (pixels) since last consume — drives snappy,
    // 1:1 on-foot mouse-look (no rate ramp, so it doesn't feel laggy).
    this.lookDX = 0;
    this.lookDY = 0;

    // action map + gamepad state (#13)
    this.bindings = this._loadBindings();
    this.padConnected = false;
    this.padFire = false;
    this.pad = { steerX: 0, steerY: 0, moveX: 0, moveY: 0, lookX: 0, lookY: 0, throttle: 0 };
    this._padActs = new Set();
    this._padPrev = {};

    this._down = (e) => {
      if (e.metaKey || e.ctrlKey) return;
      this.keys.add(e.code);
      if (FLIGHT_CODES.has(e.code)) e.preventDefault();
    };
    this._up = (e) => this.keys.delete(e.code);
    this._move = (e) => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      this.mouse.x = (e.clientX / w) * 2 - 1;
      this.mouse.y = (e.clientY / h) * 2 - 1;
      this.mouse.active = true;
      // relative motion for on-foot look (immediate, proportional to how far you move)
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    };
    this._mdown = (e) => { if (e.button === 0) this.mouseLeft = true; };
    this._mup = (e) => { if (e.button === 0) this.mouseLeft = false; };

    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    target.addEventListener('mousemove', this._move);
    target.addEventListener('mousedown', this._mdown);
    target.addEventListener('mouseup', this._mup);
    this._target = target;
  }

  isDown(code) { return this.keys.has(code); }

  // is the fire control engaged (bound key, left mouse, or gamepad fire)
  firing() { return this.act('fire') || this.mouseLeft || this.padFire; }

  // secondary fire — homing missile (bound key or gamepad RB)
  firingSecondary() { return this.act('secondary') || this._padActs.has('secondary'); }

  // --- action map (#13): resolve a named action from keyboard OR gamepad ---
  act(action) {
    const codes = this.bindings[action];
    if (codes && codes.some((c) => this.keys.has(c))) return true;
    return this._padActs.has(action);
  }

  // digital axis from two actions, in [-1,1]
  actAxis(negAction, posAction) { return (this.act(posAction) ? 1 : 0) - (this.act(negAction) ? 1 : 0); }

  _loadBindings() {
    const def = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    try {
      const saved = JSON.parse((globalThis.localStorage && localStorage.getItem(BINDINGS_KEY)) || 'null');
      if (saved) for (const k of Object.keys(def)) if (Array.isArray(saved[k])) def[k] = saved[k];
    } catch { /* ignore */ }
    return def;
  }

  saveBindings() { try { localStorage.setItem(BINDINGS_KEY, JSON.stringify(this.bindings)); } catch { /* ignore */ } }
  setBinding(action, code) { if (this.bindings[action]) { this.bindings[action] = [code]; this.saveBindings(); } }
  resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); this.saveBindings(); }

  // Poll the first connected gamepad each frame: sticks → steer/move/look, triggers →
  // throttle, face/shoulder buttons → actions. Single-press actions (map/menu/land/
  // interact) are dispatched as synthetic keydowns on the rising edge so the existing
  // handlers fire. No-op when no pad or no Gamepad API.
  pollGamepad() {
    this._padActs = new Set();
    this.padFire = false;
    this.pad.steerX = this.pad.steerY = this.pad.moveX = this.pad.moveY = this.pad.lookX = this.pad.lookY = this.pad.throttle = 0;
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : null;
    if (!pads) { this.padConnected = false; return; }
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.padConnected = !!gp;
    if (!gp) return;

    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    const ax = gp.axes || [];
    const lx = dz(ax[0] || 0), ly = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
    this.pad.steerX = lx; this.pad.steerY = ly; // flight aim
    this.pad.moveX = lx; this.pad.moveY = ly;   // on-foot move
    this.pad.lookX = rx; this.pad.lookY = ry;   // on-foot look / turn
    const down = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);

    this.pad.throttle = (val(7) || 0) - (val(6) || 0); // RT thrust, LT brake
    if (down(2)) this.padFire = true;                  // X fires
    if (down(4)) this._padActs.add('rollLeft');        // LB
    if (down(5)) this._padActs.add('rollRight');       // RB

    // rising-edge single-press actions → synthetic keydown so main's handlers run
    const edge = (i) => { const now = down(i); const was = !!this._padPrev[i]; this._padPrev[i] = now; return now && !was; };
    if (edge(3)) this._key('KeyM');                                  // Y → map
    if (edge(1)) this._key('Escape');                               // B → menu
    if (edge(0)) { this._key('KeyF'); this._key('KeyE'); this._key('KeyT'); } // A → land/interact/takeoff
    // keep prev state fresh for buttons we only edge-detect
    this._padPrev[2] = down(2);
  }

  _key(code) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }

  // mouse-steer deflection in [-1,1] with a central deadzone; {x:0,y:0} when idle
  mouseSteer() {
    if (!this.mouseFlight || !this.mouse.active) return { x: 0, y: 0 };
    const dz = 0.10;
    const curve = (v) => { const a = Math.abs(v); return a < dz ? 0 : Math.sign(v) * Math.min(1, (a - dz) / (0.9 - dz)); };
    return { x: curve(this.mouse.x), y: curve(this.mouse.y) };
  }

  axis(negCodes, posCodes) {
    const neg = negCodes.some((c) => this.keys.has(c)) ? 1 : 0;
    const pos = posCodes.some((c) => this.keys.has(c)) ? 1 : 0;
    return pos - neg;
  }

  // Consume accumulated relative mouse motion (pixels) since last call.
  consumeLook() { const d = { dx: this.lookDX, dy: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return d; }

  // For tests/automation.
  press(code) { this.keys.add(code); }
  release(code) { this.keys.delete(code); }
  setMouse(x, y) { this.mouse.x = x; this.mouse.y = y; this.mouse.active = true; }
  moveBy(dx, dy) { this.lookDX += dx; this.lookDY += dy; this.mouse.active = true; } // sim relative look

  dispose() {
    this._target.removeEventListener('keydown', this._down);
    this._target.removeEventListener('keyup', this._up);
    this._target.removeEventListener('mousemove', this._move);
    this._target.removeEventListener('mousedown', this._mdown);
    this._target.removeEventListener('mouseup', this._mup);
  }
}

const FLIGHT_CODES = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);
