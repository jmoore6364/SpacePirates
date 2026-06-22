import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, MISSILE_PRICE } from '../../src/game/Player.js';

test('starts with a full missile rack', () => {
  const p = new Player(null);
  assert.equal(p.missiles, p.maxMissiles);
  assert.ok(p.maxMissiles > 0);
});

test('spending a missile decrements ammo and stops at zero', () => {
  const p = new Player(null);
  p.missiles = 2;
  assert.equal(p.spendMissile(), true);
  assert.equal(p.missiles, 1);
  assert.equal(p.spendMissile(), true);
  assert.equal(p.spendMissile(), false); // empty
  assert.equal(p.missiles, 0);
});

test('rearming refills to max and charges per missing missile', () => {
  const p = new Player(null);
  p.credits = 100000;
  p.missiles = p.maxMissiles - 3;
  const cost = p.missileRestockCost();
  assert.equal(cost, 3 * MISSILE_PRICE);
  const before = p.credits;
  assert.equal(p.buyMissiles(), true);
  assert.equal(p.missiles, p.maxMissiles);
  assert.equal(p.credits, before - cost);
  assert.equal(p.buyMissiles(), false); // already full → nothing to buy
});

test('cannot rearm without enough credits', () => {
  const p = new Player(null);
  p.missiles = 0;
  p.credits = MISSILE_PRICE; // not enough for a full rack
  assert.equal(p.buyMissiles(), false);
  assert.equal(p.missiles, 0);
});

test('missile ammo survives serialize/applyState', () => {
  const p = new Player(null);
  p.missiles = 2;
  const snap = JSON.parse(JSON.stringify(p.serialize()));
  const q = new Player(null);
  q.applyState(snap);
  assert.equal(q.missiles, 2);
});
