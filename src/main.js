import { Renderer } from './renderer/Renderer.js';
import { GameLoop } from './core/GameLoop.js';
import { SceneManager, Mode } from './core/GameState.js';
import { Input } from './core/Input.js';
import { SpaceScene } from './scenes/SpaceScene.js';
import { SurfaceScene } from './scenes/SurfaceScene.js';
import { StarMap } from './ui/StarMap.js';
import { Shop, MissionBoard, Market } from './ui/Panels.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { WORLDS } from './world/Worlds.js';
import { player } from './game/Player.js';
import { MissionLog, generateOffers } from './game/Missions.js';
import { AudioManager } from './systems/Audio.js';
import { tickMarket, commodityById } from './game/Market.js';
import { clamp } from './util/math.js';

const clamp01 = (x) => clamp(x, 0, 1);

const container = document.getElementById('app');
const renderer = new Renderer(container);
const scenes = new SceneManager(renderer);
const input = new Input();

const el = {
  mode: document.getElementById('hud-mode'),
  fps: document.getElementById('hud-fps'),
  throttle: document.getElementById('hud-throttle'),
  speed: document.getElementById('hud-speed'),
  approach: document.getElementById('hud-approach'),
  toast: document.getElementById('hud-toast'),
  credits: document.getElementById('hud-credits'),
  combat: document.getElementById('hud-combat'),
  radar: document.getElementById('radar'),
  loading: document.getElementById('loading'),
  fade: document.getElementById('fade'),
};

let space = null;
let surface = null;
let busy = false;    // true during a fade transition
let panel = null;    // open DOM panel (shop / missions)
let started = false; // false while the title screen is up

const audio = new AudioManager();
const missionLog = new MissionLog(player);
const offersByWorld = {};

// --- settings (bloom + sound), persisted ---
const SETTINGS_KEY = 'voidcorsair.settings.v1';
const settings = loadSettings();
function loadSettings() {
  try { return Object.assign({ bloom: true, muted: false }, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch { return { bloom: true, muted: false }; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

const closePanel = () => { panel = null; if (surface) surface.inputLocked = false; };
const shop = new Shop({ onClose: closePanel });
const missionBoard = new MissionBoard({ onClose: closePanel });
const market = new Market({ onClose: closePanel });

function enterSpace(worldId) {
  space = new SpaceScene(input);
  space.active = started; // stays paused behind the title screen
  space.onEvent = (e) => {
    switch (e.type) {
      case 'fire': audio.laser(); break;
      case 'hit': break;
      case 'playerHit': audio.hit(); break;
      case 'kill': {
        audio.explosion();
        const done = missionLog.recordKill();
        if (done.length) {
          const sum = done.reduce((a, m) => a + m.reward, 0);
          toast(`Bounty contract complete — +${sum} cr`);
        } else {
          toast(`Target destroyed — bounty +${e.bounty} cr`);
        }
        break;
      }
      case 'destroyed': audio.explosion(); toast(`SHIP DESTROYED — emergency repair at Neon Haven (−${e.penalty} cr)`); break;
    }
  };
  scenes.switchTo(Mode.SPACE, space);
  if (worldId) space.travelTo(worldId);
  surface = null;
}

const starMap = new StarMap({
  onTravel: (worldId) => {
    if (!space) return;
    space.inputLocked = false;
    space.travelTo(worldId);
    scenes.mode = Mode.SPACE;
    audio.warp();
    toast(`Warping to ${WORLDS.find((w) => w.id === worldId)?.name}…`);
  },
});

// --- transitions ---
function transition(midFn) {
  if (busy) return;
  busy = true;
  el.fade.classList.add('on');
  setTimeout(() => {
    midFn();
    el.fade.classList.remove('on');
    setTimeout(() => { busy = false; }, 460);
  }, 460);
}

function land(world) {
  transition(() => {
    surface = new SurfaceScene(input, world);
    scenes.switchTo(Mode.SURFACE, surface);
    // advance the living economy each time you make planetfall
    const news = tickMarket(WORLDS);

    const done = missionLog.arriveAt(world.id);
    if (done.length) {
      const sum = done.reduce((a, m) => a + m.reward, 0);
      toast(`Delivered ${done.length} job(s) at ${world.name} — +${sum} cr`);
    } else if (news) {
      toast(`NEWS: ${commodityLabel(news)}`);
    } else {
      toast(`Touchdown — ${world.name}. [E] interact · [T] take off`);
    }
  });
}

function openInteract(world, kind) {
  surface.inputLocked = true;
  audio.blip();
  if (kind === 'shop') { shop.open(player); panel = shop; }
  else if (kind === 'market') { market.open(player, world); panel = market; }
  else {
    const offers = offersByWorld[world.id] || (offersByWorld[world.id] = generateOffers(world.id));
    missionBoard.open(player, missionLog, offers);
    panel = missionBoard;
  }
}

function takeoff(world) {
  transition(() => {
    enterSpace(world.id);
    toast(`Lifting off from ${world.name}.`);
  });
}

function commodityLabel(ev) {
  const w = WORLDS.find((x) => x.id === ev.world)?.name || ev.world;
  const name = commodityById(ev.commodity)?.name || ev.commodity;
  return `${ev.kind === 'shortage' ? '▲' : '▼'} ${name} ${ev.kind} on ${w}`;
}

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  toastTimer = 2.4;
}

// --- UI / mode keys (single-press) ---
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || busy) return;

  // settings toggles work anytime
  if (e.code === 'KeyB') { settings.bloom = !settings.bloom; renderer.setBloom(settings.bloom); saveSettings(); toast(`Bloom ${settings.bloom ? 'on' : 'off'}`); return; }
  if (e.code === 'KeyP') { settings.muted = audio.toggleMute(); saveSettings(); toast(`Sound ${settings.muted ? 'off' : 'on'}`); return; }

  if (!started) return; // title screen owns input until launch

  // a DOM panel grabs E/Esc to close
  if (panel) {
    if (e.code === 'KeyE' || e.code === 'Escape') { panel.close(); e.preventDefault(); }
    return;
  }

  switch (e.code) {
    case 'KeyM':
      if (scenes.mode !== Mode.SPACE && !starMap.isOpen) break; // map is space-only
      if (starMap.isOpen) {
        starMap.close(); space.inputLocked = false; scenes.mode = Mode.SPACE;
      } else if (space) {
        starMap.open(WORLDS, space.ship.position); space.inputLocked = true; scenes.mode = Mode.MAP;
      }
      e.preventDefault();
      break;
    case 'Escape':
      if (starMap.isOpen) { starMap.close(); space.inputLocked = false; scenes.mode = Mode.SPACE; }
      break;
    case 'KeyF':
      if (scenes.mode === Mode.SPACE && space && space.approach) land(space.approach.world);
      break;
    case 'KeyT':
      if (scenes.mode === Mode.SURFACE && surface && surface.hud?.nearShip) takeoff(surface.world);
      break;
    case 'KeyE':
      if (scenes.mode === Mode.SURFACE && surface?.hud?.interact) {
        openInteract(surface.world, surface.hud.interact.id);
      }
      break;
    default:
      if (starMap.isOpen && /^Digit[1-9]$/.test(e.code)) {
        starMap.select(Number(e.code.slice(5)) - 1);
        e.preventDefault();
      }
  }
});

// --- radar scanner ---
const radarCtx = el.radar.getContext('2d');
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
let radarSweep = 0;
function drawRadar(blips) {
  const ctx = radarCtx;
  const W = el.radar.width, H = el.radar.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 6;
  ctx.clearRect(0, 0, W, H);

  // dish
  ctx.fillStyle = 'rgba(8,16,28,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,200,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,200,255,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();

  // sweep line
  radarSweep = (radarSweep + 0.12) % (Math.PI * 2);
  ctx.strokeStyle = 'rgba(120,255,180,0.35)';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(radarSweep) * R, cy - Math.cos(radarSweep) * R); ctx.stroke();

  // blips (forward = up → screen -y)
  for (const b of blips || []) {
    const px = cx + b.x * R;
    const py = cy + b.y * R;
    ctx.globalAlpha = b.far ? 0.5 : 1;
    ctx.fillStyle = hex(b.color);
    ctx.beginPath();
    ctx.arc(px, py, b.type === 'enemy' ? 2.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // own ship at center
  ctx.fillStyle = '#dff1ff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx + 4, cy + 4);
  ctx.closePath(); ctx.fill();
}

// --- HUD ---
let hudTimer = 0;
function renderHud() {
  el.mode.textContent = `MODE: ${scenes.mode}`;
  el.fps.textContent = `${loop.fps} fps`;
  el.credits.textContent = `${player.credits} cr`;
  const h = scenes.current?.hud;
  if (!h) return;

  if (h.onFoot) {
    el.throttle.textContent = `◈ ${h.world.name}`;
    el.speed.textContent = h.world.theme;
    el.combat.innerHTML = '';
    el.radar.classList.remove('show');
    if (h.interact) {
      el.approach.innerHTML = `▸ Press <b>E</b> — ${h.interact.label}`;
      el.approach.classList.add('show');
    } else if (h.nearShip) {
      el.approach.innerHTML = `▸ At your ship — press <b>T</b> to take off`;
      el.approach.classList.add('show');
    } else {
      el.approach.innerHTML = `<span class="lo">[WASD] walk · [E] interact at glowing vendors · [T] take off at ship</span>`;
      el.approach.classList.add('show');
    }
  } else {
    const pct = Math.round(h.throttle * 100);
    const bars = Math.round(h.throttle * 16);
    el.throttle.textContent = `THR [${'█'.repeat(bars)}${'·'.repeat(16 - bars)}] ${pct}%`;
    el.speed.textContent = `SPD ${Math.round(h.speed)} u/s`;

    if (h.radar) { el.radar.classList.add('show'); drawRadar(h.radar); }
    else el.radar.classList.remove('show');

    const c = h.combat;
    if (c) {
      const bar = (v, max, n = 10) => {
        const k = Math.round(clamp01(v / max) * n);
        return '█'.repeat(k) + '·'.repeat(n - k);
      };
      const stars = '★'.repeat(c.wanted) + '☆'.repeat(5 - c.wanted);
      el.combat.innerHTML =
        `<div class="sh">SHD [${bar(c.shield, c.maxShield)}] ${Math.round(c.shield)}</div>` +
        `<div class="hl">HUL [${bar(c.hull, c.maxHull)}] ${Math.round(c.hull)}</div>` +
        `<div class="wanted">WANTED ${stars}</div>` +
        (c.enemies ? `<div class="hl">⚠ ${c.enemies} hostile${c.enemies > 1 ? 's' : ''}</div>` : '');
    }

    if (h.approach && !starMap.isOpen) {
      el.approach.innerHTML =
        `▸ APPROACH: <b>${h.approach.world.name}</b> — press <b>F</b> to land` +
        `<div class="lo">${h.approach.world.blurb}</div>`;
      el.approach.classList.add('show');
    } else {
      el.approach.classList.remove('show');
    }
  }
}

const loop = new GameLoop({
  update: (dt) => {
    scenes.update(dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.remove('show');
    }
    hudTimer += dt;
    if (hudTimer >= 0.12) { hudTimer = 0; renderHud(); }
  },
  render: () => renderer.render(),
});

// apply persisted settings, blip on shop/mission changes
renderer.setBloom(settings.bloom);
audio.setMuted(settings.muted);
shop.onChange = () => audio.blip();
missionBoard.onChange = () => audio.blip();
market.onChange = () => audio.blip();

enterSpace();        // live backdrop behind the title
loop.start();

// title screen gates the start
const titleScreen = new TitleScreen({
  hasSave: player.hasSave(),
  onStart: (isNew) => {
    if (isNew) {
      player.reset();
      for (const k of Object.keys(offersByWorld)) delete offersByWorld[k];
    }
    started = true;
    enterSpace('neon-haven'); // fresh scene applies current ship stats; sets active
    audio.resume();
    audio.startMusic();
    toast(isNew ? 'New game — fly safe out there, Corsair.' : 'Welcome back, Corsair.');
  },
});

requestAnimationFrame(() => {
  el.loading.classList.add('hidden');
  window.__VOID_CORSAIR_READY__ = true;
});

window.__VC__ = {
  renderer, scenes, loop, input, starMap, audio, titleScreen,
  player, missionLog, shop, missionBoard, market,
  start: (isNew = false) => titleScreen.start(isNew),
  get space() { return space; },
  get surface() { return surface; },
  land, takeoff,
};
