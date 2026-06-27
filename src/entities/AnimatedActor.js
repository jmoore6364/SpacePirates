// Thin wrapper around a model clone + its AnimationMixer. Normalizes clip names
// across Quaternius packs (e.g. "Armature|Robot_Walking" → "walk") so callers can
// just ask for play('walk'/'idle'/'death'/...). Used by the player, crowd and
// enforcers. Call update(dt) every frame.
import { THREE } from '../renderer/Renderer.js';

const ALIAS = { walking: 'walk', running: 'run', runhold: 'run', idlehold: 'idle' };

// "HumanArmature|Man_Idle" / "Female_Walk" / "Robot_Walking" → "idle"/"walk"/"walk"
export function canonClip(name) {
  const k = name.toLowerCase().replace(/^.*\|/, '').replace(/^[a-z]+_/, '');
  return ALIAS[k] || k;
}

export class AnimatedActor {
  // model: { object, animations } from Models.characterModel()
  constructor(model) {
    this.object = model.object;
    this.mixer = new THREE.AnimationMixer(model.object);
    this.actions = {};
    for (const clip of model.animations) this.actions[canonClip(clip.name)] = this.mixer.clipAction(clip);
    this.current = null;
  }

  has(name) { return !!this.actions[name]; }

  // Crossfade to a clip. once:true plays through and holds the last frame (e.g. death).
  play(name, { fade = 0.2, once = false } = {}) {
    const next = this.actions[name];
    if (!next || this.current === name) return;
    const prev = this.current && this.actions[this.current];
    if (prev) prev.fadeOut(fade);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(fade).play();
    this.current = name;
  }

  update(dt) { this.mixer.update(dt); }
}
