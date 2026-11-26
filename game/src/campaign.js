// Storm Runner — campaign "Tempest Season": region unlocks, stars, storm
// credits and hangar upgrades, saved in localStorage so progress survives
// between visits.
import { SAVE_KEY, UPGRADES } from './config.js';
import { MISSION_DEFS } from './missions.js';

export function blankSave() {
  return {
    unlockedMissions: ['M1'],
    stars: {},
    credits: 0,
    upgrades: { fuel: 0, engine: 0, hull: 0, rod: 0 },
    best: {},
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return blankSave();
    const data = JSON.parse(raw);
    const save = blankSave();
    if (Array.isArray(data.unlockedMissions)) save.unlockedMissions = data.unlockedMissions;
    if (data.stars && typeof data.stars === 'object') save.stars = data.stars;
    if (typeof data.credits === 'number') save.credits = data.credits;
    if (data.upgrades && typeof data.upgrades === 'object') {
      for (const k of Object.keys(save.upgrades)) {
        if (typeof data.upgrades[k] === 'number') save.upgrades[k] = Math.max(0, Math.min(3, data.upgrades[k]));
      }
    }
    if (data.best && typeof data.best === 'object') save.best = data.best;
    return save;
  } catch {
    return blankSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

// Award for finishing a mission: stars, credits, and unlock the next one.
export function awardMission(save, missionId, stars, elapsed) {
  const def = MISSION_DEFS.find((m) => m.id === missionId);
  if (!def) return 0;
  const prev = save.stars[missionId] || 0;
  save.stars[missionId] = Math.max(prev, stars);
  const credits = 60 + stars * 40 + Math.max(0, Math.round((def.par - elapsed) / 10)) * 2;
  save.credits += credits;
  if (!save.best[missionId] || elapsed < save.best[missionId]) save.best[missionId] = Math.round(elapsed);
  const idx = MISSION_DEFS.findIndex((m) => m.id === missionId);
  if (idx >= 0 && idx + 1 < MISSION_DEFS.length) {
    const next = MISSION_DEFS[idx + 1].id;
    if (!save.unlockedMissions.includes(next)) save.unlockedMissions.push(next);
  }
  storeSave(save);
  return credits;
}

export function upgradeCost(save, key) {
  const level = save.upgrades[key] || 0;
  if (level >= 3) return null;
  return UPGRADES[key].costs[level];
}

export function buyUpgrade(save, key) {
  const cost = upgradeCost(save, key);
  if (cost === null || save.credits < cost) return false;
  save.credits -= cost;
  save.upgrades[key] = (save.upgrades[key] || 0) + 1;
  storeSave(save);
  return true;
}

export function totalStars(save) {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
