// Keyboard input state. Renderer-agnostic; just tracks pressed keys and exposes
// a small axis API the flight model reads each frame.
export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this._down = (e) => {
      // don't hijack devtools / refresh shortcuts
      if (e.metaKey || e.ctrlKey) return;
      this.keys.add(e.code);
      if (FLIGHT_CODES.has(e.code)) e.preventDefault();
    };
    this._up = (e) => this.keys.delete(e.code);
    target.addEventListener('keydown', this._down);
    target.addEventListener('keyup', this._up);
    this._target = target;
  }

  isDown(code) { return this.keys.has(code); }

  // axis helper: returns (+1 / -1 / 0) for a pair of keys
  axis(negCodes, posCodes) {
    const neg = negCodes.some((c) => this.keys.has(c)) ? 1 : 0;
    const pos = posCodes.some((c) => this.keys.has(c)) ? 1 : 0;
    return pos - neg;
  }

  // For tests/automation: inject a key as held.
  press(code) { this.keys.add(code); }
  release(code) { this.keys.delete(code); }

  dispose() {
    this._target.removeEventListener('keydown', this._down);
    this._target.removeEventListener('keyup', this._up);
  }
}

const FLIGHT_CODES = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);
