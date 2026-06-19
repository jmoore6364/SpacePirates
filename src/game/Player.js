// Renderer-agnostic player economy + ship upgrades. Persists to localStorage when
// available (guarded so it stays unit-testable under Node). Upgrade levels feed
// derived ship stats the scenes read.
import { HULLS, hullById } from './Hulls.js';
import { writeSlot, readSlot, mostRecentSlot, migrateLegacy, hasAnySave } from './SaveSlots.js';

export const UPGRADES = {
  engine:  { name: 'Engine',  desc: 'Top speed',      max: 5, baseCost: 200, mult: 1.6, per: 90  },
  shields: { name: 'Shields', desc: 'Damage soak',    max: 5, baseCost: 250, mult: 1.7, per: 25  },
  weapons: { name: 'Weapons', desc: 'Laser damage',   max: 5, baseCost: 300, mult: 1.7, per: 8   },
  cargo:   { name: 'Cargo',   desc: 'Hold capacity',  max: 5, baseCost: 150, mult: 1.5, per: 10  },
  hull:    { name: 'Hull',    desc: 'Max integrity',  max: 5, baseCost: 220, mult: 1.6, per: 40  },
};

const DEFAULTS = () => ({
  credits: 500,
  upgrades: { engine: 0, shields: 0, weapons: 0, cargo: 0, hull: 0 },
  completed: [],
  cargo: {}, // { commodityId: qty }
  questState: { active: null, step: 0, kill: 0, done: [] },
  xp: 0,
  xpLevel: 1,
  skillPoints: 0,
  skills: { piloting: 0, gunnery: 0, trading: 0, engineering: 0 },
  hull: 'corsair',
  hullsOwned: ['corsair'],
  fuel: 100,
  maxFuel: 100,
});

// Fuel a fast-travel jump costs, by travel distance (manual flight is free).
export const fuelCost = (distance) => Math.max(1, Math.ceil(distance / 55));

// Skill tree (data-driven). Each level adds a flat perk to a derived stat.
export const SKILLS = {
  piloting:    { name: 'Piloting',    desc: '+30 top speed / level',     max: 5 },
  gunnery:     { name: 'Gunnery',     desc: '+4 weapon damage / level',  max: 5 },
  trading:     { name: 'Trading',     desc: '+3% buy/sell / level',      max: 5 },
  engineering: { name: 'Engineering', desc: '+15 shield, +20 hull / lvl', max: 5 },
};

export class Player {
  constructor(store = globalThis.localStorage) {
    this.store = store && typeof store.getItem === 'function' ? store : null;
    Object.assign(this, DEFAULTS());
    this.activeSlot = 0;
    if (this.store) {
      migrateLegacy(this.store);
      const recent = mostRecentSlot(this.store);
      if (recent != null) { this.activeSlot = recent; const d = readSlot(this.store, recent); if (d && d.state) this.applyState(d.state); }
    }
  }

  // Plain-object snapshot of all persisted state (used by SaveSlots).
  serialize() {
    return {
      credits: this.credits, upgrades: this.upgrades, completed: this.completed,
      cargo: this.cargo, questState: this.questState,
      xp: this.xp, xpLevel: this.xpLevel, skillPoints: this.skillPoints, skills: this.skills,
      hull: this.hull, hullsOwned: this.hullsOwned,
      fuel: this.fuel, maxFuel: this.maxFuel,
    };
  }

  applyState(obj) { Object.assign(this, DEFAULTS(), obj); }

  // Autosave writes to the active slot.
  save() { writeSlot(this.store, this.activeSlot, this); }

  // Slot operations (used by the save UI).
  saveToSlot(slot) { this.activeSlot = slot; writeSlot(this.store, slot, this); }
  loadFromSlot(slot) {
    const d = readSlot(this.store, slot);
    if (!d || !d.state) return false;
    this.applyState(d.state);
    this.activeSlot = slot;
    return true;
  }

  reset(slot = this.activeSlot) {
    Object.assign(this, DEFAULTS());
    this.activeSlot = slot;
    this.save();
  }

  hasSave() { return hasAnySave(this.store); }

  level(id) { return this.upgrades[id] || 0; }

  // --- experience & skills ---
  xpToNext() { return 80 + this.xpLevel * 40; }
  skillLevel(id) { return this.skills[id] || 0; }

  // Award XP; returns how many levels were gained (each grants a skill point).
  addXp(n) {
    if (n <= 0) return 0;
    this.xp += Math.round(n);
    let gained = 0;
    while (this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.xpLevel += 1;
      this.skillPoints += 1;
      gained += 1;
    }
    this.save();
    return gained;
  }

  spendSkill(id) {
    const def = SKILLS[id];
    if (!def || this.skillPoints <= 0 || this.skillLevel(id) >= def.max) return false;
    this.skills[id] = this.skillLevel(id) + 1;
    this.skillPoints -= 1;
    this.save();
    return true;
  }

  // Trade margin bonus from the Trading skill (0..0.15).
  tradeBonus() { return this.skillLevel('trading') * 0.03; }

  // --- fuel ---
  canJump(cost) { return this.fuel >= cost; }
  spendFuel(n) { this.fuel = Math.max(0, this.fuel - n); this.save(); }
  addFuel(n) { this.fuel = Math.min(this.maxFuel, this.fuel + n); this.save(); }

  // --- ship hulls ---
  activeHull() { return hullById(this.hull); }
  ownsHull(id) { return this.hullsOwned.includes(id); }

  buyHull(id) {
    const def = HULLS.find((h) => h.id === id);
    if (!def || this.ownsHull(id) || this.credits < def.price) return false;
    this.credits -= def.price;
    this.hullsOwned.push(id);
    this.hull = id;
    this.save();
    return true;
  }

  setHull(id) {
    if (!this.ownsHull(id)) return false;
    this.hull = id;
    this.save();
    return true;
  }

  // --- cargo hold ---
  cargoCap() { return this.stats().cargo; }
  cargoUsed() { return Object.values(this.cargo).reduce((a, q) => a + q, 0); }
  cargoFree() { return Math.max(0, this.cargoCap() - this.cargoUsed()); }
  cargoQty(id) { return this.cargo[id] || 0; }

  // Cost of the NEXT level, or null if maxed / unknown.
  costOf(id) {
    const def = UPGRADES[id];
    if (!def) return null;
    const lvl = this.level(id);
    if (lvl >= def.max) return null;
    return Math.round(def.baseCost * Math.pow(def.mult, lvl));
  }

  canBuy(id) {
    const cost = this.costOf(id);
    return cost != null && this.credits >= cost;
  }

  buyUpgrade(id) {
    const cost = this.costOf(id);
    if (cost == null || this.credits < cost) return false;
    this.credits -= cost;
    this.upgrades[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  addCredits(n) {
    this.credits = Math.max(0, this.credits + Math.round(n));
    this.save();
  }

  // Derived ship stats: active hull base + upgrade levels + skill perks.
  stats() {
    const b = this.activeHull().base;
    return {
      maxSpeed: b.maxSpeed + this.level('engine') * UPGRADES.engine.per + this.skillLevel('piloting') * 30,
      shield:   b.shield + this.level('shields') * UPGRADES.shields.per + this.skillLevel('engineering') * 15,
      weapon:   b.weapon + this.level('weapons') * UPGRADES.weapons.per + this.skillLevel('gunnery') * 4,
      cargo:    b.cargo + this.level('cargo') * UPGRADES.cargo.per,
      hull:     b.hull + this.level('hull') * UPGRADES.hull.per + this.skillLevel('engineering') * 20,
    };
  }
}

// Shared singleton used across scenes + UI.
export const player = new Player();
