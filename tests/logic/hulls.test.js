import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { HULLS, hullById } from '../../src/game/Hulls.js';

test('starts owning only the Corsair, which is active', () => {
  const p = new Player(null);
  assert.equal(p.hull, 'corsair');
  assert.deepEqual(p.hullsOwned, ['corsair']);
  assert.equal(p.ownsHull('freighter'), false);
});

test('buying a hull deducts its price, owns it, and makes it active', () => {
  const p = new Player(null);
  p.credits = 100000;
  const fr = hullById('freighter');
  assert.ok(p.buyHull('freighter'));
  assert.equal(p.hull, 'freighter');
  assert.equal(p.ownsHull('freighter'), true);
  assert.equal(p.credits, 100000 - fr.price);
});

test('cannot buy a hull you cannot afford', () => {
  const p = new Player(null);
  p.credits = 10;
  assert.equal(p.buyHull('gunship'), false);
  assert.equal(p.ownsHull('gunship'), false);
});

test('hull base stats flow into derived stats', () => {
  const p = new Player(null);
  p.credits = 100000;
  const corsairCargo = p.stats().cargo;
  p.buyHull('freighter');
  assert.equal(p.stats().cargo, hullById('freighter').base.cargo + corsairCargo - hullById('corsair').base.cargo);
  assert.ok(p.stats().cargo > corsairCargo); // freighter hauls more

  p.buyHull('interceptor');
  assert.ok(p.stats().maxSpeed > 500); // interceptor is fast
});

test('equipping requires ownership', () => {
  const p = new Player(null);
  assert.equal(p.setHull('gunship'), false); // not owned
  p.credits = 100000; p.buyHull('gunship');
  p.setHull('corsair'); // owned by default
  assert.equal(p.hull, 'corsair');
  assert.equal(p.setHull('gunship'), true);
});
