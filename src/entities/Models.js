// Optional 3D ship models (Kenney "Space Kit", CC0 — see assets/models/KENNEY-LICENSE.txt).
// We preload a few GLBs once, normalize each to a consistent size/orientation, and
// hand out clones. Ship.js uses a clone when available and otherwise falls back to
// the procedural mesh, so the game still runs if loading fails or hasn't finished.
import { THREE } from '../renderer/Renderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import speederA from '../assets/models/craft_speederA.glb?url';
import racer from '../assets/models/craft_racer.glb?url';
import cargoA from '../assets/models/craft_cargoA.glb?url';
import speederD from '../assets/models/craft_speederD.glb?url';
import characterMan from '../assets/models/quaternius-man.glb?url';

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

// On-foot character (Quaternius "Animated Men", CC0). Skinned + animated; converted
// from FBX → GLB and quantized. ~3.4 units tall to match the procedural figure.
const CHAR_HEIGHT = 3.4;
const CHAR_YAW = 0; // tune if the model faces the wrong way

const _cache = new Map(); // hullId → normalized THREE.Object3D (template to clone)
let _charTpl = null;      // { scene, animations } template for the player character
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

// Kick off loading all models (ships + character). Safe to call repeatedly.
export function preloadModels() {
  if (_loadPromise) return _loadPromise;
  const loader = new GLTFLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const ships = Object.entries(SHIP_MODELS).map(([hull, def]) =>
    load(def.url).then((gltf) => { _cache.set(hull, normalize(gltf.scene, def.size)); })
      .catch(() => { /* leave this hull on the procedural fallback */ }));
  const character = load(characterMan)
    .then((gltf) => {
      // self-illuminate a touch so the player reads on dark worlds (no carried light)
      gltf.scene.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (m.color && m.emissive) { m.emissive.copy(m.color); m.emissiveIntensity = 0.4; }
        }
      });
      _charTpl = { scene: gltf.scene, animations: gltf.animations };
    })
    .catch(() => { /* leave the on-foot player on the procedural figure */ });
  _loadPromise = Promise.all([...ships, character]).then(() => { _loaded = true; });
  return _loadPromise;
}

export function modelsReady() { return _loaded; }

// A fresh clone of the ship model for a hull, or null to use the procedural mesh.
export function shipModel(hullId) {
  const tpl = _cache.get(hullId);
  return tpl ? tpl.clone(true) : null;
}

// A fresh, normalized clone of the player character with its animation clips, or
// null to fall back to the procedural figure. SkeletonUtils.clone is required so the
// skinned mesh rebinds to the cloned skeleton; mixer tracks bind by bone name.
export function characterModel() {
  if (!_charTpl) return null;
  const inner = skeletonClone(_charTpl.scene); // SkeletonUtils: correct for skinned meshes
  // recenter feet to y=0 and center on x/z (force world matrices first so a skinned
  // mesh measures in its real bind pose, not an un-updated identity transform)
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const span = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -box.min.y, -center.z);
  // yaw on a separate pivot so it doesn't rotate the recenter offset
  const yawPivot = new THREE.Group();
  yawPivot.rotation.y = CHAR_YAW;
  yawPivot.add(inner);
  // scale the whole thing to a uniform height
  const wrapper = new THREE.Group();
  wrapper.add(yawPivot);
  wrapper.scale.setScalar(CHAR_HEIGHT / (span.y || 1));
  return { object: wrapper, animations: _charTpl.animations };
}
