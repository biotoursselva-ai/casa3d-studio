// Builds a whole house out of simple shapes (boxes, a prism, a pyramid, spheres).
import * as THREE from 'three';
import { planFloor, floorY, WALL_H, FLOOR_H, BASE_H, WALL_T, ROOM_COLORS } from '../layout.js';

// One 1×1×1 box shared by every wall, floor and piece of furniture.
// Each mesh just stretches it with .scale — much cheaper than thousands of geometries.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Adds a box whose BOTTOM sits at y (easier to think about than the centre). */
function box(parent, sx, sy, sz, x, y, z, material, castShadow = true) {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y + sy / 2, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeMaterials(style) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  return {
    wallExt: std(style.wall),
    wallInt: std('#f2f0eb'),
    plinth: std('#8d8a84'),
    roof: std(style.roofColor, { roughness: 0.7, side: THREE.DoubleSide }),
    trim: std('#f5f5f2'),
    glass: new THREE.MeshStandardMaterial({
      color: '#9fc9e8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35,
      emissive: '#ffc978', emissiveIntensity: 0,
    }),
    door: std(style.accent, { roughness: 0.6 }),
    accent: std(style.accent),
    wood: std('#8b6243', { roughness: 0.7 }),
    fabric: std('#59626f'),
    fabricLight: std('#ebe8e2'),
    white: std('#f7f7f7', { roughness: 0.35 }),
    dark: std('#222428', { roughness: 0.5 }),
    rug: std('#c9c2b4'),
    cabinet: std('#e8e4dc', { roughness: 0.5 }),
    counterTop: std('#3a3a3a', { roughness: 0.3 }),
    steel: std('#b8bcc2', { metalness: 0.6, roughness: 0.35 }),
    stone: std('#cfc9be'),
    grass: std('#5f8a4a', { roughness: 1 }),
    trunk: std('#6b4a2f'),
    leaves: std('#3f7a3a'),
    deck: std('#c8b89a'),
    water: new THREE.MeshStandardMaterial({ color: '#2fa6d8', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }),
    floor: Object.fromEntries(Object.entries(ROOM_COLORS).map(([k, c]) => [k, std(c, { roughness: 0.6 })])),
  };
}

// ---------- Walls ----------
function buildWall(parent, w, y0, height, m) {
  const mat = w.exterior ? m.wallExt : m.wallInt;
  // One solid block of wall between s and e (along the wall), from yb to yt (height).
  const span = (s, e, yb, yt, material = mat, thick = WALL_T, cast = true) => {
    if (e - s < 0.001 || yt - yb < 0.001) return;
    const t = (s + e) / 2, len = e - s;
    if (w.orient === 'h') box(parent, len, yt - yb, thick, t, y0 + yb, w.c, material, cast);
    else box(parent, thick, yt - yb, len, w.c, y0 + yb, t, material, cast);
  };

  let cursor = w.a - WALL_T / 2; // stretch half a wall so corners close up
  for (const o of w.openings) {
    span(cursor, o.s, 0, height);           // wall before the hole
    span(o.s, o.e, 0, o.bottom);            // under a window
    span(o.s, o.e, o.top, height);          // above the door/window (lintel)
    if (o.type === 'window') span(o.s, o.e, o.bottom, o.top, m.glass, 0.04, false);
    if (o.type === 'entry') span(o.s, o.e, 0, o.top, m.door, 0.06);
    cursor = o.e;
  }
  span(cursor, w.b + WALL_T / 2, 0, height);
}

// ---------- Furniture ----------
// Each function works in a room-local frame where x is the LONG side (w) and z the short side (d).
const FURNITURE = {
  bedroom(g, w, d, m) {
    const bw = w >= 3 ? 1.6 : 1.0, bl = Math.min(2.0, d - 0.1), back = -d / 2;
    box(g, bw + 0.1, 0.9, 0.08, 0, 0, back + 0.04, m.wood);                       // headboard
    box(g, bw, 0.35, bl, 0, 0, back + bl / 2, m.wood);                            // frame
    box(g, bw - 0.08, 0.18, bl - 0.1, 0, 0.35, back + bl / 2 + 0.03, m.fabricLight); // mattress
    box(g, bw - 0.04, 0.06, bl * 0.55, 0, 0.5, back + bl * 0.7, m.accent);        // blanket
    box(g, bw - 0.4, 0.1, 0.3, 0, 0.53, back + 0.3, m.white);                     // pillows
    if (w >= bw + 1.4) for (const sx of [-1, 1]) box(g, 0.45, 0.5, 0.4, sx * (bw / 2 + 0.35), 0, back + 0.25, m.wood);
    if (w >= bw + 2.8) box(g, 0.6, 2.0, Math.min(1.6, d - 0.4), w / 2 - 0.3, 0, 0, m.wood); // wardrobe
  },
  living(g, w, d, m, room) {
    const sx = room.name.toLowerCase().includes('kitchen') ? -w * 0.15 : 0;
    const zs = Math.min(1.0, d / 2 - 0.6);
    box(g, Math.min(3, w - 0.6), 0.01, Math.min(2.2, d - 0.6), sx, 0, 0, m.rug, false);
    box(g, 2.2, 0.42, 0.9, sx, 0, zs, m.fabric);                 // seat
    box(g, 2.2, 0.45, 0.2, sx, 0.42, zs + 0.35, m.fabric);       // backrest
    for (const s of [-1, 1]) box(g, 0.2, 0.25, 0.9, sx + s * 1.0, 0.42, zs, m.fabric); // arms
    if (d > 3) box(g, 1.1, 0.4, 0.6, sx, 0, zs - 1.1, m.wood);  // coffee table
    box(g, 1.8, 0.45, 0.4, sx, 0, -d / 2 + 0.2, m.dark);         // TV stand
    box(g, 1.4, 0.8, 0.05, sx, 0.75, -d / 2 + 0.2, m.dark);      // TV
    if (sx !== 0) { // kitchenette for open-plan rooms
      box(g, 0.6, 0.9, Math.min(2.4, d - 0.4), w / 2 - 0.3, 0, 0, m.cabinet);
      box(g, 0.62, 0.04, Math.min(2.4, d - 0.4), w / 2 - 0.3, 0.9, 0, m.counterTop);
    }
  },
  kitchen(g, w, d, m) {
    const len = w - 1.0, back = -d / 2 + 0.3;
    box(g, len, 0.9, 0.6, -0.5, 0, back, m.cabinet);
    box(g, len, 0.04, 0.62, -0.5, 0.9, back, m.counterTop);
    box(g, 0.8, 1.9, 0.7, w / 2 - 0.4, 0, back + 0.05, m.steel); // fridge
    if (w * d >= 12) {
      const iw = Math.min(2, w - 1.6);
      box(g, iw, 0.9, 0.9, 0, 0, 0.5, m.cabinet);
      box(g, iw + 0.1, 0.04, 1.0, 0, 0.9, 0.5, m.counterTop);
    }
  },
  dining(g, w, d, m) {
    const tl = Math.min(1.8, w - 1.4), perSide = tl >= 1.6 ? 3 : 2;
    box(g, 0.25, 0.72, 0.25, 0, 0, 0, m.dark);
    box(g, tl, 0.05, 0.9, 0, 0.72, 0, m.wood);
    for (let i = 0; i < perSide; i++) {
      const x = -tl / 2 + (tl / perSide) * (i + 0.5);
      for (const s of [-1, 1]) {
        box(g, 0.45, 0.45, 0.45, x, 0, s * 0.75, m.fabric);
        box(g, 0.45, 0.5, 0.06, x, 0.45, s * 0.95, m.fabric);
      }
    }
  },
  bath(g, w, d, m) {
    const back = -d / 2;
    box(g, 1.0, 0.85, 0.5, -w / 2 + 0.6, 0, back + 0.25, m.white);  // vanity
    box(g, 0.8, 0.6, 0.03, -w / 2 + 0.6, 1.2, back + 0.02, m.steel); // mirror
    box(g, 0.4, 0.42, 0.6, -w / 2 + 1.35, 0, back + 0.3, m.white);  // toilet
    box(g, 0.4, 0.4, 0.15, -w / 2 + 1.35, 0.42, back + 0.07, m.white);
    box(g, 0.9, 0.05, 0.9, w / 2 - 0.45, 0, d / 2 - 0.45, m.stone); // shower tray
    box(g, 0.9, 1.9, 0.03, w / 2 - 0.45, 0.05, d / 2 - 0.9, m.glass, false);
  },
  office(g, w, d, m) {
    box(g, 1.4, 0.05, 0.7, 0, 0.72, -d / 2 + 0.45, m.wood);
    for (const s of [-1, 1]) box(g, 0.05, 0.72, 0.65, s * 0.65, 0, -d / 2 + 0.45, m.dark);
    box(g, 0.5, 0.06, 0.5, 0, 0.45, -d / 2 + 1.2, m.dark);
    box(g, 0.5, 0.45, 0.06, 0, 0.5, -d / 2 + 1.45, m.dark);
    box(g, 0.35, 1.9, 1.4, -w / 2 + 0.2, 0, 0.3, m.wood); // bookshelf
  },
  closet(g, w, d, m) {
    box(g, w - 0.2, 2.0, 0.5, 0, 0, -d / 2 + 0.25, m.wood);
  },
  hall(g, w, d, m) {
    if (Math.min(w, d) < 1.6) return;
    box(g, 0.35, 0.4, 0.35, w / 2 - 0.35, 0, -d / 2 + 0.35, m.stone);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), m.leaves);
    leaf.position.set(w / 2 - 0.35, 0.8, -d / 2 + 0.35);
    leaf.castShadow = true;
    g.add(leaf);
  },
};

function buildFurniture(room, m) {
  const fn = FURNITURE[room.type];
  if (!fn) return null;
  const g = new THREE.Group();
  let w = room.w - 0.3, d = room.d - 0.3;
  if (d > w) { [w, d] = [d, w]; g.rotation.y = Math.PI / 2; } // turn the set so x is the long side
  fn(g, w, d, m, room);
  return g;
}

function buildStairs(room, m) {
  const g = new THREE.Group();
  let L = room.w, S = room.d;
  if (S > L) { [L, S] = [S, L]; g.rotation.y = Math.PI / 2; }
  const n = 16, rise = FLOOR_H / n, run = (L - 0.6) / n, width = Math.min(1.1, S - 0.3);
  for (let i = 0; i < n; i++) {
    box(g, run, rise * (i + 1), width, -L / 2 + 0.3 + run * (i + 0.5), 0, -S / 2 + width / 2 + 0.1, m.stone);
  }
  return g;
}

// ---------- Roof ----------
function buildRoof(property, topY, m) {
  const g = new THREE.Group();
  const W = property.width, D = property.depth, oh = 0.5;
  const type = property.style.roof;
  box(g, W + WALL_T, 0.2, D + WALL_T, W / 2, topY, D / 2, type === 'flat' ? m.roof : m.trim); // ceiling slab
  const y = topY + 0.2;

  if (type === 'flat') {
    // thin parapet around the edge
    for (const [sx, sz, x, z] of [[W + 0.3, 0.15, W / 2, -0.075], [W + 0.3, 0.15, W / 2, D + 0.075], [0.15, D, -0.075, D / 2], [0.15, D, W + 0.075, D / 2]]) {
      box(g, sx, 0.5, sz, x, y - 0.2, z, m.trim);
    }
  } else if (type === 'gable') {
    // Triangle cross-section, pushed ("extruded") along the length of the house.
    const span = Math.min(W, D) + oh * 2, len = Math.max(W, D) + oh * 2;
    const h = property.style.roofHeight ?? span * 0.3;
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    const mesh = new THREE.Mesh(geo, m.roof);
    mesh.position.set(W / 2, y, D / 2);
    if (W >= D) mesh.rotation.y = Math.PI / 2; // ridge runs along the longer side
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  } else {
    // Hip roof: a 4-sided cone (= pyramid) stretched to the house's footprint.
    const h = (Math.min(W, D) + oh * 2) * 0.25;
    const geo = new THREE.ConeGeometry(1, h, 4);
    geo.rotateY(Math.PI / 4);
    const mesh = new THREE.Mesh(geo, m.roof);
    mesh.scale.set((W / 2 + oh) / Math.SQRT1_2, 1, (D / 2 + oh) / Math.SQRT1_2);
    mesh.position.set(W / 2, y + h / 2, D / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// ---------- Garden ----------
function seededRandom(text) {
  let a = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => { // mulberry32: same id → same "random" garden every time
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGarden(property, house, m) {
  const g = new THREE.Group();
  const W = property.width, D = property.depth;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), m.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  g.add(ground);

  const pool = property.pool;
  if (pool) {
    // position is relative to the house corner, so put it inside `house`
    box(house, pool.w + 2, 0.12, pool.d + 2, pool.x + pool.w / 2, 0, pool.z + pool.d / 2, m.deck, false);
    box(house, pool.w, 0.02, pool.d, pool.x + pool.w / 2, 0.12, pool.z + pool.d / 2, m.water, false);
  }

  const rand = seededRandom(property.id);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1, 0);
  const minR = Math.max(W, D) / 2 + 3;
  const blocked = (x, z) => pool && x > pool.x - W / 2 - 2 && x < pool.x + pool.w - W / 2 + 2 && z > pool.z - D / 2 - 2 && z < pool.z + pool.d - D / 2 + 2;
  let placed = 0, tries = 0;
  while (placed < (property.trees ?? 8) && tries++ < 200) {
    const ang = rand() * Math.PI * 2, r = minR + rand() * 12;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (blocked(x, z) || (z < 0 && Math.abs(x) < 2.5)) continue; // keep the front path clear
    const s = 0.8 + rand() * 0.9;
    const trunk = new THREE.Mesh(trunkGeo, m.trunk);
    trunk.position.set(x, 0.8 * s, z); trunk.scale.setScalar(s);
    const crown = new THREE.Mesh(crownGeo, m.leaves);
    crown.position.set(x, (1.6 + 0.9) * s, z); crown.scale.setScalar(1.2 * s);
    trunk.castShadow = crown.castShadow = true;
    g.add(trunk, crown);
    placed++;
  }
  return g;
}

/** Main entry: returns the house as a Three.js Group plus handles the viewer needs. */
export function buildHouse(property) {
  const m = makeMaterials(property.style);
  const root = new THREE.Group();
  const W = property.width, D = property.depth;

  // Inside `house`, (0,0,0) is the corner of the plan, like in the JSON data.
  // We shift it so the middle of the house sits at the world origin.
  const house = new THREE.Group();
  house.position.set(-W / 2, 0, -D / 2);
  root.add(house);

  box(house, W + 0.4, BASE_H - 0.05, D + 0.4, W / 2, 0, D / 2, m.plinth);

  const levels = [];
  const roomLights = [];
  const floors = property.floors;
  floors.forEach((floor, i) => {
    const level = new THREE.Group();
    house.add(level);
    levels.push(level);
    const y0 = floorY(i);
    const isTop = i === floors.length - 1;
    const above = floors[i + 1];

    for (const r of floor.rooms) {
      const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
      const mat = m.floor[r.type] || m.floor.hall;
      if (i === 0) box(level, r.w, 0.05, r.d, cx, y0 - 0.05, cz, mat);
      else if (r.type !== 'stairs') box(level, r.w, 0.25, r.d, cx, y0 - 0.25, cz, mat); // slab (stairwell stays open)

      const furniture = buildFurniture(r, m);
      if (furniture) { furniture.position.set(cx, y0, cz); level.add(furniture); }

      if (r.type === 'stairs' && above?.rooms.some((a) => a.type === 'stairs')) {
        const stairs = buildStairs(r, m);
        stairs.position.set(cx, y0, cz);
        level.add(stairs);
      }

      if (r.type !== 'stairs') {
        const light = new THREE.PointLight('#ffd49a', 0, Math.max(r.w, r.d) * 1.8, 2);
        light.position.set(cx, y0 + 2.3, cz);
        level.add(light);
        roomLights.push(light);
      }
    }

    const height = isTop ? WALL_H : FLOOR_H; // lower walls reach the slab above
    for (const w of planFloor(floor, { isGround: i === 0, entryRoom: property.entry })) {
      buildWall(level, w, y0, height, m);
    }
  });

  const roof = buildRoof(property, floorY(floors.length - 1) + WALL_H, m);
  house.add(roof);
  root.add(buildGarden(property, house, m));

  return {
    root, levels, roof, roomLights, materials: m,
    width: W, depth: D, height: floorY(floors.length - 1) + WALL_H,
    dispose() {
      root.traverse((o) => { if (o.geometry && o.geometry !== UNIT_BOX) o.geometry.dispose(); });
      const { floor, ...rest } = m;
      [...Object.values(rest), ...Object.values(floor)].forEach((mat) => mat.dispose());
    },
  };
}
