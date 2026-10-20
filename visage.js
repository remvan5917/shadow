/* =========================================================
   SHADOW — le visage vivant
   - la bouche prend la forme des sons pendant qu'il parle (a, o, i, m…) ;
   - son visage suit ce qu'il dit (surpris, rieur, câlin, fier, perplexe…) ;
   - de petites bulles sortent de sa tête (cœurs, étoiles, « ? », « Z », notes) ;
   - quand il attend, il fait de petits gestes (il penche la tête, cligne de l'œil, bâille…) ;
   - le soir, ses paupières sont plus lourdes ;
   - trois petites tapes sur l'écran : ça le chatouille !
   Utilise face, voice, say, fx, dlg… de app.js (au moment où il s'en sert).
   ========================================================= */
'use strict';

const VISAGE = (() => {
  /* ---------- la bouche qui parle ---------- */
  // forme de la bouche pour la lettre n° i du texte (on regarde aussi les lettres d'après : « ou », « an »…)
  function shape(text, i) {
    const c = text[i] || ' ';
    const two = text.substr(i, 2);
    if (/[\s,.;:!?…]/.test(c)) return 'X';
    if (/^(ou|au|on|om)$/.test(two) || /[oôuûù]/.test(c)) return 'O';
    if (/^(an|am|en|em)$/.test(two) || /[aàâ]/.test(c)) return 'A';
    if (/[iîïyé]/.test(c)) return 'I';
    if (/[eèêë]/.test(c)) return 'E';
    if (/[mbp]/.test(c)) return 'M';
    if (/[fv]/.test(c)) return 'F';
    return 'E';
  }
  let tl = null, tick = null, bars = [];
  setTimeout(() => { bars = [...document.querySelectorAll('#face .vbar')]; }, 0);
  // il calcule à l'avance quand chaque lettre sera dite (avec de petites pauses aux virgules et aux points)
  function speak(text, rate) {
    quiet();
    if (!face.el || !text) return;
    const t = String(text).toLowerCase();
    const per = 1000 / (14.5 * (rate || 1)); // à peu près 14 lettres par seconde
    const at = [];
    let ms = 0;
    for (let i = 0; i < t.length; i++) {
      at.push(ms);
      ms += per;
      if (/[,;:]/.test(t[i])) ms += 170;
      else if (/[.!?…]/.test(t[i])) ms += 330;
    }
    tl = { t, at, t0: performance.now() };
    face.el.classList.add('vis');
    let last = '';
    tick = setInterval(() => {
      if (!tl) return;
      const now = performance.now() - tl.t0;
      let i = 0;
      while (i < tl.at.length - 1 && tl.at[i + 1] <= now) i++;
      const v = now > ms + 200 ? 'X' : shape(tl.t, i);
      if (v !== last) { last = v; face.el.setAttribute('data-vis', v); }
      // les barres de la voix : hautes sur les voyelles ouvertes, basses sur les « m », plates dans les silences
      const open = { A: 1, O: 0.85, E: 0.65, I: 0.55, F: 0.4, M: 0.2, X: 0.08 }[v] || 0.5;
      for (let k = 0; k < bars.length; k++) {
        const mid = 1 - Math.abs(k - (bars.length - 1) / 2) / bars.length; // plus haut au centre
        bars[k].style.transform = `scaleY(${Math.max(0.08, open * mid * (0.55 + Math.random() * 0.6)).toFixed(2)})`;
      }
    }, 70);
  }
  // le navigateur dit « je commence le mot n° charIndex » : on se recale dessus
  function sync(charIndex) {
    if (!tl || charIndex === undefined || tl.at[charIndex] === undefined) return;
    tl.t0 = performance.now() - tl.at[charIndex];
  }
  function quiet() {
    clearInterval(tick); tick = null; tl = null;
    bars.forEach(b => { b.style.transform = ''; });
    if (face.el) { face.el.classList.remove('vis'); face.el.removeAttribute('data-vis'); }
  }

  /* ---------- les petites bulles ---------- */
  const PUFF = {
    coeur: ['❤', '#ff6fa8'], etoile: ['★', '#ffd84d'], question: ['?', '#b18cff'], zzz: ['Z', '#8fa6ff'],
    note: ['♪', '#8ff0ff'], eclair: ['!', '#ffd84d'], goutte: ['💧', '#8fd3ff'],
  };
  function puff(kind, n = 3) {
    const box = document.getElementById('face-fx');
    if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const p = PUFF[kind] || PUFF.etoile;
    for (let k = 0; k < n; k++) {
      const s = document.createElement('span');
      s.textContent = p[0];
      s.style.setProperty('--c', p[1]);
      const right = kind === 'zzz' || kind === 'question';
      s.style.left = `${right ? 62 + Math.random() * 22 : 18 + Math.random() * 64}%`;
      s.style.top = `${right ? 2 + Math.random() * 8 : -2 + Math.random() * 10}%`;
      s.style.setProperty('--dx', `${Math.round(Math.random() * 60 - 30)}px`);
      s.style.setProperty('--rot', `${Math.round(Math.random() * 40 - 20)}deg`);
      s.style.setProperty('--d', `${1.5 + Math.random() * 0.9}s`);
      s.style.animationDelay = `${k * 0.22}s`;
      box.appendChild(s);
      setTimeout(() => s.remove(), 3200 + k * 220);
    }
  }

  /* ---------- son visage suit ce qu'il dit ---------- */
  const REACT = [
    [/\b(ha ha|hi hi|ho ho|haha|hihi|rigolo|rigole|drole|chatouille|mort de rire)\b/, 'laugh', 'note'],
    [/\b(je t aime|calin|calins|bisou|bisous|meilleur copain|meilleur ami|meilleure amie|je t adore)\b/, 'love', 'coeur'],
    [/\b(wouah|waouh|ouah|whaou|oh la la|incroyable|extraordinaire|pas possible|ca alors|impressionnant)\b/, 'surprise', 'eclair'],
    [/\b(bravo|champion|championne|genial|magnifique|parfait|felicitations|medaille|tu as gagne|tu as trouve|trop fort|trop forte)\b/, 'proud', 'etoile'],
    [/\b(je ne suis pas sur|je ne sais pas|je n ai pas compris|pas bien compris|bizarre|hum|tu peux repeter|mysterieux|mystere)\b/, 'confused', 'question'],
    [/\b(merci|tu es gentil|tu es gentille|trop gentil|trop gentille|je rougis)\b/, 'shy', 'coeur'],
    [/\b(dommage|desole|desolee|oh non|triste)\b/, 'sad', ''],
    [/\b(bonne nuit|dodo|fatigue|je baille|m endormir)\b/, 'sleepy', 'zzz'],
  ];
  let lastPuff = 0;
  function react(text) {
    if (!face.el) return;
    const n = ORTHO.bare(String(text)).replace(/[^a-z0-9]+/g, ' ');
    // on ne remplace pas une émotion choisie exprès par un jeu (oups, triste, endormi…)
    if (!['idle', 'listen', 'happy', 'think', 'proud', 'surprise', 'love', 'laugh', 'shy', 'confused'].includes(face.state)) return;
    for (const [re, mood, bubble] of REACT) {
      if (!re.test(n)) continue;
      const ms = Math.min(3200, Math.max(1500, String(text).length * 55));
      face.flash(mood, ms);
      if (bubble && Date.now() - lastPuff > 2500) { lastPuff = Date.now(); puff(bubble, mood === 'proud' ? 4 : 3); }
      return;
    }
  }

  /* ---------- petits gestes quand il attend ---------- */
  const once = (cls, ms) => { face.el.classList.add(cls); setTimeout(() => face.el && face.el.classList.remove(cls), ms); };
  let nextGesture = Date.now() + 20000;
  setInterval(() => {
    if (!face.el || typeof dlg === 'undefined' || !dlg.started) return;
    const now = Date.now();
    // le soir (après 20 h 30) et la nuit : paupières lourdes
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    face.el.classList.toggle('night', h >= 20.5 || h < 6.5);
    if (now < nextGesture) return;
    if (!['idle', 'listen'].includes(face.state) || voice.speaking || OREILLES.hearing() || dlg.busy) return;
    nextGesture = now + 18000 + Math.random() * 25000;
    const bored = now - (dlg.lastActive || now) > 3 * 60000;
    const g = pick(bored || face.el.classList.contains('night')
      ? ['yawn', 'yawn', 'peek', 'crestwave', 'wink']
      : ['peek', 'peek', 'crestwave', 'wink', 'note', 'look']);
    if (g === 'yawn') { once('yawn', 1700); puff('zzz', 2); }
    else if (g === 'peek') once('peek', 1450);
    else if (g === 'crestwave') once('crestwave', 1250);
    else if (g === 'wink') once('wink', 380);
    else if (g === 'note') { once('peek', 1450); puff('note', 2); } // il fredonne dans sa tête
    else if (g === 'look' && !VISION.state.main) { face.look(-9, -2); setTimeout(() => face.look(9, -2), 700); setTimeout(() => face.look(0, 0), 1400); }
  }, 3000);

  /* ---------- l'allumage : écran, ligne de lumière, yeux, crête, petit carillon ---------- */
  let booting = 0;
  function boot() {
    if (!face.el || Date.now() - booting < 4000) return;
    booting = Date.now();
    face.el.classList.remove('boot');
    void face.el.getBoundingClientRect(); // relance l'animation
    face.el.classList.add('boot');
    setTimeout(() => { if (face.el) face.el.classList.remove('boot'); }, 2000);
    setTimeout(() => fx.tone([[523, 0.09], [784, 0.09], [1047, 0.12], [1568, 0.28]]), 350);
  }

  /* ---------- l'affichage d'état : batterie, cerveau (maison / nuage / mini), micro ---------- */
  setInterval(() => {
    if (!face.el) return;
    const fill = face.el.querySelector('.hud-bat-fill'), brain = face.el.querySelector('.hud-brain');
    const b = typeof CONSCIENCE !== 'undefined' ? CONSCIENCE.battery() : null;
    if (fill) {
      const lvl = b && b.level !== null ? b.level : null;
      fill.style.transform = `scaleX(${lvl === null ? 1 : Math.max(0.05, lvl / 100)})`;
      fill.classList.toggle('low', lvl !== null && lvl <= 20);
      face.el.querySelector('.hud-bat').style.opacity = lvl === null ? '.35' : '1';
    }
    if (brain) {
      const c = AI.ready() ? (AI.cfg().local ? 'maison' : 'nuage') : 'mini';
      brain.setAttribute('class', `hud-brain ${c}`);
    }
  }, 4000);

  /* ---------- les chatouilles ---------- */
  let taps = [], lastTickle = 0;
  function tapped() {
    const now = Date.now();
    taps = taps.filter(t => now - t < 1300);
    taps.push(now);
    if (taps.length < 3 || dlg.state === 'sleep') return false;
    taps = [];
    if (now - lastTickle < 6000) return true;
    lastTickle = now;
    dlg.sayNext = null;
    voice.stop();
    face.flash('laugh', 2600);
    puff('note', 3);
    fx.tone([[880, 0.07], [1175, 0.07], [988, 0.07], [1319, 0.07], [1047, 0.1]]);
    say(pick(['Hi hi hi ! Ça chatouille !', "Ha ha ha ! Arrête, je suis chatouilleux de l'écran !", 'Hi hi ! Mes circuits rigolent !', 'Ho ho ! Pas les chatouilles, pas les chatouilles !']));
    return true;
  }

  return { speak, sync, quiet, puff, react, tapped, boot };
})();
