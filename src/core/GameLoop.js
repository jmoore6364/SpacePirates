// Renderer-agnostic game loop. Calls update(dt) then render() each frame and
// tracks a smoothed FPS value. dt is clamped so tab-switches don't explode physics.
import { clamp } from '../util/math.js';

export class GameLoop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.running = false;
    this._last = 0;
    this._raf = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      const dt = clamp((now - this._last) / 1000, 0, 0.1); // clamp big stalls
      this._last = now;

      this._fpsAccum += dt;
      this._fpsFrames += 1;
      if (this._fpsAccum >= 0.5) {
        this.fps = Math.round(this._fpsFrames / this._fpsAccum);
        this._fpsAccum = 0;
        this._fpsFrames = 0;
      }

      this.update(dt);
      this.render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }
}
