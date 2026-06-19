// Star-map overlay: a DOM panel listing worlds with live distances. Open with M,
// pick a destination with its number key (or click) to fast-travel. Presentation
// + DOM only; travel itself is delegated to the scene via onTravel(worldId).
export class StarMap {
  constructor({ onTravel } = {}) {
    this.onTravel = onTravel || (() => {});
    this.isOpen = false;
    this.worlds = [];

    this.root = document.createElement('div');
    this.root.id = 'starmap';
    this.root.innerHTML = `
      <div class="sm-panel">
        <div class="sm-title">◈ STAR MAP</div>
        <div class="sm-sub">Select a destination — press its number, or click. [M] / [Esc] to close.</div>
        <ul class="sm-list"></ul>
      </div>`;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    this.list = this.root.querySelector('.sm-list');
    injectStyles();
  }

  toggle(worlds, shipPos) {
    if (this.isOpen) this.close();
    else this.open(worlds, shipPos);
  }

  open(worlds, shipPos) {
    this.worlds = worlds;
    this.list.innerHTML = '';
    worlds.forEach((w, idx) => {
      const dx = shipPos.x - w.position[0];
      const dy = shipPos.y - w.position[1];
      const dz = shipPos.z - w.position[2];
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
      const li = document.createElement('li');
      li.className = 'sm-item';
      li.innerHTML = `
        <span class="sm-key">${idx + 1}</span>
        <span class="sm-name">${w.name}</span>
        <span class="sm-theme">${w.theme}</span>
        <span class="sm-dist">${dist} u</span>`;
      li.addEventListener('click', () => this.select(idx));
      this.list.appendChild(li);
    });
    this.root.style.display = 'flex';
    this.isOpen = true;
  }

  close() {
    this.root.style.display = 'none';
    this.isOpen = false;
  }

  select(idx) {
    const w = this.worlds[idx];
    if (!w) return;
    this.onTravel(w.id);
    this.close();
  }
}

function injectStyles() {
  if (document.getElementById('starmap-style')) return;
  const s = document.createElement('style');
  s.id = 'starmap-style';
  s.textContent = `
    #starmap {
      position: fixed; inset: 0; z-index: 10; display: none;
      align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(20,30,60,0.55), rgba(3,4,10,0.85));
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff;
    }
    #starmap .sm-panel {
      width: min(680px, 90vw); padding: 24px 28px;
      background: rgba(8,12,24,0.92); border: 1px solid #2d4a78;
      border-radius: 10px; box-shadow: 0 0 40px rgba(60,140,255,0.25);
    }
    #starmap .sm-title { font-size: 22px; letter-spacing: 4px; color: #ff5db1;
      text-shadow: 0 0 12px rgba(255,93,177,0.6); margin-bottom: 6px; }
    #starmap .sm-sub { font-size: 12px; opacity: 0.6; margin-bottom: 16px; }
    #starmap .sm-list { list-style: none; }
    #starmap .sm-item {
      display: grid; grid-template-columns: 32px 1fr auto auto; gap: 14px;
      align-items: center; padding: 10px 10px; border-radius: 6px;
      cursor: pointer; border: 1px solid transparent;
    }
    #starmap .sm-item:hover { background: rgba(60,120,220,0.15); border-color: #3a6ab0; }
    #starmap .sm-key { width: 24px; height: 24px; display: grid; place-items: center;
      background: #1b2e52; border-radius: 5px; color: #9fe7ff; font-size: 13px; }
    #starmap .sm-name { font-size: 16px; color: #eaf6ff; }
    #starmap .sm-theme { font-size: 12px; opacity: 0.6; }
    #starmap .sm-dist { font-size: 13px; color: #9fe7ff; opacity: 0.85; }
  `;
  document.head.appendChild(s);
}
