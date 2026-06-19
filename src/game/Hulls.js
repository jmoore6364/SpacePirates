// Ship hull definitions (renderer-agnostic data). Each hull has base stats that
// upgrades and skill perks stack on top of, a price, and a mesh variant key.
// 'corsair' is the starting hull (free, owned by default) and matches the original
// balanced ship. See issue #9.
export const HULLS = [
  {
    id: 'corsair', name: 'Corsair', price: 0,
    desc: 'Balanced all-rounder. Your starting ship.',
    base: { maxSpeed: 420, shield: 0, weapon: 10, cargo: 20, hull: 100 },
  },
  {
    id: 'interceptor', name: 'Interceptor', price: 2800,
    desc: 'Fast and nimble, but fragile with a small hold.',
    base: { maxSpeed: 580, shield: 0, weapon: 12, cargo: 12, hull: 70 },
  },
  {
    id: 'freighter', name: 'Freighter', price: 4500,
    desc: 'Slow hauler with a huge cargo hold and a tough hull.',
    base: { maxSpeed: 340, shield: 10, weapon: 8, cargo: 64, hull: 160 },
  },
  {
    id: 'gunship', name: 'Gunship', price: 7000,
    desc: 'Heavy warship: strong guns, shields, and armor.',
    base: { maxSpeed: 380, shield: 40, weapon: 22, cargo: 18, hull: 190 },
  },
];

export const hullById = (id) => HULLS.find((h) => h.id === id) || HULLS[0];
