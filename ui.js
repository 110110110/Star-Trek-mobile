/* Interfaz táctil: pestañas Mapa / Galaxia / Nave / Registro + barra de mando fija. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const { Trek, TrekUtil } = window; const { dirdist, region, fmt, DEV } = TrekUtil;
const int = Math.floor;
const app = $('app');
let g = null, sel = null, man = false, panel = null, tab = 'mapa', unread = 0;
let aim = null, aimAuto = null, st = null, tutStep = -1, recorded = false, lastEntry = null;
const holeAt = b => !!(b && g.Q[b[0]][b[1]] === '(@)');
const newStats = () => ({ tor: 0, pha: 0, mov: 0, hit: 0, aim: 0 });
const WIDE = matchMedia('(orientation:landscape) and (min-width:640px)');

/* ---------- ajustes y guardado ---------- */
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const cfg = Object.assign({ sound: true, vib: true, crt: matchMedia('(pointer:coarse)').matches ? 'soft' : 'full', diff: 1, amb: true },
  (() => { try{ return JSON.parse(LS.get('trek.cfg') || '{}'); }catch(e){ return {}; } })());
let diff = cfg.diff, sound = cfg.sound;
const saveCfg = () => LS.set('trek.cfg', JSON.stringify(cfg));
function saveGame(){
  if(!g) return;
  if(g.over){ LS.del('trek.save'); return; }
  LS.set('trek.save', JSON.stringify({ v: 1, diff, st, g: JSON.parse(g.snapshot()) }));
}
function loadSave(){
  const s = LS.get('trek.save'); if(!s) return null;
  try{ const o = JSON.parse(s); if(o.v !== 1) return null; return { t: Trek.restore(JSON.stringify(o.g), o.diff), diff: o.diff, st: Object.assign(newStats(), o.st || {}) }; }
  catch(e){ LS.del('trek.save'); return null; }
}
const buzz = p => { if(cfg.vib && navigator.vibrate){ try{ navigator.vibrate(p); }catch(e){} } };
let wl = null;
async function keepAwake(){
  try{ if('wakeLock' in navigator && !wl){ wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } }catch(e){}
}

/* ---------- sonido (todo sintetizado con Web Audio: no hay archivos de audio) ---------- */
let AC = null, master = null;
const ac = () => { if(!AC){ try{ AC = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){} } if(AC && AC.state === 'suspended') AC.resume(); return AC; };
function out(){
  const c = ac(); if(!c) return null;
  if(!master){ master = c.createGain(); master.gain.value = .9; const comp = c.createDynamicsCompressor(); master.connect(comp); comp.connect(c.destination); }
  return master;
}
/* una voz: oscilador con barrido de frecuencia, vibrato opcional, filtro y envolvente */
function voice(o){
  if(!sound) return; const c = ac(), m = out(); if(!c) return;
  const t = c.currentTime + (o.at || 0), dur = o.dur, osc = c.createOscillator(), v = c.createGain(); let node = osc;
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f0, t);
  if(o.f1 && o.f1 !== o.f0) osc.frequency[o.lin ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime'](Math.max(20, o.f1), t + dur);
  if(o.det) osc.detune.value = o.det;
  if(o.vib){ const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + .05); }
  if(o.lp){ const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp[0], t); f.frequency.exponentialRampToValueAtTime(Math.max(40, o.lp[1]), t + dur); osc.connect(f); node = f; }
  const a = o.att || .005, vol = o.vol || .1;
  v.gain.setValueAtTime(.0001, t); v.gain.linearRampToValueAtTime(vol, t + a);
  if(o.hold) v.gain.setValueAtTime(vol, t + dur*o.hold);
  v.gain.exponentialRampToValueAtTime(.0005, t + dur); node.connect(v); v.connect(m); osc.start(t); osc.stop(t + dur + .05);
}
function noise(dur, vol, fc, o){
  if(!sound) return; o = o || {}; const c = ac(), m = out(); if(!c) return; const t = c.currentTime + (o.at || 0);
  const n = c.sampleRate * dur | 0, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/n, o.pow || 1);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain(); f.type = o.type || 'lowpass';
  f.frequency.setValueAtTime(fc || 900, t); if(o.fc1) f.frequency.exponentialRampToValueAtTime(o.fc1, t + dur);
  v.gain.value = vol || .3; s.buffer = b; s.connect(f); f.connect(v); v.connect(m); s.start(t);
}
const tone = (f0, f1, dur, type, vol, at) => voice({ f0, f1, dur, type, vol, at });
let sirenUntil = 0;
const sfx = {
  blip: () => tone(900, 700, .06, 'square', .05),
  // fásers: «piiiu» agudo que cae, con trémolo rápido
  pha: () => {
    voice({ type: 'triangle', f0: 3100, f1: 650, dur: .6, vol: .11, vib: [34, 150], att: .01 });
    voice({ type: 'sine', f0: 6200, f1: 1500, dur: .5, vol: .035, vib: [34, 300] });
    noise(.05, .08, 4000, { type: 'highpass' });
  },
  // torpedo fotónico: golpe grave + silbido descendente con vibrato
  tor: () => {
    voice({ type: 'sine', f0: 190, f1: 48, dur: .35, vol: .3 });
    voice({ type: 'triangle', f0: 1500, f1: 230, dur: .85, vol: .1, vib: [16, 70], at: .03 });
    voice({ type: 'sawtooth', f0: 700, f1: 120, dur: .8, vol: .04, lp: [2500, 300], at: .03 });
    noise(.5, .07, 2600, { fc1: 300 });
  },
  // disparo disruptor Klingon: áspero y pulsante
  disr: () => {
    voice({ type: 'sawtooth', f0: 520, f1: 95, dur: .38, vol: .1, vib: [55, 140], lp: [3000, 400] });
    voice({ type: 'square', f0: 260, f1: 70, dur: .3, vol: .05, vib: [45, 60] });
  },
  hit: () => { noise(.45, .4, 600, { fc1: 120 }); voice({ type: 'square', f0: 240, f1: 55, dur: .35, vol: .1 }); voice({ type: 'sine', f0: 80, f1: 35, dur: .4, vol: .22 }); },
  boom: () => { noise(1.1, .5, 900, { fc1: 70, pow: 1.6 }); voice({ type: 'sine', f0: 100, f1: 26, dur: 1, vol: .3 }); noise(.5, .15, 3000, { type: 'highpass', at: .02, pow: 3 }); },
  // sirena de alerta roja: tres «uuu-uuu» graves
  redAlert: () => {
    const c = ac(); if(!c || !sound || c.currentTime < sirenUntil) return; sirenUntil = c.currentTime + 2.6;
    for(let i=0;i<3;i++){
      voice({ type: 'sawtooth', f0: 430, f1: 800, dur: .42, vol: .1, lp: [900, 2200], at: i*.8, lin: true, att: .04 });
      voice({ type: 'sawtooth', f0: 800, f1: 430, dur: .4, vol: .1, lp: [2200, 900], at: i*.8 + .42, lin: true, att: .02 });
    }
  },
  alert: () => { tone(880, 880, .14, 'square', .055); tone(660, 660, .14, 'square', .055, .18); tone(880, 880, .14, 'square', .055, .36); },
  warp: () => {
    voice({ type: 'sawtooth', f0: 70, f1: 900, dur: .95, vol: .08, lp: [300, 2400], att: .25 });
    voice({ type: 'sine', f0: 140, f1: 1300, dur: .95, vol: .07, att: .3, vib: [6, 20] });
    noise(.9, .1, 400, { fc1: 3500, pow: .5 });
    voice({ type: 'sine', f0: 90, f1: 40, dur: .5, vol: .2, at: .75 });
  },
  shUp: () => { voice({ type: 'sine', f0: 180, f1: 1300, dur: .7, vol: .09, vib: [9, 25] }); voice({ type: 'triangle', f0: 360, f1: 2600, dur: .7, vol: .035 }); },
  shDn: () => { voice({ type: 'sine', f0: 1300, f1: 180, dur: .6, vol: .08, vib: [9, 25] }); },
  dock: () => { [660, 880, 1320].forEach((f, i) => voice({ type: 'sine', f0: f, dur: .7, vol: .08, at: i*.14 })); noise(.5, .06, 900, { at: .1 }); },
  hole: () => {
    voice({ type: 'sine', f0: 520, f1: 28, dur: 2, vol: .22, vib: [5, 40] });
    voice({ type: 'sawtooth', f0: 200, f1: 30, dur: 2, vol: .07, lp: [1500, 60] });
    noise(2, .25, 500, { fc1: 60, pow: .3 });
  },
  probe: () => { voice({ type: 'triangle', f0: 280, f1: 2000, dur: .4, vol: .08 }); tone(2400, 2400, .22, 'sine', .07, .4); tone(1800, 1800, .22, 'sine', .04, .7); },
  // comunicador: gorjeo de dos notas
  comm: () => { tone(1400, 2100, .07, 'sine', .07); tone(1800, 2700, .08, 'sine', .07, .09); },
  ok: () => { tone(660, 990, .18, 'sine', .08); },
  win: () => { [262, 330, 392, 523].forEach((f, i) => { voice({ type: 'triangle', f0: f, dur: i === 3 ? 1.3 : .5, vol: .11, at: i*.16 }); voice({ type: 'sine', f0: f*2, dur: i === 3 ? 1.3 : .5, vol: .04, at: i*.16 }); }); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => voice({ type: 'sawtooth', f0: f, dur: i === 3 ? 1.6 : .55, vol: .07, lp: [1200, 200], at: i*.4 })); },
  type: () => tone(1800 + Math.random()*600, 1500, .012, 'square', .015)
};

/* ambiente de puente: zumbido grave y «bips» de computadora, muy bajito */
const amb = (() => {
  let nodes = null, timer = 0;
  const beep = () => {
    if(!nodes) return; const n = 2 + Math.floor(Math.random()*3), base = 900 + Math.random()*1400;
    for(let i=0;i<n;i++) tone(base*(1 + (i%2)*.5), base*(1 + (i%2)*.5), .045, 'sine', .022, i*.09);
    timer = setTimeout(beep, 4500 + Math.random()*9000);
  };
  return {
    on(){
      if(nodes || !sound || !cfg.amb) return; const c = ac(), m = out(); if(!c) return;
      const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(.045, c.currentTime + 2.5); g.connect(m);
      const os = [[110, 0], [165.5, 0], [220.8, 0], [330.2, 0]].map(([f], i) => { const o = c.createOscillator(), og = c.createGain(); o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; og.gain.value = [1, .5, .35, .15][i]; o.connect(og); og.connect(g); o.start(); return o; });
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = .25; lg.gain.value = .012; l.connect(lg); lg.connect(g.gain); l.start();
      nodes = { g, os, l }; timer = setTimeout(beep, 3000);
    },
    off(){
      if(!nodes) return; const n = nodes; nodes = null; clearTimeout(timer);
      try{ n.g.gain.cancelScheduledValues(AC.currentTime); n.g.gain.setValueAtTime(n.g.gain.value, AC.currentTime); n.g.gain.linearRampToValueAtTime(0, AC.currentTime + .6); }catch(e){}
      setTimeout(() => { n.os.forEach(o => { try{ o.stop(); }catch(e){} }); try{ n.l.stop(); }catch(e){} }, 700);
    }
  };
})();

/* ---------- iconos ---------- */
const ICON = {
  '<*>': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="8" rx="7.5" ry="3.8"/><path d="M12 11.8V17M5 20h14M7.5 14.5 6 20M16.5 14.5 18 20"/></svg>',
  '+K+': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M2.5 5.5 12 10l9.5-4.5-3 8L12 19l-6.5-5.5z"/><path d="M12 10v4"/></svg>',
  '>!<': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><polygon points="8,2.5 16,2.5 21.5,8 21.5,16 16,21.5 8,21.5 2.5,16 2.5,8"/><circle cx="12" cy="12" r="3.6"/></svg>',
  ' * ': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/></svg>',
  '(@)': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 8.2c3.6-1 7 1.2 7 4.3 0 3.600-3.800 6-7.800 5.300M12 15.800c-3.600 1-7-1.200-7-4.300 0-3.600 3.800-6 7.800-5.300"/></svg>'
};
const NAMES = { '+K+': 'Klingon', '>!<': 'Base estelar', ' * ': 'Estrella', '<*>': 'Enterprise', '   ': 'Espacio vacío', '(@)': 'Agujero negro' };

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
      if(m.k === 'alert'){ if(/ALERTA ROJA/.test(m.t)) sfx.redAlert(); else if(/horizonte de sucesos/.test(m.t)) sfx.hole(); else sfx.alert(); }
      else if(m.k === 'crew') sfx.comm(); else if(m.k === 'good' && /destru/i.test(m.t)) sfx.ok(); else if(/^Atracado/.test(m.t)) sfx.dock();
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
  if(aim !== null) p.tpath = g.previewTorpedo(aimC1()).cells;
  return p;
}
const aimC1 = () => aim >= 9 ? 1 : aim;
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
    if(q === '+K+') cls += ' k'; else if(q === '>!<') cls += ' b'; else if(q === ' * ') cls += ' s'; else if(q === '<*>') cls += ' me'; else if(q === '(@)') cls += ' h';
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
      const bh = g.adv && g.ZB[r][c] ? '<u class="bhm">●</u>' : '';
      h += `<button class="${cl}" type="button" data-q="${r},${c}" aria-label="Cuadrante ${r},${c}${bh ? ', con agujero negro' : ''}">${known ? codeHtml(v) : '···'}${bh}</button>`;
    }
  }
  $('gal').innerHTML = h; $('bhLeg').hidden = !g.adv;
  // indicadores
  const pct = (v, m) => Math.max(0, Math.min(100, v/m*100));
  const lowE = g.E < g.E0*.1;
  $('gauges').innerHTML =
    `<span>ENERGÍA</span><div class="bar ${lowE ? 'low' : ''}"><i style="width:${pct(g.E, g.E0)}%"></i></div><b>${int(g.E)}</b>
     <span>ESCUDOS</span><div class="bar blue"><i style="width:${pct(g.S, g.E0)}%"></i></div><b>${int(g.S)}</b>
     <span>TORPEDOS</span><div class="pips">${Array.from({length: g.P0}, (_, i) => `<u class="${i < g.P ? 'on' : ''}"></u>`).join('')}</div><b>${g.P}</b>
     ${g.adv ? `<span>SONDAS</span><div class="pips">${Array.from({length: g.PR0}, (_, i) => `<u class="${i < g.PR ? 'on' : ''}"></u>`).join('')}</div><b>${g.PR}</b>` : ''}
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
      if(holeAt(pv.blocked)) info += ` <span class="bad">¡Agujero negro en ${pv.blocked[0]},${pv.blocked[1]}! Si vas por ahí te traga.</span>`;
      else if(pv.blocked) info += ` <span class="warn">Obstáculo en ${pv.blocked[0]},${pv.blocked[1]}: te detendrías antes.</span>`;
      if(dmgW) info += ' <span class="bad">Motores dañados: máximo 2 sectores por vez.</span>';
      else if(noE) info += ' <span class="bad">Energía insuficiente: bajá los escudos.</span>';
      ctx = B('move', 'Mover aquí', 'go', dmgW || noE);
    } else if(q === '+K+'){
      const d = dirdist(g.S1, g.S2, sel.r, sel.c), pv = g.previewTorpedo(d.dir); const clean = pv.hit && pv.hit.r === sel.r && pv.hit.c === sel.c;
      info = `<b>Klingon</b> en ${where}, distancia <b>${fmt(Math.round(d.dist*10)/10)}</b>. Torpedo: rumbo <b>${fmt(Math.round(d.dir*10)/10)}</b> (apunta solo), cuesta 2 de energía. «Apuntar» te deja elegir el rumbo.`;
      if(!clean && pv.hit) info += ` <span class="warn">Chocaría antes con: ${NAMES[pv.hit.q]} en ${pv.hit.r},${pv.hit.c}.</span>`;
      ctx = B('torpAuto', 'Torpedo', 'red', g.P <= 0 || g.D[5] < 0) + B('aim', 'Apuntar', 'red', g.P <= 0 || g.D[5] < 0) + B('phaPanel', 'Fásers');
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
      if(holeAt(pv.blocked)) info += ` <span class="bad">¡Agujero negro en ${pv.blocked[0]},${pv.blocked[1]} del cuadrante actual! Salí de su camino.</span>`;
      else if(pv.blocked) info += ` <span class="warn">Un obstáculo en ${pv.blocked[0]},${pv.blocked[1]} te frenaría: salí de su camino.</span>`;
      if(dmgW) info += ' <span class="bad">Motores dañados.</span>'; else if(noE) info += ' <span class="bad">Energía insuficiente.</span>';
      ctx = B('travel', 'Viajar', 'go', dmgW || noE);
      if(g.adv){ ctx += B('probe', `Sonda (${g.PR})`, '', g.PR <= 0); info += ` Sonda: explora el cuadrante y todo el camino hasta el borde, sin gastar tiempo ni energía.`; }
    }
  } else if(g.D[2] < 0) info = '<span class="warn">Sensores de corto alcance dañados:</span> el cuadrante no se ve y no se pueden tocar sectores. Usá <b>Rumbo manual</b>, viajá desde la <b>Galaxia</b> o repará en una base.';
  else info = 'Tocá un <b>sector</b> del Mapa para moverte o disparar, o un <b>cuadrante</b> de la Galaxia para viajar.';
  const est = g.D0 && !over ? g.repairEstimate() : 0;
  if(est) ctx += B('repair', `Reparar (${fmt(est + .1)} d)`, 'go');
  $('info').innerHTML = info; $('ctx').innerHTML = ctx;
  $('main').innerHTML = B('phaPanel', 'Fásers', panel === 'pha' ? 'on' : '', over || g.D[4] < 0) + B('shePanel', 'Escudos', panel === 'she' ? 'on' : '', over || g.D[7] < 0)
    + B('lrs', 'Largo alcance', '', over || g.D[3] < 0) + B('manual', 'Rumbo manual', man ? 'on' : '', over);
  const sp = panel === 'pha' && !over, ss = panel === 'she' && !over, sm = man && !over, sa = aim !== null && !over;
  $('subPha').classList.toggle('show', sp); $('subShe').classList.toggle('show', ss); $('subMan').classList.toggle('show', sm); $('subAim').classList.toggle('show', sa);
  $('dock').classList.toggle('has-sub', sp || ss || sm || sa);
  if(sa) buildAim();
  syncSliders(); renderTut();
}
function buildAim(){
  const pv = g.previewTorpedo(aimC1()), h = pv.hit; let t;
  if(!h) t = '<span class="warn">Se pierde en el espacio.</span>';
  else if(h.q === '+K+') t = `<b>Impacta al Klingon</b> del sector ${h.r},${h.c}.`;
  else if(h.q === '(@)') t = `<span class="warn">El agujero negro de ${h.r},${h.c} se traga el torpedo.</span>`;
  else if(h.q === ' * ') t = `<span class="warn">Choca con la estrella de ${h.r},${h.c}: no sirve.</span>`;
  else t = `<span class="bad">¡Alcanzaría a tu base estelar en ${h.r},${h.c}!</span>`;
  const auto = Math.abs(aim - aimAuto) < 1e-9;
  $('aimTxt').innerHTML = `${t} Rumbo <b>${fmt(Math.round(aim*100)/100)}</b>${auto ? ' (calculado)' : ''} · 2 de energía.`;
  $('rAim').value = aim; $('vAim').textContent = fmt(Math.round(aim*100)/100);
  $('gAim').disabled = g.P <= 0 || g.D[5] < 0;
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
  const nHit = g.out.filter(m => /Impacto de .* sobre la Enterprise/.test(m.t)).length;
  if(kind) sfx[kind](); if(boom){ setTimeout(sfx.boom, 350); buzz([120, 60, 160]); }
  for(let i=0;i<nHit;i++){ setTimeout(sfx.disr, 120 + i*320); setTimeout(sfx.hit, 330 + i*320); }
  if(hit){ buzz(70); setTimeout(shake, 330); }
  if(g.over) setTimeout(g.over.won ? sfx.win : sfx.lose, 900);
  // al entrar en combate con los escudos casi en cero (así arranca la nave), se abre solo el panel de escudos
  if(!g.over && g.out.some(m => /Escudos peligrosamente bajos/.test(m.t))){ panel = 'she'; man = false; $('rShe').dataset.t = ''; }
  st.hit += g.out.filter(m => /Impacto de .* sobre la Enterprise/.test(m.t)).length;
  sel = null; aim = null; drain(); if(g.over) record(); render(); saveGame();
  if(g.over) setTimeout(showEnd, 2400);
}
function shake(){ app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake'); setTimeout(() => app.classList.remove('shake'), 450); }
function act(a){
  ac(); if(!g) return;
  if(a === 'aim' && sel && g.Q[sel.r][sel.c] === '+K+'){ aimAuto = dirdist(g.S1, g.S2, sel.r, sel.c).dir; aim = aimAuto; panel = null; man = false; sfx.blip(); render(); return; }
  if(a === 'phaPanel'){ panel = panel === 'pha' ? null : 'pha'; man = false; aim = null; sfx.blip(); render(); return; }
  if(a === 'shePanel'){ panel = panel === 'she' ? null : 'she'; man = false; aim = null; $('rShe').dataset.t = ''; sfx.blip(); render(); return; }
  if(a === 'manual'){ man = !man; panel = null; aim = null; sfx.blip(); render(); return; }
  if(a === 'lrs'){ const r = g.lrs(); if(r){ g.out.push({ t: 'Sensores de largo alcance: escaneo de los cuadrantes vecinos completo.', k: 'info' }); sfx.ok(); setTab('gal'); } drain(); render(); saveGame(); return; }
  if(a === 'probe' && sel && sel.kind === 'q'){ const t = travelFor(sel.q1, sel.q2); const ok = g.probe(t.c1, [sel.q1, sel.q2]); after(ok ? 'probe' : 'blip'); return; }
  if(a === 'repair'){ if(g.repair()) sfx.ok(); after(); return; }
  if(a === 'move' && sel){ const m = moveFor(sel.r, sel.c); const ok = g.warp(m.c1, m.w); if(ok) st.mov++; after(ok ? 'warp' : 'blip'); return; }
  if(a === 'travel' && sel){ const t = travelFor(sel.q1, sel.q2); const ok = g.warp(t.c1, t.w); if(ok) st.mov++; after(ok ? 'warp' : 'blip'); if(ok) setTab('mapa'); return; }
  if(a === 'torpAuto' && sel){ const d = dirdist(g.S1, g.S2, sel.r, sel.c); const ok = g.torpedo(d.dir); if(ok) st.tor++; after(ok ? 'tor' : 'blip'); return; }
  if(a === 'dock' && sel){
    let best = null, bd = 1e9;
    for(let r=1;r<=8;r++) for(let c=1;c<=8;c++){
      if(g.Q[r][c] !== '   ') continue;
      if(Math.abs(r - sel.r) > 1 || Math.abs(c - sel.c) > 1) continue;
      const d = (r-g.S1)**2 + (c-g.S2)**2; if(d < bd){ bd = d; best = [r,c]; }
    }
    if(!best){ g.out.push({ t: 'No hay un sector libre junto a la base estelar.', k: 'warn' }); drain(); render(); return; }
    sel = { kind: 's', r: best[0], c: best[1] }; const m = moveFor(best[0], best[1]); const ok = g.warp(m.c1, m.w); if(ok) st.mov++; after(ok ? 'warp' : 'blip'); return;
  }
}
$('dock').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if(b && !b.disabled) act(b.dataset.act); });
$('qgrid').addEventListener('click', e => {
  const b = e.target.closest('.cell'); if(!b || b.disabled || !g || g.over) return; ac();
  const i = [...$('qgrid').children].indexOf(b), r = int(i/8) + 1, c = i%8 + 1;
  man = false; panel = null; aim = null;                   // tocar el mapa cierra los paneles para ver Torpedo / Mover
  if(sel && sel.kind === 's' && sel.r === r && sel.c === c && g.Q[r][c] === '   '){ act('move'); return; }
  sel = { kind: 's', r, c }; sfx.blip(); render();
});
$('gal').addEventListener('click', e => {
  const b = e.target.closest('.gc'); if(!b || !g || g.over) return; ac(); const [q1, q2] = b.dataset.q.split(',').map(Number);
  man = false; panel = null; aim = null; sel = { kind: 'q', q1, q2 }; sfx.blip(); render();
});
// controles deslizantes
$('rPha').addEventListener('input', () => { $('vPha').textContent = $('rPha').value; });
$('rShe').addEventListener('input', () => { $('rShe').dataset.t = '1'; $('vShe').textContent = $('rShe').value; });
$('subPha').addEventListener('click', e => { const f = e.target.dataset && e.target.dataset.f; if(f){ $('rPha').value = int(+$('rPha').max * +f); $('vPha').textContent = $('rPha').value; } });
$('subShe').addEventListener('click', e => { const f = e.target.dataset && e.target.dataset.f; if(f){ $('rShe').dataset.t = '1'; $('rShe').value = int(+$('rShe').max * +f); $('vShe').textContent = $('rShe').value; } });
$('gPha').addEventListener('click', () => { ac(); const x = +$('rPha').value; if(x > 0){ const ok = g.phasers(x); if(ok) st.pha++; panel = null; after(ok ? 'pha' : 'blip'); } });
$('gShe').addEventListener('click', () => { ac(); const x = +$('rShe').value, up = x > g.S, ok = g.shields(x); panel = null; $('rShe').dataset.t = ''; after(ok ? (up ? 'shUp' : 'shDn') : 'blip'); });
['rCrs','rWrp'].forEach(id => $(id).addEventListener('input', () => { sel = null; render(); }));
$('gMov').addEventListener('click', () => { ac(); const ok = g.warp(+$('rCrs').value, +$('rWrp').value); if(ok) st.mov++; after(ok ? 'warp' : 'blip'); });
$('gTor').addEventListener('click', () => { ac(); const ok = g.torpedo(+$('rCrs').value); if(ok) st.tor++; after(ok ? 'tor' : 'blip'); });
// apuntar torpedo a mano
$('rAim').addEventListener('input', () => { aim = +$('rAim').value; render(); });
$('subAim').addEventListener('click', e => {
  const a = e.target.dataset && e.target.dataset.a; if(!a) return; ac(); sfx.blip();
  if(a === 'x'){ aim = null; } else if(a === 'auto'){ aim = aimAuto; } else { aim = Math.min(9, Math.max(1, Math.round((aim + +a)*100)/100)); }
  render();
});
$('gAim').addEventListener('click', () => { ac(); const ok = g.torpedo(aimC1()); if(ok){ st.tor++; st.aim++; } after(ok ? 'tor' : 'blip'); });
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
  amb.off(); g = null; sel = null; man = false; panel = null; aim = null; tutStep = -1; $('ov').className = 'ov show';
  $('top').innerHTML = '<div class="r1"><span class="nm">STAR TREK</span></div>';
  const sv = loadSave();
  const resume = sv ? `<button class="btn go" data-d="resume" type="button" style="flex-basis:100%">Continuar misión · ${sv.t.K9} Klingon · ${fmt(Math.max(0, int((sv.t.T0 + sv.t.T9 - sv.t.T)*10)/10))} días</button>` : '';
  $('ov').innerHTML = `<h2>STAR TREK</h2>
   <p>Estás al mando de la nave insignia. Una flota Klingon invadió la galaxia: destruila entera antes de que se agote el tiempo.</p>
   <ul><li>Tocá un sector del Mapa para moverte; tocá un Klingon para dispararle.</li><li>Tocá un cuadrante de la Galaxia para viajar.</li><li>Pegate a una base estelar para repostar y reparar.</li></ul>
   <div class="dif"><button class="btn ${cfg.adv ? 'on' : ''}" data-d="adv" type="button" style="flex-basis:100%">Reglas avanzadas: ${cfg.adv ? 'SÍ' : 'no'}</button></div>
   <div class="dif">${resume}<button class="btn" data-d="0" type="button">Aspirante</button><button class="btn ${sv ? '' : 'go'}" data-d="1" type="button">Capitán</button><button class="btn" data-d="2" type="button">Almirante</button></div>
   <p class="small">Reglas avanzadas: los Klingon te persiguen, hay agujeros negros y tenés 3 sondas. Es más difícil que el original.</p>
   <p class="small">Capitán usa las reglas de Super Star Trek. Aspirante da más días y Klingon más débiles; Almirante, menos días y Klingon más duros.</p>`;
}
/* ---------- historial y puntaje ---------- */
const HK = 'trek.hist', DIFN = ['Aspirante', 'Capitán', 'Almirante'], dn = (d, a) => DIFN[d] + (a ? ' avanzado' : '');
const hist = () => { try{ const h = JSON.parse(LS.get(HK) || '[]'); return Array.isArray(h) ? h : []; }catch(e){ return []; } };
const rankOf = r => r < 100 ? 'Cadete' : r < 300 ? 'Alférez' : r < 700 ? 'Teniente' : r < 1500 ? 'Comandante' : 'Almirante de la Flota';
const bestOf = (h, d, a) => h.filter(x => x.won && x.diff === d && !!x.adv === !!a).reduce((m, x) => Math.max(m, x.rating), 0);
function record(){
  if(recorded || !g || !g.over) return; recorded = true;
  const o = g.over, h = hist();
  const e = { ts: Date.now(), adv: !!g.adv, won: !!o.won, why: o.why || '', diff, rating: o.won && isFinite(o.rating) ? o.rating : 0, kills: g.K7 - g.K9, total: g.K7,
    days: Math.round((g.T - g.T0)*10)/10, of: g.T9, tor: st.tor, pha: st.pha, hit: st.hit };
  e.best = e.won && e.rating > bestOf(h, diff, g.adv);
  h.push(e); LS.set(HK, JSON.stringify(h.slice(-40))); lastEntry = e;
}
function showEnd(){
  if(!g || !g.over) return; amb.off(); record(); const o = g.over, e = lastEntry, h = hist();
  const why = { destruida: 'La Enterprise fue destruida.', tiempo: 'Se acabó el tiempo.', varado: 'La nave quedó varada sin energía.', corte: 'Te relevaron del mando.', renuncia: 'Renunciaste al mando.' }[o.why] || '';
  const left = fmt(Math.max(0, int((g.T0 + g.T9 - g.T)*10)/10)), best = bestOf(h, diff, g.adv);
  const stats = `<div class="stats"><span>Klingon destruidos</span><b>${e.kills} / ${e.total}</b><span>Días usados</span><b>${fmt(e.days)} de ${e.of}</b>
    <span>Torpedos / fásers</span><b>${e.tor} / ${e.pha}</b><span>Impactos recibidos</span><b>${e.hit}</b>${best ? `<span>Mejor índice (${dn(diff, g.adv)})</span><b>${best}</b>` : ''}</div>`;
  const btns = `<div class="dif"><button class="btn go" data-d="${diff}" type="button">Nueva misión</button><button class="btn" data-d="hist" type="button">Historial</button>${o.won ? '' : '<button class="btn" data-d="-1" type="button">Cambiar dificultad</button>'}</div>`;
  $('ov').className = 'ov show';
  $('ov').innerHTML = o.won
    ? `<h2>MISIÓN CUMPLIDA</h2><p>Destruiste a toda la flota Klingon con ${left} días de sobra.</p>
       <div class="score"><b>${o.rating}</b><span>índice de eficiencia · rango <em>${rankOf(o.rating)}</em></span>${e.best ? '<strong>¡NUEVO RÉCORD!</strong>' : ''}</div>${stats}${btns}`
    : `<h2 style="color:var(--red);text-shadow:0 0 12px var(--red)">MISIÓN FALLIDA</h2><p>${why} Quedaban ${g.K9} cruceros Klingon.</p>${stats}${btns}`;
}
function showHist(){
  const h = hist(), won = h.filter(x => x.won), nm = [0, 1, 2, 3, 4, 5].map(k => { const d = k % 3, a = k > 2; return { d, a, b: bestOf(h, d, a), n: h.filter(x => x.diff === d && !!x.adv === a).length }; }).filter(x => x.n);
  $('dlgT').textContent = 'HISTORIAL';
  if(!h.length){ $('dlgB').innerHTML = '<p>Todavía no terminaste ninguna misión. Acá van a aparecer tus resultados.</p>'; dlg.showModal(); return; }
  const dt = ts => new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  $('dlgB').innerHTML = `<p>Misiones: <b>${h.length}</b> · cumplidas: <b>${won.length}</b></p>
   <div class="stats">${nm.map(x => `<span>Mejor índice · ${dn(x.d, x.a)}</span><b>${x.b || '—'}</b>`).join('')}</div>
   <div class="hist">${h.slice(-8).reverse().map(x => `<div class="${x.won ? 'w' : 'l'}"><span>${dt(x.ts)}</span><span>${dn(x.diff, x.adv)}</span><b>${x.won ? 'Índice ' + x.rating : 'Fallida'}</b><span>${x.kills}/${x.total} Klingon</span></div>`).join('')}</div>`;
  dlg.showModal();
}

/* ---------- tutorial de la primera partida ---------- */
const TUT = [
  { hl: 'top', tab: 'mapa', t: () => `Tu misión: destruir los <b>${g.K9} Klingon</b> antes de que se acaben los <b>días</b>. Arriba ves dónde estás, la fecha y cuántos quedan.` },
  { hl: 'grid', tab: 'mapa', auto: () => !!(sel && sel.kind === 's'), t: () => 'Este es el <b>Mapa</b> del cuadrante; tu nave es el ícono verde. Tocá un <b>sector vacío</b> para ver el camino y lo que cuesta.' },
  { hl: 'ctx', tab: 'mapa', auto: () => st.mov > 0, t: () => 'Tocá <b>Mover aquí</b> (o el mismo sector otra vez) para navegar. Cada viaje gasta energía y tiempo.' },
  { hl: 'gal', auto: () => !WIDE.matches && tab === 'gal', t: () => 'En <b>Galaxia</b> están los 64 cuadrantes. Usá <b>Largo alcance</b> para escanear los vecinos y tocá uno para <b>viajar</b>. Probá abrir esa pestaña.' },
  { hl: 'main', tab: 'mapa', t: () => '<b>Cuidado con los escudos:</b> arrancan en 0. Antes de pelear tocá <b>Escudos</b> y pasales energía; si no, un Klingon te destruye en pocos disparos.' },
  { hl: 'grid', tab: 'mapa', t: () => 'Para atacar, tocá un Klingon: <b>Torpedo</b> apunta solo, <b>Apuntar</b> te deja elegir el rumbo viendo la trayectoria, y <b>Fásers</b> reparten energía.' },
  { hl: 'main', tab: 'mapa', last: true, t: () => 'Si te falta energía o torpedos, pegate a una <b>base estelar</b>. El menú ☰ tiene la ayuda completa. ¡Buena suerte, capitán!' }
];
function tutGo(n){ tutStep = n; const s = TUT[n]; if(s && s.tab && !WIDE.matches) setTab(s.tab); }
function tutEnd(){ tutStep = -1; cfg.tutDone = true; saveCfg(); app.dataset.hl = ''; $('tut').hidden = true; }
function renderTut(){
  const el = $('tut');
  if(tutStep < 0 || !g || g.over){ el.hidden = true; app.dataset.hl = ''; return; }
  while(TUT[tutStep] && TUT[tutStep].auto && TUT[tutStep].auto()) tutGo(tutStep + 1);
  if(tutStep >= TUT.length){ tutEnd(); return; }
  const s = TUT[tutStep]; el.hidden = false; app.dataset.hl = s.hl;
  if(s.hl === 'main' || s.hl === 'ctx') setTimeout(() => { try{ $(s.hl).scrollIntoView({ block: 'nearest' }); }catch(e){} }, 0);
  el.innerHTML = `<div><i>Tutorial ${tutStep + 1}/${TUT.length}</i> ${s.t()}</div><div class="tb"><button class="btn" type="button" data-tut="skip">Saltar</button><button class="btn go" type="button" data-tut="next">${s.last ? 'A jugar' : 'Siguiente'}</button></div>`;
}
$('tut').addEventListener('click', e => {
  const b = e.target.closest('button[data-tut]'); if(!b) return; ac(); sfx.blip();
  if(b.dataset.tut === 'skip' || tutStep >= TUT.length - 1) tutEnd(); else tutGo(tutStep + 1);
  render();
});
function begin(){
  $('ov').className = 'ov'; logEl.innerHTML = ''; lq = []; cur = null; sel = null; man = false; panel = null; aim = null; recorded = false; lastEntry = null;
  // si la misión arranca dentro de una zona de combate (escudos en 0), se abre el panel de escudos
  if(g.out.some(m => /Escudos peligrosamente bajos/.test(m.t))){ panel = 'she'; $('rShe').dataset.t = ''; }
  drain(); unread = 0; setTab('mapa'); render(); saveGame(); keepAwake(); amb.on();
}
function start(d){ diff = d; cfg.diff = d; saveCfg(); g = new Trek({ diff, adv: !!cfg.adv }); st = newStats(); tutStep = cfg.tutDone ? -1 : 0; sfx.ok(); begin(); }
function resume(){
  const sv = loadSave(); if(!sv){ start(diff); return; }
  diff = sv.diff; g = sv.t; st = sv.st; tutStep = -1; sfx.ok();
  g.out.push({ t: `Misión reanudada en el cuadrante ${region(g.Q1, g.Q2)}.`, k: 'info' }); begin();
}
$('ov').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]'); if(!b) return; ac();
  if(b.dataset.d === 'adv'){ cfg.adv = !cfg.adv; saveCfg(); showStart(); } else if(b.dataset.d === 'hist') showHist(); else if(b.dataset.d === 'resume') resume(); else if(+b.dataset.d < 0) showStart(); else start(+b.dataset.d);
});

/* ---------- menú ---------- */
const menu = $('menu'), dlg = $('dlg');
[menu, dlg].forEach(d => d.addEventListener('click', e => { if(e.target === d) d.close(); }));
const CRT_LABEL = { full: 'completa', soft: 'suave', off: 'no' };
function menuLabels(){
  $('bSnd').textContent = 'Sonido: ' + (sound ? 'sí' : 'no');
  $('bVib').textContent = 'Vibración: ' + (cfg.vib ? 'sí' : 'no');
  $('bAmb').textContent = 'Ambiente de puente: ' + (cfg.amb ? 'sí' : 'no');
  $('bCrt').textContent = 'Pantalla antigua: ' + CRT_LABEL[cfg.crt];
  $('bVib').hidden = !navigator.vibrate;
  $('bFull').hidden = !(document.fullscreenEnabled && !matchMedia('(display-mode: standalone)').matches);
  $('bFull').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
}
$('bMenu').onclick = () => { ac(); menuLabels(); menu.showModal(); };
$('menuX').onclick = () => menu.close();
$('bSnd').onclick = () => { sound = cfg.sound = !sound; saveCfg(); menuLabels(); if(!sound) amb.off(); else if(g && !g.over) amb.on(); sfx.blip(); };
$('bAmb').onclick = () => { cfg.amb = !cfg.amb; saveCfg(); menuLabels(); if(!cfg.amb) amb.off(); else if(g && !g.over) amb.on(); };
$('bVib').onclick = () => { cfg.vib = !cfg.vib; saveCfg(); menuLabels(); buzz(40); };
$('bCrt').onclick = () => { const o = ['soft','full','off']; cfg.crt = o[(o.indexOf(cfg.crt) + 1) % 3]; saveCfg(); crt.set(cfg.crt); menuLabels(); };
$('bFull').onclick = () => { try{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }catch(e){} menu.close(); };
$('bHelp').onclick = () => { menu.close(); $('dlgT').textContent = 'CÓMO SE JUEGA'; $('dlgB').innerHTML = HELP; dlg.showModal(); };
$('bHist').onclick = () => { menu.close(); showHist(); };
$('bTut').onclick = () => { menu.close(); if(g && !g.over){ tutGo(0); render(); } else { cfg.tutDone = false; saveCfg(); } };
$('dlgX').onclick = () => dlg.close();
$('bNew').onclick = () => { menu.close(); showStart(); };
$('bQuit').onclick = () => { menu.close(); if(g && !g.over && confirm('¿Renunciar al mando?')){ g.resign(); after(); } };
const HELP = `<p>Es una versión inventada: conserva las <b>reglas de Super Star Trek</b> (los Klingon se reubican cuando navegás, hay daños, bases y escudos) pero se maneja tocando.</p>
<p><b>Mapa.</b> Tocá un sector vacío para ver el camino y la energía que gasta, y tocalo otra vez (o «Mover aquí») para ir. Tocá un Klingon para dispararle un torpedo, con el rumbo calculado por la computadora, o fásers. Con <b>Apuntar</b> elegís vos el rumbo y la trayectoria se dibuja en el Mapa antes de disparar. Si el camino pasa por una estrella u otra nave, te detenés antes.</p>
<p><b>Galaxia.</b> Cada cuadrante muestra Klingon, bases y estrellas (por ejemplo <span style="color:#ff5d4d">1</span><span style="color:#79cbff">0</span>3). Solo se conocen los que escaneaste con el largo alcance. Tocá uno y «Viajar»: llegás al mismo sector.</p>
<p><b>Nave.</b> Energía, escudos, torpedos, tiempo y estado de cada sistema. <b>Registro</b>: el diario de a bordo; el último mensaje siempre se ve sobre los botones.</p>
<p><b>Fásers.</b> Repartís la energía entre los Klingon del cuadrante; cuanto más lejos, menos daño. Cada vez que disparás, ellos devuelven el fuego. Subí los escudos antes de pelear.</p>
<p><b>Reglas avanzadas</b> (opcional, en la pantalla de inicio). Los Klingon se acercan a vos en vez de cambiar de lugar al azar; hay <b>agujeros negros</b> (●) que te arrastran a otro cuadrante, te hacen perder tiempo y dañan la nave; y tenés <b>3 sondas</b>: tocá un cuadrante en la Galaxia y «Sonda» para ver ese cuadrante y todo el camino hasta el borde. Una base repone las sondas.</p>
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
document.addEventListener('visibilitychange', () => { if(document.hidden){ saveGame(); amb.off(); } else if(g && !g.over){ keepAwake(); amb.on(); } });
addEventListener('pagehide', saveGame);
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
window.__trek = { sfx, amb, out, get g(){ return g; }, get st(){ return st; }, start, render, after, setTab, get tab(){ return tab; } };
showStart();
})();
