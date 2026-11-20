/*
 * KIT 3D Operations Floor — ฉากโรงงาน 3D (Three.js)
 * ไฟล์นี้ดูแลเฉพาะภาพ 3D และการเคลื่อนไหวเท่านั้น ไม่มีตัวเลขสมมติ
 * ตัวเลข/สถานะทั้งหมดมาจาก /api/dashboard ผ่าน dashboard-operations-floor.tsx
 * สถานีที่ active=false จะหยุดนิ่ง (พนักงานยืนรอ เครื่องจักรหยุด ไฟเป็นสีเทา)
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type FloorEngine = {
  setActive: (active: boolean[]) => void;
  setRunning: (running: boolean) => void;
  focus: (index: number) => void;
  home: () => void;
  top: () => void;
  dispose: () => void;
};

type StationDef = { key: string; color: number; x: number; z: number; w: number; d: number };
type Station = StationDef & {
  index: number; active: boolean; t: number; g: THREE.Group; anchor: THREE.Vector3;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  tint: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  edge: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
};
type Step = { p: [number, number]; wait?: number; act?: Mode; face?: number; carry?: boolean; cond?: () => boolean; on?: () => void };
type Mode = "idle" | "walk" | "carry" | "work" | "scan" | "hold";
type WorkerRig = { rig: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; box: THREE.Mesh; ph: number };
type ForkRig = { forks: THREE.Group; load: THREE.Group; wheels: THREE.Mesh[]; beacon: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> };

/* ลำดับต้องตรงกับสถานี 1–7 ใน dashboard-operations-floor.tsx */
const DEFS: StationDef[] = [
  { key: "forecast", color: 0x3b82f6, x: -24, z: 7, w: 9, d: 7 },
  { key: "production", color: 0x8b5cf6, x: -13, z: -5, w: 10, d: 7 },
  { key: "receiving", color: 0x22c55e, x: -3, z: 7, w: 9, d: 7 },
  { key: "stock", color: 0x2563eb, x: 5, z: -6, w: 11, d: 9 },
  { key: "picking", color: 0xf59e0b, x: 13, z: 7, w: 8, d: 7 },
  { key: "inspection", color: 0xef4444, x: 21, z: -5, w: 8, d: 7 },
  { key: "delivery", color: 0x6366f1, x: 28.5, z: 8, w: 8, d: 8 },
];
const IDLE = 0x94a3b8;
const CARD = 0xc9976b, CARD2 = 0xb98557;
const T = 0.12;
const PI = Math.PI;

export function createOperationsFloor(container: HTMLElement, opts: {
  getLabels: () => (HTMLElement | null)[];
  onPick: (index: number) => void;
  reducedMotion?: boolean;
}): FloorEngine {
  let running = !opts.reducedMotion;
  let disposed = false;

  /* ---------- renderer / camera ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.insertBefore(renderer.domElement, container.firstChild);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef3fa);
  scene.fog = new THREE.Fog(0xeef3fa, 95, 170);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 500);
  const HOME_T = new THREE.Vector3(2.5, 0, 1);
  const HOME_DIR = new THREE.Vector3(0.5, 37, 43);
  const HOME_P = HOME_T.clone().add(HOME_DIR);
  const TOP_P = new THREE.Vector3(2.51, 78, 2.5), TOP_T = new THREE.Vector3(2.5, 0, 1.5);
  camera.position.copy(HOME_P);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_T);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.38; controls.minDistance = 8; controls.maxDistance = 120;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfcbe0, 2.4));
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(16, 44, 26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 32, bottom: -32, near: 1, far: 130 });
  sun.shadow.bias = -0.0006; scene.add(sun);

  /* ---------- helpers ---------- */
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (c: number, o?: THREE.MeshStandardMaterialParameters) => {
    const k = c + "|" + (o ? JSON.stringify(o) : "");
    let m = matCache.get(k);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, metalness: 0.05, ...o }); matCache.set(k, m); }
    return m;
  };
  const emis = (c: number, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
  function part<G extends THREE.BufferGeometry, M extends THREE.Material>(geo: G, m: M, x: number, y: number, z: number, parent?: THREE.Object3D, noShadow?: boolean) {
    const me = new THREE.Mesh(geo, m); me.position.set(x, y, z);
    if (!noShadow) { me.castShadow = true; me.receiveShadow = true; }
    (parent || scene).add(me); return me;
  }
  const Box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const angLerp = (a: number, b: number, k: number) => { let d = b - a; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2; return a + d * k; };
  const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

  /* ---------- floor & building ---------- */
  part(Box(78, 0.4, 50), mat(0xdde5ef), 2, -0.2, 1.5);
  const grid = new THREE.GridHelper(78, 39, 0xc6d1df, 0xd3dce8);
  grid.scale.z = 50 / 78; grid.position.set(2, 0.005, 1.5);
  (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.55; scene.add(grid);
  [-1.1, 3.6].forEach((z) => part(Box(66, 0.01, 0.14), mat(0xfacc15), 2, 0.012, z, undefined, true));
  const wallM = mat(0xe7edf5);
  part(Box(78, 7, 0.5), wallM, 2, 3.5, -23.5); part(Box(0.5, 7, 50), wallM, -37, 3.5, 1.5);
  part(Box(78, 0.5, 0.6), mat(0x2563eb), 2, 6.9, -23.4);
  [-26, -12, 8, 24].forEach((x) => {
    part(Box(6, 4.8, 0.12), mat(0xcbd5e1), x, 2.4, -23.2);
    for (let i = 0; i < 9; i++) part(Box(6, 0.05, 0.14), mat(0xaab7c8), x, 0.4 + i * 0.5, -23.15, undefined, true);
    part(Box(6.6, 0.3, 0.2), mat(0xf59e0b), x, 4.95, -23.15, undefined, true);
  });

  /* ---------- flow chevrons ---------- */
  const chev: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.38); sh.lineTo(0.38, 0); sh.lineTo(0, -0.38); sh.lineTo(-0.18, -0.38); sh.lineTo(0.2, 0); sh.lineTo(-0.18, 0.38); sh.closePath();
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-PI / 2);
    for (let i = 0; i < 36; i++) {
      const me = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.8, depthWrite: false }));
      me.position.set(0, 0.03, 1.25); me.scale.set(1, 1, -1); scene.add(me); chev.push(me);
    }
  }

  /* ---------- stations ---------- */
  const plats: THREE.Mesh[] = [];
  const ST: Station[] = DEFS.map((def, index) => {
    const g = new THREE.Group(); g.position.set(def.x, 0, def.z); scene.add(g);
    const base = part(Box(def.w, T, def.d), mat(0xf8fafc), 0, T / 2, 0, g); base.userData.index = index; plats.push(base);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(def.w + 0.9, def.d + 0.9), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.3, depthWrite: false }));
    glow.rotation.x = -PI / 2; glow.position.y = 0.02; g.add(glow);
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(def.w - 0.3, def.d - 0.3), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.08, depthWrite: false }));
    tint.rotation.x = -PI / 2; tint.position.y = T + 0.004; g.add(tint);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(Box(def.w, T, def.d)), new THREE.LineBasicMaterial({ color: def.color }));
    edge.position.y = T / 2; g.add(edge);
    return { ...def, index, active: true, t: 0, g, glow, tint, edge, anchor: new THREE.Vector3(def.x, def.key === "stock" ? 5.2 : 3.9, def.z) };
  });
  const [F, P2, R, K, P, I, D] = ST;
  const W = (s: Station, lx: number, lz: number): [number, number] => [s.x + lx, s.z + lz];

  /* ---------- people ---------- */
  function makeWorker(color: number) {
    const g = new THREE.Group(), rig = new THREE.Group(); g.add(rig);
    const shirt = mat(color), pants = mat(0x334155), skin = mat(0xf0c39b), hat = mat(0xfacc15, { roughness: 0.4 });
    part(Box(0.52, 0.62, 0.32), shirt, 0, 1.08, 0, rig);
    part(Box(0.54, 0.07, 0.34), mat(0xe2e8f0, { emissive: 0xffffff, emissiveIntensity: 0.2 }), 0, 0.96, 0, rig);
    part(new THREE.SphereGeometry(0.17, 14, 10), skin, 0, 1.56, 0, rig);
    part(new THREE.SphereGeometry(0.2, 14, 8, 0, PI * 2, 0, PI / 2), hat, 0, 1.6, 0, rig);
    part(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 16), hat, 0, 1.6, 0.04, rig);
    const limb = (x: number, y: number, w: number, h: number, m: THREE.Material, hand?: boolean) => {
      const p = new THREE.Group(); p.position.set(x, y, 0);
      part(Box(w, h, w + 0.02), m, 0, -h / 2, 0, p);
      if (hand) part(new THREE.SphereGeometry(0.08, 8, 6), skin, 0, -h - 0.02, 0, p);
      rig.add(p); return p;
    };
    const legL = limb(-0.13, 0.77, 0.19, 0.74, pants), legR = limb(0.13, 0.77, 0.19, 0.74, pants);
    const armL = limb(-0.34, 1.35, 0.14, 0.56, shirt, true), armR = limb(0.34, 1.35, 0.14, 0.56, shirt, true);
    const box = part(Box(0.52, 0.4, 0.42), mat(CARD), 0, 1.02, 0.44, rig); box.visible = false;
    const u: WorkerRig = { rig, legL, legR, armL, armR, box, ph: Math.random() * 10 };
    g.userData.rig = u;
    return g;
  }
  function poseWorker(u: WorkerRig, mode: Mode, t: number, dt: number) {
    const p = t + u.ph, a = Math.min(1, dt * 12);
    let lL = 0, lR = 0, aL = 0.05, aR = -0.05, bob = 0;
    if (mode === "walk" || mode === "carry") {
      const s = Math.sin(p * 9); lL = s * 0.65; lR = -s * 0.65; bob = Math.abs(Math.cos(p * 9)) * 0.05;
      if (mode === "walk") { aL = -s * 0.55; aR = s * 0.55; } else { aL = aR = -1.2; }
    } else if (mode === "work") { aL = -1.05 + Math.sin(p * 7) * 0.35; aR = -1.05 + Math.sin(p * 7 + 2.1) * 0.35; bob = Math.sin(p * 3.5) * 0.012; }
    else if (mode === "scan") { aL = -0.3; aR = -1.4 + Math.sin(p * 5) * 0.15; }
    u.legL.rotation.x += (lL - u.legL.rotation.x) * a; u.legR.rotation.x += (lR - u.legR.rotation.x) * a;
    u.armL.rotation.x += (aL - u.armL.rotation.x) * a; u.armR.rotation.x += (aR - u.armR.rotation.x) * a;
    u.rig.position.y = bob;
  }
  function makeForklift() {
    const g = new THREE.Group(); const y = mat(0xfacc15, { roughness: 0.45 }), dk = mat(0x1f2937);
    part(Box(1.3, 0.62, 1.9), y, 0, 0.6, -0.1, g);
    part(Box(1.24, 0.58, 0.55), mat(0x374151), 0, 0.72, -0.95, g);
    part(Box(0.55, 0.3, 0.5), dk, 0, 1.05, -0.25, g);
    [[-0.58, 0.5], [0.58, 0.5], [-0.58, -0.75], [0.58, -0.75]].forEach(([x, z]) => part(Box(0.07, 1.35, 0.07), dk, x, 1.55, z, g));
    part(Box(1.3, 0.08, 1.4), dk, 0, 2.25, -0.12, g);
    const beacon = part(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xf97316, emissiveIntensity: 1 }), 0, 2.38, -0.4, g);
    const drv = makeWorker(0x1e3a8a); drv.position.set(0, 0.28, -0.28);
    const du = drv.userData.rig as WorkerRig;
    du.legL.rotation.x = du.legR.rotation.x = -1.45; du.armL.rotation.x = du.armR.rotation.x = -0.95; g.add(drv);
    [-0.45, 0.45].forEach((x) => part(Box(0.1, 2.4, 0.1), dk, x, 1.3, 0.92, g));
    const forks = new THREE.Group(); forks.position.set(0, 0.2, 1.0); g.add(forks);
    part(Box(1.0, 0.55, 0.07), dk, 0, 0.25, 0, forks);
    [-0.3, 0.3].forEach((x) => part(Box(0.13, 0.06, 1.15), mat(0x6b7280), x, 0, 0.58, forks));
    const load = new THREE.Group(); load.position.set(0, 0.04, 0.6); forks.add(load);
    part(Box(1.05, 0.13, 1.05), mat(0x9a6b3f), 0, 0.06, 0, load);
    part(Box(0.48, 0.42, 0.9), mat(CARD), -0.25, 0.34, 0, load); part(Box(0.48, 0.42, 0.9), mat(CARD2), 0.25, 0.34, 0, load);
    load.visible = false;
    const wheels: THREE.Mesh[] = [];
    [[-0.62, 0.55], [0.62, 0.55], [-0.62, -0.75], [0.62, -0.75]].forEach(([x, z]) => {
      const w = part(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14), dk, x, 0.28, z, g); w.rotation.z = PI / 2; wheels.push(w);
    });
    const u: ForkRig = { forks, load, wheels, beacon };
    g.userData.rig = u;
    return g;
  }

  class Mover {
    i = 0; carry = false; arr = true; wait: number; yaw: number;
    constructor(public st: Station, public o: THREE.Group, public route: Step[], public speed: number, public kind: "worker" | "fork") {
      this.wait = route[0].wait || 0; this.yaw = route[0].face || 0;
      o.position.set(route[0].p[0], 0, route[0].p[1]); o.rotation.y = this.yaw; scene.add(o);
    }
    update(dt: number, t: number) {
      const o = this.o, r = this.route; let mode: Mode = "idle";
      if (!this.st.active || dt === 0) { this.anim(this.st.active ? "hold" : "idle", t, dt); return; }
      if (this.arr) {
        const s = r[this.i];
        if (s.face != null) this.yaw = angLerp(this.yaw, s.face, Math.min(1, dt * 6));
        if (this.wait > 0) { this.wait -= dt; mode = s.act || "idle"; }
        else if (s.cond && !s.cond()) mode = "idle";
        else { if (s.carry != null) this.carry = s.carry; s.on?.(); this.i = (this.i + 1) % r.length; this.arr = false; mode = this.carry ? "carry" : "walk"; }
      } else {
        const s = r[this.i]; const dx = s.p[0] - o.position.x, dz = s.p[1] - o.position.z, dist = Math.hypot(dx, dz), step = this.speed * dt;
        if (dist > 0.001) this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * (this.kind === "fork" ? 5 : 10)));
        if (dist <= step) { o.position.x = s.p[0]; o.position.z = s.p[1]; this.arr = true; this.wait = s.wait || 0; mode = s.act || "idle"; }
        else { o.position.x += (dx / dist) * step; o.position.z += (dz / dist) * step; mode = this.carry ? "carry" : "walk"; }
      }
      o.rotation.y = this.yaw; this.anim(mode, t, dt);
    }
    anim(mode: Mode, t: number, dt: number) {
      if (this.kind === "worker") {
        const u = this.o.userData.rig as WorkerRig; u.box.visible = this.carry;
        if (mode === "hold") mode = "idle"; if (mode === "walk" && this.carry) mode = "carry";
        poseWorker(u, mode, t, dt);
      } else {
        const u = this.o.userData.rig as ForkRig; u.load.visible = this.carry;
        if (mode === "walk" || mode === "carry") u.wheels.forEach((w) => (w.rotation.x += (dt * this.speed) / 0.28));
        const fy = mode === "work" ? 0.95 : this.carry ? 0.45 : 0.2;
        u.forks.position.y += (fy - u.forks.position.y) * Math.min(1, dt * 4);
        u.beacon.material.emissiveIntensity = this.st.active && running ? (Math.sin(t * 10) > 0 ? 1.4 : 0.2) : 0.05;
      }
    }
  }
  const movers: Mover[] = [];
  const worker = (st: Station, route: Step[], speed = 1.7) => movers.push(new Mover(st, makeWorker(st.color), route, speed, "worker"));
  const forklift = (st: Station, route: Step[]) => movers.push(new Mover(st, makeForklift(), route, 3.4, "fork"));

  /* ---------- props ---------- */
  type Ticker = (dt: number, t: number) => void;
  const tickers: Ticker[] = [];
  const plant = (g: THREE.Object3D, x: number, z: number) => { part(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 12), mat(0xf1f5f9), x, T + 0.25, z, g); part(new THREE.SphereGeometry(0.45, 10, 8), mat(0x22a35a), x, T + 0.85, z, g); };
  const pallet = (g: THREE.Object3D, x: number, z: number, nx: number, nz: number, ny: number) => {
    const grp = new THREE.Group(); grp.position.set(x, T, z); g.add(grp);
    part(Box(nx * 0.6 + 0.15, 0.14, nz * 0.6 + 0.15), mat(0x9a6b3f), 0, 0.07, 0, grp);
    const boxes: THREE.Mesh[] = [];
    for (let y = 0; y < ny; y++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++)
      boxes.push(part(Box(0.56, 0.44, 0.56), mat((i + k + y) % 2 ? CARD : CARD2), (i - (nx - 1) / 2) * 0.6, 0.38 + y * 0.46, (k - (nz - 1) / 2) * 0.6, grp));
    return boxes;
  };
  const showN = (arr: THREE.Object3D[], n: number) => arr.forEach((b, i) => (b.visible = i < n));
  /* สถานะภายในสำหรับภาพเคลื่อนไหวเท่านั้น (ไม่แสดงเป็นตัวเลข) */
  const V = { recvPallet: 8, pickPallet: 4, truckLoad: 0, truckState: "home" as "home" | "leave" | "away" | "back", truckTimer: 0, refill: 0 };

  // 1 Forecast
  {
    const s = F, g = s.g; const screens: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
    [[-2.2, -1.2], [1.8, -1.2]].forEach(([x, z]) => {
      part(Box(2.3, 0.08, 1.05), mat(0xffffff), x, T + 0.78, z, g);
      [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]].forEach(([a, b]) => part(Box(0.06, 0.76, 0.06), mat(0x94a3b8), x + a, T + 0.39, z + b, g));
      [-0.5, 0.5].forEach((a) => { part(Box(0.8, 0.5, 0.05), mat(0x1f2937), x + a, T + 1.18, z - 0.32, g); screens.push(part(Box(0.72, 0.42, 0.02), emis(0x60a5fa, 0.9), x + a, T + 1.18, z - 0.29, g, true)); });
      part(Box(0.55, 0.08, 0.55), mat(0x1e293b), x, T + 0.48, z + 1.0, g); part(Box(0.55, 0.6, 0.08), mat(0x1e293b), x, T + 0.8, z + 1.28, g);
    });
    part(Box(4.6, 2.6, 0.15), mat(0x0f172a), 0, T + 1.9, -3.1, g);
    [-1.6, 1.6].forEach((x) => part(Box(0.12, 1.2, 0.12), mat(0x94a3b8), x, T + 0.6, -3.1, g));
    const bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
    for (let i = 0; i < 7; i++) { const b = part(Box(0.36, 1, 0.05), emis(i % 2 ? 0x60a5fa : 0x34d399, 0.8), -1.65 + i * 0.55, T + 0.9, -3.0, g, true); b.geometry.translate(0, 0.5, 0); bars.push(b); }
    plant(g, -4, -3); plant(g, 4, 2.9);
    worker(s, [{ p: W(s, -2.2, -0.25), wait: 1e9, act: "work", face: PI }]);
    worker(s, [{ p: W(s, 1.8, -0.25), wait: 6, act: "work", face: PI }, { p: W(s, 0.4, -2.2), wait: 4, act: "scan", face: PI }, { p: W(s, 3.2, 1.6), wait: 2, act: "idle", face: 0 }]);
    tickers.push(() => {
      const on = s.active;
      screens.forEach((sc, i) => (sc.material.emissiveIntensity = on ? 0.7 + 0.3 * Math.sin(s.t * 3 + i * 1.7) : 0.08));
      bars.forEach((b, i) => { if (on) b.scale.y = 0.35 + 0.85 * Math.abs(Math.sin(s.t * 0.7 + i * 0.9)); b.material.emissiveIntensity = on ? 0.9 : 0.15; });
    });
  }
  // 2 Production
  {
    const s = P2, g = s.g;
    part(Box(2.6, 1.9, 1.9), mat(0xcbd5e1, { metalness: 0.3 }), -3, T + 0.95, -1.9, g); part(Box(0.9, 0.6, 0.06), mat(0x1f2937), -3, T + 1.3, -0.92, g);
    const scr = part(Box(0.8, 0.5, 0.02), emis(0xa78bfa), -3, T + 1.3, -0.88, g, true);
    const lamp = part(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 12), emis(0x22c55e), -2, T + 2.1, -1.9, g);
    part(new THREE.CylinderGeometry(0.55, 0.65, 0.4, 16), mat(0x475569), 0.8, T + 0.2, -2, g);
    const tur = new THREE.Group(); tur.position.set(0.8, T + 0.4, -2); g.add(tur);
    const a1 = new THREE.Group(); a1.position.y = 0.15; tur.add(a1); part(Box(0.28, 1.3, 0.28), mat(0xf97316, { roughness: 0.4 }), 0, 0.65, 0, a1);
    const a2 = new THREE.Group(); a2.position.y = 1.3; a1.add(a2); part(Box(0.22, 1, 0.22), mat(0xf97316, { roughness: 0.4 }), 0, 0.5, 0, a2); part(Box(0.4, 0.15, 0.15), mat(0x1f2937), 0, 1.05, 0, a2);
    part(Box(7.4, 0.55, 1.1), mat(0x64748b), 0, T + 0.42, 1.6, g); part(Box(7.4, 0.06, 0.9), mat(0x111827), 0, T + 0.72, 1.6, g);
    const belt: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) { const b = part(Box(0.5, 0.42, 0.5), mat(CARD), 0, T + 0.96, 1.6, g); part(Box(0.3, 0.2, 0.01), mat(0xffffff), 0, 0, 0.26, b, true); belt.push(b); }
    part(Box(0.9, 0.9, 0.9), mat(0xf8fafc), 4.2, T + 0.45, 1.6, g);
    const pl = part(Box(0.3, 0.08, 0.02), emis(0x22c55e), 4.2, T + 0.75, 2.06, g, true);
    plant(g, -4.4, 2.9);
    worker(s, [{ p: W(s, -3, -0.5), wait: 1e9, act: "work", face: PI }]);
    worker(s, [{ p: W(s, 3.3, 2.7), wait: 3, act: "work", face: PI }, { p: W(s, 1.6, -0.6), wait: 3, act: "scan", face: PI }, { p: W(s, -1, 2.7), wait: 2.5, act: "work", face: PI }]);
    tickers.push((_dt, t) => {
      const on = s.active;
      tur.rotation.y = Math.sin(s.t * 0.8) * 1.5; a1.rotation.z = 0.35 + Math.sin(s.t * 1.3) * 0.3; a2.rotation.z = 0.9 + Math.sin(s.t * 1.7) * 0.45;
      scr.material.emissiveIntensity = on ? 0.9 : 0.08;
      lamp.material.emissive.setHex(on ? 0x22c55e : 0x64748b); lamp.material.emissiveIntensity = on ? (Math.sin(t * 4) > 0 ? 1.2 : 0.5) : 0.1;
      pl.material.emissiveIntensity = on ? 1 : 0.1;
      belt.forEach((b, i) => { b.position.x = -3.6 + ((s.t * 0.9 + i * 1.44) % 7.2); });
    });
  }
  // 3 Receiving
  {
    const s = R, g = s.g;
    const rp = pallet(g, 1.6, -2.3, 2, 2, 2);
    pallet(g, -2.8, -1.6, 2, 2, 3); pallet(g, -2.8, 1.3, 2, 2, 2);
    part(Box(1.5, 0.9, 0.8), mat(0xe2e8f0), 0.6, T + 0.45, 2.1, g); part(Box(0.6, 0.4, 0.05), mat(0x1f2937), 0.6, T + 1.15, 1.85, g);
    [1.4, 4.0].forEach((x) => part(Box(0.14, 2.4, 0.14), mat(0x334155), x, T + 1.2, 0, g));
    const gate = part(Box(2.7, 0.18, 0.2), emis(0x22c55e), 2.7, T + 2.4, 0, g);
    plant(g, -4, 3);
    worker(s, [{ p: W(s, -2, -1.6), wait: 1.2, act: "work", face: -PI / 2, carry: true }, { p: W(s, 0.6, 1.35), wait: 2.2, act: "scan", face: 0, carry: false }], 1.6);
    worker(s, [{ p: W(s, 3.2, 1.5), wait: 4, act: "scan", face: -PI / 2 }, { p: W(s, 3.2, -0.9), wait: 3, act: "scan", face: PI }]);
    tickers.push((dt, t) => {
      gate.material.emissiveIntensity = s.active ? 0.6 + 0.6 * Math.abs(Math.sin(t * 3)) : 0.05;
      if (V.recvPallet < 2 && s.active) { V.refill += dt; if (V.refill > 2.5) { V.refill = 0; V.recvPallet = 8; } }
      showN(rp, V.recvPallet);
    });
  }
  // 4 Stock racks
  const slots: { m: THREE.Mesh; front: boolean; grow?: number }[] = [];
  const growing: { m: THREE.Mesh; grow: number }[] = [];
  {
    const s = K, g = s.g; const blue = mat(0x1d4ed8, { roughness: 0.5 }), org = mat(0xf97316, { roughness: 0.5 });
    [-1.4, 2.5].forEach((rz, ri) => {
      for (let b = 0; b <= 4; b++) { const x = -4.4 + b * 2.2; [-0.55, 0.55].forEach((dz) => part(Box(0.1, 3.6, 0.1), blue, x, T + 1.8, rz + dz, g)); }
      [0.12, 1.22, 2.32, 3.42].forEach((y) => [-0.55, 0.55].forEach((dz) => part(Box(8.9, 0.1, 0.08), org, 0, T + y, rz + dz, g)));
      [0.12, 1.22, 2.32].forEach((y) => part(Box(8.8, 0.04, 1.1), mat(0x94a3b8), 0, T + y + 0.06, rz, g, true));
      for (let lv = 0; lv < 3; lv++) for (let b = 0; b < 4; b++) for (let k = 0; k < 2; k++) {
        const bx = part(Box(0.85, 0.8, 0.95), mat((b + k + lv) % 2 ? CARD : CARD2), -4.4 + b * 2.2 + 0.6 + k * 1, T + [0.12, 1.22, 2.32][lv] + 0.5, rz, g);
        bx.visible = Math.random() < 0.7; slots.push({ m: bx, front: ri === 1 });
      }
    });
    worker(s, [{ p: W(s, -4, 0.55), wait: 2.5, act: "scan", face: PI }, { p: W(s, -0.5, 0.55), wait: 2.5, act: "scan", face: 0 }, { p: W(s, 3.6, 0.55), wait: 2.5, act: "scan", face: PI }], 1.4);
  }
  const fillSlot = () => {
    const e = slots.filter((x) => !x.m.visible); if (!e.length) return;
    const pref = e.filter((x) => x.front); const pool = pref.length ? pref : e;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    pick.m.visible = true; pick.m.scale.setScalar(0.01); growing.push({ m: pick.m, grow: 0 });
  };
  const takeSlot = () => { const f = slots.filter((x) => x.m.visible); if (f.length) f[Math.floor(Math.random() * f.length)].m.visible = false; };
  // 5 Picking
  {
    const s = P, g = s.g;
    const pp = pallet(g, -1.5, -2, 2, 2, 3);
    part(Box(3.2, 0.9, 1.4), mat(0xe2e8f0), 1.5, T + 0.45, 0.5, g);
    for (let i = 0; i < 3; i++) part(Box(0.5, 0.4, 0.5), mat(CARD), 0.6 + i * 0.8, T + 1.12, 0.5, g);
    part(Box(0.6, 0.5, 0.4), mat(0x0ea5e9), 2.8, T + 1.15, 0.5, g);
    pallet(g, -2.4, 2.2, 2, 2, 1); plant(g, 3.4, 3);
    worker(s, [
      { p: W(s, -1.5, -0.7), wait: 1, act: "work", face: PI, carry: true, cond: () => V.pickPallet > 0, on: () => { V.pickPallet = Math.max(0, V.pickPallet - 1); } },
      { p: W(s, 0.6, -0.45), wait: 1.5, act: "work", face: 0, carry: false }], 1.6);
    worker(s, [{ p: W(s, 1.8, 1.65), wait: 1e9, act: "work", face: PI }]);
    tickers.push(() => showN(pp, V.pickPallet));
  }
  // 6 Inspection
  {
    const s = I, g = s.g;
    part(Box(3.2, 0.9, 1.5), mat(0xf1f5f9), 0, T + 0.45, 0, g);
    [-1.7, 1.7].forEach((x) => part(Box(0.12, 2.2, 0.12), mat(0x334155), x, T + 1.1, 0, g)); part(Box(3.5, 0.14, 0.3), mat(0x334155), 0, T + 2.2, 0, g);
    const laser = part(Box(0.05, 0.03, 1.4), emis(0xef4444, 2), 0, T + 1.05, 0, g, true);
    const beam = part(Box(0.02, 1.1, 0.02), new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.6 }), 0, T + 1.6, 0, g, true);
    for (let i = 0; i < 2; i++) part(Box(0.5, 0.4, 0.5), mat(CARD), -0.8 + i * 1.4, T + 1.12, 0.1, g);
    pallet(g, 2.6, -2.2, 2, 2, 2); plant(g, -3.3, -2.8);
    worker(s, [{ p: W(s, -0.6, 1.2), wait: 1e9, act: "scan", face: PI }]);
    worker(s, [{ p: W(s, 0.9, -1.2), wait: 1e9, act: "work", face: 0 }]);
    tickers.push(() => { const x = Math.sin(s.t * 2.2) * 1.3; laser.position.x = x; beam.position.x = x; laser.visible = beam.visible = s.active; });
  }
  // 7 Delivery + truck
  {
    const s = D, g = s.g;
    for (let i = 0; i < 8; i++) part(Box(0.45, 0.01, 1), mat(i % 2 ? 0x111827 : 0xfacc15), -3.6, T + 0.006, -3.4 + i * 0.95, g, true);
    const tg = new THREE.Group(); g.add(tg); const x0 = 1.4; tg.position.set(x0, 0, 0);
    const cargoM = mat(0xf8fafc, { roughness: 0.5 });
    part(Box(7.2, 0.35, 2.3), mat(0x1f2937), 0, 0.75, 0, tg);
    part(Box(4.6, 0.08, 2.3), cargoM, -1, 2.95, 0, tg); part(Box(4.6, 2.1, 0.08), cargoM, -1, 1.9, 1.11, tg); part(Box(4.6, 2.1, 0.08), cargoM, -1, 1.9, -1.11, tg); part(Box(0.08, 2.1, 2.3), cargoM, 1.26, 1.9, 0, tg);
    part(Box(4.6, 0.4, 0.1), mat(0x2563eb), -1, 2.5, 1.17, tg, true); part(Box(4.6, 0.4, 0.1), mat(0x2563eb), -1, 2.5, -1.17, tg, true);
    part(Box(1.9, 1.9, 2.3), mat(0x2563eb, { roughness: 0.35 }), 2.55, 1.85, 0, tg); part(Box(0.06, 0.8, 2), mat(0x0f172a, { roughness: 0.1, metalness: 0.5 }), 3.51, 2.25, 0, tg);
    const wh: THREE.Mesh[] = [];
    [[-2.4, 1.05], [-2.4, -1.05], [-1.3, 1.05], [-1.3, -1.05], [2.6, 1.05], [2.6, -1.05]].forEach(([x, z]) => { const w = part(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 16), mat(0x111827), x, 0.45, z, tg); w.rotation.x = PI / 2; wh.push(w); });
    const cb: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) { const b = part(Box(0.75, 0.65, 0.8), mat(i % 2 ? CARD : CARD2), 0.6 - Math.floor(i / 2) * 0.9, 1.27, i % 2 ? 0.45 : -0.45, tg); b.visible = false; cb.push(b); }
    pallet(g, -2.4, -3, 2, 2, 2);
    tickers.push((dt) => {
      showN(cb, V.truckLoad);
      if (V.truckState === "leave") { tg.position.x += dt * 7; wh.forEach((w) => (w.rotation.y -= dt * 15)); if (tg.position.x > 20) { V.truckState = "away"; V.truckTimer = 2.5; tg.visible = false; } }
      else if (V.truckState === "away") { V.truckTimer -= dt; if (V.truckTimer <= 0) { V.truckState = "back"; tg.visible = true; V.truckLoad = 0; } }
      else if (V.truckState === "back") { tg.position.x -= dt * 6; wh.forEach((w) => (w.rotation.y += dt * 13)); if (tg.position.x <= x0) { tg.position.x = x0; V.truckState = "home"; } }
    });
  }
  /* ---------- cross-station movers ---------- */
  forklift(R, [
    { p: [R.x + 1.6, R.z - 4.5], wait: 1.6, act: "work", face: 0, carry: true, cond: () => V.recvPallet >= 2, on: () => { V.recvPallet -= 2; } },
    { p: [R.x + 1.6, 1.0] }, { p: [K.x - 2.2, 1.0] },
    { p: [K.x - 2.2, -1.75], wait: 1.6, act: "work", face: PI, carry: false, on: () => { fillSlot(); fillSlot(); } },
    { p: [K.x - 2.2, 1.0] }, { p: [R.x + 1.6, 1.0] }]);
  forklift(P, [
    { p: [K.x + 3.4, 1.45] },
    { p: [K.x + 3.4, -1.75], wait: 1.6, act: "work", face: PI, carry: true, cond: () => slots.some((x) => x.m.visible) && V.pickPallet <= 8, on: takeSlot },
    { p: [K.x + 3.4, 1.45] }, { p: [P.x - 1.5, 1.45] },
    { p: [P.x - 1.5, 2.9], wait: 1.4, act: "work", face: 0, carry: false, on: () => { V.pickPallet = Math.min(12, V.pickPallet + 4); } },
    { p: [P.x - 1.5, 1.45] }]);
  worker(I, [
    { p: [P.x + 2.6, P.z - 1.0], wait: 1, act: "work", face: 0, carry: true },
    { p: [P.x + 4, 1.9] }, { p: [I.x - 0.6, -0.6] },
    { p: [I.x - 0.6, I.z + 1.05], wait: 1.4, act: "work", face: PI, carry: false },
    { p: [I.x - 0.6, -0.6] }, { p: [P.x + 4, 1.9] }], 1.8);
  worker(D, [
    { p: [I.x + 1.2, I.z + 1.05], wait: 1, act: "work", face: PI, carry: true },
    { p: [I.x + 2.8, 1.6] },
    { p: [D.x - 2.9, D.z], wait: 1.3, act: "work", face: PI / 2, carry: false, cond: () => V.truckState === "home", on: () => { V.truckLoad++; if (V.truckLoad >= 6) V.truckState = "leave"; } },
    { p: [I.x + 2.8, 1.6] }], 1.8);

  /* ---------- camera tween ---------- */
  let tw: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number; dur: number } | null = null;
  const flyTo = (p: THREE.Vector3, t: THREE.Vector3, dur = 1.2) => { tw = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p.clone(), t1: t.clone(), k: 0, dur }; };
  const onStart = () => { tw = null; };
  controls.addEventListener("start", onStart);

  /* ---------- picking ---------- */
  const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
  let down: { x: number; y: number } | null = null, hover = -1;
  const hit = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    mv.x = ((e.clientX - r.left) / r.width) * 2 - 1; mv.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mv, camera);
    const h = ray.intersectObjects(plats, false)[0];
    return h ? (h.object.userData.index as number) : -1;
  };
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) { const i = hit(e); if (i >= 0) opts.onPick(i); } down = null; };
  const onMove = (e: PointerEvent) => { if (e.buttons) return; hover = hit(e); renderer.domElement.style.cursor = hover >= 0 ? "pointer" : "grab"; };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  /* ---------- resize ---------- */
  let first = true;
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const f = THREE.MathUtils.clamp(2.4 / camera.aspect, 1.1, 2.8);
    HOME_P.copy(HOME_T).addScaledVector(HOME_DIR, f);
    if (first) { camera.position.copy(HOME_P); first = false; }
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  /* ---------- loop ---------- */
  const clock = new THREE.Clock(); let simT = 0; const tmpV = new THREE.Vector3(), cA = new THREE.Color();
  const flowCols = ST.map((s) => ({ x: s.x, c: new THREE.Color(s.color) }));
  const flowColor = (x: number, out: THREE.Color) => {
    let a = flowCols[0], b = flowCols[flowCols.length - 1];
    for (let i = 0; i < flowCols.length - 1; i++) if (x >= flowCols[i].x && x <= flowCols[i + 1].x) { a = flowCols[i]; b = flowCols[i + 1]; break; }
    return out.copy(a.c).lerp(b.c, THREE.MathUtils.clamp((x - a.x) / (b.x - a.x || 1), 0, 1));
  };
  let raf = 0;
  const loop = () => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const rdt = Math.min(clock.getDelta(), 0.05); const dt = running ? rdt : 0; simT += dt;
    ST.forEach((s) => {
      if (s.active) s.t += dt;
      const on = s.active;
      s.glow.material.color.setHex(on ? s.color : IDLE);
      s.glow.material.opacity = on ? 0.24 + 0.12 * Math.sin(simT * 2.4 + s.index) : 0.12;
      s.edge.material.color.setHex(on ? s.color : IDLE);
      s.tint.material.opacity = hover === s.index ? 0.2 : 0.07;
    });
    tickers.forEach((f) => f(dt, simT));
    movers.forEach((m) => m.update(dt, simT));
    for (let i = growing.length - 1; i >= 0; i--) { const g = growing[i]; g.grow += rdt * 4; g.m.scale.setScalar(ease(Math.min(1, g.grow))); if (g.grow >= 1) growing.splice(i, 1); }
    const L = 57.6;
    chev.forEach((c, i) => {
      const x = -27 + ((i * 1.6 + simT * 2.2) % L); c.position.x = x; flowColor(x, cA); c.material.color.copy(cA);
      c.material.opacity = 0.75 * Math.max(0, Math.min(1, (x + 27) / 3, (30.6 - x) / 3));
    });
    if (tw) { tw.k += rdt / tw.dur; const e = ease(Math.min(1, tw.k)); camera.position.lerpVectors(tw.p0, tw.p1, e); controls.target.lerpVectors(tw.t0, tw.t1, e); if (tw.k >= 1) tw = null; }
    controls.update();
    renderer.render(scene, camera);
    const w = container.clientWidth, h = container.clientHeight; const labels = opts.getLabels();
    ST.forEach((s, i) => {
      const el = labels[i]; if (!el) return;
      tmpV.copy(s.anchor).project(camera);
      const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15;
      el.style.display = vis ? "" : "none";
      if (vis) { el.style.left = (tmpV.x * 0.5 + 0.5) * w + "px"; el.style.top = (-tmpV.y * 0.5 + 0.5) * h + "px"; el.style.zIndex = String(10 + Math.round((1 - tmpV.z) * 1e4)); }
    });
  };
  loop();

  return {
    setActive(active) { ST.forEach((s, i) => (s.active = !!active[i])); },
    setRunning(r) { running = r; },
    focus(i) { const s = ST[i]; if (s) flyTo(new THREE.Vector3(s.x + 6, 10.5, s.z + 13), new THREE.Vector3(s.x, 1, s.z)); },
    home() { flyTo(HOME_P, HOME_T); },
    top() { flyTo(TOP_P, TOP_T); },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      controls.removeEventListener("start", onStart); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose()); else mt?.dispose();
      });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
