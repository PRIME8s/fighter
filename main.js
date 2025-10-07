import * as THREE from 'https://unpkg.com/three@0.160.1/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0d12');

// 2.5D camera
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 500);
camera.position.set(0, 2.2, 7);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = false;
controls.enableRotate = false;

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.9);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(3,6,4);
dir.castShadow = true;
scene.add(dir);

// Floor
const floorGeo = new THREE.PlaneGeometry(30, 10);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x11151d, metalness: 0.1, roughness: 0.9 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI/2;
floor.position.y = 0;
floor.receiveShadow = true;
scene.add(floor);

// Backdrop
const wallGeo = new THREE.PlaneGeometry(40, 12);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x0f131a, metalness: 0.2, roughness: 1.0 });
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.set(0, 4.5, -5);
scene.add(wall);

// UI elements
const p1Select = document.getElementById('p1Select');
const p2Select = document.getElementById('p2Select');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const result = document.getElementById('result');
const resultText = document.getElementById('resultText');
const p1HealthEl = document.getElementById('p1Health');
const p2HealthEl = document.getElementById('p2Health');
const timerEl = document.getElementById('matchTimer');
const cpuToggle = document.getElementById('cpuToggle');

async function loadCharacters() {
  const list = await fetch('characters.json').then(r => r.json());
  const names = list.map(url => (decodeURIComponent(url.split('/').pop()).replace('.glb','')));
  for (let i=0;i<list.length;i++) {
    const opt1 = document.createElement('option');
    opt1.value = list[i]; opt1.textContent = names[i];
    p1Select.appendChild(opt1);
    const opt2 = document.createElement('option');
    opt2.value = list[i]; opt2.textContent = names[i];
    p2Select.appendChild(opt2);
  }
  // defaults
  p1Select.selectedIndex = 0;
  p2Select.selectedIndex = 1;
}
await loadCharacters();

// Simple fighter representation
class Fighter {
  constructor(side, url, tint=0xffffff) {
    this.side = side; // 'P1' or 'P2'
    this.url = url;
    this.tint = tint;
    this.root = new THREE.Group();
    this.model = null;
    this.ready = false;
    this.health = 100;
    this.isBlocking = false;
    this.direction = side === 'P1' ? 1 : -1; // facing direction along X
    this.move = { left:false, right:false, jump:false };
    this.velY = 0;
    this.onGround = true;
    this.comboCooldown = 0;
    this.kickCooldown = 0;
    this.punching = false;
    this.kicking = false;
    this.hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent:true, opacity:0.0 })
    );
    this.hitSphere.visible = false;
    this.root.add(this.hitSphere);
    scene.add(this.root);
  }

  async load() {
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');
    const gltf = await loader.loadAsync(this.url);
    this.model = gltf.scene;
    // normalize scale and orientation
    // Center and scale to ~2.2 units height
    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(0.001, size.y);
    const scale = 2.2 / height;
    this.model.scale.setScalar(scale);

    // ensure facing each other on Z=0 plane (side view), rotate to face +X initially
    this.model.rotation.y = Math.PI/2; 

    // slight color tint if needed
    this.model.traverse((o)=>{
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (o.material && o.material.color) {
          // multiply color to help distinguish
          o.material.color.multiplyScalar(1.0);
        }
      }
    });

    this.root.add(this.model);
    this.ready = true;
  }

  setPosition(x, y=0, z=0) {
    this.root.position.set(x,y,z);
  }

  updateFacing(opponent) {
    if (!opponent) return;
    const facing = (opponent.root.position.x > this.root.position.x) ? 1 : -1;
    this.direction = facing;
    this.model.rotation.y = facing === 1 ? Math.PI/2 : -Math.PI/2;
  }

  updatePhysics(dt) {
    // gravity & jump
    if (this.move.jump && this.onGround) {
      this.velY = 5.6;
      this.onGround = false;
    }
    this.velY += -12.5 * dt;
    this.root.position.y += this.velY * dt;
    if (this.root.position.y <= 0) {
      this.root.position.y = 0;
      this.velY = 0;
      this.onGround = true;
    }

    // horizontal movement
    const speed = 3.3;
    const dir = (this.move.right?1:0) - (this.move.left?1:0);
    this.root.position.x += dir * speed * dt;

    // arena bounds
    this.root.position.x = Math.max(-10, Math.min(10, this.root.position.x));

    // cooldowns
    this.comboCooldown = Math.max(0, this.comboCooldown - dt);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
  }

  doPunch() {
    if (this.comboCooldown>0) return;
    this.punching = true;
    this.isBlocking = false;
    this.comboCooldown = 0.45;
    this.spawnHitSphere(0.9, 0.95, 0.28); // offsetX, heightY, radius
    setTimeout(()=>{ this.punching=false; this.hideHitSphere(); }, 140);
  }

  doKick() {
    if (this.kickCooldown>0) return;
    this.kicking = true;
    this.isBlocking = false;
    this.kickCooldown = 0.8;
    this.spawnHitSphere(1.1, 0.55, 0.32);
    setTimeout(()=>{ this.kicking=false; this.hideHitSphere(); }, 160);
  }

  spawnHitSphere(offsetX, heightY, radius) {
    this.hitSphere.geometry.dispose();
    this.hitSphere.geometry = new THREE.SphereGeometry(radius, 16, 16);
    const sign = this.direction === 1 ? 1 : -1;
    const local = new THREE.Vector3(offsetX*sign, heightY, 0);
    this.hitSphere.position.copy(local);
    this.hitSphere.visible = true;
    this.hitSphere.material.opacity = 0.18;
  }

  hideHitSphere(){
    this.hitSphere.visible = false;
    this.hitSphere.material.opacity = 0.0;
  }
}

// Game state
let p1 = null, p2 = null;
let last = performance.now()/1000;
let running = false;
let timeLeft = 99;

function aabbHit(aPos, aR, bPos, bR){
  const dx = aPos.x - bPos.x;
  const dy = aPos.y - bPos.y;
  const dz = aPos.z - bPos.z;
  const dist2 = dx*dx+dy*dy+dz*dz;
  const r = aR+bR;
  return dist2 <= r*r;
}

function updateHealthUI(){
  p1HealthEl.style.width = Math.max(0, p1.health) + '%';
  p2HealthEl.style.width = Math.max(0, p2.health) + '%';
}

function endMatch(text){
  running = false;
  resultText.textContent = text;
  result.classList.remove('hidden');
}

function reset() {
  result.classList.add('hidden');
  timeLeft = 99;
  timerEl.textContent = timeLeft.toString();
  if (p1) p1.health = 100;
  if (p2) p2.health = 100;
  updateHealthUI();
  running = true;
}

function cpuThink(dt) {
  // simple AI: move towards opponent, randomly punch/kick/block
  const dist = Math.abs(p2.root.position.x - p1.root.position.x);
  const towards = (p1.root.position.x > p2.root.position.x);
  p2.move.left = !towards;
  p2.move.right = towards;
  p2.move.jump = Math.random()<0.005 && p2.onGround;

  if (dist < 1.4 && Math.random()<0.02) {
    (Math.random()<0.6) ? p2.doPunch() : p2.doKick();
  }
  p2.isBlocking = (dist < 1.6 && Math.random()<0.2);
}

function handleHits(attacker, defender) {
  if (!attacker.hitSphere.visible) return;
  // world position of hit sphere
  const ws = new THREE.Vector3();
  attacker.hitSphere.getWorldPosition(ws);
  const ds = new THREE.Vector3();
  defender.root.getWorldPosition(ds);
  // approximate defender body radius
  const rDef = 0.65;
  const rAtk = attacker.hitSphere.geometry.parameters.radius || 0.3;
  if (aabbHit(ws, rAtk, ds, rDef)) {
    // hit!
    attacker.hideHitSphere();
    const blocked = defender.isBlocking;
    const dmg = blocked ? 4 : 10;
    defender.health -= dmg;

    // knockback
    const kb = blocked ? 0.6 : 1.2;
    defender.root.position.x += kb * (attacker.direction);

    // tiny spark
    spark(ws);

    updateHealthUI();
    if (defender.health <= 0) {
      endMatch(attacker.side + ' WINS!');
    }
  }
}

const sparks = [];
function spark(pos){
  const geo = new THREE.SphereGeometry(0.09, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  scene.add(m);
  sparks.push({ m, t:0 });
}

function updateSparks(dt){
  for (let i=sparks.length-1;i>=0;i--){
    const s = sparks[i];
    s.t += dt;
    s.m.scale.setScalar(1 + s.t*4);
    s.m.material.opacity = Math.max(0, 1 - s.t*2);
    if (s.t > 0.6) {
      scene.remove(s.m);
      s.m.geometry.dispose();
      s.m.material.dispose();
      sparks.splice(i,1);
    }
  }
}

// Input handling
const keys = {};
addEventListener('keydown', (e)=>{
  keys[e.key.toLowerCase()] = true;
  if (!running) return;
  // P1
  if (e.key.toLowerCase()==='j') p1.doPunch();
  if (e.key.toLowerCase()==='k') p1.doKick();
  // P2 (human)
  if (!cpuToggle.checked) {
    if (e.key==='1') p2.doPunch();
    if (e.key==='2') p2.doKick();
  }
});
addEventListener('keyup', (e)=>{ keys[e.key.toLowerCase()] = false; });

function pollControls(){
  if (!running) return;
  // P1: A/D/W/S
  p1.move.left = !!keys['a'];
  p1.move.right = !!keys['d'];
  p1.move.jump = !!keys['w'];
  p1.isBlocking = !!keys['s'];

  if (!cpuToggle.checked) {
    // P2: arrows + down to block
    p2.move.left = !!keys['arrowleft'];
    p2.move.right = !!keys['arrowright'];
    p2.move.jump = !!keys['arrowup'];
    p2.isBlocking = !!keys['arrowdown'];
  }
}

// Match timer
let timerAcc = 0;

function loop(){
  const now = performance.now()/1000;
  const dt = Math.min(0.033, now - last);
  last = now;

  pollControls();

  if (running) {
    // Update fighters
    p1.updateFacing(p2);
    p2.updateFacing(p1);
    p1.updatePhysics(dt);
    p2.updatePhysics(dt);

    // Simple separation to avoid overlap
    const dx = p2.root.position.x - p1.root.position.x;
    if (Math.abs(dx) < 0.8) {
      const push = (0.8 - Math.abs(dx)) * 0.5;
      p1.root.position.x += -Math.sign(dx) * push;
      p2.root.position.x += Math.sign(dx) * push;
    }

    // CPU
    if (cpuToggle.checked) cpuThink(dt);

    // Collisions for hits
    handleHits(p1, p2);
    handleHits(p2, p1);

    // Timer
    timerAcc += dt;
    if (timerAcc >= 1) {
      timerAcc = 0;
      timeLeft -= 1;
      timerEl.textContent = timeLeft.toString();
      if (timeLeft <= 0) {
        const winner = (p1.health === p2.health) ? 'DRAW' : (p1.health>p2.health ? 'P1 WINS (time)!' : 'P2 WINS (time)!');
        endMatch(winner);
      }
    }
  }

  updateSparks(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

async function startMatch() {
  // cleanup any existing fighters
  if (p1) scene.remove(p1.root);
  if (p2) scene.remove(p2.root);

  p1 = new Fighter('P1', p1Select.value, 0xffffff);
  p2 = new Fighter('P2', p2Select.value, 0xffffff);
  await Promise.all([p1.load(), p2.load()]);

  p1.setPosition(-3, 0, 0);
  p2.setPosition( 3, 0, 0);

  updateHealthUI();
  reset();
}

startBtn.addEventListener('click', startMatch);
restartBtn.addEventListener('click', ()=>{
  result.classList.add('hidden');
  reset();
});

// Resize handling
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
