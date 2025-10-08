/* Prime8s Fighter — lightweight 2.5D GLB brawler
 * - Loads GLB characters from manifest.json
 * - 2 players, health bars, simple attacks (hitbox in front), timer
 * - WASD + F/Space for P1, Arrows + / for P2
 */

const canvas = document.getElementById("game");
const p1Select = document.getElementById("p1Select");
const p2Select = document.getElementById("p2Select");
const startBtn = document.getElementById("startBtn");
const p1HealthEl = document.getElementById("p1Health");
const p2HealthEl = document.getElementById("p2Health");
const timerEl = document.getElementById("timer");

let scene, camera, renderer, controls;
let loader;
let world = {
  started: false,
  timeLeft: 60,
  lastTick: performance.now(),
  floor: null,
};

const GRAVITY = -60;
const GROUND_Y = 0;
const ARENA_HALF = 10;
const CAM_Z = 16;

const players = [
  { id: "P1", model: null, mixer: null, state: idleState(), pos: new THREE.Vector3(-4, 0, 0), vel: new THREE.Vector3(), facing: 1, hp: 100, input: {}, cfg: { left:"a", right:"d", up:"w", down:"s", jump:" ", attack:"f" } },
  { id: "P2", model: null, mixer: null, state: idleState(), pos: new THREE.Vector3( 4, 0, 0), vel: new THREE.Vector3(), facing:-1, hp: 100, input: {}, cfg: { left:"ArrowLeft", right:"ArrowRight", up:"ArrowUp", down:"ArrowDown", jump:"ArrowUp", attack:"/" } },
];

function idleState(){ return { name:"idle", since:0, canHit:true, cooldown:0 }; }
function attackState(){ return { name:"attack", since:0, canHit:true, cooldown:0.35 }; }

async function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0e14);
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 6, CAM_Z);
  camera.lookAt(0,2,0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // subtle fog/atmosphere
  scene.fog = new THREE.Fog(0x0a0e14, 20, 60);

  // Lighting
  const hemi = new THREE.HemisphereLight(0x88aaff, 0x223344, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(5, 10, 10);
  key.castShadow = true;
  scene.add(key);

  // Ground
  const floorGeo = new THREE.PlaneGeometry(40, 6);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0e1726, metalness: .2, roughness: .8 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = GROUND_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  world.floor = floor;

  // Backwall (for parallax feel)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ color: 0x08101a }));
  wall.position.set(0, 6, -8);
  scene.add(wall);

  // Load manifest & populate dropdowns
  const manifest = await fetch("manifest.json").then(r=>r.json()).catch(()=>({characters:[]}));
  const chars = manifest.characters || [];
  const addOpts = (sel) => {
    sel.innerHTML = "";
    if (chars.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Put .glb files in assets/";
      sel.appendChild(opt);
    } else {
      chars.forEach(path => {
        const opt = document.createElement("option");
        opt.value = path;
        opt.textContent = path.split("/").pop();
        sel.appendChild(opt);
      });
    }
  };
  addOpts(p1Select);
  addOpts(p2Select);
  if (chars[0]) p1Select.value = chars[0];
  if (chars[1]) p2Select.value = chars[1]; else if (chars[0]) p2Select.value = chars[0];

  loader = new THREE.GLTFLoader();

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (e)=>onKey(e, true));
  window.addEventListener("keyup",   (e)=>onKey(e, false));

  startBtn.addEventListener("click", startMatch);

  animate();
}

function onResize(){
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKey(e, down){
  const k = e.key;
  for (const p of players){
    if (k === p.cfg.left)  p.input.left  = down;
    if (k === p.cfg.right) p.input.right = down;
    if (k === p.cfg.jump)  p.input.jump  = down;
    if (k === p.cfg.attack)p.input.attack= down;
  }
}

async function loadCharacter(p, url){
  // Clean old
  if (p.model){
    scene.remove(p.model);
    p.model.traverse(obj=>{ if (obj.isMesh) { obj.geometry?.dispose?.(); obj.material?.dispose?.(); } });
  }
  p.model = null;
  p.mixer = null;
  p.state = idleState();

  if (!url) return;

  await new Promise((resolve, reject)=>{
    loader.load(url, gltf => {
      const root = gltf.scene || gltf.scenes?.[0];
      if (!root){ resolve(); return; }
      root.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      // Normalize scale roughly
      const box = new THREE.Box3().setFromObject(root);
      const height = box.max.y - box.min.y || 1;
      const scale = 2.4 / height; // ~2.4 units tall
      root.scale.setScalar(scale);
      // Center on feet
      box.setFromObject(root);
      const yOffset = -box.min.y;
      root.position.y = yOffset;

      p.model = new THREE.Group();
      p.model.add(root);
      scene.add(p.model);

      // Animation mixer (if clips exist)
      const clips = gltf.animations || [];
      if (clips.length){
        p.mixer = new THREE.AnimationMixer(root);
        const clip = THREE.AnimationClip.findByName(clips, "Idle") || clips[0];
        const action = p.mixer.clipAction(clip);
        action.play();
      }
      resolve();
    }, undefined, err => {
      console.error("Failed to load", url, err);
      resolve(); // don't block match
    });
  });
}

async function startMatch(){
  // Reset world
  world.started = false;
  world.timeLeft = 60;
  timerEl.textContent = world.timeLeft.toFixed(0);
  for (const p of players){
    p.pos.set(p.id==="P1"? -4:4, 0, 0);
    p.vel.set(0,0,0);
    p.facing = (p.id==="P1")? 1 : -1;
    p.hp = 100;
    p.state = idleState();
    updateHPBars();
  }

  await Promise.all([
    loadCharacter(players[0], p1Select.value),
    loadCharacter(players[1], p2Select.value),
  ]);

  // Position models
  players[0].model && (players[0].model.position.set(players[0].pos.x, players[0].pos.y, 0));
  players[1].model && (players[1].model.position.set(players[1].pos.x, players[1].pos.y, 0));

  world.started = true;
}

function updateHPBars(){
  p1HealthEl.style.width = Math.max(0, players[0].hp) + "%";
  p2HealthEl.style.width = Math.max(0, players[1].hp) + "%";
  if (players[0].hp <= 0 || players[1].hp <= 0) {
    world.started = false;
  }
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function simulate(dt){
  if (!world.started) return;

  // Timer
  world.timeLeft -= dt;
  if (world.timeLeft <= 0){
    world.timeLeft = 0;
    world.started = false;
  }
  timerEl.textContent = Math.ceil(world.timeLeft);

  // Simple 2.5D physics & control
  for (const p of players){
    const speed = 7;
    const jumpV = 16;
    const onGround = (p.pos.y <= GROUND_Y + 0.001);

    // horizontal
    let dir = 0;
    if (p.input.left)  dir -= 1;
    if (p.input.right) dir += 1;
    p.vel.x = dir * speed;
    if (dir !== 0) p.facing = dir;

    // jump
    if (p.input.jump && onGround){
      p.vel.y = jumpV;
    }

    // gravity
    p.vel.y += GRAVITY * dt;

    // integrate
    p.pos.addScaledVector(p.vel, dt);

    // floor collision
    if (p.pos.y < GROUND_Y) {
      p.pos.y = GROUND_Y;
      p.vel.y = 0;
    }

    // arena bounds (x only)
    p.pos.x = clamp(p.pos.x, -ARENA_HALF, ARENA_HALF);

    // write to model
    if (p.model){
      p.model.position.set(p.pos.x, p.pos.y, 0);
      p.model.scale.x = Math.abs(p.model.scale.x) * (p.facing>=0?1:-1); // flip by x-scale
    }

    // cooldown decay
    if (p.state.cooldown > 0) p.state.cooldown = Math.max(0, p.state.cooldown - dt);

    // attack
    if (p.input.attack && p.state.cooldown === 0){
      p.state = attackState();
      p.state.since = 0;
    }

    // advance mixers
    if (p.mixer) p.mixer.update(dt);
  }

  // Resolve attacks (simple hitbox in front of attacker)
  const [A,B] = players;
  resolveHits(A,B);
  resolveHits(B,A);
}

function resolveHits(attacker, defender){
  if (!attacker.model || !defender.model) return;
  if (attacker.state.name !== "attack") return;

  attacker.state.since += 0.016; // approx; we only need a small window
  // active frames between 0.05 and 0.20s
  const active = attacker.state.since > 0.05 && attacker.state.since < 0.20;
  if (!active || !attacker.state.canHit) return;

  const range = 1.6;
  const dir = attacker.facing >= 0 ? 1 : -1;
  const hitCenterX = attacker.pos.x + dir * 1.0;
  const dx = Math.abs(defender.pos.x - hitCenterX);
  const dy = Math.abs(defender.pos.y - attacker.pos.y);
  if (dx < range && dy < 1.5){
    // Hit!
    defender.hp -= 10;
    defender.vel.x += dir * 6;
    defender.vel.y = Math.max(defender.vel.y, 6);
    updateHPBars();
    attacker.state.canHit = false;
  }

  // end attack after 0.3s
  if (attacker.state.since > 0.30){
    attacker.state = idleState();
  }
}

function animate(now=performance.now()){
  const dt = Math.min(0.033, (now - world.lastTick)/1000);
  world.lastTick = now;
  simulate(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

init();