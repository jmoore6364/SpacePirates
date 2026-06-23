import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';

test('downing a captain feeds the Decapitation achievement', () => {
  const p = new Player(null);
  const fired = [];
  p.onUnlock = (a) => fired.push(a.id);
  assert.equal(p.hasAchievement('captain-down'), false);
  p.bumpStat('captains');
  assert.equal(p.hasAchievement('captain-down'), true);
  assert.ok(fired.includes('captain-down'));
  p.bumpStat('captains'); // no re-fire
  assert.equal(fired.filter((x) => x === 'captain-down').length, 1);
});
