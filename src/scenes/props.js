// Reusable world-building factories (stars, planets, sun). Presentation only.
import { THREE } from '../renderer/Renderer.js';
import { stationModel } from '../entities/Models.js';

// A deep-space station destination: the Blender model scaled to the world radius (or a
// simple procedural hub+ring fallback), plus a faint marker glow. Spins slowly.
export function makeStation(world) {
  const group = new THREE.Group();
  group.position.fromArray(world.position);
  const r = world.r || 90;

  const model = stationModel();
  if (model) {
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const maxd = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar((r * 1.7) / maxd);
    group.add(model);
  } else {
    const hull = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.4, metalness: 0.75 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.12, r * 1.3, 12), hull);
    group.add(hub);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.08, 8, 28), hull);
    ring.rotation.x = Math.PI / 2; group.add(ring);
  }

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.05, 24, 24),
    new THREE.MeshBasicMaterial({ color: world.atmo, transparent: true, opacity: 0.08, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(glow);
  group.userData.spin = 0.06;
  group.userData.radius = r;
  return group;
}

export function makeStarfield(count = 3000, radius = 8000) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const d = radius * (0.7 + Math.random() * 0.3);
    positions[i * 3] = Math.cos(t) * r * d;
    positions[i * 3 + 1] = u * d;
    positions[i * 3 + 2] = Math.sin(t) * r * d;
    c.setHSL(0.55 + Math.random() * 0.12, 0.5, 0.65 + Math.random() * 0.35);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.PointsMaterial({
    size: 6, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

// A themed planet Group placed at `position`, radius `r`.
export function makePlanet({ position = [0, 0, 0], r = 120, color = 0x2e6f8e, atmo = 0x55b8ff }) {
  const group = new THREE.Group();
  group.position.fromArray(position);

  const geo = new THREE.IcosahedronGeometry(r, 18);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 0.06) * Math.cos(v.y * 0.05) + Math.sin(v.z * 0.07 + 1.3) * 0.5;
    v.multiplyScalar(1 + n * 0.03);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const surface = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.05, emissive: 0x05080c, emissiveIntensity: 1,
  }));
  group.add(surface);

  const atmoMesh = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.08, 32, 32),
    new THREE.MeshBasicMaterial({
      color: atmo, transparent: true, opacity: 0.22,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  group.add(atmoMesh);
  group.userData.spin = 0.02 + Math.random() * 0.04;
  group.userData.radius = r;
  return group;
}

export function makeSun(position = [-1500, 600, -1200]) {
  const group = new THREE.Group();
  group.position.fromArray(position);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3d0 }),
  );
  group.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xffe6a0, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(1400, 1400, 1);
  group.add(glow);
  return group;
}
