// Renderer-agnostic quest framework + the campaign. A quest is an ordered list of
// steps; the QuestLog tracks the active quest's progress and persists it on the
// player. Step types: talk (to a named NPC at a world), travel (land at a world),
// kill (destroy N raiders), mine (mine N units of ore). Completion pays the
// reward. See issue #4.

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
  {
    id: 'cold-trail',
    name: 'Cold Trail',
    giver: 'Mara',
    giverWorld: 'cryo',
    requires: 'maw-job', // unlocks once you've proven yourself on The Maw Job
    intro: [
      "A frost-pale woman in a lab coat flags you down on the Cryo concourse.",
      "\"You're the Corsair who ran for The Maw. I'm Mara — I defected from the labs here, and they want me silenced.\"",
      "\"Help me bury the evidence and I'll make it very worth your while.\"",
    ],
    reward: { credits: 2600 },
    steps: [
      { type: 'talk', npc: 'mara', world: 'cryo', desc: 'Hear Mara out (Cryo Station)',
        say: ["\"Take this data core to my contact on Verdant. Quietly.\""] },
      { type: 'travel', world: 'verdant', desc: 'Deliver the data core to Verdant' },
      { type: 'kill', count: 4, desc: 'Lose the corporate hunters — destroy 4' },
      { type: 'travel', world: 'cryo', desc: 'Return to Mara at Cryo Station' },
      { type: 'talk', npc: 'mara', world: 'cryo', final: true, desc: 'Report back to Mara',
        say: ["\"It's done — they've nothing on me now. You're a rare kind of honest, Corsair. Thank you.\""] },
    ],
  },
  {
    id: 'deep-cut',
    name: 'Deep Cut',
    giver: 'Brak',
    giverWorld: 'the-maw',
    requires: 'cold-trail',
    intro: [
      "Brak, a slab of a man with a mining rig for an arm, blocks your path on The Maw docks.",
      "\"You want in with the crews here? Prove you can pull your weight — literally.\"",
      "\"Cut ore from the belt, fence it on Neon Haven, and bring the cut back to me.\"",
    ],
    reward: { credits: 3500 },
    steps: [
      { type: 'talk', npc: 'brak', world: 'the-maw', desc: 'Take the job from Brak (The Maw)',
        say: ["\"Belt's right outside. Shoot rock till your hold's heavy, then move it.\""] },
      { type: 'mine', count: 15, desc: 'Mine 15 ore from the belt' },
      { type: 'travel', world: 'neon-haven', desc: 'Fence the ore on Neon Haven' },
      { type: 'travel', world: 'the-maw', desc: 'Bring Brak his cut at The Maw' },
      { type: 'talk', npc: 'brak', world: 'the-maw', final: true, desc: 'Settle up with Brak',
        say: ["\"Hah! Knew you had it in you. The crews'll know your name now, Corsair.\""] },
    ],
  },
];

export const questById = (id) => QUESTS.find((q) => q.id === id);

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export class QuestLog {
  constructor(player) {
    this.player = player;
    if (!player.questState) player.questState = { active: null, step: 0, kill: 0, mine: 0, done: [] };
    this.s = player.questState;
  }

  get active() { return this.s.active ? questById(this.s.active) : null; }
  get stepIndex() { return this.s.step; }
  currentStep() { const q = this.active; return q ? q.steps[this.s.step] : null; }
  isDone(id) { return this.s.done.includes(id); }
  isAvailable(id) {
    if (this.s.active || this.isDone(id)) return false;
    const q = questById(id);
    if (q && q.requires && !this.isDone(q.requires)) return false; // gated behind a prior quest
    return true;
  }

  // The available quest offered by a giver standing at this world, if any.
  availableQuestAt(worldId) {
    return QUESTS.find((q) => this.isAvailable(q.id) && q.giverWorld === worldId) || null;
  }

  // Which quest NPC should appear at this world (an offer giver or a talk-step target).
  giverAt(worldId) {
    const avail = this.availableQuestAt(worldId);
    if (avail) return { npc: avail.giver.toLowerCase(), name: avail.giver };
    const st = this.currentStep();
    if (st && st.type === 'talk' && st.world === worldId) return { npc: st.npc, name: titleCase(st.npc) };
    return null;
  }

  // Dialogue lines for talking to `npcId` at `worldId` (offer intro or step lines).
  dialogueFor(npcId, worldId) {
    const avail = this.availableQuestAt(worldId);
    if (avail && avail.giver.toLowerCase() === npcId) return [...avail.intro, ...(avail.steps[0].say || [])];
    const st = this.currentStep();
    if (st && st.type === 'talk' && st.npc === npcId && st.world === worldId) return st.say || ['"..."'];
    return ['"Nothing for you right now, Corsair."'];
  }

  objective() {
    const st = this.currentStep();
    if (!st) return null;
    if (st.type === 'kill') return `${this.active.name}: ${st.desc} (${this.s.kill}/${st.count})`;
    if (st.type === 'mine') return `${this.active.name}: ${st.desc} (${this.s.mine || 0}/${st.count})`;
    return `${this.active.name}: ${st.desc}`;
  }

  start(id) {
    if (this.s.active || this.isDone(id) || !questById(id)) return false;
    this.s.active = id; this.s.step = 0; this.s.kill = 0; this.s.mine = 0;
    this.player.save();
    return true;
  }

  // Should a quest-giver NPC for `npcId` appear at `worldId` right now?
  npcHere(npcId, worldId) {
    const avail = this.availableQuestAt(worldId);
    if (avail && avail.giver.toLowerCase() === npcId) return true;
    const st = this.currentStep();
    return !!(st && st.type === 'talk' && st.npc === npcId && st.world === worldId);
  }

  // Talking: starts an offered quest if this is its giver, then advances a talk step.
  talk(npcId, worldId) {
    const avail = this.availableQuestAt(worldId);
    if (avail && avail.giver.toLowerCase() === npcId) this.start(avail.id);
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

  onMine(amount = 1) {
    const st = this.currentStep();
    if (!st || st.type !== 'mine') return { advanced: false };
    this.s.mine = (this.s.mine || 0) + amount;
    if (this.s.mine >= st.count) { this.s.mine = 0; return this._advance(); }
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
