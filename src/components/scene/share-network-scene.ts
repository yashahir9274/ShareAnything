import * as THREE from "three";

/**
 * "Share network" background: floating note cards (text, image, video, link —
 * the things you can share) linked by arcs, with sync pulses travelling between
 * them. When a pulse arrives, the receiving card lights up, like a live edit
 * landing on someone else's screen.
 *
 * Built to stay cheap:
 * - 4 instanced meshes for every card, 1 line mesh, 1 points mesh (~6 draw calls)
 * - pixel ratio capped at 1.5, lowered automatically if frames get slow
 * - stops rendering while the tab is hidden; one static frame for reduced motion
 */

const PALETTE = {
  coral: "#ff5c35",
  teal: "#0f766e",
  ink: "#0b1420",
  line: "#d5dde6",
  paper: "#ffffff",
  muted: "#c9d2dc",
  fog: 0xbec8d2,
  fogDark: 0x0b1118,
  lineDark: "#9aa7b6",
};

type CardKind = "text" | "image" | "video" | "link";
const KINDS: CardKind[] = ["text", "image", "video", "link"];

type Card = {
  kind: number;
  slot: number;
  base: THREE.Vector3;
  pos: THREE.Vector3;
  phase: number;
  yaw: number;
  glow: number;
  links: number[];
};

type Link = { a: number; b: number; lift: number };

type Pulse = { link: number; t: number; speed: number; forward: boolean; color: THREE.Color };

/** Small seeded PRNG so the layout is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bars(ctx: CanvasRenderingContext2D, x: number, y: number, widths: number[], gap = 22) {
  ctx.fillStyle = PALETTE.muted;
  widths.forEach((w, i) => {
    roundRect(ctx, x, y + i * gap, w, 9, 4.5);
    ctx.fill();
  });
}

/** Draws one card face: a paper note whose content shows what's being shared. */
function makeCardTexture(kind: CardKind) {
  const W = 256;
  const H = 320;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const accent = kind === "image" || kind === "link" ? PALETTE.teal : PALETTE.coral;

  // paper
  roundRect(ctx, 6, 6, W - 12, H - 12, 26);
  ctx.fillStyle = PALETTE.paper;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.line;
  ctx.stroke();

  // header: accent pill + "live" dot
  ctx.fillStyle = accent;
  roundRect(ctx, 28, 30, 74, 14, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W - 38, 37, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.ink;
  roundRect(ctx, 28, 62, 150, 16, 8);
  ctx.fill();

  if (kind === "text") {
    bars(ctx, 28, 104, [196, 172, 200, 150, 186, 120, 170, 96]);
  } else if (kind === "image") {
    roundRect(ctx, 28, 100, W - 56, 130, 16);
    ctx.fillStyle = "#d9f3ef";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = PALETTE.teal;
    ctx.beginPath();
    ctx.moveTo(28, 232);
    ctx.lineTo(100, 150);
    ctx.lineTo(150, 205);
    ctx.lineTo(180, 175);
    ctx.lineTo(W - 28, 232);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.coral;
    ctx.beginPath();
    ctx.arc(180, 132, 14, 0, Math.PI * 2);
    ctx.fill();
    bars(ctx, 28, 250, [180, 130]);
  } else if (kind === "video") {
    roundRect(ctx, 28, 100, W - 56, 130, 16);
    ctx.fillStyle = PALETTE.ink;
    ctx.fill();
    ctx.fillStyle = PALETTE.coral;
    ctx.beginPath();
    ctx.arc(W / 2, 165, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.paper;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 9, 150);
    ctx.lineTo(W / 2 + 15, 165);
    ctx.lineTo(W / 2 - 9, 180);
    ctx.closePath();
    ctx.fill();
    bars(ctx, 28, 250, [190, 110]);
  } else {
    // link: chain glyph
    ctx.lineWidth = 12;
    ctx.strokeStyle = PALETTE.teal;
    ctx.lineCap = "round";
    roundRect(ctx, 52, 128, 84, 44, 22);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.coral;
    roundRect(ctx, 118, 150, 84, 44, 22);
    ctx.stroke();
    bars(ctx, 28, 226, [200, 160, 184]);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Soft round sprite for the sync pulses. */
function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ARC_SEGMENTS = 18;
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

/** Quadratic arc between two cards, bowed toward the viewer. */
function arcPoint(a: THREE.Vector3, b: THREE.Vector3, lift: number, t: number, out: THREE.Vector3) {
  tmpC.addVectors(a, b).multiplyScalar(0.5);
  const len = a.distanceTo(b);
  tmpC.y += len * 0.18 * lift;
  tmpC.z += len * 0.22;
  const u = 1 - t;
  out.set(
    u * u * a.x + 2 * u * t * tmpC.x + t * t * b.x,
    u * u * a.y + 2 * u * t * tmpC.y + t * t * b.y,
    u * u * a.z + 2 * u * t * tmpC.z + t * t * b.z,
  );
  return out;
}

/** Mounts the scene into `host`. Returns a cleanup function. Throws if WebGL is unavailable. */
export function createShareNetworkScene(host: HTMLElement, onReady?: () => void): () => void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const small = window.matchMedia("(max-width: 640px)").matches;
  const rand = mulberry32(20261126);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: window.devicePixelRatio < 2,
    powerPreference: "low-power",
  });
  let pixelRatio = Math.min(window.devicePixelRatio, small ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const isDark = () => document.documentElement.dataset.theme === "dark";
  const fog = new THREE.Fog(isDark() ? PALETTE.fogDark : PALETTE.fog, 13, 34);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
  camera.position.set(0, 0, 12);
  const world = new THREE.Group();
  scene.add(world);

  // ---- cards ---------------------------------------------------------------
  const aspect = Math.max(0.5, (host.clientWidth || window.innerWidth) / (host.clientHeight || window.innerHeight));
  const cols = small ? 3 : Math.max(4, Math.round(4 * Math.min(aspect, 2)));
  const rows = small ? 5 : 4;
  const halfFov = THREE.MathUtils.degToRad(48 / 2);
  const cards: Card[] = [];
  const slotsPerKind = [0, 0, 0, 0];
  for (let i = 0; i < cols * rows; i += 1) {
    const kind = (i + Math.floor(i / cols)) % KINDS.length;
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Distance from the camera, then place inside what the camera sees at that distance.
    const distance = 8.5 + rand() * 15;
    const halfHeight = distance * Math.tan(halfFov) * 1.08;
    const halfWidth = halfHeight * aspect;
    const u = (col + 0.5 + (rand() - 0.5) * 0.75) / cols;
    const v = (row + 0.5 + (rand() - 0.5) * 0.75) / rows;
    const base = new THREE.Vector3((u * 2 - 1) * halfWidth, (v * 2 - 1) * halfHeight, 12 - distance);
    cards.push({
      kind,
      slot: slotsPerKind[kind]++,
      base,
      pos: base.clone(),
      phase: rand() * Math.PI * 2,
      yaw: (rand() - 0.5) * 0.9,
      glow: 0,
      links: [],
    });
  }

  const cardGeometry = new THREE.PlaneGeometry(1.6, 2);
  const textures = KINDS.map(makeCardTexture);
  const cardMaterials = textures.map(
    (map) =>
      new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, fog: true }),
  );
  const cardMeshes = KINDS.map((_, kind) => {
    const mesh = new THREE.InstancedMesh(cardGeometry, cardMaterials[kind], slotsPerKind[kind]);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    world.add(mesh);
    return mesh;
  });

  // ---- links: each card joins its two nearest neighbours ---------------------
  const links: Link[] = [];
  const seen = new Set<string>();
  cards.forEach((card, i) => {
    const nearest = cards
      .map((other, j) => ({ j, d: j === i ? Infinity : card.base.distanceTo(other.base) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 2);
    for (const { j } of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const index = links.push({ a: i, b: j, lift: rand() > 0.5 ? 1 : -1 }) - 1;
      card.links.push(index);
      cards[j].links.push(index);
    }
  });

  const linePositions = new Float32Array(links.length * ARC_SEGMENTS * 2 * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  const lineMaterial = new THREE.LineBasicMaterial({
    color: isDark() ? PALETTE.lineDark : PALETTE.ink,
    transparent: true,
    opacity: 0.2,
    fog: true,
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.frustumCulled = false;
  world.add(lines);

  // ---- sync pulses -----------------------------------------------------------
  const coral = new THREE.Color(PALETTE.coral);
  const teal = new THREE.Color(PALETTE.teal);
  const PULSE_COUNT = small ? 8 : 22;
  const pulses: Pulse[] = Array.from({ length: PULSE_COUNT }, (_, i) => ({
    link: Math.floor(rand() * links.length),
    t: rand(),
    speed: 0.18 + rand() * 0.22,
    forward: rand() > 0.5,
    color: i % 3 === 0 ? teal : coral,
  }));
  // Each pulse is a short comet: a bright head and a tail fading into the background.
  const TRAIL = 6;
  const TRAIL_STEP = 0.022;
  const pulsePositions = new Float32Array(PULSE_COUNT * TRAIL * 3);
  const pulseColors = new Float32Array(PULSE_COUNT * TRAIL * 3);
  const tailColor = new THREE.Color();
  /** Tails fade into the background colour, which differs per theme. */
  function paintTails() {
    pulses.forEach((pulse, i) => {
      for (let k = 0; k < TRAIL; k += 1) {
        tailColor.copy(pulse.color).lerp(fog.color, (k / TRAIL) ** 0.8);
        tailColor.toArray(pulseColors, (i * TRAIL + k) * 3);
      }
    });
  }
  paintTails();
  const pulseGeometry = new THREE.BufferGeometry();
  pulseGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(pulsePositions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  pulseGeometry.setAttribute("color", new THREE.BufferAttribute(pulseColors, 3));
  const glowTexture = makeGlowTexture();
  const pulseMaterial = new THREE.PointsMaterial({
    size: 0.62,
    map: glowTexture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const points = new THREE.Points(pulseGeometry, pulseMaterial);
  points.frustumCulled = false;
  world.add(points);

  // ---- per-frame update ------------------------------------------------------
  const dummy = new THREE.Object3D();
  const pointer = { x: 0, y: 0 };
  const lookTarget = new THREE.Vector3(0, 0, -5);

  function update(time: number, dt: number) {
    // cards drift, sway and light up when a pulse lands
    cards.forEach((card) => {
      const p = card.phase;
      card.pos.set(
        card.base.x + Math.sin(time * 0.31 + p) * 0.35,
        card.base.y + Math.cos(time * 0.27 + p) * 0.45,
        card.base.z + Math.sin(time * 0.19 + p) * 0.4,
      );
      card.glow = Math.max(0, card.glow - dt * 1.6);
      dummy.position.copy(card.pos);
      dummy.rotation.set(
        Math.sin(time * 0.23 + p) * 0.3,
        card.yaw + Math.cos(time * 0.19 + p) * 0.4,
        Math.sin(time * 0.13 + p) * 0.1,
      );
      dummy.scale.setScalar(1 + card.glow * card.glow * 0.18);
      dummy.updateMatrix();
      cardMeshes[card.kind].setMatrixAt(card.slot, dummy.matrix);
    });
    cardMeshes.forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));

    // arcs follow the cards
    let o = 0;
    for (const link of links) {
      const a = cards[link.a].pos;
      const b = cards[link.b].pos;
      arcPoint(a, b, link.lift, 0, tmpA);
      for (let s = 1; s <= ARC_SEGMENTS; s += 1) {
        arcPoint(a, b, link.lift, s / ARC_SEGMENTS, tmpB);
        linePositions[o++] = tmpA.x;
        linePositions[o++] = tmpA.y;
        linePositions[o++] = tmpA.z;
        linePositions[o++] = tmpB.x;
        linePositions[o++] = tmpB.y;
        linePositions[o++] = tmpB.z;
        tmpA.copy(tmpB);
      }
    }
    lineGeometry.attributes.position.needsUpdate = true;

    // pulses hop from card to card along the network
    pulses.forEach((pulse, i) => {
      pulse.t += pulse.speed * dt;
      if (pulse.t >= 1) {
        const link = links[pulse.link];
        const arrived = pulse.forward ? link.b : link.a;
        cards[arrived].glow = 1;
        const options = cards[arrived].links;
        pulse.link = options[Math.floor(rand() * options.length)];
        pulse.forward = links[pulse.link].a === arrived;
        pulse.t = 0;
      }
      const link = links[pulse.link];
      for (let k = 0; k < TRAIL; k += 1) {
        const along = Math.max(0, pulse.t - k * TRAIL_STEP);
        const t = pulse.forward ? along : 1 - along;
        arcPoint(cards[link.a].pos, cards[link.b].pos, link.lift, t, tmpA);
        tmpA.toArray(pulsePositions, (i * TRAIL + k) * 3);
      }
    });
    pulseGeometry.attributes.position.needsUpdate = true;

    // gentle parallax + slow orbit
    world.rotation.y = Math.sin(time * 0.045) * 0.18;
    camera.position.x += (pointer.x * 1.4 - camera.position.x) * Math.min(1, dt * 2.5);
    camera.position.y += (pointer.y * 0.9 - camera.position.y) * Math.min(1, dt * 2.5);
    camera.lookAt(lookTarget);
  }

  // ---- sizing, input, loop -------------------------------------------------
  function resize() {
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  function onPointerMove(event: PointerEvent) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
  }

  let lastTime = performance.now();
  let elapsed = 0;
  let running = false;
  let slowFrames = 0;
  let frameCount = 0;
  let skipOdd = false;

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    frameCount += 1;

    // Adaptive quality: if frames are consistently slow, render fewer pixels, then fewer frames.
    if (dt > 1 / 40) slowFrames += 1;
    if (frameCount % 90 === 0) {
      if (slowFrames > 45) {
        if (pixelRatio > 1) {
          pixelRatio = 1;
          renderer.setPixelRatio(pixelRatio);
          resize();
        } else {
          skipOdd = true;
        }
      }
      slowFrames = 0;
    }

    elapsed += dt;
    if (skipOdd && frameCount % 2 === 1) return;
    update(elapsed, skipOdd ? dt * 2 : dt);
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastTime = performance.now();
    renderer.setAnimationLoop(frame);
  }

  function stop() {
    running = false;
    renderer.setAnimationLoop(null);
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  // First frame right away (and the only one when motion is reduced).
  update(0, 0);
  renderer.render(scene, camera);
  onReady?.();

  // Switch fog, lines and pulse tails when the theme changes (no reload needed).
  function onTheme() {
    const dark = isDark();
    fog.color.set(dark ? PALETTE.fogDark : PALETTE.fog);
    lineMaterial.color.set(dark ? PALETTE.lineDark : PALETTE.ink);
    paintTails();
    pulseGeometry.attributes.color.needsUpdate = true;
    if (!running) renderer.render(scene, camera);
  }
  window.addEventListener("shareanything:theme-change", onTheme);

  if (!reduceMotion) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
  }

  return () => {
    stop();
    window.removeEventListener("shareanything:theme-change", onTheme);
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("visibilitychange", onVisibility);
    cardGeometry.dispose();
    cardMaterials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    lineGeometry.dispose();
    lineMaterial.dispose();
    pulseGeometry.dispose();
    pulseMaterial.dispose();
    glowTexture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
