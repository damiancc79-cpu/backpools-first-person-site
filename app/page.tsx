"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

type FruitKind = "clementine" | "mango" | "lime" | "plum" | "pear";

type FruitSpec = {
  color: number;
  label: string;
  kind: FruitKind;
};

type Collectible = {
  body: THREE.Mesh;
  baseY: number;
  drift: number;
  id: number;
  label: string;
  phase: number;
  root: THREE.Group;
};

type Collider = {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
};

type SceneApi = {
  enterExperience: () => void;
  focusNext: () => void;
  makeRipple: () => void;
};

const totalFruit = 15;

const fruitSpecs: FruitSpec[] = [
  { kind: "clementine", label: "Clementine", color: 0xff7b29 },
  { kind: "mango", label: "Mango", color: 0xffc54b },
  { kind: "lime", label: "Key lime", color: 0xaceb49 },
  { kind: "plum", label: "Lunar plum", color: 0xd56bdb },
  { kind: "pear", label: "Glass pear", color: 0xb5f076 },
];

const fruitSpots: Array<[number, number]> = [
  [-64, -34],
  [-51, 22],
  [-39, -7],
  [-26, 35],
  [-13, -37],
  [-7, 8],
  [7, -29],
  [18, 38],
  [28, 2],
  [39, -38],
  [48, 25],
  [59, -10],
  [68, 37],
  [72, -33],
  [3, 39],
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function createFruit(spec: FruitSpec) {
  const root = new THREE.Group();
  const fruitMaterial = new THREE.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.color,
    emissiveIntensity: 0.16,
    metalness: 0.02,
    roughness: 0.32,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x6dc96a,
    emissive: 0x1b4e35,
    emissiveIntensity: 0.24,
    roughness: 0.54,
  });
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: 0x74462b,
    roughness: 0.84,
  });

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 26, 20),
    fruitMaterial,
  );
  body.castShadow = true;
  body.receiveShadow = true;

  if (spec.kind === "mango") {
    body.scale.set(0.84, 1.18, 0.74);
    body.rotation.z = -0.24;
  }
  if (spec.kind === "pear") {
    body.scale.set(0.78, 1.13, 0.78);
    const neck = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 16),
      fruitMaterial,
    );
    neck.position.y = 0.5;
    neck.scale.set(0.8, 1.05, 0.8);
    root.add(neck);
  }
  if (spec.kind === "plum") {
    body.scale.set(0.92, 0.92, 0.82);
  }
  if (spec.kind === "lime") {
    body.scale.set(0.88, 0.88, 0.88);
  }

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.08, 0.45, 8),
    stemMaterial,
  );
  stem.position.y = 0.84;
  stem.rotation.z = 0.17;

  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 8),
    leafMaterial,
  );
  leaf.position.set(0.28, 1.0, 0.02);
  leaf.scale.set(1.22, 0.18, 0.62);
  leaf.rotation.z = -0.42;

  root.add(body, stem, leaf);
  return { body, root };
}

function addWall(
  scene: THREE.Scene,
  x: number,
  z: number,
  length: number,
  axis: "x" | "z",
  material: THREE.Material,
  colliders?: Collider[],
) {
  const horizontal = axis === "x";
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(horizontal ? length : 0.72, 8.8, horizontal ? 0.72 : length),
    material,
  );
  wall.position.set(x, 4.18, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(horizontal ? length + 0.16 : 0.88, 0.16, horizontal ? 0.88 : length + 0.16),
    new THREE.MeshStandardMaterial({ color: 0xd7f5f7, roughness: 0.28 }),
  );
  cap.position.set(x, 8.64, z);
  cap.castShadow = true;
  scene.add(cap);

  colliders?.push({
    minX: x - (horizontal ? length / 2 + 0.56 : 0.86),
    maxX: x + (horizontal ? length / 2 + 0.56 : 0.86),
    minZ: z - (horizontal ? 0.86 : length / 2 + 0.56),
    maxZ: z + (horizontal ? 0.86 : length / 2 + 0.56),
  });
}

function addPlatform(
  scene: THREE.Scene,
  x: number,
  z: number,
  width: number,
  depth: number,
  material: THREE.Material,
) {
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.52, depth),
    material,
  );
  platform.position.set(x, -0.22, z);
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width + 0.04, 0.56, depth + 0.04)),
    new THREE.LineBasicMaterial({ color: 0x90cbd1, transparent: true, opacity: 0.56 }),
  );
  edge.position.copy(platform.position);
  scene.add(edge);
}

export default function Home() {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [collected, setCollected] = useState(0);
  const [message, setMessage] = useState("The water is listening.");
  const [webglError, setWebglError] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglError(true);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = 176;
    const depth = 118;
    const segmentsX = 88;
    const segmentsZ = 60;
    const cellCount = (segmentsX + 1) * (segmentsZ + 1);
    const height = new Float32Array(cellCount);
    const nextHeight = new Float32Array(cellCount);
    const velocity = new Float32Array(cellCount);
    const waveScale = reducedMotion ? 0.5 : 1;
    const waterGeometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
    waterGeometry.rotateX(-Math.PI / 2);
    const positionAttribute = waterGeometry.getAttribute("position") as THREE.BufferAttribute;
    const originals = new Float32Array(positionAttribute.array);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x061b2a);
    scene.fog = new THREE.FogExp2(0x061b2a, 0.014);

    const camera = new THREE.PerspectiveCamera(67, 1, 0.1, 280);
    camera.position.set(-76, 1.88, 43);
    camera.lookAt(-61, 1.88, 23);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.25 : 1.55));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.shadowMap.enabled = window.innerWidth > 720;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    mount.appendChild(renderer.domElement);

    const controls = new PointerLockControls(camera, renderer.domElement);
    controls.pointerSpeed = 0.82;
    controls.minPolarAngle = Math.PI * 0.16;
    controls.maxPolarAngle = Math.PI * 0.84;

    const hemisphere = new THREE.HemisphereLight(0xc8fbff, 0x052439, 1.65);
    scene.add(hemisphere);
    const moonlight = new THREE.DirectionalLight(0xd2fcff, 2.5);
    moonlight.position.set(-34, 28, 16);
    moonlight.castShadow = renderer.shadowMap.enabled;
    moonlight.shadow.mapSize.set(1024, 1024);
    moonlight.shadow.camera.left = -84;
    moonlight.shadow.camera.right = 84;
    moonlight.shadow.camera.top = 62;
    moonlight.shadow.camera.bottom = -62;
    scene.add(moonlight);

    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0xbce8ec,
      roughness: 0.44,
      metalness: 0.08,
    });
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6f6f4,
      roughness: 0.36,
      metalness: 0.06,
    });
    const ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a2634,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x087e9c,
      emissive: 0x022d46,
      emissiveIntensity: 0.46,
      roughness: 0.12,
      metalness: 0.38,
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.receiveShadow = true;
    scene.add(water);

    const tileGrid = new THREE.GridHelper(width, 88, 0x2c7687, 0x1d5368);
    tileGrid.position.y = -0.46;
    const gridMaterial = tileGrid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.62;
    scene.add(tileGrid);

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width + 8, 0.5, depth + 8),
      ceilingMaterial,
    );
    ceiling.position.y = 12.7;
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    const colliders: Collider[] = [];
    addWall(scene, 0, -58, width, "x", tileMaterial, colliders);
    addWall(scene, 0, 58, width, "x", tileMaterial, colliders);
    addWall(scene, -88, 0, depth, "z", tileMaterial, colliders);
    addWall(scene, 88, 0, depth, "z", tileMaterial, colliders);
    addWall(scene, -35, -17, 44, "x", tileMaterial, colliders);
    addWall(scene, -12, -33, 31, "z", tileMaterial, colliders);
    addWall(scene, 18, 18, 42, "x", tileMaterial, colliders);
    addWall(scene, 39, -11, 37, "z", tileMaterial, colliders);
    addWall(scene, 61, 25, 33, "x", tileMaterial, colliders);
    addWall(scene, 63, -29, 29, "x", tileMaterial, colliders);
    addWall(scene, -62, 17, 35, "z", tileMaterial, colliders);

    addPlatform(scene, -58, -38, 26, 14, platformMaterial);
    addPlatform(scene, -34, 27, 22, 18, platformMaterial);
    addPlatform(scene, 7, -42, 34, 11, platformMaterial);
    addPlatform(scene, 32, 32, 26, 16, platformMaterial);
    addPlatform(scene, 68, 2, 22, 14, platformMaterial);

    const pillarGeometry = new THREE.CylinderGeometry(1.9, 2.2, 12.5, 18);
    const pillarCapGeometry = new THREE.CylinderGeometry(2.7, 2.15, 0.4, 18);
    const pillarSpots: Array<[number, number]> = [
      [-76, -42], [-76, 39], [-48, -4], [-25, 45], [-6, -4], [15, -18],
      [21, 45], [48, 9], [74, -43], [77, 43],
    ];
    pillarSpots.forEach(([x, z]) => {
      const pillar = new THREE.Mesh(pillarGeometry, tileMaterial);
      pillar.position.set(x, 5.85, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);
      const cap = new THREE.Mesh(pillarCapGeometry, platformMaterial);
      cap.position.set(x, 11.92, z);
      cap.castShadow = true;
      scene.add(cap);
      colliders.push({ minX: x - 2.65, maxX: x + 2.65, minZ: z - 2.65, maxZ: z + 2.65 });
    });

    const fixtureMaterial = new THREE.MeshBasicMaterial({ color: 0xdffeff });
    const fixturePositions: Array<[number, number, number]> = [
      [-58, 11.9, -26], [-46, 11.9, 28], [-10, 11.9, -18], [8, 11.9, 27],
      [39, 11.9, -24], [62, 11.9, 26], [2, 11.9, 0],
    ];
    fixturePositions.forEach(([x, y, z], index) => {
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(index === 6 ? 14 : 10, 0.1, 1.2),
        fixtureMaterial,
      );
      fixture.position.set(x, y, z);
      scene.add(fixture);
      const glow = new THREE.PointLight(index % 2 ? 0x7be8ff : 0xbafaff, index === 6 ? 32 : 24, 42, 2);
      glow.position.set(x, y - 0.35, z);
      scene.add(glow);
    });

    const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0x1de0dc, transparent: true, opacity: 0.16 });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(6.3, 9.4, 10.8, 32, 1, true), beaconMaterial);
    beacon.position.set(3, 5.3, 1);
    scene.add(beacon);
    const beaconRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.2, 0.25, 12, 64),
      new THREE.MeshStandardMaterial({ color: 0x86f8ed, emissive: 0x1b9e9c, emissiveIntensity: 2.2, roughness: 0.3 }),
    );
    beaconRing.rotation.x = Math.PI / 2;
    beaconRing.position.set(3, 0.13, 1);
    scene.add(beaconRing);

    const collectibles: Collectible[] = [];
    const fruitMeshes: THREE.Object3D[] = [];
    fruitSpots.forEach(([x, z], index) => {
      const spec = fruitSpecs[index % fruitSpecs.length];
      const { body, root } = createFruit(spec);
      root.position.set(x, 1.05, z);
      root.rotation.y = (index * 1.76) % (Math.PI * 2);
      root.userData.collectibleId = index;
      root.traverse((node) => {
        node.userData.collectibleId = index;
        fruitMeshes.push(node);
      });
      scene.add(root);
      collectibles.push({
        id: index,
        label: spec.label,
        root,
        body,
        phase: index * 0.71,
        drift: index % 2 ? 1 : -1,
        baseY: 0.9,
      });
    });

    const raycaster = new THREE.Raycaster();
    raycaster.far = 5.6;
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    const keys = new Set<string>();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3();
    const plane = new THREE.Plane(up, 0);
    const planeHit = new THREE.Vector3();
    const eyeHeight = 1.78;
    let frameId = 0;
    let accumulator = 0;
    let nextHint = 0;
    let picked = 0;
    let lightning = 0;

    const toIndex = (x: number, z: number) => z * (segmentsX + 1) + x;

    const isBlocked = (x: number, z: number) => {
      const playerRadius = 0.76;
      return colliders.some((collider) => (
        x > collider.minX - playerRadius
        && x < collider.maxX + playerRadius
        && z > collider.minZ - playerRadius
        && z < collider.maxZ + playerRadius
      ));
    };

    const waterHeightAt = (worldX: number, worldZ: number) => {
      const fx = clamp(((worldX + width / 2) / width) * segmentsX, 0, segmentsX);
      const fz = clamp(((worldZ + depth / 2) / depth) * segmentsZ, 0, segmentsZ);
      const x0 = Math.floor(fx);
      const z0 = Math.floor(fz);
      const x1 = Math.min(segmentsX, x0 + 1);
      const z1 = Math.min(segmentsZ, z0 + 1);
      const tx = fx - x0;
      const tz = fz - z0;
      const a = height[toIndex(x0, z0)] * (1 - tx) + height[toIndex(x1, z0)] * tx;
      const b = height[toIndex(x0, z1)] * (1 - tx) + height[toIndex(x1, z1)] * tx;
      return a * (1 - tz) + b * tz;
    };

    const addImpulse = (worldX: number, worldZ: number, strength = 0.74) => {
      const gx = clamp(Math.round(((worldX + width / 2) / width) * segmentsX), 1, segmentsX - 1);
      const gz = clamp(Math.round(((worldZ + depth / 2) / depth) * segmentsZ), 1, segmentsZ - 1);
      const radius = Math.max(3, Math.round(4 + strength * 2.8));
      for (let z = Math.max(1, gz - radius); z <= Math.min(segmentsZ - 1, gz + radius); z += 1) {
        for (let x = Math.max(1, gx - radius); x <= Math.min(segmentsX - 1, gx + radius); x += 1) {
          const distance = Math.hypot(x - gx, z - gz) / radius;
          if (distance < 1) {
            velocity[toIndex(x, z)] += Math.cos(distance * Math.PI * 0.5) * strength * 0.08 * waveScale;
          }
        }
      }
    };

    const stepWater = () => {
      const stiffness = 0.18 * waveScale;
      for (let z = 1; z < segmentsZ; z += 1) {
        for (let x = 1; x < segmentsX; x += 1) {
          const index = toIndex(x, z);
          const laplacian = height[toIndex(x - 1, z)] + height[toIndex(x + 1, z)] + height[toIndex(x, z - 1)] + height[toIndex(x, z + 1)] - height[index] * 4;
          velocity[index] = (velocity[index] + laplacian * stiffness) * 0.987;
          nextHeight[index] = height[index] + velocity[index];
        }
      }
      for (let z = 0; z <= segmentsZ; z += 1) {
        nextHeight[toIndex(0, z)] = 0;
        nextHeight[toIndex(segmentsX, z)] = 0;
      }
      for (let x = 0; x <= segmentsX; x += 1) {
        nextHeight[toIndex(x, 0)] = 0;
        nextHeight[toIndex(x, segmentsZ)] = 0;
      }
      height.set(nextHeight);
      for (let index = 0; index < cellCount; index += 1) {
        positionAttribute.array[index * 3 + 1] = height[index];
      }
      positionAttribute.needsUpdate = true;
      waterGeometry.computeVertexNormals();
    };

    const collectFruit = (id: number) => {
      const fruit = collectibles.find((item) => item.id === id);
      if (!fruit || !fruit.root.visible) return;
      fruit.root.visible = false;
      addImpulse(fruit.root.position.x, fruit.root.position.z, 1.35);
      picked += 1;
      setCollected(picked);
      setMessage(
        picked === totalFruit
          ? "The whole backpool is glowing."
          : `${fruit.label} recovered — a new ripple spreads.`,
      );
    };

    const interactAtSight = () => {
      pointer.set(0, 0);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(fruitMeshes, false);
      const fruitId = hits[0]?.object.userData.collectibleId as number | undefined;
      if (typeof fruitId === "number") {
        collectFruit(fruitId);
        return;
      }
      if (raycaster.ray.intersectPlane(plane, planeHit)) {
        addImpulse(planeHit.x, planeHit.z, 0.9);
        setMessage("A fingertip ripple travels through the atrium.");
      }
    };

    const onSceneClick = () => {
      if (!controls.isLocked) {
        controls.lock();
        return;
      }
      interactAtSight();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        controls.isLocked
        && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)
      ) {
        keys.add(key);
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());

    const onLock = () => {
      setIsLocked(true);
      setMessage("You wade into the backpools. Aim at fruit and click to recover it.");
    };

    const onUnlock = () => {
      keys.clear();
      setIsLocked(false);
      setMessage("Paused at the waterline. Click the pool to wade back in.");
    };

    const onBlur = () => keys.clear();

    const onResize = () => {
      const rect = mount.getBoundingClientRect();
      camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, rect.width < 700 ? 1.25 : 1.55));
      renderer.setSize(rect.width, rect.height, false);
    };

    const focusNext = () => {
      const next = collectibles.find((item) => item.root.visible);
      if (!next) {
        setMessage("Every fruit has been found. Let the water settle.");
        return;
      }
      camera.lookAt(next.root.position.x, camera.position.y, next.root.position.z);
      addImpulse(next.root.position.x, next.root.position.z, 0.5);
      setMessage(`Your gaze turns toward a ${next.label.toLowerCase()} signal.`);
    };

    const makeRipple = () => {
      controls.getDirection(forward);
      const rippleAt = camera.position.clone().addScaledVector(forward, 5.4);
      addImpulse(rippleAt.x, rippleAt.z, 1.18);
      setMessage("A clean wave runs ahead of you.");
    };

    const enterExperience = () => controls.lock();

    apiRef.current = { enterExperience, focusNext, makeRipple };
    renderer.domElement.addEventListener("click", onSceneClick);
    controls.addEventListener("lock", onLock);
    controls.addEventListener("unlock", onUnlock);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    onResize();
    addImpulse(-7, -2, 0.95);

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      if (document.hidden) return;

      const delta = Math.min(clock.getDelta(), 0.035);
      const elapsed = clock.elapsedTime;
      accumulator += delta;
      while (accumulator > 1 / 36) {
        stepWater();
        accumulator -= 1 / 36;
      }

      const driftSpeed = 11.5 * delta;
      const isMoving = controls.isLocked && (
        keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d")
        || keys.has("arrowup") || keys.has("arrowdown") || keys.has("arrowleft") || keys.has("arrowright")
      );
      if (isMoving) {
        const previousX = camera.position.x;
        const previousZ = camera.position.z;
        if (keys.has("w") || keys.has("arrowup")) controls.moveForward(driftSpeed);
        if (keys.has("s") || keys.has("arrowdown")) controls.moveForward(-driftSpeed);
        if (keys.has("a") || keys.has("arrowleft")) controls.moveRight(-driftSpeed);
        if (keys.has("d") || keys.has("arrowright")) controls.moveRight(driftSpeed);
        const nextX = clamp(camera.position.x, -84, 84);
        const nextZ = clamp(camera.position.z, -54, 54);
        camera.position.x = isBlocked(nextX, previousZ) ? previousX : nextX;
        camera.position.z = isBlocked(camera.position.x, nextZ) ? previousZ : nextZ;
        if (elapsed > nextHint) {
          addImpulse(camera.position.x, camera.position.z, 0.34);
          nextHint = elapsed + 0.42;
        }
      }
      camera.position.y = eyeHeight + waterHeightAt(camera.position.x, camera.position.z);

      collectibles.forEach((fruit) => {
        if (!fruit.root.visible) return;
        const bob = Math.sin(elapsed * 1.52 + fruit.phase) * 0.16;
        const localWater = waterHeightAt(fruit.root.position.x, fruit.root.position.z);
        fruit.root.position.y = fruit.baseY + localWater + bob;
        fruit.root.rotation.y += delta * 0.42 * fruit.drift;
        fruit.body.rotation.z = Math.sin(elapsed * 0.86 + fruit.phase) * 0.08;
        if (!reducedMotion && Math.sin(elapsed * 0.56 + fruit.phase) > 0.998 && Math.random() < 0.08) {
          addImpulse(fruit.root.position.x, fruit.root.position.z, 0.12);
        }
      });

      beaconMaterial.opacity = 0.105 + (Math.sin(elapsed * 1.2) + 1) * 0.028;
      beaconRing.rotation.z = elapsed * 0.12;
      lightning += delta;
      if (lightning > (reducedMotion ? 16 : 8 + Math.random() * 10)) {
        renderer.toneMappingExposure = 1.65;
        lightning = -0.08;
      } else if (lightning > 0) {
        renderer.toneMappingExposure += (1.16 - renderer.toneMappingExposure) * 0.16;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("click", onSceneClick);
      controls.removeEventListener("lock", onLock);
      controls.removeEventListener("unlock", onUnlock);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, []);

  return (
    <main className={`backpools-shell${isLocked ? " is-immersed" : ""}`}>
      <div ref={mountRef} className="pool-canvas" aria-label="Interactive 3D Backpools water map" />
      <div className="film-grain" aria-hidden="true" />
      <div className="ambient-vignette" aria-hidden="true" />
      <div className="reticle" aria-hidden="true"><span>+</span></div>

      <header className="topbar">
        <div className="wordmark" aria-label="Backpools">
          <span className="wordmark-kicker">LIMINAL WATER SIMULATOR</span>
          <span className="wordmark-main">BACKPOOLS</span>
        </div>
        <div className="status-cluster">
          <div className="live-status"><span className="live-dot" />WATERFORM / LIVE</div>
          <div className="fruit-counter"><span>{String(collected).padStart(2, "0")}</span> / {totalFruit} FRUIT</div>
        </div>
      </header>

      <section className="map-legend" aria-label="Map locations">
        <p className="eyebrow">POOL ATLAS / 04</p>
        <h1>Wade toward the<br />fruit-light.</h1>
        <div className="atlas-list">
          <span><i className="atlas-dot aqua" />01 — Entrance Channel</span>
          <span><i className="atlas-dot blue" />02 — Lantern Atrium</span>
          <span><i className="atlas-dot citrus" />03 — Citrus Gallery</span>
        </div>
      </section>

      <section className="horizon-card" aria-live="polite">
        <div className="horizon-rule" />
        <p>{message}</p>
        <span>AIM WITH THE RETICLE · CLICK TO SPLASH OR COLLECT</span>
      </section>

      <aside className="interaction-dock" aria-label="Exploration controls">
        <button type="button" onClick={() => apiRef.current?.focusNext()}>
          <span className="button-glyph">✦</span>
          <span>Ping fruit</span>
        </button>
        <button type="button" onClick={() => apiRef.current?.makeRipple()}>
          <span className="button-glyph">≈</span>
          <span>Disturb water</span>
        </button>
      </aside>

      <footer className="footer-ui">
        <div className="control-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>drift through rooms</span></div>
        <div className="control-hint desktop-hint"><span>mouse</span><b>to look</b><i>·</i><kbd>ESC</kbd><b>to pause</b></div>
      </footer>

      {!isLocked && !webglError ? (
        <button
          className="enter-pool"
          type="button"
          onClick={() => apiRef.current?.enterExperience()}
        >
          <span>ENTER THE WATER</span>
          <small>First-person view · mouse look · WASD move</small>
        </button>
      ) : null}

      {webglError ? (
        <div className="webgl-fallback" role="status">
          <span>Backpools needs WebGL to pour the water.</span>
          <small>Try opening it in a browser with hardware graphics enabled.</small>
        </div>
      ) : null}
    </main>
  );
}
