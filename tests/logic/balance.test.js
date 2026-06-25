// Balance regression tests — encode the *intended* economy/combat ratios so a
// future number tweak can't silently re-introduce an inversion or a difficulty
// cliff. These assert relationships, not exact values, so tuning stays free as
// long as the shape holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, UPGRADES, DEATH_PENALTY_CAP } from '../../src/game/Player.js';
import { ENEMY_TYPES } from '../../src/systems/Combat.js';
import { ENFORCER_TYPES } from '../../src/systems/GroundCombat.js';

test('space bounty/HP rises up the threat ladder (escalation pays)', () => {
  const per = (k) => ENEMY_TYPES[k].bounty / ENEMY_TYPES[k].hp;
  const ladder = ['scout', 'raider', 'gunship', 'warlord'];
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(per(ladder[i]) >= per(ladder[i - 1]),
      `${ladder[i]} (${per(ladder[i]).toFixed(2)}/hp) should pay >= ${ladder[i - 1]} (${per(ladder[i - 1]).toFixed(2)}/hp)`);
  }
  // and the boss is the single best payout per HP
  assert.ok(per('warlord') > per('gunship'));
});

test('ground bounty/HP rises grunt -> heavy -> captain', () => {
  const per = (k) => ENFORCER_TYPES[k].bounty / ENFORCER_TYPES[k].hp;
  assert.ok(per('heavy') > per('grunt'), 'heavy should out-pay grunt per HP');
  assert.ok(per('captain') > per('heavy'), 'captain should out-pay heavy per HP');
  // the sniper is a deliberate glass-cannon exception: high pay/HP, but it hits hard
  assert.ok(ENFORCER_TYPES.sniper.dmg >= ENFORCER_TYPES.heavy.dmg);
});

test('every upgrade track climbs monotonically and stays affordable in band', () => {
  for (const [id, def] of Object.entries(UPGRADES)) {
    const p = new Player(null);
    let prev = 0, total = 0;
    for (let lvl = 0; lvl < def.max; lvl++) {
      const cost = p.costOf(id);
      assert.ok(cost > prev, `${id} L${lvl + 1} cost ${cost} should exceed L${lvl} ${prev}`);
      prev = cost; total += cost;
      p.upgrades[id] = lvl + 1;
    }
    assert.equal(p.costOf(id), null); // maxed
    // no single track should cost more than ~6k to max out (avoids a late wall)
    assert.ok(total <= 6000, `${id} total ${total} exceeds the 6k ceiling`);
  }
});

test('death penalty is 10% but capped so it never guts a rich captain', () => {
  const p = new Player(null);
  p.credits = 800;
  assert.equal(p.deathPenalty(), 80);            // 10% when modest
  p.credits = 50000;
  assert.equal(p.deathPenalty(), DEATH_PENALTY_CAP); // capped when wealthy
  assert.ok(DEATH_PENALTY_CAP <= 1500);
});
