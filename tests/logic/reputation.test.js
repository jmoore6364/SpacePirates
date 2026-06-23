import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { buy, sell, buyPrice, sellPrice } from '../../src/game/Market.js';

const W = 'neon-haven';

test('reputation starts neutral and clamps to [-100, 100]', () => {
  const p = new Player(null);
  assert.equal(p.repOf(W), 0);
  assert.equal(p.repTier(W), 'Neutral');
  p.addRep(W, 250);
  assert.equal(p.repOf(W), 100);
  assert.equal(p.repTier(W), 'Allied');
  p.addRep(W, -300);
  assert.equal(p.repOf(W), -100);
  assert.equal(p.repTier(W), 'Hostile');
});

test('tiers map to thresholds', () => {
  const p = new Player(null);
  p.rep[W] = -20; assert.equal(p.repTier(W), 'Hostile');
  p.rep[W] = -5; assert.equal(p.repTier(W), 'Disliked');
  p.rep[W] = 10; assert.equal(p.repTier(W), 'Neutral');
  p.rep[W] = 30; assert.equal(p.repTier(W), 'Friendly');
  p.rep[W] = 60; assert.equal(p.repTier(W), 'Allied');
});

test('high standing buys cheaper and sells dearer than hostile', () => {
  const allied = new Player(null); allied.credits = 100000; allied.rep[W] = 100;
  const hostile = new Player(null); hostile.credits = 100000; hostile.rep[W] = -100;

  const ba = buy(allied, W, 'ore', 1);
  const bh = buy(hostile, W, 'ore', 1);
  assert.ok(ba.cost < bh.cost, `allied buy ${ba.cost} should be < hostile ${bh.cost}`);

  allied.cargo.ore = 1; hostile.cargo.ore = 1;
  const sa = sell(allied, W, 'ore', 1);
  const sh = sell(hostile, W, 'ore', 1);
  assert.ok(sa.gain > sh.gain, `allied sell ${sa.gain} should be > hostile ${sh.gain}`);
});

test('reputation persists through serialize/applyState', () => {
  const p = new Player(null);
  p.addRep(W, 24);
  const snap = JSON.parse(JSON.stringify(p.serialize()));
  const q = new Player(null);
  q.applyState(snap);
  assert.equal(q.repOf(W), 24);
});
