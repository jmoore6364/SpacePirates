// Optional 3D ship models (Kenney "Space Kit", CC0 — see assets/models/KENNEY-LICENSE.txt).
// We preload a few GLBs once, normalize each to a consistent size/orientation, and
// hand out clones. Ship.js uses a clone when available and otherwise falls back to
// the procedural mesh, so the game still runs if loading fails or hasn't finished.
import { THREE } from '../renderer/Renderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import speederA from '../assets/models/craft_speederA.glb?url';
import racer from '../assets/models/craft_racer.glb?url';
import cargoA from '../assets/models/craft_cargoA.glb?url';
import speederD from '../assets/models/craft_speederD.glb?url';

// hull id → { url, size: target longest-axis length in world units }
const SHIP_MODELS = {
  corsair:     { url: speederA, size: 5.2 },
  interceptor: { url: racer,    size: 5.0 },
  freighter:   { url: cargoA,   size: 6.6 },
  gunship:     { url: speederD, size: 6.0 },
};

// Kenney craft are modelled nose-toward +Z, Y-up; our ship's forward is -Z, so the
// normalized model is yawed 180° to point the nose the right way.
const MODEL_YAW = Math.PI;

const _cache = new Map(); // hullId → normalized THREE.Object3D (template to clone)
let _loaded = false;
let _loadPromise = null;

// Recenter, orient and scale a loaded gltf scene into a tidy template group.
function normalize(scene, size) {
  const root = new THREE.Group();
  root.add(scene);

  // center on origin so rotation/scale behave, then scale to the target length
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.sub(center);
  const span = box.getSize(new THREE.Vector3());
  const longest = Math.max(span.x, span.y, span.z) || 1;
  root.scale.setScalar(size / longest);
  root.rotation.y = MODEL_YAW;

  scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return root;
}

// Kick off loading all ship models. Safe to call repeatedly; returns the same promise.
export function preloadShipModels() {
  if (_loadPromise) return _loadPromise;
  const loader = new GLTFLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  _loadPromise = Promise.all(
    Object.entries(SHIP_MODELS).map(([hull, def]) =>
      load(def.url).then((gltf) => { _cache.set(hull, normalize(gltf.scene, def.size)); })
        .catch(() => { /* leave this hull on the procedural fallback */ }),
    ),
  ).then(() => { _loaded = true; });
  return _loadPromise;
}

export function modelsReady() { return _loaded; }

// A fresh clone of the ship model for a hull, or null to use the procedural mesh.
export function shipModel(hullId) {
  const tpl = _cache.get(hullId);
  return tpl ? tpl.clone(true) : null;
}
