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

// Per-world terrain profile (amplitude/frequency/ground color). Themed so each
// world reads differently underfoot. See issue #1.
const TERRAIN = {
  'neon-haven': { amp: 2.2, freq: 0.030, color: 0x0c1018 }, // wet flats
  'dust-reach': { amp: 7.0, freq: 0.017, color: 0x3a2614 }, // dunes
  'cryo':       { amp: 4.0, freq: 0.026, color: 0x223a4a }, // ice plains
  'verdant':    { amp: 6.0, freq: 0.020, color: 0x153a1e }, // jungle hills
  'the-maw':    { amp: 8.0, freq: 0.032, color: 0x241b22 }, // asteroid rock
};

const PLAZA_R = 24;   // flat radius around the landing pad
const PLAZA_BLEND = 24;
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Build a deterministic height sampler for a world (renderer-agnostic).
function makeHeightAt(world) {
  const p = TERRAIN[world.id] || { amp: 4, freq: 0.025 };
  const f = p.freq, amp = p.amp;
  return function heightAt(x, z) {
    const raw = (Math.sin(x * f) * Math.cos(z * f)
      + Math.sin((x + z) * f * 1.7 + 1.3) * 0.5
      + Math.sin(x * f * 2.3 + z * f * 0.7) * 0.25) * amp;
    return raw * smoothstep(PLAZA_R, PLAZA_R + PLAZA_BLEND, Math.hypot(x, z));
  };
}

export function buildCity(world) {
  const rng = mulberry32(seedFrom(world.id));
  const group = new THREE.Group();
  const colliders = []; // {min:THREE.Vector3, max:THREE.Vector3} (XZ used)

  const neon = new THREE.Color(world.atmo);
  const accentHexes = [world.atmo, 0xff5db1, 0x66e0ff, 0xffe6a0];
  const heightAt = makeHeightAt(world);

  // low-poly procedural terrain (flat under the plaza, themed elsewhere)
  group.add(buildTerrain(world, heightAt));

  // neon grid over the flat plaza for that synth-pad look
  const grid = new THREE.GridHelper(56, 14, neon.getHex(), 0x142033);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  grid.position.y = 0.03;
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
      const bottom = heightAt(cx, cz) - 2; // sit on (sink slightly into) the terrain

      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      b.position.set(cx, bottom + h / 2, cz);
      group.add(b);
      colliders.push({
        min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
        max: new THREE.Vector3(cx + w / 2, bottom + h, cz + d / 2),
      });

      // emissive neon strip up one face
      const stripColor = accentHexes[(gx + gz + 8) % accentHexes.length];
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, h * 0.8, 0.4),
        new THREE.MeshBasicMaterial({ color: stripColor }),
      );
      strip.position.set(cx + w / 2 + 0.1, bottom + h * 0.45, cz);
      group.add(strip);

      // rooftop glow + a few real point lights for atmosphere
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: stripColor }),
      );
      beacon.position.set(cx, bottom + h + 0.8, cz);
      group.add(beacon);
      if (lightBudget > 0 && rng() < 0.5) {
        const pl = new THREE.PointLight(stripColor, 1.2, 60);
        pl.position.set(cx, bottom + h + 1, cz);
        group.add(pl);
        lightBudget--;
      }
    }
  }

  return {
    group,
    colliders,
    heightAt,
    spawn: new THREE.Vector3(0, 0, 16),  // just off the pad (flat plaza)
    padPosition: new THREE.Vector3(0, 0, 0),
  };
}

// Low-poly faceted terrain grid using the shared height sampler.
function buildTerrain(world, heightAt) {
  const SIZE = 400, SEG = 64, half = SIZE / 2, stepN = SIZE / SEG;
  const cols = SEG + 1;
  const positions = new Float32Array(cols * cols * 3);
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const x = -half + i * stepN;
      const z = -half + j * stepN;
      const k = (j * cols + i) * 3;
      positions[k] = x; positions[k + 1] = heightAt(x, z); positions[k + 2] = z;
    }
  }
  const indices = [];
  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const color = (TERRAIN[world.id] || {}).color ?? 0x0c1018;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0.08, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
