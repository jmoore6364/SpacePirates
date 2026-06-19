import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import {
  COMMODITIES, buyPrice, sellPrice, buy, sell, bestRouteFrom,
} from '../../src/game/Market.js';
import { MissionLog, generateOffers } from '../../src/game/Missions.js';
import { WORLDS } from '../../src/world/Worlds.js';

test('prices are deterministic and vary across worlds', () => {
  const a = sellPrice('neon-haven', 'tech');
  const b = sellPrice('the-maw', 'tech');
  assert.equal(a, sellPrice('neon-haven', 'tech')); // stable
  assert.notEqual(a, b); // differs by world
});

test('buy price carries a margin over sell (no same-world flip profit)', () => {
  for (const c of COMMODITIES) {
    assert.ok(buyPrice('cryo', c.id) > sellPrice('cryo', c.id));
  }
});

test('buying deducts credits and fills cargo; respects funds and capacity', () => {
  const p = new Player(null);
  p.credits = 100000;
  const r = buy(p, 'dust-reach', 'ore', 3);
  assert.equal(r.ok, true);
  assert.equal(p.cargoQty('ore'), 3);
  assert.equal(p.credits, 100000 - buyPrice('dust-reach', 'ore') * 3);

  // capacity cap
  const cap = p.cargoCap();
  const over = buy(p, 'dust-reach', 'water', cap); // already 3 used
  assert.equal(over.ok, false);

  // funds
  const poor = new Player(null);
  poor.credits = 1;
  assert.equal(buy(poor, 'dust-reach', 'tech', 1).ok, false);
});

test('selling returns credits and empties cargo', () => {
  const p = new Player(null);
  p.credits = 0;
  p.cargo = { meds: 2 };
  const r = sell(p, 'verdant', 'meds', 2);
  assert.equal(r.ok, true);
  assert.equal(p.credits, sellPrice('verdant', 'meds') * 2);
  assert.equal(p.cargoQty('meds'), 0);
  assert.equal(sell(p, 'verdant', 'meds', 1).ok, false); // none left
});

test('a profitable buy-low/sell-high route exists and nets profit', () => {
  const route = bestRouteFrom('neon-haven', WORLDS);
  assert.ok(route && route.profit > 0);

  const p = new Player(null);
  p.credits = 100000;
  const before = p.credits;
  buy(p, 'neon-haven', route.commodity, 1);
  sell(p, route.to, route.commodity, 1);
  assert.ok(p.credits > before); // round trip profits
});

test('bounty mission completes after enough kills', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const bounty = generateOffers('neon-haven').find((m) => m.type === 'bounty');
  assert.ok(bounty);
  assert.equal(log.accept(bounty).ok, true);
  const before = p.credits;
  let done = [];
  for (let i = 0; i < bounty.target; i++) done = log.recordKill();
  assert.equal(done.length, 1);
  assert.equal(p.credits, before + bounty.reward);
  assert.equal(log.active.length, 0);
});
