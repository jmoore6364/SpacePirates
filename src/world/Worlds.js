// Canonical world list (renderer-agnostic data). Scenes build planet meshes from
// this and the star map lists from it. Positions are in space-units; r is radius.
export const WORLDS = [
  {
    id: 'neon-haven', name: 'Neon Haven', theme: 'Cyberpunk pirate port',
    position: [600, -40, -500], r: 160, color: 0x2e6f8e, atmo: 0x55b8ff,
    blurb: 'Rain-slick black-market hub. Missions, fences, trouble.',
    // rainy neon night — dim cool key, dense dark fog
    light: { sky: 0x16203a, ground: 0x05070c, sun: 0x88aaff, sunI: 1.0, amb: 0x223044, ambI: 0.8, fog: 0x05070c, fogNear: 50, fogFar: 300 },
    crowd: { count: 16, palette: [0x66e0ff, 0xff5db1, 0x8a93a8, 0x9a6fb0, 0x3f8f8f] },
  },
  {
    id: 'dust-reach', name: 'Dust Reach', theme: 'Desert frontier outpost',
    position: [-700, 120, -1400], r: 220, color: 0xb5723a, atmo: 0xffb066,
    blurb: 'Smugglers and bounties under a dust-red sky.',
    // harsh desert day — bright warm key, hazy amber fog
    light: { sky: 0xffd9a0, ground: 0x3a2614, sun: 0xffe0b0, sunI: 2.0, amb: 0x6a4f33, ambI: 0.7, fog: 0xc99a5a, fogNear: 90, fogFar: 460 },
    crowd: { count: 11, palette: [0xb5723a, 0xd9a066, 0x8a7355, 0xa84b2a, 0xccae7a] },
  },
  {
    id: 'cryo', name: 'Cryo Station', theme: 'Ice research colony',
    position: [300, 260, -2200], r: 130, color: 0x9fb6d8, atmo: 0xcfe6ff,
    blurb: 'Frozen labs ripe for a quiet heist.',
    // cold bright overcast — pale blue
    light: { sky: 0xcfe6ff, ground: 0x22384a, sun: 0xeaf4ff, sunI: 1.6, amb: 0x44607a, ambI: 0.85, fog: 0xbcd6ee, fogNear: 70, fogFar: 380 },
    crowd: { count: 7, palette: [0x9fb6d8, 0xcfe6ff, 0x7e93b0, 0xbcd0e0, 0x5a6f8a] },
  },
  {
    id: 'verdant', name: 'Verdant', theme: 'Jungle colony (high security)',
    position: [-1200, -200, -800], r: 110, color: 0x3f8f5a, atmo: 0x8effa0,
    blurb: 'Lush, lawful, and watching. Risk runs high here.',
    // lush green daylight
    light: { sky: 0xbfeeb0, ground: 0x153a1e, sun: 0xfff2cc, sunI: 1.7, amb: 0x32553a, ambI: 0.8, fog: 0x2f5a35, fogNear: 60, fogFar: 340 },
    crowd: { count: 10, palette: [0x3f8f5a, 0x8effa0, 0x6f8f4a, 0xb0c97a, 0x4a7355] },
  },
  {
    id: 'the-maw', name: 'The Maw', theme: 'Asteroid pirate stronghold',
    position: [1400, 400, -2600], r: 180, color: 0x6b5560, atmo: 0xff6680,
    blurb: 'A lawless rock fortress. The deep end.',
    // ominous dark red — low menacing key
    light: { sky: 0x2a1016, ground: 0x241b22, sun: 0xff7a5a, sunI: 1.2, amb: 0x3a2028, ambI: 0.7, fog: 0x140a0e, fogNear: 45, fogFar: 280 },
    crowd: { count: 8, palette: [0x6b5560, 0xa83a4a, 0x7a4a55, 0x9a5560, 0x4a3038] },
  },
];

export const worldById = (id) => WORLDS.find((w) => w.id === id);
