/* =========================================================
   SHADOW — le noyau du mode papa (l'IA de film)
   Plus de visage dessiné : une présence.
   - Une sphère de particules en 3D qui tourne lentement, un cœur lumineux, des anneaux de mesure,
     une couronne de fréquences qui suit le VRAI son de sa voix (analyseur) — et ta voix quand il écoute.
   - Il réfléchit : tout s'accélère, des satellites tournent autour du cœur. Il dort : tout ralentit et s'éteint.
   - Autour, l'affichage de bord : heure, séance, cerveau (maison / nuage), temps de réponse, voix,
     météo, notes, temps d'écran de l'enfant ; et en bas la console (ce que tu dis, ce qu'il répond).
   - Une séquence d'allumage (et son son), une extinction.
   Tout est dessiné dans le téléphone (canvas), à 60 images par seconde (30 sur un téléphone lent).
   ========================================================= */
'use strict';

const NOYAU = (() => {
  const hud = document.getElementById('papa-hud'), cv = document.getElementById('noyau');
  if (!hud || !cv || !cv.getContext) return { allume() {}, eteint() {}, entendu() {}, dit() {} };
  const ctx = cv.getContext('2d');
  const lite = () => document.body.classList.contains('lite');
  let W = 0, dpr = 1, raf = 0, last = 0, rot = 0, ringA = 0, ringB = 0, boot = 0, fr = 0, debut = 0;
  let lvl = 0;
  const spec = new Float32Array(64);
  let fbuf = null, tbuf = null;

  /* ---------- les particules (sphère de Fibonacci) ---------- */
  let P = [];
  function particules(n) {
    P = [];
    const g = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
      P.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, s: Math.random() * 6.283, k: 0.88 + Math.random() * 0.24 });
    }
  }
  function taille() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(lite() ? 1.5 : 2, window.devicePixelRatio || 1);
    W = Math.max(200, Math.round(r.width * dpr));
    cv.width = W; cv.height = W;
    particules(lite() ? 170 : 420);
  }
  window.addEventListener('resize', () => { if (!hud.hidden) taille(); });

  /* ---------- l'état (lu sur le visage normal, qui reste le chef d'orchestre) ---------- */
  function etat() {
    const f = document.getElementById('face');
    const c = f ? f.classList : { contains: () => false };
    if (c.contains('sleep')) return 'sleep';
    if (c.contains('think')) return 'think';
    if (voice.speaking || c.contains('talk')) return 'talk';
    if (c.contains('hearing')) return 'hear';
    if (c.contains('oops')) return 'oops';
    if (c.contains('happy') || c.contains('laugh') || c.contains('proud')) return 'happy';
    return 'idle';
  }
  const LIB = { sleep: 'VEILLE', think: 'ANALYSE', talk: 'RÉPONSE', hear: 'ÉCOUTE', oops: 'ANOMALIE', happy: 'OK', idle: 'EN ATTENTE' };

  // le niveau du son : sa vraie voix (analyseur de la voix de la maison), ou ta voix (micro), ou une imitation
  function niveau(e, now) {
    let cible = 0;
    const an = VOIXMAISON.an;
    if (e === 'talk' && an && voice._cur) {
      if (!fbuf || fbuf.length !== an.frequencyBinCount) { fbuf = new Uint8Array(an.frequencyBinCount); tbuf = new Uint8Array(an.fftSize); }
      an.getByteTimeDomainData(tbuf);
      let s = 0; for (let i = 0; i < tbuf.length; i++) { const x = (tbuf[i] - 128) / 128; s += x * x; }
      cible = Math.min(1, Math.sqrt(s / tbuf.length) * 4.5);
      an.getByteFrequencyData(fbuf);
      for (let i = 0; i < 64; i++) spec[i] = spec[i] * 0.55 + (fbuf[Math.floor(i * fbuf.length * 0.7 / 64)] / 255) * 0.45;
    } else if (e === 'talk') { // voix du téléphone : on n'a pas le son, on l'imite
      cible = 0.3 + 0.4 * Math.abs(Math.sin(now * 0.011)) * (0.6 + 0.4 * Math.random());
      for (let i = 0; i < 64; i++) spec[i] = spec[i] * 0.7 + Math.random() * cible * (1 - i / 90) * 0.3;
    } else if (e === 'hear') {
      const m = OREILLES.meter ? OREILLES.meter() : null;
      const lv = m ? Math.max(0, Math.min(1, (m.level - m.noise) / Math.max(0.02, m.noise * 6 + 0.02))) : 0;
      cible = lv * 0.8;
      for (let i = 0; i < 64; i++) spec[i] = spec[i] * 0.75 + lv * (0.3 + 0.7 * Math.random()) * (1 - i / 100) * 0.25;
    } else for (let i = 0; i < 64; i++) spec[i] *= 0.9;
    lvl = lvl * 0.8 + cible * 0.2;
  }

  /* ---------- le dessin ---------- */
  let rate = 0;
  function image(now) {
    raf = requestAnimationFrame(image);
    if (hud.hidden || document.hidden) return;
    try { dessin(now); } catch (err) { if (!rate++) console.warn('noyau', err); } // un imprévu de dessin : on saute l'image, sans alerte
  }
  function dessin(now) {
    if (lite() && (fr++ & 1)) return; // téléphone lent : 30 images par seconde
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const e = etat(); niveau(e, now);
    const t = now / 1000, C = W / 2, R = W * 0.25;
    // (l'horloge de l'image peut être un peu avant le début de l'allumage : on reste entre 0 et 1)
    const b = boot ? Math.max(0, Math.min(1, (now - boot) / 1700)) : 1, ease = 1 - Math.pow(1 - b, 3);
    const col = e === 'oops' ? '255,110,60' : '255,181,71', chaud = e === 'oops' ? '255,200,170' : '255,238,205';
    const vit = e === 'think' ? 1.5 : e === 'talk' ? 0.42 : e === 'sleep' ? 0.03 : e === 'hear' ? 0.28 : 0.16;
    rot += vit * dt; ringA += (e === 'think' ? 0.9 : 0.06) * dt; ringB -= (e === 'think' ? 1.4 : 0.11) * dt;
    const dim = e === 'sleep' ? 0.3 : 1;
    ctx.clearRect(0, 0, W, W);

    // le halo
    const g = ctx.createRadialGradient(C, C, 0, C, C, W * 0.5);
    g.addColorStop(0, `rgba(${col},${((0.14 + lvl * 0.22) * dim * ease).toFixed(3)})`);
    g.addColorStop(0.42, `rgba(${col},${(0.035 * dim).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);

    // la sphère de particules
    const cy = Math.cos(rot), sy = Math.sin(rot), tilt = 0.38 + 0.08 * Math.sin(t * 0.3), ct = Math.cos(tilt), st = Math.sin(tilt);
    const gonfle = boot ? 1 + (1 - ease) * 2.4 : 1;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const x = p.x * cy - p.z * sy, z = p.x * sy + p.z * cy, y = p.y;
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      const onde = lvl * 0.24 * Math.sin(p.s + t * 7 + y * 5) + (e === 'think' ? 0.06 * Math.sin(t * 5 + p.s * 3) : 0) + 0.015 * Math.sin(t * 1.3 + p.s);
      const rr = R * p.k * (1 + onde) * gonfle;
      const persp = 1 / (1.9 - z2 * 0.6);
      const px = C + x * rr * persp * 1.25, py = C + y2 * rr * persp * 1.25;
      const prof = (z2 + 1) / 2;
      const a = (0.18 + 0.82 * prof) * dim * ease;
      const sz = (0.7 + 1.6 * prof) * dpr * (1 + lvl * 0.5);
      ctx.fillStyle = `rgba(${prof > 0.72 ? chaud : col},${a.toFixed(3)})`;
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }

    // le cœur
    const cr = Math.max(0.5, W * (0.045 + lvl * 0.04 + 0.006 * Math.sin(t * 2.2)) * (e === 'sleep' ? 0.6 : 1) * ease);
    const gc = ctx.createRadialGradient(C, C, 0, C, C, cr * 3.2);
    gc.addColorStop(0, `rgba(255,250,240,${(0.95 * dim).toFixed(3)})`);
    gc.addColorStop(0.25, `rgba(${chaud},${(0.75 * dim).toFixed(3)})`);
    gc.addColorStop(0.6, `rgba(${col},${(0.25 * dim).toFixed(3)})`);
    gc.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(C, C, cr * 3.2, 0, 6.283); ctx.fill();

    // il réfléchit : trois satellites autour du cœur
    if (e === 'think') {
      for (let k = 0; k < 3; k++) {
        const an = t * (2.4 + k * 0.7) + k * 2.09, rx = R * (0.42 + k * 0.1);
        ctx.fillStyle = `rgba(${chaud},0.9)`; ctx.beginPath(); ctx.arc(C + Math.cos(an) * rx, C + Math.sin(an) * rx * 0.55, 2.2 * dpr, 0, 6.283); ctx.fill();
      }
    }

    // la couronne de fréquences (sa voix, ou la tienne)
    const r0 = R * 1.42;
    ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = `rgba(${col},${(0.8 * ease * dim).toFixed(3)})`; ctx.beginPath();
    for (let i = 0; i < 128; i++) {
      const j = i < 64 ? i : 127 - i;
      const ang = i / 128 * 6.283 - 1.5708;
      const L = W * 0.004 + spec[j] * W * 0.1 * (0.6 + lvl);
      ctx.moveTo(C + Math.cos(ang) * r0, C + Math.sin(ang) * r0);
      ctx.lineTo(C + Math.cos(ang) * (r0 + L), C + Math.sin(ang) * (r0 + L));
    }
    ctx.stroke();

    // les anneaux de mesure
    const r1 = R * 1.72;
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = `rgba(${col},${(0.42 * ease * dim).toFixed(3)})`; ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const ang = i / 90 * 6.283 + ringA, l = i % 15 === 0 ? W * 0.022 : i % 5 === 0 ? W * 0.012 : W * 0.006;
      ctx.moveTo(C + Math.cos(ang) * r1, C + Math.sin(ang) * r1);
      ctx.lineTo(C + Math.cos(ang) * (r1 + l), C + Math.sin(ang) * (r1 + l));
    }
    ctx.stroke();
    const r2 = R * 1.86;
    ctx.lineWidth = 2.2 * dpr; ctx.strokeStyle = `rgba(${col},${(0.55 * ease * dim).toFixed(3)})`;
    [[0, 0.7], [2.2, 1.25], [4.1, 0.35]].forEach(([d, l]) => { ctx.beginPath(); ctx.arc(C, C, r2, ringB + d, ringB + d + l * (e === 'think' ? 1.5 : 1)); ctx.stroke(); });
    const r3 = R * 1.97;
    ctx.lineWidth = 1 * dpr; ctx.strokeStyle = `rgba(${col},${(0.16 * ease * dim).toFixed(3)})`; ctx.beginPath(); ctx.arc(C, C, r3, 0, 6.283); ctx.stroke();
    const cm = t * (e === 'think' ? 2.2 : 0.55);
    for (let k = 0; k < 14; k++) { // la comète
      const an = cm - k * 0.035;
      ctx.fillStyle = `rgba(${chaud},${((1 - k / 14) * 0.85 * ease * dim).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(C + Math.cos(an) * r3, C + Math.sin(an) * r3, (2.4 - k * 0.13) * dpr, 0, 6.283); ctx.fill();
    }
    // il écoute : un balayage de radar
    if (e === 'hear') {
      const a0 = t * 2.6;
      const gr = ctx.createRadialGradient(C, C, R * 0.2, C, C, r1);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(1, `rgba(${col},0.13)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, r1, a0, a0 + 0.5); ctx.closePath(); ctx.fill();
    }
    // l'étiquette d'état
    if (lab && lab.textContent !== LIB[e]) { lab.textContent = LIB[e]; hud.dataset.etat = e; }
  }

  /* ---------- l'affichage de bord ---------- */
  const $h = id => document.getElementById(id);
  const lab = $h('hud-etat');
  const deux = n => String(n).padStart(2, '0');
  function bord() {
    if (hud.hidden) return;
    const d = new Date();
    $h('hud-heure').textContent = `${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`;
    $h('hud-date').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    const s = Math.floor((Date.now() - debut) / 1000);
    $h('hud-session').textContent = `SÉANCE ${deux(Math.floor(s / 60))}:${deux(s % 60)}`;
    const pret = AI.ready(), loc = pret && AI.cfg && AI.cfg().local;
    $h('hud-cerveau').textContent = !pret ? 'HORS LIGNE' : loc ? 'MAISON' : 'NUAGE';
    $h('hud-cerveau').className = pret ? '' : 'alerte';
    const bt = typeof brainTimes !== 'undefined' && brainTimes.length ? brainTimes.slice(-5) : [];
    $h('hud-latence').textContent = bt.length ? `${(bt.reduce((a, b) => a + b, 0) / bt.length / 1000).toFixed(1)} s` : '—';
    const pv = VOIXMAISON.usable() ? (VOIXMAISON.papa() || 'tom') : 'téléphone';
    $h('hud-voix').textContent = pv.toUpperCase();
    $h('hud-micro').textContent = OREILLES.listening && OREILLES.listening() ? 'ACTIF' : 'VEILLE';
    const met = (ECRAN.meteoFact && ECRAN.meteoFact()) || '';
    const deg = met.match(/-?\d+\s?°/);
    $h('hud-meteo').textContent = deg ? deg[0].replace(/\s/, '') : '—';
    $h('hud-notes').textContent = String((S.papa && S.papa.notes || []).length);
    const k = dayKey();
    $h('hud-enfant').textContent = `${(S.playLog && S.playLog[k]) || 0} MIN`;
    $h('hud-enfant-nom').textContent = (S.settings && S.settings.video) || !S.prenom ? 'ENFANT' : S.prenom.toUpperCase();
    const up = typeof upcoming === 'function' ? upcoming(30)[0] : null;
    $h('hud-agenda').textContent = up ? `${up.e.text.toUpperCase().slice(0, 22)} · J${up.days ? `-${up.days}` : ''}` : '—';
  }
  setInterval(bord, 1000);

  /* ---------- la console : ce que tu dis, ce qu'il répond (tapé au rythme de la voix) ---------- */
  const cons = $h('hud-console');
  let frappe = null;
  function ligne(cls, texte, tape) {
    if (!cons) return;
    const der = cons.lastElementChild;
    if (der && (der._plein || der.textContent) === String(texte)) return; // la même phrase deux fois : une seule ligne
    const p = document.createElement('p'); p.className = cls;
    cons.appendChild(p);
    while (cons.children.length > 4) cons.removeChild(cons.firstChild);
    const tx = String(texte);
    if (!tape || lite()) { p.textContent = tx; return; }
    let i = 0;
    if (frappe) clearInterval(frappe);
    // la phrase d'avant s'écrit d'un coup (on ne laisse jamais une phrase à moitié)
    cons.querySelectorAll('p.tape').forEach(q => { if (q !== p) { q.textContent = q._plein || q.textContent; q.classList.remove('tape'); } });
    p._plein = tx;
    p.classList.add('tape');
    frappe = setInterval(() => { i = Math.min(tx.length, i + 2); p.textContent = tx.slice(0, i); if (i >= tx.length) { clearInterval(frappe); frappe = null; p.classList.remove('tape'); } }, 28);
  }
  function entendu(t) { if (!hud.hidden && t) ligne('q', `› ${t}`); }
  function dit(t) { if (!hud.hidden && t) ligne('a', voice.clean ? voice.clean(t) : t, true); }
  // tout ce qu'il dit en mode papa s'écrit dans la console (les bulles d'enfant sont cachées)
  const parler = voice.say.bind(voice);
  voice.say = function (t) { if (typeof PAPA !== 'undefined' && PAPA.on) dit(anonymize(String(t))); return parler(t); };

  /* ---------- les sons d'allumage et d'extinction ---------- */
  function son(kind) {
    if (!S.settings.sound) return;
    let c; try { c = fx.audio(); } catch (e) { return; }
    const t = c.currentTime + 0.02, out = c.createGain(); out.gain.value = 0.9; out.connect(c.destination);
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.connect(g); g.connect(out);
    if (kind === 'allume') {
      o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(230, t + 1.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.start(t); o.stop(t + 1.7);
      // le souffle qui monte
      const nb = c.createBuffer(1, Math.round(c.sampleRate * 1.4), c.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const n = c.createBufferSource(); n.buffer = nb;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 1.3);
      const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.05, t + 1.1); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(t); n.stop(t + 1.45);
      // le carillon « en ligne »
      [[880, 0], [1320, 0.09], [1760, 0.18]].forEach(([f, d]) => {
        const s = c.createOscillator(), sg = c.createGain(); s.type = 'sine'; s.frequency.value = f; s.connect(sg); sg.connect(out);
        sg.gain.setValueAtTime(0.0001, t + 1.35 + d); sg.gain.exponentialRampToValueAtTime(0.05, t + 1.4 + d); sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 + d);
        s.start(t + 1.35 + d); s.stop(t + 2.7 + d);
      });
    } else {
      o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
      o.start(t); o.stop(t + 0.7);
    }
  }

  /* ---------- allumer / éteindre ---------- */
  async function allume() {
    hud.hidden = false; hud.classList.remove('off'); hud.classList.add('boot');
    debut = Date.now();
    taille(); bord();
    if (cons) cons.innerHTML = '';
    boot = performance.now();
    if (!raf) raf = requestAnimationFrame(image);
    son('allume');
    const pret = AI.ready(), loc = pret && AI.cfg && AI.cfg().local;
    const etapes = [
      'AUTHENTIFICATION PAPA ........ OK',
      `NOYAU COGNITIF ........ ${!pret ? 'HORS LIGNE' : loc ? 'EN LIGNE · MAISON' : 'EN LIGNE · NUAGE'}`,
      `SYNTHÈSE VOCALE ........ ${(VOIXMAISON.usable() ? (VOIXMAISON.papa() || 'tom') : 'téléphone').toUpperCase()}`,
    ];
    for (const e of etapes) { ligne('sys', e); await new Promise(r => setTimeout(r, lite() ? 120 : 380)); }
    setTimeout(() => hud.classList.remove('boot'), 900);
  }
  function eteint() {
    if (hud.hidden) return Promise.resolve();
    son('eteint');
    hud.classList.add('off');
    return new Promise(r => setTimeout(() => { hud.hidden = true; hud.classList.remove('off'); r(); }, 520));
  }
  // toucher le noyau = toucher le visage (réveil, interruption…)
  hud.addEventListener('click', e => { if (e.target.closest('button, a')) return; const fw = document.getElementById('face-wrap'); if (fw) fw.click(); });

  return { allume, eteint, entendu, dit };
})();
