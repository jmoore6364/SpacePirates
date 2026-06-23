// Journal overlay: lists the active quest with its current objective, plus
// available, locked, and completed storylines. Reads the shared QuestLog. Opened
// from the pause menu; sits above it like the records/controls panels.
import { QUESTS, questById } from '../game/Quests.js';
import { WORLDS } from '../world/Worlds.js';

const worldName = (id) => WORLDS.find((w) => w.id === id)?.name || id;

export class QuestPanel {
  constructor({ onClose } = {}) {
    this.onClose = onClose || (() => {});
    this.isOpen = false;
    this.root = document.createElement('div');
    this.root.id = 'journal';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    injectStyles();
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
  }

  open(log) { this.log = log; this.isOpen = true; this.render(); this.root.style.display = 'flex'; }
  close() { this.root.style.display = 'none'; this.isOpen = false; this.onClose(); }

  render() {
    const log = this.log;
    const active = log.active;
    let body = '';

    if (active) {
      const total = active.steps.length;
      body += `<div class="jr-sec">ACTIVE</div>
        <div class="jr-card active">
          <div class="jr-nm">${active.name} <span class="jr-prog">Step ${log.stepIndex + 1}/${total}</span></div>
          <div class="jr-obj">▸ ${log.objective() || 'Complete the objective.'}</div>
        </div>`;
    }

    const available = QUESTS.filter((q) => log.isAvailable(q.id));
    if (available.length) {
      body += `<div class="jr-sec">AVAILABLE</div>` + available.map((q) =>
        `<div class="jr-card"><div class="jr-nm">${q.name}</div>
          <div class="jr-obj">Speak to <b>${q.giver}</b> at <b>${worldName(q.giverWorld)}</b> · reward ${q.reward?.credits || 0} cr</div></div>`).join('');
    }

    const locked = QUESTS.filter((q) => !log.isDone(q.id) && (!active || active.id !== q.id) && !log.isAvailable(q.id));
    if (locked.length) {
      body += `<div class="jr-sec">LOCKED</div>` + locked.map((q) => {
        const why = q.requires ? `Complete <b>${questById(q.requires)?.name || q.requires}</b> first` : 'Not yet available';
        return `<div class="jr-card locked"><div class="jr-nm">${q.name}</div><div class="jr-obj">🔒 ${why}</div></div>`;
      }).join('');
    }

    const completed = QUESTS.filter((q) => log.isDone(q.id));
    if (completed.length) {
      body += `<div class="jr-sec">COMPLETED</div>` + completed.map((q) =>
        `<div class="jr-card done"><div class="jr-nm">✓ ${q.name}</div></div>`).join('');
    }

    if (!body) body = '<div class="jr-empty">No storylines yet. Look for quest-givers in cities.</div>';

    this.root.innerHTML = `<div class="jr-panel">
      <div class="jr-title">JOURNAL</div>
      <div class="jr-sub">Your storylines. [Esc] / BACK to return.</div>
      ${body}
      <button class="jr-btn back" data-back>BACK</button>
    </div>`;
    this.root.querySelector('[data-back]').onclick = () => this.close();
  }
}

function injectStyles() {
  if (document.getElementById('journal-style')) return;
  const s = document.createElement('style');
  s.id = 'journal-style';
  s.textContent = `
    #journal { position: fixed; inset: 0; z-index: 18; display: none; align-items: center;
      justify-content: center; background: rgba(3,4,10,0.85);
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff; }
    #journal .jr-panel { width: min(560px, 92vw); max-height: 88vh; overflow: auto; padding: 22px 26px;
      background: rgba(8,12,24,0.97); border: 1px solid #2d4a78; border-radius: 10px;
      box-shadow: 0 0 40px rgba(60,140,255,0.25); }
    #journal .jr-title { font-size: 22px; letter-spacing: 5px; color: #ff5db1; text-align: center;
      text-shadow: 0 0 12px rgba(255,93,177,0.6); margin-bottom: 6px; }
    #journal .jr-sub { font-size: 12px; opacity: 0.6; margin-bottom: 14px; text-align: center; }
    #journal .jr-sec { font-size: 11px; letter-spacing: 3px; opacity: 0.5; margin: 14px 0 8px; }
    #journal .jr-card { padding: 10px 12px; border: 1px solid #1c2c48; border-radius: 7px; margin-bottom: 8px; }
    #journal .jr-card.active { border-color: #ffd24a; background: rgba(80,60,10,0.2); }
    #journal .jr-card.done { opacity: 0.55; }
    #journal .jr-card.locked { opacity: 0.6; }
    #journal .jr-nm { font-size: 15px; color: #eaf6ff; }
    #journal .jr-prog { font-size: 11px; color: #ffd24a; letter-spacing: 1px; }
    #journal .jr-obj { font-size: 12px; opacity: 0.8; margin-top: 3px; }
    #journal .jr-empty { opacity: 0.6; font-size: 13px; text-align: center; padding: 20px 0; }
    #journal .jr-btn { width: 100%; margin-top: 14px; padding: 10px; font-family: inherit; font-size: 13px;
      color: #dff1ff; background: #16365f; border: 1px solid #3a6ab0; border-radius: 6px; cursor: pointer; }
    #journal .jr-btn:hover { background: #1f4f8c; }
  `;
  document.head.appendChild(s);
}
