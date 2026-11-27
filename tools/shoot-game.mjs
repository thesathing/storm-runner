// Storm Runner screenshot tool (NOT part of the shipped repo).
// Serves game/ on loopback only, opens each ?shot= scene in headless
// Chromium at 1280x720, waits for window.__shotReady, and writes JPEGs
// into screenshots/, lowering quality until each is <= 256 KiB.
// Fails on any page error, console error, or non-loopback request.
// Usage: node tools/shoot-game.mjs
import { chromium } from "../../../../token-radar-01/tools/playwright-core/index.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gameDir = join(root, "game");
const shotDir = join(root, "screenshots");
mkdirSync(shotDir, { recursive: true });

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
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const badRequests = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("request", (req) => {
  const url = req.url();
  if (!url.startsWith("http://127.0.0.1") && !url.startsWith("data:") && !url.startsWith("blob:")) {
    badRequests.push(url);
  }
});

const shots = [
  ["1-cover.jpg", "cover"],
  ["2-rings.jpg", "rings"],
  ["3-landing.jpg", "landing"],
  ["4-campaign.jpg", "campaign"],
];
for (const [name, scene] of shots) {
  await page.goto(`http://127.0.0.1:${port}/index.html?shot=${scene}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
  await page.waitForTimeout(250);
  let quality = 82;
  for (;;) {
    const buf = await page.screenshot({ type: "jpeg", quality });
    if (buf.length <= 262144 || quality <= 50) {
      writeFileSync(join(shotDir, name), buf);
      console.log(name, buf.length + " bytes, quality " + quality);
      break;
    }
    quality -= 8;
  }
}
await browser.close();
server.close();
if (badRequests.length) { console.error("NON-LOCAL REQUESTS:\n" + badRequests.join("\n")); process.exit(1); }
if (errors.length) { console.error("PAGE ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("shoot: no page errors, no non-local requests");
