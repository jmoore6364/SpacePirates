// Themed building interiors. buildInterior(kind, world) returns a furnished room plus
// metadata (spawn, exit door, vendor station, NPC spots, wall colliders). Each vendor
// kind gets a distinct fit-out; everything else falls back to a generic lobby.
import { THREE } from '../renderer/Renderer.js';
import { buildGun } from '../entities/Gun.js';
import { shipModel } from '../entities/Models.js';

const W = 36, D = 26, WALL_H = 9; // room footprint / height

// kind → { title, accent, station label }
const THEMES = {
  shop:      { title: 'Trading Post', accent: 0xffe6a0, label: 'Trader' },
  market:    { title: 'Grand Bazaar', accent: 0xff5db1, label: 'Market' },
  shipyard:  { title: 'Hangar Bay',   accent: 0x8effd0, label: 'Shipyard', tall: true },
  armory:    { title: 'Armory',       accent: 0xff9b6e, label: 'Armory' },
  informant: { title: 'Neon Cantina', accent: 0xc0a0ff, label: 'Informant', dim: true },
  missions:  { title: 'Mission Hall',  accent: 0x66e0ff, label: 'Mission Board' },
  lobby:     { title: 'Atrium',        accent: 0x9fe7ff, label: null },
};

export function buildInterior(kind, world) {
  const theme = THEMES[kind] || THEMES.lobby;
  const accent = theme.accent;
  const wallH = theme.tall ? WALL_H + 5 : WALL_H;
  const group = new THREE.Group();
  const colliders = [];

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x12161f, roughness: 0.55, metalness: 0.5 });
  const wallMat = new THREE.MeshStandardMaterial({ color: theme.dim ? 0x16121f : 0x1b2330, roughness: 0.8, metalness: 0.2 });
  const trimMat = new THREE.MeshBasicMaterial({ color: accent });

  // floor + ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), floorMat);
  floor.position.y = -0.25; floor.receiveShadow = true; group.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), wallMat);
  ceil.position.y = wallH; group.add(ceil);

  // 4 walls (front wall has a doorway gap drawn as two segments)
  addWall(group, colliders, 0, -D / 2, W, wallH, true, wallMat);           // back
  addWall(group, colliders, 0, D / 2, W, wallH, true, wallMat, true);      // front (with door gap)
  addWall(group, colliders, -W / 2, 0, D, wallH, false, wallMat);          // left
  addWall(group, colliders, W / 2, 0, D, wallH, false, wallMat);           // right

  // glowing floor + ceiling trim lines in the accent colour
  for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(W, 0.15, 0.15), trimMat);
    t.position.set(0, 0.1, z); group.add(t);
  }
  // ceiling light panels + a couple of real lights
  const lightI = theme.dim ? 0.5 : 1.0;
  for (const x of [-W / 4, W / 4]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), new THREE.MeshBasicMaterial({ color: theme.dim ? 0x33304a : 0xdfe8ff }));
    panel.position.set(x, wallH - 0.4, 0); group.add(panel);
    const pl = new THREE.PointLight(theme.dim ? accent : 0xeaf2ff, lightI * 1.4, 60);
    pl.position.set(x, wallH - 1.5, 0); group.add(pl);
  }
  group.add(new THREE.HemisphereLight(0xbfd0ff, 0x202028, theme.dim ? 0.4 : 0.8));
  group.add(new THREE.AmbientLight(0xffffff, theme.dim ? 0.25 : 0.5));

  // glowing exit doorway on the front wall
  const doorZ = D / 2 - 0.2;
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 20, Math.PI), trimMat);
  arch.position.set(0, 0, doorZ); group.add(arch);
  const exitPos = new THREE.Vector3(0, 0, doorZ - 1.5);

  // vendor counter + keeper near the back, with the interact station in front of it
  let stationPos = null;
  if (theme.label) {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 2), new THREE.MeshStandardMaterial({ color: 0x2a3346, roughness: 0.6, metalness: 0.4, emissive: accent, emissiveIntensity: 0.12 }));
    counter.position.set(0, 0.8, -D / 2 + 4); counter.castShadow = true; group.add(counter);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 0.2), trimMat);
    sign.position.set(0, 4.4, -D / 2 + 0.4); group.add(sign);
    stationPos = new THREE.Vector3(0, 0, -D / 2 + 6.5);
  }

  // signature fit-out per theme
  furnish(kind, group, accent);

  // milling-NPC spots (avoid the counter + door lanes)
  const npcSpots = [
    new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 2),
    new THREE.Vector3(-6, 0, -6), new THREE.Vector3(8, 0, -7), new THREE.Vector3(0, 0, 5),
  ];

  return {
    group, colliders,
    spawn: new THREE.Vector3(0, 0, D / 2 - 4), // just inside the door
    title: theme.title,
    exit: { pos: exitPos, label: `Exit to ${world.name}` },
    station: stationPos ? { pos: stationPos, id: kind, label: theme.label } : null,
    npcSpots,
    bounds: { x: W / 2 - 2, z: D / 2 - 2 },
  };
}

function addWall(group, colliders, cx, cz, len, h, alongX, mat, doorGap = false) {
  const thick = 0.6;
  const segs = doorGap ? [[-(len / 2), -3], [3, len / 2]] : [[-(len / 2), len / 2]];
  for (const [a, b] of segs) {
    const segLen = b - a, mid = (a + b) / 2;
    const w = alongX ? segLen : thick, d = alongX ? thick : segLen;
    const off = alongX ? mid : 0, offz = alongX ? 0 : mid;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    wall.position.set(cx + off, h / 2, cz + offz); wall.receiveShadow = true; group.add(wall);
    colliders.push({
      min: new THREE.Vector3(cx + off - w / 2, 0, cz + offz - d / 2),
      max: new THREE.Vector3(cx + off + w / 2, h, cz + offz + d / 2),
    });
  }
}

// Per-theme signature props (kept low-poly + cheap).
function furnish(kind, group, accent) {
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a3326, roughness: 0.9 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x44485a, roughness: 0.5, metalness: 0.6 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };

  if (kind === 'shop' || kind === 'market') {
    // shelves / stalls along the side walls + scattered crates
    for (let i = -1; i <= 1; i++) {
      box(2, 4, 6, metalMat, -W / 2 + 2.5, 2, i * 8);
      box(2, 4, 6, metalMat, W / 2 - 2.5, 2, i * 8);
    }
    for (let i = 0; i < 6; i++) box(1.6, 1.6, 1.6, crateMat, -8 + i * 3.5, 0.8, 4 + (i % 2) * 2);
    if (kind === 'market') { // colourful awnings over the stalls
      for (let i = -1; i <= 1; i++) {
        const aw = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 6), new THREE.MeshStandardMaterial({ color: [0xff5db1, 0x66e0ff, 0xffe6a0][i + 1], emissive: accent, emissiveIntensity: 0.2 }));
        aw.position.set(-W / 2 + 3.5, 4.4, i * 8); aw.rotation.z = 0.2; group.add(aw);
      }
    }
  } else if (kind === 'shipyard') {
    const ship = shipModel('interceptor');
    if (ship) { ship.scale.multiplyScalar(1.3); ship.position.set(0, 3, 2); ship.rotation.y = 0.6; group.add(ship); }
    else box(8, 3, 4, metalMat, 0, 1.5, 2);
    for (let i = -1; i <= 1; i++) box(1.4, 3, 1.4, metalMat, i * 6, 1.5, -8); // tool columns
  } else if (kind === 'armory') {
    // wall gun racks
    for (let i = -1; i <= 1; i++) {
      const g = buildGun(['blaster', 'repeater', 'scatter', 'rail'][(i + 1) % 4]);
      g.scale.setScalar(6); g.position.set(-W / 2 + 1.2, 4 + i * 1.8, i * 4); g.rotation.y = Math.PI / 2; group.add(g);
      box(0.3, 1.4, 5, metalMat, -W / 2 + 1, 4 + i * 1.8, i * 4 + 1);
    }
    for (let i = 0; i < 4; i++) box(2, 3, 1.5, metalMat, -10 + i * 6, 1.5, D / 2 - 5); // lockers
  } else if (kind === 'informant') {
    // cantina: bar already from counter; add stools + neon wall signs
    for (let i = -2; i <= 2; i++) {
      const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 8), metalMat);
      stool.position.set(i * 2.2, 0.7, -D / 2 + 7); group.add(stool);
    }
    for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) {
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 5), new THREE.MeshBasicMaterial({ color: accent }));
      neon.position.set(x, 4, -2); group.add(neon);
    }
  } else if (kind === 'missions') {
    // big board + terminals
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 10), new THREE.MeshStandardMaterial({ color: 0x101820, emissive: accent, emissiveIntensity: 0.4 }));
    board.position.set(-W / 2 + 1, 4, 0); group.add(board);
    for (let i = -1; i <= 1; i++) box(2, 1.4, 1.4, metalMat, i * 5, 0.9, 6);
  } else { // lobby
    for (let i = 0; i < 4; i++) box(3, 0.8, 3, metalMat, [-8, 8, -8, 8][i], 0.4, [-6, -6, 6, 6][i]); // seating
    const plant = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 7), new THREE.MeshStandardMaterial({ color: 0x3f8f5a, emissive: 0x224422, emissiveIntensity: 0.3 }));
    plant.position.set(0, 2, 0); group.add(plant);
  }
}
