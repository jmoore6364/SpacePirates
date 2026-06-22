// Achievement definitions (renderer-agnostic data). Each is checked against the
// player's lifetime `stats` and fires once when its threshold is first crossed.
// See issue #12. Stats tracked: kills, enforcers, creditsEarned, jumps,
// deliveries, landings, deaths.
export const ACHIEVEMENTS = [
  { id: 'first-blood',   name: 'First Blood',   desc: 'Destroy your first ship.',        test: (s) => s.kills >= 1 },
  { id: 'dogfighter',    name: 'Dogfighter',    desc: 'Destroy 25 ships.',               test: (s) => s.kills >= 25 },
  { id: 'enforcer-bane', name: 'Enforcer Bane', desc: 'Down 10 Enforcers on foot.',      test: (s) => s.enforcers >= 10 },
  { id: 'courier',       name: 'Courier',       desc: 'Complete 5 deliveries.',          test: (s) => s.deliveries >= 5 },
  { id: 'wayfarer',      name: 'Wayfarer',      desc: 'Make 10 hyperspace jumps.',       test: (s) => s.jumps >= 10 },
  { id: 'planetfall',    name: 'Planetfall',    desc: 'Land on worlds 5 times.',         test: (s) => s.landings >= 5 },
  { id: 'entrepreneur',  name: 'Entrepreneur',  desc: 'Earn 10,000 credits.',            test: (s) => s.creditsEarned >= 10000 },
  { id: 'magnate',       name: 'Magnate',       desc: 'Earn 50,000 credits.',            test: (s) => s.creditsEarned >= 50000 },
  { id: 'warlord-bane',  name: 'Warlord Bane',  desc: 'Destroy a pirate Warlord.',       test: (s) => (s.bosses || 0) >= 1 },
  { id: 'prospector',    name: 'Prospector',    desc: 'Mine 50 units of ore.',           test: (s) => (s.oreMined || 0) >= 50 },
];

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);

// Labels for the stats readout, in display order.
export const STAT_LABELS = [
  ['kills', 'Ships destroyed'],
  ['bosses', 'Warlords downed'],
  ['enforcers', 'Enforcers downed'],
  ['deliveries', 'Deliveries'],
  ['oreMined', 'Ore mined'],
  ['jumps', 'Jumps'],
  ['landings', 'Landings'],
  ['creditsEarned', 'Credits earned'],
  ['deaths', 'Times downed'],
];
