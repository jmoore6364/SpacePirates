import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { weaponById, armorById } from '../../src/game/Weapons.js';

test('starts with the free blaster and flight suit equipped', () => {
  const p = new Player(null);
  assert.equal(p.sidearm, 'blaster');
  assert.deepEqual(p.sidearmsOwned, ['blaster']);
  assert.equal(p.armor, 'flightsuit');
  assert.equal(p.ownsWeapon('rail'), false);
});

test('buying a weapon deducts price, owns it, and equips it', () => {
  const p = new Player(null);
  p.credits = 100000;
  const rail = weaponById('rail');
  assert.ok(p.buyWeapon('rail'));
  assert.equal(p.sidearm, 'rail');
  assert.equal(p.ownsWeapon('rail'), true);
  assert.equal(p.credits, 100000 - rail.price);
});

test('cannot buy a weapon you cannot afford', () => {
  const p = new Player(null);
  p.credits = 10;
  assert.equal(p.buyWeapon('rail'), false);
  assert.equal(p.ownsWeapon('rail'), false);
});

test('equipping requires ownership', () => {
  const p = new Player(null);
  assert.equal(p.setWeapon('scatter'), false);
  p.credits = 100000; p.buyWeapon('scatter');
  p.setWeapon('blaster');
  assert.equal(p.sidearm, 'blaster');
  assert.equal(p.setWeapon('scatter'), true);
});

test('sidearm damage includes the Gunnery skill perk', () => {
  const p = new Player(null);
  const base = weaponById('blaster').dmg;
  assert.equal(p.sidearmDamage(), base);
  p.skills.gunnery = 2;
  assert.equal(p.sidearmDamage(), base + 8);
});

test('armor sets on-foot max HP and damage reduction', () => {
  const p = new Player(null);
  p.credits = 100000;
  assert.equal(p.groundArmor().hp, armorById('flightsuit').hp);
  assert.equal(p.groundArmor().dr, 0); // starter suit soaks nothing
  assert.ok(p.buyArmor('exo'));
  assert.equal(p.groundArmor().hp, armorById('exo').hp);
  assert.ok(p.groundArmor().dr > 0); // exo measurably reduces incoming damage
});
