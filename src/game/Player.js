// Renderer-agnostic player economy + ship upgrades. Persists to localStorage when
// available (guarded so it stays unit-testable under Node). Upgrade levels feed
// derived ship stats the scenes read.
import { clamp } from '../util/math.js';
import { HULLS, hullById } from './Hulls.js';
import { WEAPONS, weaponById, ARMORS, armorById } from './Weapons.js';
import { ACHIEVEMENTS } from './Achievements.js';
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
  missiles: 6,                  // homing-missile ammo (space secondary weapon)
  maxMissiles: 6,
  hasWingman: false,            // hired escort fighter (helps in space combat)
  sidearm: 'blaster',           // equipped on-foot weapon
  sidearmsOwned: ['blaster'],
  armor: 'flightsuit',          // equipped on-foot armor
  armorsOwned: ['flightsuit'],
  runStats: { kills: 0, enforcers: 0, creditsEarned: 0, jumps: 0, deliveries: 0, landings: 0, deaths: 0, bosses: 0, captains: 0, oreMined: 0 },
  achievements: [],             // unlocked achievement ids
  rep: {},                      // per-world faction reputation (worldId → -100..100)
});

// Fuel a fast-travel jump costs, by travel distance (manual flight is free).
export const fuelCost = (distance) => Math.max(1, Math.ceil(distance / 55));

// Price per homing missile when restocking ordnance.
export const MISSILE_PRICE = 45;

// One-time cost to hire a wingman escort.
export const WINGMAN_PRICE = 3000;

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
      missiles: this.missiles, maxMissiles: this.maxMissiles,
      hasWingman: this.hasWingman,
      sidearm: this.sidearm, sidearmsOwned: this.sidearmsOwned,
      armor: this.armor, armorsOwned: this.armorsOwned,
      runStats: this.runStats, achievements: this.achievements,
      rep: this.rep,
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

  // --- faction reputation (per world) ---
  repOf(worldId) { return (this.rep && this.rep[worldId]) || 0; }
  addRep(worldId, n) {
    if (!this.rep) this.rep = {};
    const v = clamp(this.repOf(worldId) + n, -100, 100);
    this.rep[worldId] = v;
    this.save();
    return v;
  }
  // Friendly standing → better margins; hostile → worse. ±20% at the extremes.
  repBonus(worldId) { return (this.repOf(worldId) / 100) * 0.2; }
  repTier(worldId) {
    const r = this.repOf(worldId);
    return r <= -20 ? 'Hostile' : r < 0 ? 'Disliked' : r < 20 ? 'Neutral' : r < 50 ? 'Friendly' : 'Allied';
  }

  // --- fuel ---
  canJump(cost) { return this.fuel >= cost; }
  spendFuel(n) { this.fuel = Math.max(0, this.fuel - n); this.save(); }
  addFuel(n) { this.fuel = Math.min(this.maxFuel, this.fuel + n); this.save(); }

  // --- ordnance (homing missiles) ---
  spendMissile() { if (this.missiles > 0) { this.missiles -= 1; this.save(); return true; } return false; }
  missileRestockCost() { return (this.maxMissiles - this.missiles) * MISSILE_PRICE; }
  buyMissiles() {
    const cost = this.missileRestockCost();
    if (cost <= 0 || this.credits < cost) return false;
    this.credits -= cost;
    this.missiles = this.maxMissiles;
    this.save();
    return true;
  }

  // --- wingman escort ---
  buyWingman() {
    if (this.hasWingman || this.credits < WINGMAN_PRICE) return false;
    this.credits -= WINGMAN_PRICE;
    this.hasWingman = true;
    this.save();
    return true;
  }

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

  // --- on-foot weapons & armor (Armory) ---
  groundWeapon() { return weaponById(this.sidearm); }
  groundArmor() { return armorById(this.armor); }
  ownsWeapon(id) { return this.sidearmsOwned.includes(id); }
  ownsArmor(id) { return this.armorsOwned.includes(id); }

  // On-foot bolt damage: weapon base + Gunnery skill perk.
  sidearmDamage() { return this.groundWeapon().dmg + this.skillLevel('gunnery') * 4; }

  buyWeapon(id) {
    const def = WEAPONS.find((w) => w.id === id);
    if (!def || this.ownsWeapon(id) || this.credits < def.price) return false;
    this.credits -= def.price;
    this.sidearmsOwned.push(id);
    this.sidearm = id;
    this.save();
    return true;
  }

  setWeapon(id) {
    if (!this.ownsWeapon(id)) return false;
    this.sidearm = id;
    this.save();
    return true;
  }

  buyArmor(id) {
    const def = ARMORS.find((a) => a.id === id);
    if (!def || this.ownsArmor(id) || this.credits < def.price) return false;
    this.credits -= def.price;
    this.armorsOwned.push(id);
    this.armor = id;
    this.save();
    return true;
  }

  setArmor(id) {
    if (!this.ownsArmor(id)) return false;
    this.armor = id;
    this.save();
    return true;
  }

  // --- cargo hold ---
  cargoCap() { return this.stats().cargo; }
  cargoUsed() { return Object.values(this.cargo).reduce((a, q) => a + q, 0); }
  cargoFree() { return Math.max(0, this.cargoCap() - this.cargoUsed()); }
  cargoQty(id) { return this.cargo[id] || 0; }

  // Add cargo up to remaining hold space; returns how much actually fit.
  addCargo(id, n) {
    const add = Math.min(this.cargoFree(), n);
    if (add > 0) { this.cargo[id] = this.cargoQty(id) + add; this.save(); }
    return add;
  }

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
    if (n > 0) { this.runStats.creditsEarned += Math.round(n); this._checkAchievements(); }
    this.save();
  }

  // --- run stats & achievements (#12) ---
  // Increment a lifetime stat and unlock any achievements it crosses.
  bumpStat(key, n = 1) {
    if (!this.runStats) this.runStats = {};
    this.runStats[key] = (this.runStats[key] || 0) + n;
    this._checkAchievements();
    this.save();
  }

  hasAchievement(id) { return this.achievements.includes(id); }

  // Fire each newly-met achievement once; host sets `onUnlock` for toast + chime.
  _checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (!this.achievements.includes(a.id) && a.test(this.runStats)) {
        this.achievements.push(a.id);
        if (this.onUnlock) this.onUnlock(a);
      }
    }
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
