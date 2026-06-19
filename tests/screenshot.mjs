// Self-test harness: build the game, serve it, load in headless Edge via
// Playwright, fail on any console/page/WebGL error, and screenshot each scene
// so Claude can visually verify the build. No human needed.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 5187;
const URL = `http://localhost:${PORT}/`;
const SHOT_DIR = path.join(root, 'test-screenshots');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, shell: true, stdio: 'inherit', ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`server at ${url} did not start in ${timeoutMs}ms`);
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });

  console.log('› building…');
  await run('npm', ['run', 'build']);

  console.log('› starting preview server…');
  const server = spawn('npm', ['run', 'preview', '--', '--port', String(PORT)], {
    cwd: root, shell: true, stdio: 'inherit',
  });

  let browser;
  const errors = [];
  try {
    await waitForServer(URL);

    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: [
        '--ignore-gpu-blocklist',
        '--enable-unsafe-swiftshader',
        '--use-angle=swiftshader',
        '--enable-webgl',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    page.on('console', (m) => {
      if (m.type() === 'error') { errors.push(`console.error: ${m.text()}`); console.log(`  [console] ${m.text()}`); }
    });
    page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message}`); console.log(`  [pageerror] ${e.message}`); });

    console.log(`› loading ${URL}`);
    await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

    await page.waitForFunction(() => window.__VOID_CORSAIR_READY__ === true, { timeout: 20000 });

    // confirm a real WebGL context exists (not a 2d fallback)
    const gl = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return 'no-canvas';
      const ctx = c.getContext('webgl2') || c.getContext('webgl');
      return ctx ? 'ok' : 'no-webgl';
    });
    if (gl !== 'ok') errors.push(`webgl check failed: ${gl}`);

    // Pass 6: title screen shows at boot; capture it, then launch
    await sleep(400);
    if (!(await page.evaluate(() => window.__VC__.titleScreen.isOpen))) {
      errors.push('title screen not shown at boot');
    }
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass6-title.png') });
    console.log('› screenshot → pass6-title.png');
    await page.evaluate(() => window.__VC__.start(true)); // NEW GAME — clean state each run
    await sleep(400);
    const boot = await page.evaluate(() => ({
      started: window.__VC__.scenes.mode,
      bloom: window.__VC__.renderer.bloomEnabled,
      audioCtx: !!window.__VC__.audio.ctx,
    }));
    console.log(`› launched: mode=${boot.started}, bloom=${boot.bloom}, audioCtx=${boot.audioCtx}`);

    // resting frame
    await sleep(600);
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass1-rest.png') });

    // fly: full throttle + a banking turn, then capture motion
    await page.evaluate(() => {
      const i = window.__VC__?.input;
      if (i) { i.press('Space'); i.press('ArrowLeft'); i.press('KeyQ'); }
    });
    await sleep(2200);
    const shot = path.join(SHOT_DIR, 'pass1-flight.png');
    await page.screenshot({ path: shot });
    console.log(`› screenshot → ${shot}`);

    const telem = await page.evaluate(() => {
      const s = window.__VC__?.scenes?.current;
      return {
        fps: window.__VC__?.loop?.fps ?? 0,
        speed: Math.round(s?.hud?.speed ?? 0),
        throttle: Math.round((s?.hud?.throttle ?? 0) * 100),
      };
    });
    console.log(`› telemetry: ${telem.fps} fps, throttle ${telem.throttle}%, speed ${telem.speed} u/s`);
    if (telem.speed < 50) errors.push(`ship not moving (speed=${telem.speed})`);

    // stop flying
    await page.evaluate(() => {
      const i = window.__VC__.input;
      ['Space', 'ArrowLeft', 'KeyQ'].forEach((c) => i.release(c));
    });

    // Enemy variety: spawn one of each archetype for a showcase
    await page.evaluate(() => {
      const s = window.__VC__.space; const c = s.combat;
      s.ship.throttle = 0; s.ship.velocity.set(0, 0, 0);
      c.enemies.forEach((e) => s.scene.remove(e.mesh)); c.enemies = [];
      c._spawnCd = 999;
      const f = s.ship.forward();
      const base = s.ship.position.clone().addScaledVector(f, 150);
      ['scout', 'raider', 'gunship'].forEach((tk, i) => {
        const p = base.clone(); p.x += (i - 1) * 70;
        c._spawnEnemy(p, tk);
      });
    });
    await sleep(300);
    const variety = await page.evaluate(() => {
      const c = window.__VC__.space.combat;
      return {
        n: c.enemies.length,
        hps: c.enemies.map((e) => e.hp),
        names: c.enemies.map((e) => e.type.name),
        radar: window.__VC__.space.hud?.radar?.length ?? 0,
      };
    });
    console.log(`› enemy variety: ${JSON.stringify(variety.names)} hp=${JSON.stringify(variety.hps)} radar=${variety.radar}`);
    if (variety.n !== 3) errors.push(`enemy variety spawn count ${variety.n}`);
    if (new Set(variety.hps).size < 3) errors.push('enemy archetypes not distinct (hp)');
    if (variety.radar < 8) errors.push(`radar blips too few (${variety.radar})`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass8-enemies.png') });
    console.log('› screenshot → pass8-enemies.png');

    // Pass 5: combat — halt, place a target dead ahead, open fire
    await page.evaluate(() => {
      const s = window.__VC__.space;
      const c = s.combat;
      s.ship.throttle = 0;
      s.ship.velocity.set(0, 0, 0);
      c.enemies.forEach((e) => s.scene.remove(e.mesh));
      c.enemies = [];
      c._spawnCd = 999; // deterministic: one target, no auto-waves mid-test
      const f = s.ship.forward();
      const p = s.ship.position.clone().addScaledVector(f, 120);
      c._spawnEnemy(p);
    });
    const kills0 = await page.evaluate(() => window.__VC__.space.combat.kills);
    await page.evaluate(() => window.__VC__.input.press('KeyJ'));
    await page.waitForFunction((k) => window.__VC__.space.combat.kills > k, kills0, { timeout: 8000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass5-combat.png') });
    await page.evaluate(() => window.__VC__.input.release('KeyJ'));
    const combat = await page.evaluate(() => {
      const c = window.__VC__.space.combat;
      return { kills: c.kills, wanted: c.wanted, shield: Math.round(c.shield), hull: Math.round(c.hull) };
    });
    console.log(`› combat: kills ${kills0}→${combat.kills}, wanted ${combat.wanted}, shield ${combat.shield}, hull ${combat.hull}`);
    if (combat.kills <= kills0) errors.push('combat: fired but destroyed no target');
    console.log('› screenshot → pass5-combat.png');
    // clear the field + heal so combat doesn't disrupt later scenes
    await page.evaluate(() => {
      const s = window.__VC__.space; const c = s.combat;
      c.enemies.forEach((e) => s.scene.remove(e.mesh)); c.enemies = [];
      c.shield = c.maxShield; c.hull = c.maxHull; c.wanted = 0; c.kills = 0;
    });

    // Pass 2: star map opens
    await page.keyboard.press('m');
    await sleep(400);
    if (!(await page.evaluate(() => window.__VC__.starMap.isOpen))) {
      errors.push('star map did not open on M');
    }
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass2-starmap.png') });
    console.log('› screenshot → pass2-starmap.png');
    await page.keyboard.press('m'); // close
    await sleep(200);

    // Pass 2: approach prompt fires near a world
    await page.evaluate(() => {
      const s = window.__VC__.space;
      const p = s.planets[0];
      const w = p.userData.world;
      s.ship.position.set(p.position.x, p.position.y, p.position.z + w.r * 1.4);
      s.ship.velocity.set(0, 0, 0);
      s.ship.throttle = 0;
      s.ship.object.lookAt(p.position);
    });
    await sleep(500);
    if (!(await page.evaluate(() => !!window.__VC__.space.approach))) {
      errors.push('approach prompt did not trigger near a world');
    }
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass2-approach.png') });
    console.log('› screenshot → pass2-approach.png');

    // Pass 3: land on the world (F while in approach), then walk the city
    await page.keyboard.press('f');
    await sleep(1200); // fade transition
    const mode = await page.evaluate(() => window.__VC__.scenes.mode);
    if (mode !== 'SURFACE') errors.push(`did not land (mode=${mode})`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass3-city.png') });
    console.log(`› screenshot → pass3-city.png (mode=${mode})`);

    const before = await page.evaluate(() => {
      const c = window.__VC__.surface.character;
      return { x: c.position.x, z: c.position.z };
    });
    await page.evaluate(() => { const i = window.__VC__.input; i.press('KeyW'); i.press('KeyD'); });
    await sleep(1500);
    await page.evaluate(() => { const i = window.__VC__.input; i.release('KeyW'); i.release('KeyD'); });
    const after = await page.evaluate(() => {
      const c = window.__VC__.surface.character;
      return { x: c.position.x, z: c.position.z };
    });
    const walked = Math.hypot(after.x - before.x, after.z - before.z);
    console.log(`› character walked ${walked.toFixed(1)} units`);
    if (walked < 3) errors.push(`character did not walk (moved ${walked.toFixed(1)})`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass3-walk.png') });
    console.log('› screenshot → pass3-walk.png');

    // On-foot blaster combat: spawn an enforcer in front and gun it down
    await page.evaluate(() => {
      const s = window.__VC__.surface; const g = s.ground; const c = s.character;
      g.enemies.forEach((e) => s.scene.remove(e.mesh)); g.enemies = [];
      const h = c.heading;
      const v = c.position.clone();
      v.x += Math.sin(h) * 18; v.z += Math.cos(h) * 18; v.y = 0;
      g.spawnEnforcer(v);
    });
    const enfBefore = await page.evaluate(() => window.__VC__.surface.ground.enemies.length);
    const credBefore = await page.evaluate(() => window.__VC__.player.credits);
    await page.evaluate(() => window.__VC__.input.press('KeyJ'));
    await page.waitForFunction(() => window.__VC__.surface.ground.enemies.length === 0, { timeout: 9000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass9-onfoot.png') });
    await page.evaluate(() => window.__VC__.input.release('KeyJ'));
    const onfoot = await page.evaluate(() => ({
      enemies: window.__VC__.surface.ground.enemies.length,
      credits: window.__VC__.player.credits,
    }));
    console.log(`› on-foot combat: enforcers ${enfBefore}→${onfoot.enemies}, credits ${credBefore}→${onfoot.credits}`);
    if (onfoot.enemies !== 0) errors.push('on-foot: enforcer not eliminated by blaster');
    console.log('› screenshot → pass9-onfoot.png');

    // Pass 4: trader shop — walk to the trader, open, buy an upgrade
    await page.evaluate(() => {
      const s = window.__VC__.surface;
      const t = s.interactables.find((i) => i.id === 'shop');
      s.character.position.set(t.position.x, 0, t.position.z + 4);
    });
    await sleep(250);
    const interactId = await page.evaluate(() => window.__VC__.surface.hud?.interact?.id);
    if (interactId !== 'shop') errors.push(`shop interact not detected (got ${interactId})`);
    await page.keyboard.press('e');
    await sleep(300);
    if (!(await page.evaluate(() => window.__VC__.shop.isOpen))) errors.push('shop did not open');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass4-shop.png') });
    console.log('› screenshot → pass4-shop.png');
    const creditsBefore = await page.evaluate(() => window.__VC__.player.credits);
    await page.evaluate(() => document.querySelector('#vc-shop [data-buy="engine"]')?.click());
    await sleep(150);
    const afterBuy = await page.evaluate(() => ({
      credits: window.__VC__.player.credits,
      eng: window.__VC__.player.level('engine'),
    }));
    if (!(afterBuy.credits < creditsBefore)) errors.push('upgrade did not deduct credits');
    if (afterBuy.eng < 1) errors.push('engine upgrade level did not rise');
    console.log(`› bought engine → lvl ${afterBuy.eng}, credits ${creditsBefore}→${afterBuy.credits}`);
    await page.keyboard.press('e'); // close
    await sleep(250);

    // Pass 4: mission board — accept a delivery
    await page.evaluate(() => {
      const s = window.__VC__.surface;
      const t = s.interactables.find((i) => i.id === 'missions');
      s.character.position.set(t.position.x, 0, t.position.z + 4);
    });
    await sleep(250);
    await page.keyboard.press('e');
    await sleep(300);
    if (!(await page.evaluate(() => window.__VC__.missionBoard.isOpen))) errors.push('mission board did not open');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass4-missions.png') });
    console.log('› screenshot → pass4-missions.png');
    await page.evaluate(() => document.querySelector('#vc-missions [data-take]')?.click());
    await sleep(150);
    const active = await page.evaluate(() => window.__VC__.missionLog.active.length);
    if (active < 1) errors.push('mission was not accepted');
    console.log(`› accepted mission → ${active} active`);
    await page.keyboard.press('e'); // close
    await sleep(250);

    // Trade: walk to the Market, buy a commodity (deepened economy)
    await page.evaluate(() => {
      const s = window.__VC__.surface;
      const t = s.interactables.find((i) => i.id === 'market');
      s.character.position.set(t.position.x, 0, t.position.z + 4);
    });
    await page.waitForFunction(() => window.__VC__.surface?.hud?.interact?.id === 'market', { timeout: 5000 });
    await page.keyboard.press('e');
    await sleep(300);
    if (!(await page.evaluate(() => window.__VC__.market.isOpen))) errors.push('market did not open');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass7-market.png') });
    console.log('› screenshot → pass7-market.png');
    const creditsPreTrade = await page.evaluate(() => window.__VC__.player.credits);
    await page.evaluate(() => document.querySelector('#vc-market [data-buy]')?.click());
    await sleep(150);
    const trade = await page.evaluate(() => ({
      credits: window.__VC__.player.credits,
      cargo: window.__VC__.player.cargoUsed(),
    }));
    if (!(trade.credits < creditsPreTrade)) errors.push('market buy did not deduct credits');
    if (trade.cargo < 1) errors.push('market buy did not add cargo');
    console.log(`› bought cargo → hold ${trade.cargo}, credits ${creditsPreTrade}→${trade.credits}`);
    await page.keyboard.press('e'); // close
    await sleep(250);

    // Pass 3: take off (return to the ship, press T)
    await page.evaluate(() => { window.__VC__.surface.character.position.set(0, 0, 10); });
    await page.waitForFunction(() => window.__VC__.surface?.hud?.nearShip === true, { timeout: 5000 });
    await page.keyboard.press('t');
    await page.waitForFunction(() => window.__VC__.scenes.mode === 'SPACE', { timeout: 5000 }).catch(() => {});
    const mode2 = await page.evaluate(() => window.__VC__.scenes.mode);
    if (mode2 !== 'SPACE') errors.push(`did not take off (mode=${mode2})`);
    console.log(`› takeoff → mode=${mode2}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass3-takeoff.png') });
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (errors.length) {
    console.error('\n✗ SELF-TEST FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  console.log('\n✓ self-test passed: rendered, WebGL OK, no console errors.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
