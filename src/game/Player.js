// Renderer-agnostic player economy + ship upgrades. Persists to localStorage when
// available (guarded so it stays unit-testable under Node). Upgrade levels feed
// derived ship stats the scenes read.
export const UPGRADES = {
  engine:  { name: 'Engine',  desc: 'Top speed',      max: 5, baseCost: 200, mult: 1.6, per: 90  },
  shields: { name: 'Shields', desc: 'Damage soak',    max: 5, baseCost: 250, mult: 1.7, per: 25  },
  weapons: { name: 'Weapons', desc: 'Laser damage',   max: 5, baseCost: 300, mult: 1.7, per: 8   },
  cargo:   { name: 'Cargo',   desc: 'Hold capacity',  max: 5, baseCost: 150, mult: 1.5, per: 10  },
  hull:    { name: 'Hull',    desc: 'Max integrity',  max: 5, baseCost: 220, mult: 1.6, per: 40  },
};

const SAVE_KEY = 'voidcorsair.save.v1';
const DEFAULTS = () => ({
  credits: 500,
  upgrades: { engine: 0, shields: 0, weapons: 0, cargo: 0, hull: 0 },
  completed: [],
});

export class Player {
  constructor(store = globalThis.localStorage) {
    this.store = store && typeof store.getItem === 'function' ? store : null;
    const loaded = this._load();
    Object.assign(this, DEFAULTS(), loaded);
  }

  _load() {
    if (!this.store) return {};
    try {
      const raw = this.store.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  save() {
    if (!this.store) return;
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify({
        credits: this.credits, upgrades: this.upgrades, completed: this.completed,
      }));
    } catch { /* storage full / disabled — ignore */ }
  }

  reset() {
    Object.assign(this, DEFAULTS());
    this.save();
  }

  hasSave() {
    if (!this.store) return false;
    try { return !!this.store.getItem(SAVE_KEY); } catch { return false; }
  }

  level(id) { return this.upgrades[id] || 0; }

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

  // Derived ship stats from upgrade levels.
  stats() {
    return {
      maxSpeed: 420 + this.level('engine') * UPGRADES.engine.per,
      shield:   this.level('shields') * UPGRADES.shields.per,
      weapon:   10 + this.level('weapons') * UPGRADES.weapons.per,
      cargo:    20 + this.level('cargo') * UPGRADES.cargo.per,
      hull:     100 + this.level('hull') * UPGRADES.hull.per,
    };
  }
}

// Shared singleton used across scenes + UI.
export const player = new Player();
