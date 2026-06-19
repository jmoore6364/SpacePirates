# VOID CORSAIR — Design Document
*(working title — a space-pirate open-world game)*

> Built with **Three.js** for fast, good-looking results. A from-scratch custom
> engine is planned for later — see `ENGINE-ROADMAP.md`.

---

## 1. The Pitch
You're a **space pirate captain**. You own a ship, you jump between worlds, you
land in alien cities, you trade and steal and fight, you upgrade your ship, and
you build a reputation across a lawless star cluster. Think **"GTA meets No
Man's Sky meets FTL,"** stylized and runnable in a browser.

## 2. Core Fantasy / Player Loop
```
        ┌─────────────────────────────────────────────┐
        │                                             │
   FLY in space ──► APPROACH a world ──► LAND ──► WALK the city
        ▲                                             │
        │                                             ▼
   UPGRADE ship ◄── EARN credits ◄── TRADE / STEAL / DO MISSIONS / FIGHT
        │                                             │
        └─────────── TAKE OFF, jump to next world ◄───┘
```
- **Explore** a cluster of distinct planets.
- **Fly & dogfight** in space (arcade flight, lasers, shields).
- **Land** on planets with a real descent/landing sequence.
- **Walk** alien cities on foot — shops, NPCs, missions, loot.
- **Progress**: credits → ship & gear upgrades → access tougher/farther worlds.
- **Reputation / Wanted level**: piracy attracts bounty hunters.

## 3. Game Modes (state machine)
The whole game is a state machine that swaps "scenes":

| Mode | What happens | Camera |
|---|---|---|
| `TITLE` | Menu, new game / continue | Cinematic |
| `SPACE` | Free-flight, travel, dogfights | Chase-cam behind ship |
| `LANDING` | Scripted/assisted descent to a surface pad | Cinematic → chase |
| `SURFACE` | On-foot in a city / outpost | 3rd-person character |
| `INTERIOR` | Shops, mission boards, ship cockpit menus | UI overlay |
| `MAP` | Star map / fast-travel between worlds | 2D/3D map |

## 4. The Worlds (each visually distinct)
Procedurally *placed* but hand-themed so each feels unique:
1. **Neon Haven** — rainy cyberpunk pirate port; black-market, missions hub.
2. **Dust Reach** — desert frontier outpost; smugglers, bounties.
3. **Cryo / Ice world** — research colony, heists.
4. **Verdant ringworld / jungle colony** — lush, lawful, high security (risk).
5. **The Maw** — asteroid-field pirate stronghold; boss/endgame vibe.

Each world = a small walkable hub (not a full continent) + unique skybox,
lighting, palette, music, and a couple of interactable buildings.

## 5. The Ship
- **Yours to fly & own.** Arcade 6-DOF-ish flight (pitch/yaw/roll + throttle).
- **Land & take off** at pads (assisted landing minigame-lite).
- **Upgrade tree**: Engine (speed), Shields, Weapons (laser/missile), Cargo,
  Hull. Bought with credits.
- **Cockpit / chase camera** toggle.

## 6. Combat
- **Space**: lasers + missiles, shields, enemy pirate/police ships with simple
  pursuit AI, explosions & particles, lock-on.
- **(Stretch) On-foot**: light blaster combat in cities when things go wrong.
- **Wanted level**: crimes raise heat → bounty hunters spawn.

## 7. Economy & Progression
- **Credits** from: trading goods between worlds, bounties, missions, looting
  wrecks, stealing cargo.
- **Spend on**: ship upgrades, weapons, fuel, bribes, gear.
- **Missions**: delivery, smuggling, bounty hunting, heists, escort.

## 8. Art Direction
- **Stylized low-poly / sci-fi**, leaning on free CC0 asset kits + emissive
  neon materials + bloom postprocessing for a polished look.
- Consistent palette per world; lots of emissive lights, fog, and a strong
  skybox so scenes read as "space-y" cheaply.

## 9. Tech Stack
- **Rendering**: Three.js (WebGL2).
- **Postprocessing**: Three.js `EffectComposer` (bloom, vignette) for "juice."
- **Physics**: lightweight custom arcade physics for the ship; simple capsule
  character controller on foot. (Optionally `cannon-es`/`rapier` later.)
- **Assets**: glTF/GLB models from free CC0 kits (see §11).
- **Audio**: WebAudio (engine hum, lasers, ambient, music).
- **Save**: `localStorage` (credits, upgrades, progress).
- **Structure**: modular JS (`/src`) so it can be wrapped in **Electron → .exe →
  Steam** later (see `STEAM.md` notes).

## 10. Build Plan — Passes (each one is *playable*)
> Honest scope: **one night realistically gets a strong vertical slice
> (≈ Passes 0–3/4).** The full game above is a multi-session project. Every pass
> leaves a working build.

- **Pass 0 — Scaffold + self-test.** Project structure, Three.js loaded,
  Playwright→Edge screenshot harness, a spinning lit planet to prove rendering.
- **Pass 1 — Space flight.** Fly your ship: throttle, pitch/yaw/roll, chase cam,
  starfield + sun + a few planets, HUD. *Immediately fun.*
- **Pass 2 — Worlds & travel.** Multiple themed planets, "approach to land"
  prompt, star-map fast travel.
- **Pass 3 — Landing + on-foot city.** Descent sequence, switch to 3rd-person
  character, walkable city from modular buildings, lights, fog.
- **Pass 4 — City life.** NPCs, a shop/trader UI, a mission-giver, credits &
  buying ship upgrades.
- **Pass 5 — Combat & danger.** Space dogfights, enemy AI, shields, explosions,
  wanted level / bounty hunters.
- **Pass 6 — Juice & systems.** Sound, music, bloom, screen shake, title screen,
  settings, save/load.
- **Pass 7 — (optional) Package.** Electron wrapper → Windows `.exe`,
  Steam-readiness notes.

## 11. Asset Sources (free / CC0 preferred)
- **Kenney.nl** — Space Kit, City Kit (CC0, zero-attribution).
- **Quaternius** — Ultimate Space Kit, modular sci-fi buildings, animated
  characters (CC0).
- **Poly Pizza / Sketchfab** — CC0/CC-BY models.
- **Mixamo** (Adobe, free) — rigged + animated humanoid characters.
- **AI 3D** (Meshy/Luma/Rodin) — optional text-to-3D for hero assets.
- Audio: Freesound (CC0), Kenney audio packs, free game-music.

## 12. Testing (automated, no human needed)
- **Node unit tests** for math/physics/economy/state logic.
- **Playwright + installed Edge** to load the game headless, capture console/
  WebGL errors, and **screenshot each scene** so Claude can self-verify visuals.
- Human only judges *feel* (handling, difficulty, fun).

## 13. Open Questions / Decisions
- 1st-person vs 3rd-person on foot? (Plan: **3rd-person**.)
- How "sim" vs "arcade" is flight? (Plan: **arcade**, fun-first.)
- Character: stylized CC0 vs Mixamo realistic? (Plan: **CC0 first**, swap later.)
- Game name. (Working title: **VOID CORSAIR**.)
