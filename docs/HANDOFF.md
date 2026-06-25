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
- **Balance pass** (targeted, not a renumber — economy was already roughly tuned):
  - *Risk/escalation:* space bounties re-tuned so bounty/HP **rises** up the ladder
    (scout 42 / raider 82 / gunship 210 / Warlord 1600; ~2.3→3.1 cr·HP⁻¹) and the
    heat kill-bonus is `wanted*15` (was *10). Ground enforcers fixed too (grunt 55 /
    heavy 160 / captain 720; sniper 78 keeps a glass-cannon premium).
  - *Smooth progression:* Weapons & Shields upgrade `mult` 1.7→1.6 so the late
    levels aren't a wall — every track now maxes for ≤6k (all combat tracks 1.6,
    cargo cheapest at 1.5).
  - *Fairer penalties:* ship-destruction repair bill capped — `player.deathPenalty()`
    = min(10% of credits, `DEATH_PENALTY_CAP`=1200). No more losing 5k per death.
  - *Locked with tests:* new `tests/logic/balance.test.js` asserts the bounty/HP
    ladder, monotonic+banded upgrade costs, and the capped death penalty (relationships,
    not magic numbers, so tuning stays free). `ENEMY_TYPES`/`ENFORCER_TYPES` now exported.
- **Wanted-level customs** — arriving "hot" (space heat / `combat.wanted`) at a secure
  port can get you **detained and fined for your record alone**, no contraband needed.
  `customsHeatStop(security, wanted, rep)` in `Missions.js` — chance scales with
  security × heat, good standing buys leniency; fine = `wanted*120 + security*100`.
  Applied in `land()` in `main.js` (independent of the contraband seizure + the
  smuggler's compartment, which only hides cargo).
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
3. ~~**Wanted-level customs**~~ — DONE (see Features above).

All three contraband follow-ups + the balance pass are now shipped. Other open
threads still untouched: a 4th quest (trade/`sell` step) and quest-objective waypoint
emphasis. Further balance tuning, if wanted, can build on `balance.test.js` invariants.
