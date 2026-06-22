// First-run onboarding: a non-blocking, skippable banner that walks a new player
// through the core loop (thrust, fire, map, land, interact, take off), advancing as
// each action is detected. Marks transient actions via mark(); polls continuous
// state (speed, mode) via update(ctx). Persisted "done" flag lives in the host.
// See issue #14.
const STEPS = [
  { id: 'thrust',   text: 'Hold <b>Space</b> to thrust forward',                done: (f, c) => (c.speed || 0) > 50 },
  { id: 'fire',     text: 'Aim with the mouse — <b>Click</b> or <b>J</b> to fire', done: (f) => f.fired },
  { id: 'map',      text: 'Press <b>M</b> to open the star map',                 done: (f) => f.mapOpen },
  { id: 'land',     text: 'Fly to a world; press <b>F</b> to land when prompted', done: (f, c) => c.mode === 'SURFACE' },
  { id: 'interact', text: 'Walk to a glowing vendor and press <b>E</b>',         done: (f) => f.interacted },
  { id: 'takeoff',  text: 'Return to your ship and press <b>T</b> to take off',  done: (f) => f.tookOff },
];

export class Tutorial {
  constructor({ onDone } = {}) {
    this.onDone = onDone || (() => {});
    this.active = false;
    this.step = -1;
    this.flags = {};
    injectStyles();
    this.root = document.createElement('div');
    this.root.id = 'tutorial';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  start() {
    this.active = true;
    this.step = 0;
    this.flags = {};
    this.root.style.display = 'block';
    this._render();
  }

  // record a one-off action (fired, mapOpen, interacted, tookOff)
  mark(flag) { if (this.active) this.flags[flag] = true; }

  skip() { this._finish(); }

  // poll continuous state and advance through any already-satisfied steps
  update(ctx = {}) {
    if (!this.active) return;
    let advanced = false;
    while (this.step < STEPS.length && STEPS[this.step].done(this.flags, ctx)) {
      this.step += 1;
      advanced = true;
    }
    if (this.step >= STEPS.length) { this._finish(); return; }
    if (advanced) this._render();
  }

  _finish() {
    if (!this.active) return;
    this.active = false;
    this.root.style.display = 'none';
    this.onDone();
  }

  _render() {
    const s = STEPS[this.step];
    if (!s) return;
    this.root.innerHTML = `
      <div class="tut-card">
        <div class="tut-step">TUTORIAL ${this.step + 1}/${STEPS.length}</div>
        <div class="tut-text">${s.text}</div>
        <button class="tut-skip" type="button">SKIP ✕</button>
      </div>`;
    this.root.querySelector('.tut-skip').onclick = () => this.skip();
  }
}

function injectStyles() {
  if (document.getElementById('tutorial-style')) return;
  const st = document.createElement('style');
  st.id = 'tutorial-style';
  st.textContent = `
    #tutorial { position: fixed; top: 120px; left: 50%; transform: translateX(-50%);
      z-index: 11; pointer-events: none; font-family: "Consolas", ui-monospace, monospace; }
    #tutorial .tut-card { display: flex; align-items: center; gap: 14px;
      padding: 10px 16px; background: rgba(8,12,24,0.9); border: 1px solid #3a6ab0;
      border-radius: 8px; box-shadow: 0 0 22px rgba(60,140,255,0.3); }
    #tutorial .tut-step { font-size: 11px; letter-spacing: 2px; color: #66e0ff; opacity: 0.85; }
    #tutorial .tut-text { font-size: 14px; color: #eaf6ff; }
    #tutorial .tut-text b { color: #ffe6a0; }
    #tutorial .tut-skip { pointer-events: auto; font-family: inherit; font-size: 11px;
      color: #cfeaff; background: #16365f; border: 1px solid #3a6ab0; border-radius: 5px;
      padding: 5px 9px; cursor: pointer; }
    #tutorial .tut-skip:hover { background: #1f4f8c; }
  `;
  document.head.appendChild(st);
}
