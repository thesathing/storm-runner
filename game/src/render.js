// Storm Runner — renderer: sky, projected terrain mesh, strips, rings,
// clouds, rain, lightning, the built plane sprite, the HUD, and every
// menu screen. Everything is Canvas 2D; the 3-D look comes from the
// projector in terrain.js.
import { REGIONS } from './config.js';
import { MISSION_DEFS, missionObjectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_REGIONS = 'regions';
export const SCREEN_HANGAR = 'hangar';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DEBRIEF = 'debrief';
export const SCREEN_OVER = 'over';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;
  const FOCAL = 760;
  let shake = 0;

  function setShake(v) { shake = Math.max(shake, v); }

  // ---- small colour helpers (64-bit look: everything is shaded, nothing
  // is one flat fill) ------------------------------------------------------
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function parseHex(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function css(rgb, a = 1) {
    return `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${a})`;
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function lit(rgb, f) {
    return [Math.min(255, rgb[0] * f), Math.min(255, rgb[1] * f), Math.min(255, rgb[2] * f)];
  }
  // Distance fog: 0 up close, up to 0.85 far away; far terrain dissolves
  // into the horizon haze instead of ending in a hard edge.
  function fogFactor(dist) {
    return clamp01((dist - 1000) / 2400) * 0.85;
  }
  // Haze colour for a region: its warm horizon tone, for fog and haze.
  function hazeRgb(region) {
    return parseHex(region.sky[2]);
  }
  // Sun position in screen space: low on the horizon, right of centre,
  // where the amber glow and the sea glitter path both point.
  const SUN_X = W * 0.72;
  const SUN_Y = H * 0.60;

  // ---- sky ---------------------------------------------------------------
  function drawSky(region, storm, flash, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, region.sky[0]);
    g.addColorStop(0.45, region.sky[1]);
    g.addColorStop(0.68, region.sky[2]);
    g.addColorStop(0.82, '#3a3a44');
    g.addColorStop(1, '#20242e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun disc + halo: a real sun, not just a glow.
    const rg = ctx.createRadialGradient(SUN_X, SUN_Y, 6, SUN_X, SUN_Y, 340);
    rg.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
    rg.addColorStop(0.08, 'rgba(255, 205, 120, 0.75)');
    rg.addColorStop(0.35, 'rgba(255, 186, 100, 0.28)');
    rg.addColorStop(1, 'rgba(255, 186, 100, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffedbe';
    ctx.beginPath();
    ctx.arc(SUN_X, SUN_Y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
    ctx.beginPath();
    ctx.arc(SUN_X, SUN_Y, 17, 0, Math.PI * 2);
    ctx.fill();
    // Distant haze band hugging the horizon.
    const hz = ctx.createLinearGradient(0, H * 0.52, 0, H * 0.78);
    hz.addColorStop(0, 'rgba(198, 164, 110, 0)');
    hz.addColorStop(0.5, 'rgba(198, 164, 110, 0.20)');
    hz.addColorStop(1, 'rgba(198, 164, 110, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.52, W, H * 0.26);
    // Drifting cloud bank near the horizon: shaded puff clusters with a
    // lit top and a dark belly, not flat silhouettes.
    for (let i = 0; i < 4; i += 1) {
      const bx = ((i * 521 + time * 6) % (W + 560)) - 280;
      const by = H * 0.40 + (i % 3) * 30;
      const puffs = [
        { dx: -70, dy: 6, rx: 120, ry: 26 },
        { dx: 0, dy: -8, rx: 150, ry: 32 },
        { dx: 80, dy: 8, rx: 110, ry: 24 },
      ];
      for (const p of puffs) {
        const pg = ctx.createLinearGradient(0, by + p.dy - p.ry, 0, by + p.dy + p.ry);
        pg.addColorStop(0, 'rgba(96, 104, 132, 0.85)');
        pg.addColorStop(1, 'rgba(18, 24, 40, 0.9)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(bx + p.dx, by + p.dy, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(210, 225, 255, ${flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- terrain mesh ------------------------------------------------------
  // `light` is the lightning lift (0..1): when a strike flashes, every
  // facet brightens with it, so the flash reads as light on the world.
  function drawTerrain(terrain, cam, region, light) {
    const project = terrain.makeProjector(cam, FOCAL, CX, CY);
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const focusX = cam.x + fx * 500;
    const focusZ = cam.z + fz * 500;
    const CELL = 95;
    const N = 44;
    const half = (N * CELL) / 2;
    // Grid aligned to the focus point, not the world, so it follows the plane.
    const ox = focusX - half;
    const oz = focusZ - half;
    const haze = hazeRgb(region);
    const quads = [];
    for (let j = 0; j < N; j += 1) {
      for (let i = 0; i < N; i += 1) {
        const x0 = ox + i * CELL;
        const z0 = oz + j * CELL;
        const x1 = x0 + CELL;
        const z1 = z0 + CELL;
        const h00 = terrain.height(x0, z0);
        const h10 = terrain.height(x1, z0);
        const h01 = terrain.height(x0, z1);
        const h11 = terrain.height(x1, z1);
        const hm = (h00 + h10 + h01 + h11) / 4;
        const cxm = (x0 + x1) / 2 - cam.x;
        const czm = (z0 + z1) / 2 - cam.z;
        const depth = cxm * cxm + czm * czm;
        // Slope across the cell, for cliff shading in the colour call.
        const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h10), Math.abs(h11 - h01)) / CELL;
        quads.push({ x0, z0, x1, z1, h00, h10, h01, h11, hm, depth, slope });
      }
    }
    quads.sort((a, b) => b.depth - a.depth);
    for (const q of quads) {
      const p00 = project(q.x0, Math.max(q.h00, 0), q.z0);
      const p10 = project(q.x1, Math.max(q.h10, 0), q.z0);
      const p11 = project(q.x1, Math.max(q.h11, 0), q.z1);
      const p01 = project(q.x0, Math.max(q.h01, 0), q.z1);
      if (!p00 || !p10 || !p11 || !p01) continue;
      const dist = Math.sqrt(q.depth);
      const fog = fogFactor(dist);
      // Textured facet colour, fogged toward the horizon haze, then lit
      // by the lightning lift (a cool-white lift, stronger on the flash).
      let rgb = terrain.colour(q.x0, q.z0, q.hm, q.slope);
      rgb = mix(rgb, haze, fog);
      if (light > 0) rgb = lit(mix(rgb, [214, 226, 255], light * 0.25), 1 + light * 0.4);
      ctx.fillStyle = css(rgb);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
      // Sun glitter on the sea: sparse warm flecks on the sun side of
      // the frame, fading out with the fog. No checkerboard, just light
      // on moving water.
      if (q.hm <= 1.5 && fog < 0.6) {
        const sp = project((q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2);
        if (sp && sp.x > CX + 40 && terrain.hashCell(q.x0, q.z0) > 0.90) {
          ctx.fillStyle = `rgba(255, 214, 140, ${(1 - fog) * 0.55})`;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, 7 * sp.s * 0.4 + 2, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    return project;
  }

  // ---- strips ------------------------------------------------------------
  // `light` is the lightning lift; `haze` is the fog colour for distance.
  function drawStrip(terrain, project, strip, light, haze) {
    const dx = Math.sin(strip.heading);
    const dz = Math.cos(strip.heading);
    const px = Math.cos(strip.heading);
    const pz = -Math.sin(strip.heading);
    const hl = strip.length / 2;
    const hw = strip.width / 2;
    const corners = [
      [strip.x + dx * hl + px * hw, strip.z + dz * hl + pz * hw],
      [strip.x + dx * hl - px * hw, strip.z + dz * hl - pz * hw],
      [strip.x - dx * hl - px * hw, strip.z - dz * hl - pz * hw],
      [strip.x - dx * hl + px * hw, strip.z - dz * hl + pz * hw],
    ];
    const pts = corners.map(([x, z]) => project(x, terrain.groundAt(x, z) + 1.5, z));
    if (pts.some((p) => !p)) return;
    const centre = project(strip.x, terrain.groundAt(strip.x, strip.z) + 1.5, strip.z);
    const fog = centre ? fogFactor(centre.depth) : 0;
    // Asphalt with noise speckle, fogged like the terrain around it.
    let asphalt = mix([43, 47, 54], haze, fog);
    if (light > 0) asphalt = lit(asphalt, 1 + light * 0.5);
    ctx.fillStyle = css(asphalt);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // Asphalt speckle: short pale ticks scattered along the strip.
    ctx.strokeStyle = `rgba(200, 205, 215, ${0.25 * (1 - fog)})`;
    ctx.lineWidth = 1;
    for (let t = -hl + 12; t < hl - 8; t += 26) {
      const off = (terrain.hashCell(strip.x + t, strip.z) - 0.5) * hw * 1.4;
      const a = project(strip.x + dx * t + px * off, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t + pz * off);
      const b = project(strip.x + dx * (t + 9) + px * off, terrain.groundAt(strip.x + dx * (t + 9), strip.z + dz * (t + 9)) + 2, strip.z + dz * (t + 9) + pz * off);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Threshold bars at both ends: four white bars across the width.
    ctx.fillStyle = `rgba(240, 242, 245, ${0.9 * (1 - fog)})`;
    for (const end of [-1, 1]) {
      for (const side of [-0.6, -0.2, 0.2, 0.6]) {
        const t = end * (hl - 14);
        const a = project(strip.x + dx * t + px * side * hw - dx * 8, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t + pz * side * hw - dz * 8);
        const b = project(strip.x + dx * t + px * side * hw + dx * 8, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t + pz * side * hw + dz * 8);
        if (!a || !b) continue;
        ctx.strokeStyle = `rgba(240, 242, 245, ${0.9 * (1 - fog)})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // Centreline dashes.
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - fog)})`;
    ctx.lineWidth = 2;
    for (let t = -hl + 30; t < hl - 10; t += 45) {
      const a = project(strip.x + dx * t, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t);
      const b = project(strip.x + dx * (t + 22), terrain.groundAt(strip.x + dx * (t + 22), strip.z + dz * (t + 22)) + 2, strip.z + dz * (t + 22));
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Approach light bar: white lights leading in before the threshold.
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    for (let k = 1; k <= 5; k += 1) {
      const t = -hl - k * 28;
      const p = project(strip.x + dx * t, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Edge lights, amber, with glow halos.
    ctx.save();
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffb347';
    for (const side of [-1, 1]) {
      for (let t = -hl; t <= hl; t += 60) {
        const p = project(strip.x + dx * t + px * side * hw, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t + pz * side * hw);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- rings ---------------------------------------------------------------
  function drawRing(project, ring, done, time) {
    // Billboard ring: drawn in screen space around the projected centre,
    // so it always faces the pilot and reads as a target ring.
    const c = project(ring.x, ring.y, ring.z);
    if (!c) return;
    // A ring right next to the camera would project into a giant arc
    // across the whole frame; skip it until the pilot is clear of it.
    if (c.depth < 60) return;
    const radius = ring.r * c.s * 0.9;
    if (radius < 3 || radius > 420) return;
    const fogA = 1 - fogFactor(c.depth) * 0.8;
    const pulse = done ? 0 : 0.5 + 0.5 * Math.sin(time * 5);
    ctx.save();
    ctx.globalAlpha = fogA;
    ctx.translate(c.x, c.y);
    ctx.strokeStyle = done ? 'rgba(120, 220, 140, 0.9)' : `rgba(255, 179, 71, ${0.75 + 0.3 * pulse})`;
    ctx.lineWidth = done ? 5 : 8;
    ctx.shadowColor = done ? '#78dc8c' : '#ffb347';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (!done) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RING', 0, -radius - 10);
    }
    ctx.restore();
  }

  // ---- storm cells, rain, lightning ---------------------------------------
  function drawClouds(project, weather, time, light) {
    // Storm cells as shaded puff clusters: every puff is a vertical
    // gradient (lit top, dark belly) with an anvil cap, so a cloud reads
    // as a lit volume instead of a flat disc. Far cells fade into fog,
    // and a lightning flash lifts the lit tops together with the terrain.
    const lift = light > 0 ? Math.round(light * 70) : 0;
    const topBase = [125 + lift, 138 + lift, 168 + lift];
    const bellyBase = [20 + lift, 26 + lift, 42 + lift];
    for (const cell of weather.cells) {
      const puffs = [
        { dx: -0.5, dy: 0.05, r: 0.42, a: 0.85, rot: -0.12 },
        { dx: 0, dy: -0.08, r: 0.55, a: 0.9, rot: 0.06 },
        { dx: 0.5, dy: 0.06, r: 0.44, a: 0.85, rot: 0.14 },
        { dx: -0.18, dy: 0.14, r: 0.36, a: 0.8, rot: -0.06 },
        { dx: 0.22, dy: 0.15, r: 0.38, a: 0.8, rot: 0.1 },
        // Anvil cap: wide, flat, catching the sun on top.
        { dx: 0, dy: -0.22, r: 0.62, a: 0.55, rot: 0, anvil: true },
      ];
      for (const puff of puffs) {
        const p = project(
          cell.x + puff.dx * cell.r,
          cell.base + 80 + puff.dy * cell.r * 0.4,
          cell.z + puff.dx * cell.r * 0.25,
        );
        if (!p || p.depth < 30) continue;
        const rx = cell.r * puff.r * p.s * 0.8;
        if (rx < 4) continue;
        const ry = puff.anvil ? rx * 0.22 : rx * 0.52;
        const fogA = 1 - fogFactor(p.depth) * 0.75;
        const pg = ctx.createLinearGradient(0, p.y - ry, 0, p.y + ry);
        pg.addColorStop(0, css(mix(topBase, [255, 220, 160], puff.anvil ? 0.35 : 0), puff.a * fogA));
        pg.addColorStop(1, css(bellyBase, puff.a * fogA));
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, puff.rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLightning(project, bolt) {
    if (!bolt) return;
    const pts = bolt.points.map((pt) => project(pt.x, pt.y, pt.z)).filter(Boolean);
    if (pts.length < 2) return;
    // Glow at the strike's cloud top, so the bolt has a source of light.
    const top = pts[0];
    const gg = ctx.createRadialGradient(top.x, top.y, 4, top.x, top.y, 190);
    gg.addColorStop(0, 'rgba(220, 232, 255, 0.55)');
    gg.addColorStop(1, 'rgba(220, 232, 255, 0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.strokeStyle = '#f5f7ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#cfe0ff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // A thinner branch splitting off mid-bolt, for a real strike shape.
    const mid = pts[Math.floor(pts.length / 2)];
    const end = pts[pts.length - 1];
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(mid.x + (end.x - mid.x) * 0.4 + 46, mid.y + (end.y - mid.y) * 0.4 + 30);
    ctx.lineTo(mid.x + (end.x - mid.x) * 0.7 + 70, mid.y + (end.y - mid.y) * 0.7 + 64);
    ctx.stroke();
    ctx.restore();
  }

  function drawRain(storm, time, plane) {
    if (storm < 0.15) return;
    // Two depths: far rain faint, short and slow; near rain bright, long
    // and fast, slanting with the bank so it feels like the plane's own
    // airspeed. The two layers together give the rain depth.
    ctx.save();
    const slant = plane ? plane.bank * 30 : 0;
    ctx.strokeStyle = `rgba(170, 195, 230, ${0.10 + 0.20 * storm})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 70; i += 1) {
      const seed = i * 211.3;
      const x = ((seed + time * 420) % (W + 80)) - 40;
      const y = ((seed * 1.7 + time * 700) % (H + 60)) - 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4 + slant * 0.4, y + 13);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(190, 208, 235, ${0.42 + 0.38 * storm})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 60; i += 1) {
      const seed = i * 137.5 + 50;
      const x = ((seed + time * 1100) % (W + 80)) - 40;
      const y = ((seed * 1.7 + time * 1700) % (H + 60)) - 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 13 + slant, y + 38);
      ctx.stroke();
    }
    // Splash rings on the sea when skimming low through rain.
    if (plane && plane.y < 45) {
      ctx.strokeStyle = `rgba(200, 220, 240, ${0.35 * storm})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i += 1) {
        const seed = i * 173.1;
        const cx = ((seed + time * 60) % (W + 100)) - 50;
        const cy = H * 0.78 + ((seed * 0.37) % (H * 0.16));
        const r = 4 + ((time * 46 + i * 13) % 26);
        ctx.globalAlpha = (0.5 - r / 60) * storm;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---- the plane: drawn big, built from parts ------------------------------
  // Pitch is VISIBLE now: nose-up foreshortens the fuselage (the chase
  // camera sees more of the tail, less of the nose) and nose-down
  // stretches it, on top of the sprite riding up/down. The old build only
  // rolled, so pitch never read in a still frame.
  function drawPlane(plane, screenPos, time) {
    const S = 300; // sprite width in px
    const bank = plane.bank;
    const px = screenPos.x;
    const py = screenPos.y - plane.pitch * 60;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(bank * 0.9);
    const pitchSq = Math.max(0.62, Math.min(1.4, 1 - plane.pitch * 0.5));
    ctx.scale(1, pitchSq);
    const u = S / 300;
    // Prop blur disc at the nose (top): translucent disc, rim ring, and
    // faint spokes turning with time so the prop reads as spinning.
    ctx.fillStyle = 'rgba(220, 228, 240, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -118 * u, 34 * u, 46 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,244,250,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -118 * u, 26 * u, 38 * u, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,244,250,0.28)';
    ctx.lineWidth = 3;
    const spoke = time * 9;
    for (let k = 0; k < 3; k += 1) {
      const a = spoke + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 8 * u, -118 * u + Math.sin(a) * 10 * u);
      ctx.lineTo(Math.cos(a) * 30 * u, -118 * u + Math.sin(a) * 42 * u);
      ctx.stroke();
    }
    // Tail: horizontal stabiliser (its trailing edge lifts with pitch,
    // like an elevator) + fin with an amber flash.
    const elev = -plane.pitch * 14 * u;
    ctx.fillStyle = '#3d4a63';
    ctx.beginPath();
    ctx.moveTo(-58 * u, 78 * u + elev);
    ctx.lineTo(58 * u, 78 * u + elev);
    ctx.lineTo(44 * u, 96 * u);
    ctx.lineTo(-44 * u, 96 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 40, 60, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-52 * u, 84 * u + elev);
    ctx.lineTo(52 * u, 84 * u + elev);
    ctx.stroke();
    ctx.fillStyle = '#46557a';
    ctx.beginPath();
    ctx.moveTo(-8 * u, 62 * u);
    ctx.lineTo(10 * u, 62 * u);
    ctx.lineTo(16 * u, 104 * u);
    ctx.lineTo(-14 * u, 104 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-8 * u, 66 * u);
    ctx.lineTo(10 * u, 66 * u);
    ctx.lineTo(12 * u, 78 * u);
    ctx.lineTo(-10 * u, 78 * u);
    ctx.closePath();
    ctx.fill();
    // Main wings with dihedral, flap lines and aileron seams.
    ctx.fillStyle = '#5a6b8c';
    ctx.beginPath();
    ctx.moveTo(-26 * u, -18 * u);
    ctx.lineTo(-148 * u, 26 * u);
    ctx.lineTo(-140 * u, 44 * u);
    ctx.lineTo(-20 * u, 22 * u);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26 * u, -18 * u);
    ctx.lineTo(148 * u, 26 * u);
    ctx.lineTo(140 * u, 44 * u);
    ctx.lineTo(20 * u, 22 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6c7ea6';
    ctx.beginPath();
    ctx.moveTo(-26 * u, -18 * u);
    ctx.lineTo(-148 * u, 26 * u);
    ctx.lineTo(-146 * u, 32 * u);
    ctx.lineTo(-24 * u, -10 * u);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26 * u, -18 * u);
    ctx.lineTo(148 * u, 26 * u);
    ctx.lineTo(146 * u, 32 * u);
    ctx.lineTo(24 * u, -10 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.55)';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 30 * u, -14 * u);
      ctx.lineTo(side * 142 * u, 28 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 34 * u, -4 * u);
      ctx.lineTo(side * 138 * u, 36 * u);
      ctx.stroke();
    }
    // Fuselage: tapered body, panel shading, amber storm-chaser stripe.
    const body = ctx.createLinearGradient(-20 * u, 0, 20 * u, 0);
    body.addColorStop(0, '#7c8aa8');
    body.addColorStop(0.5, '#aeb9cf');
    body.addColorStop(1, '#5f6d8a');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -128 * u);
    ctx.quadraticCurveTo(20 * u, -90 * u, 22 * u, -30 * u);
    ctx.quadraticCurveTo(24 * u, 40 * u, 14 * u, 96 * u);
    ctx.quadraticCurveTo(0, 110 * u, -14 * u, 96 * u);
    ctx.quadraticCurveTo(-24 * u, 40 * u, -22 * u, -30 * u);
    ctx.quadraticCurveTo(-20 * u, -90 * u, 0, -128 * u);
    ctx.fill();
    // Amber stripe down the fuselage.
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-7 * u, -96 * u);
    ctx.lineTo(7 * u, -96 * u);
    ctx.lineTo(9 * u, 60 * u);
    ctx.lineTo(-9 * u, 60 * u);
    ctx.closePath();
    ctx.fill();
    // Panel lines across the fuselage, longerons down each side, and
    // rivet dots along them: the skin reads as riveted metal, not paint.
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.55)';
    ctx.lineWidth = 1;
    for (const yy of [-60, -20, 20, 60]) {
      ctx.beginPath();
      ctx.moveTo(-20 * u, yy * u);
      ctx.lineTo(20 * u, yy * u);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.4)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 15 * u, -100 * u);
      ctx.quadraticCurveTo(side * 19 * u, -30 * u, side * 17 * u, 40 * u);
      ctx.quadraticCurveTo(side * 16 * u, 70 * u, side * 10 * u, 92 * u);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30, 40, 60, 0.7)';
    for (const yy of [-60, -20, 20, 60]) {
      for (const xx of [-14, -7, 7, 14]) {
        ctx.beginPath();
        ctx.arc(xx * u, yy * u, 1.1 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Canopy with a sky reflection: pale blue at the top fading to deep
    // navy, plus a diagonal glint streak.
    const canopy = ctx.createLinearGradient(0, -84 * u, 0, -32 * u);
    canopy.addColorStop(0, '#9db8dd');
    canopy.addColorStop(0.45, '#4a6a94');
    canopy.addColorStop(1, '#16233c');
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(0, -58 * u, 13 * u, 26 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-6 * u, -72 * u);
    ctx.lineTo(2 * u, -48 * u);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-4 * u, -66 * u, 4 * u, 10 * u, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // SR-7 marking.
    ctx.fillStyle = '#20293d';
    ctx.font = `bold ${17 * u}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SR-7', 0, 34 * u);
    // Nose cone + spinner.
    ctx.fillStyle = '#2c3850';
    ctx.beginPath();
    ctx.ellipse(0, -124 * u, 9 * u, 10 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights with glow halos.
    const blink = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff3c3c';
    ctx.fillStyle = `rgba(255, 60, 60, ${0.6 + 0.4 * blink})`;
    ctx.beginPath();
    ctx.arc(-146 * u, 34 * u, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#50ff78';
    ctx.fillStyle = `rgba(80, 255, 120, ${0.6 + 0.4 * blink})`;
    ctx.beginPath();
    ctx.arc(146 * u, 34 * u, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#fff';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 102 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Landing gear when down.
    if (plane.gearDown) {
      ctx.fillStyle = '#1c2434';
      ctx.fillRect(-16 * u, 96 * u, 7 * u, 16 * u);
      ctx.fillRect(9 * u, 96 * u, 7 * u, 16 * u);
      ctx.beginPath();
      ctx.arc(-12 * u, 116 * u, 6 * u, 0, Math.PI * 2);
      ctx.arc(12 * u, 116 * u, 6 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- HUD ------------------------------------------------------------------
  function drawHUD(plane, mission, target, time) {
    const altFt = Math.round(plane.y * 3.281);
    const spdKt = Math.round(plane.speed * 1.944);
    const vsi = Math.round(plane.verticalSpeed * 196.85);
    const hdg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
    const fuelPct = plane.fuel / plane.fuelCap;
    const dmgPct = plane.damage / plane.damageMax;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // Top-left instruments.
    ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
    ctx.fillRect(18, 16, 250, 96);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 16, 250, 96);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('ALT', 30, 24);
    ctx.fillText('SPD', 30, 54);
    ctx.fillText('VSI', 30, 84);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px system-ui, monospace';
    ctx.fillText(`${altFt} ft`, 92, 20);
    ctx.fillText(`${spdKt} kt`, 92, 50);
    ctx.fillText(`${vsi >= 0 ? '+' : ''}${vsi} fpm`, 92, 80);
    // Top-right compass strip.
    ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
    ctx.fillRect(W - 268, 16, 250, 64);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
    ctx.strokeRect(W - 268, 16, 250, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px system-ui, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, W - 143, 24);
    ctx.font = 'bold 13px system-ui, sans-serif';
    const cardinals = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (const [deg, label] of cardinals) {
      let d = ((deg - hdg + 540) % 360) - 180;
      if (Math.abs(d) > 70) continue;
      const x = W - 143 + d * 1.5;
      ctx.fillStyle = d === 0 ? '#ffb347' : '#c7d3e8';
      ctx.fillText(label, x, 54);
    }
    // Mission banner, centre-top.
    if (mission) {
      const text = missionObjectiveText(mission);
      ctx.font = 'bold 19px system-ui, sans-serif';
      const tw = ctx.measureText(text).width + 36;
      ctx.fillStyle = 'rgba(8, 12, 22, 0.78)';
      ctx.fillRect(CX - tw / 2, 16, tw, 40);
      ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
      ctx.strokeRect(CX - tw / 2, 16, tw, 40);
      ctx.fillStyle = '#ffd9a0';
      ctx.fillText(text, CX, 27);
      if (target) {
        const dx = target.x - plane.x;
        const dy = target.y - plane.y;
        const dz = target.z - plane.z;
        const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
        ctx.fillStyle = '#9fb4d8';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`NEXT TARGET ${dist} m`, CX, 60);
      }
    }
    // Bottom-left: fuel + damage. Solid fill, not translucent: the
    // panel sits over the world, and a translucent fill lets bright
    // world marks (strip lights) ghost through onto the instruments.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgb(8, 12, 22)';
    ctx.fillRect(18, H - 92, 250, 76);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
    ctx.strokeRect(18, H - 92, 250, 76);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('FUEL', 30, H - 84);
    ctx.fillText('DMG', 30, H - 52);
    ctx.fillStyle = '#22304a';
    ctx.fillRect(92, H - 86, 158, 16);
    ctx.fillStyle = fuelPct < 0.25 ? '#ff5a4d' : '#ffb347';
    ctx.fillRect(92, H - 86, 158 * fuelPct, 16);
    ctx.fillStyle = '#22304a';
    ctx.fillRect(92, H - 54, 158, 16);
    ctx.fillStyle = dmgPct > 0.6 ? '#ff5a4d' : '#e8b13c';
    ctx.fillRect(92, H - 54, 158 * dmgPct, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${Math.round(fuelPct * 100)}%`, 108, H - 84);
    ctx.fillText(`${Math.round(dmgPct * 100)}%`, 108, H - 52);
    // Bottom-right: attitude indicator.
    const ax = W - 96;
    const ay = H - 96;
    const ar = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-plane.bank);
    const pitchOff = Math.max(-ar, Math.min(ar, plane.pitch * 90));
    ctx.fillStyle = '#3a6ea8';
    ctx.fillRect(-ar, -ar - pitchOff, ar * 2, ar + pitchOff);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-ar, -pitchOff, ar * 2, ar + pitchOff);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ar, -pitchOff);
    ctx.lineTo(ar, -pitchOff);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(ax - 26, ay);
    ctx.lineTo(ax + 26, ay);
    ctx.lineTo(ax, ay + 6);
    ctx.closePath();
    ctx.fill();
    // Score / credits line under the compass.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`STORM CREDITS ${mission ? mission.credits ?? 0 : 0}`, W - 18, 92);
    // Warnings.
    ctx.textAlign = 'center';
    if (plane.speed < 30 && plane.y > 10) {
      ctx.fillStyle = Math.sin(time * 10) > 0 ? '#ff5a4d' : '#ffb347';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('STALL — NOSE DOWN, ADD THROTTLE', CX, H - 130);
    } else if (fuelPct < 0.25) {
      ctx.fillStyle = Math.sin(time * 10) > 0 ? '#ff5a4d' : '#ffb347';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('LOW FUEL — FIND A STRIP', CX, H - 130);
    }
    ctx.restore();
  }

  // ---- screens ---------------------------------------------------------------
  function panel(x, y, w, h, title) {
    ctx.fillStyle = 'rgba(8, 12, 22, 0.86)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    if (title) {
      ctx.fillStyle = '#ffb347';
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, x + w / 2, y + 44);
    }
  }

  function button(x, y, w, h, label, active) {
    // Restore the caller's textAlign afterwards: the centred label used
    // to leak into the next draw, so every hangar row after the first
    // drew its name centred on the row's left edge and slid out of the
    // panel.
    const prevAlign = ctx.textAlign;
    ctx.fillStyle = active ? '#ffb347' : '#2a3648';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = active ? '#141a26' : '#ffd9a0';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 7);
    ctx.textAlign = prevAlign;
    return { x, y, w, h, label };
  }

  function drawTitle(save) {
    drawSky(REGIONS[0], 0, 0, 0);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb347';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.fillText('STORM RUNNER', CX, 170);
    ctx.fillStyle = '#e8eefc';
    ctx.font = '28px system-ui, sans-serif';
    ctx.fillText('Fly the storm. Ring the thunder. Bring her home.', CX, 222);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Tempest Season — 5 missions across 3 regions · fuel, damage and lightning are real', CX, 258);
    ctx.fillText('Throttle: Shift / Ctrl   Pitch: W / S   Bank: A / D   Gear: G   Drop crate: C   Pause: P', CX, 292);
    const buttons = [];
    buttons.push(button(CX - 170, 350, 340, 56, 'FLY — CAMPAIGN'));
    buttons.push(button(CX - 170, 424, 340, 56, 'HANGAR — UPGRADES'));
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`Storm credits: ${save.credits}   Stars: ${Object.values(save.stars).reduce((a, b) => a + b, 0)}/15`, CX, 520);
    ctx.fillText('An original game. No network, no library — raw canvas, own 3-D projection.', CX, 548);
    return buttons;
  }

  function drawRegions(save) {
    drawSky(REGIONS[0], 0, 0, 0);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(90, 60, W - 180, H - 120, 'TEMPEST SEASON — CHOOSE YOUR SORTIE');
    const buttons = [];
    MISSION_DEFS.forEach((def, i) => {
      const unlocked = save.unlockedMissions.includes(def.id);
      const y = 140 + i * 92;
      const x = 150;
      const w = W - 300;
      ctx.fillStyle = unlocked ? 'rgba(42, 54, 72, 0.95)' : 'rgba(20, 26, 38, 0.95)';
      ctx.fillRect(x, y, w, 76);
      ctx.strokeStyle = unlocked ? '#ffb347' : '#4a5568';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, 76);
      ctx.textAlign = 'left';
      ctx.fillStyle = unlocked ? '#fff' : '#7a8698';
      ctx.font = 'bold 22px system-ui, sans-serif';
      const stars = '★'.repeat(save.stars[def.id] || 0) + '☆'.repeat(3 - (save.stars[def.id] || 0));
      ctx.fillText(`${def.id} — ${def.name}  ${stars}`, x + 20, y + 30);
      ctx.fillStyle = '#9fb4d8';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`${def.goal}  ·  Region ${def.region}  ·  Par ${def.par}s`, x + 20, y + 56);
      if (unlocked) buttons.push({ x, y, w, h: 76, label: def.id });
    });
    buttons.push(button(90, H - 52, 200, 40, '← BACK'));
    buttons.push(button(W - 290, H - 52, 200, 40, 'HANGAR →'));
    return buttons;
  }

  function drawHangar(save) {
    drawSky(REGIONS[1], 0, 0, 0);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.55)';
    ctx.fillRect(0, 0, W, H);
    panel(90, 60, W - 180, H - 120, 'HANGAR — SR-7 STORM CHASER');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`Storm credits: ${save.credits}`, 150, 130);
    const buttons = [];
    const keys = ['fuel', 'engine', 'hull', 'rod'];
    const names = { fuel: 'Fuel Tank', engine: 'Engine', hull: 'Hull', rod: 'Lightning Rod' };
    const descs = { fuel: '+25% fuel per level', engine: '+12% thrust per level', hull: '+20 damage soak per level', rod: '-30% lightning damage per level' };
    keys.forEach((key, i) => {
      const y = 160 + i * 96;
      const x = 150;
      const w = W - 300;
      const level = save.upgrades[key] || 0;
      ctx.fillStyle = 'rgba(42, 54, 72, 0.95)';
      ctx.fillRect(x, y, w, 80);
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, 80);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 21px system-ui, sans-serif';
      ctx.fillText(`${names[key]}  ${'●'.repeat(level)}${'○'.repeat(3 - level)}`, x + 20, y + 32);
      ctx.fillStyle = '#9fb4d8';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(descs[key], x + 20, y + 58);
      const cost = level >= 3 ? null : [120, 260, 480][level];
      const label = level >= 3 ? 'MAXED' : `BUY ${cost} CR`;
      const b = button(x + w - 190, y + 18, 170, 44, label, false);
      b.upgrade = key;
      buttons.push(b);
    });
    buttons.push(button(90, H - 52, 200, 40, '← BACK'));
    return buttons;
  }

  function drawDebrief(result) {
    ctx.fillStyle = 'rgba(8, 12, 22, 0.82)';
    ctx.fillRect(0, 0, W, H);
    panel(CX - 320, 150, 640, 380, result.title);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(result.line, CX, 240);
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText(`Stars: ${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}`, CX, 290);
    ctx.fillText(`Time: ${Math.round(result.elapsed)}s   Credits earned: +${result.credits}`, CX, 330);
    ctx.fillText(`Damage: ${Math.round(result.damage)}%   Fuel left: ${Math.round(result.fuel)}%`, CX, 370);
    const buttons = [];
    buttons.push(button(CX - 170, 420, 340, 52, 'CONTINUE'));
    return buttons;
  }

  function drawGameOver(reason) {
    ctx.fillStyle = 'rgba(20, 8, 10, 0.82)';
    ctx.fillRect(0, 0, W, H);
    panel(CX - 320, 170, 640, 320, 'SORTIE LOST');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(reason, CX, 260);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('The SR-7 is built again in the hangar. Fly smarter next time.', CX, 300);
    const buttons = [];
    buttons.push(button(CX - 170, 380, 340, 52, 'BACK TO CAMPAIGN'));
    return buttons;
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 12, 22, 0.7)';
    ctx.fillRect(0, 0, W, H);
    panel(CX - 260, 220, 520, 240, 'PAUSED');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('P or click Resume to keep flying.', CX, 300);
    return [button(CX - 130, 330, 260, 52, 'RESUME')];
  }

  // ---- one play frame ------------------------------------------------------
  function drawPlay(world, time) {
    const { terrain, weather, plane, mission, region } = world;
    const storm = weather.inCell(plane.x, plane.z);
    const shakeAmt = storm > 0.5 ? (storm - 0.5) * 14 : 0;
    const jx = (Math.random() - 0.5) * shakeAmt + (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shakeAmt + (Math.random() - 0.5) * shake;
    if (shake > 0) shake *= 0.86;
    ctx.save();
    ctx.translate(jx, jy);
    // Lightning light: a live strike's flash, or the staged flash the
    // screenshot staging sets so the cover bolt lights its own scene.
    const flash = Math.max(weather.flash, world.forcedFlash || 0);
    drawSky(region, storm, flash, time);
    // Chase camera: behind and above the plane, looking forward.
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    const cam = {
      x: plane.x - fx * 42,
      y: plane.y + 13,
      z: plane.z - fz * 42,
      yaw: plane.heading,
      pitch: -0.10 - plane.pitch * 0.35,
      roll: plane.bank * 0.35,
    };
    const project = drawTerrain(terrain, cam, region, flash);
    drawClouds(project, weather, time, flash);
    drawStrip(terrain, project, region.strip, flash, hazeRgb(region));
    if (mission) {
      for (const ring of mission.rings) drawRing(project, ring, ring.done, time);
      const activeDrop = (mission.drops || []).find((d) => !d.done);
      for (const drop of mission.drops || []) {
        if (drop.done) continue;
        // Ground targets: drawn at the terrain height under the zone, not
        // floating at drop altitude, so they sit on the approach like
        // painted markers instead of sky circles.
        const gy = terrain.groundAt(drop.x, drop.z) + 3;
        const p = project(drop.x, gy, drop.z);
        if (!p || p.depth < 60) continue;
        // A zone whose centre is off the frame is not drawn at all: its
        // arc and label would only smear across the edge.
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
        // Only the active zone is a full circle: three 85 m circles on one
        // strip overlap into a Venn mess from any low camera. The zones
        // still to come are small dots, so the player sees where they are
        // without the clutter.
        if (drop !== activeDrop) {
          // A dot landing on the FUEL/DMG panel would paint over the
          // instruments: skip it, same as the active circle's clip.
          if (p.x > 12 && p.x < 274 && p.y > H - 98 && p.y < H - 10) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = 'rgba(120, 220, 140, 0.9)';
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          continue;
        }
        // Cap the drawn radius: a zone close to the camera must not fill
        // the frame, and its label goes below the circle so it cannot be
        // cut off at the top of the screen.
        // HUD fix: the circle must never touch the FUEL/DMG panel
        // (bottom-left, 18,H-92,250x76). No shrink — the evenodd clip
        // below already cuts the arc out of the panel rect, so the zone
        // stays big and readable and the panel simply sits in front of
        // it. (A shrink rule here crushed the circle to ~33 px in v2.)
        let radius = Math.min(drop.r * p.s * 0.9, 130);
        const panelTop = H - 92;
        if (radius < 4) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.rect(12, panelTop - 6, 262, 88);
        ctx.clip('evenodd');
        ctx.translate(p.x, p.y);
        ctx.strokeStyle = 'rgba(120, 220, 140, 0.95)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // Only the current zone carries its label; the label sits above
        // the circle, clamped inside the frame.
        if (drop === activeDrop) {
          ctx.fillStyle = '#78dc8c';
          ctx.font = 'bold 15px system-ui, sans-serif';
          ctx.textAlign = 'center';
          const ly = Math.max(18 - p.y, -radius - 8);
          const lx = Math.max(110 - p.x, Math.min(W - 110 - p.x, 0));
          ctx.fillText('DROP ZONE — PRESS C', lx, ly);
        }
        ctx.restore();
      }
    }
    const bolt = weather.bolt || world.forcedBolt;
    drawLightning(project, bolt);
    // The plane sits fixed on screen, large centre-low, like a chase
    // camera locked to the airframe; the world moves around it.
    drawPlane(plane, { x: CX, y: H * 0.66 }, time);
    drawRain(storm, time, plane);
    // Lightning light, second half: a radial wash centred on the bolt
    // plus a faint whole-frame lift, drawn over the world (terrain,
    // clouds, plane) but under the HUD, so the strike lights the scene
    // instead of sitting on top of it as a white line.
    if (flash > 0 && bolt) {
      const bp = project(bolt.points[0].x, bolt.points[0].y, bolt.points[0].z);
      if (bp) {
        const fg = ctx.createRadialGradient(bp.x, bp.y, 20, bp.x, bp.y, 520);
        fg.addColorStop(0, `rgba(214, 228, 255, ${flash * 0.42})`);
        fg.addColorStop(1, 'rgba(214, 228, 255, 0)');
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = `rgba(214, 228, 255, ${flash * 0.10})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    drawHUD(plane, mission, world.target, time);
    if (world.banner) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd9a0';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(world.banner, CX, 120);
    }
  }

  return {
    drawSky, drawPlay, drawHUD, drawPlane,
    drawTitle, drawRegions, drawHangar, drawDebrief, drawGameOver, drawPaused,
    setShake,
    width: W, height: H,
  };
}
