import { Renderer } from './renderer/Renderer.js';
import { GameLoop } from './core/GameLoop.js';
import { SceneManager, Mode } from './core/GameState.js';
import { PlanetScene } from './scenes/PlanetScene.js';

const container = document.getElementById('app');
const renderer = new Renderer(container);
const scenes = new SceneManager(renderer);

// Pass 0: prove the render pipeline with a spinning planet (MODE: SPACE-ish).
scenes.switchTo(Mode.SPACE, new PlanetScene());

const hudMode = document.getElementById('hud-mode');
const hudFps = document.getElementById('hud-fps');
const loading = document.getElementById('loading');

let hudTimer = 0;
const loop = new GameLoop({
  update: (dt) => {
    scenes.update(dt);
    hudTimer += dt;
    if (hudTimer >= 0.25) {
      hudTimer = 0;
      hudMode.textContent = `MODE: ${scenes.mode}`;
      hudFps.textContent = `${loop.fps} fps`;
    }
  },
  render: () => renderer.render(),
});

loop.start();

// Signal to humans and to the screenshot harness that first frame rendered.
requestAnimationFrame(() => {
  loading.classList.add('hidden');
  window.__VOID_CORSAIR_READY__ = true;
});

// Expose a tiny handle for debugging / tests.
window.__VC__ = { renderer, scenes, loop };
