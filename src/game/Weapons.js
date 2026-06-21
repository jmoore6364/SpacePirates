// On-foot personal weapons + armor (renderer-agnostic data) for the Armory. See #16.
// A weapon defines damage, fire cadence, bolt spread/pellets, projectile speed and a
// bolt colour; GroundCombat reads the equipped sidearm each shot. Armor sets the
// on-foot max HP and health regen. 'blaster' / 'flightsuit' are the free starters.
export const WEAPONS = [
  {
    id: 'blaster', name: 'EX-9 Blaster', price: 0,
    desc: 'Standard-issue sidearm. Reliable and balanced.',
    dmg: 18, cd: 0.22, spread: 0, pellets: 1, speed: 240, color: 0x9effa0,
  },
  {
    id: 'repeater', name: 'Repeater SMG', price: 1200,
    desc: 'Rapid fire with light bolts — spray hosers.',
    dmg: 10, cd: 0.09, spread: 0.035, pellets: 1, speed: 270, color: 0x9fe0ff,
  },
  {
    id: 'scatter', name: 'Scatter Gun', price: 2400,
    desc: 'Fires a cone of pellets — brutal up close.',
    dmg: 8, cd: 0.55, spread: 0.14, pellets: 6, speed: 200, color: 0xffd27a,
  },
  {
    id: 'rail', name: 'Rail Lance', price: 4200,
    desc: 'Slow, dead-accurate, hits like a truck.',
    dmg: 70, cd: 0.7, spread: 0, pellets: 1, speed: 460, color: 0xff66e0,
  },
];

export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];

export const ARMORS = [
  { id: 'flightsuit', name: 'Flight Suit', price: 0,    desc: 'Basic kit. 100 HP.',                 hp: 100, regen: 6 },
  { id: 'plated',     name: 'Plated Vest', price: 1600, desc: 'Reinforced plating. 160 HP.',        hp: 160, regen: 6 },
  { id: 'exo',        name: 'Exo Carapace', price: 3800, desc: 'Powered shell. 240 HP, fast regen.', hp: 240, regen: 11 },
];

export const armorById = (id) => ARMORS.find((a) => a.id === id) || ARMORS[0];
