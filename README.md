# VOID CORSAIR

A browser 3D **space-pirate** game built with Three.js. Fly your ship between
worlds, land in neon cities, trade and take missions, upgrade your ship, and
dogfight bounty hunters across a lawless star cluster.

> *GTA × No Man's Sky × FTL*, stylized and runnable in a browser.

![pass](docs/screenshot.png)

## Play

```bash
npm install
npm run dev      # open the printed localhost URL
```

Build / preview a production bundle:

```bash
npm run build
npm run preview
```

## Controls

| Context | Keys |
|---|---|
| **Title** | Enter / click — NEW GAME or CONTINUE |
| **Flight (SPACE)** | `Space` thrust · `Shift` brake · `W/S` pitch · `A/D` yaw · `Q/E` roll |
| **Combat** | `J` fire lasers (auto-aim lead + light homing) |
| **Navigate** | `M` star map (pick a world to fast-travel) · `F` land when an APPROACH prompt shows |
| **On foot (SURFACE)** | `W/A/S/D` walk · `E` interact at glowing vendors · `T` take off at your ship |
| **Settings** | `B` bloom on/off · `P` sound on/off (both persist) |

## The loop

Fly → approach a world → land → walk the city → trade upgrades / take delivery
missions → take off → fight or fast-travel → repeat. Delivery jobs pay out when
you land at their destination. Kills earn bounties and raise your **wanted level**,
which spawns more hunters. Credits, upgrades, completed jobs, and settings are
saved to `localStorage`.

## Worlds

Neon Haven (cyberpunk port) · Dust Reach (desert frontier) · Cryo Station (ice
labs) · Verdant (jungle, high security) · The Maw (asteroid stronghold).

## Architecture

Game logic is kept renderer-agnostic behind a thin `Renderer` boundary so a custom
WebGL engine can be swapped in later (see `docs/ENGINE-ROADMAP.md`).

```
src/
  renderer/   Renderer — the only place Three.js rendering lives (+ bloom, shake)
  core/       GameLoop, GameState (scene state machine), Input, cameras
  scenes/     SpaceScene, SurfaceScene, props, city builder
  entities/   Ship, Character
  systems/    Combat, Audio (procedural WebAudio)
  game/       Player (economy/upgrades/save), Missions
  ui/         StarMap, Panels (shop/missions), TitleScreen
  world/      Worlds (canonical world data)
  util/       math
docs/         DESIGN.md, ENGINE-ROADMAP.md, PACKAGING.md
tests/        logic/ (node:test) + screenshot.mjs (Playwright→Edge self-test)
```

## Testing (no human needed)

```bash
npm test           # logic unit tests + headless screenshot self-test
npm run test:logic # node:test — math, economy, missions
npm run test:shot  # builds, serves, drives the game in headless Edge, screenshots
```

The screenshot harness plays through the whole game — title → flight → combat →
star map → landing → walking → shop → missions → takeoff — capturing each scene to
`test-screenshots/` and failing on any console/WebGL error. Only *feel* needs a human.

## Status

Passes 0–6 complete (scaffold, flight, worlds/travel, landing + on-foot city, city
life/economy, combat, juice/systems). Pass 7 (Electron → Windows `.exe` / Steam) is
optional — see `docs/PACKAGING.md`.

## Credits

Built with [Three.js](https://threejs.org/). Art is procedural/low-poly; audio is
synthesized at runtime (no external assets).
