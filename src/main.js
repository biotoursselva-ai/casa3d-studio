import './style.css';
import rawProperties from './data/properties.json';
import { normalizeProperty, formatPrice, TYPE_LABELS } from './layout.js';
import { floorPlanSVG } from './floorplan.js';
import { HouseViewer, renderThumbnail } from './three/viewer.js';

const properties = rawProperties.map(normalizeProperty);
const byId = Object.fromEntries(properties.map((p) => [p.id, p]));
const app = document.getElementById('app');
let viewer = null; // the one live 3D viewer (we always dispose the old one)

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Router (#/catalog, #/property/villa-pacifica, ...) ----------------
function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

function route() {
  viewer?.dispose();
  viewer = null;
  const { parts, params } = parseHash();
  const page = parts[0] || 'home';
  document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === page));

  if (page === 'catalog') renderCatalog();
  else if (page === 'property' && byId[parts[1]]) renderProperty(byId[parts[1]]);
  else if (page === 'contact') renderContact(params.get('property'));
  else renderHome();

  window.scrollTo({ top: 0 });
  app.querySelector('.page')?.classList.add('enter');
}

window.addEventListener('hashchange', route);
route();

// ---------------- Home ----------------
function renderHome() {
  const featured = byId['villa-pacifica'];
  app.innerHTML = `
    <section class="page hero">
      <div class="hero-glow"></div>
      <div class="hero-text">
        <span class="pill">New · Interactive 3D tours</span>
        <h1>Walk through your <span class="gradient">next home</span> before it exists.</h1>
        <p class="lead">Casa3D Studio designs homes across Costa Rica and lets you explore every one of them in 3D — rotate it, lift the roof, read the floor plan, and see it by day or night.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/catalog">Browse properties</a>
          <a class="btn ghost" href="#/property/${featured.id}">Open ${esc(featured.name)} →</a>
        </div>
      </div>
      <div class="hero-canvas" id="hero-canvas"></div>
    </section>

    <section class="page-section features">
      ${[
        ['3D orbit view', 'Drag to rotate, scroll to zoom. Every wall, window and sofa is generated in code.'],
        ['Architect floor plans', 'Switch to a top-down plan with room names, areas and measurements.'],
        ['Look inside', 'Remove the roof and step through each floor of multi-storey homes.'],
        ['Day & night', 'See how the house glows at night with warm interior lighting.'],
      ].map(([t, d]) => `<div class="feature"><h3>${t}</h3><p>${d}</p></div>`).join('')}
    </section>

    <section class="page-section cta">
      <h2>Six homes. From a cloud-forest cabin to a beach villa.</h2>
      <a class="btn primary" href="#/catalog">See the catalog</a>
    </section>`;
  viewer = new HouseViewer(document.getElementById('hero-canvas'), featured, { interactive: false, autoRotate: true });
}

// ---------------- Catalog ----------------
function renderCatalog() {
  const maxPrice = Math.max(...properties.map((p) => p.price));
  const types = [...new Set(properties.map((p) => p.type))];
  app.innerHTML = `
    <section class="page page-section">
      <div class="section-head">
        <h1>Properties</h1>
        <p class="muted">${properties.length} fictional homes across Costa Rica. Click any card to explore it in 3D.</p>
      </div>
      <div class="filters">
        <div class="segmented" id="type-filter">
          <button class="active" data-type="all">All</button>
          ${types.map((t) => `<button data-type="${t}">${TYPE_LABELS[t]}</button>`).join('')}
        </div>
        <label class="range">
          <span>Max price <strong id="price-label">${formatPrice(maxPrice)}</strong></span>
          <input type="range" id="price-filter" min="100000" max="${maxPrice}" step="25000" value="${maxPrice}" />
        </label>
      </div>
      <div class="grid" id="grid">
        ${properties.map(cardHTML).join('')}
      </div>
      <p class="empty muted" id="empty" hidden>No properties match these filters.</p>
    </section>`;

  let type = 'all';
  const priceInput = document.getElementById('price-filter');
  const apply = () => {
    const max = +priceInput.value;
    document.getElementById('price-label').textContent = formatPrice(max);
    let shown = 0;
    document.querySelectorAll('.card').forEach((card) => {
      const p = byId[card.dataset.id];
      const ok = (type === 'all' || p.type === type) && p.price <= max;
      card.hidden = !ok;
      shown += ok;
    });
    document.getElementById('empty').hidden = shown > 0;
  };
  document.getElementById('type-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    type = btn.dataset.type;
    document.querySelectorAll('#type-filter button').forEach((b) => b.classList.toggle('active', b === btn));
    apply();
  });
  priceInput.addEventListener('input', apply);

  // Render the 3D thumbnails one by one so the page appears instantly.
  const imgs = [...document.querySelectorAll('.card img')];
  const next = () => {
    const img = imgs.shift();
    if (!img || !img.isConnected) return;
    img.src = renderThumbnail(byId[img.dataset.id]);
    img.onload = () => img.classList.add('loaded');
    setTimeout(next, 30);
  };
  setTimeout(next, 50);
}

function cardHTML(p) {
  return `
    <a class="card" href="#/property/${p.id}" data-id="${p.id}">
      <div class="card-media"><img alt="3D render of ${esc(p.name)}" data-id="${p.id}" /><span class="tag">${TYPE_LABELS[p.type]}</span></div>
      <div class="card-body">
        <div class="card-top"><h3>${esc(p.name)}</h3><span class="price">${formatPrice(p.price)}</span></div>
        <p class="muted">${esc(p.location)}</p>
        <div class="stats">${statsHTML(p)}</div>
      </div>
    </a>`;
}

const statsHTML = (p) => `
  <span><b>${p.area}</b> m²</span>
  <span><b>${p.bedrooms}</b> bd</span>
  <span><b>${p.bathrooms}</b> ba</span>
  <span><b>${p.floors.length}</b> ${p.floors.length > 1 ? 'floors' : 'floor'}</span>`;

// ---------------- Property viewer ----------------
function renderProperty(p) {
  const i = properties.indexOf(p);
  const prev = properties[(i - 1 + properties.length) % properties.length];
  const next = properties[(i + 1) % properties.length];
  const multi = p.floors.length > 1;

  app.innerHTML = `
    <section class="page page-section property">
      <a class="back muted" href="#/catalog">← All properties</a>
      <div class="property-layout">
        <div class="viewer-wrap">
          <div class="viewer" id="viewer"></div>
          <div class="plan" id="plan" hidden></div>
          <div class="toolbar">
            <div class="segmented" id="mode">
              <button class="active" data-mode="3d">3D</button>
              <button data-mode="plan">Floor plan</button>
            </div>
            ${multi ? `<div class="segmented" id="levels">
              <button class="active" data-level="all">All</button>
              ${p.floors.map((f, n) => `<button data-level="${n}">${n === 0 ? 'G' : n}</button>`).join('')}
            </div>` : ''}
            <button class="chip active" id="roof-btn" aria-pressed="true">Roof</button>
            <button class="chip" id="night-btn" aria-pressed="false">Night</button>
          </div>
          <p class="hint">Drag to rotate · Scroll to zoom · Right-drag to pan</p>
        </div>

        <aside class="panel">
          <span class="tag inline">${TYPE_LABELS[p.type]}</span>
          <h1>${esc(p.name)}</h1>
          <p class="muted">${esc(p.location)}, Costa Rica</p>
          <p class="big-price">${formatPrice(p.price)}</p>
          <div class="stats big">${statsHTML(p)}</div>
          <p>${esc(p.description)}</p>
          <h3 id="rooms-title">Rooms</h3>
          <ul class="rooms" id="rooms"></ul>
          <a class="btn primary full" href="#/contact?property=${p.id}">Schedule a visit</a>
          <div class="prevnext">
            <a href="#/property/${prev.id}" class="muted">← ${esc(prev.name)}</a>
            <a href="#/property/${next.id}" class="muted">${esc(next.name)} →</a>
          </div>
        </aside>
      </div>
    </section>`;

  viewer = new HouseViewer(document.getElementById('viewer'), p);
  const state = { mode: '3d', level: 'all', roof: true, night: false };
  const viewerEl = document.getElementById('viewer');
  const planEl = document.getElementById('plan');
  const roofBtn = document.getElementById('roof-btn');
  const nightBtn = document.getElementById('night-btn');

  const update = () => {
    const planLevel = state.level === 'all' ? 0 : state.level;
    viewer.setLevel(state.level);
    viewer.setRoof(state.roof);
    viewer.setNight(state.night);
    viewerEl.hidden = state.mode !== '3d';
    planEl.hidden = state.mode !== 'plan';
    if (state.mode === 'plan') planEl.innerHTML = floorPlanSVG(p, planLevel);
    roofBtn.disabled = nightBtn.disabled = state.mode === 'plan';
    roofBtn.classList.toggle('active', state.roof);
    nightBtn.classList.toggle('active', state.night);
    roofBtn.setAttribute('aria-pressed', state.roof);
    nightBtn.setAttribute('aria-pressed', state.night);

    // Room list for the floor being looked at
    const floors = state.level === 'all' && state.mode === '3d' ? p.floors.map((f, n) => [f, n]) : [[p.floors[planLevel], planLevel]];
    document.getElementById('rooms').innerHTML = floors.map(([f]) => `
      ${floors.length > 1 ? `<li class="rooms-floor">${esc(f.name)}</li>` : ''}
      ${f.rooms.map((r) => `<li><span>${esc(r.name)}</span><span class="muted">${(r.w * r.d).toFixed(1)} m²</span></li>`).join('')}`).join('');
    document.getElementById('rooms-title').textContent = floors.length > 1 ? 'Rooms' : `Rooms · ${p.floors[planLevel].name}`;
  };

  document.getElementById('mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.mode = btn.dataset.mode;
    if (state.mode === 'plan' && state.level === 'all' && multi) selectLevel(0);
    document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('active', b === btn));
    update();
  });
  const selectLevel = (lvl) => {
    state.level = lvl;
    document.querySelectorAll('#levels button').forEach((b) => b.classList.toggle('active', b.dataset.level === String(lvl)));
  };
  document.getElementById('levels')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    selectLevel(btn.dataset.level === 'all' ? 'all' : +btn.dataset.level);
    update();
  });
  roofBtn.addEventListener('click', () => { state.roof = !state.roof; update(); });
  nightBtn.addEventListener('click', () => { state.night = !state.night; update(); });
  update();
}

// ---------------- Contact ----------------
function renderContact(selectedId) {
  app.innerHTML = `
    <section class="page page-section contact">
      <div class="section-head">
        <h1>Talk to an architect</h1>
        <p class="muted">Tell us what you're looking for. This is a demo — nothing is actually sent.</p>
      </div>
      <form class="form" id="contact-form" novalidate>
        <label>Full name<input name="name" required autocomplete="name" placeholder="María Rodríguez" /></label>
        <label>Email<input name="email" type="email" required autocomplete="email" placeholder="maria@example.com" /></label>
        <label>Phone <span class="muted">(optional)</span><input name="phone" type="tel" autocomplete="tel" placeholder="+506 8888 8888" /></label>
        <label>Property
          <select name="property">
            <option value="">General question</option>
            ${properties.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)} — ${formatPrice(p.price)}</option>`).join('')}
          </select>
        </label>
        <label class="full">Message<textarea name="message" rows="5" required placeholder="I'd like to visit next week…"></textarea></label>
        <p class="form-error full" id="form-error" hidden></p>
        <button class="btn primary full" type="submit">Send message</button>
      </form>
      <div class="success" id="success" hidden>
        <h2>Thanks! 🎉</h2>
        <p class="muted">Your message was "sent" (demo only — it never left your browser).</p>
        <a class="btn ghost" href="#/catalog">Back to properties</a>
      </div>
    </section>`;

  const form = document.getElementById('contact-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const error = !data.name.trim() ? 'Please enter your name.'
      : !/^\S+@\S+\.\S+$/.test(data.email) ? 'Please enter a valid email.'
      : data.message.trim().length < 10 ? 'Your message should be at least 10 characters.'
      : '';
    const errEl = document.getElementById('form-error');
    errEl.textContent = error;
    errEl.hidden = !error;
    if (error) return;
    form.hidden = true;
    document.getElementById('success').hidden = false;
  });
}
