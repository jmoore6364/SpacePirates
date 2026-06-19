import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, SKILLS } from '../../src/game/Player.js';
import { buy, sell, buyPrice } from '../../src/game/Market.js';

test('XP accrues and levels up, granting skill points', () => {
  const p = new Player(null);
  assert.equal(p.xpLevel, 1);
  const need = p.xpToNext();
  const gained = p.addXp(need);
  assert.equal(gained, 1);
  assert.equal(p.xpLevel, 2);
  assert.equal(p.skillPoints, 1);
});

test('a big XP grant can level up multiple times', () => {
  const p = new Player(null);
  const gained = p.addXp(100000);
  assert.ok(gained >= 5);
  assert.equal(p.skillPoints, gained);
});

test('spending a skill point raises the skill and consumes the point', () => {
  const p = new Player(null);
  p.addXp(p.xpToNext()); // 1 point
  assert.equal(p.spendSkill('gunnery'), true);
  assert.equal(p.skillLevel('gunnery'), 1);
  assert.equal(p.skillPoints, 0);
  assert.equal(p.spendSkill('gunnery'), false); // no points left
});

test('cannot exceed a skill max', () => {
  const p = new Player(null);
  p.skillPoints = 99;
  for (let i = 0; i < SKILLS.gunnery.max; i++) assert.equal(p.spendSkill('gunnery'), true);
  assert.equal(p.skillLevel('gunnery'), SKILLS.gunnery.max);
  assert.equal(p.spendSkill('gunnery'), false);
});

test('Gunnery raises weapon damage; Piloting raises top speed; Engineering raises hull', () => {
  const p = new Player(null);
  const base = p.stats();
  p.skillPoints = 99;
  p.spendSkill('gunnery'); p.spendSkill('piloting'); p.spendSkill('engineering');
  const s = p.stats();
  assert.equal(s.weapon, base.weapon + 4);
  assert.equal(s.maxSpeed, base.maxSpeed + 30);
  assert.equal(s.hull, base.hull + 20);
});

test('Trading skill improves buy and sell prices', () => {
  const cheap = new Player(null); cheap.credits = 1e6;
  const trader = new Player(null); trader.credits = 1e6;
  trader.skillPoints = 5; trader.spendSkill('trading'); trader.spendSkill('trading');
  assert.ok(trader.tradeBonus() > 0);

  const c1 = cheap.credits; buy(cheap, 'cryo', 'ore', 1);
  const c2 = trader.credits; buy(trader, 'cryo', 'ore', 1);
  assert.ok((c1 - cheap.credits) > (c2 - trader.credits)); // trader pays less

  cheap.cargo = { ore: 1 }; trader.cargo = { ore: 1 };
  const s1 = cheap.credits; sell(cheap, 'the-maw', 'ore', 1);
  const s2 = trader.credits; sell(trader, 'the-maw', 'ore', 1);
  assert.ok((trader.credits - s2) > (cheap.credits - s1)); // trader earns more
});
