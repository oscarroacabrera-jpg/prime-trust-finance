// Escena 3D de la oficina (Three.js). Todo se construye con primitivas: sin modelos externos.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const DESK_DX = 3.7;
const DESK_DZ = 4.0;
const ZONE_GAP = 3.0;

const STATUS_COLORS = {
  idle: 0x9ca3af,
  queued: 0xfbbf24,
  thinking: 0xfbbf24,
  working: 0x60a5fa,
  coordinating: 0xc084fc,
  done: 0x34d399,
  error: 0xf87171,
};

export function createOffice(container, { teams, agents, onSelect }) {
  // ------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e6f5);
  scene.fog = new THREE.Fog(0xe9e6f5, 55, 110);

  const camera = new THREE.PerspectiveCamera(34, container.clientWidth / container.clientHeight, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.25;
  controls.minDistance = 7;
  controls.maxDistance = 70;
  controls.screenSpacePanning = false;

  // ------------------------------------------------------------- luces
  scene.add(new THREE.HemisphereLight(0xf3efff, 0x8b7e74, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e6, 2.1);
  sun.position.set(18, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc7d2fe, 0.6);
  fill.position.set(-20, 12, -10);
  scene.add(fill);

  // ----------------------------------------------------------- materiales
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  const M = {
    deskTop: mat(0xe7ad6a, { roughness: 0.55 }),
    deskEdge: mat(0xc9864a),
    metal: mat(0x2a2a33, { metalness: 0.4, roughness: 0.5 }),
    monitor: mat(0x18181f, { roughness: 0.35 }),
    keyboard: mat(0xf4f4f5),
    chair: mat(0x2d2d38),
    hoodie: mat(0x3f3f4a),
    pants: mat(0x26262e),
    skin: mat(0xf5f1ec, { roughness: 0.6 }),
    glasses: mat(0x111114, { roughness: 0.2, metalness: 0.3 }),
    pot: mat(0xf8f8f8),
    leaf: mat(0x4caf50, { flatShading: true }),
    leaf2: mat(0x7cc95b, { flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    rail: mat(0xd7a066),
    wall: mat(0xf1effa),
  };

  // ------------------------------------------------------------ texturas
  function plankTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const colors = ['#c9773a', '#d4843f', '#b8692f', '#dc9149', '#c27035', '#e09a52'];
    const h = 32;
    for (let y = 0; y < 512; y += h) {
      let x = -Math.random() * 200;
      while (x < 512) {
        const w = 120 + Math.random() * 160;
        g.fillStyle = colors[(Math.random() * colors.length) | 0];
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(80,35,10,0.35)';
        g.fillRect(x, y, 2, h);
        x += w;
      }
      g.fillStyle = 'rgba(80,35,10,0.4)';
      g.fillRect(0, y + h - 2, 512, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  function cityTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#0b1026');
    grd.addColorStop(1, '#232a52');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 256);
    for (let x = 0; x < 1024; ) {
      const w = 30 + Math.random() * 70;
      const h = 60 + Math.random() * 170;
      g.fillStyle = `hsl(232, 30%, ${10 + Math.random() * 8}%)`;
      g.fillRect(x, 256 - h, w, h);
      for (let wy = 256 - h + 6; wy < 250; wy += 9) {
        for (let wx = x + 4; wx < x + w - 4; wx += 7) {
          if (Math.random() < 0.35) {
            g.fillStyle = Math.random() < 0.8 ? '#ffe9a8' : '#9ecbff';
            g.globalAlpha = 0.5 + Math.random() * 0.5;
            g.fillRect(wx, wy, 3, 4);
            g.globalAlpha = 1;
          }
        }
      }
      x += w + 2;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function screenTexture(color) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0d1424';
    g.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 256; y += 10) {
      let x = 6 + ((Math.random() * 4) | 0) * 8;
      const n = 2 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n && x < 120; i++) {
        const w = 8 + Math.random() * 30;
        g.fillStyle = i === 0 ? color : ['#7dd3fc', '#c4b5fd', '#f9a8d4', '#86efac', '#e5e7eb'][(Math.random() * 5) | 0];
        g.globalAlpha = 0.85;
        g.fillRect(x, y, w, 4);
        x += w + 5;
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 0.5);
    return t;
  }

  // ------------------------------------------------------------ layout
  const byTeam = new Map(teams.map((t) => [t.id, []]));
  for (const a of agents) byTeam.get(a.team)?.push(a);

  const zones = teams.map((t) => {
    const members = byTeam.get(t.id) || [];
    const cols = Math.max(1, Math.min(3, members.length));
    const rows = Math.max(1, Math.ceil(members.length / cols));
    return { team: t, members, cols, rows, w: cols * DESK_DX + 2.2, d: rows * DESK_DZ + 1.6 };
  });
  // posiciones de las zonas en una cuadrícula según team.zone = [col, fila]
  const colW = {};
  const rowD = {};
  for (const z of zones) {
    const [c, r] = z.team.zone;
    colW[c] = Math.max(colW[c] || 0, z.w);
    rowD[r] = Math.max(rowD[r] || 0, z.d);
  }
  const colX = {};
  const rowZ = {};
  let acc = 0;
  for (const c of Object.keys(colW).map(Number).sort((a, b) => a - b)) {
    colX[c] = acc + colW[c] / 2;
    acc += colW[c] + ZONE_GAP;
  }
  const totalW = acc - ZONE_GAP;
  acc = 0;
  for (const r of Object.keys(rowD).map(Number).sort((a, b) => a - b)) {
    rowZ[r] = acc + rowD[r] / 2;
    acc += rowD[r] + ZONE_GAP;
  }
  const totalD = acc - ZONE_GAP;
  for (const z of zones) {
    z.cx = colX[z.team.zone[0]] - totalW / 2;
    z.cz = rowZ[z.team.zone[1]] - totalD / 2;
  }

  // ------------------------------------------------------------ piso y paredes
  const floorW = totalW + 14;
  const floorD = totalD + 14;
  const planks = plankTexture();
  planks.repeat.set(floorW / 8, floorD / 8);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(floorW, 0.4, floorD), [M.deskEdge, M.deskEdge, mat(0xffffff, { map: planks, roughness: 0.7 }), M.deskEdge, M.deskEdge, M.deskEdge]);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallH = 5.5;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(floorW, wallH, 0.3), M.wall);
  backWall.position.set(0, wallH / 2, -floorD / 2 - 0.15);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, floorD), M.wall);
  sideWall.position.set(-floorW / 2 - 0.15, wallH / 2, 0);
  sideWall.receiveShadow = true;
  scene.add(sideWall);
  const city = cityTexture();
  const win = new THREE.Mesh(new THREE.PlaneGeometry(floorW - 4, 3.2), new THREE.MeshBasicMaterial({ map: city }));
  win.position.set(0, 2.9, -floorD / 2 + 0.02);
  scene.add(win);
  const city2 = city.clone();
  city2.needsUpdate = true;
  city2.offset.x = 0.4;
  const win2 = new THREE.Mesh(new THREE.PlaneGeometry(floorD - 4, 3.2), new THREE.MeshBasicMaterial({ map: city2 }));
  win2.rotation.y = Math.PI / 2;
  win2.position.set(-floorW / 2 + 0.02, 2.9, 0);
  scene.add(win2);
  // marcos de las ventanas
  for (let i = 0; i <= 8; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.3, 0.1), M.metal);
    m.position.set(-(floorW - 4) / 2 + (i * (floorW - 4)) / 8, 2.9, -floorD / 2 + 0.06);
    scene.add(m);
  }

  // ------------------------------------------------------------ objetos
  function plant(scale = 1) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 12), M.pot);
    pot.position.y = 0.13;
    pot.castShadow = true;
    g.add(pot);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 4), i % 2 ? M.leaf : M.leaf2);
      const ang = (i / 7) * Math.PI * 2;
      leaf.position.set(Math.cos(ang) * 0.08, 0.5, Math.sin(ang) * 0.08);
      leaf.rotation.set(Math.sin(ang) * 0.6, 0, -Math.cos(ang) * 0.6);
      leaf.castShadow = true;
      g.add(leaf);
    }
    g.scale.setScalar(scale);
    return g;
  }
  function bigPlant() {
    const g = plant(2.6);
    return g;
  }

  function desk(screenColor) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 1.2), M.deskTop);
    top.position.y = 0.86;
    top.castShadow = top.receiveShadow = true;
    g.add(top);
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 0.06), M.deskEdge);
    front.position.set(0, 0.55, 0.57);
    front.castShadow = true;
    g.add(front);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 1.15), M.deskEdge);
      side.position.set(sx * 1.1, 0.4, 0);
      side.castShadow = true;
      g.add(side);
    }
    // monitor: la pantalla mira hacia el agente (-z), la parte trasera hacia la cámara
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8), M.metal);
    stand.position.set(0, 1.08, 0.25);
    g.add(stand);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.22), M.metal);
    base.position.set(0, 0.935, 0.25);
    g.add(base);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 0.06), M.monitor);
    mon.position.set(0, 1.42, 0.27);
    mon.castShadow = true;
    g.add(mon);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    logo.position.set(0, 1.44, 0.302);
    g.add(logo);
    const tex = screenTexture(screenColor);
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x666666 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.54), screenMat);
    screen.position.set(0, 1.42, 0.238);
    screen.rotation.y = Math.PI;
    g.add(screen);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), M.keyboard);
    kb.position.set(0, 0.935, -0.12);
    g.add(kb);
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.12), M.keyboard);
    mouse.position.set(0.48, 0.935, -0.1);
    g.add(mouse);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 10), mat(0x1f3b2c));
    mug.position.set(-0.75, 0.985, 0.05);
    g.add(mug);
    const p = plant(0.75);
    p.position.set(0.85, 0.92, 0.25);
    g.add(p);
    return { group: g, screen, screenMat, tex };
  }

  function chair() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.6), M.chair);
    seat.position.y = 0.55;
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.08), M.chair);
    back.position.set(0, 0.95, -0.3);
    back.castShadow = true;
    g.add(back);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), M.metal);
    pole.position.y = 0.28;
    g.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5), M.metal);
    foot.position.y = 0.04;
    g.add(foot);
    return g;
  }

  // Personaje low-poly sentado, mirando hacia +z (hacia el monitor y la cámara).
  function character(color) {
    const g = new THREE.Group();
    const capMat = mat(new THREE.Color(color), { roughness: 0.5 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.38, 4, 12), M.hoodie);
    torso.position.y = 1.08;
    torso.castShadow = true;
    g.add(torso);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.55), M.pants);
    legs.position.set(0, 0.66, 0.2);
    legs.castShadow = true;
    g.add(legs);
    const shins = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.15), M.pants);
    shins.position.set(0, 0.36, 0.45);
    g.add(shins);

    const headPivot = new THREE.Group();
    headPivot.position.y = 1.5;
    g.add(headPivot);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), M.skin);
    head.position.y = 0.22;
    head.castShadow = true;
    headPivot.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.285, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.25;
    headPivot.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), capMat);
    brim.position.set(0, 0.27, 0.2);
    headPivot.add(brim);
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.06), M.glasses);
    glasses.position.set(0, 0.2, 0.25);
    headPivot.add(glasses);

    const arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.36, 1.32, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.42, 4, 8), M.hoodie);
      arm.position.y = -0.26;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), M.skin);
      hand.position.y = -0.52;
      pivot.add(hand);
      pivot.rotation.x = -1.15; // brazos hacia el teclado (+z)
      pivot.rotation.z = sx * 0.12;
      g.add(pivot);
      arms.push(pivot);
    }
    return { group: g, headPivot, arms, torso };
  }

  function statusRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 40),
      new THREE.MeshBasicMaterial({ color: STATUS_COLORS.idle, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    return ring;
  }

  // ------------------------------------------------------------ construir zonas
  const actors = new Map();
  const pickables = [];

  for (const z of zones) {
    const rug = new THREE.Mesh(new THREE.BoxGeometry(z.w, 0.06, z.d), mat(new THREE.Color(z.team.floor).lerp(new THREE.Color(0xffffff), 0.12), { roughness: 0.9 }));
    rug.position.set(z.cx, 0.03, z.cz);
    rug.receiveShadow = true;
    scene.add(rug);
    // borde
    const border = new THREE.Mesh(new THREE.BoxGeometry(z.w + 0.3, 0.04, z.d + 0.3), mat(0xf5f3ff));
    border.position.set(z.cx, 0.02, z.cz);
    scene.add(border);

    // cartel del equipo
    const sign = document.createElement('div');
    sign.className = 'team-sign';
    sign.innerHTML = `<b>${z.team.name}</b><span>${z.team.tag} · ${z.members.length} AGENTE${z.members.length === 1 ? '' : 'S'}</span>`;
    const signObj = new CSS2DObject(sign);
    signObj.position.set(z.cx - z.w / 2 + 1.6, 3.9, z.cz - z.d / 2);
    scene.add(signObj);

    // plantas grandes en esquinas
    const bp = bigPlant();
    bp.position.set(z.cx + z.w / 2 - 0.5, 0, z.cz - z.d / 2 + 0.5);
    scene.add(bp);

    z.members.forEach((agent, i) => {
      const col = i % z.cols;
      const row = Math.floor(i / z.cols);
      const x = z.cx + (col - (z.cols - 1) / 2) * DESK_DX;
      const zz = z.cz + (row - (z.rows - 1) / 2) * DESK_DZ + 0.3;

      const d = desk(agent.color);
      d.group.position.set(x, 0, zz);
      scene.add(d.group);

      const ch = chair();
      ch.position.set(x, 0, zz - 1.05);
      scene.add(ch);

      const c = character(agent.color);
      c.group.position.set(x, 0, zz - 1.0);
      scene.add(c.group);

      const ring = statusRing();
      ring.position.set(x, 0.07, zz - 1.0);
      scene.add(ring);

      // vidrios: detrás del agente y entre escritorios
      const back = new THREE.Mesh(new THREE.BoxGeometry(DESK_DX - 0.2, 1.3, 0.05), M.glass);
      back.position.set(x, 0.65, zz - 1.75);
      scene.add(back);
      const backRail = new THREE.Mesh(new THREE.BoxGeometry(DESK_DX - 0.2, 0.06, 0.09), M.rail);
      backRail.position.set(x, 1.32, zz - 1.75);
      backRail.castShadow = true;
      scene.add(backRail);
      if (col < z.cols - 1 && i + 1 < z.members.length) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 2.4), M.glass);
        side.position.set(x + DESK_DX / 2, 0.65, zz - 0.55);
        scene.add(side);
        const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 2.4), M.rail);
        sideRail.position.set(x + DESK_DX / 2, 1.32, zz - 0.55);
        scene.add(sideRail);
      }

      // etiqueta flotante
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = `<span class="badge">ENTREGÓ</span><div class="row"><span class="dot"></span><span class="nm"></span><span class="q"></span><span class="tk"></span></div><div class="rl"></div><div class="bar"><i></i></div>`;
      el.querySelector('.nm').textContent = agent.name;
      el.querySelector('.rl').textContent = agent.role;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect?.(agent.id);
      });
      const label = new CSS2DObject(el);
      label.position.set(0, 2.55, 0);
      c.group.add(label);

      c.group.traverse((o) => (o.userData.agentId = agent.id));
      d.group.traverse((o) => (o.userData.agentId = agent.id));
      pickables.push(c.group, d.group);

      actors.set(agent.id, {
        agent: { ...agent },
        ...c,
        desk: d,
        ring,
        el,
        home: new THREE.Vector3(x, 0, zz - 1.0),
        celebrateUntil: 0,
        phase: Math.random() * 10,
      });
    });
  }

  // decoración: plantas grandes en el perímetro
  for (const [px, pz] of [
    [-floorW / 2 + 1, -floorD / 2 + 1],
    [floorW / 2 - 1, -floorD / 2 + 1],
    [-floorW / 2 + 1, floorD / 2 - 1],
  ]) {
    const bp = bigPlant();
    bp.position.set(px, 0, pz);
    scene.add(bp);
  }
  // sofá y mesa de café en el pasillo
  const lounge = new THREE.Group();
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), mat(0x6366f1));
  sofa.position.y = 0.3;
  sofa.castShadow = true;
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 0.25), mat(0x4f46e5));
  sofaBack.position.set(0, 0.75, -0.4);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20), M.deskTop);
  table.position.set(0, 0.45, 1.2);
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 8), M.metal);
  tleg.position.set(0, 0.22, 1.2);
  lounge.add(sofa, sofaBack, table, tleg);
  lounge.position.set(totalW / 2 + 3.5, 0, 0);
  lounge.rotation.y = -Math.PI / 2;
  scene.add(lounge);

  // ------------------------------------------------------------ cámara
  const center = new THREE.Vector3(0, 0, 0);
  const baseOffset = new THREE.Vector3(totalW * 0.55 + 10, totalW * 0.6 + 12, totalD * 0.9 + 16);
  const defaultOffset = baseOffset.clone();
  const portrait = () => container.clientWidth / container.clientHeight < 0.9;
  function fitOffset() {
    // En pantallas verticales (teléfono) la cámara se aleja para que quepa toda la oficina.
    const aspect = container.clientWidth / container.clientHeight;
    defaultOffset.copy(baseOffset).multiplyScalar(aspect < 1.2 ? Math.min(2.4, 1.25 / aspect) : 1);
  }
  fitOffset();
  camera.position.copy(center).add(defaultOffset);
  controls.target.copy(center);
  let camTween = null;
  function flyTo(target, offset, ms = 900) {
    camTween = {
      t0: performance.now(),
      ms,
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      toPos: target.clone().add(offset),
    };
  }

  // ------------------------------------------------------------ selección con clic
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    onSelect?.(hit ? hit.object.userData.agentId : null);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    renderer.domElement.style.cursor = raycaster.intersectObjects(pickables, true).length ? 'pointer' : '';
  });

  // ------------------------------------------------------------ envíos (sobres que vuelan)
  const flights = [];
  const envGeo = new THREE.BoxGeometry(0.34, 0.04, 0.24);
  function sendEnvelope(fromId, toId, color = 0xfacc15) {
    const a = actors.get(fromId);
    const b = actors.get(toId);
    if (!a || !b) return;
    const mesh = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ color }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
    mesh.add(glow);
    scene.add(mesh);
    const p0 = a.home.clone().setY(2.0);
    const p2 = b.home.clone().setY(2.0);
    const p1 = p0.clone().lerp(p2, 0.5).setY(4 + p0.distanceTo(p2) * 0.25);
    const trail = [];
    flights.push({ mesh, glow, p0, p1, p2, t0: performance.now(), ms: 1300 + p0.distanceTo(p2) * 40, toId, trail, color });
  }
  const pulses = [];
  function pulseAt(pos, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).setY(0.1);
    scene.add(m);
    pulses.push({ m, t0: performance.now() });
  }

  // ------------------------------------------------------------ estado de agentes
  function fmtTokens(n) {
    if (!n) return '0';
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
    return (n / 1e6).toFixed(1) + 'M';
  }
  function setAgentState(a) {
    const act = actors.get(a.id);
    if (!act) return;
    const prev = act.agent.status;
    Object.assign(act.agent, a);
    const el = act.el;
    el.querySelector('.dot').className = 'dot ' + a.status;
    el.querySelector('.tk').textContent = fmtTokens(a.tokens);
    el.querySelector('.bar i').style.width = (a.status === 'idle' ? 0 : a.progress) + '%';
    el.querySelector('.q').textContent = a.queued ? `+${a.queued}` : '';
    el.classList.toggle('active', ['thinking', 'working', 'coordinating', 'queued'].includes(a.status));
    el.classList.toggle('done', a.status === 'done');
    el.classList.toggle('error', a.status === 'error');
    act.ring.material.color.setHex(STATUS_COLORS[a.status] ?? STATUS_COLORS.idle);
    if (a.status === 'done' && prev !== 'done') {
      act.celebrateUntil = performance.now() + 2200;
      pulseAt(act.home, 0x34d399);
    }
  }
  function setSelected(id) {
    for (const [aid, act] of actors) act.el.classList.toggle('selected', aid === id);
  }
  function focus(id) {
    const act = actors.get(id);
    if (!act) {
      flyTo(center, defaultOffset);
      return;
    }
    if (portrait()) flyTo(act.home.clone().add(new THREE.Vector3(0, 0.5, 2.5)), new THREE.Vector3(4, 9, 11));
    else flyTo(act.home.clone().add(new THREE.Vector3(1.6, 1.2, 0)), new THREE.Vector3(5, 7, 12));
  }

  // ------------------------------------------------------------ bucle de animación
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  function tick() {
    const t = clock.getElapsedTime();
    const now = performance.now();

    if (camTween) {
      const k = Math.min(1, (now - camTween.t0) / camTween.ms);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
      controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
      if (k >= 1) camTween = null;
    }
    controls.update();

    for (const act of actors.values()) {
      const s = act.agent.status;
      const ph = t + act.phase;
      const [L, R] = act.arms;
      const busy = s === 'working';
      const celebrating = now < act.celebrateUntil;
      if (celebrating) {
        const b = Math.abs(Math.sin(ph * 9));
        L.rotation.x = R.rotation.x = Math.PI - 0.2; // brazos arriba
        L.rotation.z = -0.4 - b * 0.3;
        R.rotation.z = 0.4 + b * 0.3;
        act.group.position.y = b * 0.15;
        act.headPivot.rotation.set(-0.15, 0, 0);
      } else {
        act.group.position.y = 0;
        L.rotation.z = -0.12;
        R.rotation.z = 0.12;
        if (busy) {
          L.rotation.x = -1.15 + Math.sin(ph * 22) * 0.12;
          R.rotation.x = -1.15 + Math.sin(ph * 22 + 1.7) * 0.12;
          act.headPivot.rotation.set(0.12 + Math.sin(ph * 3) * 0.03, Math.sin(ph * 1.3) * 0.06, 0);
        } else if (s === 'thinking' || s === 'coordinating' || s === 'queued') {
          L.rotation.x = -1.0;
          R.rotation.x = -2.2 + Math.sin(ph * 2) * 0.08; // mano en la barbilla
          R.rotation.z = 0.55;
          act.headPivot.rotation.set(-0.25, Math.sin(ph * 0.9) * 0.5, Math.sin(ph * 0.9) * 0.1);
        } else {
          L.rotation.x = R.rotation.x = -1.05 + Math.sin(ph * 1.2) * 0.02;
          act.headPivot.rotation.set(0.05, Math.sin(ph * 0.35) * 0.25, 0);
        }
      }
      act.torso.scale.y = 1 + Math.sin(ph * 2) * 0.015;
      // pantalla: brilla y hace scroll mientras trabaja
      const on = busy || s === 'thinking' || s === 'coordinating';
      act.desk.screenMat.color.setScalar(on ? 1 : 0.45);
      if (busy) act.desk.tex.offset.y = (act.desk.tex.offset.y + 0.004) % 1;
      // anillo
      const pulse = on ? 0.55 + Math.sin(ph * 5) * 0.3 : s === 'done' ? 0.8 : 0.35;
      act.ring.material.opacity = pulse;
      act.ring.scale.setScalar(on ? 1 + Math.sin(ph * 5) * 0.06 : 1);
      // etiquetas lejanas más pequeñas
      const dist = camera.position.distanceTo(tmp.copy(act.home));
      act.el.classList.toggle('far', dist > 42);
    }

    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      const k = Math.min(1, (now - f.t0) / f.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const a = f.p0.clone().multiplyScalar((1 - e) * (1 - e));
      const b = f.p1.clone().multiplyScalar(2 * (1 - e) * e);
      const c = f.p2.clone().multiplyScalar(e * e);
      f.mesh.position.copy(a.add(b).add(c));
      f.mesh.rotation.y += 0.15;
      f.mesh.rotation.z = Math.sin(now / 120) * 0.3;
      if (Math.random() < 0.6) {
        const dotm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshBasicMaterial({ color: f.color, transparent: true, opacity: 0.8 }));
        dotm.position.copy(f.mesh.position);
        scene.add(dotm);
        f.trail.push({ m: dotm, t0: now });
      }
      if (k >= 1) {
        scene.remove(f.mesh);
        pulseAt(f.p2, f.color);
        flights.splice(i, 1);
      }
    }
    trailUpdate(now);

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const k = (now - p.t0) / 900;
      p.m.scale.setScalar(1 + k * 4);
      p.m.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        scene.remove(p.m);
        pulses.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  const allTrails = [];
  function trailUpdate(now) {
    for (const f of flights) {
      while (f.trail.length) allTrails.push(f.trail.shift());
    }
    for (let i = allTrails.length - 1; i >= 0; i--) {
      const tr = allTrails[i];
      const k = (now - tr.t0) / 600;
      tr.m.material.opacity = Math.max(0, 0.8 * (1 - k));
      tr.m.scale.setScalar(Math.max(0.01, 1 - k));
      if (k >= 1) {
        scene.remove(tr.m);
        tr.m.geometry.dispose();
        tr.m.material.dispose();
        allTrails.splice(i, 1);
      }
    }
  }
  tick();

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    fitOffset();
  }
  window.addEventListener('resize', resize);

  return {
    setAgentState,
    setSelected,
    focus,
    delegate: (from, to) => sendEnvelope(from, to, 0xfacc15),
    deliver: (from, to) => sendEnvelope(from, to, 0x34d399),
  };
}
