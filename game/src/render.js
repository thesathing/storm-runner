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

  // ---- terrain mesh ------------------------------------------------------
  // `light` is the lightning lift (0..1): when a strike flashes, every
  // facet brightens with it, so the flash reads as light on the world.
  // `storm` is the storm strength at the plane, for whitecaps.
  function drawTerrain(terrain, cam, region, light, storm) {
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
      let fog = fogFactor(dist);
      // Mountains sit deeper in the atmosphere than the sea at the
      // same distance: haze their faces a little more.
      fog = Math.min(0.9, fog + Math.max(0, (q.hm - 80) / 120) * 0.30);
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
      // Stroke every quad in its own fill colour: anti-aliasing leaves
      // hairline gaps between neighbouring quads, and the sky showing
      // through those gaps reads as a fine grid. Removing the stroke
      // from the sea (tried first) made exactly that fine grid appear
      // — the gaps, not the colours, were drawing it. Now that the sea
      // colour field is smooth (neighbours differ by ~1%), the stroke
      // in the quad's own colour is invisible and the gaps are closed.
      ctx.strokeStyle = css(rgb);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (q.hm <= 1.5 && fog < 0.6) {
        const sp = project((q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2);
        if (!sp) continue;
        const hc = terrain.hashCell(q.x0, q.z0);
        // Sun glitter on the sea: warm flecks densest on the glitter
        // path toward the sun, fading with distance from it and with
        // the fog. Real glitter is view-dependent, so it sits on the
        // water as light, not as painted dots.
        if (hc > 0.86) {
          const sunProx = Math.max(0, 1 - Math.abs(sp.x - SUN_X) / 620);
          const a = (1 - fog) * 0.55 * (0.25 + 0.75 * sunProx);
          if (a > 0.05) {
            ctx.fillStyle = `rgba(255, 214, 140, ${a})`;
            ctx.beginPath();
            ctx.ellipse(sp.x, sp.y, 7 * sp.s * 0.4 + 2, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Whitecaps in the storm: sparse white flecks on the rough sea,
        // away from the glitter path so the two never mix into one.
        if (storm > 0.45 && hc > 0.965 && sp.x < SUN_X - 120) {
          ctx.fillStyle = `rgba(235, 244, 250, ${(storm - 0.45) * 0.7 * (1 - fog)})`;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, 4 * sp.s * 0.4 + 1.5, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Swell shading: a few huge, very faint soft patches anchored to
    // the focus point, so they move with the sea instead of sitting on
    // the screen. They break any residual quad regularity with broad
    // light and shadow, like real swell, at an alpha too low to read
    // as painted marks.
    for (let i = 0; i < 12; i += 1) {
      const wx = focusX + ((i * 733 + 211) % 2400) - 1200;
      const wz = focusZ + ((i * 521 + 137) % 1800) - 300;
      const sp2 = project(wx, 0, wz);
      if (!sp2 || sp2.depth < 40) continue;
      const rx = 320 * sp2.s;
      if (rx < 20) continue;
      const lite = i % 2 === 0;
      softBlob(sp2.x, sp2.y, rx, rx * 0.28, lite ? [52, 128, 138] : [6, 44, 56], 0.05 * (1 - fogFactor(sp2.depth)));
    }
    return project;
  }

  // ---- cloud shadows + shoreline foam -----------------------------------
  // Soft dark patches where the storm cells shade the sea and the
  // islands: a big cheap win for realism, and the reason a still frame
  // reads as a lit world instead of a flat map.
  function drawCloudShadows(project, weather) {
    for (const cell of weather.cells) {
      const p = project(cell.x, 0, cell.z);
      if (!p || p.depth < 30) continue;
      const rx = cell.r * p.s * 0.9;
      if (rx < 8) continue;
      const fogA = 1 - fogFactor(p.depth) * 0.7;
      softBlob(p.x, p.y, rx, rx * 0.42, [6, 12, 24], 0.17 * fogA * (0.5 + cell.intensity * 0.5));
    }
  }

  // White foam rings where the sea meets each island's shore. An
  // island's coastline is the circle where its bump meets sea level,
  // so the ring is drawn from the island data itself. Kept faint and
  // only for islands whose centre is actually in frame: a near or
  // off-frame island's ring is a giant arc that reads as a white
  // scratch across the scene, not as foam.
  function drawFoam(project, terrain) {
    ctx.save();
    ctx.strokeStyle = 'rgba(235, 244, 248, 0.14)';
    ctx.lineWidth = 2;
    for (const isl of terrain.islands) {
      const c = project(isl.x, 0.5, isl.z);
      if (!c || c.depth < 250 || c.x < 0 || c.x > W || c.y < 0 || c.y > H) continue;
      let started = false;
      ctx.beginPath();
      for (let k = 0; k <= 28; k += 1) {
        const a = (k / 28) * Math.PI * 2;
        const p = project(isl.x + Math.cos(a) * isl.r, 0.5, isl.z + Math.sin(a) * isl.r);
        if (!p || p.depth < 30 || p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- coastal settlements ---------------------------------------------
  // Real 3-D boxes in the world: each building is a roof quad plus the
  // two walls facing the camera (chosen by the dot product of the wall
  // normal with the direction to the camera), shaded by the sun, far
  // buildings first so near ones overlap correctly. Roads are dark
  // strips through each town; a town with a sea direction also gets
  // piers reaching into the water and a few boats.
  function drawTown(project, terrain, cam, light, haze) {
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const toCamX = -fx;
    const toCamZ = -fz;
    const quadFill = (pts, rgb, fog) => {
      let col = mix(rgb, haze, fog);
      if (light > 0) col = lit(col, 1 + light * 0.4);
      ctx.fillStyle = css(col);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill();
    };
    // Roads first, so buildings sit on top of them. Roads follow the
    // town's frame (the strip town's frame is the strip's, so a road
    // never crosses the runway).
    for (const town of terrain.towns) {
      const c = project(town.x, terrain.groundAt(town.x, town.z), town.z);
      if (!c || c.depth > 2600) continue;
      const rfx = town.rot ? town.rot.fx : 1;
      const rfz = town.rot ? town.rot.fz : 0;
      const rpx = town.rot ? town.rot.px : 0;
      const rpz = town.rot ? town.rot.pz : 1;
      for (const [dx, dz, len, wid] of [[rfx, rfz, 300, 9], [rpx, rpz, 200, 9]]) {
        const qx = -dz;
        const qz = dx;
        const corner = (sa, sw) => {
          const x = town.x + dx * sa + qx * sw;
          const z = town.z + dz * sa + qz * sw;
          return project(x, terrain.groundAt(x, z) + 0.4, z);
        };
        const pts = [corner(-len / 2, -wid / 2), corner(len / 2, -wid / 2), corner(len / 2, wid / 2), corner(-len / 2, wid / 2)];
        if (pts.some((p) => !p)) continue;
        quadFill(pts, [52, 54, 60], fogFactor(c.depth));
      }
      // Piers and boats for a coastal town.
      if (town.seaDir) {
        const [sx, sz] = town.seaDir;
        const px = -sz;
        const pz = sx;
        for (const off of [-40, 30]) {
          const ax = town.x + sx * 60 + px * off;
          const az = town.z + sz * 60 + pz * off;
          const bx = ax + sx * 70;
          const bz = az + sz * 70;
          const pts = [
            project(ax - px * 3, 0.6, az - pz * 3),
            project(ax + px * 3, 0.6, az + pz * 3),
            project(bx + px * 3, 0.6, bz + pz * 3),
            project(bx - px * 3, 0.6, bz - pz * 3),
          ];
          if (pts.some((p) => !p)) continue;
          quadFill(pts, [110, 88, 62], fogFactor(c.depth));
          // A boat moored at the pier end: white hull quad + mast.
          const hx = bx + sx * 12;
          const hz = bz + sz * 12;
          const hp = project(hx, 0.5, hz);
          if (hp && hp.depth > 30) {
            const hw = 4 * hp.s + 2;
            ctx.fillStyle = `rgba(235, 238, 242, ${0.9 * (1 - fogFactor(hp.depth))})`;
            ctx.beginPath();
            ctx.ellipse(hp.x, hp.y, hw, hw * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    const items = [];
    for (const town of terrain.towns) for (const b of town.buildings) items.push(b);
    items.sort((a, b) => {
      const da = (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2;
      const db = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2;
      return db - da;
    });
    for (const b of items) {
      const w = b.swap ? b.d : b.w;
      const d = b.swap ? b.w : b.d;
      const hw = w / 2;
      const hd = d / 2;
      // Base sunk to the lowest corner's ground, so a building on a
      // slope sits IN the ground instead of floating above it.
      const gy = Math.min(
        terrain.groundAt(b.x - hw, b.z - hd),
        terrain.groundAt(b.x + hw, b.z - hd),
        terrain.groundAt(b.x + hw, b.z + hd),
        terrain.groundAt(b.x - hw, b.z + hd),
      ) - 1;
      if (gy <= 0.5) continue; // a building in the sea is a mistake
      const top = gy + b.h;
      const c = project(b.x, gy, b.z);
      if (!c || c.depth < 30 || c.depth > 2600) continue;
      if (c.x < -120 || c.x > W + 120 || c.y < -120 || c.y > H + 120) continue;
      const fog = fogFactor(c.depth);
      const P = (x, y, z) => project(x, y, z);
      const corners = {
        b0: P(b.x - hw, gy, b.z - hd), b1: P(b.x + hw, gy, b.z - hd),
        b2: P(b.x + hw, gy, b.z + hd), b3: P(b.x - hw, gy, b.z + hd),
        t0: P(b.x - hw, top, b.z - hd), t1: P(b.x + hw, top, b.z - hd),
        t2: P(b.x + hw, top, b.z + hd), t3: P(b.x - hw, top, b.z + hd),
      };
      if (Object.values(corners).some((p) => !p)) continue;
      const walls = [
        { n: [0, -1], pts: [corners.b0, corners.b1, corners.t1, corners.t0], sun: 0.82 },
        { n: [1, 0], pts: [corners.b1, corners.b2, corners.t2, corners.t1], sun: 1.12 },
        { n: [0, 1], pts: [corners.b2, corners.b3, corners.t3, corners.t2], sun: 0.95 },
        { n: [-1, 0], pts: [corners.b3, corners.b0, corners.t0, corners.t3], sun: 0.78 },
      ];
      for (const wall of walls) {
        const dot = wall.n[0] * toCamX + wall.n[1] * toCamZ;
        if (dot <= 0.05) continue;
        // Mid-tone walls with a per-building shade: near-white cream
        // read as floating paper boxes at this scale.
        const s = wall.sun * (b.shade || 0.8);
        quadFill(wall.pts, [168 * s, 158 * s, 138 * s], fog);
      }
      // Roof with a slight overhang and a dark outline, so it reads as
      // a roof from a shallow chase angle instead of a thin sliver.
      const oh = 1.5;
      const rc = {
        t0: P(b.x - hw - oh, top, b.z - hd - oh), t1: P(b.x + hw + oh, top, b.z - hd - oh),
        t2: P(b.x + hw + oh, top, b.z + hd + oh), t3: P(b.x - hw - oh, top, b.z + hd + oh),
      };
      if (!Object.values(rc).some((p) => !p)) {
        quadFill([rc.t0, rc.t1, rc.t2, rc.t3], b.roof, fog);
        ctx.strokeStyle = 'rgba(20, 26, 40, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rc.t0.x, rc.t0.y);
        ctx.lineTo(rc.t1.x, rc.t1.y);
        ctx.lineTo(rc.t2.x, rc.t2.y);
        ctx.lineTo(rc.t3.x, rc.t3.y);
        ctx.closePath();
        ctx.stroke();
      }
    }
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
    // Grass verge: a slightly wider green pad under the asphalt, so the
    // strip sits in a field instead of floating on bare terrain.
    const verge = corners.map(([x, z]) => {
      const along = (x - strip.x) * dx + (z - strip.z) * dz;
      const across = (x - strip.x) * px + (z - strip.z) * pz;
      return [strip.x + dx * along + px * Math.sign(across) * (Math.abs(across) + 14),
        strip.z + dz * along + pz * Math.sign(across) * (Math.abs(across) + 14)];
    });
    const vpts = verge.map(([x, z]) => project(x, terrain.groundAt(x, z) + 1, z));
    if (!vpts.some((p) => !p)) {
      let grass = mix([52, 88, 48], haze, fog);
      if (light > 0) grass = lit(grass, 1 + light * 0.4);
      ctx.fillStyle = css(grass);
      ctx.beginPath();
      ctx.moveTo(vpts[0].x, vpts[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(vpts[i].x, vpts[i].y);
      ctx.closePath();
      ctx.fill();
    }
    // Asphalt with noise speckle, fogged like the terrain around it.
    let asphalt = mix([43, 47, 54], haze, fog);
    if (light > 0) asphalt = lit(asphalt, 1 + light * 0.5);
    ctx.fillStyle = css(asphalt);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // Rubber marks near both touchdown zones: dark soft patches along
    // the centreline where wheels actually meet the asphalt.
    for (const end of [-1, 1]) {
      for (let k = 0; k < 4; k += 1) {
        const t = end * (hl - 46 - k * 16);
        const p = project(strip.x + dx * t, terrain.groundAt(strip.x + dx * t, strip.z + dz * t) + 2, strip.z + dz * t);
        if (!p) continue;
        ctx.fillStyle = `rgba(18, 20, 24, ${0.30 * (1 - fog)})`;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 14 * p.s * 0.4 + 3, 4 * p.s * 0.4 + 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
    // Storm cells as shaded puff clusters: every puff is built from
    // soft-edged blobs (dark belly, lit top, warm sun-side edge), so a
    // cloud reads as a lit volume with no visible ellipse outline at
    // all. Far cells fade into fog, and a lightning flash lifts the lit
    // tops together with the terrain. The heaviest cells trail dark
    // rain shafts down to the sea.
    const lift = light > 0 ? Math.round(light * 70) : 0;
    const topBase = [132 + lift, 145 + lift, 175 + lift];
    const bellyBase = [14 + lift, 18 + lift, 32 + lift];
    for (const cell of weather.cells) {
      const puffs = [
        { dx: -0.5, dy: 0.05, r: 0.42, a: 0.85 },
        { dx: 0, dy: -0.08, r: 0.55, a: 0.9 },
        { dx: 0.5, dy: 0.06, r: 0.44, a: 0.85 },
        { dx: -0.18, dy: 0.14, r: 0.36, a: 0.8 },
        { dx: 0.22, dy: 0.15, r: 0.38, a: 0.8 },
        // Anvil cap: wide, flat, catching the sun on top.
        { dx: 0, dy: -0.22, r: 0.62, a: 0.55, anvil: true },
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
        const a = puff.a * fogA;
        // Belly first (full puff, dark), then the lit top (smaller,
        // offset up), then a warm sun-side kiss on the anvil.
        softBlob(p.x, p.y + ry * 0.28, rx, ry, bellyBase, a * 0.9);
        softBlob(p.x, p.y - ry * 0.28, rx * 0.72, ry * 0.58, topBase, a * 0.9);
        if (puff.anvil) {
          softBlob(p.x + rx * 0.25, p.y - ry * 0.3, rx * 0.5, ry * 0.4, [255, 214, 150], a * 0.5);
        }
      }
      // Rain shaft under a heavy cell: a soft dark column falling from
      // the cloud base toward the sea.
      if (cell.intensity > 0.7) {
        const top = project(cell.x, cell.base + 40, cell.z);
        const bot = project(cell.x, 0, cell.z);
        if (top && bot && top.depth > 30) {
          const w = cell.r * 0.35 * top.s;
          const sg = ctx.createLinearGradient(top.x, top.y, bot.x, bot.y);
          sg.addColorStop(0, `rgba(30, 42, 66, ${0.34 * (1 - fogFactor(top.depth) * 0.7)})`);
          sg.addColorStop(1, 'rgba(30, 42, 66, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.moveTo(top.x - w / 2, top.y);
          ctx.lineTo(top.x + w / 2, top.y);
          ctx.lineTo(bot.x + w / 3, bot.y);
          ctx.lineTo(bot.x - w / 3, bot.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawLightning(project, bolt) {
    if (!bolt) return;
    const pts = bolt.points.map((pt) => project(pt.x, pt.y, pt.z)).filter(Boolean);
    if (pts.length < 2) return;
    // Glow at the strike's cloud top, so the bolt has a source of light.
    // Kept tight: a wide bright bloom washed out the whole top of the
    // frame in the cover shot.
    const top = pts[0];
    const gg = ctx.createRadialGradient(top.x, top.y, 4, top.x, top.y, 130);
    gg.addColorStop(0, 'rgba(220, 232, 255, 0.4)');
    gg.addColorStop(1, 'rgba(220, 232, 255, 0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    // Wide soft glow under the core first, so the bolt is light in the
    // air, not a white line pasted on top of the scene.
    ctx.strokeStyle = 'rgba(190, 208, 255, 0.35)';
    ctx.lineWidth = 12;
    ctx.shadowColor = '#cfe0ff';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#f5f7ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#cfe0ff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // Two thinner branches splitting off, for a real strike shape.
    const mid = pts[Math.floor(pts.length / 2)];
    const end = pts[pts.length - 1];
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    ctx.lineTo(mid.x + (end.x - mid.x) * 0.4 + 46, mid.y + (end.y - mid.y) * 0.4 + 30);
    ctx.lineTo(mid.x + (end.x - mid.x) * 0.7 + 70, mid.y + (end.y - mid.y) * 0.7 + 64);
    ctx.stroke();
    const upper = pts[1] || pts[0];
    ctx.beginPath();
    ctx.moveTo(upper.x, upper.y);
    ctx.lineTo(upper.x - 52, upper.y + 74);
    ctx.lineTo(upper.x - 88, upper.y + 128);
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

  // ---- the plane: a true chase 3/4 view, built from parts ---------------
  // The old sprite was a long vertical dart: fuselage straight up the
  // frame, nose at the top, a big prop halo around it — it read as a
  // rocket hovering, not a plane flying forward. This one is a chase
  // view: the fuselage is a short wedge receding INTO the screen (nose
  // small and high, tail big and low), the wings spread wide with
  // perspective and dihedral, the fin rises from the tail, and the prop
  // is a small blurred disc at the nose only. Pitch still reads by
  // foreshortening (nose-up = shorter fuselage, tail drops); banking
  // foreshortens the lowered wing and, with the camera roll, tilts the
  // horizon the other way, so a bank reads as a roll, not a spinning
  // cardboard cutout.
  function drawPlane(plane, screenPos, time) {
    // Big in frame (criterion 2, and the reference's jet filling the
    // lower centre): 2x the v3 toy size. The chase 3/4 perspective is
    // unchanged — fuselage receding into the screen, never a vertical
    // dart — and at this size the detail (canopy, panels, rivets,
    // fin, prop blur, nav lights) finally reads.
    const S = 600; // sprite width in px
    const bank = plane.bank;
    const px = screenPos.x;
    const py = screenPos.y - plane.pitch * 60;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(bank * 0.55);
    const pitchSq = Math.max(0.7, Math.min(1.3, 1 - plane.pitch * 0.9));
    ctx.scale(1, pitchSq);
    const u = S / 300;
    // Wing perspective: the lowered wing (inside of the turn) shortens,
    // the raised wing lengthens.
    const leftL = Math.max(0.7, Math.min(1.3, 1 + bank * 0.22));
    const rightL = Math.max(0.7, Math.min(1.3, 1 - bank * 0.22));
    // Prop: a translucent blurred disc at the nose only, no rim ring,
    // faint spokes turning with time. Never a halo. Two discs — a wide
    // faint one and a denser core — so it reads as spinning blur.
    ctx.fillStyle = 'rgba(220, 228, 240, 0.07)';
    ctx.beginPath();
    ctx.ellipse(0, -62 * u, 26 * u, 36 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220, 228, 240, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, -62 * u, 21 * u, 30 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,244,250,0.14)';
    ctx.lineWidth = 2;
    const spoke = time * 9;
    for (let k = 0; k < 2; k += 1) {
      const a = spoke + (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5 * u, -62 * u + Math.sin(a) * 7 * u);
      ctx.lineTo(Math.cos(a) * 18 * u, -62 * u + Math.sin(a) * 27 * u);
      ctx.stroke();
    }
    // Main wings: wide, with perspective and dihedral — long tapered
    // quads with a real chord, roots at the fuselage mid, tips slightly
    // raised. The lowered wing shortens with the bank. The tip chord
    // is clearly shorter than the root chord, and a dark tip cap
    // closes it, so the wingtip is a tapered point, not a flat
    // rectangle edge.
    for (const side of [-1, 1]) {
      const L = side < 0 ? leftL : rightL;
      ctx.fillStyle = '#5a6b8c';
      ctx.beginPath();
      ctx.moveTo(side * 18 * u, -14 * u);
      ctx.lineTo(side * 150 * L * u, -6 * u);
      ctx.lineTo(side * 146 * L * u, 12 * u);
      ctx.lineTo(side * 20 * u, 10 * u);
      ctx.closePath();
      ctx.fill();
      // Sunlit leading-edge strip on top of the wing.
      ctx.fillStyle = '#6c7ea6';
      ctx.beginPath();
      ctx.moveTo(side * 18 * u, -14 * u);
      ctx.lineTo(side * 150 * L * u, -6 * u);
      ctx.lineTo(side * 147 * L * u, 0 * u);
      ctx.lineTo(side * 19 * u, -8 * u);
      ctx.closePath();
      ctx.fill();
      // Dark tapered tip cap.
      ctx.fillStyle = '#42506e';
      ctx.beginPath();
      ctx.moveTo(side * 138 * L * u, -4 * u);
      ctx.lineTo(side * 150 * L * u, -6 * u);
      ctx.lineTo(side * 146 * L * u, 12 * u);
      ctx.lineTo(side * 138 * L * u, 10 * u);
      ctx.closePath();
      ctx.fill();
      // Flap line near the root, aileron gap near the tip.
      ctx.strokeStyle = 'rgba(40, 50, 70, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(side * 26 * u, -10 * u);
      ctx.lineTo(side * 60 * L * u, -4 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 112 * L * u, -1 * u);
      ctx.lineTo(side * 144 * L * u, 12 * u);
      ctx.stroke();
    }
    // Wingtip vortex wisps in a hard bank: faint white trails curling
    // off the tips, the only visible air the plane leaves behind.
    if (Math.abs(bank) > 0.45) {
      ctx.save();
      ctx.strokeStyle = 'rgba(235, 242, 252, 0.12)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const L = side < 0 ? leftL : rightL;
        ctx.beginPath();
        ctx.moveTo(side * 148 * L * u, 8 * u);
        ctx.quadraticCurveTo(side * 168 * L * u, 30 * u, side * 158 * L * u, 58 * u);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Wingtip contrails at speed: long faint white trails streaming
    // back off the tips, the reference's speed cue. On above 55
    // (speed units) so a fast still frame always implies motion.
    if (plane.speed > 55) {
      const cf = Math.min(1, (plane.speed - 55) / 40);
      ctx.save();
      ctx.strokeStyle = `rgba(235, 242, 252, ${0.14 * cf})`;
      ctx.lineWidth = 5 * u;
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const L = side < 0 ? leftL : rightL;
        ctx.beginPath();
        ctx.moveTo(side * 148 * L * u, 8 * u);
        ctx.quadraticCurveTo(side * 170 * L * u, 46 * u, side * 158 * L * u, 96 * u);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Fuselage: a short wedge receding into the screen — nose small and
    // high (far), tail big and low (near the camera). Metallic shading:
    // shadow on the left, pale top light, a warm sun-side highlight on
    // the right (the sun is right of frame), dark belly at the tail.
    const body = ctx.createLinearGradient(-18 * u, 0, 18 * u, 0);
    body.addColorStop(0, '#6d7b9b');
    body.addColorStop(0.35, '#aab6cd');
    body.addColorStop(0.62, '#c9d2e4');
    body.addColorStop(0.85, '#e6d3a8');
    body.addColorStop(1, '#5f6d8a');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -64 * u);
    ctx.quadraticCurveTo(10 * u, -40 * u, 15 * u, -8 * u);
    ctx.quadraticCurveTo(18 * u, 40 * u, 17 * u, 88 * u);
    ctx.quadraticCurveTo(0, 98 * u, -17 * u, 88 * u);
    ctx.quadraticCurveTo(-18 * u, 40 * u, -15 * u, -8 * u);
    ctx.quadraticCurveTo(-10 * u, -40 * u, 0, -64 * u);
    ctx.fill();
    // Dark belly shade toward the tail, clipped to the fuselage.
    ctx.save();
    ctx.clip();
    const belly = ctx.createLinearGradient(0, 30 * u, 0, 100 * u);
    belly.addColorStop(0, 'rgba(20, 28, 46, 0)');
    belly.addColorStop(1, 'rgba(20, 28, 46, 0.38)');
    ctx.fillStyle = belly;
    ctx.fillRect(-20 * u, 30 * u, 40 * u, 70 * u);
    ctx.restore();
    // Amber storm-chaser stripe down the top of the fuselage.
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-5 * u, -42 * u);
    ctx.lineTo(5 * u, -42 * u);
    ctx.lineTo(8 * u, 72 * u);
    ctx.lineTo(-8 * u, 72 * u);
    ctx.closePath();
    ctx.fill();
    // Panel lines across the fuselage, longerons down each side, and
    // rivet dots along them: the skin reads as riveted metal, not paint.
    // Widths follow the wedge, so the lines stay on the skin.
    const widths = [[-30, 12], [-10, 14], [0, 16], [30, 17], [45, 17], [60, 16]];
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.55)';
    ctx.lineWidth = 1;
    for (const [yy, hw] of widths) {
      ctx.beginPath();
      ctx.moveTo(-hw * u, yy * u);
      ctx.lineTo(hw * u, yy * u);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40, 50, 70, 0.4)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 7 * u, -52 * u);
      ctx.quadraticCurveTo(side * 13 * u, -10 * u, side * 14 * u, 40 * u);
      ctx.quadraticCurveTo(side * 13 * u, 70 * u, side * 9 * u, 88 * u);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30, 40, 60, 0.7)';
    for (const [yy, hw] of widths) {
      for (const f of [-0.7, 0.7]) {
        ctx.beginPath();
        ctx.arc(f * hw * u, yy * u, 1.1 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Tail fin: a tall triangle rising from the tail over the fuselage,
    // apex leaning slightly right (the 3/4 view), with an amber flash.
    ctx.fillStyle = '#46557a';
    ctx.beginPath();
    ctx.moveTo(-11 * u, 76 * u);
    ctx.lineTo(13 * u, 76 * u);
    ctx.lineTo(5 * u, 20 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(-2 * u, 44 * u);
    ctx.lineTo(8 * u, 44 * u);
    ctx.lineTo(5 * u, 20 * u);
    ctx.closePath();
    ctx.fill();
    // Horizontal stabiliser at the tail (near the camera, so it reads
    // wide), its trailing edge lifting with pitch like an elevator.
    const elev = -plane.pitch * 10 * u;
    ctx.fillStyle = '#3d4a63';
    ctx.beginPath();
    ctx.moveTo(-8 * u, 72 * u + elev);
    ctx.lineTo(-58 * u, 84 * u + elev);
    ctx.lineTo(-54 * u, 96 * u);
    ctx.lineTo(-6 * u, 88 * u);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8 * u, 72 * u + elev);
    ctx.lineTo(58 * u, 84 * u + elev);
    ctx.lineTo(54 * u, 96 * u);
    ctx.lineTo(6 * u, 88 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 40, 60, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-52 * u, 88 * u + elev);
    ctx.lineTo(52 * u, 88 * u + elev);
    ctx.stroke();
    // Canopy with a sky reflection: pale blue at the top fading to deep
    // navy, plus a diagonal glint streak and a dark frame.
    const canopy = ctx.createLinearGradient(0, -48 * u, 0, -16 * u);
    canopy.addColorStop(0, '#9db8dd');
    canopy.addColorStop(0.45, '#4a6a94');
    canopy.addColorStop(1, '#16233c');
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.ellipse(0, -32 * u, 11 * u, 17 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 28, 46, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5 * u, -42 * u);
    ctx.lineTo(2 * u, -24 * u);
    ctx.stroke();
    // Canopy frame crossbar: the canopy reads as framed glass, not a
    // painted oval.
    ctx.strokeStyle = 'rgba(20, 28, 46, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10 * u, -32 * u);
    ctx.lineTo(10 * u, -32 * u);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-3 * u, -38 * u, 3.5 * u, 7 * u, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // SR-7 stencil on the tail of the fuselage.
    ctx.fillStyle = '#20293d';
    ctx.font = `bold ${15 * u}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SR-7', 0, 54 * u);
    // Spinner cone at the nose tip, over the prop disc.
    ctx.fillStyle = '#2c3850';
    ctx.beginPath();
    ctx.ellipse(0, -60 * u, 6 * u, 7 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    // Exhaust shimmer: a prop plane has no afterburner, so the heat
    // is a small pulsing amber glow at the exhaust stubs on the
    // cowling sides — hot metal, not flame, and never a jet.
    const exGlow = 0.5 + 0.3 * Math.sin(time * 11);
    for (const side of [-1, 1]) {
      const ex = ctx.createRadialGradient(side * 16 * u, -28 * u, 1, side * 16 * u, -28 * u, 14 * u);
      ex.addColorStop(0, `rgba(255, 180, 90, ${0.55 * exGlow})`);
      ex.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = ex;
      ctx.beginPath();
      ctx.arc(side * 16 * u, -28 * u, 14 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    // Navigation lights with glow halos: red left, green right, white
    // tail strobe, at the wingtips of the new wing geometry.
    const blink = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff3c3c';
    ctx.fillStyle = `rgba(255, 60, 60, ${0.6 + 0.4 * blink})`;
    ctx.beginPath();
    ctx.arc(-148 * leftL * u, 8 * u, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#50ff78';
    ctx.fillStyle = `rgba(80, 255, 120, ${0.6 + 0.4 * blink})`;
    ctx.beginPath();
    ctx.arc(148 * rightL * u, 8 * u, 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#fff';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 96 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Landing gear when down: struts and wheels under the tail.
    if (plane.gearDown) {
      ctx.fillStyle = '#1c2434';
      ctx.fillRect(-15 * u, 90 * u, 4 * u, 18 * u);
      ctx.fillRect(11 * u, 90 * u, 4 * u, 18 * u);
      ctx.beginPath();
      ctx.arc(-13 * u, 112 * u, 6 * u, 0, Math.PI * 2);
      ctx.arc(13 * u, 112 * u, 6 * u, 0, Math.PI * 2);
      ctx.fill();
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
    // Low chase camera, close behind the plane and looking forward:
    // the reference's low rear view, so the world below is close and
    // detailed and the horizon sits high in the frame.
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    const cam = {
      x: plane.x - fx * 36,
      y: plane.y + 9,
      z: plane.z - fz * 36,
      yaw: plane.heading,
      pitch: -0.06 - plane.pitch * 0.35,
      roll: plane.bank * 0.55,
    };
    const project = drawTerrain(terrain, cam, region, flash, storm);
    drawCloudShadows(project, weather);
    drawFoam(project, terrain);
    drawTown(project, terrain, cam, flash, hazeRgb(region));
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
          // A dot landing on the FUEL/DMG panel or the radar scope
          // would paint over the instruments: skip it, same as the
          // active circle's clip.
          if (p.x > 12 && p.x < 274 && p.y > H - 98 && p.y < H - 10) continue;
          if (p.x > 12 && p.x < 142 && p.y > H - 222 && p.y < H - 92) continue;
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
        // (bottom-left, 18,H-92,250x76) or the radar scope above it
        // (18,H-216,118x118). No shrink — the evenodd clip below
        // already cuts the arc out of both rects, so the zone stays
        // big and readable and the instruments simply sit in front of
        // it. (A shrink rule here crushed the circle to ~33 px in v2.)
        let radius = Math.min(drop.r * p.s * 0.9, 130);
        if (radius < 4) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.rect(12, H - 98, 262, 88);
        ctx.rect(12, H - 222, 130, 124);
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
    drawPlane(plane, { x: CX, y: H * 0.68 }, time);
    drawRain(storm, time, plane);
    drawSpeedStreaks(plane, time);
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
    drawHUD(plane, mission, world.target, time, terrain);
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
