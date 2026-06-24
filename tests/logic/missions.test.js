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

test('mission log caps at 4', () => {
  const p = new Player(null);
  const log = new MissionLog(p);
  const offers = generateOffers('cryo');
  let accepted = 0;
  for (let i = 0; i < 10; i++) {
    const m = { ...offers[0], id: `x${i}` };
    if (log.accept(m).ok) accepted += 1;
  }
  assert.equal(accepted, 4);
  assert.equal(log.active.length, 4);
});
