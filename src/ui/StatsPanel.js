// Records overlay: lifetime run stats + achievement grid (locked/unlocked).
// Opened from the pause menu; sits above it (like the saves manager). See issue #12.
import { ACHIEVEMENTS, STAT_LABELS } from '../game/Achievements.js';
import { WORLDS } from '../world/Worlds.js';

export class StatsPanel {
  constructor({ onClose } = {}) {
    this.onClose = onClose || (() => {});
    this.isOpen = false;
    this.root = document.createElement('div');
    this.root.id = 'stats';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    injectStyles();
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
  }

  open(player) { this.player = player; this.isOpen = true; this.render(); this.root.style.display = 'flex'; }
  close() { this.root.style.display = 'none'; this.isOpen = false; this.onClose(); }

  render() {
    const p = this.player;
    const s = p.runStats || {};
    const fmt = (n) => (n || 0).toLocaleString();

    const statRows = STAT_LABELS.map(([key, label]) =>
      `<div class="st-row"><span class="st-lbl">${label}</span><span class="st-val">${fmt(s[key])}</span></div>`).join('');

    const repTierColor = { Hostile: '#ff5b6e', Disliked: '#ff8a6e', Neutral: '#9fe7ff', Friendly: '#9effa0', Allied: '#ffd24a' };
    const standings = WORLDS.map((w) => {
      const tier = p.repTier(w.id); const r = p.repOf(w.id);
      return `<div class="st-row"><span class="st-lbl">${w.name}</span>
        <span class="st-val" style="color:${repTierColor[tier]}">${tier} (${r > 0 ? '+' : ''}${r})</span></div>`;
    }).join('');

    const unlocked = p.achievements.length;
    const cards = ACHIEVEMENTS.map((a) => {
      const got = p.hasAchievement(a.id);
      return `<div class="st-card ${got ? 'got' : 'locked'}">
        <div class="st-ico">${got ? '★' : '☆'}</div>
        <div><div class="st-nm">${got ? a.name : '???'}</div>
        <div class="st-ds">${a.desc}</div></div></div>`;
    }).join('');

    this.root.innerHTML = `<div class="st-panel">
      <div class="st-title">RECORDS</div>
      <div class="st-sub">Lifetime stats · ${unlocked}/${ACHIEVEMENTS.length} achievements. [Esc] / BACK to return.</div>
      <div class="st-career">
        <div class="st-score"><div class="st-score-n">${fmt(p.careerScore())}</div><div class="st-score-l">CAREER SCORE</div></div>
        <div class="st-score"><div class="st-score-n">${fmt(p.peakCredits)} cr</div><div class="st-score-l">PEAK CREDITS</div></div>
      </div>
      <div class="st-grid-stats">${statRows}</div>
      <div class="st-sec">STANDING</div>
      <div class="st-grid-stats">${standings}</div>
      <div class="st-sec">ACHIEVEMENTS</div>
      <div class="st-grid-ach">${cards}</div>
      <button class="st-btn back" data-back>BACK</button>
    </div>`;
    this.root.querySelector('[data-back]').onclick = () => this.close();
  }
}

function injectStyles() {
  if (document.getElementById('stats-style')) return;
  const s = document.createElement('style');
  s.id = 'stats-style';
  s.textContent = `
    #stats { position: fixed; inset: 0; z-index: 18; display: none; align-items: center;
      justify-content: center; background: rgba(3,4,10,0.85);
      font-family: "Consolas", ui-monospace, monospace; color: #cfeaff; }
    #stats .st-panel { width: min(620px, 92vw); max-height: 88vh; overflow: auto; padding: 22px 26px;
      background: rgba(8,12,24,0.97); border: 1px solid #2d4a78; border-radius: 10px;
      box-shadow: 0 0 40px rgba(60,140,255,0.25); }
    #stats .st-title { font-size: 22px; letter-spacing: 5px; color: #ff5db1; text-align: center;
      text-shadow: 0 0 12px rgba(255,93,177,0.6); margin-bottom: 6px; }
    #stats .st-sub { font-size: 12px; opacity: 0.6; margin-bottom: 14px; text-align: center; }
    #stats .st-sec { font-size: 11px; letter-spacing: 3px; opacity: 0.5; margin: 16px 0 10px; }
    #stats .st-career { display: flex; gap: 12px; margin-bottom: 14px; }
    #stats .st-score { flex: 1; text-align: center; padding: 10px; border: 1px solid #2d4a78;
      border-radius: 8px; background: rgba(20,40,72,0.3); }
    #stats .st-score-n { font-size: 22px; color: #ffe6a0; text-shadow: 0 0 10px rgba(255,210,120,0.4); }
    #stats .st-score-l { font-size: 10px; letter-spacing: 2px; opacity: 0.6; margin-top: 2px; }
    #stats .st-grid-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
    #stats .st-row { display: flex; justify-content: space-between; padding: 6px 10px;
      border-bottom: 1px solid #16243c; font-size: 13px; }
    #stats .st-val { color: #ffe6a0; }
    #stats .st-grid-ach { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    #stats .st-card { display: flex; gap: 10px; align-items: center; padding: 9px 11px;
      border: 1px solid #1c2c48; border-radius: 7px; }
    #stats .st-card.got { border-color: #b58a2a; background: rgba(80,60,10,0.25); }
    #stats .st-card.locked { opacity: 0.5; }
    #stats .st-ico { font-size: 20px; color: #ffd24a; }
    #stats .st-card.locked .st-ico { color: #5a6478; }
    #stats .st-nm { font-size: 14px; color: #eaf6ff; }
    #stats .st-ds { font-size: 11px; opacity: 0.7; }
    #stats .st-btn { padding: 10px; font-family: inherit; font-size: 13px; color: #dff1ff;
      background: #16365f; border: 1px solid #3a6ab0; border-radius: 6px; cursor: pointer; }
    #stats .st-btn.back { width: 100%; margin-top: 16px; }
    #stats .st-btn:hover { background: #1f4f8c; }
  `;
  document.head.appendChild(s);
}
