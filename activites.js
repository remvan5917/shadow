/* =========================================================
   SHADOW — les activités (dictée, lecture, l'heure, anglais, Jacques a dit,
   émotions, pierre-feuille-ciseaux, doigts, couleurs, cris d'animaux,
   comptines, histoires, rappels, calendrier, humeur, temps de jeu, bilan)
   Tout se fait à la voix. Ce fichier utilise les outils de app.js
   (say, ask, askYesNo, face, fx, hear…).
   ========================================================= */
'use strict';

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function daily() { if (!S.daily) S.daily = {}; return S.daily; }

/* ---------- le carnet d'activités (pour le bilan de papa) ---------- */
function logAct(type, detail, score, total) {
  if (!S.log) S.log = [];
  S.log.push({ at: Date.now(), type, d: detail || '', s: score, n: total });
  if (S.log.length > 500) S.log = S.log.slice(-500);
  if (!AI.online()) S.explorer = true; // il a joué sans réseau : médaille de l'explorateur
  save();
  checkBadges();
  if (typeof CONSCIENCE !== 'undefined') CONSCIENCE.onAct(type, score, total); // son humeur à lui
}

/* ---------- le tableau : ce que Shadow montre sur son écran (texte à lire, horloge, sa main…) ---------- */
function showBoard(html, cls) {
  const b = $('#board');
  b.className = `board ${cls || ''}`;
  b.innerHTML = html;
  b.hidden = false;
}
function hideBoard() { $('#board').hidden = true; $('#board').innerHTML = ''; }

/* ---------- voix : parler anglais, changer de ton ---------- */
function sayEn(word) {
  return new Promise(res => {
    if (!S.settings.sound || !('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-GB';
    const vs = speechSynthesis.getVoices();
    const v = vs.find(x => /^en[-_]GB/i.test(x.lang)) || vs.find(x => /^en/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 0.85;
    if (robotVoice()) u.pitch = 0.75;
    let done = false;
    const end = () => { if (done) return; done = true; face.talk(false); OREILLES.mute(false); res(); };
    u.onstart = () => face.talk(true);
    u.onend = end; u.onerror = end;
    setTimeout(end, 4000);
    OREILLES.mute(true);
    speechSynthesis.speak(u);
  });
}
function sayPitch(text, pitch, rate) {
  return new Promise(res => {
    if (!S.settings.sound || !('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    if (voice.v) u.voice = voice.v;
    u.pitch = robotVoice() ? Math.max(0.1, pitch * 0.7) : pitch; u.rate = rate || 1; // les voix de personnages suivent la voix de robot
    let done = false;
    const end = () => { if (done) return; done = true; face.talk(false); OREILLES.mute(false); res(); };
    u.onstart = () => face.talk(true);
    u.onend = end; u.onerror = end;
    setTimeout(end, 6000);
    OREILLES.mute(true);
    speechSynthesis.speak(u);
  });
}
// joue un air en bips, la bouche bouge en rythme
async function playTune(notes) {
  face.talk(true);
  fx.tone(notes);
  await wait(notes.reduce((t, n) => t + n[1] * 0.9, 0) * 1000 + 200);
  face.talk(false);
}

/* =================== 1. DICTÉE DE MOTS DU CE1 =================== */
async function dicteeMotsFlow() {
  if (!S.dictee) S.dictee = {};
  // d'abord les mots jamais vus, puis ceux qui ont été ratés
  const score = w => { const r = S.dictee[w.t]; return !r ? 0 : r.fail > r.ok ? 1 : 2 + Math.random(); };
  const list = JEUX.shuffle(CONTENUS.MOTS_CE1).sort((a, b) => score(a) - score(b)).slice(0, 6);
  await say(`Dictée ! Je te dis ${list.length} mots de l'école. Écris-les sur ton cahier, et épelle-les-moi. On y va !`);
  let first = 0;
  for (const m of list) {
    const c = { text: m.phrase, words: [], tries: 0, hints: [], dictee: true };
    await spellWord(c, { w: m.t, t: m.t, spell: true });
    const r = S.dictee[m.t] || { ok: 0, fail: 0 };
    if (c.tries === 0) { r.ok++; first++; } else r.fail++;
    S.dictee[m.t] = r; save();
  }
  logAct('dictee', list.map(m => m.t).join(', '), first, list.length);
  face.set('happy'); fx.confetti(40);
  await say(`Dictée finie ! ${first} mot${first > 1 ? 's' : ''} sur ${list.length} du premier coup. ${first === list.length ? 'Parfait !' : 'Bravo pour tes efforts !'}`);
}

/* =================== 2. TABLES ET COMPLÉMENTS =================== */
const NUM_WORDS = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
function calcKind(n) {
  const m = n.match(/\btables? de (\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/);
  if (m) return `table:${NUM_WORDS[m[1]] || parseInt(m[1], 10)}`;
  if (/\btables?\b/.test(n) && /multipli|fois/.test(n)) return 'table:0';
  if (/\bcomplement/.test(n)) return /\bcent\b|100/.test(n) ? 'c100' : 'c10';
  return 'mix';
}
function calcQ(kind) {
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  if (kind.startsWith('table:')) {
    let t = parseInt(kind.slice(6), 10);
    if (!t) t = JEUX.shuffle([2, 3, 4, 5, 10])[0];
    const b = rnd(1, 10);
    return { ask: `combien font ${t} fois ${b} ?`, r: t * b, tip: `${t} fois ${b}, c'est ${Array(Math.min(b, 5)).fill(t).join(' plus ')}${b > 5 ? ', et ainsi de suite' : ''}.` };
  }
  if (kind === 'c10') { const a = rnd(1, 9); return { ask: `combien faut-il ajouter à ${a} pour faire 10 ?`, r: 10 - a, tip: `Compte sur tes doigts à partir de ${a}, jusqu'à 10.` }; }
  if (kind === 'c100') { const a = rnd(1, 9) * 10; return { ask: `combien faut-il ajouter à ${a} pour faire 100 ?`, r: 100 - a, tip: `Compte de dix en dix : ${a}, ${a + 10}… jusqu'à 100.` }; }
  const lvl = S.calcLevel || 2;
  if (lvl === 1) { // niveau 1 : petits nombres, jusqu'à 10
    if (Math.random() < 0.6) { const a = rnd(1, 6), b = rnd(1, Math.min(4, 10 - a)); return { ask: `combien font ${a} plus ${b} ?`, r: a + b, tip: `Compte à partir de ${a} : encore ${b}.` }; }
    const a = rnd(3, 10), b = rnd(1, a - 1); return { ask: `combien font ${a} moins ${b} ?`, r: a - b, tip: `Pars de ${b} et compte jusqu'à ${a}.` };
  }
  if (lvl === 3) { // niveau 3 : avec des retenues, et les tables
    const k = Math.random();
    if (k < 0.4) { const a = rnd(15, 89), b = rnd(3, 9); return { ask: `combien font ${a} plus ${b} ?`, r: a + b, tip: `Ajoute d'abord pour arriver à la dizaine suivante, puis le reste.` }; }
    if (k < 0.7) { const a = rnd(11, 19), b = rnd((a % 10) + 1, 9); return { ask: `combien font ${a} moins ${b} ?`, r: a - b, tip: `Enlève d'abord ${a % 10} pour arriver à 10, puis le reste.` }; }
    const t = JEUX.shuffle([2, 3, 4, 5, 10])[0], b = rnd(2, 10); return { ask: `combien font ${t} fois ${b} ?`, r: t * b, tip: `C'est ${b} fois le nombre ${t}.` };
  }
  const q = JEUX.calcQuestion();
  return { ask: `combien font ${q.say} ?`, r: q.r, tip: q.tip };
}

/* =================== MÉDAILLES =================== */
const BADGES = [
  { id: 'journal1', nom: 'Petit journaliste', ico: '📰', test: () => (S.journal || []).length >= 1 },
  { id: 'journal10', nom: 'Grand écrivain', ico: '✒️', test: () => (S.journal || []).length >= 10 },
  { id: 'ortho20', nom: "Champion d'orthographe", ico: '🔤', test: () => (S.stats.first || 0) >= 20 },
  { id: 'dictee', nom: 'As de la dictée', ico: '📝', test: () => logs('dictee').some(x => x.s === x.n) },
  { id: 'lecteur', nom: 'Super lecteur', ico: '📖', test: () => logs('lecture').filter(x => x.s >= 90).length >= 3 },
  { id: 'calcul', nom: 'Roi du calcul', ico: '➗', test: () => logs('calc').filter(x => x.s === 5).length >= 2 },
  { id: 'heure', nom: "Maître de l'heure", ico: '⏰', test: () => logs('heure').some(x => x.s === 4) },
  { id: 'savant', nom: 'Petit savant', ico: '🧪', test: () => logs('quiz').some(x => x.s === 5) },
  { id: 'anglais', nom: 'Globe-trotteur', ico: '🌍', test: () => logs('anglais').reduce((t, x) => t + (x.s || 0), 0) >= 12 },
  { id: 'jacques', nom: 'Impiégeable', ico: '🕺', test: () => logs('jacques').some(x => x.s === x.n) },
  { id: 'animaux', nom: 'Ami des animaux', ico: '🐾', test: () => logs('cris').reduce((t, x) => t + (x.s || 0), 0) >= 10 },
  { id: 'detective', nom: 'Détective', ico: '🔍', test: () => (S.stats.dev || 0) >= 10 },
  { id: 'explorateur', nom: 'Explorateur', ico: '🧭', test: () => !!S.explorer },
  { id: 'copain', nom: 'Meilleur copain', ico: '💙', test: () => playStreak() >= 5 },
  { id: 'visage', nom: 'On se connaît !', ico: '👋', test: () => (S.people || []).length >= 1 },
];
const logs = t => (S.log || []).filter(x => x.type === t);
function playStreak() {
  let n = 0;
  for (let i = 0; i < 60; i++) { const k = dayKey(new Date(Date.now() - i * 86400000)); if ((S.playLog || {})[k]) n++; else if (i) break; }
  return n;
}
const newBadges = [];
function checkBadges() {
  if (!S.badges) S.badges = [];
  for (const b of BADGES) if (!S.badges.includes(b.id)) { try { if (b.test()) { S.badges.push(b.id); newBadges.push(b); } } catch (e) { /* rien */ } }
  if (newBadges.length) save();
}
async function announceBadges() {
  checkBadges();
  while (newBadges.length) {
    const b = newBadges.shift();
    showBoard(`<div class="pfc">${b.ico}<small>${esc(b.nom)}</small></div>`, 'pfcb');
    face.set('happy'); fx.ok(); fx.confetti(70);
    await say(`Médaille ! Tu as gagné la médaille « ${b.nom} » ! Bravo ${name()} !`);
    await wait(1200);
    hideBoard();
  }
}
async function medaillesAnswer() {
  checkBadges();
  const mine = BADGES.filter(b => (S.badges || []).includes(b.id));
  if (!mine.length) return say("Tu n'as pas encore de médaille… mais ça va venir ! Essaie une dictée, un quiz ou Jacques a dit.");
  showBoard(`<div class="medals">${mine.map(b => `<span>${b.ico}<small>${esc(b.nom)}</small></span>`).join('')}</div>`, 'medalsb');
  await say(`Tu as ${mine.length} médaille${mine.length > 1 ? 's' : ''} sur ${BADGES.length} : ${mine.map(b => b.nom).join(', ')} !`);
  await wait(2500);
  hideBoard();
}

/* =================== 3. LECTURE À VOIX HAUTE =================== */
async function lectureFlow() {
  if (OREILLES.engine() !== 'whisper') return say("Pour t'écouter lire, j'ai besoin de mes super-oreilles. Elles ont besoin de ma clé d'énergie et du réseau : papa peut les activer dans le panneau de contrôle.");
  const i = (daily().lecture || 0) % CONTENUS.TEXTES.length;
  const texte = CONTENUS.TEXTES[i];
  daily().lecture = i + 1; save();
  showBoard(`<p class="read">${esc(texte)}</p>`, 'reading');
  try {
    await say('Lecture ! Lis le texte qui est sur mon écran, à voix haute, tranquillement. Je t\'écoute !');
    let tries = 0, ok = false;
    while (tries < 2 && !ok) {
      tries++;
      const t = await hear({ maxWait: 40000, endSilence: 1.8 });
      if (t === null) throw new Stop('cancel');
      if (!t) { await say("Je n'ai rien entendu. Lis bien fort, je t'écoute !"); continue; }
      if (RE.stop.test(N(t))) throw new Stop('stop');
      const res = compareReading(texte, t);
      logAct('lecture', texte.slice(0, 40), Math.round(res.score * 100), 100);
      if (res.score >= 0.9) { ok = true; face.set('happy'); fx.ok(); fx.confetti(30); await say(pick(['Bravo, tu lis super bien !', 'Magnifique lecture !', 'Wouah, tu lis comme un grand !'])); }
      else if (res.score >= 0.55) {
        face.set('happy');
        const miss = res.missed.slice(0, 2);
        await say(`Bien lu ! ${miss.length ? `Le mot ${miss.map(w => `« ${w} »`).join(' et ')} était un peu difficile.` : ''} ${tries < 2 ? 'Tu veux relire le texte une deuxième fois ?' : ''}`);
        if (tries < 2 && !(await askYesNo('Tu relis ?'))) ok = true;
        else if (tries < 2) await say('Vas-y, je t\'écoute !');
      } else {
        face.flash('oops');
        await say(tries < 2 ? "Hmm, je n'ai pas bien reconnu le texte. Essaie encore, en lisant bien chaque mot." : "Ce texte était difficile ! On le relira une autre fois.");
      }
    }
  } finally { hideBoard(); }
}
// combien de mots du texte ont bien été lus (dans l'ordre, avec un peu de tolérance)
function compareReading(texte, heard) {
  const tw = N(texte).split(' ').filter(Boolean), hw = N(heard).split(' ').filter(Boolean);
  const near = (a, b) => a === b || (a.length > 3 && ORTHO.bare(a).slice(0, 4) === ORTHO.bare(b).slice(0, 4));
  let j = 0, found = 0;
  const missed = [];
  for (const w of tw) {
    let k = j;
    while (k < hw.length && k < j + 4 && !near(w, hw[k])) k++;
    if (k < hw.length && near(w, hw[k])) { found++; j = k + 1; }
    else if (w.length > 3) missed.push(w);
  }
  return { score: tw.length ? found / tw.length : 0, missed };
}

/* =================== 4. L'HEURE =================== */
function clockSVG(h, m) {
  const ah = ((h % 12) + m / 60) * 30, am = m * 6;
  const hand = (a, len, w, c) => { const r = (a - 90) * Math.PI / 180; return `<line x1="100" y1="100" x2="${100 + len * Math.cos(r)}" y2="${100 + len * Math.sin(r)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`; };
  let ticks = '';
  for (let i = 1; i <= 12; i++) {
    const r = (i * 30 - 90) * Math.PI / 180;
    ticks += `<text x="${100 + 72 * Math.cos(r)}" y="${100 + 72 * Math.sin(r) + 7}" text-anchor="middle" font-size="20" font-weight="700" fill="#111a33">${i}</text>`;
  }
  return `<svg viewBox="0 0 200 200" class="clock"><circle cx="100" cy="100" r="94" fill="#f7f8ff" stroke="#4c8dff" stroke-width="8"/>${ticks}${hand(ah, 45, 9, '#111a33')}${hand(am, 70, 5, '#e8473c')}<circle cx="100" cy="100" r="7" fill="#111a33"/></svg>`;
}
function timeWords(h, m) {
  const H = x => (x === 12 ? 'midi' : x === 1 ? 'une heure' : `${x} heures`);
  if (m === 0) return H(h);
  if (m === 15) return `${H(h)} et quart`;
  if (m === 30) return `${H(h)} et demie`;
  return `${H(h === 12 ? 1 : h + 1)} moins le quart`;
}
function parseTime(text) {
  const n = N(text);
  let h = null, m = 0;
  const mm = n.match(/^(.*?)\b(heures?|h)\b(.*)$/);
  if (/\bmidi\b/.test(n)) h = 12;
  else if (/\bminuit\b/.test(n)) h = 12;
  else if (mm) h = JEUX.parseNumber(mm[1]);
  if (h === null) return null;
  const rest = mm ? mm[3] : n.replace(/.*\b(midi|minuit)\b/, '');
  if (/\bet quart\b/.test(rest)) m = 15;
  else if (/\bet demie?\b/.test(rest)) m = 30;
  else if (/\bmoins (le )?quart\b/.test(rest)) { m = 45; h = h === 1 ? 12 : h - 1; }
  else { const x = JEUX.parseNumber(rest); if (x !== null && x < 60) m = x; }
  return { h: ((h - 1) % 12 + 12) % 12 + 1, m };
}
async function heureFlow() {
  await say("On apprend l'heure ! Regarde l'horloge sur mon écran. La petite aiguille montre les heures, la grande aiguille les minutes.");
  let score = 0;
  try {
    for (let i = 0; i < 4; i++) {
      const h = 1 + Math.floor(Math.random() * 12);
      const m = i < 2 ? JEUX.shuffle([0, 30])[0] : JEUX.shuffle([0, 15, 30, 45])[0];
      showBoard(clockSVG(h, m), 'clockb');
      let ok = false;
      for (let tries = 0; tries < 2 && !ok; tries++) {
        const t = await ask(tries ? 'Regarde bien la petite aiguille… Quelle heure est-il ?' : 'Quelle heure est-il sur mon horloge ?', { wait: 25000 });
        if (RE.dontknow.test(N(t))) break;
        const p = parseTime(t);
        if (p && p.h === h && p.m === m) ok = true;
        else if (!p) { tries--; await say("Dis-moi l'heure, par exemple : trois heures et demie."); }
        else { face.flash('oops'); fx.oops(); }
      }
      if (ok) { score++; face.flash('happy'); fx.ok(); await say(`Bravo ! Il est ${timeWords(h, m)}.`); }
      else await say(`Il est ${timeWords(h, m)}. La petite aiguille est sur le ${m === 45 ? (h === 12 ? 1 : h + 1) : h}, et la grande sur le ${m === 0 ? 12 : m / 5}.`);
    }
  } finally { hideBoard(); }
  logAct('heure', '', score, 4);
  face.set('happy');
  await say(`Tu as trouvé ${score} heure${score > 1 ? 's' : ''} sur 4 ! ${score >= 3 ? 'Tu sais lire l’heure comme un champion !' : 'On s’entraînera encore !'}`);
}

/* =================== 5. ANGLAIS =================== */
async function anglaisFlow() {
  const list = JEUX.shuffle(CONTENUS.ANGLAIS).slice(0, 5);
  await say("Let's go ! On apprend des mots en anglais. Écoute bien, puis répète après moi !");
  // d'abord il apprend 3 mots…
  for (const w of list.slice(0, 3)) {
    await say(`En anglais, « ${w.fr} » se dit :`);
    await sayEn(w.en); await wait(250); await sayEn(w.en);
    const t = await ask('À toi ! Répète.', { wait: 15000 });
    face.flash('happy');
    await say(N(t).length > 1 ? pick(['Bravo !', 'Very good !', 'Super !']) : 'Bien essayé !');
  }
  // …puis il pose des questions (on répond en français : plus facile à vérifier)
  let score = 0;
  for (const w of JEUX.shuffle(list).slice(0, 4)) {
    await say('Que veut dire le mot anglais…');
    await sayEn(w.en);
    const t = await ask('… en français ?', { wait: 20000 });
    if (JEUX.matches(t, [ORTHO.bare(w.fr)])) { score++; face.flash('happy'); fx.ok(); await say(`Yes ! ${w.en}, c'est « ${w.fr} ».`); }
    else { face.flash('oops'); await say(`${w.en}, ça veut dire « ${w.fr} ».`); }
  }
  logAct('anglais', list.map(w => w.en).join(', '), score, 4);
  face.set('happy');
  await say(`Tu as ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} sur 4. Well done !`);
}

/* =================== 6. LE MOT DU JOUR =================== */
function motDuJour() { return CONTENUS.pickDay(CONTENUS.MOTS_DU_JOUR); }
function motDuJourText() { const m = motDuJour(); return `Le mot du jour, c'est « ${m.mot} » : ça veut dire ${m.def}. Par exemple : ${m.ex}`; }

/* =================== 7. JACQUES A DIT (avec la caméra) =================== */
async function jacquesFlow() {
  if (LEGACY) return say("Jacques a dit a besoin d'un Chrome plus récent pour que je voie tes bras.");
  if (!(await needEyes())) return;
  face.set('think');
  await say('Jacques a dit ! Recule un peu pour que je voie tes bras. Attention : fais le geste seulement si je dis « Jacques a dit » !');
  try { await VISION.pose(); } catch (e) { face.set('oops'); return say("Mes yeux de sport ne se chargent pas. Il faut le WiFi la première fois."); }
  let score = 0, rounds = 6, misses = 0;
  const order = JEUX.shuffle(CONTENUS.JACQUES).concat(JEUX.shuffle(CONTENUS.JACQUES)); // chaque geste à son tour
  for (let i = 0; i < rounds; i++) {
    const c = order[i % order.length];
    const jacques = Math.random() < 0.7;
    face.set('happy');
    await say(jacques ? `Jacques a dit : ${c.dis}` : `${c.dis.charAt(0).toUpperCase()}${c.dis.slice(1)}`);
    face.set('listen');
    let hits = 0, seen = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      let lm = null;
      try { lm = await VISION.pose(); } catch (e) { /* image ratée */ }
      if (lm) { seen++; hits = VISION.poseTest(c.test, lm) ? hits + 1 : Math.max(0, hits - 1); }
      if (hits >= 2) break;
      await wait(150);
    }
    if (!seen) {
      face.flash('oops');
      if (++misses >= 2) { await say("Je n'arrive pas à te voir en entier. On rejouera quand tu pourras te mettre plus loin, avec de la lumière !"); return; }
      await say('Je ne te vois pas ! Mets-toi bien devant moi, assez loin pour que je voie tes bras.'); i--; continue;
    }
    misses = 0;
    const did = hits >= 2;
    if (jacques && did) { score++; fx.ok(); face.flash('happy'); await say(pick(['Bravo !', 'Bien joué !', 'Parfait !'])); }
    else if (jacques) { fx.oops(); face.flash('oops'); await say("Oh ! Jacques l'avait dit, il fallait le faire !"); }
    else if (did) { fx.oops(); face.flash('happy'); await say("Ha ha, piégé ! Je n'avais pas dit « Jacques a dit » !"); }
    else { score++; fx.ok(); face.flash('happy'); await say("Bravo, tu ne t'es pas fait piéger !"); }
    await say('Remets-toi normalement…');
    await wait(1200);
  }
  logAct('jacques', '', score, rounds);
  face.set('happy'); fx.confetti(40);
  await say(`Tu as ${score} point${score > 1 ? 's' : ''} sur ${rounds} ! ${score >= rounds - 1 ? 'Personne ne te piège !' : 'Bien joué !'}`);
}

/* =================== 8. LE JEU DES ÉMOTIONS =================== */
async function emotionsFlow() {
  if (!(await needEyes())) return;
  await say("Le jeu des émotions ! Je te montre une tête, et tu la fais aussi. Mets-toi bien en face de moi.");
  let score = 0;
  const list = JEUX.shuffle(CONTENUS.EMOTIONS);
  for (const e of list) {
    face.set(e.moi);
    await say(`Fais-moi ${e.dis} !`);
    let ok = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000 && !ok) {
      const f = VISION.state.faces[0];
      if (f && f.expr.k === e.k && f.expr.v > 0.5) ok = true;
      await wait(300);
    }
    if (ok) { score++; face.set('happy'); fx.ok(); await say(e.bravo); }
    else { face.set('happy'); await say(VISION.state.faces.length ? 'Hmm, je ne vois pas bien cette tête. Ce n’est pas grave, on continue !' : "Je ne vois pas ton visage ! Mets-toi bien devant moi."); }
  }
  logAct('emotions', '', score, list.length);
  await say(`Tu as fait ${score} tête${score > 1 ? 's' : ''} sur ${list.length} ! Tu es un vrai comédien !`);
}

/* =================== 9. PIERRE, FEUILLE, CISEAUX =================== */
const PFC = { pierre: { emoji: '✊', bat: 'ciseaux' }, feuille: { emoji: '✋', bat: 'pierre' }, ciseaux: { emoji: '✌️', bat: 'feuille' } };
const GESTE = { Closed_Fist: 'pierre', Open_Palm: 'feuille', Victory: 'ciseaux' };
async function pfcFlow() {
  if (LEGACY) return say("Pierre, feuille, ciseaux a besoin d'un Chrome plus récent pour que je voie ta main.");
  if (!(await needEyes())) return;
  await say('Pierre, feuille, ciseaux ! Montre ta main bien devant la caméra, au moment où je dis « ciseaux ». Le premier à 3 points gagne !');
  try { await VISION.hands(); } catch (e) { face.set('oops'); return say('Mes yeux à mains ne se chargent pas. Il faut le WiFi la première fois.'); }
  let moi = 0, toi = 0, rounds = 0, misses = 0;
  try {
    while (moi < 3 && toi < 3 && rounds < 9) {
      rounds++;
      const mine = pick(Object.keys(PFC));
      await say('Pierre… feuille… ciseaux !');
      showBoard(`<div class="pfc">${PFC[mine].emoji}<small>${mine}</small></div>`, 'pfcb');
      const counts = {};
      const t0 = Date.now();
      while (Date.now() - t0 < 2500) {
        let hs = [];
        try { hs = await VISION.hands(); } catch (e) { /* image ratée */ }
        for (const h of hs) { const g = GESTE[h.gesture]; if (g && h.score > 0.5) counts[g] = (counts[g] || 0) + 1; }
        await wait(120);
      }
      const yours = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (!yours) {
        face.flash('oops'); hideBoard();
        if (++misses >= 2) { await say("Je n'arrive pas à voir ta main. On rejouera avec plus de lumière, la main bien devant la caméra !"); return; }
        await say("Je n'ai pas vu ta main ! Montre-la bien devant la caméra. On recommence."); continue;
      }
      misses = 0;
      let r;
      if (yours === mine) r = `Moi aussi ${mine} ! Égalité.`;
      else if (PFC[yours].bat === mine) { toi++; fx.ok(); face.flash('happy'); r = `Tu as fait ${yours}, j'ai fait ${mine}. Tu gagnes ce point !`; }
      else { moi++; face.flash('happy'); r = `Tu as fait ${yours}, j'ai fait ${mine}. Point pour moi !`; }
      await say(`${r} ${toi} à ${moi}.`);
      hideBoard();
    }
  } finally { hideBoard(); }
  logAct('pfc', `${toi}-${moi}`, toi, toi + moi);
  face.set('happy');
  if (toi > moi) { fx.confetti(50); await say('Tu as gagné la partie ! Bravo, champion !'); }
  else await say("J'ai gagné cette fois ! On fait la revanche une autre fois ?");
}

/* =================== 10. LES CRIS D'ANIMAUX =================== */
async function crisFlow() {
  const list = JEUX.shuffle(CONTENUS.CRIS);
  let score = 0, played = 0;
  await say("Devine l'animal à son cri ! Écoute bien…");
  for (const c of list) {
    played++;
    let found = false;
    for (let tries = 0; tries < 2 && !found; tries++) {
      await say('Qui fait…');
      await sayPitch(c.cri, 1.6, 0.9);
      const t = await ask(tries ? 'Écoute encore… Qui fait ce bruit ?' : 'Qui est-ce ?', { wait: 20000 });
      if (RE.dontknow.test(N(t))) break;
      if (JEUX.matches(t, c.r)) found = true; else face.flash('oops');
    }
    if (found) { score++; fx.ok(); face.flash('happy'); await say(`Bravo ! C'était ${c.a} !`); } else await say(`C'était ${c.a} !`);
    if (played >= 3 && !(await askYesNo('Un autre animal ?'))) break;
  }
  logAct('cris', '', score, played);
  await say(`Tu as reconnu ${score} animau${score > 1 ? 'x' : ''} sur ${played} !`);
}

/* =================== 11. HISTOIRE DONT TU ES LE HÉROS (Groq) =================== */
const heroSeed = () => `(${name()} veut une histoire dont il est le héros.) Raconte une aventure où ${name()} est le héros, en 4 à 6 étapes. À chaque étape : 2 ou 3 phrases simples, puis propose 2 choix courts (« Tu préfères A : … ou B : … ? »). Attends sa réponse avant de continuer, et tiens compte de son choix. Termine par une belle fin.`;

/* =================== 12. DEVINETTES INVENTÉES (Groq) =================== */
const usedRiddles = [];
async function newRiddle() {
  if (!AI.ready()) return null;
  try {
    const raw = await AI.chat([{ role: 'system', content: "Tu inventes des devinettes faciles pour un enfant de 7 ans, en français. Réponds UNIQUEMENT en JSON : {\"devinette\": \"…Qui suis-je ?\", \"reponse\": \"un mot\", \"mots_acceptes\": [\"mot\", \"synonyme\"]}. La réponse est un objet, un animal ou une chose très connue, et la devinette est juste, sans piège, sans dire la réponse." },
      { role: 'user', content: `Une nouvelle devinette (pas : ${usedRiddles.slice(-8).join(', ') || 'aucune'}).` }], { maxTokens: 200, temperature: 0.9 });
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const rep = String(j.reponse || '').trim();
    if (!j.devinette || !rep || ORTHO.bare(j.devinette).includes(ORTHO.bare(rep).replace(/^(un|une|le|la|les|l') ?/, ''))) return null;
    usedRiddles.push(rep);
    const acc = [rep].concat(j.mots_acceptes || []).map(x => ORTHO.bare(String(x)).replace(/^(un|une|le|la|les|l)\s+/, '').trim()).filter(Boolean);
    return { q: ETHIQUE.safe(j.devinette), a: rep, r: acc };
  } catch (e) { return null; }
}

/* =================== 13. BONJOUR, BONSOIR, HISTOIRE DU SOIR =================== */
function partOfDay() { const h = new Date().getHours(); return h < 11 ? 'matin' : h < 18 ? 'jour' : 'soir'; }
async function histoireSoirFlow() {
  face.set('idle');
  await say(`D'accord ${name()}, je te raconte une histoire pour dormir. Installe-toi bien…`);
  let story = '';
  if (AI.ready()) {
    try {
      story = await AI.chat([{ role: 'system', content: CERVEAU.persona() + MEMOIRE.context() },
        { role: 'user', content: `(${name()} va se coucher.) Raconte-lui une histoire du soir très douce et calme, de 7 à 9 phrases simples, où il peut y avoir un de ses goûts de ta mémoire. Rien qui fait peur. Termine par « Bonne nuit… ».` }], { maxTokens: 450, temperature: 0.8 });
      story = ETHIQUE.safe(story);
    } catch (e) { story = ''; }
  }
  if (!story) story = pick(CONTENUS.HISTOIRES_SOIR);
  const before = S.settings.slow;
  S.settings.slow = true; // il parle plus lentement
  face.el.classList.add('drowsy');
  for (const phrase of story.match(/[^.!?…]+[.!?…]*/g) || [story]) { await say(phrase.trim()); await wait(350); }
  S.settings.slow = before;
  face.el.classList.remove('drowsy');
  await say(`Fais de beaux rêves, ${name()}. Bip… bip… zzz.`);
  pauseUntil = Date.now() + 60 * 60000; // il ne se réveille pas tout seul pendant 1 heure (même s'il voit quelqu'un)
  logAct('soir', '', null, null);
  goSleep(false);
}

/* =================== 14. RAPPELS =================== */
const firedToday = {};
const reminderQueue = [];
setInterval(() => {
  const now = new Date(), t = hhmm(now), dk = dayKey(now), wd = now.getDay();
  for (const r of S.settings.reminders || []) {
    if (r.time !== t || firedToday[r.id] === dk) continue;
    if (r.days === 'ecole' && (wd === 0 || wd === 6 || wd === 3)) continue;
    if (r.days === 'weekend' && wd !== 0 && wd !== 6) continue;
    firedToday[r.id] = dk;
    reminderQueue.push({ text: r.text, at: Date.now() });
  }
  deliverReminders();
}, 20000);
function deliverReminders() {
  if (!reminderQueue.length || !dlg.started) return;
  while (reminderQueue.length && Date.now() - reminderQueue[0].at > 15 * 60000) reminderQueue.shift(); // trop vieux
  if (!reminderQueue.length || dlg.busy || voice.speaking || dlg.state === 'activity') return;
  const r = reminderQueue.shift();
  const line = `Petit rappel, ${name()} : ${r.text} !`;
  logAct('rappel', r.text, null, null);
  if (dlg.state === 'sleep') { pauseUntil = 0; wake(); dlg.sayNext = line; }
  else { dlg.state = 'talk'; face.flash('happy'); fx.wake(); say(line); }
}

/* =================== 15. CALENDRIER =================== */
function nextDate(ev) { // prochaine date de l'événement (les anniversaires reviennent chaque année)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = ev.date.split('-').map(Number);
  let dt = new Date(y, m - 1, d);
  if (ev.yearly) { dt = new Date(today.getFullYear(), m - 1, d); if (dt < today) dt = new Date(today.getFullYear() + 1, m - 1, d); }
  return { dt, days: Math.round((dt - today) / 86400000) };
}
function upcoming(maxDays) {
  return (S.settings.events || []).map(e => Object.assign({ e }, nextDate(e))).filter(x => x.days >= 0 && x.days <= maxDays).sort((a, b) => a.days - b.days);
}
function dodos(x) { return x.days === 0 ? `C'est aujourd'hui : ${x.e.text} ! Youpi !` : x.days === 1 ? `Demain, c'est ${x.e.text} ! Plus qu'un dodo !` : `Plus que ${x.days} dodos avant ${x.e.text} !`; }
async function calendrierAnswer(text) {
  const n = N(text), list = upcoming(400);
  if (!list.length) return say("Mon calendrier est vide. Papa peut y mettre les anniversaires et les grands jours dans les réglages.");
  const hit = list.find(x => N(x.e.text).split(' ').some(w => w.length > 3 && n.includes(w))) || list[0];
  if (hit.days === 0) fx.confetti(50);
  return say(dodos(hit));
}

/* =================== 16. L'HUMEUR DU JOUR =================== */
function moodQuestionDue() { return new Date().getHours() >= 16 && daily().mood !== dayKey(); }
async function moodAnswer(text) {
  daily().mood = dayKey(); save();
  const r = PRIVE.mask(String(text));
  if (!r.hidden) MEMOIRE.event(`Humeur du jour ${deName(name())} : « ${r.text.slice(0, 120)} »`);
  logAct('humeur', r.hidden ? '(secret)' : r.text.slice(0, 120), null, null);
  if (AI.ready()) return chatReply(text);
  const n = N(text);
  if (/\b(triste|mal|nul|pleure|dispute|peur|fache|colere|pas bien|bof)\b/.test(n)) { face.set('sad'); return say("Oh… je suis désolé que ta journée n'ait pas été géniale. Tu veux en parler à papa ? Moi, je suis là pour toi."); }
  face.set('happy');
  return say(pick(['Super ! Ça me fait clignoter de joie !', 'Génial ! Tu me raconteras encore ?', 'Trop bien !']));
}

/* =================== 17. COMPTINES =================== */
async function chanterFlow(text) {
  const n = N(text || '');
  const song = CONTENUS.COMPTINES.find(c => n.includes(N(c.titre))) || pick(CONTENUS.COMPTINES);
  face.set('happy');
  await say(`Je te chante « ${song.titre} », version robot !`);
  for (const l of song.lignes) { await say(l.texte); await playTune(l.air); }
  face.set('happy'); fx.confetti(20);
  logAct('chanson', song.titre, null, null);
  await say('Tadaaa ! Tu veux chanter avec moi la prochaine fois ?');
}

/* =================== 18. GARDE-ROBOT (option de papa, rien n'est enregistré) =================== */
const visits = []; // en mémoire vive seulement : effacé quand l'appli se ferme
function noteVisit(nameSeen) {
  if (!S.settings.gardeRobot || !nameSeen || nameSeen === S.prenom) return;
  const last = visits.filter(v => v.name === nameSeen).pop();
  if (!last || Date.now() - last.at > 30 * 60000) visits.push({ name: nameSeen, at: Date.now() });
  if (visits.length > 20) visits.shift();
}
function visitsSince(t) { return visits.filter(v => v.at > t); }
function visitsText(list) {
  const h = v => `${new Date(v.at).getHours()} h`;
  return list.map(v => `${v.name} vers ${h(v)}`).join(', ');
}

/* =================== 19. LES COULEURS =================== */
async function couleurFlow(text) {
  if (!(await needEyes())) return;
  const torso = /\b(pull|t shirt|tee shirt|teeshirt|haut|chemise|robe|veste|manteau|habit|vetement|tenue|maillot|sweat)\b/.test(N(text));
  face.set('think');
  await wait(600);
  const c = VISION.colorAt(torso ? 'torso' : 'center');
  if (!c) { face.flash('oops'); return say(torso ? 'Mets-toi bien devant moi pour que je voie ton haut !' : 'Montre-moi la chose bien au milieu, devant la caméra !'); }
  face.set('happy');
  const art = /^[aeiou]/.test(c) ? "de l'" : 'du ';
  return say(`On dirait ${art}${c} ! ${torso ? '' : 'Montre-moi autre chose si tu veux !'}`);
}

/* =================== 20. COMPTER AVEC SES DOIGTS =================== */
async function doigtsFlow() {
  if (LEGACY) return say("Compter avec les doigts a besoin d'un Chrome plus récent pour que je voie tes mains.");
  if (!(await needEyes())) return;
  await say('On compte avec les doigts ! Montre bien tes mains devant la caméra.');
  try { await VISION.hands(); } catch (e) { face.set('oops'); return say('Mes yeux à mains ne se chargent pas. Il faut le WiFi la première fois.'); }
  let score = 0, misses = 0;
  for (let i = 0; i < 5; i++) {
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    let target, line;
    if (i % 2 === 0) { target = rnd(1, 10); line = `Montre-moi ${target} avec tes doigts !`; }
    else { const a = rnd(1, 5), b = rnd(1, 5); target = a + b; line = `Combien font ${a} plus ${b} ? Montre-le avec tes doigts !`; }
    await say(line);
    face.set('listen');
    let last = -1, stable = 0, got = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && got === null) {
      let hs = [];
      try { hs = await VISION.hands(); } catch (e) { /* image ratée */ }
      const n = hs.reduce((t, h) => t + h.fingers, 0);
      if (hs.length && n === last) stable++; else stable = 0;
      last = hs.length ? n : -1;
      if (stable >= 3) got = n;
      await wait(150);
    }
    if (got === null) {
      face.flash('oops');
      if (++misses >= 2) { await say("Je n'arrive pas à bien voir tes doigts. On rejouera avec plus de lumière !"); return; }
      await say("Je n'ai pas bien vu tes doigts. Ce n'est pas grave, on continue !"); continue;
    }
    misses = 0;
    if (got === target) { score++; fx.ok(); face.flash('happy'); await say(`Bravo ! Je vois ${target} doigts !`); }
    else { face.flash('oops'); await say(`Je vois ${got} doigt${got > 1 ? 's' : ''}… il en fallait ${target}.`); }
  }
  logAct('doigts', '', score, 5);
  await say(`Tu as ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} sur 5 !`);
}

/* =================== 21. LE BILAN POUR PAPA =================== */
const ACT_NOMS = { dictee: 'Dictées', lecture: 'Lectures', heure: "L'heure", anglais: 'Anglais', jacques: 'Jacques a dit', emotions: 'Émotions', pfc: 'Pierre-feuille-ciseaux', cris: "Cris d'animaux", doigts: 'Doigts', quiz: 'Quiz', calc: 'Calcul', journal: 'Journal', chanson: 'Comptines', soir: 'Histoires du soir', devinette: 'Devinettes' };
function renderBilan() {
  const since = Date.now() - 7 * 86400000;
  const log = (S.log || []).filter(x => x.at > since);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000); days.push({ k: dayKey(d), label: d.toLocaleDateString('fr-FR', { weekday: 'short' }) }); }
  const play = S.playLog || {};
  const byType = {};
  for (const x of log) { if (!ACT_NOMS[x.type]) continue; const t = byType[x.type] || (byType[x.type] = { n: 0, s: 0, tot: 0 }); t.n++; if (typeof x.s === 'number' && x.n) { t.s += x.s; t.tot += x.n; } }
  const moods = log.filter(x => x.type === 'humeur').slice(-5);
  const hard = (MEMOIRE.data().hard || []).map(h => h.t);
  const journal = (S.journal || []).filter(e => e.at > since).map(e => e.text);
  $('#s-bilan').innerHTML = `
    <p class="small"><b>Temps de jeu</b> : ${days.map(d => `${d.label} ${play[d.k] || 0} min`).join(' · ')}</p>
    <p class="small"><b>Activités</b> : ${Object.keys(byType).length ? Object.entries(byType).map(([k, t]) => `${ACT_NOMS[k]} ×${t.n}${t.tot ? ` (${Math.round((100 * t.s) / t.tot)} % réussi)` : ''}`).join(' · ') : 'rien encore'}</p>
    <p class="small"><b>Journal</b> : ${journal.length ? journal.map(esc).join(' / ') : 'pas de phrase cette semaine'}</p>
    <p class="small"><b>Mots difficiles</b> : ${hard.length ? hard.map(esc).join(', ') : 'aucun'}</p>
    <p class="small"><b>Médailles</b> : ${(S.badges || []).length ? BADGES.filter(b => S.badges.includes(b.id)).map(b => `${b.ico} ${esc(b.nom)}`).join(' · ') : 'pas encore'} · <b>niveau de calcul</b> ${S.calcLevel || 2}/3</p>
    <p class="small"><b>Humeur</b> : ${moods.length ? moods.map(m => `${new Date(m.at).toLocaleDateString('fr-FR', { weekday: 'short' })} « ${esc(m.d)} »`).join(' · ') : 'pas encore demandée'}</p>`;
}

/* =================== 22. TEMPS DE JEU PAR JOUR =================== */
let limitWarned = '', limitDone = '';
setInterval(() => {
  if (!dlg.started || dlg.state === 'sleep') return;
  if (Date.now() - dlg.lastActive > 3 * 60000) return; // personne ne joue
  const k = dayKey();
  if (!S.playLog) S.playLog = {};
  S.playLog[k] = (S.playLog[k] || 0) + 1;
  const keys = Object.keys(S.playLog).sort();
  if (keys.length > 60) delete S.playLog[keys[0]];
  save();
  const lim = (+S.settings.dailyLimit || 0) + (daily().bonus === k ? 30 : 0);
  if (!+S.settings.dailyLimit) return;
  const used = S.playLog[k];
  if (used >= lim - 5 && limitWarned !== k && used < lim) {
    limitWarned = k;
    if (!dlg.busy && !voice.speaking) say("Encore cinq minutes et on aura bien joué pour aujourd'hui !");
  }
  if (used >= lim && limitDone !== k && !dlg.busy) {
    limitDone = k;
    say(`On a bien joué aujourd'hui, ${name()} ! C'est fini pour aujourd'hui. À demain !`).then(() => goSleep(false));
  }
}, 60000);
function limitReached() {
  const k = dayKey(), lim = +S.settings.dailyLimit || 0;
  return lim > 0 && (S.playLog && S.playLog[k] || 0) >= lim + (daily().bonus === k ? 30 : 0);
}

/* =================== LES RÉGLAGES DE PAPA (rappels, calendrier, temps de jeu, bilan) =================== */
function renderReminders() {
  const r = S.settings.reminders || [];
  const days = { tous: 'tous les jours', ecole: "jours d'école", weekend: 'week-end' };
  $('#s-rem-list').innerHTML = r.length
    ? r.slice().sort((a, b) => a.time.localeCompare(b.time)).map(x => `<div class="person"><span>⏰ ${x.time} — ${esc(x.text)} <small class="muted">(${days[x.days] || days.tous})</small></span><button type="button" class="ghost sm danger" data-unrem="${x.id}">✕</button></div>`).join('')
    : '<p class="small muted">Aucun rappel.</p>';
}
function renderEvents() {
  const ev = (S.settings.events || []).map(e => Object.assign({ e }, nextDate(e))).sort((a, b) => a.days - b.days);
  $('#s-ev-list').innerHTML = ev.length
    ? ev.map(x => `<div class="person"><span>📅 ${x.dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} — ${esc(x.e.text)}${x.e.yearly ? ' <small class="muted">(chaque année)</small>' : ''} <small class="muted">${x.days >= 0 ? `· dans ${x.days} j` : '· passé'}</small></span><button type="button" class="ghost sm danger" data-unev="${x.e.id}">✕</button></div>`).join('')
    : '<p class="small muted">Calendrier vide.</p>';
}
function renderExtras() {
  renderReminders(); renderEvents(); renderBilan();
  $('#s-limit').value = String(S.settings.dailyLimit || 0);
  $('#s-garde').checked = !!S.settings.gardeRobot;
  $('#s-today').textContent = `Aujourd'hui : ${(S.playLog && S.playLog[dayKey()]) || 0} min de jeu.`;
}
(function bindExtras() {
  $('#s-rem-add').addEventListener('click', () => {
    const time = $('#s-rem-time').value, text = $('#s-rem-text').value.trim();
    if (!time || !text) { toast("Il faut l'heure et le message"); return; }
    S.settings.reminders = (S.settings.reminders || []).concat({ id: Date.now(), time, text: text.slice(0, 80), days: $('#s-rem-days').value });
    save(); $('#s-rem-text').value = ''; renderReminders();
  });
  $('#s-rem-list').addEventListener('click', e => {
    const b = e.target.closest('[data-unrem]');
    if (b) { S.settings.reminders = (S.settings.reminders || []).filter(x => String(x.id) !== b.dataset.unrem); save(); renderReminders(); }
  });
  $('#s-ev-add').addEventListener('click', () => {
    const date = $('#s-ev-date').value, text = $('#s-ev-text').value.trim();
    if (!date || !text) { toast('Il faut la date et le nom'); return; }
    S.settings.events = (S.settings.events || []).concat({ id: Date.now(), date, text: text.slice(0, 60), yearly: $('#s-ev-yearly').checked });
    save(); $('#s-ev-text').value = ''; renderEvents();
  });
  $('#s-ev-list').addEventListener('click', e => {
    const b = e.target.closest('[data-unev]');
    if (b) { S.settings.events = (S.settings.events || []).filter(x => String(x.id) !== b.dataset.unev); save(); renderEvents(); }
  });
  $('#s-limit').addEventListener('change', () => { S.settings.dailyLimit = +$('#s-limit').value; save(); });
  $('#s-garde').addEventListener('change', () => { S.settings.gardeRobot = $('#s-garde').checked; if (!S.settings.gardeRobot) visits.length = 0; save(); });
  $('#s-bonus').addEventListener('click', () => { daily().bonus = dayKey(); limitDone = ''; save(); toast('+30 minutes pour aujourd’hui ✅'); });
})();
