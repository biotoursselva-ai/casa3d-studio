// Draws an architect-style floor plan as SVG. 1 SVG unit = 1 metre.
import { planFloor, WALL_T } from './layout.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f = (n) => +n.toFixed(3);

// Converts "distance along a wall" into an (x, y) point on the plan.
const pt = (w, t, offset = 0) => (w.orient === 'h' ? [t, w.c + offset] : [w.c + offset, t]);

export function floorPlanSVG(property, level) {
  const floor = property.floors[level];
  const walls = planFloor(floor, { isGround: level === 0, entryRoom: property.entry });
  const W = property.width, D = property.depth;
  const pad = 2;
  const out = [];

  out.push(`<svg class="plan-svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Floor plan of ${esc(property.name)}, ${esc(floor.name)}">`);
  out.push(`<defs><pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#1d2a3d" stroke-width="0.02"/></pattern></defs>`);
  out.push(`<rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${D + pad * 2}" fill="#0b1220"/>`);
  out.push(`<rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${D + pad * 2}" fill="url(#grid)"/>`);

  // Rooms + labels
  for (const r of floor.rooms) {
    out.push(`<rect x="${r.x}" y="${r.z}" width="${r.w}" height="${r.d}" fill="${r.type === 'stairs' ? '#132037' : '#101a2c'}"/>`);
    if (r.type === 'stairs') {
      const steps = 12, alongX = r.w >= r.d;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        out.push(alongX
          ? `<line x1="${f(r.x + r.w * t)}" y1="${r.z + 0.3}" x2="${f(r.x + r.w * t)}" y2="${f(r.z + r.d - 0.3)}" stroke="#4b6a93" stroke-width="0.03"/>`
          : `<line x1="${r.x + 0.3}" y1="${f(r.z + r.d * t)}" x2="${f(r.x + r.w - 0.3)}" y2="${f(r.z + r.d * t)}" stroke="#4b6a93" stroke-width="0.03"/>`);
      }
    }
    const size = Math.min(0.42, Math.max(0.22, Math.min(r.w, r.d) / 7));
    const cx = r.x + r.w / 2, cy = r.z + r.d / 2;
    out.push(`<text x="${cx}" y="${f(cy - size * 0.3)}" class="plan-name" font-size="${f(size)}">${esc(r.name)}</text>`);
    out.push(`<text x="${cx}" y="${f(cy + size * 0.95)}" class="plan-dim" font-size="${f(size * 0.72)}">${(r.w * r.d).toFixed(1)} m² · ${r.w} × ${r.d} m</text>`);
  }

  // Walls: solid stretches between openings
  for (const w of walls) {
    const thick = w.exterior ? WALL_T * 1.6 : WALL_T;
    let cursor = w.a;
    const solid = [];
    for (const o of w.openings) { solid.push([cursor, o.s]); cursor = o.e; }
    solid.push([cursor, w.b]);
    for (const [s, e] of solid) {
      if (e - s < 0.01) continue;
      const [x1, y1] = pt(w, s), [x2, y2] = pt(w, e);
      out.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#e8eef7" stroke-width="${f(thick)}" stroke-linecap="square"/>`);
    }
    for (const o of w.openings) {
      const len = o.e - o.s;
      if (o.type === 'window') {
        // Window symbol: three thin parallel lines across the opening
        for (const off of [-thick / 2, 0, thick / 2]) {
          const [a1, b1] = pt(w, o.s, off), [a2, b2] = pt(w, o.e, off);
          out.push(`<line x1="${f(a1)}" y1="${f(b1)}" x2="${f(a2)}" y2="${f(b2)}" stroke="#5fb3ff" stroke-width="0.03"/>`);
        }
      } else {
        // Door: hinge at the start, leaf opens 90°, arc shows the swing.
        const color = o.type === 'entry' ? '#ffb454' : '#9fb3cc';
        const [hx, hy] = pt(w, o.s), [ex, ey] = pt(w, o.e);
        const [lx, ly] = w.orient === 'h' ? [hx, hy + len] : [hx + len, hy];
        const sweep = w.orient === 'h' ? 1 : 0;
        out.push(`<path d="M${f(hx)} ${f(hy)}L${f(lx)} ${f(ly)}" stroke="${color}" stroke-width="0.05"/>`);
        out.push(`<path d="M${f(ex)} ${f(ey)}A${f(len)} ${f(len)} 0 0 ${sweep} ${f(lx)} ${f(ly)}" fill="none" stroke="${color}" stroke-width="0.025" stroke-dasharray="0.08 0.06"/>`);
      }
    }
  }

  // Overall dimension lines (top and left)
  const dim = (x1, y1, x2, y2, label, vertical) => {
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="plan-dimline"/>`);
    const tick = (x, y) => out.push(`<line x1="${f(x - 0.15)}" y1="${f(y + 0.15)}" x2="${f(x + 0.15)}" y2="${f(y - 0.15)}" class="plan-dimline"/>`);
    tick(x1, y1); tick(x2, y2);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    out.push(vertical
      ? `<text x="${f(mx - 0.25)}" y="${f(my)}" class="plan-measure" transform="rotate(-90 ${f(mx - 0.25)} ${f(my)})">${label}</text>`
      : `<text x="${f(mx)}" y="${f(my - 0.25)}" class="plan-measure">${label}</text>`);
  };
  dim(0, -1, W, -1, `${W.toFixed(2)} m`, false);
  dim(-1, 0, -1, D, `${D.toFixed(2)} m`, true);

  // North arrow
  out.push(`<g transform="translate(${W + 1.1} ${-1.1})"><path d="M0 -0.5L0.25 0.3L0 0.15L-0.25 0.3Z" fill="#e8eef7"/><text y="0.75" class="plan-measure">N</text></g>`);
  out.push('</svg>');
  return out.join('');
}
