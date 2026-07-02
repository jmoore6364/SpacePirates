// Interior of a landable space station: a domed observation concourse you walk around
// like a planet surface, but enclosed with a star dome overhead and viewports to space.
// Returns the same shape as buildCity so SurfaceScene can host it (flat floor).
import { THREE } from '../renderer/Renderer.js';

const R = 48; // concourse radius

export function buildStation(world) {
  const group = new THREE.Group();
  const colliders = [];
  const neon = world.atmo || 0x88ccff;

  // floor + neon pad ring (the docking circle) + faint grid
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 1, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.5, metalness: 0.6, emissive: 0x0a1120, emissiveIntensity: 1 }),
  );
  floor.position.y = -0.5; floor.receiveShadow = true; group.add(floor);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(11, 0.35, 8, 32), new THREE.MeshBasicMaterial({ color: neon }));
  padRing.rotation.x = Math.PI / 2; padRing.position.y = 0.12; group.add(padRing);
  const grid = new THREE.GridHelper(R * 2, 24, neon, 0x162033);
  grid.material.opacity = 0.22; grid.material.transparent = true; grid.position.y = 0.06; group.add(grid);

  // perimeter wall (open cylinder) with a glowing window band + viewport panels
  const wallH = 16;
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, wallH, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
  );
  wall.position.y = wallH / 2; wall.receiveShadow = true; group.add(wall);
  // a bright band of viewports showing space (deep-blue "glass" that reads as lit)
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.3, R - 0.3, 3.4, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2a5a8c, side: THREE.DoubleSide }),
  );
  band.position.y = 8; group.add(band);
  // glowing frame trims + vertical mullions between viewports
  for (const y of [6.2, 9.8]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.15, 0.14, 6, 48), new THREE.MeshBasicMaterial({ color: neon }));
    t.rotation.x = Math.PI / 2; t.position.y = y; group.add(t);
  }
  const mullMat = new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.6), mullMat);
    m.position.set(Math.cos(a) * (R - 0.1), 8, Math.sin(a) * (R - 0.1));
    m.lookAt(0, 8, 0); group.add(m);
  }

  // star dome overhead (dark shell + a starfield inside → space through the "roof")
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.25, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x05070e, side: THREE.BackSide }),
  );
  group.add(dome);
  group.add(makeStars(2600, R * 1.2));

  // ceiling light ring + real lights (bright — the concourse should read clearly)
  const ringLight = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, 0.55, 8, 40), new THREE.MeshBasicMaterial({ color: 0xeef4ff }));
  ringLight.rotation.x = Math.PI / 2; ringLight.position.y = wallH - 1; group.add(ringLight);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pl = new THREE.PointLight(0xeaf2ff, 1.7, 110);
    pl.position.set(Math.cos(a) * R * 0.5, wallH - 2, Math.sin(a) * R * 0.5); group.add(pl);
  }
  group.add(new THREE.PointLight(0xbfe0ff, 1.4, 130)); // central fill (at origin, high)
  group.children[group.children.length - 1].position.y = wallH - 3;

  // central holo-pillar (info column) with glowing rings
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 10, 12), new THREE.MeshStandardMaterial({ color: 0x222a3a, metalness: 0.6, roughness: 0.4, emissive: neon, emissiveIntensity: 0.15 }));
  pillar.position.set(0, 5, -22); group.add(pillar);
  for (const y of [3, 6, 9]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 6, 20), new THREE.MeshBasicMaterial({ color: neon }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, y, -22); group.add(ring);
  }

  // --- cantina bar (station flavor) ---
  buildCantina(group, -18, -6);

  // floating holo-billboards with text (read as station advertisements)
  const holos = [['ARES STATION', 0x66e0ff], ['◈ TRADE HUB', 0xffe6a0], ['FLY SAFE', 0x8effa0]];
  for (let i = 0; i < holos.length; i++) {
    const a = i * Math.PI * 2 / 3 + 0.6;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 4),
      new THREE.MeshBasicMaterial({ map: holoText(holos[i][0], holos[i][1]), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    panel.position.set(Math.cos(a) * 30, 8.5, Math.sin(a) * 30); panel.lookAt(0, 8.5, 0); group.add(panel);
  }

  // scattered crates + planters for life
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a3326, roughness: 0.9 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, rr = 20 + (i % 3) * 8;
    const s = 1.4 + (i % 2);
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    c.position.set(Math.cos(a) * rr, s / 2, Math.sin(a) * rr); c.castShadow = true; group.add(c);
  }

  // perimeter wall collision: a ring of short box segments so you can't walk into space
  const segs = 28;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const w = (2 * Math.PI * R) / segs + 1.5;
    pushSeg(colliders, x, z, w, a);
  }

  return {
    group, colliders,
    heightAt: () => 0,               // flat deck
    spawn: new THREE.Vector3(0, 0, 16),
    padPosition: new THREE.Vector3(0, 0, 0),
    trafficCount: 0,                 // no flying traffic inside
    isStation: true,
  };
}

// A thin wall segment collider (AABB) tangent to the ring at angle a.
function pushSeg(colliders, x, z, len, a) {
  const nx = Math.cos(a), nz = Math.sin(a);            // outward normal
  const half = len / 2, t = 1.2;                        // tangential half-length, thickness
  const tx = -nz, tz = nx;                              // tangent
  const minX = Math.min(x - tx * half - nx * t, x + tx * half + nx * t);
  const maxX = Math.max(x - tx * half - nx * t, x + tx * half + nx * t);
  const minZ = Math.min(z - tz * half - nz * t, z + tz * half + nz * t);
  const maxZ = Math.max(z - tz * half - nz * t, z + tz * half + nz * t);
  colliders.push({ min: new THREE.Vector3(minX, 0, minZ), max: new THREE.Vector3(maxX, 30, maxZ) });
}

// A neon cantina built in a local group (counter along +X, front = +Z, wall at −Z),
// then rotated to face the concourse centre — so bottles/stools/sign all stay aligned.
function buildCantina(parent, bx, bz) {
  const g = new THREE.Group();
  g.position.set(bx, 0, bz);
  g.rotation.y = Math.atan2(-bx, -bz); // local +Z faces the middle

  const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x2a2030, metalness: 0.4, roughness: 0.5, emissive: 0x3a1030, emissiveIntensity: 0.3 }));
  bar.position.set(0, 0.8, 0); bar.castShadow = true; g.add(bar);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(12, 0.14, 0.35), new THREE.MeshBasicMaterial({ color: 0xff5db1 }));
  edge.position.set(0, 1.66, 1.0); g.add(edge); // lit front lip

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(12, 3.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a1420, metalness: 0.3, roughness: 0.6 }));
  shelf.position.set(0, 2.0, -1.4); g.add(shelf);
  const cols = [0x66e0ff, 0xff5db1, 0xffe6a0, 0x8effa0, 0xc0a0ff];
  for (let i = 0; i < 9; i++) { // bottles lined up on the shelf, along the counter
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6), new THREE.MeshStandardMaterial({ color: cols[i % 5], emissive: cols[i % 5], emissiveIntensity: 0.6 }));
    b.position.set((i - 4) * 1.25, 2.15, -1.2); g.add(b);
  }
  const stoolMat = new THREE.MeshStandardMaterial({ color: 0x44485a, metalness: 0.6, roughness: 0.4 });
  for (let i = 0; i < 5; i++) { // stools in front of the counter
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 8), stoolMat);
    s.position.set((i - 2) * 2.3, 0.65, 2.1); g.add(s);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), new THREE.MeshBasicMaterial({ map: holoText('◈ CANTINA', 0xff5db1), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  sign.position.set(0, 5.4, -1.2); g.add(sign);
  const glow = new THREE.PointLight(0xff5db1, 1.6, 36); glow.position.set(0, 4, 0); g.add(glow);

  parent.add(g);
}

// A holographic sign texture: glowing text + frame on a faint panel (additive-blended).
function holoText(text, hex) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  const col = '#' + (hex >>> 0).toString(16).padStart(6, '0');
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(18,34,60,0.30)'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 62px Consolas, ui-monospace, monospace';
  const words = text.split(' ');
  if (text.length > 11 && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    ctx.fillText(words.slice(0, mid).join(' '), 256, 98);
    ctx.fillText(words.slice(mid).join(' '), 256, 162);
  } else {
    ctx.fillText(text, 256, 128);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

function makeStars(n, radius) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // upper hemisphere shell so stars fill the dome above the deck
    const u = Math.random(), v = Math.random() * 0.9 + 0.05;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    const r = radius * (0.82 + Math.random() * 0.18);
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.cos(ph) * r + 2;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfeaff, size: 1.3, sizeAttenuation: true }));
}
