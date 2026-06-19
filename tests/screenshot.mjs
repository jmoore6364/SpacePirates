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

    // #7 pause menu: Esc opens it (freezes sim), Esc resumes
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__VC__.menu.isOpen === true, { timeout: 5000 }).catch(() => {});
    const paused = await page.evaluate(() => window.__VC__.menu.isOpen);
    if (!paused) errors.push('pause menu did not open on Escape');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass7-menu.png') });
    // #11 save slots: open the manager from the menu, save to slot 2, verify
    await page.evaluate(() => window.__VC__.savesPanel.open(window.__VC__.player.activeSlot));
    await page.waitForFunction(() => window.__VC__.savesPanel.isOpen === true, { timeout: 5000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass11-saves.png') });
    await page.evaluate(() => document.querySelector('#saves [data-save="2"]')?.click());
    const slot2 = await page.evaluate(() => ({
      active: window.__VC__.player.activeSlot,
      has: !!localStorage.getItem('voidcorsair.slot.2'),
    }));
    if (!slot2.has) errors.push('save slot 2 was not written');
    console.log(`› saves: wrote slot 2 = ${slot2.has}, active slot ${slot2.active}`);
    await page.evaluate(() => window.__VC__.savesPanel.close());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__VC__.menu.isOpen === false, { timeout: 5000 }).catch(() => {});
    console.log(`› pause menu opened+resumed: ${paused}`);

    // #3 follow markers: the overlay canvas should have drawn something in space
    const markersDrawn = await page.evaluate(() => {
      const c = document.getElementById('markers');
      if (!c.width || !c.height) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });
    if (!markersDrawn) errors.push('follow markers not drawn in space');
    console.log(`› follow markers drawn: ${markersDrawn}`);

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

    // mouse-steer: hold the cursor to the right and confirm the ship yaws
    const yaw0 = await page.evaluate(() => {
      const q = window.__VC__.space.ship.quaternion; return { x: q.x, y: q.y, z: q.z, w: q.w };
    });
    await page.evaluate(() => { window.__VC__.input.setMouse(0.9, 0.0); });
    await sleep(700);
    await page.evaluate(() => { window.__VC__.input.setMouse(0, 0); });
    const yawTurned = await page.evaluate((q0) => {
      const q = window.__VC__.space.ship.quaternion;
      const dot = q.x * q0.x + q.y * q0.y + q.z * q0.z + q.w * q0.w;
      return 1 - Math.abs(dot); // 0 == identical orientation
    }, yaw0);
    if (yawTurned < 1e-3) errors.push('mouse steering did not rotate the ship');
    console.log(`› mouse steer rotated ship: ${yawTurned > 1e-3} (Δ=${yawTurned.toFixed(4)})`);

    // #17 touch controls: force-show and confirm the stick drives input
    const tc = await page.evaluate(() => {
      const t = window.__VC__.touch; t.enable();
      t._setStick(0.8, -0.5);
      const r = { mx: window.__VC__.input.mouse.x, tmActive: window.__VC__.input.touchMove.active, vis: document.getElementById('touch').style.display };
      return r;
    });
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass17-touch.png') });
    await page.evaluate(() => { const t = window.__VC__.touch; t._setStick(0, 0); t.disable(); window.__VC__.input.mouse.active = false; });
    if (Math.abs(tc.mx - 0.8) > 1e-6 || !tc.tmActive) errors.push('touch stick did not drive input');
    console.log(`› touch controls: stick→steer ${tc.mx}, move ${tc.tmActive}, shown ${tc.vis}`);

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

    // #8 XP/skills: the kill granted XP; open the skill sheet (K) and spend a point
    await page.evaluate(() => window.__VC__.player.addXp(500)); // guarantee a skill point
    await page.keyboard.press('k');
    await page.waitForFunction(() => window.__VC__.skills.isOpen === true, { timeout: 5000 }).catch(() => {});
    if (!(await page.evaluate(() => window.__VC__.skills.isOpen))) errors.push('skills panel did not open on K');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass8-skills.png') });
    const sk = await page.evaluate(() => {
      const before = window.__VC__.player.skillLevel('gunnery');
      window.__VC__.player.spendSkill('gunnery');
      return { lvl: window.__VC__.player.xpLevel, gun: window.__VC__.player.skillLevel('gunnery'), was: before };
    });
    if (sk.gun <= sk.was) errors.push('could not spend a skill point');
    console.log(`› skills: level ${sk.lvl}, gunnery ${sk.was}→${sk.gun}`);
    await page.keyboard.press('Escape'); // close
    await page.waitForFunction(() => window.__VC__.skills.isOpen === false, { timeout: 5000 }).catch(() => {});
    // grant credits so the later Shipyard purchase is affordable
    await page.evaluate(() => window.__VC__.player.addCredits(8000));
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
    const sysMapDrawn = await page.evaluate(() => {
      const c = document.querySelector('#starmap .sm-map');
      if (!c) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });
    if (!sysMapDrawn) errors.push('system map canvas not drawn');
    console.log(`› system map drawn: ${sysMapDrawn}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass2-starmap.png') });
    console.log('› screenshot → pass2-starmap.png');
    // #10 fuel: a fast-travel jump consumes fuel (select also closes the map)
    const jump = await page.evaluate(() => {
      const p = window.__VC__.player;
      const before = p.fuel;
      window.__VC__.starMap.select(2); // jump to Cryo Station
      return { before, after: p.fuel };
    });
    if (!(jump.after < jump.before)) errors.push('jump did not consume fuel');
    console.log(`› jump fuel: ${jump.before}→${jump.after}`);
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

    // land mouse-look: relative mouse motion turns the character (point anywhere)
    const yawA = await page.evaluate(() => window.__VC__.surface.lookYaw);
    await page.evaluate(() => { window.__VC__.input.lookDX += 400; }); // simulate mouse moved right
    await sleep(500);
    const yawB = await page.evaluate(() => window.__VC__.surface.lookYaw);
    if (Math.abs(yawB - yawA) < 0.1) errors.push(`mouse-look did not turn the character (Δ=${(yawB - yawA).toFixed(3)})`);
    console.log(`› land mouse look: yaw Δ=${(yawB - yawA).toFixed(2)}`);
    // forward still works on keys
    // face an open direction first so we don't immediately bump a building
    await page.evaluate(() => { window.__VC__.surface.lookYaw = 0; window.__VC__.surface.character.position.set(0, 0, 18); });
    const kb = await page.evaluate(() => { const c = window.__VC__.surface.character; window.__VC__.input.press('KeyW'); return { x: c.position.x, z: c.position.z }; });
    await sleep(500);
    await page.evaluate(() => window.__VC__.input.release('KeyW'));
    const ka = await page.evaluate(() => { const c = window.__VC__.surface.character; return { x: c.position.x, z: c.position.z }; });
    if (Math.hypot(ka.x - kb.x, ka.z - kb.z) < 1) errors.push('W did not walk the character forward');
    console.log(`› land key forward: ${Math.hypot(ka.x - kb.x, ka.z - kb.z).toFixed(1)} units`);

    // #1 Terrain: plaza is flat, terrain rolls away from it, character grounds to it
    const terr = await page.evaluate(() => {
      const s = window.__VC__.surface; const c = s.character;
      c.position.x = 110; c.position.z = 110; // out on the open terrain
      return { plaza: +s.heightAt(0, 0).toFixed(3), far: +s.heightAt(110, 110).toFixed(3) };
    });
    await sleep(150); // let the character settle onto the terrain
    const grounded = await page.evaluate(() => {
      const s = window.__VC__.surface; const c = s.character;
      return { y: +c.position.y.toFixed(2), expect: +s.heightAt(c.position.x, c.position.z).toFixed(2) };
    });
    console.log(`› terrain: plaza=${terr.plaza} far=${terr.far} charY=${grounded.y} (expect ~${grounded.expect})`);
    if (Math.abs(terr.plaza) > 0.05) errors.push(`plaza not flat (${terr.plaza})`);
    if (Math.abs(grounded.y - grounded.expect) > 0.45) errors.push('character not grounded to terrain');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass1-terrain.png') });
    console.log('› screenshot → pass1-terrain.png');

    // #5 world minimap drew on foot
    const miniDrawn = await page.evaluate(() => {
      const c = document.getElementById('minimap');
      if (!c.classList.contains('show') || !c.width) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });
    if (!miniDrawn) errors.push('world minimap not drawn on foot');
    console.log(`› world minimap drawn: ${miniDrawn}`);

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
    await page.waitForFunction(() => window.__VC__.surface?.hud?.interact?.id === 'shop', { timeout: 6000 }).catch(() => {});
    const interactId = await page.evaluate(() => window.__VC__.surface.hud?.interact?.id);
    if (interactId !== 'shop') errors.push(`shop interact not detected (got ${interactId})`);
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__VC__.shop.isOpen === true, { timeout: 6000 }).catch(() => {});
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
    await page.waitForFunction(() => window.__VC__.shop.isOpen === false, { timeout: 6000 }).catch(() => {});

    // Pass 4: mission board — accept a delivery
    await page.evaluate(() => {
      const s = window.__VC__.surface;
      const t = s.interactables.find((i) => i.id === 'missions');
      s.character.position.set(t.position.x, 0, t.position.z + 4);
    });
    await page.waitForFunction(() => window.__VC__.surface?.hud?.interact?.id === 'missions', { timeout: 6000 }).catch(() => {});
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__VC__.missionBoard.isOpen === true, { timeout: 6000 }).catch(() => {});
    if (!(await page.evaluate(() => window.__VC__.missionBoard.isOpen))) errors.push('mission board did not open');
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass4-missions.png') });
    console.log('› screenshot → pass4-missions.png');
    await page.evaluate(() => document.querySelector('#vc-missions [data-take]')?.click());
    await sleep(150);
    const active = await page.evaluate(() => window.__VC__.missionLog.active.length);
    if (active < 1) errors.push('mission was not accepted');
    console.log(`› accepted mission → ${active} active`);
    await page.keyboard.press('e'); // close
    await page.waitForFunction(() => window.__VC__.missionBoard.isOpen === false, { timeout: 6000 }).catch(() => {});

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
    // #10 refuel: drain fuel then refuel at the market
    const fuelTrade = await page.evaluate(() => {
      const p = window.__VC__.player;
      p.fuel = 50; p.credits += 1000;
      const before = p.fuel;
      const r = window.__VC__.market.root.querySelector('[data-refuel]');
      if (r) r.click();
      return { before, after: p.fuel, max: p.maxFuel };
    });
    if (!(fuelTrade.after > fuelTrade.before)) errors.push('refuel did not add fuel');
    console.log(`› refuel: fuel ${fuelTrade.before}→${fuelTrade.after}/${fuelTrade.max}`);
    await page.keyboard.press('e'); // close
    await page.waitForFunction(() => window.__VC__.market.isOpen === false, { timeout: 6000 }).catch(() => {});

    // #4 Storyline: take "The Maw Job" from Vex at Neon Haven
    const hasVex = await page.evaluate(() => !!window.__VC__.surface.interactables.find((i) => i.id === 'quest'));
    if (!hasVex) errors.push('quest-giver Vex not present at Neon Haven');
    await page.evaluate(() => {
      const s = window.__VC__.surface;
      const v = s.interactables.find((i) => i.id === 'quest');
      if (v) s.character.position.set(v.position.x, 0, v.position.z + 4);
    });
    await page.waitForFunction(() => window.__VC__.surface?.hud?.interact?.id === 'quest', { timeout: 6000 }).catch(() => {});
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__VC__.dialogue.isOpen === true, { timeout: 6000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass4-dialogue.png') });
    await page.evaluate(() => document.querySelector('#vc-dialogue [data-cont]')?.click());
    await sleep(200);
    const quest = await page.evaluate(() => ({
      active: window.__VC__.questLog.s.active,
      step: window.__VC__.questLog.s.step,
      obj: window.__VC__.questLog.objective(),
    }));
    console.log(`› quest: active=${quest.active} step=${quest.step} obj="${quest.obj}"`);
    if (quest.active !== 'maw-job') errors.push('quest did not start from Vex');
    if (quest.step < 1) errors.push('quest did not advance past the intro step');
    console.log('› screenshot → pass4-dialogue.png');

    // #9 Shipyard: buy a different hull and confirm stats change
    await page.evaluate(() => {
      const s = window.__VC__.surface;
      const v = s.interactables.find((i) => i.id === 'shipyard');
      if (v) s.character.position.set(v.position.x, 0, v.position.z + 4);
    });
    const hasYard = await page.evaluate(() => !!window.__VC__.surface.interactables.find((i) => i.id === 'shipyard'));
    if (!hasYard) errors.push('shipyard vendor not present');
    await page.waitForFunction(() => window.__VC__.surface?.hud?.interact?.id === 'shipyard', { timeout: 6000 }).catch(() => {});
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__VC__.shipyard.isOpen === true, { timeout: 6000 }).catch(() => {});
    await page.screenshot({ path: path.join(SHOT_DIR, 'pass9-shipyard.png') });
    const yard = await page.evaluate(() => {
      const p = window.__VC__.player;
      const cargoBefore = p.stats().cargo;
      const ok = p.buyHull('freighter');
      return { ok, hull: p.hull, cargoBefore, cargoAfter: p.stats().cargo };
    });
    if (!yard.ok || yard.hull !== 'freighter') errors.push('could not buy/equip a new hull');
    if (!(yard.cargoAfter > yard.cargoBefore)) errors.push('hull swap did not change stats');
    console.log(`› shipyard: hull=${yard.hull}, cargo ${yard.cargoBefore}→${yard.cargoAfter}`);
    await page.keyboard.press('e'); // close
    await page.waitForFunction(() => window.__VC__.shipyard.isOpen === false, { timeout: 6000 }).catch(() => {});

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
