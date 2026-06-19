// Multi-slot save management (renderer-agnostic). Each slot stores a versioned
// blob: { version, savedAt, meta, state }. `state` is whatever Player.serialize()
// returns; `meta` is a small summary for the slot list. See issue #11.
export const SLOT_COUNT = 5;
const VERSION = 2;
const KEY = (slot) => `voidcorsair.slot.${slot}`;
const LEGACY_KEY = 'voidcorsair.save.v1';

function nowSafe() {
  try { return Date.now(); } catch { return 0; }
}

export function writeSlot(store, slot, player, when) {
  if (!store) return false;
  const data = {
    version: VERSION,
    savedAt: when != null ? when : nowSafe(),
    meta: { credits: player.credits, level: player.xpLevel, hull: player.hull, fuel: Math.round(player.fuel) },
    state: player.serialize(),
  };
  try { store.setItem(KEY(slot), JSON.stringify(data)); return true; } catch { return false; }
}

export function readSlot(store, slot) {
  if (!store) return null;
  try { const raw = store.getItem(KEY(slot)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function deleteSlot(store, slot) {
  if (!store) return;
  try { store.removeItem(KEY(slot)); } catch { /* ignore */ }
}

export function listSlots(store) {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const d = readSlot(store, i);
    out.push(d ? { slot: i, empty: false, savedAt: d.savedAt || 0, meta: d.meta || {}, state: d.state } : { slot: i, empty: true });
  }
  return out;
}

export function mostRecentSlot(store) {
  const used = listSlots(store).filter((s) => !s.empty);
  if (!used.length) return null;
  used.sort((a, b) => b.savedAt - a.savedAt);
  return used[0].slot;
}

export function firstEmptySlot(store) {
  const s = listSlots(store).find((x) => x.empty);
  return s ? s.slot : 0;
}

export function hasAnySave(store) {
  if (!store) return false;
  if (listSlots(store).some((s) => !s.empty)) return true;
  try { return !!store.getItem(LEGACY_KEY); } catch { return false; }
}

// One-time migration of the old single-key save into slot 0.
export function migrateLegacy(store) {
  if (!store) return null;
  try {
    if (listSlots(store).some((s) => !s.empty)) return null;
    const raw = store.getItem(LEGACY_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    store.setItem(KEY(0), JSON.stringify({ version: VERSION, savedAt: nowSafe(), meta: { credits: state.credits, level: state.xpLevel || 1, hull: state.hull || 'corsair' }, state }));
    store.removeItem(LEGACY_KEY);
    return 0;
  } catch { return null; }
}
