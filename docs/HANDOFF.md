# Session handoff — Void Corsair

_Last updated: 2026-06-24. Working notes so we can pick straight back up._

## Where we are
- **All 16 roadmap issues (#1–#16) are shipped and closed.** Since then we've been
  free-building new features on top, each one tested + deployed.
- Repo is clean and deployed. **Live:** https://jmoore6364.github.io/SpacePirates/
  (auto-deploys via GitHub Pages on every push to `main`).
- **87 logic tests** + the headless screenshot self-test all pass.

## How to work here
- `npm run test:logic` — fast node:test unit tests (game logic).
- `npm test` — logic + the Playwright/Edge screenshot self-test (drives the whole game,
  writes shots to `test-screenshots/`, fails on console/WebGL errors).
  - Note: the Edge harness occasionally crashes on teardown with a flaky
    `LoadEnclaveImageW` error / exit 255 even though "self-test passed" printed —
    just re-run; check real status with `npm test *> $null; "$LASTEXITCODE"`.
- `npm run build` — Vite production build.
- Deploy = commit + push to `main`; watch with
  `gh run watch <id> --exit-status`. Each feature has been: edit → test → build →
  commit → push → confirm deploy `success`.

## Features added this session (newest first)
- **Bounty-hunt waypoints** — while a bounty contract is active, the HUD flags the
  **nearest hostile** in space with a red ☠ marker (Warlord boss labelled separately)
  and the `#hud-missions` bounty line shows live nearest-hostile distance (or
  "no hostiles — raise heat" when the sky is clear). Pure HUD; in `updateMarkers()` /
  `renderMissionGuidance()` in `main.js`, reads `space.combat.enemies`.
- **Smuggler's compartment** — one-time ship module (Shipyard → MODULES, 2200 cr,
  `player.hasSmugglerHold`) that multiplies customs-scan odds by `SMUGGLER_SCAN_MULT`
  (0.4, ~60% fewer scans). Applied inside `MissionLog.runCustoms` (reads the flag off
  `this.player`; no call-site change). Persisted in serialize/applyState.
- **Missions: cargo + contraband smuggling risk** — deliveries occupy cargo `units`
  (NO HOLD if they won't fit); illegal cargo (contraband/spice) pays a premium but
  risks a **customs scan** at secure ports (new per-world `security` in Worlds.js)
  that seizes it for a fine + rep hit. Destination is always safe; lawless ports
  never scan; good standing lowers odds. `MissionLog.runCustoms()`.
- **Missions: persist + HUD waypoints/guidance** — active missions now live on
  `player.missionsActive` (saved). HUD `#hud-missions` lists deliveries (cargo →
  dest + live distance) and bounty progress; space markers flag delivery dests
  (◈ green) and the active quest travel target (✦ gold).
- **Quests** — generic multi-quest framework (data-driven givers via
  `giverAt`/`dialogueFor`/`requires` gate), `mine` step type, and a 3-arc campaign:
  **The Maw Job → Cold Trail (Mara@Cryo) → Deep Cut (Brak@The Maw)**. Journal panel
  in the pause menu.
- **Faction reputation** (per-world, `player.rep`) — shifts market margins ±20% and
  on-foot enforcer welcome; hostile ports (rep ≤ -20) **ambush** you on arrival.
- **Records panel** — career score, peak credits, per-world standing.
- **Combat depth** — homing **missiles** (secondary fire `L`, restock at Market),
  pirate **Warlord** boss at 5★ heat, on-foot **Enforcer Captain** mini-boss,
  **enforcer archetypes** (grunt/heavy/sniper), **wingman** escort (hire at Shipyard),
  **asteroid belt** around The Maw (collision damage + **mining** for Raw Ore).

## Key files (quick map)
- `src/game/Player.js` — all persisted state (credits, upgrades, cargo, rep, runStats,
  missionsActive, sidearm/armor, missiles, wingman, peakCredits). serialize/applyState.
- `src/game/Missions.js` — delivery/bounty offers, MissionLog (accept/arriveAt/
  recordKill/runCustoms), cargo units + illegal flags.
- `src/game/Quests.js` — QUESTS data + QuestLog (talk/travel/kill/mine steps).
- `src/systems/Combat.js` — space combat: lasers, missiles, enemies, Warlord boss,
  wingman, asteroid mining hook (`this.asteroids`).
- `src/systems/GroundCombat.js` — on-foot: weapons/armor, enforcer types, Captain.
- `src/scenes/SpaceScene.js` / `SurfaceScene.js` / `Asteroids.js` / `Crowd.js`.
- `src/main.js` — wiring: HUD, events, panels, markers/guidance, land/takeoff,
  achievements/rep hooks. `window.__VC__` exposes everything for the self-test.
- `src/ui/Panels.js` (shop/market/missions/armory/shipyard/skills/dialogue),
  `StatsPanel`, `QuestPanel`, `ControlsPanel`, `MenuScreen`, `TouchControls`.

## Where we left off / next ideas (not started)
User was offered these follow-ups after the contraband work — pick up here:
1. ~~**Smuggler's compartment**~~ — DONE (see Features above).
2. ~~**Bounty-hunt waypoints**~~ — DONE (see Features above).
3. **Wanted-level customs** — your own heat triggers scans even with legal cargo.

Other open threads mentioned earlier: a 4th quest (trade/`sell` step), quest-objective
waypoint emphasis, and a **balance pass** (tune prices/HP/rewards across all the new
systems — nothing has been balance-tuned as a whole yet).
