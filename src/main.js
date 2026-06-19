import { Renderer } from './renderer/Renderer.js';
import { GameLoop } from './core/GameLoop.js';
import { SceneManager, Mode } from './core/GameState.js';
import { Input } from './core/Input.js';
import { SpaceScene } from './scenes/SpaceScene.js';
import { SurfaceScene } from './scenes/SurfaceScene.js';
import { StarMap } from './ui/StarMap.js';
import { Shop, MissionBoard } from './ui/Panels.js';
import { WORLDS } from './world/Worlds.js';
import { player } from './game/Player.js';
import { MissionLog, generateOffers } from './game/Missions.js';
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
  loading: document.getElementById('loading'),
  fade: document.getElementById('fade'),
};

let space = null;
let surface = null;
let busy = false; // true during a fade transition
let panel = null; // open DOM panel (shop / missions)

const missionLog = new MissionLog(player);
const offersByWorld = {};

const shop = new Shop({ onClose: () => { panel = null; if (surface) surface.inputLocked = false; } });
const missionBoard = new MissionBoard({ onClose: () => { panel = null; if (surface) surface.inputLocked = false; } });

function enterSpace(worldId) {
  space = new SpaceScene(input);
  space.onEvent = (e) => {
    if (e.type === 'kill') toast(`Target destroyed — bounty +${e.bounty} cr`);
    else if (e.type === 'destroyed') toast(`SHIP DESTROYED — emergency repair at Neon Haven (−${e.penalty} cr)`);
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
    const done = missionLog.arriveAt(world.id);
    if (done.length) {
      const sum = done.reduce((a, m) => a + m.reward, 0);
      toast(`Delivered ${done.length} job(s) at ${world.name} — +${sum} cr`);
    } else {
      toast(`Touchdown — ${world.name}. [E] interact · [T] take off`);
    }
  });
}

function openInteract(world, kind) {
  surface.inputLocked = true;
  if (kind === 'shop') { shop.open(player); panel = shop; }
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

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  toastTimer = 2.4;
}

// --- UI / mode keys (single-press) ---
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || busy) return;

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

enterSpace();
loop.start();

requestAnimationFrame(() => {
  el.loading.classList.add('hidden');
  window.__VOID_CORSAIR_READY__ = true;
});

window.__VC__ = {
  renderer, scenes, loop, input, starMap,
  player, missionLog, shop, missionBoard,
  get space() { return space; },
  get surface() { return surface; },
  land, takeoff,
};
