import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, UPGRADES } from '../../src/game/Player.js';
import { MissionLog, generateOffers } from '../../src/game/Missions.js';

test('player starts with credits and zeroed upgrades', () => {
  const p = new Player(null); // no storage
  assert.equal(p.credits, 500);
  assert.equal(p.level('engine'), 0);
});

test('buying an upgrade deducts credits and raises level', () => {
  const p = new Player(null);
  const cost = p.costOf('engine');
  assert.equal(cost, UPGRADES.engine.baseCost);
  assert.ok(p.buyUpgrade('engine'));
  assert.equal(p.level('engine'), 1);
  assert.equal(p.credits, 500 - cost);
});

test('cannot buy without enough credits', () => {
  const p = new Player(null);
  p.credits = 10;
  assert.equal(p.canBuy('engine'), false);
  assert.equal(p.buyUpgrade('engine'), false);
  assert.equal(p.level('engine'), 0);
});

test('upgrade cost rises per level and maxes out', () => {
  const p = new Player(null);
  p.credits = 1e9;
  let prev = 0;
  for (let i = 0; i < UPGRADES.engine.max; i++) {
    const c = p.costOf('engine');
    assert.ok(c > prev);
    prev = c;
    assert.ok(p.buyUpgrade('engine'));
  }
  assert.equal(p.costOf('engine'), null);
  assert.equal(p.buyUpgrade('engine'), false);
});

test('engine upgrades raise derived max speed', () => {
  const p = new Player(null);
  const base = p.stats().maxSpeed;
  p.credits = 1e9;
  p.buyUpgrade('engine');
  assert.equal(p.stats().maxSpeed, base + UPGRADES.engine.per);
});

test('delivery mission completes on arrival and pays out', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const offers = generateOffers('neon-haven');
  assert.ok(offers.length >= 1);
  const m = offers[0];
  assert.equal(log.accept(m).ok, true);
  const before = p.credits;
  const done = log.arriveAt(m.to);
  assert.equal(done.length, 1);
  assert.equal(p.credits, before + m.reward);
  assert.equal(log.active.length, 0);
});

test('mission log caps at 4', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const offers = generateOffers('dust-reach', 6);
  let accepted = 0;
  for (const m of offers) if (log.accept(m).ok) accepted++;
  assert.equal(accepted, 4);
});
