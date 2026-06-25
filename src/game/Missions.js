// Renderer-agnostic mission system. Delivery missions are generated at a world's
// mission board (destination = some other world) and complete when the player
// lands at the destination, paying out credits. Active missions persist in memory
// for the session (kept simple; could be saved alongside Player later).
import { WORLDS } from '../world/Worlds.js';
import { SMUGGLER_SCAN_MULT } from './Player.js';

const CARGO = ['med-gel', 'reactor cores', 'spice crates', 'salvaged tech', 'contraband', 'star maps'];

let _idCounter = 1;
// random suffix keeps ids unique across sessions (persisted missions vs fresh offers)
function nextId() { return `m${_idCounter++}_${Math.floor(Math.random() * 1e6).toString(36)}`; }

// Deterministic-enough offers per origin world, regenerated when first viewed:
// a couple of delivery jobs plus a bounty hunt.
export function generateOffers(fromWorldId, count = 3) {
  const others = WORLDS.filter((w) => w.id !== fromWorldId);
  const offers = [];
  for (let k = 0; k < count && others.length; k++) {
    const to = others[(k * 2 + 1) % others.length];
    const cargo = CARGO[(k + fromWorldId.length) % CARGO.length];
    const dist = Math.round(distanceBetween(fromWorldId, to.id) / 10);
    const illegal = cargo === 'contraband' || cargo === 'spice crates';
    const units = 2 + (k % 4); // hold space the cargo occupies
    const reward = 150 + dist * 4 + k * 40 + (illegal ? 120 : 0); // contraband pays a premium
    offers.push({
      id: nextId(),
      type: 'delivery',
      from: fromWorldId,
      to: to.id,
      toName: to.name,
      cargo,
      units,
      illegal,
      reward,
      title: `Deliver ${cargo} to ${to.name}`,
    });
  }
  // one bounty contract
  const target = 3 + (fromWorldId.length % 3);
  offers.push({
    id: nextId(),
    type: 'bounty',
    from: fromWorldId,
    target,
    progress: 0,
    reward: 220 + target * 60,
    title: `Bounty: destroy ${target} raiders`,
  });
  return offers;
}

// Wanted-level customs: arriving "hot" at a secure port can get you stopped and
// fined for your heat alone — no contraband required. Higher security and heat
// raise the odds and the fine; good standing buys leniency. Returns the fine
// amount in credits (0 = waved through).
export function customsHeatStop(security = 0, wanted = 0, rep = 0, rng = Math.random) {
  if (security <= 0 || wanted <= 0) return 0;
  const leniency = Math.max(0.2, 1 - Math.max(0, rep) / 150);
  const chance = security * (wanted / 5) * leniency;
  if (rng() >= chance) return 0;
  return wanted * 120 + Math.round(security * 100);
}

function distanceBetween(aId, bId) {
  const a = WORLDS.find((w) => w.id === aId);
  const b = WORLDS.find((w) => w.id === bId);
  if (!a || !b) return 0;
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class MissionLog {
  constructor(player) {
    this.player = player;
    if (!player.missionsActive) player.missionsActive = [];
  }

  // canonical list lives on the player so it persists with the save
  get active() { return this.player.missionsActive; }

  has(id) { return this.active.some((m) => m.id === id); }

  accept(mission) {
    if (this.active.length >= 4) return { ok: false, reason: 'Mission log full (4 max).' };
    if (this.has(mission.id)) return { ok: false, reason: 'Already accepted.' };
    if ((mission.units || 0) > this.player.cargoFree()) return { ok: false, reason: 'Not enough cargo space.' };
    this.active.push(mission);
    this.player.save();
    return { ok: true };
  }

  // Customs scan on landing: illegal cargo bound elsewhere can be seized at a
  // secure port. Higher world security raises the odds; good standing lowers them.
  // Returns the confiscated missions (host applies the fine/rep hit).
  runCustoms(worldId, security = 0, rep = 0, rng = Math.random) {
    if (security <= 0) return [];
    const holdMult = this.player.hasSmugglerHold ? SMUGGLER_SCAN_MULT : 1;
    const chance = security * Math.max(0.15, 1 - Math.max(0, rep) / 150) * holdMult;
    const caught = this.active.filter((m) =>
      m.type === 'delivery' && m.illegal && m.to !== worldId && rng() < chance);
    if (caught.length) {
      this.player.missionsActive = this.active.filter((m) => !caught.includes(m));
      this.player.save();
    }
    return caught;
  }

  // Call on arrival at a world; completes & pays any deliveries bound here.
  arriveAt(worldId) {
    const done = this.active.filter((m) => m.type === 'delivery' && m.to === worldId);
    for (const m of done) this._complete(m);
    this.player.missionsActive = this.active.filter((m) => !done.includes(m));
    this.player.save();
    return done; // list of completed missions (for toast/UI)
  }

  // Call on each enemy kill; advances bounty contracts and completes finished ones.
  recordKill() {
    const done = [];
    for (const m of this.active) {
      if (m.type !== 'bounty') continue;
      m.progress = (m.progress || 0) + 1;
      if (m.progress >= m.target) done.push(m);
    }
    for (const m of done) this._complete(m);
    this.player.missionsActive = this.active.filter((m) => !done.includes(m));
    this.player.save();
    return done;
  }

  _complete(m) {
    this.player.addCredits(m.reward);
    if (!this.player.completed.includes(m.id)) this.player.completed.push(m.id);
    this.player.save();
  }
}
