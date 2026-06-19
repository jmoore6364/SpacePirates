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
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

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

    // Pass 3: take off (return to the ship, press T)
    await page.evaluate(() => { window.__VC__.surface.character.position.set(0, 0, 10); });
    await sleep(200);
    await page.keyboard.press('t');
    await sleep(1200);
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
