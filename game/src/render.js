// Storm Runner — renderer: sky, projected terrain mesh, strips, rings,
// clouds, rain, lightning, the built plane sprite, the HUD, and every
// menu screen. Everything is Canvas 2D; the 3-D look comes from the
// projector in terrain.js.
import { REGIONS } from './config.js';
import { MISSION_DEFS, missionObjectiveText } from './missions.js';
import { createWorld3D } from './world3d.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_REGIONS = 'regions';
export const SCREEN_HANGAR = 'hangar';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DEBRIEF = 'debrief';
export const SCREEN_OVER = 'over';

export function createRenderer(canvas, glCanvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const CX = W / 2;
  const CY = H / 2;
  const FOCAL = 760;
  let shake = 0;
  // The 3-D world paints the GL canvas underneath; this 2-D canvas is
  // the transparent overlay for HUD, rain and menus.
  const world3d = glCanvas ? createWorld3D(glCanvas) : null;

  function setShake(v) {
    shake = Math.max(shake, v);
    if (world3d) world3d.setShake(v);
  }
  function cycleCamera() {
    return world3d ? world3d.cycleCamera() : 'chase';
  }

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
  // where the amber glow and the sea glitter path both point. Low and
  // warm, like the reference's sunset: the light rakes across the
  // water instead of sitting high in the sky.
  const SUN_X = W * 0.72;
  const SUN_Y = H * 0.66;

  // ---- sky ---------------------------------------------------------------
  // A soft-edged puff: a radial gradient that fades to transparent at
  // its rim, so no cloud ever shows an ellipse outline. Drawn as a
  // scaled circle so the gradient stays round in the puff's own frame.
  function softBlob(x, y, rx, ry, rgb, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, css(rgb, alpha));
    g.addColorStop(0.65, css(rgb, alpha * 0.55));
    g.addColorStop(1, css(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSky(region, storm, flash, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, region.sky[0]);
    g.addColorStop(0.38, region.sky[1]);
    g.addColorStop(0.62, region.sky[2]);
    g.addColorStop(0.78, '#4a4640');
    g.addColorStop(1, '#20242e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Warm wash around the sun so the sky is amber near the sun and
    // cooler away from it, not one flat band.
    const warm = ctx.createRadialGradient(SUN_X, SUN_Y, 10, SUN_X, SUN_Y, 560);
    warm.addColorStop(0, 'rgba(255, 198, 110, 0.68)');
    warm.addColorStop(0.45, 'rgba(255, 176, 92, 0.28)');
    warm.addColorStop(1, 'rgba(255, 176, 92, 0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);
    // Sun disc + halo: a real sun, not just a glow.
    const rg = ctx.createRadialGradient(SUN_X, SUN_Y, 6, SUN_X, SUN_Y, 340);
    rg.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
    rg.addColorStop(0.08, 'rgba(255, 205, 120, 0.75)');
    rg.addColorStop(0.35, 'rgba(255, 186, 100, 0.28)');
    rg.addColorStop(1, 'rgba(255, 186, 100, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    // Horizontal glare streak through the sun, like a real low sun.
    const glare = ctx.createLinearGradient(SUN_X - 320, 0, SUN_X + 320, 0);
    glare.addColorStop(0, 'rgba(255, 230, 170, 0)');
    glare.addColorStop(0.5, 'rgba(255, 230, 170, 0.30)');
    glare.addColorStop(1, 'rgba(255, 230, 170, 0)');
    ctx.fillStyle = glare;
    ctx.fillRect(SUN_X - 320, SUN_Y - 4, 640, 8);
    ctx.fillStyle = '#ffedbe';
    ctx.beginPath();
    ctx.arc(SUN_X, SUN_Y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 200, 0.85)';
    ctx.beginPath();
    ctx.arc(SUN_X, SUN_Y, 17, 0, Math.PI * 2);
    ctx.fill();
    // Thin high haze: a faint soft band well above the horizon.
    const hh = ctx.createLinearGradient(0, H * 0.26, 0, H * 0.36);
    hh.addColorStop(0, 'rgba(200, 210, 230, 0)');
    hh.addColorStop(0.5, 'rgba(200, 210, 230, 0.07)');
    hh.addColorStop(1, 'rgba(200, 210, 230, 0)');
    ctx.fillStyle = hh;
    ctx.fillRect(0, H * 0.26, W, H * 0.10);
    // Distant haze band hugging the horizon.
    const hz = ctx.createLinearGradient(0, H * 0.52, 0, H * 0.78);
    hz.addColorStop(0, 'rgba(198, 164, 110, 0)');
    hz.addColorStop(0.5, 'rgba(198, 164, 110, 0.20)');
    hz.addColorStop(1, 'rgba(198, 164, 110, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, H * 0.52, W, H * 0.26);
    // Distant cloud deck fading into the haze: faint wide puffs
    // across the horizon, some dark and broken so the deck reads as
    // storm cloud with bright breaks, not one flat band.
    for (let i = 0; i < 8; i += 1) {
      const bx = ((i * 331 + time * 4) % (W + 600)) - 300;
      const dark = i % 3 === 0;
      softBlob(bx, H * 0.56, 260, 26, dark ? [58, 64, 84] : [150, 158, 178], dark ? 0.22 : 0.16);
    }
    // Drifting cloud bank near the horizon: soft-edged shaded puffs
    // with a lit top and a dark belly, never a visible ellipse outline.
    for (let i = 0; i < 5; i += 1) {
      const bx = ((i * 521 + time * 6) % (W + 560)) - 280;
      const by = H * 0.40 + (i % 3) * 30;
      // Two extra satellite puffs riding higher break the flat
      // ellipse silhouette into an irregular cloud top.
      const puffs = [
        { dx: -70, dy: 6, rx: 120, ry: 26 },
        { dx: 0, dy: -8, rx: 150, ry: 32 },
        { dx: 80, dy: 8, rx: 110, ry: 24 },
        { dx: -30, dy: -24, rx: 70, ry: 18 },
        { dx: 45, dy: -22, rx: 80, ry: 20 },
      ];
      for (const p of puffs) {
        softBlob(bx + p.dx, by + p.dy + p.ry * 0.3, p.rx, p.ry, [10, 14, 26], 0.88);
        softBlob(bx + p.dx, by + p.dy - p.ry * 0.3, p.rx * 0.72, p.ry * 0.6, [110, 120, 148], 0.8);
      }
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(210, 225, 255, ${flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
  }


  // White foam rings where the sea meets each island's shore. An
  // island's coastline is the circle where its bump meets sea level,
  // so the ring is drawn from the island data itself. Kept faint and
  // only for islands whose centre is actually in frame: a near or
  // off-frame island's ring is a giant arc that reads as a white
  // scratch across the scene, not as foam.


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


  // ---- speed streaks ------------------------------------------------------
  // Subtle radial streaks near the frame edges that strengthen with
  // airspeed: the still frame has to imply forward motion. Deterministic
  // angles, slowly drifting, so they never shimmer between frames.
  function drawSpeedStreaks(plane, time) {
    const speed = plane ? plane.speed : 0;
    const f = Math.max(0, Math.min(1, (speed - 35) / 55));
    if (f <= 0) return;
    ctx.save();
    ctx.strokeStyle = `rgba(225, 235, 248, ${0.16 * f})`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i += 1) {
      const a = i * 2.39996 + time * 0.03;
      const r0 = 330 + (i % 3) * 46;
      const len = 10 + f * 26 + (i % 4) * 4;
      const x0 = CX + Math.cos(a) * r0;
      const y0 = CY + Math.sin(a) * r0 * 0.62;
      const x1 = CX + Math.cos(a) * (r0 + len);
      const y1 = CY + Math.sin(a) * (r0 + len) * 0.62;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- HUD ------------------------------------------------------------------
  // Green aviation HUD in the reference's thin line-work: SPD/ALT
  // vertical tapes with a boxed current value, a radar scope
  // bottom-left, a centre gunsight cross. Our own mission names and
  // values throughout — nothing copied from the reference's text.
  function drawHUD(plane, mission, target, time, terrain) {
    const altFt = Math.round(plane.y * 3.281);
    const spdKt = Math.round(plane.speed * 1.944);
    const vsi = Math.round(plane.verticalSpeed * 196.85);
    const hdg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
    const fuelPct = plane.fuel / plane.fuelCap;
    const dmgPct = plane.damage / plane.damageMax;
    const GREEN = '#6dff7e';
    const GREEN_TEXT = '#8dff9a';
    const GREEN_DIM = 'rgba(109, 255, 126, 0.45)';
    const GREEN_BRIGHT = '#e8ffe9';
    const PANEL = 'rgba(6, 14, 10, 0.72)';
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    // One vertical tape: a line with ticks and a boxed current value
    // riding on it, like the reference's SPD/ALT tapes. `step` is the
    // value change per tick; the box sits at the tape's middle.
    function tape(x, label, value, unit, step) {
      const top = 150;
      const mid = 250;
      const bot = 350;
      ctx.strokeStyle = GREEN_DIM;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
      ctx.font = 'bold 12px system-ui, monospace';
      ctx.textAlign = 'center';
      for (let k = -4; k <= 4; k += 1) {
        const y = mid + k * 25;
        const tick = k % 2 === 0 ? 12 : 6;
        ctx.strokeStyle = GREEN_DIM;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - tick, y);
        ctx.lineTo(x + tick, y);
        ctx.stroke();
        if (k % 2 === 0 && k !== 0) {
          ctx.fillStyle = GREEN_TEXT;
          ctx.fillText(String(value + k * step), x, y - 6);
        }
      }
      // Boxed current value on the tape.
      const bx = x - 46;
      ctx.fillStyle = PANEL;
      ctx.fillRect(bx, mid - 18, 92, 36);
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, mid - 18, 92, 36);
      ctx.fillStyle = GREEN_BRIGHT;
      ctx.font = 'bold 19px system-ui, monospace';
      ctx.fillText(`${value} ${unit}`, x, mid - 11);
      ctx.fillStyle = GREEN_TEXT;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(label, x, top - 24);
    }
    tape(64, 'SPD', spdKt, 'kt', 10);
    tape(W - 64, 'ALT', altFt, 'ft', 100);
    ctx.textAlign = 'center';
    ctx.fillStyle = GREEN_TEXT;
    ctx.font = 'bold 14px system-ui, monospace';
    ctx.fillText(`VSI ${vsi >= 0 ? '+' : ''}${vsi} fpm`, 64, 372);
    // Top-right compass strip.
    ctx.fillStyle = PANEL;
    ctx.fillRect(W - 268, 16, 250, 64);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W - 268, 16, 250, 64);
    ctx.fillStyle = GREEN_BRIGHT;
    ctx.font = 'bold 24px system-ui, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, W - 143, 24);
    ctx.font = 'bold 13px system-ui, sans-serif';
    const cardinals = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (const [deg, label] of cardinals) {
      let d = ((deg - hdg + 540) % 360) - 180;
      if (Math.abs(d) > 70) continue;
      const x = W - 143 + d * 1.5;
      ctx.fillStyle = d === 0 ? GREEN : GREEN_TEXT;
      ctx.fillText(label, x, 54);
    }
    // Mission banner, centre-top.
    if (mission) {
      const text = missionObjectiveText(mission);
      ctx.font = 'bold 19px system-ui, sans-serif';
      const tw = ctx.measureText(text).width + 36;
      ctx.fillStyle = PANEL;
      ctx.fillRect(CX - tw / 2, 16, tw, 40);
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(CX - tw / 2, 16, tw, 40);
      ctx.fillStyle = GREEN_BRIGHT;
      ctx.fillText(text, CX, 27);
      if (target) {
        const dx = target.x - plane.x;
        const dy = target.y - plane.y;
        const dz = target.z - plane.z;
        const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
        ctx.fillStyle = GREEN_TEXT;
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`NEXT TARGET ${dist} m`, CX, 60);
      }
    }
    // Bottom-left: fuel + damage. Solid fill, not translucent: the
    // panel sits over the world, and a translucent fill lets bright
    // world marks (strip lights) ghost through onto the instruments.
    // Green like the rest of the HUD; damage stays red as a warning.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgb(6, 14, 10)';
    ctx.fillRect(18, H - 92, 250, 76);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, H - 92, 250, 76);
    ctx.fillStyle = GREEN_TEXT;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('FUEL', 30, H - 84);
    ctx.fillText('DMG', 30, H - 52);
    ctx.fillStyle = '#1a2e22';
    ctx.fillRect(92, H - 86, 158, 16);
    ctx.fillStyle = fuelPct < 0.25 ? '#ff5a4d' : '#4ade80';
    ctx.fillRect(92, H - 86, 158 * fuelPct, 16);
    ctx.fillStyle = '#1a2e22';
    ctx.fillRect(92, H - 54, 158, 16);
    ctx.fillStyle = dmgPct > 0.6 ? '#ff5a4d' : '#4ade80';
    ctx.fillRect(92, H - 54, 158 * dmgPct, 16);
    ctx.fillStyle = GREEN_BRIGHT;
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
    ctx.strokeStyle = GREEN;
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
    ctx.fillStyle = GREEN_TEXT;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`STORM CREDITS ${mission ? mission.credits ?? 0 : 0}`, W - 18, 92);
    // Radar scope bottom-left, above the FUEL/DMG panel: the region's
    // islands as green outlines centred on the plane, mission rings
    // as dots, own plane as a triangle. A real scope, not decoration.
    if (terrain) {
      const rx = 18;
      const ry = H - 216;
      const rw = 118;
      const rh = 118;
      ctx.fillStyle = 'rgba(6, 14, 10, 0.78)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      const rcx = rx + rw / 2;
      const rcy = ry + rh / 2;
      const k = rw / 4200;
      ctx.strokeStyle = GREEN_DIM;
      ctx.lineWidth = 1;
      for (const rr of [rw * 0.25, rw * 0.48]) {
        ctx.beginPath();
        ctx.arc(rcx, rcy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(rx, rcy);
      ctx.lineTo(rx + rw, rcy);
      ctx.moveTo(rcx, ry);
      ctx.lineTo(rcx, ry + rh);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(109, 255, 126, 0.8)';
      for (const isl of terrain.islands) {
        const ix = rcx + (isl.x - plane.x) * k;
        const iy = rcy + (isl.z - plane.z) * k;
        const ir = Math.max(2, isl.r * k);
        if (ix < rx - ir || ix > rx + rw + ir || iy < ry - ir || iy > ry + rh + ir) continue;
        ctx.beginPath();
        ctx.arc(ix, iy, ir, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (mission) {
        for (const ring of mission.rings) {
          const dx = rcx + (ring.x - plane.x) * k;
          const dy = rcy + (ring.z - plane.z) * k;
          if (dx < rx || dx > rx + rw || dy < ry || dy > ry + rh) continue;
          ctx.fillStyle = ring.done ? '#4ade80' : GREEN_BRIGHT;
          ctx.beginPath();
          ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = GREEN_BRIGHT;
      ctx.beginPath();
      ctx.moveTo(rcx, rcy - 6);
      ctx.lineTo(rcx - 5, rcy + 5);
      ctx.lineTo(rcx + 5, rcy + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Centre gunsight cross, the reference's HUD reticle, sitting
    // just ahead of the nose.
    const gx = CX;
    const gy = H * 0.42;
    ctx.save();
    ctx.strokeStyle = 'rgba(109, 255, 126, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(gx, gy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - 24, gy);
    ctx.lineTo(gx - 16, gy);
    ctx.moveTo(gx + 16, gy);
    ctx.lineTo(gx + 24, gy);
    ctx.moveTo(gx, gy - 24);
    ctx.lineTo(gx, gy - 16);
    ctx.moveTo(gx, gy + 16);
    ctx.lineTo(gx, gy + 24);
    ctx.stroke();
    ctx.restore();
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
    ctx.fillText('Throttle: Shift / Ctrl   Pitch: W / S   Bank: A / D   Gear: G   Drop crate: C   Camera: V   Pause: P', CX, 292);
    const buttons = [];
    buttons.push(button(CX - 170, 350, 340, 56, 'FLY — CAMPAIGN'));
    buttons.push(button(CX - 170, 424, 340, 56, 'HANGAR — UPGRADES'));
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`Storm credits: ${save.credits}   Stars: ${Object.values(save.stars).reduce((a, b) => a + b, 0)}/15`, CX, 520);
    ctx.fillText('An original game. Real 3-D with Three.js, vendored locally — no network, no downloaded models.', CX, 548);
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
    // Panel on the left; the right half stays transparent so the 3-D
    // turntable SR-7 on the GL canvas shows through.
    if (world3d) world3d.renderHangar(performance.now() / 1000);
    ctx.clearRect(0, 0, W, H);
    panel(90, 60, 610, H - 120, 'HANGAR — SR-7 STORM CHASER');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`Storm credits: ${save.credits}`, 120, 130);
    const buttons = [];
    const keys = ['fuel', 'engine', 'hull', 'rod'];
    const names = { fuel: 'Fuel Tank', engine: 'Engine', hull: 'Hull', rod: 'Lightning Rod' };
    const descs = { fuel: '+25% fuel per level', engine: '+12% thrust per level', hull: '+20 damage soak per level', rod: '-30% lightning damage per level' };
    keys.forEach((key, i) => {
      const y = 160 + i * 96;
      const x = 120;
      const w = 550;
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
    // Caption top-right, clear of the amber turntable ring.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('SR-7 STORM CHASER', 990, 60);
    ctx.fillStyle = '#9fb4d8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Built in the hangar, flown in the tempest.', 990, 88);
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
  // The world is real 3-D now (world3d.js); this overlay only adds rain,
  // speed streaks, the HUD and the banner. The overlay is cleared every
  // frame so the GL canvas shows through everywhere the HUD is not.
  function drawPlay(world, time) {
    const { weather, plane, mission } = world;
    const storm = weather.inCell(plane.x, plane.z);
    if (shake > 0) shake *= 0.86;
    // Lightning light: a live strike's flash, or the staged flash the
    // screenshot staging sets so the cover bolt lights its own scene.
    const flash = Math.max(weather.flash, world.forcedFlash || 0);
    if (world3d) world3d.renderPlay(world, time, flash, storm);
    ctx.clearRect(0, 0, W, H);
    drawRain(storm, time, plane);
    drawSpeedStreaks(plane, time);
    drawHUD(plane, mission, world.target, time, world.terrain);
    if (world.banner) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd9a0';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(world.banner, CX, 120);
    }
  }

  return {
    drawSky, drawPlay, drawHUD,
    drawTitle, drawRegions, drawHangar, drawDebrief, drawGameOver, drawPaused,
    setShake, cycleCamera,
    width: W, height: H,
  };
}
