// Renderer-agnostic quest framework + the campaign. A quest is an ordered list of
// steps; the QuestLog tracks the active quest's progress and persists it on the
// player. Step types: talk (to a named NPC at a world), travel (land at a world),
// kill (destroy N raiders). Completion pays the reward. See issue #4.

export const QUESTS = [
  {
    id: 'maw-job',
    name: 'The Maw Job',
    giver: 'Vex',
    giverWorld: 'neon-haven',
    intro: [
      "Vex slides into the booth across from you, hood still up.",
      "\"A simple run. Pick up a package, lose anyone who follows, drop it at The Maw. Pays well — and the right people will owe you.\"",
    ],
    reward: { credits: 1500 },
    steps: [
      { type: 'talk', npc: 'vex', world: 'neon-haven', desc: 'Take the job from Vex (Neon Haven)',
        say: ["\"Good. The package is already aboard your ship. Run it quiet.\""] },
      { type: 'travel', world: 'dust-reach', desc: 'Lay low at Dust Reach' },
      { type: 'kill', count: 3, desc: 'Shake the tail — destroy 3 raiders' },
      { type: 'travel', world: 'the-maw', desc: 'Run the package to The Maw' },
      { type: 'talk', npc: 'vex', world: 'the-maw', final: true, desc: 'Hand off to Vex at The Maw',
        say: ["\"Clean work, Corsair. The Maw remembers its friends. We'll be in touch.\""] },
    ],
  },
];

export const questById = (id) => QUESTS.find((q) => q.id === id);

export class QuestLog {
  constructor(player) {
    this.player = player;
    if (!player.questState) player.questState = { active: null, step: 0, kill: 0, done: [] };
    this.s = player.questState;
  }

  get active() { return this.s.active ? questById(this.s.active) : null; }
  get stepIndex() { return this.s.step; }
  currentStep() { const q = this.active; return q ? q.steps[this.s.step] : null; }
  isDone(id) { return this.s.done.includes(id); }
  isAvailable(id) { return !this.s.active && !this.isDone(id); }

  objective() {
    const st = this.currentStep();
    if (!st) return null;
    if (st.type === 'kill') return `${this.active.name}: ${st.desc} (${this.s.kill}/${st.count})`;
    return `${this.active.name}: ${st.desc}`;
  }

  start(id) {
    if (this.s.active || this.isDone(id) || !questById(id)) return false;
    this.s.active = id; this.s.step = 0; this.s.kill = 0;
    this.player.save();
    return true;
  }

  // Should a quest-giver NPC for `npcId` appear at `worldId` right now?
  npcHere(npcId, worldId) {
    const q = questById('maw-job');
    if (this.isAvailable('maw-job') && q.giverWorld === worldId && npcId === q.giver.toLowerCase()) return true;
    const st = this.currentStep();
    return !!(st && st.type === 'talk' && st.npc === npcId && st.world === worldId);
  }

  // Talking: starts the quest if offered, then advances the current talk step.
  talk(npcId, worldId) {
    if (this.isAvailable('maw-job') && npcId === 'vex' && worldId === 'neon-haven') this.start('maw-job');
    const st = this.currentStep();
    if (st && st.type === 'talk' && st.npc === npcId && st.world === worldId) return this._advance();
    return { advanced: false };
  }

  onArrive(worldId) {
    const st = this.currentStep();
    if (st && st.type === 'travel' && st.world === worldId) return this._advance();
    return { advanced: false };
  }

  onKill() {
    const st = this.currentStep();
    if (!st || st.type !== 'kill') return { advanced: false };
    this.s.kill += 1;
    if (this.s.kill >= st.count) { this.s.kill = 0; return this._advance(); }
    this.player.save();
    return { advanced: true, progress: true };
  }

  _advance() {
    const q = this.active;
    this.s.step += 1;
    if (this.s.step >= q.steps.length) {
      const reward = q.reward || {};
      if (reward.credits) this.player.addCredits(reward.credits);
      this.s.done.push(q.id);
      this.s.active = null; this.s.step = 0; this.s.kill = 0;
      this.player.save();
      return { advanced: true, completed: true, quest: q, reward };
    }
    this.player.save();
    return { advanced: true, completed: false, step: this.currentStep() };
  }
}
