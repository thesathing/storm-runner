// Storm Runner — boot and the one loop: input every frame, the world in
// fixed 1/60 s steps, and the renderer painting what is there. Screens:
// title, region select, hangar, play, paused, debrief, game over.
//
// ?seed=N fixes the world seed. ?shot=cover|rings|landing|campaign stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP, REGIONS } from './config.js';
import { createTerrain } from './terrain.js';
import { createWeather } from './weather.js';
import { createPlane, stepPlane, lightningStrike } from './flight-model.js';
import { createMission, currentTarget, stepMission, missionStars, MISSION_DEFS } from './missions.js';
import { loadSave, storeSave, awardMission, buyUpgrade } from './campaign.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_TITLE, SCREEN_REGIONS, SCREEN_HANGAR, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_DEBRIEF, SCREEN_OVER } from './render.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 100000);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
const save = loadSave();

let screen = SCREEN_TITLE;
let world = null;
let buttons = [];
let bannerTimer = 0;
let debrief = null;
let overReason = '';
let warnedLowFuel = false;
let warnedStall = false;

function announce(message) {
  status.textContent = message;
}

function stripTest(strip) {
  return (x, z) => {
    const dx = x - strip.x;
    const dz = z - strip.z;
    const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
    const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
    return Math.abs(along) < strip.length / 2 && Math.abs(across) < strip.width / 2 + 6;
  };
}

function startMission(missionId) {
  const def = MISSION_DEFS.find((m) => m.id === missionId);
  if (!def) return;
  const region = REGIONS.find((r) => r.id === def.region);
  const terrain = createTerrain(region.seed + seed);
  const weather = createWeather(region.seed + seed, region.id);
  const plane = createPlane(region, save.upgrades);
  const mission = createMission(def, region, terrain);
  mission.credits = save.credits;
  world = {
    terrain, weather, plane, mission, region,
    target: currentTarget(mission),
    banner: `${def.id} — ${def.name}: ${def.brief}`,
    seed,
  };
  bannerTimer = 5;
  screen = SCREEN_PLAY;
  audio.unlock();
  announce(`Mission ${def.id} ${def.name}. ${def.brief}`);
}

function finishMission(success) {
  const { mission, plane } = world;
  if (success) {
    const stars = missionStars(mission, plane);
    const credits = awardMission(save, mission.def.id, stars, mission.elapsed);
    mission.credits = save.credits;
    debrief = {
      title: 'SORTIE COMPLETE',
      line: `${mission.def.name} — well flown, storm chaser.`,
      stars, credits,
      elapsed: mission.elapsed,
      damage: (plane.damage / plane.damageMax) * 100,
      fuel: (plane.fuel / plane.fuelCap) * 100,
    };
    audio.land();
    screen = SCREEN_DEBRIEF;
    announce(`Mission complete. ${stars} stars, ${credits} credits.`);
  } else {
    overReason = plane.crashed
      ? 'The SR-7 went down in the storm.'
      : 'Out of fuel — the sortie is lost.';
    screen = SCREEN_OVER;
    announce(`Sortie lost. ${overReason}`);
  }
}

function stepWorld(dt) {
  const { terrain, weather, plane, mission, region } = world;
  const storm = weather.update(dt, plane);
  const gust = weather.gustAt(plane.x, plane.z, plane.time);
  if (weather.bolt && weather.bolt.near) {
    const dx = plane.x - weather.bolt.x;
    const dz = plane.z - weather.bolt.z;
    if (dx * dx + dz * dz < 160 * 160) {
      lightningStrike(plane);
      renderer.setShake(10);
      audio.thunder();
      world.banner = 'LIGHTNING STRIKE — check damage';
      bannerTimer = 2.5;
    } else {
      audio.thunder();
    }
  }
  const ctrl = input.read();
  const events = stepPlane(plane, ctrl, dt, terrain, gust, stripTest(region.strip));
  plane.dropRequested = false;
  if (events.event === 'landed' || events.event === 'rough-landing') {
    renderer.setShake(6);
    audio.land();
    world.banner = events.event === 'rough-landing' ? 'ROUGH LANDING — hull damage' : 'TOUCHDOWN';
    bannerTimer = 2.5;
  }
  if (events.event === 'crashed') {
    renderer.setShake(18);
    finishMission(false);
    return;
  }
  if (events.event === 'ditched') {
    world.banner = 'DITCHED IN THE SEA — sortie failed';
    bannerTimer = 2;
    finishMission(false);
    return;
  }
  const result = stepMission(mission, plane, dt, terrain, stripTest(region.strip), (text) => {
    world.banner = text;
    bannerTimer = 2.5;
    audio.ring();
  });
  world.target = currentTarget(mission);
  if (result === 'complete') {
    finishMission(true);
    return;
  }
  if (result === 'failed') {
    finishMission(false);
    return;
  }
  // Warnings, once per dip.
  if (plane.fuel / plane.fuelCap < 0.25 && !warnedLowFuel) {
    warnedLowFuel = true;
    audio.warning();
  }
  if (plane.fuel / plane.fuelCap >= 0.3) warnedLowFuel = false;
  if (plane.speed < 30 && plane.y > 10 && !warnedStall) {
    warnedStall = true;
    audio.warning();
  }
  if (plane.speed >= 34) warnedStall = false;
  audio.setEngine(plane.throttle, plane.speed, storm);
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) world.banner = '';
  }
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & input.ACTION_PAUSE) {
    if (screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }
  if (actions & input.ACTION_GEAR) {
    if (world && world.plane && screen === SCREEN_PLAY) {
      world.plane.gearDown = !world.plane.gearDown;
      world.banner = world.plane.gearDown ? 'GEAR DOWN' : 'GEAR UP';
      bannerTimer = 1.5;
    }
  }
  if (actions & input.ACTION_DROP) {
    if (world && world.plane && screen === SCREEN_PLAY) world.plane.dropRequested = true;
  }
  if (actions & input.ACTION_CONFIRM) {
    if (screen === SCREEN_TITLE) screen = SCREEN_REGIONS;
    else if (screen === SCREEN_DEBRIEF || screen === SCREEN_OVER) screen = SCREEN_REGIONS;
    else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
  }
}

function clickButtonAt(x, y) {
  for (const b of buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function handleClick() {
  const click = input.takeClick();
  if (!click) return;
  const b = clickButtonAt(click.x, click.y);
  if (!b) return;
  audio.unlock();
  if (screen === SCREEN_TITLE) {
    if (b.label === 'FLY — CAMPAIGN') screen = SCREEN_REGIONS;
    else if (b.label === 'HANGAR — UPGRADES') screen = SCREEN_HANGAR;
  } else if (screen === SCREEN_REGIONS) {
    if (b.label === '← BACK') screen = SCREEN_TITLE;
    else if (b.label === 'HANGAR →') screen = SCREEN_HANGAR;
    else if (MISSION_DEFS.some((m) => m.id === b.label)) startMission(b.label);
  } else if (screen === SCREEN_HANGAR) {
    if (b.label === '← BACK') screen = SCREEN_REGIONS;
    else if (b.upgrade) {
      if (buyUpgrade(save, b.upgrade)) announce(`${b.upgrade} upgraded.`);
      else announce('Not enough storm credits.');
    }
  } else if (screen === SCREEN_DEBRIEF || screen === SCREEN_OVER) {
    screen = SCREEN_REGIONS;
  } else if (screen === SCREEN_PAUSED) {
    screen = SCREEN_PLAY;
  }
}

function draw() {
  if (screen === SCREEN_TITLE) buttons = renderer.drawTitle(save);
  else if (screen === SCREEN_REGIONS) buttons = renderer.drawRegions(save);
  else if (screen === SCREEN_HANGAR) buttons = renderer.drawHangar(save);
  else if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
    if (world) {
      renderer.drawPlay(world, world.plane.time);
      if (screen === SCREEN_PAUSED) buttons = renderer.drawPaused();
      else buttons = [];
    }
  } else if (screen === SCREEN_DEBRIEF) buttons = renderer.drawDebrief(debrief);
  else if (screen === SCREEN_OVER) buttons = renderer.drawGameOver(overReason);
}

function runShot(name) {
  const staged = stageShot(name);
  screen = staged.screen === 'play' ? SCREEN_PLAY : staged.screen === 'regions' ? SCREEN_REGIONS : SCREEN_TITLE;
  if (staged.world) {
    world = staged.world;
    world.banner = '';
    world.target = world.target || null;
  }
  const stagedSave = staged.save || save;
  let painted = 0;
  function paint() {
    if (screen === SCREEN_PLAY && world) renderer.drawPlay(world, world.plane.time);
    else if (screen === SCREEN_REGIONS) renderer.drawRegions(stagedSave);
    else renderer.drawTitle(stagedSave);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  announce('Storm Runner. Press Space or click to fly the campaign.');
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    if (screen === SCREEN_PLAY && world) {
      while (accumulator >= STEP) {
        stepWorld(STEP);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) { accumulator = 0; break; }
      }
    } else {
      accumulator = 0;
    }
    draw();
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
}

// Read-only debug hook for play-testing: the page's own state, exposed so
// an automated test can sample the plane without touching the game.
window.__stormRunner = {
  get screen() { return screen; },
  get plane() { return world ? world.plane : null; },
  get mission() { return world ? world.mission : null; },
  get save() { return save; },
};

if (shot) runShot(shot);
else runGame();
