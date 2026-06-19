import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { writeSlot, readSlot, listSlots, deleteSlot, mostRecentSlot, firstEmptySlot, SLOT_COUNT } from '../../src/game/SaveSlots.js';

// Minimal in-memory localStorage stand-in.
function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('serialize/deserialize round-trips full player state', () => {
  const store = memStore();
  const p = new Player(store);
  p.credits = 4242; p.addXp(500); p.buyHull && (p.credits = 1e6, p.buyHull('interceptor'));
  p.cargo = { ore: 3 }; p.fuel = 37;
  const snap = p.serialize();
  const q = new Player(null);
  q.applyState(snap);
  assert.equal(q.credits, p.credits);
  assert.equal(q.xpLevel, p.xpLevel);
  assert.equal(q.hull, p.hull);
  assert.equal(q.cargoQty('ore'), 3);
  assert.equal(q.fuel, 37);
});

test('slots are isolated and list reports metadata', () => {
  const store = memStore();
  const a = new Player(store); a.credits = 1000; a.saveToSlot(0);
  const b = new Player(null); b.credits = 5000; b.fuel = 50;
  writeSlot(store, 2, b, 123);
  const slots = listSlots(store);
  assert.equal(slots.length, SLOT_COUNT);
  assert.equal(slots[0].empty, false);
  assert.equal(slots[1].empty, true);
  assert.equal(slots[2].meta.credits, 5000);
  assert.equal(readSlot(store, 0).state.credits, 1000);
  assert.equal(readSlot(store, 2).state.credits, 5000);
});

test('mostRecentSlot picks the latest savedAt; firstEmptySlot finds a gap', () => {
  const store = memStore();
  const p = new Player(null);
  writeSlot(store, 0, p, 100);
  writeSlot(store, 3, p, 999);
  assert.equal(mostRecentSlot(store), 3);
  assert.equal(firstEmptySlot(store), 1);
});

test('deleteSlot clears a slot', () => {
  const store = memStore();
  const p = new Player(null);
  writeSlot(store, 1, p, 1);
  assert.equal(listSlots(store)[1].empty, false);
  deleteSlot(store, 1);
  assert.equal(listSlots(store)[1].empty, true);
});

test('a new Player loads the most recent slot from its store', () => {
  const store = memStore();
  const seed = new Player(null); seed.credits = 8888; seed.fuel = 12;
  writeSlot(store, 4, seed, 555);
  const loaded = new Player(store);
  assert.equal(loaded.credits, 8888);
  assert.equal(loaded.activeSlot, 4);
});
