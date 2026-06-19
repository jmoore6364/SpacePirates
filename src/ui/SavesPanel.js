// Save-slot manager overlay: list slots with metadata; save to / load from / delete
// each. Operates via callbacks so the host owns the player + store. See issue #11.
import { listSlots, SLOT_COUNT } from '../game/SaveSlots.js';
import { hullById } from '../game/Hulls.js';

export class SavesPanel {
  constructor({ store, onSave, onLoad, onDelete, onClose } = {}) {
    this.store = store;
    this.onSave = onSave || (() => {});
    this.onLoad = onLoad || (() => {});
    this.onDelete = onDelete || (() => {});
    this.onClose = onClose || (() => {});
    this.isOpen = false;
    this.root = document.createElement('div');
    this.root.id = 'saves';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    injectStyles();
  }

  open(activeSlot) { this.activeSlot = activeSlot; this.isOpen = true; this.render(); this.root.style.display = 'flex'; }
  close() { this.root.style.display = 'none'; this.isOpen = false; this.onClose(); }

  render() {
    const slots = listSlots(this.store);
    const fmt = (t) => { try { return new Date(t).toLocaleString(); } catch { return ''; } };
    const rows = slots.map((s) => {
      const tag = s.slot === this.activeSlot ? ' <span class="sv-active">active</span>' : '';
      if (s.empty) {
        return `<div class="sv-row"><div><div class="sv-nm">Slot ${s.slot + 1}${tag}</div>
          <div class="sv-meta">— empty —</div></div>
          <div><button class="sv-btn" data-save="${s.slot}">SAVE</button></div></div>`;
      }
      const m = s.meta || {};
      return `<div class="sv-row"><div><div class="sv-nm">Slot ${s.slot + 1}${tag}</div>
        <div class="sv-meta">Lv ${m.level ?? 1} · ${m.credits ?? 0} cr · ${hullById(m.hull).name} · ${fmt(s.savedAt)}</div></div>
        <div class="sv-actions">
          <button class="sv-btn" data-save="${s.slot}">SAVE</button>
          <button class="sv-btn" data-load="${s.slot}">LOAD</button>
          <button class="sv-btn danger" data-del="${s.slot}">✕</button>
        </div></div>`;
    }).join('');
    this.root.innerHTML = `<div class="sv-panel">
      <div class="sv-title">SAVES</div>
      <div class="sv-sub">${SLOT_COUNT} slots — save to, load, or delete. [Esc] / BACK to return.</div>
      ${rows}
      <button class="sv-btn back" data-back>BACK</button>
    </div>`;
    this.root.querySelectorAll('[data-save]').forEach((b) => b.onclick = () => { this.onSave(+b.dataset.save); this.render(); });
    this.root.querySelectorAll('[data-load]').forEach((b) => b.onclick = () => this.onLoad(+b.dataset.load));
    this.root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { this.onDelete(+b.dataset.del); this.render(); });
    this.root.querySelector('[data-back]').onclick = () => this.close();
  }
}

function injectStyles() {
  if (document.getElementById('saves-style')) return;
  const s = document.createElement('style');
  s.id = 'saves-style';
  s.textContent = `
    #saves { position: fixed; inset: 0; z-index: 18; display: none; align-items: center;
      justify-content: center; background: rgba(3,4,10,0.85);
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff; }
    #saves .sv-panel { width: min(520px, 92vw); padding: 22px 26px; background: rgba(8,12,24,0.97);
      border: 1px solid #2d4a78; border-radius: 10px; box-shadow: 0 0 40px rgba(60,140,255,0.25); }
    #saves .sv-title { font-size: 22px; letter-spacing: 5px; color: #ff5db1; text-align: center;
      text-shadow: 0 0 12px rgba(255,93,177,0.6); margin-bottom: 6px; }
    #saves .sv-sub { font-size: 12px; opacity: 0.6; margin-bottom: 14px; text-align: center; }
    #saves .sv-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center;
      padding: 10px; border: 1px solid #1c2c48; border-radius: 7px; margin-bottom: 8px; }
    #saves .sv-nm { font-size: 14px; color: #eaf6ff; }
    #saves .sv-active { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #14401f; color: #9effa0; }
    #saves .sv-meta { font-size: 12px; opacity: 0.6; }
    #saves .sv-actions { display: flex; gap: 6px; }
    #saves .sv-btn { padding: 6px 12px; font-family: inherit; font-size: 12px; color: #dff1ff;
      background: #16365f; border: 1px solid #3a6ab0; border-radius: 5px; cursor: pointer; }
    #saves .sv-btn:hover { background: #1f4f8c; }
    #saves .sv-btn.danger { background: #4a1620; border-color: #7a2a38; }
    #saves .sv-btn.back { width: 100%; margin-top: 8px; }
  `;
  document.head.appendChild(s);
}
