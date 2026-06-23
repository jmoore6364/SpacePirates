import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../../src/game/Player.js';
import { QuestLog, questById } from '../../src/game/Quests.js';

function fresh() { return new QuestLog(new Player(null)); }

test('quest is available before starting, not after', () => {
  const log = fresh();
  assert.equal(log.isAvailable('maw-job'), true);
  log.start('maw-job');
  assert.equal(log.isAvailable('maw-job'), false);
  assert.equal(log.active.id, 'maw-job');
});

test('talking to Vex at Neon Haven starts and advances past the intro step', () => {
  const log = fresh();
  const r = log.talk('vex', 'neon-haven'); // auto-starts then advances step 0 -> 1
  assert.equal(r.advanced, true);
  assert.equal(log.stepIndex, 1);
  assert.equal(log.currentStep().type, 'travel');
});

test('travel step advances only at the right world', () => {
  const log = fresh();
  log.talk('vex', 'neon-haven');           // -> step 1 (travel dust-reach)
  assert.equal(log.onArrive('cryo').advanced, false);
  const r = log.onArrive('dust-reach');
  assert.equal(r.advanced, true);
  assert.equal(log.currentStep().type, 'kill');
});

test('kill step needs the full count', () => {
  const log = fresh();
  log.talk('vex', 'neon-haven');
  log.onArrive('dust-reach');              // -> kill step (count 3)
  assert.equal(log.onKill().progress, true);
  assert.equal(log.onKill().progress, true);
  const r = log.onKill();                  // third kill completes the step
  assert.equal(r.advanced, true);
  assert.equal(r.completed, false);        // step advanced, quest not done
  assert.equal(log.currentStep().type, 'travel');
});

test('finishing the arc pays the reward and marks it done', () => {
  const p = new Player(null);
  const log = new QuestLog(p);
  const before = p.credits;
  log.talk('vex', 'neon-haven');           // step1 travel dust-reach
  log.onArrive('dust-reach');              // step2 kill
  log.onKill(); log.onKill(); log.onKill(); // step3 travel the-maw
  log.onArrive('the-maw');                 // step4 talk vex @ the-maw
  const r = log.talk('vex', 'the-maw');    // complete
  assert.equal(r.completed, true);
  assert.equal(p.credits, before + questById('maw-job').reward.credits);
  assert.equal(log.active, null);
  assert.equal(log.isDone('maw-job'), true);
});

test('quest NPC appears at the giver world and at active talk steps', () => {
  const log = fresh();
  assert.equal(log.npcHere('vex', 'neon-haven'), true);  // available at giver world
  assert.equal(log.npcHere('vex', 'the-maw'), false);
  // progress to the final talk step at the-maw
  log.talk('vex', 'neon-haven'); log.onArrive('dust-reach');
  log.onKill(); log.onKill(); log.onKill(); log.onArrive('the-maw');
  assert.equal(log.npcHere('vex', 'the-maw'), true);
});

function finishMawJob(log) {
  log.talk('vex', 'neon-haven'); log.onArrive('dust-reach');
  log.onKill(); log.onKill(); log.onKill(); log.onArrive('the-maw');
  log.talk('vex', 'the-maw');
}

test('second storyline is gated behind The Maw Job', () => {
  const log = fresh();
  assert.equal(log.isAvailable('cold-trail'), false);   // locked until maw-job done
  assert.equal(log.npcHere('mara', 'cryo'), false);
  finishMawJob(log);
  assert.equal(log.isDone('maw-job'), true);
  assert.equal(log.isAvailable('cold-trail'), true);    // now unlocked
  assert.equal(log.npcHere('mara', 'cryo'), true);      // Mara appears at Cryo
});

test('the Cold Trail arc runs end to end with a generic giver', () => {
  const p = new Player(null);
  const log = new QuestLog(p);
  finishMawJob(log);
  const before = p.credits;
  const start = log.talk('mara', 'cryo');               // start + advance intro
  assert.equal(start.advanced, true);
  assert.equal(log.active.id, 'cold-trail');
  log.onArrive('verdant');                              // travel step
  log.onKill(); log.onKill(); log.onKill(); log.onKill(); // kill 4
  log.onArrive('cryo');                                 // return
  const r = log.talk('mara', 'cryo');                   // final
  assert.equal(r.completed, true);
  assert.equal(p.credits, before + questById('cold-trail').reward.credits);
  assert.equal(log.isDone('cold-trail'), true);
});

test('giverAt reports the right NPC + name per world', () => {
  const log = fresh();
  assert.deepEqual(log.giverAt('neon-haven'), { npc: 'vex', name: 'Vex' });
  assert.equal(log.giverAt('cryo'), null); // cold-trail still locked
  finishMawJob(log);
  assert.deepEqual(log.giverAt('cryo'), { npc: 'mara', name: 'Mara' });
});
