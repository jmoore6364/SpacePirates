// Low-poly held weapon meshes, parented to a character's hand bone. Built in the
// rig's local (model) units; the barrel points along +Z and the grip sits near the
// origin so it lines up when attached to the palm. Shape/length vary by weapon and
// the muzzle glows in the weapon's bolt colour.
import { THREE } from '../renderer/Renderer.js';
import { weaponById } from '../game/Weapons.js';

const LEN = { blaster: 0.34, repeater: 0.46, scatter: 0.40, rail: 0.66 };

export function buildGun(weaponId = 'blaster') {
  const w = weaponById(weaponId);
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.5, metalness: 0.75 });
  const glow = new THREE.MeshStandardMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 1, roughness: 0.4 });
  const len = LEN[weaponId] || 0.34;
  const t = weaponId === 'rail' ? 0.05 : weaponId === 'scatter' ? 0.1 : 0.07;

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(t, t * 1.4, len), body);
  barrel.position.z = len * 0.5;
  g.add(barrel);

  const tip = new THREE.Mesh(new THREE.BoxGeometry(t * 1.2, t * 1.2, 0.05), glow);
  tip.position.z = len + 0.02;
  g.add(tip);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), body);
  grip.position.set(0, -0.1, 0.02);
  g.add(grip);

  g.userData.muzzle = tip;
  return g;
}
