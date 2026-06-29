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

  // buildings on a grid: window-lit towers with shape variety, leaving streets and a
  // clear plaza around the pad
  let lightBudget = 16; // cap real lights for perf; rest are emissive only
  const antMat = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.4, metalness: 0.6 });

  const step = 26;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const cx = gx * step + (rng() - 0.5) * 6;
      const cz = gz * step + (rng() - 0.5) * 6;
      if (Math.hypot(cx, cz) < 20) continue; // keep plaza clear around pad
      if (rng() < 0.1) continue;             // some empty lots

      const w = 6 + rng() * 9;
      const d = 6 + rng() * 9;
      const h = 10 + rng() * 40;
      const bottom = heightAt(cx, cz) - 2; // sit on (sink slightly into) the terrain
      const accent = accentHexes[(gx + gz + 8) % accentHexes.length];

      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), windowMaterial(accent, w, h));
      b.position.set(cx, bottom + h / 2, cz);
      b.castShadow = true; b.receiveShadow = true;
      group.add(b);
      colliders.push({
        min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
        max: new THREE.Vector3(cx + w / 2, bottom + h, cz + d / 2),
      });

      // optional setback tower stacked on top for a varied skyline
      let topY = bottom + h;
      if (rng() < 0.45) {
        const tw = w * 0.62, td = d * 0.62, th = 5 + rng() * 16;
        const t = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), windowMaterial(accent, tw, th));
        t.position.set(cx, topY + th / 2, cz);
        t.castShadow = true; group.add(t);
        topY += th;
      }

      // antenna mast on some, then a rooftop beacon + the occasional real light
      if (rng() < 0.55) {
        const ah = 3 + rng() * 6;
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, ah, 6), antMat);
        ant.position.set(cx, topY + ah / 2, cz); group.add(ant);
        topY += ah;
      }
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: accent }));
      beacon.position.set(cx, topY + 0.6, cz);
      group.add(beacon);
      if (lightBudget > 0 && rng() < 0.4) {
        const pl = new THREE.PointLight(accent, 1.1, 60);
        pl.position.set(cx, topY + 1.5, cz);
        group.add(pl); lightBudget--;
      }
    }
  }

  // elevated neon skyways crisscrossing above the streets
  buildSkyways(group, rng, accentHexes);

  // scattered landscape props out past the streets (rocks + glowing flora/pylons)
  scatterProps(group, world, heightAt, rng);

  return {
    group,
    colliders,
    heightAt,
    spawn: new THREE.Vector3(0, 0, 16),  // just off the pad (flat plaza)
    padPosition: new THREE.Vector3(0, 0, 0),
  };
}

// Elevated neon roadways spanning the city at various heights, with glowing edge
// rails and a couple of support pylons each — the futuristic skyway look.
function buildSkyways(group, rng, accentHexes) {
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x10151f, roughness: 0.7, metalness: 0.45 });
  const span = 260;
  for (let i = 0; i < 7; i++) {
    const horiz = rng() < 0.5;
    const y = 18 + rng() * 32;
    const wdt = 3 + rng() * 2.5;
    const off = (rng() - 0.5) * 150;
    const accent = accentHexes[i % accentHexes.length];

    const deck = new THREE.Mesh(new THREE.BoxGeometry(horiz ? span : wdt, 0.6, horiz ? wdt : span), deckMat);
    deck.position.set(horiz ? 0 : off, y, horiz ? off : 0);
    deck.castShadow = true; deck.receiveShadow = true;
    group.add(deck);

    for (const s of [-1, 1]) { // glowing edge rails
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(horiz ? span : 0.25, 0.25, horiz ? 0.25 : span),
        new THREE.MeshBasicMaterial({ color: accent }),
      );
      rail.position.set(horiz ? 0 : off + s * wdt / 2, y + 0.45, horiz ? off + s * wdt / 2 : 0);
      group.add(rail);
    }

    for (let k = -1; k <= 1; k += 2) { // support pylons down to the ground
      const px = horiz ? k * 78 : off;
      const pz = horiz ? off : k * 78;
      const pyl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, y, 6), deckMat);
      pyl.position.set(px, y / 2, pz);
      group.add(pyl);
    }
  }
}

// --- window-lit building skins ---
// A small canvas of dark wall + randomly-lit windows in an accent colour, cached per
// accent and cloned per building so window density can scale with the building size.
const _winTexCache = {};
function windowTexture(hex) {
  if (_winTexCache[hex]) return _winTexCache[hex];
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a2233'; ctx.fillRect(0, 0, 32, 64); // wall
  const col = '#' + (hex >>> 0).toString(16).padStart(6, '0');
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 4; x++) {
      if (Math.random() < 0.5) {
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.fillStyle = col;
        ctx.fillRect(x * 8 + 2, y * 4 + 1, 4, 2);
      }
    }
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _winTexCache[hex] = t;
  return t;
}

function windowMaterial(accentHex, w, h) {
  const tex = windowTexture(accentHex).clone();
  tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(2, Math.round(h / 5)));
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    roughness: 0.8, metalness: 0.25,
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.0,
  });
}

// Scatter low-poly rocks + glowing flora/pylons across the terrain past the streets,
// so worlds read as landscapes rather than a bare grid.
function scatterProps(group, world, heightAt, rng) {
  const rockHex = (TERRAIN[world.id] || {}).color ?? 0x223040;
  const rockMat = new THREE.MeshStandardMaterial({ color: rockHex, roughness: 1, metalness: 0, flatShading: true });
  const floraMat = new THREE.MeshStandardMaterial({ color: world.atmo, emissive: world.atmo, emissiveIntensity: 0.7, roughness: 0.5 });
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const r = 36 + rng() * 150;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > 185 || Math.abs(z) > 185) continue;
    const y = heightAt(x, z);
    if (rng() < 0.7) {
      const s = 1 + rng() * 3.5;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      rock.position.set(x, y + s * 0.25, z);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = true; rock.receiveShadow = true;
      group.add(rock);
    } else {
      const fh = 2.5 + rng() * 4.5;
      const stalk = new THREE.Mesh(new THREE.ConeGeometry(0.5, fh, 6), floraMat);
      stalk.position.set(x, y + fh / 2, z);
      group.add(stalk);
    }
  }
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
