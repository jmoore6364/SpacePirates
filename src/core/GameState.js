// Game modes (see DESIGN.md §3). Pass 0 only implements SPACE; the rest are
// declared so the state machine and HUD are ready to grow.
export const Mode = Object.freeze({
  TITLE: 'TITLE',
  SPACE: 'SPACE',
  LANDING: 'LANDING',
  SURFACE: 'SURFACE',
  INTERIOR: 'INTERIOR',
  MAP: 'MAP',
});

// Minimal scene state machine. A "scene" is anything with optional
// update(dt) / dispose() plus a `.scene` (Three.js Scene) to render.
export class SceneManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.mode = null;
    this.current = null;
  }

  switchTo(mode, scene) {
    if (this.current && this.current.dispose) this.current.dispose();
    this.mode = mode;
    this.current = scene;
    this.renderer.setScene(scene.scene);
    if (scene.onEnter) scene.onEnter(this.renderer);
  }

  update(dt) {
    if (this.current && this.current.update) this.current.update(dt, this.renderer);
  }
}
