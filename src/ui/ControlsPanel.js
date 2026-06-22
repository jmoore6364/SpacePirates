// Key-remapping overlay (#13): lists bindable actions with their current key; click
// REBIND, then press a key to assign it. Persists via Input.setBinding. Sits above
// the pause menu like the saves/records panels. Gamepad is auto-detected (no binding
// UI needed — standard mapping).
import { BINDABLE } from '../core/Input.js';

const KEY_LABEL = (code) => (code || '—')
  .replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '')
  .replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space');

export class ControlsPanel {
  constructor({ onClose } = {}) {
    this.onClose = onClose || (() => {});
    this.isOpen = false;
    this.capturing = null; // action awaiting a key press
    this.root = document.createElement('div');
    this.root.id = 'controls';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    injectStyles();
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    // capture key presses while rebinding (capture phase so it beats game handlers)
    this._key = (e) => {
      if (!this.isOpen || !this.capturing) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') this.input.setBinding(this.capturing, e.code);
      this.capturing = null;
      this.render();
    };
    window.addEventListener('keydown', this._key, true);
  }

  open(input) { this.input = input; this.isOpen = true; this.capturing = null; this.render(); this.root.style.display = 'flex'; }
  close() { this.capturing = null; this.root.style.display = 'none'; this.isOpen = false; this.onClose(); }

  render() {
    const rows = BINDABLE.map(([action, label]) => {
      const code = (this.input.bindings[action] || [])[0];
      const capturing = this.capturing === action;
      return `<div class="ct-row"><span class="ct-lbl">${label}</span>
        <button class="ct-key ${capturing ? 'capturing' : ''}" data-bind="${action}">
          ${capturing ? 'press a key…' : KEY_LABEL(code)}</button></div>`;
    }).join('');
    const pad = this.input.padConnected ? '🎮 Gamepad connected (standard mapping)' : 'No gamepad detected — connect one and press a button.';
    this.root.innerHTML = `<div class="ct-panel">
      <div class="ct-title">CONTROLS</div>
      <div class="ct-sub">Click a key to rebind, then press the new key. ${pad}</div>
      <div class="ct-grid">${rows}</div>
      <div class="ct-actions">
        <button class="ct-btn" data-reset>RESET DEFAULTS</button>
        <button class="ct-btn back" data-back>BACK</button>
      </div>
    </div>`;
    this.root.querySelectorAll('[data-bind]').forEach((b) => b.onclick = () => { this.capturing = b.dataset.bind; this.render(); });
    this.root.querySelector('[data-reset]').onclick = () => { this.input.resetBindings(); this.capturing = null; this.render(); };
    this.root.querySelector('[data-back]').onclick = () => this.close();
  }
}

function injectStyles() {
  if (document.getElementById('controls-style')) return;
  const s = document.createElement('style');
  s.id = 'controls-style';
  s.textContent = `
    #controls { position: fixed; inset: 0; z-index: 18; display: none; align-items: center;
      justify-content: center; background: rgba(3,4,10,0.85);
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff; }
    #controls .ct-panel { width: min(540px, 92vw); max-height: 88vh; overflow: auto; padding: 22px 26px;
      background: rgba(8,12,24,0.97); border: 1px solid #2d4a78; border-radius: 10px;
      box-shadow: 0 0 40px rgba(60,140,255,0.25); }
    #controls .ct-title { font-size: 22px; letter-spacing: 5px; color: #ff5db1; text-align: center;
      text-shadow: 0 0 12px rgba(255,93,177,0.6); margin-bottom: 6px; }
    #controls .ct-sub { font-size: 12px; opacity: 0.7; margin-bottom: 14px; text-align: center; }
    #controls .ct-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
    #controls .ct-row { display: flex; justify-content: space-between; align-items: center;
      padding: 5px 6px; border-bottom: 1px solid #16243c; font-size: 13px; }
    #controls .ct-key { min-width: 92px; font-family: inherit; font-size: 12px; color: #dff1ff;
      background: #16365f; border: 1px solid #3a6ab0; border-radius: 5px; padding: 5px 10px; cursor: pointer; }
    #controls .ct-key:hover { background: #1f4f8c; }
    #controls .ct-key.capturing { background: #5a3a14; border-color: #b58a2a; color: #ffe6a0; }
    #controls .ct-actions { display: flex; gap: 10px; margin-top: 16px; }
    #controls .ct-btn { flex: 1; padding: 10px; font-family: inherit; font-size: 13px; color: #dff1ff;
      background: #16365f; border: 1px solid #3a6ab0; border-radius: 6px; cursor: pointer; }
    #controls .ct-btn:hover { background: #1f4f8c; }
  `;
  document.head.appendChild(s);
}
