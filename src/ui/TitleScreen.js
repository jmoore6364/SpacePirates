// Cinematic title overlay. Shows over the live space backdrop. NEW GAME wipes the
// save; CONTINUE resumes it (only enabled when a save exists). Calls onStart(isNew).
export class TitleScreen {
  constructor({ onStart, hasSave = false } = {}) {
    this.onStart = onStart || (() => {});
    this.isOpen = true;

    this.root = document.createElement('div');
    this.root.id = 'title';
    this.root.innerHTML = `
      <div class="t-wrap">
        <div class="t-name">VOID CORSAIR</div>
        <div class="t-tag">a space-pirate's life in a lawless cluster</div>
        <div class="t-menu">
          <button class="t-btn" data-act="new">NEW GAME</button>
          <button class="t-btn" data-act="continue" ${hasSave ? '' : 'disabled'}>CONTINUE</button>
        </div>
        <div class="t-hint">Enter / click to launch · M star-map · J fire · B bloom · P sound</div>
      </div>`;
    document.body.appendChild(this.root);
    injectStyles();

    this.root.querySelector('[data-act="new"]').addEventListener('click', () => this.start(true));
    const cont = this.root.querySelector('[data-act="continue"]');
    cont.addEventListener('click', () => { if (!cont.disabled) this.start(false); });

    this._key = (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Enter' || e.code === 'Space') { this.start(!hasSave); e.preventDefault(); }
    };
    window.addEventListener('keydown', this._key);
  }

  start(isNew) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('gone');
    window.removeEventListener('keydown', this._key);
    setTimeout(() => { this.root.style.display = 'none'; }, 600);
    this.onStart(isNew);
  }
}

function injectStyles() {
  if (document.getElementById('title-style')) return;
  const s = document.createElement('style');
  s.id = 'title-style';
  s.textContent = `
    #title { position: fixed; inset: 0; z-index: 30; display: flex; align-items: center;
      justify-content: center; font-family: "Consolas", ui-monospace, monospace;
      background: radial-gradient(circle at 50% 35%, rgba(20,20,50,0.35), rgba(2,3,10,0.82));
      transition: opacity 0.6s ease; }
    #title.gone { opacity: 0; pointer-events: none; }
    #title .t-wrap { text-align: center; }
    #title .t-name { font-size: 64px; font-weight: bold; letter-spacing: 10px; color: #ff5db1;
      text-shadow: 0 0 24px rgba(255,93,177,0.7), 0 0 60px rgba(255,93,177,0.4); }
    #title .t-tag { margin-top: 8px; font-size: 14px; letter-spacing: 3px; color: #9fe7ff; opacity: 0.8; }
    #title .t-menu { margin-top: 38px; display: flex; gap: 16px; justify-content: center; }
    #title .t-btn { padding: 12px 26px; font-family: inherit; font-size: 15px; letter-spacing: 2px;
      color: #dff1ff; background: rgba(16,40,72,0.7); border: 1px solid #3a6ab0; border-radius: 8px;
      cursor: pointer; transition: background 0.15s, transform 0.1s; }
    #title .t-btn:hover:not(:disabled) { background: #1f4f8c; transform: translateY(-1px); }
    #title .t-btn:disabled { opacity: 0.35; cursor: default; }
    #title .t-hint { margin-top: 30px; font-size: 12px; color: #9fe7ff; opacity: 0.55; letter-spacing: 1px; }
  `;
  document.head.appendChild(s);
}
