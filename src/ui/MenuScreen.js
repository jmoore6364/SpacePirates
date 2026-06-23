// Pause / menu overlay: Resume, Settings (bloom, volume sliders, graphics quality),
// Save, and Quit to title. Emits changes via onChange(key, value); the host applies
// + persists them. See issue #7.
export class MenuScreen {
  constructor({ onResume, onSave, onSaves, onStats, onControls, onJournal, onQuit, onChange } = {}) {
    this.onResume = onResume || (() => {});
    this.onSave = onSave || (() => {});
    this.onSaves = onSaves || (() => {});
    this.onStats = onStats || (() => {});
    this.onControls = onControls || (() => {});
    this.onJournal = onJournal || (() => {});
    this.onQuit = onQuit || (() => {});
    this.onChange = onChange || (() => {});
    this.isOpen = false;

    this.root = document.createElement('div');
    this.root.id = 'menu';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    injectStyles();
  }

  open(settings) {
    this.settings = settings;
    this.isOpen = true;
    this._render();
    this.root.style.display = 'flex';
  }

  close() { this.root.style.display = 'none'; this.isOpen = false; }

  _render() {
    const s = this.settings;
    const pct = (v) => Math.round((v ?? 0) * 100);
    this.root.innerHTML = `
      <div class="mn-panel">
        <div class="mn-title">PAUSED</div>
        <div class="mn-actions">
          <button class="mn-btn primary" data-act="resume">RESUME</button>
          <button class="mn-btn" data-act="save">QUICK SAVE</button>
          <button class="mn-btn" data-act="saves">MANAGE SAVES</button>
          <button class="mn-btn" data-act="journal">JOURNAL</button>
          <button class="mn-btn" data-act="stats">RECORDS</button>
          <button class="mn-btn" data-act="controls">CONTROLS</button>
          <button class="mn-btn" data-act="quit">QUIT TO TITLE</button>
        </div>
        <div class="mn-sec">SETTINGS</div>
        <div class="mn-row"><label>Bloom</label>
          <button class="mn-toggle" data-act="bloom">${s.bloom ? 'ON' : 'OFF'}</button></div>
        <div class="mn-row"><label>Mouse fly</label>
          <button class="mn-toggle" data-act="mouseflight">${s.mouseFlight ? 'ON' : 'OFF'}</button></div>
        <div class="mn-row"><label>Master</label>
          <input type="range" min="0" max="100" value="${pct(s.master)}" data-vol="master"></div>
        <div class="mn-row"><label>Music</label>
          <input type="range" min="0" max="100" value="${pct(s.music)}" data-vol="music"></div>
        <div class="mn-row"><label>SFX</label>
          <input type="range" min="0" max="100" value="${pct(s.sfx)}" data-vol="sfx"></div>
        <div class="mn-row"><label>Graphics</label>
          <select data-act="quality">
            ${['low', 'med', 'high'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${q.toUpperCase()}</option>`).join('')}
          </select></div>
        <div class="mn-hint">[Esc] resume</div>
      </div>`;

    const $ = (sel) => this.root.querySelector(sel);
    $('[data-act="resume"]').onclick = () => this.onResume();
    $('[data-act="save"]').onclick = () => this.onSave();
    $('[data-act="saves"]').onclick = () => this.onSaves();
    $('[data-act="journal"]').onclick = () => this.onJournal();
    $('[data-act="stats"]').onclick = () => this.onStats();
    $('[data-act="controls"]').onclick = () => this.onControls();
    $('[data-act="quit"]').onclick = () => this.onQuit();
    $('[data-act="bloom"]').onclick = () => { this.onChange('bloom', !s.bloom); this._render(); };
    $('[data-act="mouseflight"]').onclick = () => { this.onChange('mouseFlight', !s.mouseFlight); this._render(); };
    $('[data-act="quality"]').onchange = (e) => { this.onChange('quality', e.target.value); };
    this.root.querySelectorAll('[data-vol]').forEach((el) => {
      el.oninput = (e) => this.onChange(e.target.dataset.vol, Number(e.target.value) / 100);
    });
  }
}

function injectStyles() {
  if (document.getElementById('menu-style')) return;
  const s = document.createElement('style');
  s.id = 'menu-style';
  s.textContent = `
    #menu { position: fixed; inset: 0; z-index: 16; display: none; align-items: center;
      justify-content: center; background: rgba(3,4,10,0.78);
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff; }
    #menu .mn-panel { width: min(420px, 90vw); padding: 24px 28px; background: rgba(8,12,24,0.96);
      border: 1px solid #2d4a78; border-radius: 10px; box-shadow: 0 0 40px rgba(60,140,255,0.25); }
    #menu .mn-title { font-size: 26px; letter-spacing: 6px; color: #ff5db1; text-align: center;
      text-shadow: 0 0 14px rgba(255,93,177,0.6); margin-bottom: 18px; }
    #menu .mn-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
    #menu .mn-btn { padding: 11px; font-family: inherit; font-size: 14px; letter-spacing: 2px;
      color: #dff1ff; background: rgba(16,40,72,0.7); border: 1px solid #3a6ab0; border-radius: 7px; cursor: pointer; }
    #menu .mn-btn:hover { background: #1f4f8c; }
    #menu .mn-btn.primary { background: #1f4f8c; }
    #menu .mn-sec { font-size: 11px; letter-spacing: 3px; opacity: 0.5; margin: 4px 0 10px; }
    #menu .mn-row { display: grid; grid-template-columns: 80px 1fr; gap: 12px; align-items: center; margin-bottom: 10px; font-size: 13px; }
    #menu .mn-row input[type=range] { width: 100%; accent-color: #4d9bff; }
    #menu .mn-toggle, #menu select { font-family: inherit; font-size: 12px; color: #dff1ff;
      background: #16365f; border: 1px solid #3a6ab0; border-radius: 5px; padding: 5px 10px; cursor: pointer; }
    #menu .mn-hint { text-align: center; font-size: 11px; opacity: 0.5; margin-top: 12px; }
  `;
  document.head.appendChild(s);
}
