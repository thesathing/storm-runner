// Storm Runner — tuning constants. One place for every number the flight
// model, weather and missions share, so a balance change never needs a hunt
// through the other files.
export const STEP = 1 / 60;
export const WORLD_SIZE = 5200; // metres, square world, centre at (0, 0)
export const SEA_LEVEL = 0;
export const SAVE_KEY = 'storm-runner-save-v1';

// Flight envelope (speeds in m/s, altitudes in m).
export const FLIGHT = {
  maxThrottle: 1,
  minSpeed: 0,
  cruiseSpeed: 62,
  maxSpeed: 96,
  stallSpeed: 27,
  accelPerThrottle: 26, // m/s^2 at full throttle
  drag: 0.16, // quadratic-ish drag coefficient
  diveAccel: 14, // extra speed gained diving
  climbCost: 11, // speed bled climbing
  pitchRate: 0.9, // rad/s at full deflection
  bankRate: 1.5, // rad/s
  turnRate: 0.72, // heading rad/s per rad of bank, scaled by speed
  sinkBelowStall: 9, // m/s sink when stalled
  gravity: 9.8,
  gearDrag: 0.05,
};

// Fuel and damage.
export const FUEL = {
  capacity: 100,
  burnFullThrottle: 0.34, // units/s at throttle 1
  burnIdle: 0.05,
  reserveWarning: 25,
};
export const DAMAGE = {
  lightningHit: 10,
  turbulencePerSec: 1.2,
  hardLanding: 26,
  crashVSpeed: 14, // m/s vertical speed that wrecks the plane on touchdown
  hardVSpeed: 8,
};

// World layout: three regions, each with its home strip.
export const REGIONS = [
  {
    id: 1, name: 'Calm Coast', seed: 1101,
    sky: ['#1b2a44', '#3a4a63', '#c98a4b'],
    home: { x: -900, z: 900, heading: -0.6 },
    strip: { x: -900, z: 900, heading: -0.6, length: 420, width: 34 },
  },
  {
    id: 2, name: 'Storm Front', seed: 2202,
    sky: ['#121826', '#26334a', '#8a6a3d'],
    home: { x: 700, z: -1100, heading: 2.4 },
    strip: { x: 700, z: -1100, heading: 2.4, length: 360, width: 30 },
  },
  {
    id: 3, name: 'Eye of the Tempest', seed: 3303,
    sky: ['#0e1420', '#1e2a3f', '#b07a35'],
    home: { x: 300, z: 300, heading: 0.0 },
    strip: { x: 300, z: 300, heading: 0.0, length: 380, width: 32 },
  },
];

// Hangar upgrades: cost in storm credits, effect per level (max 3).
export const UPGRADES = {
  fuel: { name: 'Fuel Tank', desc: '+25% fuel per level', costs: [120, 260, 480], apply: 0.25 },
  engine: { name: 'Engine', desc: '+12% thrust per level', costs: [150, 300, 520], apply: 0.12 },
  hull: { name: 'Hull', desc: '+20 max damage soak per level', costs: [140, 280, 500], apply: 20 },
  rod: { name: 'Lightning Rod', desc: '-30% lightning damage per level', costs: [160, 320, 560], apply: 0.30 },
};

export const BEST_KEY = 'storm-runner-best';
