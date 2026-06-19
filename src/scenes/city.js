// Procedural low-poly neon city builder. Returns a Group plus metadata (spawn
// point, landing pad position, collider boxes) so the surface scene can place the
// character and ship and do simple collision. Themed by the world's palette.
import { THREE } from '../renderer/Renderer.js';

// Deterministic-ish PRNG so a given world always builds the same city.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function buildCity(world) {
  const rng = mulberry32(seedFrom(world.id));
  const group = new THREE.Group();
  const colliders = []; // {min:THREE.Vector3, max:THREE.Vector3} (XZ used)

  const neon = new THREE.Color(world.atmo);
  const accentHexes = [world.atmo, 0xff5db1, 0x66e0ff, 0xffe6a0];

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.95, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // neon grid lines on the ground for that synth look
  const grid = new THREE.GridHelper(400, 40, neon.getHex(), 0x142033);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  grid.position.y = 0.02;
  group.add(grid);

  // landing pad at origin
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x1a2336, roughness: 0.6, metalness: 0.4, emissive: neon.clone().multiplyScalar(0.15), emissiveIntensity: 1 }),
  );
  pad.position.set(0, 0.2, 0);
  group.add(pad);
  const padRing = new THREE.Mesh(
    new THREE.TorusGeometry(11, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: neon.getHex() }),
  );
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.45;
  group.add(padRing);

  // buildings on a grid, leaving streets and a clear plaza around the pad
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x252b3a, roughness: 0.8, metalness: 0.25 });
  let lightBudget = 14; // cap real lights for perf; rest are emissive only

  const step = 26;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const cx = gx * step + (rng() - 0.5) * 6;
      const cz = gz * step + (rng() - 0.5) * 6;
      if (Math.hypot(cx, cz) < 20) continue; // keep plaza clear around pad
      if (rng() < 0.12) continue;            // some empty lots

      const w = 6 + rng() * 8;
      const d = 6 + rng() * 8;
      const h = 8 + rng() * 38;

      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      b.position.set(cx, h / 2, cz);
      group.add(b);
      colliders.push({
        min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
        max: new THREE.Vector3(cx + w / 2, h, cz + d / 2),
      });

      // emissive neon strip up one face
      const stripColor = accentHexes[(gx + gz + 8) % accentHexes.length];
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, h * 0.8, 0.4),
        new THREE.MeshBasicMaterial({ color: stripColor }),
      );
      strip.position.set(cx + w / 2 + 0.1, h * 0.45, cz);
      group.add(strip);

      // rooftop glow + a few real point lights for atmosphere
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: stripColor }),
      );
      beacon.position.set(cx, h + 0.8, cz);
      group.add(beacon);
      if (lightBudget > 0 && rng() < 0.5) {
        const pl = new THREE.PointLight(stripColor, 1.2, 60);
        pl.position.set(cx, h + 1, cz);
        group.add(pl);
        lightBudget--;
      }
    }
  }

  return {
    group,
    colliders,
    spawn: new THREE.Vector3(0, 0, 16),  // just off the pad
    padPosition: new THREE.Vector3(0, 0, 0),
  };
}
