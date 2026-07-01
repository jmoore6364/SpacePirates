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
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.3, R - 0.3, 3.2, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x0b2236, side: THREE.DoubleSide }),
  );
  band.position.y = 8; group.add(band);
  // glowing trims top + bottom of the window band
  for (const y of [6.4, 9.6]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R - 0.2, 0.1, 6, 48), new THREE.MeshBasicMaterial({ color: neon }));
    t.rotation.x = Math.PI / 2; t.position.y = y; group.add(t);
  }

  // star dome overhead (dark shell + a starfield inside → space through the "roof")
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.25, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x05070e, side: THREE.BackSide }),
  );
  group.add(dome);
  group.add(makeStars(1400, R * 1.2));

  // ceiling light ring + a few real lights
  const ringLight = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, 0.5, 8, 40), new THREE.MeshBasicMaterial({ color: 0xdfeaff }));
  ringLight.rotation.x = Math.PI / 2; ringLight.position.y = wallH - 1; group.add(ringLight);
  for (const a of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const pl = new THREE.PointLight(0xeaf2ff, 1.2, 90);
    pl.position.set(Math.cos(a) * R * 0.5, wallH - 2, Math.sin(a) * R * 0.5); group.add(pl);
  }

  // central holo-pillar (info column) with glowing rings
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 10, 12), new THREE.MeshStandardMaterial({ color: 0x222a3a, metalness: 0.6, roughness: 0.4, emissive: neon, emissiveIntensity: 0.15 }));
  pillar.position.set(0, 5, -22); group.add(pillar);
  for (const y of [3, 6, 9]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 6, 20), new THREE.MeshBasicMaterial({ color: neon }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, y, -22); group.add(ring);
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

function makeStars(n, radius) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    // upper hemisphere-ish shell so stars sit above the deck (through the dome)
    const u = Math.random(), v = Math.random() * 0.6 + 0.05;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    const r = radius * (0.85 + Math.random() * 0.15);
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    pos[i * 3 + 1] = Math.cos(ph) * r + 2;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.8, sizeAttenuation: true }));
}
