import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, fuelCost } from '../../src/game/Player.js';
import { refuel, FUEL_PRICE } from '../../src/game/Market.js';

test('jump cost scales with distance', () => {
  assert.ok(fuelCost(2000) > fuelCost(500));
  assert.equal(fuelCost(0), 1); // minimum 1
});

test('spending fuel reduces it; cannot go negative', () => {
  const p = new Player(null);
  assert.equal(p.fuel, 100);
  assert.equal(p.canJump(40), true);
  p.spendFuel(40);
  assert.equal(p.fuel, 60);
  p.spendFuel(999);
  assert.equal(p.fuel, 0);
  assert.equal(p.canJump(1), false);
});

test('refuel fills the tank and charges per unit', () => {
  const p = new Player(null);
  p.fuel = 40; p.credits = 100000;
  const r = refuel(p);
  assert.equal(r.ok, true);
  assert.equal(p.fuel, p.maxFuel);
  assert.equal(r.units, 60);
  assert.equal(r.cost, 60 * FUEL_PRICE);
});

test('refuel is limited by credits', () => {
  const p = new Player(null);
  p.fuel = 0; p.credits = FUEL_PRICE * 10;
  const r = refuel(p);
  assert.equal(r.units, 10);
  assert.equal(p.fuel, 10);
  assert.equal(p.credits, 0);
});

test('refuel rejects a full tank', () => {
  const p = new Player(null);
  p.credits = 1000;
  assert.equal(refuel(p).ok, false);
});
