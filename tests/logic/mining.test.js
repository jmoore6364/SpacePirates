import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';

test('addCargo adds up to the free hold and reports how much fit', () => {
  const p = new Player(null);
  const cap = p.cargoCap();
  assert.equal(p.addCargo('ore', 3), 3);
  assert.equal(p.cargoQty('ore'), 3);
  // overflow is clamped to remaining space; return value reflects what fit
  const fit = p.addCargo('ore', cap * 2);
  assert.equal(fit, cap - 3);
  assert.equal(p.cargoUsed(), cap);
  assert.equal(p.addCargo('ore', 5), 0); // hold full
});

test('mining stat feeds the Prospector achievement', () => {
  const p = new Player(null);
  const fired = [];
  p.onUnlock = (a) => fired.push(a.id);
  p.bumpStat('oreMined', 49);
  assert.equal(p.hasAchievement('prospector'), false);
  p.bumpStat('oreMined', 1);
  assert.ok(fired.includes('prospector'));
});
