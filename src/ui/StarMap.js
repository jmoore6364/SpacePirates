// Star-map overlay: a spatial top-down map of the cluster PLUS a selectable list.
// Open with M; pick a destination by number key or click to fast-travel. The map
// plots worlds to scale with the player, the sun, mission/quest destinations, and
// live market events. Travel is delegated via onTravel(worldId). See issue #6.
const SUN = [-1500, -1200]; // sun x,z (matches SpaceScene)

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
        <div class="sm-sub">Select a destination — number key or click. ◇ mission · ▲▼ market event. [M]/[Esc] close.</div>
        <canvas class="sm-map" width="620" height="300"></canvas>
        <ul class="sm-list"></ul>
      </div>`;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    this.list = this.root.querySelector('.sm-list');
    this.canvas = this.root.querySelector('.sm-map');
    injectStyles();
  }

  toggle(worlds, shipPos, info) {
    if (this.isOpen) this.close();
    else this.open(worlds, shipPos, info);
  }

  open(worlds, shipPos, info = {}) {
    this.worlds = worlds;
    const missionDest = info.missionDest || new Set();
    const events = info.events || [];
    const eventBy = new Map(events.map((e) => [e.world, e]));

    this.list.innerHTML = '';
    worlds.forEach((w, idx) => {
      const dx = shipPos.x - w.position[0];
      const dy = shipPos.y - w.position[1];
      const dz = shipPos.z - w.position[2];
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
      const tags = [];
      if (missionDest.has(w.id)) tags.push('<span class="sm-flag mis">◇ job</span>');
      const ev = eventBy.get(w.id);
      if (ev) tags.push(`<span class="sm-flag ev">${ev.kind === 'shortage' ? '▲' : '▼'} ${ev.kind}</span>`);
      const li = document.createElement('li');
      li.className = 'sm-item';
      li.innerHTML = `
        <span class="sm-key">${idx + 1}</span>
        <span class="sm-name">${w.name}</span>
        <span class="sm-theme">${w.theme} ${tags.join(' ')}</span>
        <span class="sm-dist">${dist} u</span>`;
      li.addEventListener('click', () => this.select(idx));
      this.list.appendChild(li);
    });

    this._drawMap(shipPos, info, missionDest, eventBy);
    this.root.style.display = 'flex';
    this.isOpen = true;
  }

  _drawMap(shipPos, info, missionDest, eventBy) {
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(80,200,255,0.25)'; ctx.strokeRect(1, 1, W - 2, H - 2);

    // bounds over worlds + sun + ship (x,z plane)
    const pts = this.worlds.map((w) => [w.position[0], w.position[2]]);
    pts.push(SUN, [shipPos.x, shipPos.z]);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const padX = (maxX - minX) * 0.12 + 60, padZ = (maxZ - minZ) * 0.12 + 60;
    minX -= padX; maxX += padX; minZ -= padZ; maxZ += padZ;
    const m = 28;
    const sx = (W - m * 2) / (maxX - minX), sz = (H - m * 2) / (maxZ - minZ);
    const px = (x) => m + (x - minX) * sx, py = (z) => m + (z - minZ) * sz;

    // sun
    const su = [px(SUN[0]), py(SUN[1])];
    const g = ctx.createRadialGradient(su[0], su[1], 1, su[0], su[1], 26);
    g.addColorStop(0, 'rgba(255,230,150,0.95)'); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(su[0], su[1], 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#aab'; ctx.font = '10px Consolas, monospace'; ctx.textAlign = 'center';
    ctx.fillText('sun', su[0], su[1] + 36);

    // worlds
    ctx.font = '11px Consolas, monospace';
    for (const w of this.worlds) {
      const x = px(w.position[0]), y = py(w.position[2]);
      const col = '#' + (w.atmo >>> 0).toString(16).padStart(6, '0');
      if (missionDest.has(w.id)) { ctx.strokeStyle = '#9effa0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dfeefc'; ctx.fillText(w.name, x, y - 11);
      const ev = eventBy.get(w.id);
      if (ev) { ctx.fillStyle = '#ffd24a'; ctx.fillText(ev.kind === 'shortage' ? '▲' : '▼', x + 16, y + 4); }
    }

    // player ship + heading
    const fx = info.shipForward ? info.shipForward.x : 0;
    const fz = info.shipForward ? info.shipForward.z : 1;
    const a = Math.atan2(fx, fz);
    const sxp = px(shipPos.x), syp = py(shipPos.z);
    ctx.save(); ctx.translate(sxp, syp); ctx.rotate(-a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  close() { this.root.style.display = 'none'; this.isOpen = false; }

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
      width: min(700px, 92vw); padding: 22px 26px;
      background: rgba(8,12,24,0.92); border: 1px solid #2d4a78;
      border-radius: 10px; box-shadow: 0 0 40px rgba(60,140,255,0.25);
    }
    #starmap .sm-title { font-size: 22px; letter-spacing: 4px; color: #ff5db1;
      text-shadow: 0 0 12px rgba(255,93,177,0.6); margin-bottom: 6px; }
    #starmap .sm-sub { font-size: 12px; opacity: 0.6; margin-bottom: 12px; }
    #starmap .sm-map { width: 100%; height: auto; display: block; border-radius: 8px;
      border: 1px solid #1c2c48; margin-bottom: 14px; }
    #starmap .sm-list { list-style: none; }
    #starmap .sm-item {
      display: grid; grid-template-columns: 32px 1fr auto auto; gap: 14px;
      align-items: center; padding: 8px 10px; border-radius: 6px;
      cursor: pointer; border: 1px solid transparent;
    }
    #starmap .sm-item:hover { background: rgba(60,120,220,0.15); border-color: #3a6ab0; }
    #starmap .sm-key { width: 24px; height: 24px; display: grid; place-items: center;
      background: #1b2e52; border-radius: 5px; color: #9fe7ff; font-size: 13px; }
    #starmap .sm-name { font-size: 16px; color: #eaf6ff; }
    #starmap .sm-theme { font-size: 12px; opacity: 0.6; }
    #starmap .sm-dist { font-size: 13px; color: #9fe7ff; opacity: 0.85; }
    #starmap .sm-flag { font-size: 11px; padding: 1px 6px; border-radius: 4px; margin-left: 4px; }
    #starmap .sm-flag.mis { background: #14401f; color: #9effa0; }
    #starmap .sm-flag.ev { background: #3a2e10; color: #ffd24a; }
  `;
  document.head.appendChild(s);
}
