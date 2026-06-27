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
- **Held weapons + enforcer death anim + fire feedback** —
  - **Guns in hand:** `Gun.js` builds a low-poly weapon (shape/length/colour per
    `Weapons.js` type); `AnimatedActor.attachToHand()` parents it to the rig's
    right-hand bone. `Character.equipGun(id)` puts the player's current sidearm in
    hand (rebuilt on Armory change via `armory.onChange` in `main.js`); firing kicks
    it back (`gunRecoil()`). **Gotcha:** fbx2gltf strips dots from bone names
    (`Palm.R`→`PalmR`), so `findBone` matches with separators removed.
  - **Enforcer death:** `_killEnemy` plays the `death` clip once and lingers the body
    in `_dying[]` (`_updateDying` advances the mixer, then frees it ~1.4 s later);
    enforcers also play `punch` as an attack lunge when they fire (`_attackT` gate).
  - Player firing uses a gun-recoil kick rather than a body clip (a punch at the
    blaster's fire-rate looked wrong). Enforcers are NOT yet holding gun meshes.
  - NOTE: couldn't get a clean harness screenshot of the held gun (camera framing);
    `GUN_FIT` in `Character.js` (pos/euler/scale in the hand bone) may need eyeball
    tuning from the live game.
- **Animated crowd + enemies (3D)** — crowd civilians and on-foot enforcers are now
  animated 3D models (Quaternius, CC0), via a shared **`AnimatedActor`** helper
  (`src/entities/AnimatedActor.js`: mixer + canonical clip-name map so
  `Armature|Robot_Walking`→`walk` + crossfade). `Models.js` now loads man/woman/alien/
  robot and `characterModel(kind, {cloneMaterials})` returns a `SkeletonUtils.clone`.
  - **Crowd** (`Crowd.js`): man/woman/alien variety (`CROWD_KINDS`), idle/walk (walk
    when fleeing); procedural civilian fallback; dispose skips shared template buffers.
  - **Enforcers** (`GroundCombat.js`): animated **robot**, `cloneMaterials:true` so the
    archetype tint (grunt red / heavy orange / sniper purple / captain gold) and the
    red hit-flash are per-instance; scaled by `type.scale`; idle/walk; kill frees only
    cloned materials (geometry is shared).
  - **Node-safety:** model asset URLs use `new URL('…glb', import.meta.url)` (not
    `?url`), so logic tests importing `GroundCombat`→`Models` still run under Node.
  - Bundle: 4 character GLBs (~2.8 MB total, mesh-dominated). Future: simplify/strip to
    shrink; quantize is OFF (it made skinned meshes render invisible).
- **Animated on-foot character (POC)** — the main character is an animated 3D model:
  **Quaternius "Animated Men"** (CC0, skinned + skeletal animation; 11 clips incl.
  idle/walk/run/punch/death). `Models.js` loads `quaternius-man.glb`, `characterModel()`
  returns a **`SkeletonUtils.clone`** (required for skinned meshes) normalized to
  ~3.4 tall / feet at y=0 via a yaw pivot. `Character.js` builds it as a swappable
  child, runs an `AnimationMixer`, crossfades idle⇄walk by `moving` (clip names
  normalized so `HumanArmature|Man_Idle` → `idle`); `_bobAmp` zeroed when animated.
  Falls back to the procedural figure if loading fails.
  **Asset pipeline / lessons (important for adding more characters):**
  - Quaternius ships **FBX only** (no GLB). Convert with the `fbx2gltf` npm pkg
    (JS API: `require('fbx2gltf')(in,out,['--binary'])`; the `npx` bin name doesn't
    resolve). Do **not** pass `--khr-materials-unlit` (kills the soft shading).
  - Shrink with `@gltf-transform/cli resample`+`prune` (1.1 MB → ~950 KB). **Avoid
    `quantize`** on these skinned meshes — it made the character render invisible.
  - Materials come in dark on night maps; we lift `emissive = color, emissiveIntensity
    0.4` at load so the player reads everywhere.
  - Downloaded the Drive-folder pack via `python -m gdown --folder <url>`.
  - (Earlier tried Kenney "Blocky Characters" — works too but Minecraft-blocky, and
    its GLB used an *external* texture needing `gltf-transform copy` to embed.)
  Crowds/enforcers still procedural.
- **3D ship models (POC)** — real low-poly models replace the procedural player ship.
  Assets: Kenney "Space Kit" GLBs (CC0, license in `src/assets/models/KENNEY-LICENSE.txt`).
  `src/entities/Models.js` preloads + normalizes (center/scale/yaw 180° to face -Z) and
  hands out clones; `Ship.js` uses a clone per hull when ready (corsair→speederA,
  interceptor→racer, freighter→cargoA, gunship→speederD) and falls back to the
  procedural mesh otherwise. Engine glow + light are re-attached at the rear so the
  throttle pulse still works. `main.js` calls `preloadShipModels()` then live-swaps
  the backdrop ship via `ship.refreshVisual()`. **Enemies/stations are still procedural.**
  GLBs imported with Vite `?url` (base-correct on the Pages subpath); three chunk +~40 KB.
- **4th quest "The Spice Run" + `sell` step type** — new data-driven step
  `{ type:'sell', commodity, count, world? }` advanced by `QuestLog.onSell(id, qty,
  worldId)`. Wired from the Market panel (`market.onSell` → host in `main.js`).
  The arc (giver **Sable** @ Dust Reach, gated behind Deep Cut, 4200 cr): take job →
  buy Spice at The Maw → fence 8 Spice on Neon Haven → bring Sable her cut. Quest
  state gained a `sell` counter (reset in start/_advance, persisted in questState).
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

All three contraband follow-ups + the balance pass + the 4th quest are now shipped.
Last remaining thread from this list: **quest-objective waypoint emphasis** (make the
active quest's current travel/sell target stand out more on the HUD/markers). Further
balance tuning, if wanted, can build on `balance.test.js` invariants.
