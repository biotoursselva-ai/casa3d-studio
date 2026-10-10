// Pure layout math (no Three.js here). Both the 3D builder and the 2D floor plan use it,
// so the plan always matches the model.

export const WALL_H = 2.8;        // wall height (m)
export const FLOOR_H = 3.0;       // floor-to-floor height (m)
export const BASE_H = 0.3;        // plinth the house sits on (m)
export const WALL_T = 0.15;       // wall thickness (m)
export const DOOR_W = 0.9;
export const ENTRY_W = 1.1;
export const DOOR_TOP = 2.1;

const EPS = 1e-6;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Expands "repeatFloors", computes footprint and total area. */
export function normalizeProperty(p) {
  let floors = p.floors;
  if (p.repeatFloors) {
    floors = Array.from({ length: p.repeatFloors }, (_, i) => ({
      ...p.floors[0],
      name: i === 0 ? 'Ground floor' : `Floor ${i + 1}`,
    }));
  }
  let maxX = 0, maxZ = 0, area = 0;
  for (const f of floors) {
    for (const r of f.rooms) {
      maxX = Math.max(maxX, r.x + r.w);
      maxZ = Math.max(maxZ, r.z + r.d);
      if (r.type !== 'stairs' || f === floors[0]) area += r.w * r.d;
    }
  }
  return { ...p, floors, width: maxX, depth: maxZ, area: Math.round(area) };
}

function roomAt(rooms, x, z) {
  return rooms.find((r) => x > r.x + EPS && x < r.x + r.w - EPS && z > r.z + EPS && z < r.z + r.d - EPS) || null;
}

/**
 * Turns a list of rectangular rooms into wall pieces.
 * Each piece: { orient: 'h'|'v', c, a, b, rooms: [nameA|null, nameB|null], exterior, openings: [] }
 *  - 'h' wall runs along X at z = c, from x = a to x = b
 *  - 'v' wall runs along Z at x = c, from z = a to z = b
 */
export function computeWalls(rooms) {
  const lines = { h: new Map(), v: new Map() };
  const add = (orient, c, a, b) => {
    const key = r3(c);
    if (!lines[orient].has(key)) lines[orient].set(key, []);
    lines[orient].get(key).push([r3(a), r3(b)]);
  };
  for (const r of rooms) {
    add('h', r.z, r.x, r.x + r.w);
    add('h', r.z + r.d, r.x, r.x + r.w);
    add('v', r.x, r.z, r.z + r.d);
    add('v', r.x + r.w, r.z, r.z + r.d);
  }

  const pieces = [];
  for (const orient of ['h', 'v']) {
    for (const [c, intervals] of lines[orient]) {
      const cuts = [...new Set(intervals.flat())].sort((m, n) => m - n);
      let current = null;
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1], mid = (a + b) / 2;
        if (!intervals.some(([s, e]) => s <= mid && e >= mid)) { current = null; continue; }
        // Which room is on each side of this little stretch of wall?
        const [p1, p2] = orient === 'h' ? [[mid, c - 0.05], [mid, c + 0.05]] : [[c - 0.05, mid], [c + 0.05, mid]];
        const A = roomAt(rooms, ...p1)?.name ?? null;
        const B = roomAt(rooms, ...p2)?.name ?? null;
        if (current && current.b === a && current.rooms[0] === A && current.rooms[1] === B) {
          current.b = b; // same neighbours → extend the piece
        } else {
          current = { orient, c, a, b, rooms: [A, B], exterior: !A || !B, openings: [] };
          pieces.push(current);
        }
      }
    }
  }
  return pieces;
}

/** Evenly spaced windows between s and e (positions along the wall). */
function fillWindows(s, e, small) {
  const margin = 0.4;
  const L = e - s - margin * 2;
  if (L < 1.0) return [];
  const n = Math.max(1, Math.round(L / 3));
  const slot = L / n;
  const w = Math.min(small ? 0.8 : 1.6, slot - 0.6);
  if (w < 0.6) return [];
  const [bottom, top] = small ? [1.5, DOOR_TOP] : [0.9, DOOR_TOP];
  return Array.from({ length: n }, (_, i) => {
    const center = s + margin + slot * (i + 0.5);
    return { type: 'window', s: center - w / 2, e: center + w / 2, bottom, top };
  });
}

/** Full plan of one floor: walls + doors + windows + entry door. */
export function planFloor(floor, { isGround, entryRoom }) {
  const walls = computeWalls(floor.rooms);
  const byName = Object.fromEntries(floor.rooms.map((r) => [r.name, r]));

  // Interior doors from the data: put each on the longest wall the two rooms share.
  for (const [n1, n2] of floor.doors || []) {
    const shared = walls.filter((w) => w.rooms.includes(n1) && w.rooms.includes(n2));
    const best = shared.sort((m, n) => (n.b - n.a) - (m.b - m.a))[0];
    if (!best || best.b - best.a < 1.0) {
      console.warn(`No room for a door between "${n1}" and "${n2}"`);
      continue;
    }
    const width = Math.min(DOOR_W, best.b - best.a - 0.1);
    const mid = (best.a + best.b) / 2;
    best.openings.push({ type: 'door', s: mid - width / 2, e: mid + width / 2, bottom: 0, top: DOOR_TOP });
  }

  // Entry door: the longest exterior wall of the entry room (front walls win ties).
  let entryWall = null;
  if (isGround && byName[entryRoom]) {
    const candidates = walls.filter((w) => w.exterior && w.rooms.includes(entryRoom));
    candidates.sort((m, n) => (n.b - n.a) - (m.b - m.a) || (m.orient === 'h' && m.c === 0 ? -1 : 1));
    entryWall = candidates[0] || null;
  }

  for (const w of walls) {
    if (!w.exterior) continue;
    const room = byName[w.rooms[0] || w.rooms[1]];
    const small = room?.type === 'bath';
    if (w === entryWall) {
      const mid = (w.a + w.b) / 2;
      w.openings.push({ type: 'entry', s: mid - ENTRY_W / 2, e: mid + ENTRY_W / 2, bottom: 0, top: DOOR_TOP });
      w.openings.push(...fillWindows(w.a, mid - ENTRY_W / 2, small), ...fillWindows(mid + ENTRY_W / 2, w.b, small));
    } else {
      w.openings.push(...fillWindows(w.a, w.b, small));
    }
  }
  for (const w of walls) w.openings.sort((m, n) => m.s - n.s);
  return walls;
}

/** Floor heights. */
export const floorY = (level) => BASE_H + level * FLOOR_H;

export const ROOM_COLORS = {
  living: '#b98a5e', bedroom: '#c9a27a', kitchen: '#e6e3dc', dining: '#b07f55', bath: '#c4ccd3',
  hall: '#d2cdc4', stairs: '#bdb6aa', office: '#a97c55', closet: '#c9a27a', laundry: '#d9d9d6',
};

export const TYPE_LABELS = { house: 'House', villa: 'Villa', cabin: 'Cabin', apartment: 'Apartment building' };

export const formatPrice = (n) => '$' + n.toLocaleString('en-US');
