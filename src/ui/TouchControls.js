// On-screen touch controls for phones/tablets. A left virtual joystick steers the
// ship (mouse-aim) and moves the character (touchMove); right-side buttons hold
// thrust/brake/fire and fire one-shot context actions. Synthesizes existing Input
// state + dispatches key events so it reuses every other control path. See #17.
export class TouchControls {
  constructor(input, { getMode } = {}) {
    this.input = input;
    this.getMode = getMode || (() => 'SPACE');
    this.enabled = false;

    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.innerHTML = `
      <div class="tc-stick" id="tc-stick"><div class="tc-knob" id="tc-knob"></div></div>
      <div class="tc-btns">
        <button class="tc-btn" id="tc-thrust">THR</button>
        <button class="tc-btn" id="tc-brake">BRK</button>
        <button class="tc-btn fire" id="tc-fire">FIRE</button>
        <button class="tc-btn" id="tc-action">USE</button>
        <button class="tc-btn" id="tc-map">MAP</button>
      </div>`;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    injectStyles();

    this._wireStick();
    this._wireButtons();
  }

  // show on touch-capable devices (or when forced for testing)
  autoEnable() {
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (touch) this.enable();
    return touch;
  }
  enable() { this.enabled = true; this.root.style.display = 'block'; document.body.classList.add('touch-on'); }
  disable() { this.enabled = false; this.root.style.display = 'none'; this._setStick(0, 0); }

  _setStick(x, y) {
    this.input.setMouse(x, y);              // ship steering (space)
    this.input.touchMove.x = x;
    this.input.touchMove.y = y;
    this.input.touchMove.active = (x !== 0 || y !== 0);
    const k = document.getElementById('tc-knob');
    if (k) k.style.transform = `translate(${x * 36}px, ${y * 36}px)`;
  }

  _wireStick() {
    const pad = this.root.querySelector('#tc-stick');
    let id = null, cx = 0, cy = 0, R = 48;
    const start = (t, rect) => { id = t.identifier; cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2; R = rect.width / 2; };
    const move = (t) => {
      let dx = (t.clientX - cx) / R, dy = (t.clientY - cy) / R;
      const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      this._setStick(dx, dy);
    };
    pad.addEventListener('touchstart', (e) => { e.preventDefault(); start(e.changedTouches[0], pad.getBoundingClientRect()); move(e.changedTouches[0]); }, { passive: false });
    pad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) move(t);
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; this._setStick(0, 0); } };
    pad.addEventListener('touchend', end); pad.addEventListener('touchcancel', end);
  }

  _hold(btnId, on, off) {
    const b = this.root.querySelector('#' + btnId);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); on(); b.classList.add('down'); }, { passive: false });
    const up = (e) => { e.preventDefault(); off(); b.classList.remove('down'); };
    b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
  }

  _tap(btnId, fn) {
    const b = this.root.querySelector('#' + btnId);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); b.classList.add('down'); setTimeout(() => b.classList.remove('down'), 120); }, { passive: false });
  }

  _key(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }

  _wireButtons() {
    this._hold('tc-thrust', () => this.input.press('Space'), () => this.input.release('Space'));
    this._hold('tc-brake', () => this.input.press('ShiftLeft'), () => this.input.release('ShiftLeft'));
    this._hold('tc-fire', () => { this.input.mouseLeft = true; }, () => { this.input.mouseLeft = false; });
    // context action: land (space), or take-off/use (foot) handled by main's keys
    this._tap('tc-action', () => {
      const mode = this.getMode();
      if (mode === 'SPACE') this._key('KeyF');
      else { this._key('KeyT'); this._key('KeyE'); } // try take-off then interact
    });
    this._tap('tc-map', () => this._key('KeyM'));
  }
}

function injectStyles() {
  if (document.getElementById('touch-style')) return;
  const s = document.createElement('style');
  s.id = 'touch-style';
  s.textContent = `
    body.touch-on { touch-action: none; }
    #touch { position: fixed; inset: 0; z-index: 8; pointer-events: none;
      font-family: "Consolas", ui-monospace, monospace; }
    #touch .tc-stick { position: absolute; left: 22px; bottom: 22px; width: 120px; height: 120px;
      border-radius: 50%; background: rgba(20,40,70,0.35); border: 1px solid rgba(120,200,255,0.4);
      pointer-events: auto; }
    #touch .tc-knob { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px;
      border-radius: 50%; background: rgba(120,200,255,0.55); }
    #touch .tc-btns { position: absolute; right: 18px; bottom: 22px; display: grid;
      grid-template-columns: repeat(2, 74px); gap: 10px; pointer-events: auto; }
    #touch .tc-btn { height: 56px; border-radius: 12px; border: 1px solid #3a6ab0;
      background: rgba(16,40,72,0.6); color: #dff1ff; font-size: 13px; letter-spacing: 1px; }
    #touch .tc-btn.fire { background: rgba(90,20,30,0.6); border-color: #7a2a38; color: #ffd0d6; }
    #touch .tc-btn.down { background: #1f4f8c; }
  `;
  document.head.appendChild(s);
}
