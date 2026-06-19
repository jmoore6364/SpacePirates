import { Renderer } from './renderer/Renderer.js';
import { GameLoop } from './core/GameLoop.js';
import { SceneManager, Mode } from './core/GameState.js';
import { Input } from './core/Input.js';
import { SpaceScene } from './scenes/SpaceScene.js';

const container = document.getElementById('app');
const renderer = new Renderer(container);
const scenes = new SceneManager(renderer);
const input = new Input();

// Pass 1: free-flight space.
scenes.switchTo(Mode.SPACE, new SpaceScene(input));

const hudMode = document.getElementById('hud-mode');
const hudFps = document.getElementById('hud-fps');
const hudThrottle = document.getElementById('hud-throttle');
const hudSpeed = document.getElementById('hud-speed');
const loading = document.getElementById('loading');

let hudTimer = 0;
const loop = new GameLoop({
  update: (dt) => {
    scenes.update(dt);
    hudTimer += dt;
    if (hudTimer >= 0.15) {
      hudTimer = 0;
      hudMode.textContent = `MODE: ${scenes.mode}`;
      hudFps.textContent = `${loop.fps} fps`;
      const h = scenes.current?.hud;
      if (h) {
        const pct = Math.round(h.throttle * 100);
        const bars = Math.round(h.throttle * 16);
        hudThrottle.textContent = `THR [${'█'.repeat(bars)}${'·'.repeat(16 - bars)}] ${pct}%`;
        hudSpeed.textContent = `SPD ${Math.round(h.speed)} u/s`;
      }
    }
  },
  render: () => renderer.render(),
});

loop.start();

requestAnimationFrame(() => {
  loading.classList.add('hidden');
  window.__VOID_CORSAIR_READY__ = true;
});

window.__VC__ = { renderer, scenes, loop, input };
