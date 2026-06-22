# VOID CORSAIR

A browser 3D **space-pirate** game built with Three.js. Fly your ship between
worlds, land in neon cities, trade and run missions, follow story quests, upgrade
your ship, dogfight bounty hunters, and shoot it out with Enforcers on foot —
across a lawless star cluster.

> *GTA × No Man's Sky × FTL*, stylized and runnable in a browser.

![Void Corsair](docs/screenshot.png)

---

## Quick start

You need **Node 18+** and a WebGL2 browser (Chrome/Edge recommended).

```bash
npm install
npm run dev        # then open the localhost URL it prints (e.g. http://localhost:5173)
```

Production build / preview:

```bash
npm run build
npm run preview    # serves the optimized bundle
```

---

## How to play (your first five minutes)

1. **Launch.** On the title screen press **Enter** (or click **NEW GAME**).
2. **Fly.** Hold **Space** to throttle up; steer with **W/S** (pitch) and **A/D**
   (yaw), roll with **Q/E**. Your speed and throttle show top-left; the **radar**
   (bottom-right) shows worlds (colored blips) and hostiles (red) around you.
3. **Pick a destination.** Press **M** for the **star map** and press a number to
   **fast-travel** to a world. You'll arrive at a standoff distance.
4. **Approach & land.** Fly toward the planet until the green **▸ APPROACH** prompt
   appears, then press **F** to land. The screen fades and you're on foot.
5. **Work the city.** Walk with **W/A/S/D** (the minimap, bottom-right, maps the
   streets). Glowing vendors are marked:
   - **Trader** — buy ship **upgrades** (Engine, Shields, Weapons, Cargo, Hull).
   - **Market** — **buy/sell commodities** (see Trading below).
   - **Mission Board** — accept **delivery** and **bounty** contracts.
   - **Vex** — a quest-giver who appears when there's a story job to take or hand off.
   Walk up to one and press **E** to interact; press **E** or **Esc** to leave.
6. **Take off.** Return to your ship (the landing pad) and press **T** to launch.
7. **Make money & survive.** Follow the markers to your objectives, run cargo
   between worlds, complete contracts and story quests, and blast raiders for
   bounties — but watch your **wanted level**, or Enforcers will be waiting when you land.

---

## Controls

| Context | Keys |
|---|---|
| **Title** | `Enter` / click — **NEW GAME** or **CONTINUE** |
| **Flight (SPACE)** | `Space` thrust · `Shift`/`Ctrl` brake · `W`/`S` pitch · `A`/`D` yaw · `Q`/`E` roll |
| **Space combat** | `J` fire lasers (auto-aim lead + light homing) |
| **Navigate** | `M` star map (number keys to fast-travel) · `F` land when the APPROACH prompt shows |
| **On foot (SURFACE)** | `W`/`A`/`S`/`D` walk · `J` blaster · `E` interact at glowing vendors / NPCs · `T` take off at your ship |
| **Anytime** | `Esc` pause menu (settings · save · quit) · `B` bloom · `P` sound *(all settings persist)* |

On-screen **follow markers** point you to worlds, vendors, your ship, and mission/
quest targets; a **minimap** (on foot) and **radar** (in space) fill in the rest.

---

## Reading the HUD

- **Top-left:** mode, throttle bar, speed, **credits**, your active **quest
  objective**, and in combat your **shield (SHD)**, **hull (HUL)**, and **wanted**
  stars + hostile count.
- **On foot:** the current world + theme, and (in a firefight) your **HP** bar and
  enforcer count.
- **Follow markers:** screen-space labels point to worlds/vendors/your ship; ones
  off-screen clamp to the edge as chevrons. Mission/quest targets are highlighted.
- **Bottom-right:** the **radar** in space (ship-relative, forward = up; planets
  themed, hostiles red) and the top-down **minimap** on foot (streets, pad, vendors,
  enemies, your heading).
- **Star map (`M`):** a spatial overview of the whole cluster — worlds to scale, the
  sun, your ship, plus mission and market-event flags — above the fast-travel list.
- **Center prompts/toasts:** approach/landing/interact hints, dialogue, and news.

---

## Systems

**The core loop:** Fly → approach a world → land → trade / upgrade / take jobs →
take off → fight or fast-travel → repeat.

- **Trading.** Each world's **Market** prices six commodities differently, and
  prices drift over time with **shortage ▲ / surplus ▼** events (watch the NEWS
  toast on landing). Buy low, haul it — limited by your **Cargo** hold — and sell
  high elsewhere. **Spice** is contraband: high value, flagged illegal.
- **Missions.** **Delivery** jobs pay out when you land at the destination.
  **Bounty** contracts pay out once you've destroyed enough raiders. Up to 4 active.
- **Storylines.** Named NPCs (e.g. **Vex**) offer multi-step **quests** that span
  worlds — talk, travel, fight, deliver — with dialogue, a tracked objective, and a
  payout. Starter arc: *The Maw Job*.
- **Ship upgrades.** Engine (top speed), Shields, Weapons, Cargo, Hull — bought at
  the Trader; effects apply on your next launch.
- **Space combat.** Lasers with auto-aim lead + light homing. Enemies come in three
  archetypes: fast/fragile **Scouts**, balanced **Raiders**, and slow/tanky
  high-bounty **Gunships**. The mix escalates with your wanted level.
- **Wanted level & on-foot danger.** Kills earn bounties and raise your **wanted
  level**, spawning more and tougher hunters in space. Land somewhere with heat on
  you and **Enforcers** ambush you on foot — draw your blaster (`J`) and fight or
  run for your ship.
- **Saving.** Credits, upgrades, cargo, completed jobs, and settings persist in
  `localStorage`. **CONTINUE** resumes; **NEW GAME** wipes the save.

## Worlds

Each world has its own **terrain** (dunes, ice plains, jungle hills, asteroid rock,
wet flats), **lighting mood** + fog, and market character:

**Neon Haven** (cyberpunk port) · **Dust Reach** (desert frontier) · **Cryo
Station** (ice labs) · **Verdant** (jungle, high security) · **The Maw** (asteroid
stronghold).

---

## Roadmap

Tracked as GitHub issues — contributions welcome.

**Done ✅**
- [#1](https://github.com/jmoore6364/SpacePirates/issues/1) Planetary terrain
- [#2](https://github.com/jmoore6364/SpacePirates/issues/2) Lighting & atmosphere (moods, shadows, day/night)
- [#3](https://github.com/jmoore6364/SpacePirates/issues/3) Follow markers / waypoints
- [#4](https://github.com/jmoore6364/SpacePirates/issues/4) Storylines & quests (framework + *The Maw Job* + dialogue)
- [#5](https://github.com/jmoore6364/SpacePirates/issues/5) World minimap
- [#6](https://github.com/jmoore6364/SpacePirates/issues/6) Space sector / system map
- [#7](https://github.com/jmoore6364/SpacePirates/issues/7) Menu & pause system (settings, volume, save, quit)
- [#8](https://github.com/jmoore6364/SpacePirates/issues/8) Experience, levels & skill tree
- [#9](https://github.com/jmoore6364/SpacePirates/issues/9) Shipyard — ship variety (buy/swap hulls)
- [#10](https://github.com/jmoore6364/SpacePirates/issues/10) Fuel & jump-range
- [#11](https://github.com/jmoore6364/SpacePirates/issues/11) Save slots + manual save/load
- [#12](https://github.com/jmoore6364/SpacePirates/issues/12) Achievements & run stats
- [#13](https://github.com/jmoore6364/SpacePirates/issues/13) Gamepad support & key remapping
- [#14](https://github.com/jmoore6364/SpacePirates/issues/14) Tutorial / onboarding
- [#15](https://github.com/jmoore6364/SpacePirates/issues/15) Living NPCs — wandering crowds, barks, named informant
- [#16](https://github.com/jmoore6364/SpacePirates/issues/16) Weapons & armor (Armory) — on-foot loadout shop

All tracked roadmap issues are shipped. New ideas welcome via the [issue tracker](https://github.com/jmoore6364/SpacePirates/issues).

See the full [issue tracker](https://github.com/jmoore6364/SpacePirates/issues).

---

## Architecture

Game logic is kept renderer-agnostic behind a thin `Renderer` boundary, so a custom
WebGL engine could be swapped in later (see `docs/ENGINE-ROADMAP.md`).

```
src/
  renderer/   Renderer — the only place Three.js rendering lives (+ bloom, shadows, shake)
  core/       GameLoop, GameState (scene state machine), Input, ChaseCamera, ThirdPersonCamera
  scenes/     SpaceScene, SurfaceScene, props, city builder (+ terrain heightfield)
  entities/   Ship, Character
  systems/    Combat (space), GroundCombat (on-foot), Audio (procedural WebAudio)
  game/       Player (economy/upgrades/cargo/quests/save), Missions, Market, Quests
  ui/         StarMap (+ system map), Panels (shop/market/missions/dialogue),
              TitleScreen, MenuScreen (pause/settings)
  world/      Worlds (canonical world data + per-world terrain/lighting profiles)
  util/       math
  main.js     wires it together: HUD, radar, minimap, follow markers, transitions
docs/         DESIGN.md, ENGINE-ROADMAP.md, PACKAGING.md
tests/        logic/ (node:test) + screenshot.mjs (Playwright→Edge self-test)
```

## Testing (no human needed)

```bash
npm test           # logic unit tests + headless screenshot self-test
npm run test:logic # node:test — math, economy, missions, trading, quests (24 tests)
npm run test:shot  # builds, serves, drives the game in headless Edge, screenshots
```

The screenshot harness plays the whole game — title → pause menu → space combat
(3 enemy types) → system map → landing on terrain → minimap → on-foot combat → shop
→ missions → market → take a quest from Vex → takeoff — saving a shot of each scene
to `test-screenshots/` and failing on any console/WebGL error. Only *feel*
(handling, difficulty, fun) needs a human.

## Status

The full tracked roadmap is complete: arcade flight, 5 worlds with distinct
**terrain** and **lighting moods**, star-map + **spatial system map**, landing and
on-foot **neon cities** with **living crowds** and a named informant, economy
(ship **upgrades** / **shipyard hulls** / missions / dynamic **trading** / **fuel**),
**space and on-foot combat** (three enemy archetypes, wanted level, Enforcers, an
**Armory** of personal weapons + armor, hit FX), **storyline quests** with dialogue,
**XP / skill tree**, **achievements & run stats**, a first-run **tutorial**,
**gamepad + key remapping**, mobile **touch controls**, **save slots**, and juice
(bloom, shadows, screen shake, procedural audio, title).

Roadmap #1–#16 are all shipped (see the [Roadmap](#roadmap)). Desktop
packaging (Electron → `.exe`/Steam) is optional — see `docs/PACKAGING.md`.

## Credits

Built with [Three.js](https://threejs.org/). All art is procedural/low-poly and all
audio is synthesized at runtime — no external assets.
