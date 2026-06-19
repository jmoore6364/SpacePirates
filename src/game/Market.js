// Renderer-agnostic trade economy. Each world prices commodities differently
// (deterministic per world+good), so the core pirate loop is: buy cheap where a
// good is plentiful, haul it, sell dear where it's scarce. Cargo space is the
// constraint — making the Cargo upgrade matter.

export const COMMODITIES = [
  { id: 'water',    name: 'Water Ice',    base: 12,  legal: true },
  { id: 'ore',      name: 'Raw Ore',      base: 28,  legal: true },
  { id: 'parts',    name: 'Ship Parts',   base: 60,  legal: true },
  { id: 'meds',     name: 'Medicine',     base: 95,  legal: true },
  { id: 'tech',     name: 'Electronics',  base: 140, legal: true },
  { id: 'spice',    name: 'Spice',        base: 210, legal: false }, // contraband, high value
];

export const commodityById = (id) => COMMODITIES.find((c) => c.id === id);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Stable per-world demand factor in roughly [0.55, 1.45].
function worldFactor(worldId, commodityId) {
  const h = hash(`${worldId}:${commodityId}`);
  return 0.55 + (h % 91) / 100;
}

// --- dynamic supply/demand shocks (the living economy) ---
// Transient per-world/commodity multipliers that mean-revert toward 1 each tick.
const shocks = {};      // `${world}:${commodity}` -> multiplier
const events = [];      // active named events { world, commodity, kind, label, life }

const skey = (w, c) => `${w}:${c}`;
export function shockMult(worldId, commodityId) {
  return shocks[skey(worldId, commodityId)] ?? 1;
}

// Force a shortage (prices up) or surplus (prices down). mult optional (testable).
export function applyEvent(worldId, commodityId, kind, mult) {
  const c = commodityById(commodityId);
  const m = mult != null ? mult
    : kind === 'shortage' ? 1.5 + Math.random() * 0.6
      : 0.45 + Math.random() * 0.25;
  shocks[skey(worldId, commodityId)] = m;
  const ev = {
    world: worldId, commodity: commodityId, kind, life: 3,
    label: `${c ? c.name : commodityId} ${kind} on ${worldId}`,
  };
  events.push(ev);
  return ev;
}

// Advance the galaxy economy one step: shocks decay toward 1, events age out, and
// a fresh shock may strike. Returns the new event (for a news toast) or null.
export function tickMarket(worlds = []) {
  for (const k of Object.keys(shocks)) {
    const m = shocks[k] + (1 - shocks[k]) * 0.34; // mean-revert
    if (Math.abs(m - 1) < 0.04) delete shocks[k];
    else shocks[k] = m;
  }
  for (let i = events.length - 1; i >= 0; i--) {
    if (--events[i].life <= 0) events.splice(i, 1);
  }
  if (worlds.length && Math.random() < 0.7) {
    const w = worlds[Math.floor(Math.random() * worlds.length)];
    const c = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)];
    const kind = Math.random() < 0.5 ? 'shortage' : 'surplus';
    return applyEvent(w.id, c.id, kind);
  }
  return null;
}

export function activeEventsFor(worldId) {
  return events.filter((e) => e.world === worldId);
}

export function activeEvents() {
  return events.slice();
}

// What the market pays you to SELL one unit here.
export function sellPrice(worldId, commodityId) {
  const c = commodityById(commodityId);
  if (!c) return 0;
  return Math.round(c.base * worldFactor(worldId, commodityId) * shockMult(worldId, commodityId));
}

// What it costs to BUY one unit here (a margin above sell so same-world flipping
// never profits — you must actually travel).
export function buyPrice(worldId, commodityId) {
  return Math.round(sellPrice(worldId, commodityId) * 1.12);
}

// Listing for a world's market UI.
export function marketTable(worldId) {
  return COMMODITIES.map((c) => ({
    id: c.id, name: c.name, legal: c.legal,
    buy: buyPrice(worldId, c.id),
    sell: sellPrice(worldId, c.id),
  }));
}

export function buy(player, worldId, commodityId, qty = 1) {
  if (qty <= 0) return { ok: false, reason: 'Nothing to buy.' };
  const bonus = player.tradeBonus ? player.tradeBonus() : 0;
  const cost = Math.round(buyPrice(worldId, commodityId) * (1 - bonus)) * qty;
  if (player.credits < cost) return { ok: false, reason: 'Not enough credits.' };
  if (player.cargoFree() < qty) return { ok: false, reason: 'Cargo hold full.' };
  player.credits -= cost;
  player.cargo[commodityId] = player.cargoQty(commodityId) + qty;
  player.save();
  return { ok: true, cost };
}

export function sell(player, worldId, commodityId, qty = 1) {
  const have = player.cargoQty(commodityId);
  if (qty <= 0 || have < qty) return { ok: false, reason: 'You have none to sell.' };
  const bonus = player.tradeBonus ? player.tradeBonus() : 0;
  const gain = Math.round(sellPrice(worldId, commodityId) * (1 + bonus)) * qty;
  player.credits += gain;
  player.cargo[commodityId] = have - qty;
  if (player.cargo[commodityId] <= 0) delete player.cargo[commodityId];
  if (player.addXp) player.addXp(Math.max(1, Math.round(gain * 0.03))); // trade XP
  player.save();
  return { ok: true, gain };
}

export const FUEL_PRICE = 3; // credits per fuel unit

// Refuel as much as the hold needs and the player can afford.
export function refuel(player) {
  const need = player.maxFuel - player.fuel;
  if (need <= 0) return { ok: false, reason: 'Tank is full.' };
  const affordable = Math.floor(player.credits / FUEL_PRICE);
  const units = Math.min(need, affordable);
  if (units <= 0) return { ok: false, reason: 'Not enough credits.' };
  player.credits -= units * FUEL_PRICE;
  player.addFuel(units);
  player.save();
  return { ok: true, units, cost: units * FUEL_PRICE };
}

// Suggest the best single-good trade route from a world (for flavor / hints).
export function bestRouteFrom(worldId, worlds) {
  let best = null;
  for (const c of COMMODITIES) {
    const cost = buyPrice(worldId, c.id);
    for (const w of worlds) {
      if (w.id === worldId) continue;
      const profit = sellPrice(w.id, c.id) - cost;
      if (!best || profit > best.profit) best = { commodity: c.id, to: w.id, toName: w.name, profit };
    }
  }
  return best;
}
