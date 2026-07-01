import { Renderer, THREE } from './renderer/Renderer.js';
import { GameLoop } from './core/GameLoop.js';
import { SceneManager, Mode } from './core/GameState.js';
import { Input } from './core/Input.js';
import { SpaceScene } from './scenes/SpaceScene.js';
import { preloadModels } from './entities/Models.js';
import { SurfaceScene } from './scenes/SurfaceScene.js';
import { InteriorScene } from './scenes/InteriorScene.js';
import { StarMap } from './ui/StarMap.js';
import { Shop, MissionBoard, Market, Dialogue, Skills, Shipyard, Armory } from './ui/Panels.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { MenuScreen } from './ui/MenuScreen.js';
import { SavesPanel } from './ui/SavesPanel.js';
import { StatsPanel } from './ui/StatsPanel.js';
import { Tutorial } from './ui/Tutorial.js';
import { ControlsPanel } from './ui/ControlsPanel.js';
import { QuestPanel } from './ui/QuestPanel.js';
import { TouchControls } from './ui/TouchControls.js';
import { firstEmptySlot, deleteSlot } from './game/SaveSlots.js';
import { WORLDS } from './world/Worlds.js';
import { player } from './game/Player.js';
import { MissionLog, generateOffers, customsHeatStop } from './game/Missions.js';
import { QuestLog } from './game/Quests.js';
import { AudioManager } from './systems/Audio.js';
import { tickMarket, commodityById, activeEvents } from './game/Market.js';
import { fuelCost } from './game/Player.js';
import { clamp } from './util/math.js';

const clamp01 = (x) => clamp(x, 0, 1);

const container = document.getElementById('app');
const renderer = new Renderer(container);
const scenes = new SceneManager(renderer);
const input = new Input();

const el = {
  mode: document.getElementById('hud-mode'),
  fps: document.getElementById('hud-fps'),
  throttle: document.getElementById('hud-throttle'),
  speed: document.getElementById('hud-speed'),
  approach: document.getElementById('hud-approach'),
  toast: document.getElementById('hud-toast'),
  credits: document.getElementById('hud-credits'),
  combat: document.getElementById('hud-combat'),
  xp: document.getElementById('hud-xp'),
  quest: document.getElementById('hud-quest'),
  missions: document.getElementById('hud-missions'),
  radar: document.getElementById('radar'),
  markers: document.getElementById('markers'),
  minimap: document.getElementById('minimap'),
  reticle: document.getElementById('reticle'),
  bossBar: document.getElementById('boss-bar'),
  bossFill: document.querySelector('#boss-bar .bb-fill'),
  bossLabel: document.querySelector('#boss-bar .bb-label'),
  loading: document.getElementById('loading'),
  fade: document.getElementById('fade'),
};

let space = null;
let surface = null;
let interior = null; // active building interior (surface stays loaded behind it)
let busy = false;    // true during a fade transition
let panel = null;    // open DOM panel (shop / missions)
let started = false; // false while the title screen is up
let paused = false;  // true while the pause menu is open

const audio = new AudioManager();
const missionLog = new MissionLog(player);
const questLog = new QuestLog(player);
const offersByWorld = {};

// --- settings (bloom + sound), persisted ---
const SETTINGS_KEY = 'voidcorsair.settings.v1';
const settings = loadSettings();
function loadSettings() {
  const def = { bloom: true, muted: false, master: 0.5, music: 0.6, sfx: 1.0, quality: 'high', mouseFlight: true };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
  catch { return def; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

// release on-foot mouse-look pointer lock (used when opening UI / leaving the surface)
const exitLook = () => { if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock?.(); };
const closePanel = () => { panel = null; if (surface) surface.inputLocked = false; if (space) space.inputLocked = false; if (interior) interior.inputLocked = false; };
const shop = new Shop({ onClose: closePanel });
const missionBoard = new MissionBoard({ onClose: closePanel });
const market = new Market({ onClose: closePanel });
const skills = new Skills({ onClose: closePanel });
skills.onChange = () => audio.blip();
const shipyard = new Shipyard({ onClose: closePanel });
shipyard.onChange = () => audio.blip();
const armory = new Armory({ onClose: closePanel });
armory.onChange = () => { audio.blip(); if (surface && surface.character.equipGun) surface.character.equipGun(player.sidearm); };

// Award XP and surface level-ups.
function awardXp(n) {
  const gained = player.addXp(n);
  if (gained > 0) { audio.blip(); toast(`LEVEL UP — Level ${player.xpLevel} (+${gained} skill pt${gained > 1 ? 's' : ''}) · press K`); }
}

function openSkills() {
  if (scenes.mode === Mode.SPACE && space) space.inputLocked = true;
  else if (surface) surface.inputLocked = true;
  exitLook();
  audio.blip();
  skills.open(player);
  panel = skills;
}
const dialogue = new Dialogue({ onClose: closePanel });

function applySetting(key, value) {
  settings[key] = value;
  if (key === 'bloom') renderer.setBloom(value);
  else if (key === 'quality') renderer.setQuality(value);
  else if (key === 'mouseFlight') input.mouseFlight = value;
  else if (key === 'master' || key === 'music' || key === 'sfx') audio.setVolumes(settings);
  saveSettings();
}

function setPaused(p) {
  paused = p;
  if (p) { menu.open(settings); exitLook(); }
  else menu.close();
}

const savesPanel = new SavesPanel({
  store: (typeof localStorage !== 'undefined') ? localStorage : null,
  onSave: (slot) => { player.saveToSlot(slot); toast(`Saved to slot ${slot + 1}.`); },
  onLoad: (slot) => {
    if (player.loadFromSlot(slot)) {
      savesPanel.close(); setPaused(false);
      enterSpace('neon-haven');
      toast(`Loaded slot ${slot + 1}.`);
    }
  },
  onDelete: (slot) => { deleteSlot(savesPanel.store, slot); toast(`Deleted slot ${slot + 1}.`); },
});

const statsPanel = new StatsPanel({});
const controlsPanel = new ControlsPanel({});
const questPanel = new QuestPanel({});
const menu = new MenuScreen({
  onResume: () => setPaused(false),
  onSave: () => { player.save(); saveSettings(); toast('Quick-saved.'); },
  onSaves: () => savesPanel.open(player.activeSlot),
  onStats: () => statsPanel.open(player),
  onControls: () => controlsPanel.open(input),
  onJournal: () => questPanel.open(questLog),
  onQuit: () => { player.save(); saveSettings(); window.location.reload(); },
  onChange: applySetting,
});

// achievement unlocks → toast + chime (Player fires this once per achievement)
player.onUnlock = (a) => { audio.chime(); toast(`🏆 Achievement — ${a.name}: ${a.desc}`); };

// first-run onboarding (#14) — shown once on a fresh game, persists a done flag
const TUT_KEY = 'voidcorsair.tutorialDone';
const tutorialDone = () => { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; } };
const tutorial = new Tutorial({ onDone: () => { try { localStorage.setItem(TUT_KEY, '1'); } catch { /* ignore */ } } });

function enterSpace(worldId) {
  exitLook(); // space uses absolute mouse steering, not pointer lock
  space = new SpaceScene(input);
  space.active = started; // stays paused behind the title screen
  space.onEvent = (e) => {
    switch (e.type) {
      case 'fire': audio.laser(); tutorial.mark('fired'); break;
      case 'missile': audio.missile(); renderer.addShake(0.12); break;
      case 'dryFire': audio.blip(); break; // out of missiles
      case 'hit': break;
      case 'playerHit': audio.hit(); break;
      case 'kill': {
        audio.explosion();
        player.bumpStat('kills');
        awardXp(20 + (space?.combat?.wanted || 0) * 4);
        const q = questLog.onKill();
        const done = missionLog.recordKill();
        if (q.completed) { awardXp(120); toast(`Quest complete: ${q.quest.name} — +${q.reward.credits} cr`); }
        else if (done.length) {
          awardXp(50 * done.length);
          const sum = done.reduce((a, m) => a + m.reward, 0);
          toast(`Bounty contract complete — +${sum} cr`);
        } else if (q.advanced) toast(`Objective: ${questLog.objective()}`);
        else toast(`Target destroyed — bounty +${e.bounty} cr`);
        break;
      }
      case 'destroyed': audio.explosion(); player.bumpStat('deaths'); toast(`SHIP DESTROYED — emergency repair at Neon Haven (−${e.penalty} cr)`); break;
      case 'mined':
        audio.blip();
        if (e.ore > 0) {
          player.bumpStat('oreMined', e.ore);
          const qm = questLog.onMine(e.ore);
          if (qm.completed) { awardXp(120); toast(`Quest complete: ${qm.quest.name} — +${qm.reward.credits} cr`); }
          else toast(`⛏ Mined ${e.ore} Raw Ore${e.spilled ? ` (${e.spilled} lost — hold full)` : ''}`);
        } else if (e.spilled) toast('Cargo hold full — ore lost. Sell at a Market.');
        break;
      case 'bossSpawn': audio.warp(); renderer.addShake(0.6); toast(`⚠ WARLORD INBOUND — a pirate capital ship is hunting you!`); break;
      case 'bossKill':
        audio.explosion(); audio.chime(); renderer.addShake(1.2);
        player.bumpStat('bosses'); awardXp(200);
        toast(`★ WARLORD DESTROYED — bounty +${e.bounty} cr. The heat clears.`);
        break;
    }
  };
  scenes.switchTo(Mode.SPACE, space);
  if (worldId) space.travelTo(worldId);
  surface = null;
}

const starMap = new StarMap({
  onTravel: (worldId) => {
    if (!space) return;
    const w = WORLDS.find((x) => x.id === worldId);
    const dist = Math.hypot(space.ship.position.x - w.position[0], space.ship.position.y - w.position[1], space.ship.position.z - w.position[2]);
    const cost = fuelCost(dist);
    if (!player.canJump(cost)) {
      space.inputLocked = false; scenes.mode = Mode.SPACE;
      toast(`Not enough fuel for that jump (need ${cost}). Fly there manually or refuel.`);
      return;
    }
    player.spendFuel(cost);
    player.bumpStat('jumps');
    space.inputLocked = false;
    space.travelTo(worldId);
    scenes.mode = Mode.SPACE;
    audio.warp();
    toast(`Warping to ${w.name}… (−${cost} fuel)`);
    if (player.repOf(worldId) <= -20) setTimeout(() => maybeAmbush(worldId), 50);
  },
  // ✕ / backdrop tap closes the map (touch has no [M]/[Esc]) — return to flight
  onClose: () => { if (space) space.inputLocked = false; scenes.mode = Mode.SPACE; },
});

// --- transitions ---
function transition(midFn) {
  if (busy) return;
  busy = true;
  el.fade.classList.add('on');
  setTimeout(() => {
    midFn();
    el.fade.classList.remove('on');
    setTimeout(() => { busy = false; }, 460);
  }, 460);
}

// Landing on a station first plays a short cinematic dock (fly into the hull), then
// the normal land transition. Planets land immediately.
function land(world) {
  if (world.station && space && !space._dock) {
    exitLook();
    toast(`Docking with ${world.name}…`);
    space.startDock(world.id, () => doLand(world));
    return;
  }
  doLand(world);
}

function doLand(world) {
  const baseThreat = space?.combat?.wanted || 0;
  // faction standing shapes the welcome: allies shield you, hostile ports pile on
  const rep = player.repOf(world.id);
  let threat = baseThreat;
  if (rep >= 50) threat = Math.max(0, threat - 2);
  else if (rep <= -20) threat += 1;
  transition(() => {
    surface = new SurfaceScene(input, world, threat, questLog);
    surface.onEvent = (e) => {
      switch (e.type) {
        case 'blaster': audio.laser(); renderer.addShake(0.06); tutorial.mark('fired'); break; // recoil kick
        case 'playerHurt': audio.hit(); renderer.addShake(0.4); break;
        case 'enforcerDown': audio.explosion(); renderer.addShake(0.5); player.bumpStat('enforcers'); awardXp(15); toast(`Enforcer down — +${e.bounty} cr`); break;
        case 'captainSpawn': audio.warp(); renderer.addShake(0.5); toast(`⚠ ENFORCER CAPTAIN — a squad leader has joined the hunt!`); break;
        case 'captainDown': audio.explosion(); audio.chime(); renderer.addShake(0.9); player.bumpStat('captains'); awardXp(120); toast(`★ Enforcer Captain down — +${e.bounty} cr`); break;
        case 'playerDown': audio.explosion(); renderer.addShake(1.0); player.bumpStat('deaths'); toast(`You were downed — patched up (−${e.penalty} cr)`); break;
        case 'bark': toast(`“${e.line}”`); break; // ambient civilian chatter
      }
    };
    scenes.switchTo(Mode.SURFACE, surface);
    player.bumpStat('landings');
    // arriving with heat hurts your standing at this port
    if (baseThreat > 0) player.addRep(world.id, -10);
    // advance the living economy each time you make planetfall
    const news = tickMarket(WORLDS);

    // quest travel/arrival progress
    const q = questLog.onArrive(world.id);
    if (q.completed) { awardXp(120); player.addRep(world.id, 15); toast(`Quest complete: ${q.quest.name} — +${q.reward.credits} cr`); }
    else if (q.advanced) toast(`Objective: ${questLog.objective()}`);

    // customs scan: illegal cargo bound elsewhere can be seized at a secure port
    const seized = missionLog.runCustoms(world.id, world.security || 0, player.repOf(world.id));
    if (seized.length) {
      const fine = seized.length * 250;
      player.addCredits(-fine);
      player.addRep(world.id, -12);
      audio.hit(); renderer.addShake(0.4);
      toast(`⚠ Customs seized your contraband — fined ${fine} cr and a black mark.`);
    }

    // wanted-level customs: arriving hot can get you fined for your heat alone
    const heatFine = customsHeatStop(world.security || 0, baseThreat, player.repOf(world.id));
    if (heatFine > 0) {
      player.addCredits(-heatFine);
      player.addRep(world.id, -8);
      audio.hit(); renderer.addShake(0.3);
      toast(`⚠ Customs flagged your record — detained and fined ${heatFine} cr.`);
    }

    const done = missionLog.arriveAt(world.id);
    if (done.length) {
      player.bumpStat('deliveries', done.length);
      player.addRep(world.id, 6 * done.length); // honest work earns standing
      awardXp(30 * done.length);
      const sum = done.reduce((a, m) => a + m.reward, 0);
      toast(`Delivered ${done.length} job(s) at ${world.name} — +${sum} cr`);
    }
    if (threat > 0) {
      toast(`Heat ${threat}★ — Enforcers are hunting you here! [J] blaster`);
    } else if (!done.length && news) {
      toast(`NEWS: ${commodityLabel(news)}`);
    } else if (!done.length) {
      toast(`Touchdown — ${world.name}. [E] interact · [T] take off`);
    }
  });
}

function talkToGiver(world) {
  const giver = surface.questGiver;
  if (!giver) return;
  const lines = questLog.dialogueFor(giver.npc, world.id);
  surface.inputLocked = true;
  exitLook();
  audio.blip();
  dialogue.open(giver.name.toUpperCase(), lines, () => {
    const r = questLog.talk(giver.npc, world.id);
    if (r.completed) {
      audio.warp(); awardXp(120); player.addRep(world.id, 15);
      toast(`Quest complete: ${r.quest.name} — +${r.reward.credits} cr`);
    } else if (r.advanced) toast(`Objective: ${questLog.objective()}`);
  });
  panel = dialogue;
}

// Surface E: the quest-giver still talks outside; every other vendor is now a building
// you step into.
function openInteract(world, kind) {
  tutorial.mark('interacted');
  if (kind === 'quest') { talkToGiver(world); return; }
  // station vendors are counters right in the concourse; planet vendors are buildings
  if (surface && surface.isStation) { openVendorPanel(kind, world, surface); return; }
  enterBuilding(kind, world);
}

// Open a vendor's panel, locking whichever on-foot scene is active (surface or interior).
function openVendorPanel(kind, world, scene) {
  scene.inputLocked = true;
  exitLook();
  audio.blip();
  if (kind === 'shop') { shop.open(player); panel = shop; }
  else if (kind === 'market') { market.open(player, world); panel = market; }
  else if (kind === 'shipyard') { shipyard.open(player); panel = shipyard; }
  else if (kind === 'armory') { armory.open(player); panel = armory; }
  else if (kind === 'informant') { dialogue.open('INFORMANT', rumorLines(world), () => {}); panel = dialogue; }
  else {
    const offers = offersByWorld[world.id] || (offersByWorld[world.id] = generateOffers(world.id));
    missionBoard.open(player, missionLog, offers);
    panel = missionBoard;
  }
}

// Step into a building interior. The surface scene stays loaded behind us (not
// disposed) so returning is instant and keeps you right where you left off.
function enterBuilding(kind, world) {
  if (busy) return;
  exitLook();
  transition(() => {
    interior = new InteriorScene(input, kind, world, questLog);
    interior.onEvent = (e) => { if (e.type === 'bark') toast(`“${e.line}”`); };
    scenes.switchTo(Mode.INTERIOR, interior, false); // keep surface alive
    audio.blip();
    toast(`${interior.title} — [E] at the counter, [E] at the door to leave.`);
  });
}

function exitBuilding() {
  if (busy || !surface) return;
  const w = interior?.world;
  transition(() => {
    scenes.switchTo(Mode.SURFACE, surface); // disposes the interior, restores the surface
    interior = null;
    if (w) toast(`Back on ${w.name}.`);
  });
}

// Interior E: the door takes you back outside, the counter opens the vendor panel.
function openInteractInterior(id) {
  if (id === 'exit') { exitBuilding(); return; }
  tutorial.mark('interacted');
  openVendorPanel(id, interior.world, interior);
}

function takeoff(world) {
  tutorial.mark('tookOff');
  transition(() => {
    enterSpace(world.id);
    if (!maybeAmbush(world.id)) toast(`Lifting off from ${world.name}.`);
  });
}

// Hostile ports scramble fighters when you arrive/depart. Returns true if it fired.
function maybeAmbush(worldId) {
  const rep = player.repOf(worldId);
  if (rep > -20 || !space || !space.combat) return false;
  const n = 2 + Math.floor(-rep / 30);
  space.combat.ambush(n);
  const w = WORLDS.find((x) => x.id === worldId);
  audio.warp();
  toast(`⚠ Ambush! ${w ? w.name : 'The locals'} scrambled ${n} fighters after you.`);
  return true;
}

// Flavor + a useful market tip for the named Informant NPC.
function rumorLines(world) {
  const lines = [`"Welcome to ${world.name}. ${world.blurb}"`];
  const evs = activeEvents();
  const tip = evs.find((e) => e.world !== world.id) || evs[0];
  if (tip) {
    const cw = WORLDS.find((x) => x.id === tip.world)?.name || tip.world;
    const cn = commodityById(tip.commodity)?.name || tip.commodity;
    lines.push(tip.kind === 'shortage'
      ? `"Word is ${cn} is scarce on ${cw} — haul some there and you'll clean up."`
      : `"There's a ${cn} glut on ${cw}. Buy cheap there before it recovers."`);
  } else {
    lines.push('"Markets are quiet. Run a delivery or hunt a bounty to make rent."');
  }
  lines.push('"Keep your nose clean and the Enforcers off your tail."');
  return lines;
}

function commodityLabel(ev) {
  const w = WORLDS.find((x) => x.id === ev.world)?.name || ev.world;
  const name = commodityById(ev.commodity)?.name || ev.commodity;
  return `${ev.kind === 'shortage' ? '▲' : '▼'} ${name} ${ev.kind} on ${w}`;
}

let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  toastTimer = 2.4;
}

// --- UI / mode keys (single-press) ---
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || busy) return;

  // settings toggles work anytime
  if (e.code === 'KeyB') { applySetting('bloom', !settings.bloom); toast(`Bloom ${settings.bloom ? 'on' : 'off'}`); if (menu.isOpen) menu.open(settings); return; }
  if (e.code === 'KeyP') { settings.muted = audio.toggleMute(); saveSettings(); toast(`Sound ${settings.muted ? 'off' : 'on'}`); return; }

  if (!started) return; // title screen owns input until launch

  // saves manager / records sit above the pause menu
  if (savesPanel.isOpen) { if (e.code === 'Escape') savesPanel.close(); return; }
  if (statsPanel.isOpen) { if (e.code === 'Escape') statsPanel.close(); return; }
  if (controlsPanel.isOpen) { if (e.code === 'Escape' && !controlsPanel.capturing) controlsPanel.close(); return; }
  if (questPanel.isOpen) { if (e.code === 'Escape') questPanel.close(); return; }
  // pause menu owns input while open
  if (menu.isOpen) { if (e.code === 'Escape') setPaused(false); return; }

  // a DOM panel grabs E/Esc to close
  if (panel) {
    if (e.code === 'KeyE' || e.code === 'Escape') { panel.close(); e.preventDefault(); }
    return;
  }

  switch (e.code) {
    case 'KeyM':
      if (scenes.mode !== Mode.SPACE && !starMap.isOpen) break; // map is space-only
      if (starMap.isOpen) {
        starMap.close(); space.inputLocked = false; scenes.mode = Mode.SPACE;
      } else if (space) {
        const dest = new Set(missionLog.active.filter((m) => m.type === 'delivery').map((m) => m.to));
        const cur = questLog.currentStep();
        if (cur && cur.type === 'travel') dest.add(cur.world);
        starMap.open(WORLDS, space.ship.position, {
          shipForward: space.ship.forward(),
          missionDest: dest,
          events: activeEvents(),
          fuel: player.fuel,
        });
        space.inputLocked = true; scenes.mode = Mode.MAP;
        tutorial.mark('mapOpen');
      }
      e.preventDefault();
      break;
    case 'Escape':
      if (starMap.isOpen) { starMap.close(); space.inputLocked = false; scenes.mode = Mode.SPACE; }
      else setPaused(true);
      break;
    case 'KeyF':
      if (scenes.mode === Mode.SPACE && space && space.approach) land(space.approach.world);
      break;
    case 'KeyT':
      if (scenes.mode === Mode.SURFACE && surface && surface.hud?.nearShip) takeoff(surface.world);
      break;
    case 'KeyE':
      if (scenes.mode === Mode.SURFACE && surface?.hud?.interact) {
        openInteract(surface.world, surface.hud.interact.id);
      } else if (scenes.mode === Mode.INTERIOR && interior?.hud?.interact) {
        openInteractInterior(interior.hud.interact.id);
      }
      break;
    case 'KeyK':
      if (scenes.mode === Mode.SPACE || scenes.mode === Mode.SURFACE) openSkills();
      break;
    default:
      if (starMap.isOpen && /^Digit[1-9]$/.test(e.code)) {
        starMap.select(Number(e.code.slice(5)) - 1);
        e.preventDefault();
      }
  }
});

// --- on-foot mouse-look pointer lock (FPS-style, click to capture) ---
// Capturing the pointer lets the mouse turn/aim continuously with no edge limit and
// hides the OS cursor so only the center reticle shows. Click the view to engage;
// Esc (or opening any UI) releases it.
const canvas = renderer.three.domElement;
let pointerLocked = false;
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
function requestLook() {
  if (pointerLocked) return;
  if (!started || busy || paused || panel || menu.isOpen || savesPanel.isOpen || starMap.isOpen) return;
  if (scenes.mode !== Mode.SURFACE) return; // space uses absolute cursor steering
  if (!input.mouseFlight) return;
  canvas.requestPointerLock?.();
}
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) requestLook(); });

// --- radar scanner ---
const radarCtx = el.radar.getContext('2d');
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
let radarSweep = 0;
function drawRadar(blips) {
  const ctx = radarCtx;
  const W = el.radar.width, H = el.radar.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 6;
  ctx.clearRect(0, 0, W, H);

  // dish
  ctx.fillStyle = 'rgba(8,16,28,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,200,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,200,255,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();

  // sweep line
  radarSweep = (radarSweep + 0.12) % (Math.PI * 2);
  ctx.strokeStyle = 'rgba(120,255,180,0.35)';
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(radarSweep) * R, cy - Math.cos(radarSweep) * R); ctx.stroke();

  // blips (forward = up → screen -y)
  for (const b of blips || []) {
    const px = cx + b.x * R;
    const py = cy + b.y * R;
    ctx.globalAlpha = b.far ? 0.5 : 1;
    ctx.fillStyle = hex(b.color);
    ctx.beginPath();
    ctx.arc(px, py, b.type === 'enemy' ? 2.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // own ship at center
  ctx.fillStyle = '#dff1ff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 5); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx + 4, cy + 4);
  ctx.closePath(); ctx.fill();
}

// --- follow markers / waypoints (screen-space, edge-clamped) ---
const markersCtx = el.markers.getContext('2d');
const _proj = new THREE.Vector3();
const fmtDist = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)}k` : `${Math.round(d)}`);

function diamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
  ctx.closePath(); ctx.stroke();
}
function chevron(ctx, x, y, ang, r) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, r * 0.7); ctx.lineTo(-r * 0.7, -r * 0.7);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function clearMarkers() {
  const W = window.innerWidth, H = window.innerHeight;
  if (el.markers.width !== W || el.markers.height !== H) { el.markers.width = W; el.markers.height = H; }
  markersCtx.clearRect(0, 0, W, H);
}

function drawMarkers(targets) {
  const W = window.innerWidth, H = window.innerHeight;
  if (el.markers.width !== W || el.markers.height !== H) { el.markers.width = W; el.markers.height = H; }
  const ctx = markersCtx; ctx.clearRect(0, 0, W, H);
  const cam = renderer.camera; const cx = W / 2, cy = H / 2, margin = 48;

  for (const t of targets) {
    _proj.copy(t.pos).project(cam);
    const behind = _proj.z > 1;
    const onScreen = !behind && _proj.x >= -1 && _proj.x <= 1 && _proj.y >= -1 && _proj.y <= 1;
    const col = hex(t.color);
    const dtxt = t.dist != null ? fmtDist(t.dist) : '';
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.font = '12px Consolas, ui-monospace, monospace'; ctx.textAlign = 'center';

    if (onScreen) {
      const x = (_proj.x * 0.5 + 0.5) * W, y = (-_proj.y * 0.5 + 0.5) * H;
      ctx.globalAlpha = t.priority ? 1 : 0.75;
      diamond(ctx, x, y, t.priority ? 7 : 5);
      ctx.fillText(dtxt ? `${t.label}  ${dtxt}` : t.label, x, y - 12);
    } else {
      let dx = _proj.x, dy = _proj.y; if (behind) { dx = -dx; dy = -dy; }
      const ang = Math.atan2(-dy, dx);
      const ex = Math.cos(ang), ey = Math.sin(ang);
      const scale = Math.min((W / 2 - margin) / Math.abs(ex || 1e-3), (H / 2 - margin) / Math.abs(ey || 1e-3));
      const px = cx + ex * scale, py = cy + ey * scale;
      ctx.globalAlpha = t.priority ? 0.95 : 0.55;
      chevron(ctx, px, py, ang, 9);
      ctx.fillText(t.label, px - ex * 24, py - ey * 16);
    }
  }
  ctx.globalAlpha = 1;
}

// Active-mission guidance for the HUD: delivery destinations (with live distance in
// space) and bounty progress. Empty string when there's nothing to track.
function renderMissionGuidance() {
  const ms = missionLog.active;
  if (!ms.length) return '';
  const shipPos = (scenes.mode === Mode.SPACE && space) ? space.ship.position : null;
  return ms.map((m) => {
    if (m.type === 'delivery') {
      const w = WORLDS.find((x) => x.id === m.to);
      let d = '';
      if (shipPos && w) d = ` · ${fmtDist(Math.hypot(shipPos.x - w.position[0], shipPos.y - w.position[1], shipPos.z - w.position[2]))}`;
      return `▸ ${m.cargo} → ${m.toName}${d}`;
    }
    let hint = '';
    if (shipPos && space && space.combat && space.combat.enemies.length) {
      let best = Infinity;
      for (const e of space.combat.enemies) best = Math.min(best, e.mesh.position.distanceToSquared(shipPos));
      hint = ` · nearest ${fmtDist(Math.sqrt(best))}`;
    } else if (shipPos) {
      hint = ' · no hostiles — raise heat';
    }
    return `<span class="bty">▸ Bounty ${m.progress || 0}/${m.target} raiders${hint}</span>`;
  }).join('');
}

function updateMarkers() {
  if (!started || panel || starMap.isOpen) { clearMarkers(); return; }
  const targets = [];
  if (scenes.mode === Mode.SPACE && space) {
    const ship = space.ship.position;
    const dest = new Set(missionLog.active.filter((m) => m.type === 'delivery').map((m) => m.to));
    const cur = questLog.currentStep();
    const questWorld = cur && cur.type === 'travel' ? cur.world : null;
    for (const p of space.planets) {
      const w = p.userData.world;
      const isM = dest.has(w.id);
      const isQ = w.id === questWorld;
      const label = isM ? `◈ ${w.name}` : isQ ? `✦ ${w.name}` : w.name;
      const color = isM ? 0x9effa0 : isQ ? 0xffd24a : w.atmo;
      targets.push({ pos: p.position, label, color, dist: p.position.distanceTo(ship), priority: isM || isQ });
    }
    // bounty waypoint: flag the nearest hostile while a bounty contract is open
    const bty = missionLog.active.find((m) => m.type === 'bounty');
    if (bty && space.combat && space.combat.enemies.length) {
      let near = null, best = Infinity;
      for (const e of space.combat.enemies) {
        const d = e.mesh.position.distanceToSquared(ship);
        if (d < best) { best = d; near = e; }
      }
      if (near) {
        const tag = near.isBoss ? '☠ Warlord' : `☠ Bounty ${bty.progress || 0}/${bty.target}`;
        targets.push({ pos: near.mesh.position, label: tag, color: 0xff5b6e, dist: Math.sqrt(best), priority: true });
      }
    }
  } else if (scenes.mode === Mode.SURFACE && surface) {
    const ch = surface.character.position;
    for (const it of surface.interactables) {
      targets.push({ pos: new THREE.Vector3(it.position.x, it.baseY || 4, it.position.z), label: it.label, color: it.color, dist: Math.hypot(ch.x - it.position.x, ch.z - it.position.z) });
    }
    targets.push({ pos: new THREE.Vector3(0, 4, 0), label: 'Your Ship', color: 0xffffff, dist: Math.hypot(ch.x, ch.z), priority: true });
  } else { clearMarkers(); return; }
  drawMarkers(targets);
}

// --- surface minimap (top-down, north-up) ---
const miniCtx = el.minimap.getContext('2d');
const TAU = Math.PI * 2;
function drawMinimap(s) {
  const W = el.minimap.width, H = el.minimap.height, ctx = miniCtx;
  const R = 130, sx = W / (2 * R), sz = H / (2 * R), cx = W / 2, cy = H / 2;
  const px = (x) => cx + x * sx, py = (z) => cy + z * sz;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8,16,28,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80,200,255,0.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.fillStyle = 'rgba(120,150,200,0.32)';
  for (const c of s.colliders || []) ctx.fillRect(px(c.min.x), py(c.min.z), (c.max.x - c.min.x) * sx, (c.max.z - c.min.z) * sz);

  ctx.strokeStyle = '#66e0ff'; ctx.beginPath(); ctx.arc(px(0), py(0), 11 * sx, 0, TAU); ctx.stroke();

  for (const a of s.ambient || []) { ctx.fillStyle = 'rgba(180,180,205,0.55)'; ctx.beginPath(); ctx.arc(px(a.npc.position.x), py(a.npc.position.z), 1.6, 0, TAU); ctx.fill(); }
  for (const it of s.interactables || []) { ctx.fillStyle = hex(it.color); ctx.beginPath(); ctx.arc(px(it.position.x), py(it.position.z), 3, 0, TAU); ctx.fill(); }
  for (const e of (s.ground?.enemies || [])) {
    const cap = e.isBoss;
    ctx.fillStyle = cap ? '#ffd24a' : '#ff5b6e';
    ctx.beginPath(); ctx.arc(px(e.mesh.position.x), py(e.mesh.position.z), cap ? 4 : 2.5, 0, TAU); ctx.fill();
  }

  // player arrow (forward = (sin h, cos h))
  const c = s.character, h = c.heading, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
  const ax = px(c.position.x), ay = py(c.position.z);
  ctx.fillStyle = '#dff1ff'; ctx.beginPath();
  ctx.moveTo(ax + fx * 6, ay + fz * 6);
  ctx.lineTo(ax - fx * 4 + rx * 4, ay - fz * 4 + rz * 4);
  ctx.lineTo(ax - fx * 4 - rx * 4, ay - fz * 4 - rz * 4);
  ctx.closePath(); ctx.fill();
}

// --- HUD ---
let hudTimer = 0;
function renderHud() {
  el.mode.textContent = `MODE: ${scenes.mode}`;
  el.fps.textContent = `${loop.fps} fps`;
  el.credits.textContent = `${player.credits} cr`;
  const xn = player.xpToNext();
  const xb = Math.round((player.xp / xn) * 10);
  el.xp.textContent = `LV ${player.xpLevel} [${'█'.repeat(xb)}${'·'.repeat(10 - xb)}]${player.skillPoints ? ` ${player.skillPoints}pt` : ''}`;
  const obj = questLog.objective();
  el.quest.textContent = obj ? `◈ ${obj}` : '';
  el.missions.innerHTML = renderMissionGuidance();
  const h = scenes.current?.hud;
  if (!h) { el.reticle.classList.remove('show'); el.bossBar.classList.remove('show'); return; }
  el.reticle.classList.toggle('show', !!h.onFoot);

  // boss health bar — space Warlord or on-foot Enforcer Captain
  const boss = (!h.onFoot && h.combat && h.combat.boss) ? h.combat.boss
    : (h.onFoot && h.ground && h.ground.boss ? h.ground.boss : null);
  el.bossBar.classList.toggle('show', !!boss);
  if (boss) { el.bossLabel.textContent = boss.name; el.bossFill.style.width = `${Math.round((100 * boss.hp) / boss.maxHp)}%`; }

  if (h.onFoot) {
    el.throttle.textContent = `◈ ${h.world.name}`;
    el.speed.textContent = h.world.theme;
    el.radar.classList.remove('show');
    if (surface && scenes.mode === Mode.SURFACE) { el.minimap.classList.add('show'); drawMinimap(surface); }
    else el.minimap.classList.remove('show');
    const gr = h.ground;
    if (gr && (gr.hp < gr.maxHp || gr.enemies > 0)) {
      const k = Math.round(clamp01(gr.hp / gr.maxHp) * 12);
      el.combat.innerHTML =
        `<div class="hl">HP  [${'█'.repeat(k)}${'·'.repeat(12 - k)}] ${Math.round(gr.hp)}</div>` +
        (gr.enemies ? `<div class="hl">⚠ ${gr.enemies} enforcer${gr.enemies > 1 ? 's' : ''}</div>` : '');
    } else {
      el.combat.innerHTML = '';
    }
    if (h.interact) {
      el.approach.innerHTML = `▸ Press <b>E</b> — ${h.interact.label}`;
      el.approach.classList.add('show');
    } else if (h.nearShip) {
      el.approach.innerHTML = `▸ At your ship — press <b>T</b> to take off`;
      el.approach.classList.add('show');
    } else {
      el.approach.innerHTML = pointerLocked
        ? `<span class="lo">Mouse aims the reticle (L/R turn, up/down tilt) · [W/S] walk · [J/click] fire · [E] interact · [T] take off · [Esc] free cursor</span>`
        : `<span class="lo">▸ <b>Click</b> to capture the mouse and aim · [W/S] walk · [E] interact · [T] take off</span>`;
      el.approach.classList.add('show');
    }
  } else {
    const pct = Math.round(h.throttle * 100);
    const bars = Math.round(h.throttle * 16);
    el.throttle.textContent = `THR [${'█'.repeat(bars)}${'·'.repeat(16 - bars)}] ${pct}%`;
    el.speed.textContent = `SPD ${Math.round(h.speed)} u/s`;

    el.minimap.classList.remove('show');
    if (h.radar) { el.radar.classList.add('show'); drawRadar(h.radar); }
    else el.radar.classList.remove('show');

    const c = h.combat;
    if (c) {
      const bar = (v, max, n = 10) => {
        const k = Math.round(clamp01(v / max) * n);
        return '█'.repeat(k) + '·'.repeat(n - k);
      };
      const stars = '★'.repeat(c.wanted) + '☆'.repeat(5 - c.wanted);
      el.combat.innerHTML =
        `<div class="sh">SHD [${bar(c.shield, c.maxShield)}] ${Math.round(c.shield)}</div>` +
        `<div class="hl">HUL [${bar(c.hull, c.maxHull)}] ${Math.round(c.hull)}</div>` +
        `<div style="color:#9effa0">FUE [${bar(player.fuel, player.maxFuel)}] ${Math.round(player.fuel)}</div>` +
        `<div style="color:#ffd24a">MSL ${'◆'.repeat(c.missiles)}${'◇'.repeat(Math.max(0, c.maxMissiles - c.missiles))} ${c.missiles}/${c.maxMissiles}</div>` +
        `<div class="wanted">WANTED ${stars}</div>` +
        (c.wingman ? `<div style="color:#8effa0">✦ Wingman on your wing</div>` : '') +
        (c.enemies ? `<div class="hl">⚠ ${c.enemies} hostile${c.enemies > 1 ? 's' : ''}</div>` : '');
    }

    if (h.approach && !starMap.isOpen) {
      el.approach.innerHTML =
        `▸ APPROACH: <b>${h.approach.world.name}</b> — press <b>F</b> to land` +
        `<div class="lo">${h.approach.world.blurb}</div>`;
      el.approach.classList.add('show');
    } else {
      el.approach.classList.remove('show');
    }
  }
}

const loop = new GameLoop({
  update: (dt) => {
    input.pollGamepad(); // sample gamepad before sim + menu (works while paused too)
    if (paused) return; // freeze the sim; render keeps drawing the last frame
    scenes.update(dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.remove('show');
    }
    updateMarkers();
    if (tutorial.active) tutorial.update({ mode: scenes.mode, speed: scenes.current?.hud?.speed || 0 });
    hudTimer += dt;
    if (hudTimer >= 0.12) { hudTimer = 0; renderHud(); }
  },
  render: () => renderer.render(),
});

// apply persisted settings, blip on shop/mission changes
renderer.setBloom(settings.bloom);
renderer.setQuality(settings.quality);
audio.setVolumes(settings);
audio.setMuted(settings.muted);
input.mouseFlight = settings.mouseFlight;
shop.onChange = () => audio.blip();
missionBoard.onChange = () => audio.blip();
market.onChange = () => audio.blip();
// selling can advance a quest 'sell' step (e.g. fencing spice on Neon Haven)
market.onSell = (commodityId, qty, worldId) => {
  const r = questLog.onSell(commodityId, qty, worldId);
  if (r.completed) { awardXp(120); player.addRep(worldId, 10); toast(`Quest complete: ${r.quest.name} — +${r.reward.credits} cr`); }
  else if (r.advanced) toast(`Objective: ${questLog.objective()}`);
};

// touch controls (shown on touch devices)
const touch = new TouchControls(input, { getMode: () => scenes.mode });
touch.autoEnable();

enterSpace();        // live backdrop behind the title
loop.start();

// load the 3D models (ships + character) in the background; swap the live ship once ready
preloadModels().then(() => { if (space && space.ship) space.ship.refreshVisual(); });

// title screen gates the start
const titleScreen = new TitleScreen({
  hasSave: player.hasSave(),
  onStart: (isNew) => {
    if (isNew) {
      // start a fresh game in an empty slot so existing saves aren't clobbered
      player.reset(player.store ? firstEmptySlot(player.store) : 0);
      for (const k of Object.keys(offersByWorld)) delete offersByWorld[k];
    }
    started = true;
    enterSpace('neon-haven'); // fresh scene applies current ship stats; sets active
    audio.resume();
    audio.startMusic();
    toast(isNew ? 'New game — fly safe out there, Corsair.' : 'Welcome back, Corsair.');
    if (isNew && !tutorialDone()) tutorial.start(); // guided first-run onboarding
  },
});

requestAnimationFrame(() => {
  el.loading.classList.add('hidden');
  window.__VOID_CORSAIR_READY__ = true;
});

window.__VC__ = {
  renderer, scenes, loop, input, starMap, audio, titleScreen, menu, savesPanel, touch,
  player, missionLog, questLog, shop, missionBoard, market, dialogue, skills, shipyard, armory, statsPanel, tutorial, controlsPanel, questPanel,
  start: (isNew = false) => titleScreen.start(isNew),
  get space() { return space; },
  get surface() { return surface; },
  get interior() { return interior; },
  land, takeoff, enterBuilding, exitBuilding,
  // test/debug helper: open a vendor panel directly on the active on-foot scene
  openVendor: (kind) => { const sc = interior || surface; if (sc) openVendorPanel(kind, sc.world, sc); },
};
