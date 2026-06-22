import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, WINGMAN_PRICE } from '../../src/game/Player.js';

test('hiring a wingman deducts the fee once and persists', () => {
  const p = new Player(null);
  p.credits = WINGMAN_PRICE + 100;
  assert.equal(p.hasWingman, false);
  assert.equal(p.buyWingman(), true);
  assert.equal(p.hasWingman, true);
  assert.equal(p.credits, 100);
  assert.equal(p.buyWingman(), false); // already hired — no double charge
  assert.equal(p.credits, 100);
});

test('cannot hire a wingman without the fee', () => {
  const p = new Player(null);
  p.credits = WINGMAN_PRICE - 1;
  assert.equal(p.buyWingman(), false);
  assert.equal(p.hasWingman, false);
});

test('wingman ownership survives serialize/applyState', () => {
  const p = new Player(null);
  p.credits = 100000; p.buyWingman();
  const snap = JSON.parse(JSON.stringify(p.serialize()));
  const q = new Player(null);
  q.applyState(snap);
  assert.equal(q.hasWingman, true);
});
