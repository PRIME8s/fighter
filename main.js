import * as THREE from 'https://unpkg.com/three@0.160.1/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js';

const debugEl = document.getElementById('debugConsole');
function logDebug(msg){ if(!debugEl) return; debugEl.innerHTML = (debugEl.innerHTML?debugEl.innerHTML+'\n':'') + msg; }

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
const p1MeterEl = document.getElementById('p1Meter');
const p2MeterEl = document.getElementById('p2Meter');
const timerEl = document.getElementById('matchTimer');
const cpuToggle = document.getElementById('cpuToggle');

// Touch controls
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnJump = document.getElementById('btnJump');
const btnBlock = document.getElementById('btnBlock');
const btnPunch = document.getElementById('btnPunch');
const btnKick = document.getElementById('btnKick');
const btnSpecial = document.getElementById('btnSpecial');
const btnSuper = document.getElementById('btnSuper');

function bindHoldButton(el, onPress, onRelease){
  if (!el) return;
  const down = (e)=>{ e.preventDefault(); onPress(); };
  const up = (e)=>{ e.preventDefault(); onRelease(); };
  el.addEventListener('pointerdown', down, { passive:false });
  el.addEventListener('pointerup', up, { passive:false });
  el.addEventListener('pointercancel', up, { passive:false });
  el.addEventListener('pointerleave', up, { passive:false });
  el.addEventListener('touchstart', (e)=>{ e.preventDefault(); onPress(); }, { passive:false });
  el.addEventListener('touchend', (e)=>{ e.preventDefault(); onRelease(); }, { passive:false });
  el.addEventListener('touchcancel', (e)=>{ e.preventDefault(); onRelease(); }, { passive:false });
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
}

// Load characters list (same-origin)
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
  p1Select.selectedIndex = 0;
  p2Select.selectedIndex = Math.min(1, p2Select.options.length-1);
}
await loadCharacters();

function nameFromUrl(url){ return decodeURIComponent(url.split('/').pop()).replace('.glb',''); }

class Fighter {
  constructor(side, url, tint=0xffffff) {
    this.side = side;
    this.url = url;
    this.displayName = nameFromUrl(url);
    this.tint = tint;
    this.root = new THREE.Group();
    this.model = null;
    this.ready = false;
    this.health = 100;
    this.meter = 0;
    this.isBlocking = false;
    this.direction = side === 'P1' ? 1 : -1;
    this.move = { left:false, right:false, jump:false };
    this.velY = 0;
    this.onGround = true;
    this.comboCooldown = 0;
    this.kickCooldown = 0;
    this.specialCooldown = 0;
    this.superActive = false;
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
    let gltf;
    try{
      gltf = await loader.loadAsync(this.url);
    } catch (err){
      logDebug(`❌ Failed to load: ${this.displayName || this.url}\n   → ${err && err.message ? err.message : err}`);
      const geom = new THREE.BoxGeometry(1,2,0.6);
      const mat = new THREE.MeshStandardMaterial({color:0x884444, roughness:0.9, metalness:0.0});
      this.model = new THREE.Mesh(geom, mat);
      this.displayName = (this.displayName || 'Character') + ' (placeholder)';
      this.ready = true;
      this.root.add(this.model);
      return;
    }
    this.model = gltf.scene;
    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const height = Math.max(0.001, size.y);
    const scale = 2.2 / height;
    this.model.scale.setScalar(scale);
    this.model.rotation.y = Math.PI/2; 
    this.model.traverse((o)=>{
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.root.add(this.model);
    this.ready = true;
  }

  setPosition(x, y=0, z=0) { this.root.position.set(x,y,z); }

  updateFacing(opponent) {
    if (!opponent) return;
    const facing = (opponent.root.position.x > this.root.position.x) ? 1 : -1;
    this.direction = facing;
    if (this.model) this.model.rotation.y = facing === 1 ? Math.PI/2 : -Math.PI/2;
  }

  gainMeter(amount){ this.meter = Math.min(100, this.meter + amount); }

  updatePhysics(dt) {
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

    const speed = 3.3 * (this.superActive ? 1.25 : 1.0);
    const dir = (this.move.right?1:0) - (this.move.left?1:0);
    this.root.position.x += dir * speed * dt;
    this.root.position.x = Math.max(-10, Math.min(10, this.root.position.x));
    this.comboCooldown = Math.max(0, this.comboCooldown - dt);
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);
  }

  doPunch() {
    if (this.comboCooldown>0) return;
    this.punching = true; this.isBlocking = false; this.comboCooldown = 0.42;
    const rangeBoost = this.superActive ? 0.2 : 0;
    this.spawnHitSphere(0.9+rangeBoost, 0.95, 0.28+rangeBoost*0.8);
    setTimeout(()=>{ this.punching=false; this.hideHitSphere(); }, 140);
  }

  doKick() {
    if (this.kickCooldown>0) return;
    this.kicking = true; this.isBlocking = false; this.kickCooldown = 0.76;
    const rangeBoost = this.superActive ? 0.25 : 0;
    this.spawnHitSphere(1.1+rangeBoost, 0.55, 0.32+rangeBoost*0.8);
    setTimeout(()=>{ this.kicking=false; this.hideHitSphere(); }, 160);
  }

  doSpecial() {
    if (this.specialCooldown>0) return;
    const n = this.displayName.toLowerCase();
    if (n.includes('ghost') || n.includes('skell')) {
      this.phaseDash();
    } else if (n.includes('gold') || n.includes('golden')) {
      projectile(this, 6.5, 10, 0.42, 0xffe669);
    } else if (n.includes('tiger') || n.includes('cheetah')) {
      this.leapStrike();
    } else if (n.includes('death') || n.includes('bot') || n.includes('ai')) {
      beam(this, 8.0, 12, 0xff66aa);
    } else if (n.includes('zombie')) {
      aoeCloud(this, 1.3, 8, 1.4, 0x86ff86);
    } else if (n.includes('dmt') || n.includes('trippy') || n.includes('noise')) {
      radialBurst(this, 1.8, 10, 1.8, 0x9d67ff);
    } else {
      this.shoulderRush();
    }
    this.specialCooldown = 2.0;
  }

  doSuper() {
    if (this.meter < 100) return;
    this.meter = 0;
    this.superActive = true;
    flashAura(this, 0x9a6bff);
    setTimeout(()=>{ this.superActive = false; }, 5500);
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
  hideHitSphere(){ this.hitSphere.visible = false; this.hitSphere.material.opacity = 0.0; }

  // Specials
  phaseDash(){
    const sign = this.direction===1?1:-1;
    const start = this.root.position.x;
    const target = start + sign*3.5;
    let t=0;
    const dash = ()=>{
      if (t>1) return;
      this.root.position.x = THREE.MathUtils.lerp(start, target, t);
      t += 0.3;
      setTimeout(dash, 16);
    };
    dash();
    setTimeout(()=>{ this.spawnHitSphere(0.8, 0.9, 0.35); setTimeout(()=>this.hideHitSphere(), 120); }, 80);
  }

  leapStrike(){
    if (!this.onGround) return;
    this.velY = 6.5;
    setTimeout(()=>{ this.spawnHitSphere(1.2, 0.7, 0.42); setTimeout(()=>this.hideHitSphere(), 180); }, 200);
  }

  shoulderRush(){
    const sign = this.direction===1?1:-1;
    let steps = 12;
    const tick = ()=>{
      if (steps--<=0) return;
      this.root.position.x += sign*0.35;
      this.spawnHitSphere(1.0, 0.8, 0.35);
      setTimeout(()=>this.hideHitSphere(), 60);
      setTimeout(tick, 33);
    };
    tick();
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
  p1MeterEl.style.width = Math.max(0, p1.meter) + '%';
  p2MeterEl.style.width = Math.max(0, p2.meter) + '%';
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
  if (p1) { p1.health = 100; p1.meter=0; p1.superActive=false; }
  if (p2) { p2.health = 100; p2.meter=0; p2.superActive=false; }
  updateHealthUI();
  running = true;
}

function cpuThink(dt) {
  const dist = Math.abs(p2.root.position.x - p1.root.position.x);
  const towards = (p1.root.position.x > p2.root.position.x);
  p2.move.left = !towards;
  p2.move.right = towards;
  p2.move.jump = Math.random()<0.005 && p2.onGround;
  if (dist < 1.5 && Math.random()<0.025) { (Math.random()<0.6) ? p2.doPunch() : p2.doKick(); }
  if (Math.random()<0.01) p2.doSpecial();
  if (p2.meter>=100 && Math.random()<0.01) p2.doSuper();
  p2.isBlocking = (dist < 1.6 && Math.random()<0.2);
}

function handleHits(attacker, defender, baseDmg=10, baseKB=1.2) {
  if (!attacker.hitSphere.visible) return;
  const ws = new THREE.Vector3();
  attacker.hitSphere.getWorldPosition(ws);
  const ds = new THREE.Vector3();
  defender.root.getWorldPosition(ds);
  const rDef = 0.65;
  const rAtk = attacker.hitSphere.geometry.parameters.radius || 0.3;
  if (aabbHit(ws, rAtk, ds, rDef)) {
    attacker.hideHitSphere();
    const blocked = defender.isBlocking;
    let dmg = blocked ? baseDmg*0.4 : baseDmg;
    if (attacker.superActive) dmg *= 1.35;
    defender.health -= dmg;
    const kb = (blocked ? baseKB*0.5 : baseKB) * (attacker.superActive?1.2:1.0);
    defender.root.position.x += kb * (attacker.direction);
    spark(ws);
    attacker.gainMeter(blocked ? 2 : 6);
    defender.gainMeter(blocked ? 1 : 3);
    updateHealthUI();
    if (defender.health <= 0) endMatch(attacker.side + ' WINS!');
  }
}

const sparks = [];
function spark(pos){
  const geo = new THREE.SphereGeometry(0.09, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  scene.add(m); sparks.push({ m, t:0 });
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

// Extra VFX + Special helpers
function projectile(user, speed, dmg, radius, color){
  const sign = user.direction===1?1:-1;
  const g = new THREE.SphereGeometry(radius, 12, 12);
  const m = new THREE.MeshBasicMaterial({ color });
  const orb = new THREE.Mesh(g, m);
  const wp = new THREE.Vector3();
  user.root.getWorldPosition(wp);
  orb.position.set(wp.x + sign*0.8, 1.0, 0);
  scene.add(orb);
  const step = ()=>{
    if (!running) return;
    orb.position.x += sign * 0.18 * speed;
    const opp = user===p1 ? p2 : p1;
    const oppPos = new THREE.Vector3();
    opp.root.getWorldPosition(oppPos);
    if (aabbHit(orb.position, radius, oppPos, 0.7)){
      scene.remove(orb); g.dispose(); m.dispose();
      handleHits(user, opp, dmg, 1.0);
      return;
    }
    if (Math.abs(orb.position.x)>12){ scene.remove(orb); g.dispose(); m.dispose(); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function beam(user, length, dmg, color){
  const sign = user.direction===1?1:-1;
  const g = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
  const m = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.8 });
  const b = new THREE.Mesh(g, m);
  b.rotation.z = Math.PI/2;
  const wp = new THREE.Vector3();
  user.root.getWorldPosition(wp);
  b.position.set(wp.x + sign*length/2, 1.0, 0);
  scene.add(b);
  for (let i=0;i<4;i++){
    setTimeout(()=>{
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.4,8,8), new THREE.MeshBasicMaterial({visible:false}));
      hit.position.set(b.position.x, 1.0, 0);
      scene.add(hit);
      const opp = user===p1 ? p2 : p1;
      const oppPos = new THREE.Vector3(); opp.root.getWorldPosition(oppPos);
      if (aabbHit(hit.position, length*0.45, oppPos, 0.7)){
        handleHits(user, opp, dmg, 1.3);
      }
      scene.remove(hit);
    }, i*60);
  }
  setTimeout(()=>{ scene.remove(b); g.dispose(); m.dispose(); }, 260);
}

function aoeCloud(user, dmg, baseKB, radius, color){
  const g = new THREE.SphereGeometry(radius, 12, 12);
  const m = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.3 });
  const cloud = new THREE.Mesh(g, m);
  const wp = new THREE.Vector3();
  user.root.getWorldPosition(wp);
  cloud.position.set(wp.x + (user.direction===1?0.6:-0.6), 0.8, 0);
  scene.add(cloud);
  const opp = user===p1 ? p2 : p1;
  const oppPos = new THREE.Vector3(); opp.root.getWorldPosition(oppPos);
  if (aabbHit(cloud.position, radius, oppPos, 0.7)){
    handleHits(user, opp, dmg, baseKB);
  }
  setTimeout(()=>{ scene.remove(cloud); g.dispose(); m.dispose(); }, 300);
}

function radialBurst(user, dmg, baseKB, radius, color){
  const g = new THREE.RingGeometry(0.01, radius, 32);
  const m = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.9, side:THREE.DoubleSide });
  const ring = new THREE.Mesh(g, m);
  const wp = new THREE.Vector3(); user.root.getWorldPosition(wp);
  ring.position.set(wp.x, 1.0, 0); ring.rotation.x = Math.PI/2;
  scene.add(ring);
  let t=0;
  const opp = user===p1 ? p2 : p1;
  const step=()=>{
    t+=0.08;
    ring.scale.setScalar(1 + t*3);
    m.opacity = Math.max(0, 0.9 - t);
    const oppPos = new THREE.Vector3(); opp.root.getWorldPosition(oppPos);
    if (aabbHit(ring.position, radius*t, oppPos, 0.7)){
      handleHits(user, opp, dmg, baseKB);
    }
    if (t>1){ scene.remove(ring); g.dispose(); m.dispose(); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function flashAura(user, color){
  const g = new THREE.SphereGeometry(1.2, 16, 16);
  const m = new THREE.MeshBasicMaterial({ color, wireframe:true, transparent:true, opacity:0.4 });
  const a = new THREE.Mesh(g, m);
  user.root.add(a);
  setTimeout(()=>{ user.root.remove(a); g.dispose(); m.dispose(); }, 800);
}

// Keyboard Input
const keys = {};
addEventListener('keydown', (e)=>{
  keys[e.key.toLowerCase()] = true;
  if (!running) return;
  // P1 actions
  if (e.key.toLowerCase()==='j') p1.doPunch();
  if (e.key.toLowerCase()==='k') p1.doKick();
  if (e.key.toLowerCase()==='l') p1.doSpecial();
  if (e.key===';') p1.doSuper();
  // P2 (human)
  if (!cpuToggle.checked) {
    if (e.key==='1') p2.doPunch();
    if (e.key==='2') p2.doKick();
    if (e.key==='3') p2.doSpecial();
    if (e.key==='4') p2.doSuper();
  }
});
addEventListener('keyup', (e)=>{ keys[e.key.toLowerCase()] = false; });

function pollControls(){
  if (!running) return;
  // P1: A/D/W/S
  p1.move.left = !!keys['a'] || touch.left;
  p1.move.right = !!keys['d'] || touch.right;
  p1.move.jump = !!keys['w'] || touch.jump;
  p1.isBlocking = !!keys['s'] || touch.block;

  if (!cpuToggle.checked) {
    p2.move.left = !!keys['arrowleft'];
    p2.move.right = !!keys['arrowright'];
    p2.move.jump = !!keys['arrowup'];
    p2.isBlocking = !!keys['arrowdown'];
  }
}

// Touch state
const touch = { left:false, right:false, jump:false, block:false };
bindHoldButton(btnLeft, ()=>{ touch.left=true; touch.right=false; }, ()=>{ touch.left=false; });
bindHoldButton(btnRight, ()=>{ touch.right=true; touch.left=false; }, ()=>{ touch.right=false; });
bindHoldButton(btnJump, ()=>{ touch.jump=true; }, ()=>{ touch.jump=false; });
bindHoldButton(btnBlock, ()=>{ touch.block=true; }, ()=>{ touch.block=false; });
bindHoldButton(btnPunch, ()=>{ if (running) p1.doPunch(); }, ()=>{});
bindHoldButton(btnKick, ()=>{ if (running) p1.doKick(); }, ()=>{});
bindHoldButton(btnSpecial, ()=>{ if (running) p1.doSpecial(); }, ()=>{});
bindHoldButton(btnSuper, ()=>{ if (running) p1.doSuper(); }, ()=>{});

// Match timer
let timerAcc = 0;

function loop(){
  const now = performance.now()/1000;
  const dt = Math.min(0.033, now - last);
  last = now;

  pollControls();

  if (running) {
    p1.updateFacing(p2);
    p2.updateFacing(p1);
    p1.updatePhysics(dt);
    p2.updatePhysics(dt);

    const dx = p2.root.position.x - p1.root.position.x;
    if (Math.abs(dx) < 0.8) {
      const push = (0.8 - Math.abs(dx)) * 0.5;
      p1.root.position.x += -Math.sign(dx) * push;
      p2.root.position.x += Math.sign(dx) * push;
    }

    if (cpuToggle.checked) cpuThink(dt);
    handleHits(p1, p2);
    handleHits(p2, p1);

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
  updateHealthUI();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

async function startMatch() {
  if (p1) scene.remove(p1.root);
  if (p2) scene.remove(p2.root);

  p1 = new Fighter('P1', p1Select.value, 0xffffff);
  p2 = new Fighter('P2', p2Select.value, 0xffffff);
  try{
    await Promise.all([p1.load(), p2.load()]);
  } catch (e) {
    logDebug('⚠️ One or more models failed — placeholders inserted.');
  }

  p1.setPosition(-3, 0, 0);
  p2.setPosition( 3, 0, 0);

  updateHealthUI();
  reset();
}

startBtn.addEventListener('click', startMatch);
restartBtn && restartBtn.addEventListener('click', ()=>{
  result.classList.add('hidden');
  reset();
});

// Resize handling
addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
