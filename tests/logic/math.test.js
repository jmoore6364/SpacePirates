import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, lerp, wrapAngle, TAU } from '../../src/util/math.js';

test('clamp keeps values within bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('lerp interpolates linearly', () => {
  assert.equal(lerp(0, 10, 0), 0);
  assert.equal(lerp(0, 10, 1), 10);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test('wrapAngle maps into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(TAU)) < 1e-9);
  assert.ok(Math.abs(wrapAngle(Math.PI * 3) - Math.PI) < 1e-9);
  assert.ok(wrapAngle(-Math.PI * 1.5) > 0);
});
