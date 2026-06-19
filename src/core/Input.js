// Keyboard + mouse input state. Renderer-agnostic; tracks pressed keys, a small
// axis API, and a normalized mouse position used for mouse-steer flight.
export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, active: false }; // x,y in [-1,1] from screen center
    this.mouseLeft = false;
    this.mouseFlight = true; // steer the ship toward the cursor (toggle in settings)
    this.touchMove = { x: 0, y: 0, active: false }; // virtual stick for on-foot movement

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

  // is the fire control engaged (keyboard J or left mouse)
  firing() { return this.keys.has('KeyJ') || this.mouseLeft; }

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

  // For tests/automation.
  press(code) { this.keys.add(code); }
  release(code) { this.keys.delete(code); }
  setMouse(x, y) { this.mouse.x = x; this.mouse.y = y; this.mouse.active = true; }

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
