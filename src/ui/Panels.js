// DOM overlay panels for on-foot interactions: the Trader (ship upgrades), the
// Mission Board (delivery + bounty jobs), and the Market (commodity trading).
// All read/write the shared player + mission log and call onClose so the scene
// can unlock input.
import { UPGRADES, SKILLS, MISSILE_PRICE, WINGMAN_PRICE } from '../game/Player.js';
import { HULLS } from '../game/Hulls.js';
import { WEAPONS, ARMORS } from '../game/Weapons.js';
import { marketTable, buy as marketBuy, sell as marketSell, activeEventsFor, commodityById, refuel, FUEL_PRICE } from '../game/Market.js';

const commodityName = (id) => commodityById(id)?.name || id;

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
    .vc-dlg p { font-size: 14px; line-height: 1.6; margin: 0 0 10px; color: #dfeefc; }
    .vc-dlg { margin-bottom: 14px; }
    .vc-x { position: fixed; top: 14px; right: 14px; z-index: 14;
      width: 46px; height: 46px; display:flex; align-items:center; justify-content:center;
      border-radius: 8px; border: 1px solid #3a6ab0; background: rgba(16,40,72,0.92);
      color: #dff1ff; font-size: 20px; line-height: 1; cursor: pointer; font-family: inherit; }
    .vc-x:hover { background: #1f4f8c; }
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

    // Tap-to-close affordances — essential on touch, where there's no [Esc]/[E] key
    // and the overlay covers the on-screen buttons. A persistent ✕ plus tapping the
    // dim backdrop outside the panel both close it.
    this._x = document.createElement('button');
    this._x.className = 'vc-x';
    this._x.type = 'button';
    this._x.textContent = '✕';
    this._x.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    // render() replaces innerHTML (wiping the button) — re-attach it after each change
    if (typeof MutationObserver !== 'undefined') {
      this._obs = new MutationObserver(() => {
        if (this.isOpen && !this.root.contains(this._x)) this.root.appendChild(this._x);
      });
      this._obs.observe(this.root, { childList: true });
    }
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
    const sub = (m) => m.type === 'bounty'
      ? `Bounty hunt · progress ${m.progress || 0}/${m.target}`
      : `Cargo: ${m.cargo} · deliver on arrival`;

    const active = this.log.active.map((m) =>
      `<div class="vc-row"><div><div class="nm">${m.title}</div>
       <div class="ds">Reward ${m.reward} cr · ${sub(m)}</div></div>
       <span class="vc-tag">ACTIVE</span><span></span></div>`).join('') ||
      `<div class="vc-empty">No active jobs.</div>`;

    const offers = this.offers.map((m) => {
      const taken = this.log.has(m.id);
      const full = this.log.active.length >= 4;
      const disabled = taken || full;
      return `<div class="vc-row"><div><div class="nm">${m.title}</div>
        <div class="ds">${sub(m)}</div></div>
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

export class Skills extends BasePanel {
  constructor(opts) { super('vc-skills', opts); }

  open(player) { this.player = player; this.isOpen = true; this.root.classList.add('open'); this.render(); }

  render() {
    const p = this.player;
    const rows = Object.entries(SKILLS).map(([id, def]) => {
      const lvl = p.skillLevel(id);
      const pips = '◆'.repeat(lvl) + '◇'.repeat(def.max - lvl);
      const can = p.skillPoints > 0 && lvl < def.max;
      return `<div class="vc-row"><div><div class="nm">${def.name} <span class="vc-pips">${pips}</span></div>
        <div class="ds">${def.desc}</div></div><span></span>
        <button class="vc-btn" data-skill="${id}" ${can ? '' : 'disabled'}>+</button></div>`;
    }).join('');
    const pct = Math.round((p.xp / p.xpToNext()) * 100);
    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">◈ PILOT — LEVEL ${p.xpLevel}</div>
      <div class="vc-credits">${p.skillPoints} skill pts</div></div>
      <div class="vc-sub">XP ${p.xp}/${p.xpToNext()} (${pct}%) — spend points to upgrade. [K]/[Esc] to close.</div>
      ${rows}
      <div class="vc-foot">Earn XP from kills, deliveries, bounties, quests, and trades.</div>
    </div>`;
    this.root.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => {
      if (p.spendSkill(b.dataset.skill)) { this.render(); this.onChange && this.onChange(); }
    }));
  }
}

export class Shipyard extends BasePanel {
  constructor(opts) { super('vc-shipyard', opts); }

  open(player) { this.player = player; this.isOpen = true; this.root.classList.add('open'); this.render(); }

  render() {
    const p = this.player;
    const rows = HULLS.map((h) => {
      const owned = p.ownsHull(h.id);
      const active = p.hull === h.id;
      const b = h.base;
      const stat = `spd ${b.maxSpeed} · hull ${b.hull} · shield ${b.shield} · wpn ${b.weapon} · cargo ${b.cargo}`;
      let btn;
      if (active) btn = '<span class="vc-tag">ACTIVE</span>';
      else if (owned) btn = `<button class="vc-btn" data-equip="${h.id}">EQUIP</button>`;
      else btn = `<button class="vc-btn" data-buyhull="${h.id}" ${p.credits >= h.price ? '' : 'disabled'}>${h.price} cr</button>`;
      return `<div class="vc-row" style="grid-template-columns:1fr auto">
        <div><div class="nm">${h.name}</div><div class="ds">${h.desc}</div>
        <div class="ds" style="color:#9fe7ff">${stat}</div></div>
        <div>${btn}</div></div>`;
    }).join('');
    const wing = p.hasWingman
      ? `<div class="vc-row" style="grid-template-columns:1fr auto"><div><div class="nm">Wingman Escort</div>
         <div class="ds">Hired — a fighter flies your wing and fires on hostiles.</div></div><span class="vc-tag">HIRED</span></div>`
      : `<div class="vc-row" style="grid-template-columns:1fr auto"><div><div class="nm">Wingman Escort</div>
         <div class="ds">Hire a fighter to fly your wing and shoot down hostiles.</div></div>
         <button class="vc-btn" data-hire ${p.credits >= WINGMAN_PRICE ? '' : 'disabled'}>${WINGMAN_PRICE} cr</button></div>`;

    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">◈ SHIPYARD</div><div class="vc-credits">${p.credits} cr</div></div>
      <div class="vc-sub">Buy and switch hulls. New hull applies on your next launch. [E]/[Esc] to leave.</div>
      ${rows}
      <div class="vc-sub" style="opacity:.8;margin-top:10px">ESCORT</div>${wing}</div>`;
    const refresh = () => { this.render(); this.onChange && this.onChange(); };
    this.root.querySelectorAll('[data-buyhull]').forEach((b) => b.addEventListener('click', () => { if (p.buyHull(b.dataset.buyhull)) refresh(); }));
    this.root.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => { if (p.setHull(b.dataset.equip)) refresh(); }));
    const hire = this.root.querySelector('[data-hire]');
    if (hire) hire.addEventListener('click', () => { if (p.buyWingman()) refresh(); });
  }
}

export class Armory extends BasePanel {
  constructor(opts) { super('vc-armory', opts); }

  open(player) { this.player = player; this.isOpen = true; this.root.classList.add('open'); this.render(); }

  render() {
    const p = this.player;
    const rof = (cd) => `${(1 / cd).toFixed(cd < 0.15 ? 0 : 1)}/s`;

    const weapons = WEAPONS.map((w) => {
      const owned = p.ownsWeapon(w.id);
      const active = p.sidearm === w.id;
      const pellets = w.pellets > 1 ? ` ·  ${w.pellets} pellets` : '';
      const stat = `dmg ${w.dmg} · ${rof(w.cd)}${pellets}`;
      let btn;
      if (active) btn = '<span class="vc-tag">EQUIPPED</span>';
      else if (owned) btn = `<button class="vc-btn" data-equipw="${w.id}">EQUIP</button>`;
      else btn = `<button class="vc-btn" data-buyw="${w.id}" ${p.credits >= w.price ? '' : 'disabled'}>${w.price} cr</button>`;
      return `<div class="vc-row" style="grid-template-columns:1fr auto">
        <div><div class="nm">${w.name}</div><div class="ds">${w.desc}</div>
        <div class="ds" style="color:#9fe7ff">${stat}</div></div><div>${btn}</div></div>`;
    }).join('');

    const armor = ARMORS.map((a) => {
      const owned = p.ownsArmor(a.id);
      const active = p.armor === a.id;
      const stat = `max HP ${a.hp} · regen ${a.regen}/s${a.dr ? ` · -${Math.round(a.dr * 100)}% dmg` : ''}`;
      let btn;
      if (active) btn = '<span class="vc-tag">EQUIPPED</span>';
      else if (owned) btn = `<button class="vc-btn" data-equipa="${a.id}">EQUIP</button>`;
      else btn = `<button class="vc-btn" data-buya="${a.id}" ${p.credits >= a.price ? '' : 'disabled'}>${a.price} cr</button>`;
      return `<div class="vc-row" style="grid-template-columns:1fr auto">
        <div><div class="nm">${a.name}</div><div class="ds">${a.desc}</div>
        <div class="ds" style="color:#9fe7ff">${stat}</div></div><div>${btn}</div></div>`;
    }).join('');

    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">◈ ARMORY</div><div class="vc-credits">${p.credits} cr</div></div>
      <div class="vc-sub">Personal sidearms and armor for on-foot fights. Equip applies at once. [E]/[Esc] to leave.</div>
      <div class="vc-sub" style="opacity:.8">WEAPONS</div>${weapons}
      <div class="vc-sub" style="opacity:.8;margin-top:10px">ARMOR</div>${armor}
      <div class="vc-foot">Gunnery skill adds +4 bolt damage per level on top of your weapon.</div>
    </div>`;

    const refresh = () => { this.render(); this.onChange && this.onChange(); };
    this.root.querySelectorAll('[data-buyw]').forEach((b) => b.addEventListener('click', () => { if (p.buyWeapon(b.dataset.buyw)) refresh(); }));
    this.root.querySelectorAll('[data-equipw]').forEach((b) => b.addEventListener('click', () => { if (p.setWeapon(b.dataset.equipw)) refresh(); }));
    this.root.querySelectorAll('[data-buya]').forEach((b) => b.addEventListener('click', () => { if (p.buyArmor(b.dataset.buya)) refresh(); }));
    this.root.querySelectorAll('[data-equipa]').forEach((b) => b.addEventListener('click', () => { if (p.setArmor(b.dataset.equipa)) refresh(); }));
  }
}

export class Dialogue extends BasePanel {
  constructor(opts) { super('vc-dialogue', opts); }

  open(speaker, lines, onContinue) {
    this.isOpen = true;
    this.root.classList.add('open');
    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">${speaker}</div></div>
      <div class="vc-dlg">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      <button class="vc-btn" data-cont>CONTINUE</button>
    </div>`;
    this.root.querySelector('[data-cont]').addEventListener('click', () => {
      this.close();
      if (onContinue) onContinue();
    });
  }
}

export class Market extends BasePanel {
  constructor(opts) { super('vc-market', opts); }

  open(player, world) {
    this.player = player;
    this.world = world;
    this.isOpen = true;
    this.root.classList.add('open');
    this.render();
  }

  render() {
    const p = this.player;
    const table = marketTable(this.world.id);
    const rows = table.map((c) => {
      const have = p.cargoQty(c.id);
      const canBuy = p.credits >= c.buy && p.cargoFree() > 0;
      const flag = c.legal ? '' : ' <span class="vc-tag" style="background:#5a1b2e;color:#ff9bb0">illegal</span>';
      return `<div class="vc-row" style="grid-template-columns:1fr auto auto auto auto;gap:10px">
        <div><div class="nm">${c.name}${flag}</div>
        <div class="ds">hold: ${have}</div></div>
        <div class="vc-credits">buy ${c.buy}</div>
        <button class="vc-btn" data-buy="${c.id}" ${canBuy ? '' : 'disabled'}>BUY</button>
        <div class="sh" style="color:#9fe7ff">sell ${c.sell}</div>
        <button class="vc-btn" data-sell="${c.id}" ${have > 0 ? '' : 'disabled'}>SELL</button>
      </div>`;
    }).join('');

    const evs = activeEventsFor(this.world.id);
    const banner = evs.length
      ? `<div class="vc-sub" style="color:#ffd24a;opacity:1">⚠ ${evs.map((e) => `${e.kind === 'shortage' ? '▲' : '▼'} ${commodityName(e.commodity)} ${e.kind}`).join(' · ')}</div>`
      : '';

    this.root.innerHTML = `<div class="vc-panel">
      <div class="vc-head"><div class="vc-title">◈ ${this.world.name.toUpperCase()} MARKET</div>
      <div class="vc-credits">${p.credits} cr</div></div>
      <div class="vc-sub">Buy low here, sell high elsewhere. Hold ${p.cargoUsed()}/${p.cargoCap()}. · Standing: <b style="color:#9effa0">${p.repTier(this.world.id)}</b> (${p.repOf(this.world.id) > 0 ? '+' : ''}${p.repOf(this.world.id)}). [E]/[Esc] to leave.</div>
      ${banner}
      <div class="vc-row" style="grid-template-columns:1fr auto auto;gap:10px;border-color:#2a4a2a">
        <div><div class="nm">Fuel <span class="vc-pips" style="color:#9effa0">${Math.round(p.fuel)}/${p.maxFuel}</span></div>
        <div class="ds">${FUEL_PRICE} cr / unit</div></div>
        <span></span>
        <button class="vc-btn" data-refuel ${p.fuel < p.maxFuel && p.credits >= FUEL_PRICE ? '' : 'disabled'}>REFUEL</button>
      </div>
      <div class="vc-row" style="grid-template-columns:1fr auto auto;gap:10px;border-color:#4a3a1a">
        <div><div class="nm">Missiles <span class="vc-pips" style="color:#ffd24a">${p.missiles}/${p.maxMissiles}</span></div>
        <div class="ds">${MISSILE_PRICE} cr each · rearm ${p.missileRestockCost()} cr</div></div>
        <span></span>
        <button class="vc-btn" data-rearm ${p.missiles < p.maxMissiles && p.credits >= p.missileRestockCost() ? '' : 'disabled'}>REARM</button>
      </div>
      ${rows}
      <div class="vc-foot">Upgrade Cargo at the Trader to haul bigger loads.</div>
    </div>`;

    this.root.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      if (marketBuy(p, this.world.id, b.dataset.buy, 1).ok) { this.render(); this.onChange && this.onChange(); }
    }));
    this.root.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', () => {
      if (marketSell(p, this.world.id, b.dataset.sell, 1).ok) { this.render(); this.onChange && this.onChange(); }
    }));
    const rf = this.root.querySelector('[data-refuel]');
    if (rf) rf.addEventListener('click', () => { if (refuel(p).ok) { this.render(); this.onChange && this.onChange(); } });
    const rearm = this.root.querySelector('[data-rearm]');
    if (rearm) rearm.addEventListener('click', () => { if (p.buyMissiles()) { this.render(); this.onChange && this.onChange(); } });
  }
}
