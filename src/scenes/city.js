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

// Per-world architecture style + how much flying traffic suits it (futuristic cities
// get skyways + dense traffic; ancient/frontier worlds get little or none).
const WORLD_STYLE = {
  'neon-haven': 'towers',  // neon megacity
  'dust-reach': 'huts',    // ancient desert frontier
  'cryo':       'domes',   // ice research domes
  'verdant':    'organic', // overgrown jungle treehouses
  'the-maw':    'rock',    // carved-rock pirate fortress
};
const STYLE_TRAFFIC = { towers: 16, domes: 8, organic: 3, rock: 3, huts: 0 };
const STYLE_SKYWAYS = { towers: true, domes: true };

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

  // structures on a grid, leaving streets and a clear plaza around the pad. The
  // builder is chosen per world so each planet's architecture reads differently.
  const style = WORLD_STYLE[world.id] || 'towers';
  const build = STYLE_BUILDERS[style] || buildTower;
  const light = { budget: 16 }; // shared cap on real point lights (perf)

  const step = 26;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const cx = gx * step + (rng() - 0.5) * 6;
      const cz = gz * step + (rng() - 0.5) * 6;
      if (Math.hypot(cx, cz) < 20) continue; // keep plaza clear around pad
      if (rng() < 0.1) continue;             // some empty lots
      const bottom = heightAt(cx, cz) - 1.5;
      const accent = accentHexes[(gx + gz + 8) % accentHexes.length];
      build(group, colliders, cx, cz, bottom, accent, rng, light);
    }
  }

  // elevated neon skyways suit futuristic cities only
  if (STYLE_SKYWAYS[style]) buildSkyways(group, rng, accentHexes);

  // scattered landscape props out past the streets (rocks + glowing flora/pylons)
  scatterProps(group, world, heightAt, rng);

  return {
    group,
    colliders,
    heightAt,
    spawn: new THREE.Vector3(0, 0, 16),  // just off the pad (flat plaza)
    padPosition: new THREE.Vector3(0, 0, 0),
    trafficCount: STYLE_TRAFFIC[style] ?? 16,
  };
}

// --- per-world structure builders ---
// Each adds its meshes to `group` and pushes one XZ collider footprint. `light` is a
// shared { budget } cap on real point lights. Dispatched by world style above.
const ANT_MAT = new THREE.MeshStandardMaterial({ color: 0x556070, roughness: 0.4, metalness: 0.6 });
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.9 });
const HUT_COLORS = [0xc49a6c, 0xb5894f, 0xcaa878, 0xa9764a];

function pushCollider(colliders, cx, cz, w, d, top) {
  colliders.push({
    min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
    max: new THREE.Vector3(cx + w / 2, top, cz + d / 2),
  });
}

// Neon megacity tower (the original look) — window-lit box + optional setback + antenna.
function buildTower(group, colliders, cx, cz, bottom, accent, rng, light) {
  const w = 6 + rng() * 9, d = 6 + rng() * 9, h = 10 + rng() * 40;
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), windowMaterial(accent, w, h));
  b.position.set(cx, bottom + h / 2, cz); b.castShadow = true; b.receiveShadow = true;
  group.add(b);
  pushCollider(colliders, cx, cz, w, d, bottom + h);

  let topY = bottom + h;
  if (rng() < 0.45) {
    const tw = w * 0.62, td = d * 0.62, th = 5 + rng() * 16;
    const t = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), windowMaterial(accent, tw, th));
    t.position.set(cx, topY + th / 2, cz); t.castShadow = true; group.add(t);
    topY += th;
  }
  if (rng() < 0.55) {
    const ah = 3 + rng() * 6;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, ah, 6), ANT_MAT);
    ant.position.set(cx, topY + ah / 2, cz); group.add(ant);
    topY += ah;
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: accent }));
  beacon.position.set(cx, topY + 0.6, cz); group.add(beacon);
  if (light.budget > 0 && rng() < 0.4) {
    const pl = new THREE.PointLight(accent, 1.1, 60);
    pl.position.set(cx, topY + 1.5, cz); group.add(pl); light.budget--;
  }
}

// Ancient desert frontier — low adobe hut + flat/pyramid roof, doorway, cloth awning.
function buildHut(group, colliders, cx, cz, bottom, accent, rng, light) {
  const w = 6 + rng() * 5, d = 6 + rng() * 5, h = 3.5 + rng() * 4;
  const mat = new THREE.MeshStandardMaterial({ color: HUT_COLORS[(rng() * HUT_COLORS.length) | 0], roughness: 1, metalness: 0, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.set(cx, bottom + h / 2, cz); body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  pushCollider(colliders, cx, cz, w, d, bottom + h);

  if (rng() < 0.5) { // pyramid roof
    const rh = 2.5 + rng() * 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, rh, 4), mat);
    roof.rotation.y = Math.PI / 4; roof.position.set(cx, bottom + h + rh / 2, cz); roof.castShadow = true;
    group.add(roof);
  } else { // flat parapet roof
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 0.5, d * 1.08), mat);
    slab.position.set(cx, bottom + h + 0.25, cz); group.add(slab);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.3), DOOR_MAT);
  door.position.set(cx, bottom + 1.1, cz + d / 2 + 0.05); group.add(door);
  if (rng() < 0.5) { // cloth awning over the door
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.15, 2), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8, emissive: accent, emissiveIntensity: 0.15 }));
    aw.position.set(cx, bottom + h * 0.82, cz + d / 2 + 1); aw.rotation.x = -0.25; group.add(aw);
  }
  if (light.budget > 0 && rng() < 0.3) {
    const pl = new THREE.PointLight(0xffb066, 0.9, 26);
    pl.position.set(cx, bottom + h * 0.7, cz + d / 2 + 0.6); group.add(pl); light.budget--;
  }
}

// Ice research colony — pale geodesic dome with a glowing base rim + entry vestibule.
function buildDome(group, colliders, cx, cz, bottom, accent, rng, light) {
  const r = 4 + rng() * 4.5;
  const mat = new THREE.MeshStandardMaterial({ color: 0xbcd6ee, roughness: 0.3, metalness: 0.1, emissive: 0x2a4a66, emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.set(cx, bottom + 0.2, cz); dome.castShadow = true; group.add(dome);
  pushCollider(colliders, cx, cz, r * 2, r * 2, bottom + r);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 8, 28), new THREE.MeshBasicMaterial({ color: accent }));
  rim.rotation.x = Math.PI / 2; rim.position.set(cx, bottom + 0.35, cz); group.add(rim);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 1.8), mat);
  vest.position.set(cx, bottom + 1.2, cz + r * 0.85); group.add(vest);
  if (light.budget > 0 && rng() < 0.5) {
    const pl = new THREE.PointLight(accent, 1.0, 40);
    pl.position.set(cx, bottom + r * 0.6, cz); group.add(pl); light.budget--;
  }
}

// Overgrown jungle — trunk cluster holding a raised treehouse platform + canopy.
function buildOrganic(group, colliders, cx, cz, bottom, accent, rng, light) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true });
  const leaf = 0x3f8f5a;
  const th = 8 + rng() * 8;
  const trunks = rng() < 0.5 ? 3 : 2;
  for (let k = 0; k < trunks; k++) {
    const a = (k / trunks) * Math.PI * 2;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.95, th, 6), trunkMat);
    tr.position.set(cx + Math.cos(a) * 2, bottom + th / 2, cz + Math.sin(a) * 2); tr.castShadow = true;
    group.add(tr);
  }
  const pw = 6 + rng() * 3, pd = 6 + rng() * 3, ph = 3 + rng() * 2;
  const house = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.9, emissive: leaf, emissiveIntensity: 0.12 }));
  house.position.set(cx, bottom + th + ph / 2, cz); house.castShadow = true; house.receiveShadow = true; group.add(house);
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + rng() * 2, 0), new THREE.MeshStandardMaterial({ color: leaf, roughness: 0.9, emissive: leaf, emissiveIntensity: 0.15, flatShading: true }));
  canopy.position.set(cx, bottom + th + ph + 2, cz); group.add(canopy);
  pushCollider(colliders, cx, cz, 5, 5, bottom + th);

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: accent }));
  orb.position.set(cx, bottom + th + ph * 0.6, cz + pd / 2); group.add(orb);
  if (light.budget > 0 && rng() < 0.4) {
    const pl = new THREE.PointLight(accent, 1.0, 40);
    pl.position.set(cx, bottom + th, cz); group.add(pl); light.budget--;
  }
}

// Asteroid pirate fortress — carved rock chunk + stacked metal containers/scaffolding.
function buildRock(group, colliders, cx, cz, bottom, accent, rng, light) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a2f36, roughness: 1, metalness: 0.05, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4650, roughness: 0.6, metalness: 0.7 });
  const r = 4 + rng() * 4;
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
  rock.position.set(cx, bottom + r * 0.6, cz); rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  rock.castShadow = true; rock.receiveShadow = true; group.add(rock);
  pushCollider(colliders, cx, cz, r * 1.6, r * 1.6, bottom + r);

  const stacks = rng() < 0.6 ? 2 : 1;
  for (let k = 0; k < stacks; k++) {
    const cw = 4 + rng() * 2, ch = 2.5, cd = 2.5 + rng();
    const cont = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), metalMat);
    cont.position.set(cx + (rng() - 0.5) * 3, bottom + r * 0.9 + k * ch + ch / 2, cz + (rng() - 0.5) * 3);
    cont.castShadow = true; group.add(cont);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(cw * 1.01, 0.4, cd * 1.01), new THREE.MeshBasicMaterial({ color: accent }));
    stripe.position.copy(cont.position); group.add(stripe);
  }
  if (light.budget > 0 && rng() < 0.4) {
    const pl = new THREE.PointLight(accent, 1.0, 40);
    pl.position.set(cx, bottom + r, cz); group.add(pl); light.budget--;
  }
}

const STYLE_BUILDERS = { towers: buildTower, huts: buildHut, domes: buildDome, organic: buildOrganic, rock: buildRock };

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
