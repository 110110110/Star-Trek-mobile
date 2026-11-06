/* Interfaz táctil: pestañas Mapa / Galaxia / Nave / Registro + barra de mando fija. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const { Trek, TrekUtil } = window; const { dirdist, region, fmt, DEV } = TrekUtil;
const int = Math.floor;
const app = $('app');
let g = null, sel = null, man = false, panel = null, tab = 'mapa', unread = 0;
const WIDE = matchMedia('(orientation:landscape) and (min-width:640px)');

/* ---------- ajustes y guardado ---------- */
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const cfg = Object.assign({ sound: true, vib: true, crt: matchMedia('(pointer:coarse)').matches ? 'soft' : 'full', diff: 1 },
  (() => { try{ return JSON.parse(LS.get('trek.cfg') || '{}'); }catch(e){ return {}; } })());
let diff = cfg.diff, sound = cfg.sound;
const saveCfg = () => LS.set('trek.cfg', JSON.stringify(cfg));
function saveGame(){
  if(!g) return;
  if(g.over){ LS.del('trek.save'); return; }
  LS.set('trek.save', JSON.stringify({ v: 1, diff, g: JSON.parse(g.snapshot()) }));
}
function loadSave(){
  const s = LS.get('trek.save'); if(!s) return null;
  try{ const o = JSON.parse(s); if(o.v !== 1) return null; return { t: Trek.restore(JSON.stringify(o.g), o.diff), diff: o.diff }; }
  catch(e){ LS.del('trek.save'); return null; }
}
const buzz = p => { if(cfg.vib && navigator.vibrate){ try{ navigator.vibrate(p); }catch(e){} } };
let wl = null;
async function keepAwake(){
  try{ if('wakeLock' in navigator && !wl){ wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } }catch(e){}
}

/* ---------- sonido ---------- */
let AC = null;
const ac = () => { if(!AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){} } if(AC && AC.state === 'suspended') AC.resume(); return AC; };
function tone(f0, f1, dur, type, vol){
  if(!sound) return; const c = ac(); if(!c) return; const t = c.currentTime, o = c.createOscillator(), v = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  v.gain.setValueAtTime(vol || .12, t); v.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(v); v.connect(c.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, fc){
  if(!sound) return; const c = ac(); if(!c) return; const n = c.sampleRate * dur | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain(); f.type = 'lowpass'; f.frequency.value = fc || 900; v.gain.value = vol || .3;
  s.buffer = b; s.connect(f); f.connect(v); v.connect(c.destination); s.start();
}
const sfx = {
  blip: () => tone(900, 700, .06, 'square', .05),
  warp: () => { tone(120, 900, .7, 'sawtooth', .07); noise(.7, .12, 500); },
  pha: () => { tone(1500, 160, .45, 'sawtooth', .1); },
  tor: () => { tone(500, 90, .7, 'sine', .16); noise(.5, .1, 1500); },
  boom: () => { noise(.9, .45, 700); tone(110, 30, .8, 'sine', .25); },
  hit: () => { noise(.35, .35, 400); tone(90, 40, .3, 'square', .1); },
  alert: () => { tone(880, 880, .16, 'square', .06); setTimeout(() => tone(660, 660, .16, 'square', .06), 190); },
  ok: () => { tone(660, 990, .18, 'sine', .08); },
  type: () => tone(1800 + Math.random()*600, 1500, .012, 'square', .015)
};

/* ---------- iconos ---------- */
const ICON = {
  '<*>': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="8" rx="7.5" ry="3.8"/><path d="M12 11.8V17M5 20h14M7.5 14.5 6 20M16.5 14.5 18 20"/></svg>',
  '+K+': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M2.5 5.5 12 10l9.5-4.5-3 8L12 19l-6.5-5.5z"/><path d="M12 10v4"/></svg>',
  '>!<': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="8,2.5 16,2.5 21.5,8 21.5,16 16,21.5 8,21.5 2.5,16 2.5,8"/><circle cx="12" cy="12" r="3.6"/></svg>',
  ' * ': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/></svg>'
};
const NAMES = { '+K+': 'Klingon', '>!<': 'Base estelar', ' * ': 'Estrella', '<*>': 'Enterprise', '   ': 'Espacio vacío' };

/* ---------- pestañas ---------- */
function badge(){ const b = $('bdg'); b.textContent = unread > 9 ? '9+' : unread; b.classList.toggle('show', unread > 0 && tab !== 'log'); }
function setTab(t){
  if(WIDE.matches && t === 'mapa') t = 'gal';          // en horizontal el mapa ya está siempre a la vista
  tab = t; app.dataset.tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if(t === 'log'){ unread = 0; logEl.scrollTop = logEl.scrollHeight; }
  badge();
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if(!b) return; ac(); sfx.blip(); setTab(b.dataset.t); });
$('ticker').addEventListener('click', () => { ac(); setTab('log'); });
WIDE.addEventListener('change', () => setTab(tab));

/* ---------- registro tipo teletipo + último mensaje ---------- */
const logEl = $('log'); let lq = [], cur = null, curSpan = null;
function say(msgs){
  if(!msgs.length) return;
  msgs.forEach(m => lq.push(m));
  const l = msgs[msgs.length - 1], tk = $('ticker'); tk.textContent = l.t; tk.className = 'ticker ' + l.k;
  if(tab !== 'log'){ unread += msgs.length; badge(); }
}
let last = performance.now(), acc = 0;
function logTick(now){
  const dt = Math.min(.1, (now - last)/1000); last = now; acc += dt * 95;
  while(acc >= 1){
    acc -= 1;
    if(!cur){
      if(!lq.length){ acc = 0; break; }
      const m = lq.shift(); const d = document.createElement('div'); d.className = m.k; cur = { m, i: 0, d };
      curSpan = document.createElement('span'); d.appendChild(curSpan); const cu = document.createElement('i'); cu.className = 'cur'; d.appendChild(cu); logEl.appendChild(d);
      while(logEl.children.length > 80) logEl.removeChild(logEl.firstChild);
      if(m.k === 'alert') sfx.alert(); else if(m.k === 'good' && /destru/i.test(m.t)) sfx.ok();
    }
    curSpan.textContent += cur.m.t[cur.i++];
    if(tab === 'log' && cur.i % 3 === 0) sfx.type();
    if(cur.i >= cur.m.t.length){ cur.d.removeChild(cur.d.lastChild); cur = null; }
    logEl.scrollTop = logEl.scrollHeight;
  }
  requestAnimationFrame(logTick);
}
requestAnimationFrame(logTick);

/* ---------- dibujo ---------- */
function codeHtml(v){ const k = int(v/100), b = int(v/10)%10, s = v%10; return `<span class="K">${k}</span><span class="B">${b}</span>${s}`; }
function preview(){
  const p = { path: [], tpath: [], block: null };
  if(!g || g.over) return p;
  if(man){ const c1 = +$('rCrs').value, w = +$('rWrp').value; const pv = g.previewMove(c1, int(w*8+.5)); p.path = pv.cells; p.block = pv.blocked; return p; }
  if(sel && sel.kind === 's'){
    const q = g.Q[sel.r][sel.c];
    if(q === '   '){ const m = moveFor(sel.r, sel.c); const pv = g.previewMove(m.c1, m.n); p.path = pv.cells; p.block = pv.blocked; }
    if(q === '+K+'){ const d = dirdist(g.S1, g.S2, sel.r, sel.c); p.tpath = g.previewTorpedo(d.dir).cells; }
  }
  return p;
}
function moveFor(r, c){ const n = Math.max(Math.abs(r - g.S1), Math.abs(c - g.S2)); const d = dirdist(g.S1, g.S2, r, c); return { c1: d.dir, n, w: n/8 }; }
function travelFor(q1, q2){ const n = Math.max(Math.abs(q1 - g.Q1), Math.abs(q2 - g.Q2)); const d = dirdist(g.Q1, g.Q2, q1, q2); return { c1: d.dir, n, w: n }; }

function render(){
  if(!g) return;
  const left = g.T0 + g.T9 - g.T;
  $('top').innerHTML = `<div class="r1"><span class="nm">${region(g.Q1, g.Q2)}</span><span class="lamp ${g.cond}"><i></i><b>${g.cond}</b></span></div>
   <span>CUAD <b>${g.Q1},${g.Q2}</b></span><span>SECT <b>${g.S1},${g.S2}</b></span><span>FECHA <b>${fmt(int(g.T*10)/10)}</b></span>
   <span>DÍAS <b>${fmt(Math.max(0, int(left*10)/10))}</b></span><span>KLINGON <b>${g.K9}</b></span>`;
  // rejilla del cuadrante
  const p = preview(); const key = a => a.map(x => x.join(',')); const ps = new Set(key(p.path)), ts = new Set(key(p.tpath));
  const blind = g.D[2] < 0; const cells = $('qgrid').children;
  for(let r=1;r<=8;r++) for(let c=1;c<=8;c++){
    const el = cells[(r-1)*8 + (c-1)], q = blind ? '   ' : g.Q[r][c]; let cls = 'cell';
    if(q === '+K+') cls += ' k'; else if(q === '>!<') cls += ' b'; else if(q === ' * ') cls += ' s'; else if(q === '<*>') cls += ' me';
    if(sel && sel.kind === 's' && sel.r === r && sel.c === c) cls += ' sel';
    if(ps.has(r+','+c)) cls += ' path'; if(ts.has(r+','+c)) cls += ' tpath';
    if(p.block && p.block[0] === r && p.block[1] === c) cls += ' block';
    el.className = cls; el.innerHTML = ICON[q] || ''; el.disabled = blind || !!g.over;
    el.setAttribute('aria-label', `Sector ${r},${c}: ${NAMES[q]}`);
  }
  $('qgrid').style.opacity = blind ? .55 : 1;
  // galaxia
  let h = '<span></span>'; for(let c=1;c<=8;c++) h += `<span class="h">${c}</span>`;
  for(let r=1;r<=8;r++){
    h += `<span class="h">${r}</span>`;
    for(let c=1;c<=8;c++){
      const here = r === g.Q1 && c === g.Q2, near = Math.abs(r-g.Q1) <= 1 && Math.abs(c-g.Q2) <= 1;
      const v = here ? g.G[r][c] : g.Z[r][c], known = here || v !== 0;
      const cl = 'gc' + (known ? ' known' : '') + (near ? ' near' : '') + (here ? ' here' : '') + (sel && sel.kind === 'q' && sel.q1 === r && sel.q2 === c ? ' sel' : '');
      h += `<button class="${cl}" type="button" data-q="${r},${c}" aria-label="Cuadrante ${r},${c}">${known ? codeHtml(v) : '···'}</button>`;
    }
  }
  $('gal').innerHTML = h;
  // indicadores
  const pct = (v, m) => Math.max(0, Math.min(100, v/m*100));
  const lowE = g.E < g.E0*.1;
  $('gauges').innerHTML =
    `<span>ENERGÍA</span><div class="bar ${lowE ? 'low' : ''}"><i style="width:${pct(g.E, g.E0)}%"></i></div><b>${int(g.E)}</b>
     <span>ESCUDOS</span><div class="bar blue"><i style="width:${pct(g.S, g.E0)}%"></i></div><b>${int(g.S)}</b>
     <span>TORPEDOS</span><div class="pips">${Array.from({length: g.P0}, (_, i) => `<u class="${i < g.P ? 'on' : ''}"></u>`).join('')}</div><b>${g.P}</b>
     <span>TIEMPO</span><div class="bar amber ${left < 5 ? 'low' : ''}"><i style="width:${pct(left, g.T9)}%"></i></div><b>${fmt(Math.max(0, int(left*10)/10))}</b>
     <span>KLINGON</span><div class="bar"><i style="width:${pct(g.K9, g.K7)}%;background:var(--red);box-shadow:0 0 6px var(--red)"></i></div><b>${g.K9}</b>`;
  $('dmg').innerHTML = DEV.map((n, i) => { const d = g.D[i+1], bad = d < 0;
    return `<span class="${bad ? 'bad' : ''}">${n}</span><div class="bar ${bad ? 'amber' : ''}"><i style="width:${bad ? pct(-d, 5) : 100}%"></i></div><b class="${bad ? 'bad' : 'ok'}">${bad ? fmt(Math.round(d*10)/10) : 'OK'}</b>`; }).join('');
  $('strip').innerHTML =
    `<div><span>ENERGÍA <b>${int(g.E)}</b></span><div class="bar ${lowE ? 'low' : ''}"><i style="width:${pct(g.E, g.E0)}%"></i></div></div>
     <div><span>ESCUDOS <b>${int(g.S)}</b></span><div class="bar blue"><i style="width:${pct(g.S, g.E0)}%"></i></div></div>
     <div><span>TORPEDOS <b>${g.P}</b></span><div class="pips">${Array.from({length: g.P0}, (_, i) => `<u class="${i < g.P ? 'on' : ''}"></u>`).join('')}</div></div>`;
  buildAct();
}

/* ---------- barra de mando ---------- */
function buildAct(){
  const over = !!g.over; let info = '', ctx = '';
  const B = (act, label, cls, dis) => `<button class="btn ${cls || ''}" type="button" data-act="${act}" ${dis ? 'disabled' : ''}>${label}</button>`;
  if(over){ info = 'La misión terminó.'; }
  else if(man){ info = 'Modo manual: elegí <b>rumbo</b> (1 a 8,9; el 3 es hacia arriba) y <b>warp</b>. El camino se marca en el Mapa. Warp 1 = 8 sectores.'; }
  else if(sel && sel.kind === 's'){
    const q = g.Q[sel.r][sel.c], where = `sector <b>${sel.r},${sel.c}</b>`;
    if(q === '<*>') info = 'Esta es la Enterprise. Tocá otro sector.';
    else if(q === '   '){
      const m = moveFor(sel.r, sel.c), pv = g.previewMove(m.c1, m.n), cost = m.n + 10, tm = m.w < 1 ? int(10*m.w)/10 : 1;
      const dmgW = g.D[1] < 0 && m.w > .2, noE = g.E - m.n < 0;
      info = `Ir al ${where}: rumbo <b>${fmt(Math.round(m.c1*10)/10)}</b>, warp <b>${fmt(m.w)}</b>, energía <b>−${cost}</b>, tiempo <b>${fmt(tm)}</b> día${tm === 1 ? '' : 's'}.`;
      if(pv.blocked) info += ` <span class="warn">Obstáculo en ${pv.blocked[0]},${pv.blocked[1]}: te detendrías antes.</span>`;
      if(dmgW) info += ' <span class="bad">Motores dañados: máximo 2 sectores por vez.</span>';
      else if(noE) info += ' <span class="bad">Energía insuficiente: bajá los escudos.</span>';
      ctx = B('move', 'Mover aquí', 'go', dmgW || noE);
    } else if(q === '+K+'){
      const d = dirdist(g.S1, g.S2, sel.r, sel.c), pv = g.previewTorpedo(d.dir); const clean = pv.hit && pv.hit.r === sel.r && pv.hit.c === sel.c;
      info = `<b>Klingon</b> en ${where}, distancia <b>${fmt(Math.round(d.dist*10)/10)}</b>. Torpedo: rumbo <b>${fmt(Math.round(d.dir*10)/10)}</b> (apunta solo), cuesta 2 de energía.`;
      if(!clean && pv.hit) info += ` <span class="warn">Chocaría antes con: ${NAMES[pv.hit.q]} en ${pv.hit.r},${pv.hit.c}.</span>`;
      ctx = B('torpAuto', 'Torpedo', 'red', g.P <= 0 || g.D[5] < 0) + B('phaPanel', 'Fásers');
    } else if(q === ' * ') info = `<b>Estrella</b> en ${where}. Bloquea el paso y absorbe los torpedos.`;
    else if(q === '>!<'){
      info = `<b>Base estelar</b> en ${where}. Pegate a ella (sector contiguo) para atracar: repone energía y torpedos y permite reparar. No le dispares.`;
      ctx = B('dock', 'Ir a atracar', 'go');
    }
  } else if(sel && sel.kind === 'q'){
    if(sel.q1 === g.Q1 && sel.q2 === g.Q2) info = 'Ya estás en ese cuadrante.';
    else {
      const t = travelFor(sel.q1, sel.q2), pv = g.previewMove(t.c1, t.n*8), cost = t.n*8 + 10, v = g.Z[sel.q1][sel.q2];
      const known = v === 0 ? 'sin explorar (usá el largo alcance)' : `${int(v/100)} Klingon, ${int(v/10)%10} base, ${v%10} estrellas`;
      info = `Viajar a <b>${region(sel.q1, sel.q2)}</b> (${sel.q1},${sel.q2}): ${known}. Warp <b>${t.n}</b>, energía <b>−${cost}</b>, <b>1</b> día. Llegás al mismo sector.`;
      const dmgW = g.D[1] < 0, noE = g.E - t.n*8 < 0;
      if(pv.blocked) info += ` <span class="warn">Un obstáculo en ${pv.blocked[0]},${pv.blocked[1]} te frenaría: salí de su camino.</span>`;
      if(dmgW) info += ' <span class="bad">Motores dañados.</span>'; else if(noE) info += ' <span class="bad">Energía insuficiente.</span>';
      ctx = B('travel', 'Viajar', 'go', dmgW || noE);
    }
  } else if(g.D[2] < 0) info = '<span class="warn">Sensores de corto alcance dañados:</span> el cuadrante no se ve y no se pueden tocar sectores. Usá <b>Rumbo manual</b>, viajá desde la <b>Galaxia</b> o repará en una base.';
  else info = 'Tocá un <b>sector</b> del Mapa para moverte o disparar, o un <b>cuadrante</b> de la Galaxia para viajar.';
  const est = g.D0 && !over ? g.repairEstimate() : 0;
  if(est) ctx += B('repair', `Reparar (${fmt(est + .1)} d)`, 'go');
  $('info').innerHTML = info; $('ctx').innerHTML = ctx;
  $('main').innerHTML = B('phaPanel', 'Fásers', panel === 'pha' ? 'on' : '', over || g.D[4] < 0) + B('shePanel', 'Escudos', panel === 'she' ? 'on' : '', over || g.D[7] < 0)
    + B('lrs', 'Largo alcance', '', over || g.D[3] < 0) + B('manual', 'Rumbo manual', man ? 'on' : '', over);
  const sp = panel === 'pha' && !over, ss = panel === 'she' && !over, sm = man && !over;
  $('subPha').classList.toggle('show', sp); $('subShe').classList.toggle('show', ss); $('subMan').classList.toggle('show', sm);
  $('dock').classList.toggle('has-sub', sp || ss || sm);
  syncSliders();
}
function syncSliders(){
  const rp = $('rPha'); rp.max = Math.max(10, int(g.E)); if(+rp.value > +rp.max) rp.value = rp.max; $('vPha').textContent = rp.value;
  const rs = $('rShe'); rs.max = Math.max(10, int(g.E + g.S)); if(!rs.dataset.t || panel !== 'she'){ rs.value = int(g.S); } $('vShe').textContent = rs.value;
  $('vCrs').textContent = fmt(+$('rCrs').value); $('vWrp').textContent = fmt(+$('rWrp').value);
  document.querySelectorAll('#rose button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.c - +$('rCrs').value) < .05));
}

/* ---------- acciones ---------- */
function drain(){ say(g.out.splice(0)); }
function after(kind){
  const hit = g.out.some(m => /Impacto de .* sobre la Enterprise/.test(m.t)), boom = g.out.some(m => /DESTRUIDO|DESTRUIDA/.test(m.t));
  if(kind) sfx[kind](); if(hit){ setTimeout(sfx.hit, 250); buzz(70); } if(boom){ setTimeout(sfx.boom, 350); buzz([120, 60, 160]); }
  // al entrar en combate con los escudos casi en cero (así arranca la nave), se abre solo el panel de escudos
  if(!g.over && g.out.some(m => /Escudos peligrosamente bajos/.test(m.t))){ panel = 'she'; man = false; $('rShe').dataset.t = ''; }
  sel = null; drain(); render(); saveGame();
  if(g.over) setTimeout(showEnd, 2400);
}
function act(a){
  ac(); if(!g) return;
  if(a === 'phaPanel'){ panel = panel === 'pha' ? null : 'pha'; man = false; sfx.blip(); render(); return; }
  if(a === 'shePanel'){ panel = panel === 'she' ? null : 'she'; man = false; $('rShe').dataset.t = ''; sfx.blip(); render(); return; }
  if(a === 'manual'){ man = !man; panel = null; sfx.blip(); render(); return; }
  if(a === 'lrs'){ const r = g.lrs(); if(r){ g.out.push({ t: 'Sensores de largo alcance: escaneo de los cuadrantes vecinos completo.', k: 'info' }); sfx.ok(); setTab('gal'); } drain(); render(); saveGame(); return; }
  if(a === 'repair'){ if(g.repair()) sfx.ok(); after(); return; }
  if(a === 'move' && sel){ const m = moveFor(sel.r, sel.c); const ok = g.warp(m.c1, m.w); after(ok ? 'warp' : 'blip'); return; }
  if(a === 'travel' && sel){ const t = travelFor(sel.q1, sel.q2); const ok = g.warp(t.c1, t.w); after(ok ? 'warp' : 'blip'); if(ok) setTab('mapa'); return; }
  if(a === 'torpAuto' && sel){ const d = dirdist(g.S1, g.S2, sel.r, sel.c); const ok = g.torpedo(d.dir); after(ok ? 'tor' : 'blip'); return; }
  if(a === 'dock' && sel){
    let best = null, bd = 1e9;
    for(let r=1;r<=8;r++) for(let c=1;c<=8;c++){
      if(g.Q[r][c] !== '   ') continue;
      if(Math.abs(r - sel.r) > 1 || Math.abs(c - sel.c) > 1) continue;
      const d = (r-g.S1)**2 + (c-g.S2)**2; if(d < bd){ bd = d; best = [r,c]; }
    }
    if(!best){ g.out.push({ t: 'No hay un sector libre junto a la base estelar.', k: 'warn' }); drain(); render(); return; }
    sel = { kind: 's', r: best[0], c: best[1] }; const m = moveFor(best[0], best[1]); const ok = g.warp(m.c1, m.w); after(ok ? 'warp' : 'blip'); return;
  }
}
$('dock').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if(b && !b.disabled) act(b.dataset.act); });
$('qgrid').addEventListener('click', e => {
  const b = e.target.closest('.cell'); if(!b || b.disabled || !g || g.over) return; ac();
  const i = [...$('qgrid').children].indexOf(b), r = int(i/8) + 1, c = i%8 + 1;
  man = false; panel = null;                               // tocar el mapa cierra los paneles para ver Torpedo / Mover
  if(sel && sel.kind === 's' && sel.r === r && sel.c === c && g.Q[r][c] === '   '){ act('move'); return; }
  sel = { kind: 's', r, c }; sfx.blip(); render();
});
$('gal').addEventListener('click', e => {
  const b = e.target.closest('.gc'); if(!b || !g || g.over) return; ac(); const [q1, q2] = b.dataset.q.split(',').map(Number);
  man = false; panel = null; sel = { kind: 'q', q1, q2 }; sfx.blip(); render();
});
// controles deslizantes
$('rPha').addEventListener('input', () => { $('vPha').textContent = $('rPha').value; });
$('rShe').addEventListener('input', () => { $('rShe').dataset.t = '1'; $('vShe').textContent = $('rShe').value; });
$('subPha').addEventListener('click', e => { const f = e.target.dataset && e.target.dataset.f; if(f){ $('rPha').value = int(+$('rPha').max * +f); $('vPha').textContent = $('rPha').value; } });
$('subShe').addEventListener('click', e => { const f = e.target.dataset && e.target.dataset.f; if(f){ $('rShe').dataset.t = '1'; $('rShe').value = int(+$('rShe').max * +f); $('vShe').textContent = $('rShe').value; } });
$('gPha').addEventListener('click', () => { ac(); const x = +$('rPha').value; if(x > 0){ const ok = g.phasers(x); panel = null; after(ok ? 'pha' : 'blip'); } });
$('gShe').addEventListener('click', () => { ac(); const ok = g.shields(+$('rShe').value); panel = null; $('rShe').dataset.t = ''; after(ok ? 'ok' : 'blip'); });
['rCrs','rWrp'].forEach(id => $(id).addEventListener('input', () => { sel = null; render(); }));
$('gMov').addEventListener('click', () => { ac(); const ok = g.warp(+$('rCrs').value, +$('rWrp').value); after(ok ? 'warp' : 'blip'); });
$('gTor').addEventListener('click', () => { ac(); const ok = g.torpedo(+$('rCrs').value); after(ok ? 'tor' : 'blip'); });
// rosa de rumbos
(() => { const order = [4,3,2,5,0,1,6,7,8]; $('rose').innerHTML = order.map(n => n ? `<button type="button" data-c="${n}">${n}</button>` : '<span></span>').join(''); })();
$('rose').addEventListener('click', e => { const b = e.target.closest('button'); if(b){ $('rCrs').value = b.dataset.c; sel = null; render(); } });

/* ---------- construcción de la rejilla ---------- */
(() => {
  let h = ''; for(let i=0;i<64;i++) h += '<button class="cell" type="button"></button>'; $('qgrid').innerHTML = h;
  $('cl').innerHTML = [1,2,3,4,5,6,7,8].map(n => `<span>${n}</span>`).join(''); $('rl').innerHTML = [1,2,3,4,5,6,7,8].map(n => `<span>${n}</span>`).join('');
})();

/* ---------- pantallas de inicio y fin ---------- */
function showStart(){
  g = null; sel = null; man = false; panel = null; $('ov').className = 'ov show';
  $('top').innerHTML = '<div class="r1"><span class="nm">STAR TREK</span></div>';
  const sv = loadSave();
  const resume = sv ? `<button class="btn go" data-d="resume" type="button" style="flex-basis:100%">Continuar misión · ${sv.t.K9} Klingon · ${fmt(Math.max(0, int((sv.t.T0 + sv.t.T9 - sv.t.T)*10)/10))} días</button>` : '';
  $('ov').innerHTML = `<h2>STAR TREK</h2>
   <p>Estás al mando de la nave insignia. Una flota Klingon invadió la galaxia: destruila entera antes de que se agote el tiempo.</p>
   <ul><li>Tocá un sector del Mapa para moverte; tocá un Klingon para dispararle.</li><li>Tocá un cuadrante de la Galaxia para viajar.</li><li>Pegate a una base estelar para repostar y reparar.</li></ul>
   <div class="dif">${resume}<button class="btn" data-d="0" type="button">Aspirante</button><button class="btn ${sv ? '' : 'go'}" data-d="1" type="button">Capitán</button><button class="btn" data-d="2" type="button">Almirante</button></div>
   <p class="small">Capitán usa las reglas de Super Star Trek. Aspirante da más días y Klingon más débiles; Almirante, menos días y Klingon más duros.</p>`;
}
function showEnd(){
  if(!g || !g.over) return; const o = g.over;
  const why = { destruida: 'La Enterprise fue destruida.', tiempo: 'Se acabó el tiempo.', varado: 'La nave quedó varada sin energía.', corte: 'Te relevaron del mando.', renuncia: 'Renunciaste al mando.' }[o.why] || '';
  $('ov').className = 'ov show';
  $('ov').innerHTML = o.won
    ? `<h2>MISIÓN CUMPLIDA</h2><p>Destruiste a toda la flota Klingon con ${fmt(Math.max(0, int((g.T0 + g.T9 - g.T)*10)/10))} días de sobra.</p><p>Índice de eficiencia: <b style="color:#fff">${o.rating}</b></p><div class="dif"><button class="btn go" data-d="${diff}" type="button">Nueva misión</button></div>`
    : `<h2 style="color:var(--red);text-shadow:0 0 12px var(--red)">MISIÓN FALLIDA</h2><p>${why}</p><p>Quedaban ${g.K9} cruceros Klingon.</p><div class="dif"><button class="btn go" data-d="${diff}" type="button">Nueva misión</button><button class="btn" data-d="-1" type="button">Cambiar dificultad</button></div>`;
}
function begin(){
  $('ov').className = 'ov'; logEl.innerHTML = ''; lq = []; cur = null; sel = null; man = false; panel = null;
  // si la misión arranca dentro de una zona de combate (escudos en 0), se abre el panel de escudos
  if(g.out.some(m => /Escudos peligrosamente bajos/.test(m.t))){ panel = 'she'; $('rShe').dataset.t = ''; }
  drain(); unread = 0; setTab('mapa'); render(); saveGame(); keepAwake();
}
function start(d){ diff = d; cfg.diff = d; saveCfg(); g = new Trek({ diff }); sfx.ok(); begin(); }
function resume(){
  const sv = loadSave(); if(!sv){ start(diff); return; }
  diff = sv.diff; g = sv.t; sfx.ok();
  g.out.push({ t: `Misión reanudada en el cuadrante ${region(g.Q1, g.Q2)}.`, k: 'info' }); begin();
}
$('ov').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]'); if(!b) return; ac();
  if(b.dataset.d === 'resume') resume(); else if(+b.dataset.d < 0) showStart(); else start(+b.dataset.d);
});

/* ---------- menú ---------- */
const menu = $('menu'), dlg = $('dlg');
[menu, dlg].forEach(d => d.addEventListener('click', e => { if(e.target === d) d.close(); }));
const CRT_LABEL = { full: 'completa', soft: 'suave', off: 'no' };
function menuLabels(){
  $('bSnd').textContent = 'Sonido: ' + (sound ? 'sí' : 'no');
  $('bVib').textContent = 'Vibración: ' + (cfg.vib ? 'sí' : 'no');
  $('bCrt').textContent = 'Pantalla antigua: ' + CRT_LABEL[cfg.crt];
  $('bVib').hidden = !navigator.vibrate;
  $('bFull').hidden = !(document.fullscreenEnabled && !matchMedia('(display-mode: standalone)').matches);
  $('bFull').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
}
$('bMenu').onclick = () => { ac(); menuLabels(); menu.showModal(); };
$('menuX').onclick = () => menu.close();
$('bSnd').onclick = () => { sound = cfg.sound = !sound; saveCfg(); menuLabels(); sfx.blip(); };
$('bVib').onclick = () => { cfg.vib = !cfg.vib; saveCfg(); menuLabels(); buzz(40); };
$('bCrt').onclick = () => { const o = ['soft','full','off']; cfg.crt = o[(o.indexOf(cfg.crt) + 1) % 3]; saveCfg(); crt.set(cfg.crt); menuLabels(); };
$('bFull').onclick = () => { try{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }catch(e){} menu.close(); };
$('bHelp').onclick = () => { menu.close(); dlg.showModal(); };
$('dlgX').onclick = () => dlg.close();
$('bNew').onclick = () => { menu.close(); showStart(); };
$('bQuit').onclick = () => { menu.close(); if(g && !g.over && confirm('¿Renunciar al mando?')){ g.resign(); after(); } };
$('dlgB').innerHTML = `<p>Es una versión inventada: conserva las <b>reglas de Super Star Trek</b> (los Klingon se reubican cuando navegás, hay daños, bases y escudos) pero se maneja tocando.</p>
<p><b>Mapa.</b> Tocá un sector vacío para ver el camino y la energía que gasta, y tocalo otra vez (o «Mover aquí») para ir. Tocá un Klingon para dispararle un torpedo, con el rumbo calculado por la computadora, o fásers. Si el camino pasa por una estrella u otra nave, te detenés antes.</p>
<p><b>Galaxia.</b> Cada cuadrante muestra Klingon, bases y estrellas (por ejemplo <span style="color:#ff5d4d">1</span><span style="color:#79cbff">0</span>3). Solo se conocen los que escaneaste con el largo alcance. Tocá uno y «Viajar»: llegás al mismo sector.</p>
<p><b>Nave.</b> Energía, escudos, torpedos, tiempo y estado de cada sistema. <b>Registro</b>: el diario de a bordo; el último mensaje siempre se ve sobre los botones.</p>
<p><b>Fásers.</b> Repartís la energía entre los Klingon del cuadrante; cuanto más lejos, menos daño. Cada vez que disparás, ellos devuelven el fuego. Subí los escudos antes de pelear.</p>
<p><b>Bases.</b> Quedate en un sector contiguo: se reponen energía y torpedos y podés reparar los daños.</p>
<p><b>Rumbo manual.</b> Para usar el rumbo (1 a 8,9) y el warp como en el original.</p>
<p>La partida se guarda sola: si cerrás la app, al volver aparece «Continuar misión». En iPhone/iPad: Compartir → <i>Agregar a inicio</i>. En Android: menú del navegador → <i>Instalar app</i>.</p>`;
let deferred = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('bInst').hidden = false; });
addEventListener('appinstalled', () => { deferred = null; $('bInst').hidden = true; });
$('bInst').onclick = async () => { if(!deferred) return; menu.close(); deferred.prompt(); try{ await deferred.userChoice; }catch(e){} deferred = null; $('bInst').hidden = true; };

/* ---------- efecto de pantalla antigua (completo / suave / apagado) ---------- */
const crt = (() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = document.createElement('div'); fx.className = 'crt-fx'; fx.setAttribute('aria-hidden', 'true');
  fx.innerHTML = '<i class="scan"></i><i class="hum"></i><canvas width="120" height="90"></canvas>'; document.body.appendChild(fx);
  const nz = fx.querySelector('canvas'), nx = nz.getContext('2d'), img = nx.createImageData(120, 90);
  const O = { filter: 'blur(.4px) brightness(1.08) contrast(1.08)', jit: .5, flick: .03 }; let mode = 'soft', n = 0;
  function set(m){
    mode = m; document.body.dataset.crt = m;
    app.style.filter = (m === 'full' && !still) ? O.filter : ''; app.style.opacity = ''; app.style.transform = '';
  }
  function tick(){
    requestAnimationFrame(tick); if(mode !== 'full' || still || document.hidden || (++n % 3)) return;
    for(let i = 0; i < img.data.length; i += 4){ const v = Math.random() * 255; img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255; }
    nx.putImageData(img, 0, 0);
    app.style.opacity = (1 - O.flick + Math.random() * O.flick).toFixed(3);
    app.style.transform = 'translate(' + ((Math.random() - 0.5) * O.jit).toFixed(2) + 'px,0)';
  }
  requestAnimationFrame(tick);
  return { set };
})();
crt.set(cfg.crt);

/* ---------- ciclo de vida ---------- */
document.addEventListener('visibilitychange', () => { if(document.hidden) saveGame(); else if(g && !g.over) keepAwake(); });
addEventListener('pagehide', saveGame);
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
window.__trek = { get g(){ return g; }, start, render, setTab, get tab(){ return tab; } };
showStart();
})();
