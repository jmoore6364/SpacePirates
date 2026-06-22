import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { ACHIEVEMENTS } from '../../src/game/Achievements.js';

test('stats start at zero and a stat increments on its event', () => {
  const p = new Player(null);
  assert.equal(p.runStats.kills, 0);
  p.bumpStat('kills');
  assert.equal(p.runStats.kills, 1);
  p.bumpStat('kills', 4);
  assert.equal(p.runStats.kills, 5);
});

test('addCredits accrues creditsEarned (income only)', () => {
  const p = new Player(null);
  p.addCredits(300);
  assert.equal(p.runStats.creditsEarned, 300);
  p.addCredits(-50); // penalty must not count as earnings
  assert.equal(p.runStats.creditsEarned, 300);
});

test('an achievement unlocks at its threshold exactly once', () => {
  const p = new Player(null);
  const fired = [];
  p.onUnlock = (a) => fired.push(a.id);

  assert.equal(p.hasAchievement('first-blood'), false);
  p.bumpStat('kills'); // crosses kills >= 1
  assert.equal(p.hasAchievement('first-blood'), true);
  assert.deepEqual(fired, ['first-blood']);

  p.bumpStat('kills'); // already unlocked — must not re-fire
  assert.deepEqual(fired, ['first-blood']);
});

test('credit milestones unlock via earnings', () => {
  const p = new Player(null);
  const fired = [];
  p.onUnlock = (a) => fired.push(a.id);
  p.addCredits(10000);
  assert.ok(fired.includes('entrepreneur'));
  assert.ok(!fired.includes('magnate'));
  p.addCredits(40000);
  assert.ok(fired.includes('magnate'));
});

test('every achievement has a unique id, name and test', () => {
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.test, 'function');
    assert.ok(a.name && a.desc);
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
  }
});

test('stats + achievements survive serialize/applyState', () => {
  const p = new Player(null);
  p.bumpStat('jumps', 3);
  p.bumpStat('kills');
  const snap = JSON.parse(JSON.stringify(p.serialize()));
  const q = new Player(null);
  q.applyState(snap);
  assert.equal(q.runStats.jumps, 3);
  assert.equal(q.hasAchievement('first-blood'), true);
});
