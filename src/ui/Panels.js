// DOM overlay panels for on-foot interactions: the Trader (ship upgrades) and the
// Mission Board (accept delivery jobs). Both read/write the shared player + mission
// log and call onClose so the scene can unlock input.
import { UPGRADES } from '../game/Player.js';

function injectStyles() {
  if (document.getElementById('vc-panel-style')) return;
  const s = document.createElement('style');
  s.id = 'vc-panel-style';
  s.textContent = `
    .vc-overlay {
      position: fixed; inset: 0; z-index: 12; display: none;
      align-items: center; justify-content: center;
      background: radial-gradient(circle at 50% 40%, rgba(20,30,60,0.5), rgba(3,4,10,0.85));
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff;
    }
    .vc-overlay.open { display: flex; }
    .vc-panel { width: min(680px, 92vw); max-height: 84vh; overflow:auto; padding: 22px 26px;
      background: rgba(8,12,24,0.94); border: 1px solid #2d4a78; border-radius: 10px;
      box-shadow: 0 0 40px rgba(60,140,255,0.22); }
    .vc-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 6px; }
    .vc-title { font-size: 21px; letter-spacing: 3px; color: #ff5db1; text-shadow: 0 0 12px rgba(255,93,177,0.6); }
    .vc-credits { font-size: 15px; color: #ffe6a0; }
    .vc-sub { font-size: 12px; opacity: 0.6; margin-bottom: 16px; }
    .vc-row { display:grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items:center;
      padding: 10px; border-radius: 6px; border: 1px solid #1c2c48; margin-bottom: 8px; }
    .vc-row .nm { font-size: 15px; color: #eaf6ff; }
    .vc-row .ds { font-size: 12px; opacity: 0.6; }
    .vc-pips { letter-spacing: 2px; color: #66e0ff; font-size: 13px; }
    .vc-btn { padding: 7px 14px; border-radius: 6px; border: 1px solid #3a6ab0; cursor: pointer;
      background: #16365f; color: #dff1ff; font-family: inherit; font-size: 13px; }
    .vc-btn:hover:not(:disabled) { background: #1f4f8c; }
    .vc-btn:disabled { opacity: 0.4; cursor: default; }
    .vc-foot { margin-top: 12px; font-size: 12px; opacity: 0.55; text-align:center; }
    .vc-empty { opacity: 0.5; font-size: 13px; padding: 8px 2px; }
    .vc-tag { font-size: 11px; padding: 2px 7px; border-radius: 4px; background:#1b2e52; color:#9fe7ff; }
  `;
  document.head.appendChild(s);
}

class BasePanel {
  constructor(id, { onClose } = {}) {
    injectStyles();
    this.onClose = onClose || (() => {});
    this.isOpen = false;
    this.root = document.createElement('div');
    this.root.className = 'vc-overlay';
    this.root.id = id;
    document.body.appendChild(this.root);
  }
  close() {
    this.root.classList.remove('open');
    this.isOpen = false;
    this.onClose();
  }
}

export class Shop extends BasePanel {
  constructor(opts) { super('vc-shop', opts); this.player = null; }

  open(player) {
    this.player = player;
    this.isOpen = true;
    this.root.classList.add('open');
    this.render();
  }

  render() {
    const p = this.player;
    const rows = Object.entries(UPGRADES).map(([id, def]) => {
      const lvl = p.level(id);
      const pips = '◆'.repeat(lvl) + '◇'.repeat(def.max - lvl);
      const cost = p.costOf(id);
      const label = cost == null ? 'MAX' : `${cost} cr`;
      const disabled = cost == null || p.credits < cost;
      return `<div class="vc-row">
        <div><div class="nm">${def.name} <span class="vc-pips">${pips}</span></div>
        <div class="ds">${def.desc}</div></div>
        <div class="vc-credits">${label}</div>
        <button class="vc-btn" data-buy="${id}" ${disabled ? 'disabled' : ''}>BUY</button>
      </div>`;
    }).join('');
    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">◈ SHIP OUTFITTER</div>
      <div class="vc-credits">${p.credits} cr</div></div>
      <div class="vc-sub">Upgrade your ship. [E] / [Esc] to leave.</div>
      ${rows}
      <div class="vc-foot">Engine boosts top speed · others ready ship systems for the void.</div>
    </div>`;
    this.root.querySelectorAll('[data-buy]').forEach((b) => {
      b.addEventListener('click', () => {
        if (p.buyUpgrade(b.dataset.buy)) { this.render(); this.onChange && this.onChange(); }
      });
    });
  }
}

export class MissionBoard extends BasePanel {
  constructor(opts) { super('vc-missions', opts); }

  open(player, log, offers) {
    this.player = player; this.log = log; this.offers = offers;
    this.isOpen = true;
    this.root.classList.add('open');
    this.render();
  }

  render() {
    const active = this.log.active.map((m) =>
      `<div class="vc-row"><div><div class="nm">${m.title}</div>
       <div class="ds">Reward ${m.reward} cr · deliver on arrival</div></div>
       <span class="vc-tag">ACTIVE</span><span></span></div>`).join('') ||
      `<div class="vc-empty">No active jobs.</div>`;

    const offers = this.offers.map((m) => {
      const taken = this.log.has(m.id);
      const full = this.log.active.length >= 4;
      const disabled = taken || full;
      return `<div class="vc-row"><div><div class="nm">${m.title}</div>
        <div class="ds">Cargo: ${m.cargo}</div></div>
        <div class="vc-credits">${m.reward} cr</div>
        <button class="vc-btn" data-take="${m.id}" ${disabled ? 'disabled' : ''}>
          ${taken ? 'TAKEN' : 'ACCEPT'}</button></div>`;
    }).join('');

    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">◈ MISSION BOARD</div>
      <div class="vc-credits">${this.player.credits} cr</div></div>
      <div class="vc-sub">Accept delivery jobs; they pay out when you land at the destination. [E]/[Esc] to leave.</div>
      <div class="vc-sub" style="opacity:.8">ACTIVE</div>${active}
      <div class="vc-sub" style="opacity:.8;margin-top:10px">AVAILABLE</div>${offers}
    </div>`;
    this.root.querySelectorAll('[data-take]').forEach((b) => {
      b.addEventListener('click', () => {
        const m = this.offers.find((o) => o.id === b.dataset.take);
        if (m && this.log.accept(m).ok) { this.render(); this.onChange && this.onChange(); }
      });
    });
  }
}
