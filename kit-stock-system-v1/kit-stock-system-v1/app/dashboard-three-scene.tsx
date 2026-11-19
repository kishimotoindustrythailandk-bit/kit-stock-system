"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import styles from "./dashboard-operations-floor.module.css";

export type ThreeStation = {
  number: number;
  label: string;
  sub: string;
  page: string;
  tone: string;
  value?: string;
  active: boolean;
  motion: "office" | "machine" | "scanner" | "forklift" | "packing" | "verify" | "loading";
};

export type ThreeSceneHandle = {
  rotate: (amount: number) => void;
  zoom: (amount: number) => void;
  reset: () => void;
};

type AnimatedStation = {
  root: THREE.Group;
  actor: THREE.Group;
  leftArm?: THREE.Group;
  rightArm?: THREE.Group;
  wheels?: THREE.Mesh[];
  baseX: number;
  baseY: number;
  baseZ: number;
};

const STATION_POSITIONS: Array<[number, number, number]> = [
  [-11, 0, -4], [-7.5, 0, .5], [-3.4, 0, 3.7], [1.2, 0, -2.5],
  [5.5, 0, 3.1], [9.4, 0, -1.4], [12, 0, 3.9],
];
const STATION_COLORS = [0x1376e8, 0x7a45e5, 0x14ae69, 0x087dd8, 0xf39a11, 0xef3651, 0x7848e9];
const CAMERA_HOME = { theta: .05, phi: .94, radius: 29 };

const material = (color: number, roughness = .62, metalness = .06) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const item = new THREE.Mesh(geometry, mat);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
};

function addBox(parent: THREE.Object3D, size: [number, number, number], color: number, pos: [number, number, number], rotationY = 0) {
  const item = mesh(new THREE.BoxGeometry(...size), material(color), ...pos);
  item.rotation.y = rotationY;
  parent.add(item);
  return item;
}

function createWorker(color: number) {
  const worker = new THREE.Group();
  const skin = material(0xf2b48b);
  const navy = material(0x17345d);
  worker.add(mesh(new THREE.CapsuleGeometry(.35, .72, 5, 10), material(color), 0, 1.42, 0));
  worker.add(mesh(new THREE.SphereGeometry(.31, 14, 10), skin, 0, 2.18, 0));
  const helmet = mesh(new THREE.SphereGeometry(.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xffd24b), 0, 2.35, 0);
  worker.add(helmet);

  const limb = (x: number, y: number, angle: number) => {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    const part = mesh(new THREE.CapsuleGeometry(.11, .62, 4, 8), navy, 0, -.35, 0);
    part.rotation.z = angle;
    group.add(part);
    worker.add(group);
    return group;
  };
  const leftArm = limb(-.38, 1.76, -.25);
  const rightArm = limb(.38, 1.76, .25);
  const leftLeg = limb(-.2, 1.05, -.08);
  const rightLeg = limb(.2, 1.05, .08);
  leftLeg.position.y = .98;
  rightLeg.position.y = .98;
  return { worker, leftArm, rightArm };
}

function createDesk(parent: THREE.Object3D, color = 0xe8edf4) {
  addBox(parent, [2.2, .15, 1.05], color, [0, 1.05, 0]);
  addBox(parent, [.12, 1, .12], 0x60748b, [-.9, .5, -.38]);
  addBox(parent, [.12, 1, .12], 0x60748b, [.9, .5, -.38]);
  addBox(parent, [.12, 1, .12], 0x60748b, [-.9, .5, .38]);
  addBox(parent, [.12, 1, .12], 0x60748b, [.9, .5, .38]);
  addBox(parent, [1.05, .72, .12], 0x173c65, [0, 1.56, -.2]);
  addBox(parent, [.82, .5, .04], 0x54dfff, [0, 1.56, -.27]);
}

function createPallet(parent: THREE.Object3D, x: number, z: number, boxes = 4) {
  addBox(parent, [2.2, .14, 1.45], 0xb77b3d, [x, .12, z]);
  for (let index = 0; index < boxes; index += 1) {
    const col = index % 2;
    const row = Math.floor(index / 2);
    addBox(parent, [.9, .62, .58], 0xd99a4d, [x + (col ? .5 : -.5), .5 + row * .62, z]);
  }
}

function createRack(parent: THREE.Object3D, x: number, z: number, length = 5.3) {
  const blue = 0x1765ad;
  const orange = 0xf1a21c;
  for (const px of [-length / 2, 0, length / 2]) {
    addBox(parent, [.12, 4.4, .12], blue, [x + px, 2.2, z - .72]);
    addBox(parent, [.12, 4.4, .12], blue, [x + px, 2.2, z + .72]);
  }
  for (const y of [1.1, 2.35, 3.6]) {
    addBox(parent, [length + .15, .12, .12], orange, [x, y, z - .72]);
    addBox(parent, [length + .15, .12, .12], orange, [x, y, z + .72]);
    for (let bx = -2; bx <= 2; bx += 1) addBox(parent, [.78, .72, 1.14], 0xd99848, [x + bx * .94, y + .42, z]);
  }
}

function createForklift() {
  const group = new THREE.Group();
  addBox(group, [2.15, .78, 1.25], 0xf5b313, [0, .7, 0]);
  addBox(group, [1.05, 1.28, 1.08], 0xe6a40f, [-.38, 1.55, 0]);
  addBox(group, [.7, .8, 1.12], 0x9de5ff, [-.42, 1.62, 0]);
  addBox(group, [.12, 2.6, .12], 0x263b52, [1.18, 1.4, -.42]);
  addBox(group, [.12, 2.6, .12], 0x263b52, [1.18, 1.4, .42]);
  addBox(group, [1.3, .1, .12], 0x263b52, [1.75, .25, -.42]);
  addBox(group, [1.3, .1, .12], 0x263b52, [1.75, .25, .42]);
  const wheels: THREE.Mesh[] = [];
  for (const x of [-.7, .72]) for (const z of [-.68, .68]) {
    const wheel = mesh(new THREE.CylinderGeometry(.32, .32, .2, 16), material(0x172638), x, .36, z);
    wheel.rotation.x = Math.PI / 2;
    group.add(wheel);
    wheels.push(wheel);
  }
  return { group, wheels };
}

function createTruck() {
  const truck = new THREE.Group();
  addBox(truck, [3.7, 2.35, 1.75], 0xf7f9fc, [-.55, 1.35, 0]);
  addBox(truck, [1.6, 1.85, 1.7], 0xffffff, [2.05, 1.08, 0]);
  addBox(truck, [.9, .64, 1.76], 0x8ed7f4, [2.36, 1.47, 0]);
  addBox(truck, [1.65, .38, 1.78], 0x176fd5, [-.35, 1.35, 0]);
  for (const x of [-1.3, 1.7]) for (const z of [-.91, .91]) {
    const wheel = mesh(new THREE.CylinderGeometry(.34, .34, .18, 16), material(0x162538), x, .3, z);
    wheel.rotation.x = Math.PI / 2;
    truck.add(wheel);
  }
  return truck;
}

function createStationScene(station: ThreeStation, position: [number, number, number]) {
  const root = new THREE.Group();
  root.position.set(...position);
  const color = STATION_COLORS[station.number - 1];
  const platform = mesh(new THREE.CylinderGeometry(2.1, 2.18, .16, 48), material(color, .55, .16), 0, .08, 0);
  platform.userData.station = station.number;
  root.add(platform);
  const haloMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: station.active ? .38 : .12, side: THREE.DoubleSide });
  const halo = mesh(new THREE.RingGeometry(2.22, 2.38, 48), haloMaterial, 0, .18, 0);
  halo.rotation.x = -Math.PI / 2;
  halo.userData.station = station.number;
  root.add(halo);

  let actor: THREE.Group;
  let leftArm: THREE.Group | undefined;
  let rightArm: THREE.Group | undefined;
  let wheels: THREE.Mesh[] | undefined;

  if (station.motion === "forklift") {
    const forklift = createForklift();
    actor = forklift.group;
    wheels = forklift.wheels;
    root.add(actor);
    createRack(root, 0, -1.7, 4.2);
  } else {
    const person = createWorker(0x1677d6);
    actor = person.worker;
    leftArm = person.leftArm;
    rightArm = person.rightArm;
    actor.position.set(.65, .16, .55);
    root.add(actor);
    if (station.motion === "office" || station.motion === "verify") {
      const desk = new THREE.Group();
      desk.position.set(-.55, .1, -.5);
      desk.rotation.y = -.12;
      createDesk(desk, station.motion === "verify" ? 0xf8dfe5 : 0xe9f2fb);
      root.add(desk);
    } else if (station.motion === "machine") {
      addBox(root, [1.55, 1.75, 1.2], 0x8fa3b8, [-.65, 1.02, -.35]);
      addBox(root, [.8, .54, .06], 0x48dff2, [-.65, 1.35, -.98]);
      addBox(root, [.72, .08, .6], 0xffffff, [-.65, .15, -.4]);
    } else if (station.motion === "scanner") {
      createPallet(root, -.55, -.35, 4);
      addBox(actor, [.35, .18, .18], 0x172d4a, [.58, 1.65, 0]);
    } else if (station.motion === "packing") {
      createPallet(root, -.5, -.25, 3);
      addBox(actor, [.7, .5, .45], 0xd99a4d, [.55, 1.25, 0]);
    } else if (station.motion === "loading") {
      const truck = createTruck();
      truck.scale.setScalar(.65);
      truck.position.set(-.6, .15, -.45);
      truck.rotation.y = -.22;
      root.add(truck);
      actor.position.set(1.15, .16, .8);
    }
  }

  root.traverse((child) => { child.userData.station ??= station.number; });
  return { root, actor, leftArm, rightArm, wheels, baseX: actor.position.x, baseY: actor.position.y, baseZ: actor.position.z } satisfies AnimatedStation;
}

const DashboardThreeScene = forwardRef<ThreeSceneHandle, {
  stations: ThreeStation[];
  animationEnabled: boolean;
  canOpen: (page: string) => boolean;
  onOpen: (page: string) => void;
}>(({ stations, animationEnabled, canOpen, onOpen }, ref) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const stationsRef = useRef(stations);
  const animationRef = useRef(animationEnabled);
  const permissionsRef = useRef(canOpen);
  const openRef = useRef(onOpen);
  const cameraControlRef = useRef<ThreeSceneHandle | null>(null);
  const labelRefs = useRef(new Map<number, HTMLButtonElement>());
  const [fallback, setFallback] = useState(false);

  stationsRef.current = stations;
  animationRef.current = animationEnabled;
  permissionsRef.current = canOpen;
  openRef.current = onOpen;
  useImperativeHandle(ref, () => ({
    rotate: (amount) => cameraControlRef.current?.rotate(amount),
    zoom: (amount) => cameraControlRef.current?.zoom(amount),
    reset: () => cameraControlRef.current?.reset(),
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = styles.webglCanvas;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "โรงงานสามมิติจริง หมุนและซูมได้ คลิกสถานีเพื่อเปิดหน้าทำงาน");
    host.insertBefore(renderer.domElement, host.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdceeff);
    scene.fog = new THREE.Fog(0xdceeff, 30, 48);
    const camera = new THREE.PerspectiveCamera(40, 2, .1, 100);
    const orbit = { ...CAMERA_HOME };
    const target = new THREE.Vector3(.7, 1.1, .4);
    const applyCamera = () => {
      const sinPhi = Math.sin(orbit.phi);
      camera.position.set(
        target.x + orbit.radius * sinPhi * Math.sin(orbit.theta),
        target.y + orbit.radius * Math.cos(orbit.phi),
        target.z + orbit.radius * sinPhi * Math.cos(orbit.theta),
      );
      camera.lookAt(target);
    };
    applyCamera();

    cameraControlRef.current = {
      rotate: (amount) => { orbit.theta += amount * .08; applyCamera(); },
      zoom: (amount) => { orbit.radius = THREE.MathUtils.clamp(orbit.radius - amount * 12, 18, 39); applyCamera(); },
      reset: () => { Object.assign(orbit, CAMERA_HOME); applyCamera(); },
    };

    scene.add(new THREE.HemisphereLight(0xffffff, 0x52749a, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 3.1);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    scene.add(sun);

    const floor = mesh(new THREE.PlaneGeometry(32, 18), new THREE.MeshStandardMaterial({ color: 0xf1f5f8, roughness: .88, metalness: .02 }), 0, 0, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(32, 32, 0x9fc0dd, 0xc7d8e8);
    grid.position.y = .012;
    scene.add(grid);
    addBox(scene, [32, 5.5, .25], 0xc7d7e6, [0, 2.75, -8.85]);
    addBox(scene, [.25, 5.5, 18], 0xc7d7e6, [-16.1, 2.75, 0]);
    for (let x = -14; x <= 14; x += 4) addBox(scene, [.12, .08, 17], 0xf6c545, [x, .04, 0]);
    createRack(scene, 1.4, -6.2, 8.5);
    createRack(scene, 8.3, -6.2, 4.6);
    createPallet(scene, -13.2, 4.8, 4);
    createPallet(scene, 12.8, -.8, 4);

    const animated = new Map<number, AnimatedStation>();
    const stationRoots = new Map<number, THREE.Group>();
    stationsRef.current.forEach((station, index) => {
      const item = createStationScene(station, STATION_POSITIONS[index]);
      animated.set(station.number, item);
      stationRoots.set(station.number, item.root);
      scene.add(item.root);
    });

    const pointer = { active: false, moved: false, id: -1, x: 0, y: 0, theta: 0, phi: 0 };
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const pointerDown = (event: PointerEvent) => {
      pointer.active = true;
      pointer.moved = false;
      pointer.id = event.pointerId;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.theta = orbit.theta;
      pointer.phi = orbit.phi;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add(styles.webglDragging);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!pointer.active || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) pointer.moved = true;
      orbit.theta = pointer.theta - dx * .007;
      orbit.phi = THREE.MathUtils.clamp(pointer.phi + dy * .006, .52, 1.28);
      applyCamera();
    };
    const pointerUp = (event: PointerEvent) => {
      if (!pointer.active || pointer.id !== event.pointerId) return;
      if (!pointer.moved) {
        setPointer(event);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects([...stationRoots.values()], true).find((item) => item.object.userData.station);
        const number = Number(hit?.object.userData.station || 0);
        const station = stationsRef.current.find((item) => item.number === number);
        if (station && permissionsRef.current(station.page)) openRef.current(station.page);
      }
      pointer.active = false;
      renderer.domElement.classList.remove(styles.webglDragging);
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      orbit.radius = THREE.MathUtils.clamp(orbit.radius + event.deltaY * .018, 18, 39);
      applyCamera();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") orbit.theta += .11;
      else if (event.key === "ArrowRight") orbit.theta -= .11;
      else if (event.key === "+" || event.key === "=") orbit.radius = Math.max(18, orbit.radius - 1.4);
      else if (event.key === "-") orbit.radius = Math.min(39, orbit.radius + 1.4);
      else if (event.key === "0") Object.assign(orbit, CAMERA_HOME);
      else return;
      event.preventDefault();
      applyCamera();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    renderer.domElement.addEventListener("keydown", keydown);

    const clock = new THREE.Clock();
    let frame = 0;
    const labelVector = new THREE.Vector3();
    const render = () => {
      frame = requestAnimationFrame(render);
      const elapsed = clock.getElapsedTime();
      const liveStations = stationsRef.current;
      animated.forEach((item, number) => {
        const active = Boolean(animationRef.current && liveStations.find((station) => station.number === number)?.active);
        const speed = elapsed * (1 + number * .035);
        if (active) {
          item.actor.position.y = item.baseY + Math.sin(speed * 3.4) * .035;
          if (item.leftArm) item.leftArm.rotation.z = Math.sin(speed * 4.3) * .48;
          if (item.rightArm) item.rightArm.rotation.z = -Math.sin(speed * 4.3) * .48;
          if (number === 4) {
            item.actor.position.x = item.baseX + Math.sin(speed * .75) * 1.12;
            item.wheels?.forEach((wheelItem) => { wheelItem.rotation.y = speed * 3.2; });
          } else if (number === 7) item.actor.position.z = item.baseZ + Math.sin(speed * 1.2) * .65;
        }
        const halo = item.root.children[1] as THREE.Mesh;
        const haloMat = halo.material as THREE.MeshBasicMaterial;
        haloMat.opacity = active ? .26 + Math.sin(speed * 2.4) * .14 : .08;

        const label = labelRefs.current.get(number);
        if (label) {
          labelVector.setFromMatrixPosition(item.root.matrixWorld).add(new THREE.Vector3(0, 3.6, 0)).project(camera);
          const visible = labelVector.z < 1;
          label.style.transform = `translate(-50%,-50%) translate(${(labelVector.x * .5 + .5) * host.clientWidth}px,${(-labelVector.y * .5 + .5) * host.clientHeight}px)`;
          label.style.opacity = visible ? "1" : "0";
          label.style.pointerEvents = visible ? "auto" : "none";
        }
      });
      renderer.render(scene, camera);
    };

    const resize = () => {
      const width = Math.max(host.clientWidth, 320);
      const height = Math.max(host.clientHeight, 330);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      renderer.domElement.removeEventListener("wheel", wheel);
      renderer.domElement.removeEventListener("keydown", keydown);
      cameraControlRef.current = null;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((entry) => entry.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className={styles.webglHost}>
    {fallback && <div className={styles.webglFallback}><b>อุปกรณ์นี้ไม่รองรับ WebGL 3D</b><span>กรุณาเปิดด้วย Chrome, Edge หรือ Safari รุ่นล่าสุด</span></div>}
    <div className={styles.webglLabels} aria-label="สถานีทำงานในโรงงานสามมิติ">
      {stations.map((station) => <button
        key={station.number}
        ref={(node) => { if (node) labelRefs.current.set(station.number, node); else labelRefs.current.delete(station.number); }}
        type="button"
        className={`${styles.webglLabel} ${styles[station.tone]} ${station.active ? styles.stationActive : styles.stationIdle}`}
        disabled={!canOpen(station.page)}
        onClick={() => onOpen(station.page)}
      ><b>{station.number}</b><span><strong>{station.label}</strong><small>{station.value || station.sub}</small><i>{station.active ? "● ทำงาน" : "○ หยุดรอ"}</i></span></button>)}
    </div>
  </div>;
});

DashboardThreeScene.displayName = "DashboardThreeScene";
export default DashboardThreeScene;
