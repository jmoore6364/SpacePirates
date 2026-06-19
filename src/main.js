import { Renderer } from './renderer/Renderer.js';
import { GameLoop } from './core/GameLoop.js';
import { SceneManager, Mode } from './core/GameState.js';
import { Input } from './core/Input.js';
import { SpaceScene } from './scenes/SpaceScene.js';
import { StarMap } from './ui/StarMap.js';
import { WORLDS } from './world/Worlds.js';

const container = document.getElementById('app');
const renderer = new Renderer(container);
const scenes = new SceneManager(renderer);
const input = new Input();

const space = new SpaceScene(input);
scenes.switchTo(Mode.SPACE, space);

const starMap = new StarMap({
  onTravel: (worldId) => {
    space.inputLocked = false;
    space.travelTo(worldId);
    scenes.mode = Mode.SPACE;
    toast(`Warping to ${WORLDS.find((w) => w.id === worldId)?.name}…`);
  },
});

const el = {
  mode: document.getElementById('hud-mode'),
  fps: document.getElementById('hud-fps'),
  throttle: document.getElementById('hud-throttle'),
  speed: document.getElementById('hud-speed'),
  approach: document.getElementById('hud-approach'),
  toast: document.getElementById('hud-toast'),
  loading: document.getElementById('loading'),
};

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  toastTimer = 2.2;
}

// --- UI / mode keys (single-press, separate from held flight controls) ---
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  switch (e.code) {
    case 'KeyM':
      if (starMap.isOpen) {
        starMap.close();
        space.inputLocked = false;
        scenes.mode = Mode.SPACE;
      } else {
        starMap.open(WORLDS, space.ship.position);
        space.inputLocked = true;
        scenes.mode = Mode.MAP;
      }
      e.preventDefault();
      break;
    case 'Escape':
      if (starMap.isOpen) {
        starMap.close();
        space.inputLocked = false;
        scenes.mode = Mode.SPACE;
      }
      break;
    case 'KeyF':
      if (!starMap.isOpen && space.approach) {
        // Landing sequence arrives in Pass 3; acknowledge the dock for now.
        toast(`Approaching ${space.approach.world.name} — landing systems online soon.`);
      }
      break;
    default:
      if (starMap.isOpen && /^Digit[1-9]$/.test(e.code)) {
        starMap.select(Number(e.code.slice(5)) - 1);
        e.preventDefault();
      }
  }
});

let hudTimer = 0;
const loop = new GameLoop({
  update: (dt) => {
    scenes.update(dt);

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.remove('show');
    }

    hudTimer += dt;
    if (hudTimer >= 0.12) {
      hudTimer = 0;
      el.mode.textContent = `MODE: ${scenes.mode}`;
      el.fps.textContent = `${loop.fps} fps`;
      const h = scenes.current?.hud;
      if (h) {
        const pct = Math.round(h.throttle * 100);
        const bars = Math.round(h.throttle * 16);
        el.throttle.textContent = `THR [${'█'.repeat(bars)}${'·'.repeat(16 - bars)}] ${pct}%`;
        el.speed.textContent = `SPD ${Math.round(h.speed)} u/s`;

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
  },
  render: () => renderer.render(),
});

loop.start();

requestAnimationFrame(() => {
  el.loading.classList.add('hidden');
  window.__VOID_CORSAIR_READY__ = true;
});

window.__VC__ = { renderer, scenes, loop, input, space, starMap };
