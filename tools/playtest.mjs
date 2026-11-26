// Storm Runner 30 s keyboard play-test (NOT part of the shipped repo).
// Serves game/ on loopback, clicks through title -> campaign -> M1,
// flies 30 s with the keyboard, samples flight state, then dives for the
// ground to prove the crash path. Fails on any page error, console error,
// or non-loopback request. Usage: node tools/playtest.mjs
import { chromium } from "../../../../token-radar-01/tools/playwright-core/index.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gameDir = join(root, "game");
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split("?")[0]);
  const file = join(gameDir, path === "/" ? "index.html" : path);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const exe = process.env.HOME + "/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const badRequests = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("request", (req) => {
  const url = req.url();
  if (!url.startsWith("http://127.0.0.1") && !url.startsWith("data:") && !url.startsWith("blob:")) badRequests.push(url);
});

function fail(msg) { console.error("PLAYTEST FAIL: " + msg); process.exit(1); }
const state = () => page.evaluate(() => {
  const s = window.__stormRunner;
  const p = s.plane;
  return p ? { screen: s.screen, x: p.x, y: p.y, z: p.z, speed: p.speed, fuel: p.fuel, heading: p.heading, crashed: p.crashed, landed: p.landed, damage: p.damage, flown: p.distanceFlown } : { screen: s.screen };
});

await page.goto(`http://127.0.0.1:${port}/index.html?seed=1234`, { waitUntil: "load" });
await page.waitForTimeout(800);
let s = await state();
console.log("title screen:", s.screen);
if (s.screen !== "title") fail("expected title screen, got " + s.screen);
// Click FLY — CAMPAIGN (centre 640, 378).
await page.mouse.click(640, 378);
await page.waitForTimeout(400);
s = await state();
console.log("after FLY click:", s.screen);
if (s.screen !== "regions") fail("expected regions screen, got " + s.screen);
// Click M1 row (centre 640, 178).
await page.mouse.click(640, 178);
await page.waitForTimeout(400);
s = await state();
console.log("after M1 click:", s.screen, JSON.stringify(s));
if (s.screen !== "play" || !s.x) fail("expected play screen with a plane");

// Fly 30 s: full throttle, gentle turns and pitch.
await page.keyboard.down("Shift");
await page.keyboard.down("d");
const samples = [];
for (let i = 0; i < 30; i += 1) {
  await page.waitForTimeout(1000);
  if (i === 10) { await page.keyboard.up("d"); await page.keyboard.down("a"); }
  if (i === 20) { await page.keyboard.up("a"); await page.keyboard.down("w"); }
  samples.push(await state());
}
await page.keyboard.up("Shift");
await page.keyboard.up("w");
const first = samples[0];
const last = samples[samples.length - 1];
console.log("t=1s:", JSON.stringify(first));
console.log("t=30s:", JSON.stringify(last));
const moved = last.flown - first.flown;
console.log("distance flown in 29 s:", Math.round(moved), "m");
if (moved < 1000) fail("plane barely moved in 30 s: " + moved + " m");
if (!(last.fuel < first.fuel)) fail("fuel did not decrease");
if (Math.abs(last.heading - first.heading) < 0.05) fail("heading never changed");
if (last.crashed) fail("plane crashed during level flight");

// Dive for the ground to prove the crash path.
await page.keyboard.down("s");
let crashed = false;
for (let i = 0; i < 40; i += 1) {
  await page.waitForTimeout(1000);
  s = await state();
  if (s.crashed || s.screen === "over" || s.landed) { crashed = true; console.log("end state after dive:", JSON.stringify(s)); break; }
}
await page.keyboard.up("s");
if (!crashed) fail("no crash/landing after 40 s diving");
console.log("crash/landing path reached:", s.screen);

await browser.close();
server.close();
if (badRequests.length) { console.error("NON-LOCAL REQUESTS:\n" + badRequests.join("\n")); process.exit(1); }
if (errors.length) { console.error("PAGE ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("playtest: PASS — 30 s flight, fuel burn, turns, crash path, no errors");
