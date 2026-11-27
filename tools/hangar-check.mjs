import { chromium } from "../../../../token-radar-01/tools/playwright-core/index.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
const root = process.cwd();
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
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(1500);
// Title screen: HANGAR button is at approx (640, 470) per render.js title layout.
await page.mouse.click(640, 470);
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/hangar-shot.jpg", quality: 82 });
// Orbit drag on the turntable (right half of screen).
await page.mouse.move(950, 360);
await page.mouse.down();
await page.mouse.move(1050, 360, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/hangar-orbit.jpg", quality: 82 });
console.log("errors:", errors.length ? errors.join(" | ") : "none");
console.log("hangar title:", await page.title());
await browser.close();
server.close();
