// Storm Runner — the 3-D world: Three.js scene, sky, sun, fog, heightmap
// terrain, sea, strips, coastal towns, 3-D clouds, rings, lightning and
// the SR-7 built from primitives. The 2-D overlay canvas (render.js) still
// draws the HUD, rain and menus on top; this module only paints the world.
//
// Coordinates: three.js +X east, +Y up, +Z south. The flight model says
// forward = (sin heading, cos heading) in (x, z), so a model built facing
// +Z with rotation.y = heading flies the right way. Pitch: nose-up is
// positive in the flight model; rotation.x = -pitch. Bank: positive bank
// rolls the right wing down; rotation.z = -bank. Camera roll: the chase
// view tilts the horizon clockwise with a right bank, like the old 2-D
// camera did (canvas rotate(bank * 0.55)).
import * as THREE from 'three';
import { REGIONS } from './config.js';

const W = 1280;
const H = 720;

function hex(rgb) {
  return new THREE.Color(rgb);
}
function parseHex(hexStr) {
  return [parseInt(hexStr.slice(1, 3), 16), parseInt(hexStr.slice(3, 5), 16), parseInt(hexStr.slice(5, 7), 16)];
}

// Radial-gradient sprite texture, generated in code (no assets).
function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.4, outer);
  grad.addColorStop(1, 'rgba(255, 220, 160, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createWorld3D(glCanvas) {
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);

  let scene = null;      // current play scene
  let builtFor = null;   // world object the scene was built for
  let hangarScene = null;
  let hangarPlane = null;
  let cameraMode = 'chase';
  let shake = 0;
  let lastBolt = null;
  let boltMesh = null;
  let boltLight = null;
  let lastTime = 0;
  let trailTimer = 0;

  // Per-scene handles, rebuilt with each world.
  let S = null;

  // ---- the SR-7, built from primitives ----------------------------------
  // Single-prop storm chaser, own shape: single tail fin, amber stripe,
  // prop blur disc + amber exhaust shimmer. No twin tails, no jet flames.
  function buildPlaneModel() {
    const group = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0xc6d2e4, flatShading: true });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0x7e90b8, flatShading: true });
    const wingTop = new THREE.MeshLambertMaterial({ color: 0x8ba0c6, flatShading: true });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x5b6a8c, flatShading: true });
    const finMat = new THREE.MeshLambertMaterial({ color: 0x64749e, flatShading: true });
    const amberMat = new THREE.MeshLambertMaterial({ color: 0xffb347, flatShading: true });
    const canopyMat = new THREE.MeshPhongMaterial({ color: 0x4a6a94, shininess: 120, specular: 0xaac4e8 });
    // Fuselage: tapered cylinder along +Z (nose +Z), nose cone, tail cone.
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 6.5, 10), metal);
    fus.geometry.rotateX(Math.PI / 2);
    fus.position.z = 0.5;
    group.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 10), metal);
    nose.geometry.rotateX(Math.PI / 2);
    nose.position.z = 4.5;
    group.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.92, 2.4, 10), metal);
    tail.geometry.rotateX(-Math.PI / 2);
    tail.position.z = -4.4;
    group.add(tail);
    // Amber storm-chaser stripe down the top of the fuselage.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 5.6), amberMat);
    stripe.position.set(0, 0.82, 0.4);
    group.add(stripe);
    // Canopy + pilot head inside it.
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), canopyMat);
    canopy.scale.set(0.9, 0.72, 1.6);
    canopy.position.set(0, 0.72, 1.7);
    group.add(canopy);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2f3a }),
    );
    head.position.set(0, 0.68, 1.35);
    group.add(head);
    // Main wings: two halves with a little dihedral, tapered tip caps.
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 2.3), wingMat);
      wing.position.set(side * 2.9, 0.05, 0.2);
      wing.rotation.z = side * -0.07;
      group.add(wing);
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 1.1), wingTop);
      top.position.set(side * 2.9, 0.17, -0.35);
      top.rotation.z = side * -0.07;
      group.add(top);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.9), darkMat);
      tip.position.set(side * 5.55, 0.24, 0.2);
      tip.rotation.z = side * -0.07;
      group.add(tip);
      // Nav light at the tip.
      const nav = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 6),
        new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff3c3c : 0x50ff78 }),
      );
      nav.position.set(side * 5.7, 0.28, 0.2);
      group.add(nav);
    }
    // Tail fin (single) with amber flash, horizontal stabiliser.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 1.7), finMat);
    fin.position.set(0, 1.15, -4.6);
    fin.rotation.x = -0.18;
    group.add(fin);
    const flash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.9), amberMat);
    flash.position.set(0, 1.35, -4.45);
    flash.rotation.x = -0.18;
    group.add(flash);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.14, 1.4), darkMat);
    stab.position.set(0, 0.25, -4.9);
    group.add(stab);
    // Prop: blurred disc + two spinning blades + spinner cone.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 24),
      new THREE.MeshBasicMaterial({ color: 0xdce4f0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.position.z = 5.35;
    group.add(disc);
    const prop = new THREE.Group();
    prop.position.z = 5.32;
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x46536e });
    for (let k = 0; k < 2; k += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.1, 0.08), bladeMat);
      blade.rotation.z = (k * Math.PI) / 2;
      prop.add(blade);
    }
    group.add(prop);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 10), darkMat);
    spinner.geometry.rotateX(Math.PI / 2);
    spinner.position.z = 5.45;
    group.add(spinner);
    // Exhaust shimmer: small pulsing amber glows at the cowling sides.
    const exhausts = [];
    for (const side of [-1, 1]) {
      const ex = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, opacity: 0.5 }),
      );
      ex.position.set(side * 0.62, 0.05, 3.4);
      group.add(ex);
      exhausts.push(ex);
    }
    // Landing gear (shown when down): struts + wheels.
    const gear = new THREE.Group();
    const strutMat = new THREE.MeshLambertMaterial({ color: 0x333e52 });
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), strutMat);
      strut.position.set(side * 0.7, -0.95, 1.2);
      gear.add(strut);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), strutMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.7, -1.5, 1.2);
      gear.add(wheel);
    }
    group.add(gear);
    // Tail strobe.
    const strobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    strobe.position.set(0, 0.3, -5.6);
    group.add(strobe);
    group.rotation.order = 'YXZ';
    return { group, prop, gear, exhausts, disc };
  }

  // ---- sky dome shader ----------------------------------------------------
  function makeSky(region) {
    const top = parseHex(region.sky[0]);
    const mid = parseHex(region.sky[1]);
    const hor = parseHex(region.sky[2]);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(top[0] / 255, top[1] / 255, top[2] / 255) },
        midColor: { value: new THREE.Color(mid[0] / 255, mid[1] / 255, mid[2] / 255) },
        horizonColor: { value: new THREE.Color(hor[0] / 255, hor[1] / 255, hor[2] / 255) },
        sunDir: { value: new THREE.Vector3(0.5, 0.25, -0.8).normalize() },
        sunColor: { value: new THREE.Color(1.0, 0.78, 0.45) },
        flash: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor; uniform vec3 midColor; uniform vec3 horizonColor;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float flash;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.08, 1.0);
          vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
          col = mix(col, topColor, smoothstep(0.22, 0.72, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * pow(s, 18.0) * 0.55;
          col += sunColor * pow(s, 220.0) * 1.6;
          col += vec3(0.83, 0.89, 1.0) * flash * 0.22;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7500, 24, 12), mat);
    dome.renderOrder = -10;
    return { dome, mat };
  }

  function disposeScene(sc) {
    if (!sc) return;
    sc.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  // ---- build the play scene for one world --------------------------------
  function buildScene(world) {
    const { terrain, weather, region } = world;
    const sc = new THREE.Scene();
    const haze = parseHex(region.sky[2]);
    sc.fog = new THREE.Fog(new THREE.Color(haze[0] / 255, haze[1] / 255, haze[2] / 255), 900, 4200);

    const hemi = new THREE.HemisphereLight(0xbfd0e8, 0x4a5548, 1.3);
    sc.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
    sc.add(sun);
    sc.add(sun.target);
    // Fill light from behind the plane (opposite the sun): the chase
    // camera looks at the plane's shadow side, so without it the SR-7
    // reads as a near-black silhouette. Sun position/direction untouched.
    const fill = new THREE.DirectionalLight(0xcfd9ee, 0.5);
    sc.add(fill);
    sc.add(fill.target);

    const sky = makeSky(region);
    sc.add(sky.dome);
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255, 240, 200, 0.95)', 'rgba(255, 200, 110, 0.55)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sunSprite.scale.set(750, 750, 1);
    sc.add(sunSprite);

    // Terrain: full-world heightmap mesh, vertex colours from the same
    // colour function the 2-D renderer used, so the palette is familiar.
    const SEG = 150;
    const SIZE = 5200;
    const CELL = SIZE / SEG;
    const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    tGeo.rotateX(-Math.PI / 2);
    const pos = tGeo.attributes.position;
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) heights[i] = terrain.height(pos.getX(i), pos.getZ(i));
    const cols = new Float32Array(pos.count * 3);
    const idx = (ix, iz) => iz * (SEG + 1) + ix;
    for (let iz = 0; iz <= SEG; iz += 1) {
      for (let ix = 0; ix <= SEG; ix += 1) {
        const i = idx(ix, iz);
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const h = heights[i];
        pos.setY(i, h);
        const hL = heights[idx(Math.max(ix - 1, 0), iz)];
        const hR = heights[idx(Math.min(ix + 1, SEG), iz)];
        const hU = heights[idx(ix, Math.max(iz - 1, 0))];
        const hD = heights[idx(ix, Math.min(iz + 1, SEG))];
        const slope = Math.max(Math.abs(hR - hL), Math.abs(hD - hU)) / (2 * CELL);
        const c = terrain.colour(x, z, h, slope);
        cols[i * 3] = c[0] / 255;
        cols[i * 3 + 1] = c[1] / 255;
        cols[i * 3 + 2] = c[2] / 255;
      }
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const terrainMesh = new THREE.Mesh(tGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    sc.add(terrainMesh);

    // Sea: one big plane; Phong specular gives the sun glitter path.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(11000, 11000),
      new THREE.MeshPhongMaterial({ color: 0x0d4b58, specular: 0x99aa88, shininess: 120, transparent: true, opacity: 0.97 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0;
    sc.add(sea);
    // Foam rings where the sea meets each island's shore.
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xebf4f8, transparent: true, opacity: 0.16, depthWrite: false });
    for (const isl of terrain.islands) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(isl.r * 0.94, isl.r * 1.0, 40), foamMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(isl.x, 0.6, isl.z);
      sc.add(ring);
    }

    // Strips: verge, asphalt, markings, edge + approach lights.
    const strips = new THREE.Group();
    for (const rg of REGIONS) {
      const strip = rg.strip;
      const gy = terrain.groundAt(strip.x, strip.z);
      const g = new THREE.Group();
      const verge = new THREE.Mesh(
        new THREE.BoxGeometry(strip.width + 28, 1, strip.length + 28),
        new THREE.MeshLambertMaterial({ color: 0x345830 }),
      );
      verge.position.y = gy + 0.4;
      g.add(verge);
      const asphalt = new THREE.Mesh(
        new THREE.BoxGeometry(strip.width, 1.4, strip.length),
        new THREE.MeshLambertMaterial({ color: 0x2b2f36 }),
      );
      asphalt.position.y = gy + 0.9;
      g.add(asphalt);
      const markMat = new THREE.MeshBasicMaterial({ color: 0xf0f2f5 });
      for (let t = -strip.length / 2 + 30; t < strip.length / 2 - 10; t += 45) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 22), markMat);
        dash.position.set(0, gy + 1.7, t);
        g.add(dash);
      }
      for (const end of [-1, 1]) {
        for (const side of [-0.6, -0.2, 0.2, 0.6]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 8), markMat);
          bar.position.set(side * strip.width * 0.5, gy + 1.7, end * (strip.length / 2 - 14));
          g.add(bar);
        }
      }
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      for (const side of [-1, 1]) {
        for (let t = -strip.length / 2; t <= strip.length / 2; t += 60) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), edgeMat);
          bulb.position.set(side * strip.width * 0.5, gy + 2.2, t);
          g.add(bulb);
        }
      }
      const appMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let k = 1; k <= 5; k += 1) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), appMat);
        bulb.position.set(0, gy + 2.2, -strip.length / 2 - k * 28);
        g.add(bulb);
      }
      g.position.set(strip.x, 0, strip.z);
      g.rotation.y = strip.heading;
      strips.add(g);
    }
    sc.add(strips);

    // Coastal towns: instanced wall + roof boxes from the same data the
    // 2-D renderer extruded, so towns sit on the same plots.
    const allBuildings = [];
    for (const town of terrain.towns) for (const b of town.buildings) allBuildings.push(b);
    const wallMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      Math.max(1, allBuildings.length),
    );
    const roofMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      Math.max(1, allBuildings.length),
    );
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc3 = new THREE.Vector3();
    const p3 = new THREE.Vector3();
    const col = new THREE.Color();
    allBuildings.forEach((b, i) => {
      const w = b.swap ? b.d : b.w;
      const d = b.swap ? b.w : b.d;
      const gy = Math.min(
        terrain.groundAt(b.x - w / 2, b.z - d / 2),
        terrain.groundAt(b.x + w / 2, b.z - d / 2),
        terrain.groundAt(b.x + w / 2, b.z + d / 2),
        terrain.groundAt(b.x - w / 2, b.z + d / 2),
      ) - 1;
      const s = (b.shade || 0.8);
      q.identity();
      p3.set(b.x, gy + b.h / 2, b.z);
      sc3.set(w, b.h, d);
      m4.compose(p3, q, sc3);
      wallMesh.setMatrixAt(i, m4);
      wallMesh.setColorAt(i, col.setRGB(0.66 * s, 0.62 * s, 0.54 * s));
      p3.set(b.x, gy + b.h + 0.7, b.z);
      sc3.set(w + 3, 1.4, d + 3);
      m4.compose(p3, q, sc3);
      roofMesh.setMatrixAt(i, m4);
      roofMesh.setColorAt(i, col.setRGB(b.roof[0] / 255, b.roof[1] / 255, b.roof[2] / 255));
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    roofMesh.instanceMatrix.needsUpdate = true;
    if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
    if (roofMesh.instanceColor) roofMesh.instanceColor.needsUpdate = true;
    sc.add(wallMesh);
    sc.add(roofMesh);
    // Roads: two dark strips per town, piers + boats for coastal towns.
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x34363c });
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x6e583e });
    const boatMat = new THREE.MeshLambertMaterial({ color: 0xebeeF2 });
    for (const town of terrain.towns) {
      const gy = terrain.groundAt(town.x, town.z);
      const rfx = town.rot ? town.rot.fx : 1;
      const rfz = town.rot ? town.rot.fz : 0;
      const rpx = town.rot ? town.rot.px : 0;
      const rpz = town.rot ? town.rot.pz : 1;
      for (const [dx, dz, len, wid] of [[rfx, rfz, 300, 9], [rpx, rpz, 200, 9]]) {
        const road = new THREE.Mesh(new THREE.BoxGeometry(wid, 0.5, len), roadMat);
        road.position.set(town.x, gy + 0.5, town.z);
        road.rotation.y = Math.atan2(dx, dz);
        sc.add(road);
      }
      if (town.seaDir) {
        const [sx, sz] = town.seaDir;
        const px = -sz;
        const pz = sx;
        for (const off of [-40, 30]) {
          const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 70), pierMat);
          pier.position.set(town.x + sx * 95 + px * off, 1, town.z + sz * 95 + pz * off);
          pier.rotation.y = Math.atan2(sx, sz);
          sc.add(pier);
          const boat = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 12), boatMat);
          boat.position.set(town.x + sx * 140 + px * off, 1, town.z + sz * 140 + pz * off);
          boat.rotation.y = Math.atan2(sx, sz);
          sc.add(boat);
        }
      }
    }

    // Storm clouds: instanced flattened icosahedron puffs, one cluster
    // per weather cell plus a distant ambient bank. Smooth shading +
    // a small emissive lift: flat-shaded dark facets are what made
    // single puffs read as grey rocks. Rain shafts under heavy cells,
    // dark cloud shadows on the sea below them.
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    const puffMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, flatShading: false,
      emissive: 0x3d4658, emissiveIntensity: 1,
    });
    const puffs = [];
    for (const cell of weather.cells) {
      const defs = [
        [-0.4, 0.0, 0.32, 0.16], [-0.2, 0.06, 0.34, 0.2], [0.0, -0.04, 0.38, 0.22],
        [0.2, 0.02, 0.34, 0.18], [0.4, 0.06, 0.3, 0.16], [-0.28, 0.12, 0.28, 0.18],
        [-0.05, 0.12, 0.3, 0.2], [0.18, 0.14, 0.28, 0.16], [-0.35, -0.12, 0.3, 0.12],
        [-0.1, -0.14, 0.36, 0.14], [0.12, -0.16, 0.38, 0.12], [0.35, -0.1, 0.3, 0.14],
        [-0.15, 0.2, 0.26, 0.18], [0.05, 0.2, 0.28, 0.16], [0.0, -0.24, 0.42, 0.1],
        [-0.5, -0.05, 0.26, 0.14],
      ];
      for (const [dx, dy, r, light] of defs) {
        puffs.push({
          x: cell.x + dx * cell.r * 0.9, y: cell.base + 80 + dy * cell.r * 0.35, z: cell.z + dx * cell.r * 0.18,
          sx: cell.r * r * 0.36, sy: cell.r * r * 0.28, sz: cell.r * r * 0.5, light,
          top: dy >= 0.08 ? 1 : dy <= -0.08 ? 0 : 0.5,
        });
      }
    }
    // Ambient bank: a wide ring of distant cloud CLUSTERS far out, so the
    // horizon is never bare. Each cloud is 6 small overlapping puffs with
    // a lumpy silhouette — one isolated ellipsoid reads as a UFO or rock.
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const r = 3700 + (i % 5) * 220;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 430 + (i % 4) * 70;
      for (let j = 0; j < 8; j += 1) {
        const ox = (((i * 7 + j * 37) % 60) - 30);
        const oy = (((i * 5 + j * 53) % 60) - 15);
        const oz = (((i * 3 + j * 29) % 50) - 25);
        const sz = 55 + ((i * 7 + j * 13) % 45);
        puffs.push({
          x: cx + ox, y: cy + oy, z: cz + oz,
          sx: sz, sy: sz * 0.55, sz: sz * 0.8, light: 0.5, top: oy > 10 ? 1 : 0.5,
        });
      }
    }
    // Keep the sight line to each ring clear: no puff may sit in the
    // corridor from the plane to a ring, or a cloud reads as a rock
    // inside the ring (the cover shot's worst lie). Cosmetic only —
    // clouds never affect flight, missions or collision.
    const ringCorridor = [];
    if (world.mission && world.mission.rings) {
      const px = world.plane.x, py = world.plane.y, pz = world.plane.z;
      for (const ring of world.mission.rings) {
        const dx = ring.x - px, dy = ring.y - py, dz = ring.z - pz;
        const len = Math.hypot(dx, dy, dz) || 1;
        ringCorridor.push({ px, py, pz, dx: dx / len, dy: dy / len, dz: dz / len });
      }
    }
    function inRingCorridor(x, y, z) {
      for (const c of ringCorridor) {
        const vx = x - c.px, vy = y - c.py, vz = z - c.pz;
        const t = vx * c.dx + vy * c.dy + vz * c.dz;
        // Out to 8000 m: the distant ambient bank sits 3700–4500 m
        // out, and a far puff on the ray still projects inside a ring.
        if (t < 0 || t > 8000) continue;
        const cx = c.px + c.dx * t, cy = c.py + c.dy * t, cz = c.pz + c.dz * t;
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz);
        if (d2 < 200 * 200) return true;
      }
      return false;
    }
    const visiblePuffs = puffs.filter((p) => !inRingCorridor(p.x, p.y, p.z));
    const cloudMesh = new THREE.InstancedMesh(puffGeo, puffMat, visiblePuffs.length);
    visiblePuffs.forEach((p, i) => {
      q.identity();
      p3.set(p.x, p.y, p.z);
      sc3.set(p.sx, p.sy, p.sz);
      m4.compose(p3, q, sc3);
      cloudMesh.setMatrixAt(i, m4);
      const l = p.light;
      if (p.top === 1) {
        // Sunlit top: near-white blue, so the cluster reads as cloud.
        cloudMesh.setColorAt(i, col.setRGB(0.74 + l * 0.2, 0.78 + l * 0.18, 0.88 + l * 0.1));
      } else if (p.top === 0) {
        // Storm belly underneath: mid grey-blue, lifted so it never
        // reads as a dark rock (the old 0.2 floor was the boulder look).
        cloudMesh.setColorAt(i, col.setRGB(0.42 + l * 0.14, 0.45 + l * 0.14, 0.54 + l * 0.14));
      } else {
        cloudMesh.setColorAt(i, col.setRGB(0.58 + l * 0.26, 0.61 + l * 0.24, 0.7 + l * 0.2));
      }
    });
    cloudMesh.instanceMatrix.needsUpdate = true;
    if (cloudMesh.instanceColor) cloudMesh.instanceColor.needsUpdate = true;
    sc.add(cloudMesh);
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x1e2a42, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x060c18, transparent: true, opacity: 0.16, depthWrite: false });
    for (const cell of weather.cells) {
      if (cell.intensity > 0.7) {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(cell.r * 0.32, cell.r * 0.42, cell.base + 40, 12, 1, true), shaftMat);
        shaft.position.set(cell.x, (cell.base + 40) / 2, cell.z);
        sc.add(shaft);
      }
      const sh = new THREE.Mesh(new THREE.CircleGeometry(cell.r * 0.9, 24), shadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(cell.x, 0.7, cell.z);
      sc.add(sh);
    }

    // Rings: amber torus, Y-billboarded to face the camera; done ones green.
    const ringGroup = new THREE.Group();
    const ringMeshes = [];
    const ringLabelTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      g.font = 'bold 40px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.fillText('RING', 128, 34);
      return new THREE.CanvasTexture(c);
    })();
    for (const ring of (world.mission ? world.mission.rings : [])) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(ring.r, 2.2, 10, 48),
        new THREE.MeshBasicMaterial({ color: ring.done ? 0x78dc8c : 0xffb347 }),
      );
      mesh.position.set(ring.x, ring.y, ring.z);
      ringGroup.add(mesh);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringLabelTex, transparent: true, depthWrite: false }));
      label.scale.set(64, 16, 1);
      label.position.set(ring.x, ring.y - ring.r - 20, ring.z);
      ringGroup.add(label);
      ringMeshes.push({ mesh, ring, label });
    }
    sc.add(ringGroup);

    // Drop zones for cargo missions: ground ring + disc, active zone bright.
    const dropGroup = new THREE.Group();
    if (world.mission && world.mission.drops) {
      const activeDrop = world.mission.drops.find((d) => !d.done) || null;
      for (const drop of world.mission.drops) {
        const gy = terrain.groundAt(drop.x, drop.z) + 2;
        if (drop !== activeDrop) {
          // Zones still to come are small dots, so the player sees where
          // they are without overlapping full circles on one strip.
          const dot = new THREE.Mesh(
            new THREE.CircleGeometry(6, 16),
            new THREE.MeshBasicMaterial({ color: 0x78dc8c, transparent: true, opacity: 0.85, depthWrite: false }),
          );
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(drop.x, gy, drop.z);
          dropGroup.add(dot);
          continue;
        }
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(drop.r * 0.92, drop.r, 40),
          new THREE.MeshBasicMaterial({ color: 0x78dc8c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(drop.x, gy, drop.z);
        dropGroup.add(ring);
        const discM = new THREE.Mesh(
          new THREE.CircleGeometry(drop.r * 0.92, 40),
          new THREE.MeshBasicMaterial({ color: 0x78dc8c, transparent: true, opacity: 0.1, depthWrite: false }),
        );
        discM.rotation.x = -Math.PI / 2;
        discM.position.set(drop.x, gy + 0.2, drop.z);
        dropGroup.add(discM);
      }
    }
    sc.add(dropGroup);

    // The plane + blob shadow + wingtip vapour trail pool.
    const planeParts = buildPlaneModel();
    sc.add(planeParts.group);
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    sc.add(blob);
    const trailSprites = [];
    const trailMat = new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0.35)'),
      transparent: true, opacity: 0, depthWrite: false,
    });
    for (let i = 0; i < 60; i += 1) {
      const sp = new THREE.Sprite(trailMat.clone());
      sp.visible = false;
      sc.add(sp);
      trailSprites.push({ sp, life: 0 });
    }

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 12000);
    sc.add(camera);
    return {
      scene: sc, hemi, sun, fill, sky, sunSprite, planeParts, blob, trailSprites,
      ringMeshes, camera, terrain, weather, region,
    };
  }

  function sunDirFor(heading) {
    // Low sun ahead-right of the nose, like the reference's sunset: the
    // light rakes across the water in every staged frame.
    const a = heading - 0.5;
    const el = 0.3;
    return new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
  }

  function updateBolt(sc, bolt) {
    if (bolt === lastBolt) return;
    lastBolt = bolt;
    if (boltMesh) {
      sc.remove(boltMesh);
      boltMesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      boltMesh = null;
    }
    if (boltLight) {
      sc.remove(boltLight);
      boltLight = null;
    }
    if (!bolt) return;
    const pts = bolt.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(pts);
    boltMesh = new THREE.Group();
    // Thick core + wide glow: at 400–600 m a 1.6 m tube is ~5 px and
    // reads as a white scratch. A 4.5 m core with a 15 m halo reads as
    // lightning, like the v3.2 2-D bolt did.
    const core = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 4.5, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xf5f7ff }),
    );
    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 15, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    boltMesh.add(core);
    boltMesh.add(glow);
    // Two branches off the main channel, deterministic (derived from
    // the bolt's own points, no new randomness).
    for (let b = 0; b < 2; b += 1) {
      const idx = 2 + b * 2;
      if (idx >= pts.length - 1) continue;
      const p0 = pts[idx];
      const p1 = pts[idx + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      let sx = -dz / len, sz = dx / len;
      if (Math.hypot(sx, sz) < 0.1) { sx = 1; sz = 0; }
      const side = b === 0 ? 1 : -1;
      const bpts = [new THREE.Vector3(p0.x, p0.y, p0.z)];
      for (let k = 1; k <= 3; k += 1) {
        bpts.push(new THREE.Vector3(
          p0.x + sx * side * 34 * k + dx * 0.25 * k,
          p0.y - 42 * k,
          p0.z + sz * side * 34 * k + dz * 0.25 * k,
        ));
      }
      const bcurve = new THREE.CatmullRomCurve3(bpts);
      boltMesh.add(new THREE.Mesh(
        new THREE.TubeGeometry(bcurve, 12, 1.3, 5, false),
        new THREE.MeshBasicMaterial({ color: 0xf5f7ff }),
      ));
      boltMesh.add(new THREE.Mesh(
        new THREE.TubeGeometry(bcurve, 12, 3.6, 5, false),
        new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.3, depthWrite: false }),
      ));
    }
    sc.add(boltMesh);
    boltLight = new THREE.PointLight(0xdce8ff, 90000, 2200, 1.6);
    boltLight.position.set(pts[0].x, pts[0].y, pts[0].z);
    sc.add(boltLight);
  }

  function renderPlay(world, time, flash, storm) {
    if (builtFor !== world) {
      if (scene) disposeScene(scene);
      S = buildScene(world);
      scene = S.scene;
      builtFor = world;
      lastBolt = null;
      boltMesh = null;
      boltLight = null;
      lastTime = time;
    }
    const { plane, weather, region } = world;
    const dt = Math.max(0, Math.min(0.25, time - lastTime));
    lastTime = time;

    // Sun follows the nose so the sunset light is in frame for every shot.
    const sunDir = sunDirFor(plane.heading);
    S.sun.position.set(plane.x + sunDir.x * 800, plane.y + sunDir.y * 800, plane.z + sunDir.z * 800);
    S.sun.target.position.set(plane.x, plane.y, plane.z);
    S.sun.target.updateMatrixWorld();
    S.sky.mat.uniforms.sunDir.value.copy(sunDir);
    S.sky.mat.uniforms.flash.value = flash;
    S.sky.dome.position.set(plane.x, 0, plane.z);
    S.sunSprite.position.set(
      plane.x + sunDir.x * 6800, plane.y + sunDir.y * 6800, plane.z + sunDir.z * 6800,
    );
    // Fill light sits opposite the sun, above the tail: it lifts the
    // plane's shadow side for the chase camera. Sun direction untouched.
    S.fill.position.set(plane.x - sunDir.x * 800, plane.y + 260, plane.z - sunDir.z * 800);
    S.fill.target.position.set(plane.x, plane.y, plane.z);
    S.fill.target.updateMatrixWorld();
    S.hemi.intensity = 1.3 + flash * 0.7;
    S.sun.intensity = 1.7 + flash * 1.1;

    // Plane transform.
    const pp = S.planeParts;
    pp.group.position.set(plane.x, plane.y, plane.z);
    pp.group.rotation.y = plane.heading;
    pp.group.rotation.x = -plane.pitch;
    pp.group.rotation.z = -plane.bank;
    pp.group.visible = cameraMode !== 'cockpit';
    pp.prop.rotation.z = time * 25;
    pp.gear.visible = plane.gearDown;
    const exGlow = 0.35 + 0.3 * Math.sin(time * 11);
    for (const ex of pp.exhausts) ex.material.opacity = exGlow;
    pp.disc.material.opacity = 0.10 + 0.05 * Math.sin(time * 7);

    // Blob shadow under the plane when low.
    const ground = S.terrain.groundAt(plane.x, plane.z);
    const alt = plane.y - ground;
    S.blob.visible = alt < 120;
    if (S.blob.visible) {
      S.blob.position.set(plane.x, ground + 0.8, plane.z);
      const s = Math.max(0.4, 1 - alt / 160);
      S.blob.scale.setScalar(1 + (1 - s) * 1.5);
      S.blob.material.opacity = 0.24 * s;
    }

    // Wingtip vapour: sprite puffs at the tips when fast or banking hard.
    const trailOn = plane.speed > 55 || Math.abs(plane.bank) > 0.45;
    trailTimer -= dt;
    if (trailOn && trailTimer <= 0) {
      trailTimer = 0.06;
      const v = new THREE.Vector3();
      for (const side of [-1, 1]) {
        const slot = S.trailSprites.find((t) => t.life <= 0);
        if (!slot) break;
        v.set(side * 5.6, 0.2, 0.2);
        pp.group.localToWorld(v);
        slot.sp.position.copy(v);
        slot.life = 1.4;
        slot.sp.visible = true;
      }
    }
    for (const t of S.trailSprites) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.sp.visible = false; continue; }
      const f = t.life / 1.4;
      t.sp.material.opacity = 0.32 * f;
      const s = 3 + (1 - f) * 7;
      t.sp.scale.set(s, s, 1);
    }

    // Rings face the camera (Y-billboard), done ones turn green.
    const cam = S.camera;
    for (const { mesh, ring } of S.ringMeshes) {
      mesh.rotation.y = Math.atan2(cam.position.x - ring.x, cam.position.z - ring.z);
      mesh.material.color.setHex(ring.done ? 0x78dc8c : 0xffb347);
    }

    // Lightning bolt (live or staged) as a real 3-D tube.
    updateBolt(scene, weather.bolt || world.forcedBolt || null);

    // Camera.
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    if (shake > 0) shake *= 0.86;
    if (cameraMode === 'cockpit') {
      cam.position.set(
        plane.x + fx * 1.0 + jx, plane.y + 1.05 + jy, plane.z + fz * 1.0,
      );
      cam.lookAt(plane.x + fx * 120, plane.y + plane.pitch * 45 + 1, plane.z + fz * 120);
      cam.rotateZ(-plane.bank * 0.3);
    } else if (cameraMode === 'orbit') {
      const a = time * 0.12;
      cam.position.set(plane.x + Math.sin(a) * 60 + jx, plane.y + 20 + jy, plane.z + Math.cos(a) * 60);
      cam.lookAt(plane.x, plane.y, plane.z);
    } else {
      // Tight 3/4 rear chase: 20 m back, 4.5 m up, banking with the
      // plane; aim slightly up so the plane sits low-centre against
      // the sky, not top-down over the ground.
      cam.position.set(plane.x - fx * 17 + jx, plane.y + 4 + jy, plane.z - fz * 17);
      cam.lookAt(plane.x + fx * 30, plane.y + 5, plane.z + fz * 30);
      cam.rotateZ(-plane.bank * 0.55);
    }
    renderer.render(scene, cam);
  }

  function renderHangar(time) {
    if (!hangarScene) {
      const sc = new THREE.Scene();
      sc.fog = new THREE.Fog(0x141a26, 30, 90);
      sc.add(new THREE.HemisphereLight(0xbfd0e8, 0x2a2f22, 1.0));
      const key = new THREE.DirectionalLight(0xffe0b0, 2.0);
      key.position.set(8, 12, 6);
      sc.add(key);
      const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
      rim.position.set(-10, 6, -8);
      sc.add(rim);
      const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 10, 0.8, 32),
        new THREE.MeshLambertMaterial({ color: 0x2a3648 }),
      );
      platform.position.y = -0.4;
      sc.add(platform);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(9.4, 0.12, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xffb347 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      sc.add(ring);
      hangarPlane = buildPlaneModel();
      hangarPlane.group.position.y = 1.4;
      sc.add(hangarPlane.group);
      const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
      hangarScene = { scene: sc, camera: cam };
    }
    hangarPlane.group.rotation.y = time * 0.35;
    hangarPlane.prop.rotation.z = time * 8;
    const cam = hangarScene.camera;
    cam.position.set(13, 5.5, 16);
    // Aim 7 m left of the plane: the turntable lands right of the hangar
    // panel (x ~940) instead of behind it, and the wider shot keeps the
    // whole plane and platform in frame.
    cam.lookAt(-7, 1.6, 0);
    renderer.render(hangarScene.scene, cam);
  }

  return {
    renderPlay,
    renderHangar,
    setShake(v) { shake = Math.max(shake, v); },
    cycleCamera() {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : cameraMode === 'cockpit' ? 'orbit' : 'chase';
      return cameraMode;
    },
    getCameraMode() { return cameraMode; },
    dispose() {
      if (scene) disposeScene(scene);
      if (hangarScene) disposeScene(hangarScene.scene);
      renderer.dispose();
    },
  };
}
