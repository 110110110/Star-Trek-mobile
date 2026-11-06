/* Motor de la tercera versión: reglas de Super Star Trek (Leedom), sin la interfaz de texto. */
(function(root){
'use strict';
const int = Math.floor, fr = Math.fround;
const ii = x => Math.min(8, Math.floor(fr(x) + 1e-5));      // tolerancia para que un clic caiga justo en el sector
const iie = v => Math.floor(v + 1e-6);
const FNR = () => int(Math.random()*7.98 + 1.01);
const NAMES1 = ['ANTARES','RIGEL','PROCYON','VEGA','CANOPUS','ALTAIR','SAGITTARIUS','POLLUX'];
const NAMES2 = ['SIRIUS','DENEB','CAPELLA','BETELGEUSE','ALDEBARAN','REGULUS','ARCTURUS','SPICA'];
const ROMAN = [' I',' II',' III',' IV'];
const DEV = ['Motores warp','Sensores de corto alcance','Sensores de largo alcance','Control de fásers','Tubos de torpedos','Control de daños','Control de escudos','Computadora'];
const fmt = n => { const v = parseFloat(Number(n).toPrecision(6)); return String(Object.is(v,-0) ? 0 : v); };
function region(q1, q2, short){ let g = q2 <= 4 ? NAMES1[q1-1] : NAMES2[q1-1]; return short ? g : g + ROMAN[(q2-1)%4]; }

/* dirección (1 a 9) y distancia entre dos sectores, igual que la calculadora del original */
function dirdist(sr, sc, tr, tc){
  const x = tc - sc, a = sr - tr, ax = Math.abs(a), axx = Math.abs(x), q = (p, d) => d === 0 ? 0 : p / d;
  let c1, dir;
  const b1 = () => ax <= axx ? c1 + q(ax, axx) : c1 + q((ax-axx)+ax, ax);
  const b2 = () => ax >= axx ? c1 + q(axx, ax) : c1 + q((axx-ax)+axx, axx);
  if(x < 0){ if(a > 0){ c1 = 3; dir = b2(); } else { c1 = 5; dir = b1(); } }
  else if(a < 0){ c1 = 7; dir = b2(); }
  else if(x > 0){ c1 = 1; dir = b1(); }
  else if(a === 0){ c1 = 5; dir = b1(); }
  else { c1 = 1; dir = b1(); }
  if(dir >= 9) dir -= 8;
  return { dir, dist: Math.sqrt(x*x + a*a) };
}

function Trek(opts){
  opts = opts || {};
  const self = this;
  this.out = [];                       // mensajes {t, k}
  this.say = (t, k) => this.out.push({ t, k: k || 'info' });
  this.diff = opts.diff == null ? 1 : opts.diff;
  const C = [[0,0,0]]; for(let i=1;i<=10;i++) C.push([0,0,0]);
  C[3][1]=-1; C[2][1]=-1; C[4][1]=-1; C[4][2]=-1; C[5][2]=-1; C[6][2]=-1;
  C[1][2]=1; C[2][2]=1; C[6][1]=1; C[7][1]=1; C[8][1]=1; C[8][2]=1; C[9][2]=1;
  this.vec = c1 => { const f = c1 - int(c1), c = int(c1); return [C[c][1]+(C[c+1][1]-C[c][1])*f, C[c][2]+(C[c+1][2]-C[c][2])*f]; };
  this.reset();
}
Trek.prototype.reset = function(){
  const G = [], Z = [];
  for(let i=0;i<=9;i++){ G[i] = new Array(10).fill(0); Z[i] = new Array(10).fill(0); }
  this.G = G; this.Z = Z; this.D = [0,0,0,0,0,0,0,0,0]; this.K = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  this.T = int(Math.random()*20+20)*100; this.T0 = this.T;
  this.T9 = 25 + int(Math.random()*10);
  this.E0 = 3000; this.E = 3000; this.P0 = 10; this.P = 10; this.S = 0; this.S9 = 200 * [0.8,1,1.15][this.diff];
  this.D0 = 0; this.B9 = 0; this.K9 = 0; this.over = null; this.D4 = 0; this.G5 = 0; this.cond = 'VERDE';
  this.Q1 = FNR(); this.Q2 = FNR(); this.S1 = FNR(); this.S2 = FNR();
  for(let i=1;i<=8;i++) for(let j=1;j<=8;j++){
    let k3 = 0; const r1 = Math.random();
    if(r1 > .98){ k3 = 3; this.K9 += 3; } else if(r1 > .95){ k3 = 2; this.K9 += 2; } else if(r1 > .80){ k3 = 1; this.K9 += 1; }
    let b3 = 0; if(Math.random() > .96){ b3 = 1; this.B9++; }
    G[i][j] = k3*100 + b3*10 + FNR();
  }
  if(this.K9 > this.T9) this.T9 = this.K9 + 1;
  if(this.B9 === 0){
    if(G[this.Q1][this.Q2] < 200){ G[this.Q1][this.Q2] += 120; this.K9++; }
    this.B9 = 1; G[this.Q1][this.Q2] += 10; this.Q1 = FNR(); this.Q2 = FNR();
  }
  this.T9 += [6,0,-3][this.diff]; if(this.T9 <= this.K9) this.T9 = this.K9 + 1;
  this.K7 = this.K9; this.out = [];
  this.say(`ÓRDENES: destruir los ${this.K9} navíos Klingon que invadieron la galaxia antes de la fecha estelar ${this.T0 + this.T9} (${this.T9} días). Hay ${this.B9} base${this.B9 === 1 ? '' : 's'} estelar${this.B9 === 1 ? '' : 'es'} para reabastecerse.`, 'crew');
  this.enterQuadrant(true);
};
Trek.prototype.cell = function(r, c){ const R = Math.floor(r + .5), Cc = Math.floor(c + .5); return this.Q[R] && this.Q[R][Cc]; };
Trek.prototype.empty = function(){ let r, c; do{ r = FNR(); c = FNR(); }while(this.Q[r][c] !== '   '); return [r, c]; };
Trek.prototype.enterQuadrant = function(first){
  this.G5 = 0; this.D4 = .5*Math.random(); this.Z[this.Q1][this.Q2] = this.G[this.Q1][this.Q2];
  const nm = region(this.Q1, this.Q2);
  this.say(first ? `Misión iniciada en el cuadrante ${nm}.` : `Entrando al cuadrante ${nm}.`, 'info');
  const g = this.G[this.Q1][this.Q2];
  this.K3 = int(g*.01); this.B3 = int(g*.1) - 10*this.K3; this.S3 = g - 100*this.K3 - 10*this.B3;
  if(this.K3 !== 0){ this.say('ZONA DE COMBATE: ALERTA ROJA.', 'alert'); if(!(this.S > 200)) this.say('Escudos peligrosamente bajos.', 'warn'); }
  this.K = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  this.Q = []; for(let r=0;r<=8;r++){ this.Q[r] = []; for(let c=0;c<=8;c++) this.Q[r][c] = '   '; }
  this.Q[this.S1][this.S2] = '<*>';
  for(let i=1;i<=this.K3;i++){ const [r,c] = this.empty(); this.Q[r][c] = '+K+'; this.K[i] = [0,r,c,this.S9*(0.5+Math.random())]; }
  this.B4 = this.B5 = 0;
  if(this.B3 >= 1){ const [r,c] = this.empty(); this.Q[r][c] = '>!<'; this.B4 = r; this.B5 = c; }
  for(let i=1;i<=this.S3;i++){ const [r,c] = this.empty(); this.Q[r][c] = ' * '; }
  this.refresh();
};
/* atraque y condición (subrutina 6430) */
Trek.prototype.refresh = function(){
  let docked = false;
  for(let i=this.S1-1;i<=this.S1+1 && !docked;i++) for(let j=this.S2-1;j<=this.S2+1;j++){
    if(i<1||i>8||j<1||j>8) continue;
    if(this.Q[i][j] === '>!<'){ docked = true; break; }
  }
  const was = this.D0;
  if(docked){ this.D0 = 1; this.cond = 'ATRACADO'; this.E = this.E0; this.P = this.P0; this.S = 0; if(!was) this.say('Atracado. Escudos bajados, energía y torpedos repuestos.', 'good'); }
  else { this.D0 = 0; this.cond = this.K3 > 0 ? 'ROJO' : (this.E < this.E0*.1 ? 'AMARILLO' : 'VERDE'); }
};
Trek.prototype.stranded = function(){
  if(this.over) return;
  if(!(this.S + this.E > 10 && (this.E > 10 || this.D[7] === 0))){
    this.say('ERROR FATAL: varaste la nave en el espacio. No hay energía de maniobra y el control de escudos no puede derivar energía a los motores.', 'alert');
    this.finish(false, 'varado');
  }
};
Trek.prototype.finish = function(won, why){
  if(this.over) return;
  this.over = { won, why };
  if(won){
    this.say('¡FELICITACIONES, CAPITÁN! El último crucero Klingon que amenazaba a la Federación fue destruido.', 'good');
    this.over.rating = Math.round(1000*Math.pow(this.K7/(this.T - this.T0), 2));
    this.say(`Índice de eficiencia: ${this.over.rating}.`, 'good');
  } else {
    if(why === 'destruida') this.say('LA ENTERPRISE FUE DESTRUIDA. La Federación será conquistada.', 'alert');
    if(why === 'tiempo') this.say(`Es la fecha estelar ${fmt(this.T)}. Se acabó el tiempo.`, 'alert');
    if(why === 'corte') this.say('Tu mando fue revocado.', 'alert');
    if(why === 'renuncia') this.say('Renunciaste al mando.', 'alert');
    this.say(`Quedaban ${this.K9} cruceros Klingon al final de la misión.`, 'alert');
  }
};
Trek.prototype.klingonsFire = function(){
  if(this.K3 <= 0 || this.over) return;
  if(this.D0 !== 0){ this.say('Los escudos de la base estelar protegen a la Enterprise.', 'good'); return; }
  for(let i=1;i<=3;i++){
    const k = this.K[i]; if(k[3] <= 0) continue;
    const d = Math.sqrt((k[1]-this.S1)**2 + (k[2]-this.S2)**2);
    const h = int((k[3]/d)*(2+Math.random())); this.S -= h; k[3] = k[3]/(3+Math.random());
    this.say(`Impacto de ${h} unidades sobre la Enterprise desde el sector ${k[1]},${k[2]}.`, 'warn');
    if(this.S <= 0){ this.finish(false, 'destruida'); return; }
    this.say(`Escudos bajan a ${int(this.S)} unidades.`, 'warn');
    if(h < 20) continue;
    if(Math.random() > .6 || h/this.S <= .02) continue;
    const r1 = FNR(); this.D[r1] -= h/this.S + .5*Math.random();
    this.say(`Control de daños informa: ${DEV[r1-1]} dañado por el impacto.`, 'warn');
  }
};
Trek.prototype.maneuverEnergy = function(n){
  this.E = this.E - n - 10;
  if(this.E < 0){ this.say('El control de escudos aporta energía para completar la maniobra.', 'warn'); this.S += this.E; this.E = 0; if(this.S <= 0) this.S = 0; }
};
/* Navegación (2300-3870). Devuelve true si gastó el turno. */
Trek.prototype.warp = function(c1, w1){
  if(this.over) return false;
  if(c1 === 9) c1 = 1;
  if(!(c1 >= 1 && c1 < 9)){ this.say("Tte. Sulu informa: «¡Rumbo incorrecto, señor!»", 'crew'); return false; }
  if(this.D[1] < 0 && w1 > .2){ this.say('Los motores warp están dañados. Velocidad máxima: warp 0,2.', 'warn'); return false; }
  if(!(w1 > 0)) return false;
  if(w1 > 8){ this.say(`Ing. Scott informa: «¡Los motores no aguantan warp ${fmt(w1)}!»`, 'crew'); return false; }
  const n = int(w1*8+.5);
  if(this.E - n < 0){
    this.say(`Ingeniería informa: «Energía insuficiente para maniobrar a warp ${fmt(w1)}.»`, 'warn');
    if(!(this.S < n - this.E || this.D[7] < 0)) this.say(`Sala de deflectores: hay ${int(this.S)} unidades desplegadas en los escudos. Bajá los escudos para liberar energía.`, 'warn');
    return false;
  }
  for(let i=1;i<=this.K3;i++){
    const k = this.K[i]; if(k[3] === 0) continue;
    this.Q[k[1]][k[2]] = '   '; const [r,c] = this.empty(); k[1] = r; k[2] = c; this.Q[r][c] = '+K+';
  }
  this.klingonsFire(); if(this.over) return true;
  let d1 = 0; const d6 = w1 >= 1 ? 1 : w1; const fixed = [];
  for(let i=1;i<=8;i++){
    if(this.D[i] >= 0) continue;
    this.D[i] += d6;
    if(this.D[i] > -.1 && this.D[i] < 0){ this.D[i] = -.1; continue; }
    if(this.D[i] < 0) continue;
    fixed.push(DEV[i-1]);
  }
  if(fixed.length) this.say('Control de daños: reparado ' + fixed.join(', ') + '.', 'good');
  if(Math.random() <= .2){
    const r1 = FNR();
    if(Math.random() < .6){ this.D[r1] -= Math.random()*5+1; this.say(`Control de daños: ${DEV[r1-1]} dañado.`, 'warn'); }
    else { this.D[r1] += Math.random()*3+1; this.say(`Control de daños: mejora el estado de ${DEV[r1-1]}.`, 'good'); }
  }
  this.Q[ii(this.S1)][ii(this.S2)] = '   ';
  const [x1,x2] = this.vec(c1); const X = this.S1, Y = this.S2, Q4 = this.Q1, Q5 = this.Q2;
  let out = false;
  for(let i=1;i<=n;i++){
    this.S1 = fr(this.S1 + x1); this.S2 = fr(this.S2 + x2);
    if(this.S1 < 1 || this.S1 >= 9 || this.S2 < 1 || this.S2 >= 9){ out = true; break; }
    if(this.Q[ii(this.S1)][ii(this.S2)] === '   ') continue;
    this.S1 = ii(this.S1 - x1); this.S2 = ii(this.S2 - x2);
    this.say(`Motores warp detenidos en el sector ${this.S1},${this.S2} por mala navegación: había un obstáculo.`, 'warn'); break;
  }
  const tick = () => { let t8 = 1; if(w1 < 1) t8 = .1*int(10*w1); this.T += t8; if(this.T > this.T0 + this.T9){ this.finish(false, 'tiempo'); return true; } return false; };
  if(!out){
    this.S1 = ii(this.S1); this.S2 = ii(this.S2); this.Q[this.S1][this.S2] = '<*>'; this.maneuverEnergy(n);
    if(tick()) return true; this.refresh(); this.stranded(); return true;
  }
  const x = 8*this.Q1 + X + n*x1, y = 8*this.Q2 + Y + n*x2;
  this.Q1 = iie(x/8); this.Q2 = iie(y/8); this.S1 = iie(x - this.Q1*8); this.S2 = iie(y - this.Q2*8);
  if(this.S1 === 0){ this.Q1 -= 1; this.S1 = 8; } if(this.S2 === 0){ this.Q2 -= 1; this.S2 = 8; }
  let x5 = 0;
  if(this.Q1 < 1){ x5 = 1; this.Q1 = 1; this.S1 = 1; } if(this.Q1 > 8){ x5 = 1; this.Q1 = 8; this.S1 = 8; }
  if(this.Q2 < 1){ x5 = 1; this.Q2 = 1; this.S2 = 1; } if(this.Q2 > 8){ x5 = 1; this.Q2 = 8; this.S2 = 8; }
  if(x5){
    this.say('Tte. Uhura informa un mensaje del Comando de la Flota: «Se DENIEGA el permiso para cruzar el perímetro galáctico. Apaguen los motores.»', 'crew');
    this.say(`Ing. Scott informa: «Motores detenidos en el sector ${this.S1},${this.S2} del cuadrante ${this.Q1},${this.Q2}.»`, 'crew');
    if(this.T > this.T0 + this.T9){ this.finish(false, 'tiempo'); return true; }
  }
  if(8*this.Q1 + this.Q2 === 8*Q4 + Q5){
    if(this.Q[this.S1][this.S2] !== '   '){            // el original pisaba lo que hubiera: acá se busca el hueco más cercano
      let best = null, bd = 1e9;
      for(let r=1;r<=8;r++) for(let c=1;c<=8;c++) if(this.Q[r][c] === '   '){ const d = (r-this.S1)**2 + (c-this.S2)**2; if(d < bd){ bd = d; best = [r,c]; } }
      if(best){ this.S1 = best[0]; this.S2 = best[1]; }
    }
    this.Q[this.S1][this.S2] = '<*>'; this.maneuverEnergy(n); if(tick()) return true; this.refresh(); this.stranded(); return true;
  }
  this.T += 1; this.maneuverEnergy(n);
  if(this.T > this.T0 + this.T9){ this.finish(false, 'tiempo'); return true; }
  this.enterQuadrant(false); this.stranded(); return true;
};
Trek.prototype.phasers = function(x){
  if(this.over) return false;
  if(this.D[4] < 0){ this.say('Los fásers están inoperativos.', 'warn'); return false; }
  if(this.K3 <= 0){ this.say("Oficial científico Spock informa: «Los sensores no muestran naves enemigas en este cuadrante.»", 'crew'); return false; }
  if(this.D[8] < 0) this.say('La falla de la computadora reduce la precisión.', 'warn');
  if(!(x > 0)) return false;
  if(this.E - x < 0){ this.say('No hay tanta energía disponible.', 'warn'); return false; }
  this.E -= x; if(this.D[7] < 0) x = x*Math.random();
  const h1 = int(x/this.K3);
  this.say(`Fásers disparados con ${int(x)} unidades.`, 'info');
  for(let i=1;i<=3;i++){
    const k = this.K[i]; if(k[3] <= 0) continue;
    const d = Math.sqrt((k[1]-this.S1)**2 + (k[2]-this.S2)**2);
    const h = int((h1/d)*(Math.random()+2));
    if(!(h > .15*k[3])){ this.say(`Los sensores no muestran daño al enemigo en ${k[1]},${k[2]}.`, 'info'); continue; }
    k[3] -= h; this.say(`Impacto de ${h} unidades sobre el Klingon del sector ${k[1]},${k[2]}.`, 'good');
    if(k[3] <= 0){
      this.say('*** KLINGON DESTRUIDO ***', 'good'); this.K3--; this.K9--; this.Q[k[1]][k[2]] = '   ';
      k[3] = 0; this.G[this.Q1][this.Q2] -= 100; this.Z[this.Q1][this.Q2] = this.G[this.Q1][this.Q2];
      if(this.K9 <= 0){ this.finish(true); return true; }
    } else this.say(`Los sensores indican ${int(k[3])} unidades restantes.`, 'info');
  }
  this.klingonsFire(); this.refresh(); this.stranded(); return true;
};
Trek.prototype.torpedo = function(c1){
  if(this.over) return false;
  if(this.P <= 0){ this.say('Se agotaron los torpedos fotónicos.', 'warn'); return false; }
  if(this.D[5] < 0){ this.say('Los tubos de torpedos no funcionan.', 'warn'); return false; }
  if(c1 === 9) c1 = 1;
  if(!(c1 >= 1 && c1 < 9)){ this.say("Alférez Chekov informa: «¡Rumbo incorrecto, señor!»", 'crew'); return false; }
  const [x1,x2] = this.vec(c1); this.E -= 2; this.P -= 1; let x = this.S1, y = this.S2;
  this.track = [];
  for(;;){
    x += x1; y += x2; const x3 = int(x+.5), y3 = int(y+.5);
    if(x3 < 1 || x3 > 8 || y3 < 1 || y3 > 8){ this.say('El torpedo erró el blanco.', 'info'); this.klingonsFire(); break; }
    this.track.push([x3, y3]);
    const c = this.cell(x, y);
    if(c === '   ') continue;
    if(c === '+K+'){
      this.say('*** KLINGON DESTRUIDO ***', 'good'); this.K3--; this.K9--; if(this.K9 <= 0){ this.Q[x3][y3] = '   '; this.finish(true); return true; }
      let i; for(i=1;i<=3;i++) if(x3 === this.K[i][1] && y3 === this.K[i][2]) break; if(i > 3) i = 3; this.K[i][3] = 0;
    } else if(c === ' * '){ this.say(`La estrella en ${x3},${y3} absorbió la energía del torpedo.`, 'info'); this.klingonsFire(); break; }
    else if(c === '>!<'){
      this.say('*** BASE ESTELAR DESTRUIDA ***', 'alert'); this.B3--; this.B9--;
      if(this.B9 > 0 || this.K9 > this.T - this.T0 - this.T9){ this.say('El Comando de la Flota revisa tu foja para evaluar una corte marcial.', 'warn'); this.D0 = 0; }
      else { this.say('¡Se acabó, capitán! Queda relevado del mando y sentenciado a 99 fechas estelares de trabajos forzados en Cygnus 12.', 'alert'); this.finish(false, 'corte'); return true; }
    } else continue;
    this.Q[x3][y3] = '   '; this.G[this.Q1][this.Q2] = this.K3*100 + this.B3*10 + this.S3; this.Z[this.Q1][this.Q2] = this.G[this.Q1][this.Q2];
    this.klingonsFire(); break;
  }
  this.refresh(); this.stranded(); return true;
};
Trek.prototype.shields = function(x){
  if(this.over) return false;
  if(this.D[7] < 0){ this.say('El control de escudos está inoperable.', 'warn'); return false; }
  if(x < 0 || this.S === x){ return false; }
  if(x > this.E + this.S){ this.say("Control de escudos: «Esto no es la tesorería de la Federación.»", 'crew'); return false; }
  this.E = this.E + this.S - x; this.S = x; this.say(`Escudos ahora en ${int(this.S)} unidades.`, 'info'); this.stranded(); return true;
};
Trek.prototype.repairEstimate = function(){
  let d3 = 0; for(let i=1;i<=8;i++) if(this.D[i] < 0) d3 += .1;
  if(d3 === 0) return 0; d3 += this.D4; if(d3 >= 1) d3 = .9; return .01*int(100*d3);
};
Trek.prototype.repair = function(){
  if(this.over || this.D0 === 0) return false;
  const est = this.repairEstimate(); if(!est) return false;
  for(let i=1;i<=8;i++) if(this.D[i] < 0) this.D[i] = 0;
  this.T += est + .1; this.say(`Técnicos reparan la nave: se usaron ${fmt(est + .1)} fechas estelares.`, 'good');
  if(this.T > this.T0 + this.T9) this.finish(false, 'tiempo'); return true;
};
Trek.prototype.resign = function(){ this.finish(false, 'renuncia'); };
Trek.prototype.lrsAvailable = function(){ return this.D[3] >= 0; };
Trek.prototype.lrs = function(){
  if(this.D[3] < 0){ this.say('Los sensores de largo alcance están inoperables.', 'warn'); return null; }
  const rows = [];
  for(let i=this.Q1-1;i<=this.Q1+1;i++){ const r = []; for(let j=this.Q2-1;j<=this.Q2+1;j++){ if(i>0&&i<9&&j>0&&j<9){ r.push(this.G[i][j]); this.Z[i][j] = this.G[i][j]; } else r.push(-1); } rows.push(r); }
  return rows;
};

/* vistas previas para la interfaz (no cambian el estado) */
Trek.prototype.previewMove = function(c1, n){
  const [x1,x2] = this.vec(c1); let s1 = this.S1, s2 = this.S2; const cells = []; let blocked = null, exit = false;
  for(let i=1;i<=n;i++){
    s1 = fr(s1 + x1); s2 = fr(s2 + x2);
    if(s1 < 1 || s1 >= 9 || s2 < 1 || s2 >= 9){ exit = true; break; }
    const r = ii(s1), c = ii(s2);
    if(this.Q[r][c] !== '   '){ blocked = [r,c]; break; }
    cells.push([r,c]);
  }
  return { cells, blocked, exit };
};
Trek.prototype.previewTorpedo = function(c1){
  const [x1,x2] = this.vec(c1); let x = this.S1, y = this.S2; const cells = []; let hit = null;
  for(;;){
    x += x1; y += x2; const r = int(x+.5), c = int(y+.5);
    if(r < 1 || r > 8 || c < 1 || c > 8) break;
    cells.push([r,c]); const q = this.Q[r][c];
    if(q !== '   '){ hit = { r, c, q }; break; }
  }
  return { cells, hit };
};

/* guardado: el estado es solo datos (las funciones del objeto no se serializan) */
Trek.prototype.snapshot = function(){ return JSON.stringify(this); };
Trek.restore = function(json, diff){
  const d = JSON.parse(json), t = new Trek({ diff: diff });
  if(!d || !Array.isArray(d.Q) || !Array.isArray(d.G) || typeof d.E !== 'number' || typeof d.T !== 'number') throw new Error('guardado inválido');
  Object.keys(d).forEach(k => { if(typeof t[k] !== 'function') t[k] = d[k]; });
  t.out = [];
  return t;
};

root.Trek = Trek; root.TrekUtil = { dirdist, region, fmt, DEV, ii };
if(typeof module !== 'undefined') module.exports = { Trek, TrekUtil: root.TrekUtil };
})(typeof window !== 'undefined' ? window : globalThis);
