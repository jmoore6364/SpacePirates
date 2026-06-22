import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, DEFAULT_BINDINGS } from '../../src/core/Input.js';

// stub event target so Input constructs without a DOM
const stub = () => ({ addEventListener() {}, removeEventListener() {} });

test('actions resolve from the default key bindings', () => {
  const i = new Input(stub());
  assert.equal(i.act('thrust'), false);
  i.keys.add('Space');
  assert.equal(i.act('thrust'), true);
  assert.equal(i.actAxis('brake', 'thrust'), 1);
  i.keys.add('ShiftLeft');
  assert.equal(i.actAxis('brake', 'thrust'), 0); // both held cancel
});

test('rebinding an action changes which key triggers it; reset restores defaults', () => {
  const i = new Input(stub());
  i.setBinding('thrust', 'KeyT');
  assert.deepEqual(i.bindings.thrust, ['KeyT']);
  i.keys.add('Space');
  assert.equal(i.act('thrust'), false); // old key no longer bound
  i.keys.add('KeyT');
  assert.equal(i.act('thrust'), true);
  i.resetBindings();
  assert.deepEqual(i.bindings.thrust, DEFAULT_BINDINGS.thrust);
});

test('firing reads the bound fire key', () => {
  const i = new Input(stub());
  assert.equal(i.firing(), false);
  i.keys.add('KeyJ');
  assert.equal(i.firing(), true);
});

test('pollGamepad is a safe no-op without a Gamepad API', () => {
  const i = new Input(stub());
  i.pollGamepad();
  assert.equal(i.padConnected, false);
  assert.equal(i.pad.throttle, 0);
});
