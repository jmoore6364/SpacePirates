import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { MissionLog, generateOffers } from '../../src/game/Missions.js';

test('accepting a delivery completes on arrival at its destination and pays', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const offer = generateOffers('neon-haven').find((m) => m.type === 'delivery');
  assert.ok(log.accept(offer).ok);
  assert.equal(log.active.length, 1);
  const before = p.credits;
  assert.deepEqual(log.arriveAt('nowhere-else'), []); // wrong world: nothing
  const done = log.arriveAt(offer.to);                // destination: completes
  assert.equal(done.length, 1);
  assert.equal(log.active.length, 0);
  assert.equal(p.credits, before + offer.reward);
});

test('active missions persist through serialize/applyState', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const offer = generateOffers('dust-reach').find((m) => m.type === 'delivery');
  log.accept(offer);
  const snap = JSON.parse(JSON.stringify(p.serialize()));

  const q = new Player(null);
  q.applyState(snap);
  const qlog = new MissionLog(q);
  assert.equal(qlog.active.length, 1);
  assert.equal(qlog.active[0].to, offer.to);
  // and it still completes after the reload
  assert.equal(qlog.arriveAt(offer.to).length, 1);
});

test('delivery cargo occupies the hold and blocks accepting when full', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const cap = p.cargoCap();
  const big = { id: 'big', type: 'delivery', to: 'cryo', toName: 'Cryo', cargo: 'ore', units: cap, reward: 100 };
  assert.ok(log.accept(big).ok);
  assert.equal(p.cargoUsed(), cap);          // mission cargo fills the hold
  assert.equal(p.cargoFree(), 0);
  const more = { id: 'more', type: 'delivery', to: 'verdant', toName: 'Verdant', cargo: 'ore', units: 1, reward: 100 };
  assert.equal(log.accept(more).ok, false);  // no room left
});

test('customs seizes illegal cargo bound elsewhere at a secure port', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const hot = { id: 'hot', type: 'delivery', to: 'the-maw', toName: 'The Maw', cargo: 'contraband', illegal: true, units: 2, reward: 300 };
  const legal = { id: 'clean', type: 'delivery', to: 'the-maw', toName: 'The Maw', cargo: 'ore', units: 2, reward: 100 };
  log.accept(hot); log.accept(legal);
  // landing at Verdant (not the destination) with rng always 0 → always caught
  const caught = log.runCustoms('verdant', 0.85, 0, () => 0);
  assert.equal(caught.length, 1);
  assert.equal(caught[0].id, 'hot');         // only the illegal one
  assert.equal(log.has('hot'), false);       // confiscated
  assert.equal(log.has('clean'), true);      // legal cargo untouched
});

test('no customs risk at zero-security ports or at the destination', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const hot = { id: 'hot', type: 'delivery', to: 'verdant', toName: 'Verdant', cargo: 'contraband', illegal: true, units: 2, reward: 300 };
  log.accept(hot);
  assert.equal(log.runCustoms('the-maw', 0, 0, () => 0).length, 0); // lawless port: no scan
  assert.equal(log.runCustoms('verdant', 0.85, 0, () => 0).length, 0); // this IS the destination
});

test('mission log caps at 4', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const offers = generateOffers('cryo');
  let accepted = 0;
  for (let i = 0; i < 10; i++) {
    const m = { ...offers[0], id: `x${i}`, units: 0 }; // isolate the count cap from hold space
    if (log.accept(m).ok) accepted += 1;
  }
  assert.equal(accepted, 4);
  assert.equal(log.active.length, 4);
});
