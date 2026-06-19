// Canonical world list (renderer-agnostic data). Scenes build planet meshes from
// this and the star map lists from it. Positions are in space-units; r is radius.
export const WORLDS = [
  {
    id: 'neon-haven', name: 'Neon Haven', theme: 'Cyberpunk pirate port',
    position: [600, -40, -500], r: 160, color: 0x2e6f8e, atmo: 0x55b8ff,
    blurb: 'Rain-slick black-market hub. Missions, fences, trouble.',
  },
  {
    id: 'dust-reach', name: 'Dust Reach', theme: 'Desert frontier outpost',
    position: [-700, 120, -1400], r: 220, color: 0xb5723a, atmo: 0xffb066,
    blurb: 'Smugglers and bounties under a dust-red sky.',
  },
  {
    id: 'cryo', name: 'Cryo Station', theme: 'Ice research colony',
    position: [300, 260, -2200], r: 130, color: 0x9fb6d8, atmo: 0xcfe6ff,
    blurb: 'Frozen labs ripe for a quiet heist.',
  },
  {
    id: 'verdant', name: 'Verdant', theme: 'Jungle colony (high security)',
    position: [-1200, -200, -800], r: 110, color: 0x3f8f5a, atmo: 0x8effa0,
    blurb: 'Lush, lawful, and watching. Risk runs high here.',
  },
  {
    id: 'the-maw', name: 'The Maw', theme: 'Asteroid pirate stronghold',
    position: [1400, 400, -2600], r: 180, color: 0x6b5560, atmo: 0xff6680,
    blurb: 'A lawless rock fortress. The deep end.',
  },
];

export const worldById = (id) => WORLDS.find((w) => w.id === id);
