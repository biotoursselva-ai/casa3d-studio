// Scene + camera + lights + controls around one house.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildHouse } from './houseBuilder.js';

const DAY = { bg: new THREE.Color('#b9d3ea'), sun: new THREE.Color('#fff4e0') };
const NIGHT = { bg: new THREE.Color('#070b16'), sun: new THREE.Color('#8fa6ff') };
const lerp = (a, b, t) => a + (b - a) * t;

/** Everything except the renderer: scene, lights, house, and a good camera spot. */
function createStage(property) {
  const scene = new THREE.Scene();
  scene.background = DAY.bg.clone();
  scene.fog = new THREE.Fog(DAY.bg.clone(), 45, 120);

  const house = buildHouse(property);
  scene.add(house.root);

  // Soft light from the whole sky (blue above, green bounce from the grass below)
  const hemi = new THREE.HemisphereLight('#dbe9ff', '#4d6b3a', 1.4);
  scene.add(hemi);

  // The sun: one strong light coming from one direction, casting shadows
  const span = Math.max(house.width, house.depth);
  const sun = new THREE.DirectionalLight(DAY.sun, 2.8);
  sun.position.set(span * 1.2, span * 1.8 + 10, span * 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = span + 14;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: span * 6 + 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const camPos = new THREE.Vector3(span * 1.05, house.height * 0.9 + span * 0.55, span * 1.35);
  const target = new THREE.Vector3(0, house.height * 0.35, 0);
  return { scene, house, hemi, sun, span, camPos, target };
}

/** k = 0 is full day, k = 1 is full night; anything in between is a smooth mix. */
function setLighting(stage, renderer, k) {
  stage.scene.background.lerpColors(DAY.bg, NIGHT.bg, k);
  stage.scene.fog.color.copy(stage.scene.background);
  stage.hemi.intensity = lerp(1.4, 0.06, k);
  stage.sun.intensity = lerp(2.8, 0.35, k);
  stage.sun.color.lerpColors(DAY.sun, NIGHT.sun, k);
  for (const l of stage.house.roomLights) l.intensity = k * 6;
  const glass = stage.house.materials.glass;
  glass.emissiveIntensity = k * 1.4;
  glass.opacity = lerp(0.35, 0.8, k);
  renderer.toneMappingExposure = lerp(1, 1.2, k);
}

function makeRenderer(width, height, pixelRatio) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  return renderer;
}

export class HouseViewer {
  constructor(container, property, { interactive = true, autoRotate = false } = {}) {
    this.container = container;
    this.stage = createStage(property);
    this.renderer = makeRenderer(1, 1, Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'viewer-canvas';
    container.appendChild(this.renderer.domElement);

    // The camera = your eye. 40° field of view, sees from 0.1 m to 400 m away.
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    const { camPos, target, span } = this.stage;
    this.introFrom = camPos.clone().multiplyScalar(1.6).setY(camPos.y * 1.3);
    this.introTo = camPos.clone();
    this.camera.position.copy(this.introFrom);
    this.camera.lookAt(target);
    this.intro = 0;

    this.autoRotate = autoRotate;
    if (interactive) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(target);
      this.controls.enableDamping = true;
      this.controls.minDistance = span * 0.5;
      this.controls.maxDistance = span * 4;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.06; // never go under the ground
      this.controls.enabled = false; // until the intro animation ends
    }

    this.roofOn = true;
    this.level = 'all';
    this.night = 0;
    this.nightTarget = 0;
    setLighting(this.stage, this.renderer, 0);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);

    if (this.intro < 1) { // fly-in: ease-out cubic
      this.intro = Math.min(1, this.intro + dt / 1.6);
      const e = 1 - (1 - this.intro) ** 3;
      this.camera.position.lerpVectors(this.introFrom, this.introTo, e);
      this.camera.lookAt(this.stage.target);
      if (this.intro === 1 && this.controls) this.controls.enabled = true;
    }

    if (Math.abs(this.night - this.nightTarget) > 0.001) { // smooth day ↔ night
      this.night += (this.nightTarget - this.night) * Math.min(1, dt * 4);
      setLighting(this.stage, this.renderer, this.night);
    }

    if (this.autoRotate) this.stage.house.root.rotation.y += dt * 0.18;
    this.controls?.update();
    this.renderer.render(this.stage.scene, this.camera);
  }

  setRoof(on) { this.roofOn = on; this.updateVisibility(); }
  setNight(on) { this.nightTarget = on ? 1 : 0; }
  /** 'all' or a floor index: shows that floor and everything below it. */
  setLevel(level) { this.level = level; this.updateVisibility(); }

  updateVisibility() {
    const { levels, roof } = this.stage.house;
    levels.forEach((g, i) => { g.visible = this.level === 'all' || i <= this.level; });
    const topShown = this.level === 'all' || this.level === levels.length - 1;
    roof.visible = this.roofOn && topShown;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls?.dispose();
    this.stage.house.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // free the GPU context right away
    this.renderer.domElement.remove();
  }
}

// ---------- Thumbnails for the catalog (one hidden renderer, reused) ----------
let thumbRenderer = null;
const thumbCache = new Map();

export function renderThumbnail(property) {
  if (thumbCache.has(property.id)) return thumbCache.get(property.id);
  thumbRenderer ??= makeRenderer(720, 450, 1);
  const stage = createStage(property);
  setLighting(stage, thumbRenderer, 0);
  const camera = new THREE.PerspectiveCamera(36, 720 / 450, 0.1, 400);
  camera.position.copy(stage.camPos).multiplyScalar(0.95);
  camera.lookAt(stage.target);
  thumbRenderer.render(stage.scene, camera);
  const url = thumbRenderer.domElement.toDataURL('image/jpeg', 0.85);
  stage.house.dispose();
  thumbCache.set(property.id, url);
  return url;
}
