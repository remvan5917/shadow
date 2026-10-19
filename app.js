/* =========================================================
   SHADOW — le robot (bêta) · Projet SHADOW, un enfant et son papa
   Juste un visage. On lui parle à voix haute, il répond à voix haute.
   « Shadow, on fait des devinettes ! »
   Tout reste sur cet appareil (localStorage).
   ========================================================= */
'use strict';

const STORE_KEY = 'shadow-v1';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const N = t => ORTHO.norm(t);
const name = () => S.prenom || 'mon ami';
const deName = p => (/^[aeiouyhàâéèêëîïôöùûü]/i.test(p) ? `d'${p}` : `de ${p}`);
const dateFR = t => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/* ---------------- mémoire ---------------- */
function fresh() {
  return {
    v: 1,
    prenom: '',
    settings: {
      brain: 'groq', key: '', model: AI.DEFAULT_MODEL,
      localUrl: 'http://localhost:11434/v1', localModel: '',
      sound: true, slow: false, pause: 30, vision: true, ears: 'auto', subtitles: false, micSens: 'haute', lock: false,
      seeCloud: false, visionModel: AI.VISION_MODEL,
    },
    people: [], // visages appris : { id, name, desc: [[128 nombres], …] } — jamais de photo
    journal: [],
    chat: [],
    stats: { words: 0, first: 0, quiz: 0, calc: 0, dev: 0, hunt: 0 },
    cur: null,
    memory: { facts: [], summaries: [], hard: [] }, // la mémoire à long terme (voir MEMOIRE dans cerveau.js)
    memPos: 0, // jusqu'où la conversation a déjà été « rangée » dans la mémoire
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && s.v === 1) {
      const f = fresh();
      const m = { ...f, ...s, settings: { ...f.settings, ...s.settings }, stats: { ...f.stats, ...s.stats } };
      if (!m.settings.model || AI.RETIRED.includes(m.settings.model)) m.settings.model = AI.DEFAULT_MODEL;
      if (!m.settings.visionModel || AI.RETIRED_VISION.includes(m.settings.visionModel)) m.settings.visionModel = AI.VISION_MODEL;
      return m;
    }
  } catch (e) { /* mémoire illisible : on repart à zéro */ }
  return fresh();
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* plein ou bloqué */ } }
let S = load();

/* =================== LE VISAGE =================== */
const face = {
  el: null,
  state: 'sleep',
  set(st) {
    if (!this.el) return;
    this.state = st;
    this.el.classList.remove('idle', 'listen', 'think', 'happy', 'oops', 'sleep', 'sad');
    this.el.classList.add(st);
    this.look(0, 0);
  },
  talk(on) { this.el.classList.toggle('talk', on); },
  look(dx, dy) { $$('#face .look').forEach(g => { g.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : ''; }); },
  // petit moment d'émotion, puis retour à l'expression d'avant
  flash(st, ms = 1800) {
    const back = this.state === st ? 'idle' : this.state;
    this.set(st);
    clearTimeout(this._f);
    this._f = setTimeout(() => this.state === st && this.set(back === 'sleep' ? 'idle' : back), ms);
  },
};
// Il regarde un peu partout quand il attend (sauf s'il suit quelqu'un des yeux)
setInterval(() => {
  if (!face.el || !['idle', 'listen'].includes(face.state) || VISION.state.main) return;
  face.look(pick([-8, -5, 0, 5, 8]), pick([-4, 0, 3]));
  setTimeout(() => !VISION.state.main && face.look(0, 0), 1300);
}, 4300);
// Clignements naturels : irréguliers, parfois doubles
(function blinkLoop() {
  setTimeout(() => {
    const blink = () => { face.el.classList.add('blinking'); setTimeout(() => face.el.classList.remove('blinking'), 130); };
    if (face.el && face.state !== 'sleep') { blink(); if (Math.random() < 0.18) setTimeout(blink, 280); }
    blinkLoop();
  }, 1800 + Math.random() * 4200);
})();

/* =================== LA VOIX =================== */
const LETTER_NAMES = {
  a: 'a', b: 'bé', c: 'cé', d: 'dé', e: 'e', f: 'èfe', g: 'gé', h: 'ache', i: 'i', j: 'ji', k: 'ka', l: 'èle',
  m: 'ème', n: 'ène', o: 'o', p: 'pé', q: 'ku', r: 'ère', s: 'èsse', t: 'té', u: 'u', v: 'vé', w: 'double vé',
  x: 'ixe', y: 'i grec', z: 'zède', "'": 'apostrophe', '-': 'tiret', 'é': 'e accent aigu', 'è': 'e accent grave',
  'ê': 'e accent circonflexe', 'à': 'a accent grave', 'ç': 'cé cédille', 'œ': 'o e collés', 'â': 'a accent circonflexe',
  'î': 'i accent circonflexe', 'ô': 'o accent circonflexe', 'û': 'u accent circonflexe', 'ù': 'u accent grave',
  'ë': 'e tréma', 'ï': 'i tréma',
};
const spellOut = w => [...String(w).toLowerCase()].map(c => LETTER_NAMES[c] || c).join(', ');

const voice = {
  v: null,
  speaking: false,
  ok: true, // false = aucune voix française sur cet appareil → sous-titres obligatoires
  init() {
    if (!('speechSynthesis' in window)) return;
    const choose = () => {
      const vs = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
      this.v = vs.find(v => /fr[-_]FR/i.test(v.lang) && /google|amélie|amelie|thomas|denise|henri|natural|online/i.test(v.name))
        || vs.find(v => /fr[-_]FR/i.test(v.lang)) || vs[0] || null;
    };
    choose();
    speechSynthesis.onvoiceschanged = () => { choose(); this.ok = !!this.v; subtitle(null, null); };
    // Certains navigateurs n'ont aucune voix : Shadow écrit alors ce qu'il dit
    setTimeout(() => { this.ok = !!this.v; subtitle(null, null); }, 1500);
  },
  clean(t) {
    return String(t).replace(/<[^>]+>/g, ' ')
      .replace(/[\u2600-\u27BF\u2B00-\u2BFF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|\uFE0F|\u200D/g, '') // émojis (écrit à l'ancienne pour les vieux téléphones)
      .replace(/n°\s?/g, 'numéro ').replace(/×/g, ' fois ').replace(/−/g, ' moins ')
      .replace(/[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]{2,}/g, m => m.toLowerCase()) // « VALIDÉ » se lit comme un mot, pas lettre par lettre
      .replace(/[«»]/g, ' ').replace(/\s+/g, ' ').trim();
  },
  say(text) {
    return new Promise(res => {
      const t = this.clean(text);
      if (!S.settings.sound || !('speechSynthesis' in window) || !t) return res();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'fr-FR';
      if (this.v) u.voice = this.v;
      u.rate = S.settings.slow ? 0.85 : 1.02;
      u.pitch = 1.1;
      let done = false;
      const end = () => {
        if (done) return;
        done = true; this.speaking = false;
        face.talk(false); face.el.classList.remove('lipsync', 'syl');
        OREILLES.mute(false);
        res();
      };
      u.onstart = () => { this.speaking = true; face.talk(true); };
      // La bouche s'ouvre à chaque mot (si le navigateur donne le rythme des mots)
      u.onboundary = e => {
        if (e.name && e.name !== 'word') return;
        face.el.classList.add('lipsync', 'syl');
        clearTimeout(this._syl);
        this._syl = setTimeout(() => face.el.classList.remove('syl'), Math.min(260, Math.max(90, (e.charLength || 4) * 55)));
      };
      u.onend = end;
      u.onerror = end;
      setTimeout(end, 6000 + t.length * 120);
      OREILLES.mute(true); // il ne s'écoute pas lui-même
      speechSynthesis.speak(u);
    });
  },
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); },
  // première parole silencieuse, faite pendant le geste du doigt
  unlock() {
    if (!('speechSynthesis' in window)) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* rien */ }
  },
};

let lastSaid = '';
let mustShow = false; // un problème à signaler : on l'affiche même sans sous-titres
function subtitle(html, heard) {
  if (heard) $('#heard').textContent = heard;
  if (html !== null) $('#bubble-text').innerHTML = html;
  const empty = !$('#bubble-text').textContent.trim() && !$('#heard').textContent.trim();
  $('#bubble').hidden = empty || !(S.settings.subtitles || !voice.ok || !S.settings.sound || mustShow);
  document.body.classList.toggle('subs', !$('#bubble').hidden);
}
// Shadow parle (et affiche des sous-titres si papa les a activés)
function say(text) {
  lastSaid = text;
  $('#heard').textContent = '';
  subtitle(esc(String(text).replace(/<[^>]+>/g, ' ')), null);
  return voice.say(text);
}

/* =================== SONS ET CONFETTIS =================== */
const fx = {
  ctx: null,
  tone(seq) {
    if (!S.settings.sound) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      let t = c.currentTime;
      for (const [f, d] of seq) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(c.destination);
        o.start(t); o.stop(t + d + 0.02);
        t += d * 0.9;
      }
    } catch (e) { /* pas de son */ }
  },
  ok() { this.tone([[660, 0.12], [880, 0.12], [1320, 0.22]]); },
  oops() { this.tone([[440, 0.16], [330, 0.26]]); },
  wake() { this.tone([[330, 0.1], [495, 0.1], [660, 0.1], [990, 0.2]]); },
  confetti(n = 30) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#4c8dff', '#3ddc84', '#ffd84d', '#ff8f8f', '#b18cff'];
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.style.left = `${Math.random() * 100}vw`;
      s.style.background = pick(colors);
      s.style.setProperty('--dx', `${Math.random() * 160 - 80}px`);
      s.style.animationDuration = `${1.3 + Math.random() * 1.2}s`;
      s.style.animationDelay = `${Math.random() * 0.25}s`;
      $('#fx').appendChild(s);
      setTimeout(() => s.remove(), 3000);
    }
  },
};

/* =================== ÉCOUTER =================== */
// Écoute une phrase. Renvoie le texte, '' si personne n'a parlé, null si l'écoute a été interrompue.
async function hear({ prompt = '', maxWait = 20000, face: f = 'listen', cheap = false, endSilence = 0 } = {}) {
  if (face.state !== 'sleep' || f === 'sleep') face.set(f);
  // Whisper comprend mieux s'il sait de quoi on parle : on lui donne la dernière phrase de Shadow
  const ctxPrompt = prompt || `Conversation en français avec Shadow, un robot, et ${name()}. Shadow : ${voice.clean(lastSaid).slice(-200)}`;
  let r = await OREILLES.listen({ prompt: ctxPrompt, maxWait, cheap, endSilence: endSilence || (prompt === SPELL_PROMPT ? 2.2 : 0.9) });
  if (typeof r === 'string' && r && isEcho(r)) { OREILLES.takePrint(); r = await OREILLES.listen({ prompt: ctxPrompt, maxWait, endSilence: 0.9 }); }
  face.el.classList.remove('hearing');
  if (r && typeof r === 'object') {
    face.set('oops');
    mustShow = true;
    if (r.status === 429) {
      // limite de Groq atteinte : il le dit une fois, puis se repose sans répéter
      if (Date.now() - (dlg.tiredAt || 0) > 120000) { dlg.tiredAt = Date.now(); await say("Mes oreilles sont fatiguées, Groq me demande de me reposer un peu. Je reviens dans une minute !"); }
      await wait(Math.max(20, Math.min(r.retryAfter || 60, 300)) * 1000);
      mustShow = false;
      return '';
    }
    if (r.status === 401 || r.status === 403) await say("Ma clé d'intelligence est refusée. Papa doit vérifier la clé Groq dans les réglages.");
    else if (r.error === 'no-ears') await say("Je n'ai pas d'oreilles sur cet appareil. Papa doit mettre la clé Groq dans les réglages.");
    else if (r.error === 'not-allowed') await say('Mes oreilles sont bloquées. Il faut autoriser le micro, demande à papa.');
    else await say('Oups, mes oreilles ont un petit souci. Je réessaie.');
    await wait(4000);
    return '';
  }
  mustShow = false;
  if (r) { subtitle(null, `🎤 « ${r} »`); whoSpoke(); }
  return r;
}
// Sa propre voix qui revient du haut-parleur : on la reconnaît et on l'ignore
function isEcho(t) {
  const words = s => N(s).split(' ').filter(w => w.length > 2);
  const a = words(t), b = new Set(words(lastSaid));
  if (a.length < 2 || !b.size) return false;
  return a.filter(w => b.has(w)).length / a.length > 0.7;
}
// Qui vient de parler ? (empreinte de voix + ce que voit la caméra)
let lastPrint = null, voiceLearnAt = 0;
function whoSpoke() {
  const vp = OREILLES.takePrint();
  lastPrint = vp;
  if (!vp) return;
  const id = VOIX.identify(vp);
  const faces = VISION.state.faces;
  const seenName = faces.length === 1 && faces[0].name ? faces[0].name : '';
  if (id) { dlg.speaker = id.name; dlg.speakerAt = Date.now(); }
  else if (seenName && !VOIX.people().length) { dlg.speaker = seenName; dlg.speakerAt = Date.now(); }
  // il affine la voix de la personne qu'il voit parler (au plus une fois par minute)
  if (seenName && Date.now() - voiceLearnAt > 60000 && (!id || id.name === seenName) && VOIX.learn(seenName, vp)) voiceLearnAt = Date.now();
}
const speakerNow = () => (dlg.speaker && Date.now() - dlg.speakerAt < 90000 ? dlg.speaker : '');

OREILLES.on('thinking', () => {
  face.el.classList.remove('hearing');
  if (['listen', 'idle'].includes(face.state)) { face.set('think'); fx.tone([[1175, 0.06]]); } // « bip » : je t'ai entendu
});
// Dès qu'il entend une voix, sa crête s'allume fort : on sait qu'il écoute
OREILLES.on('speech', () => face.el.classList.add('hearing'));
OREILLES.on('speechend', () => face.el.classList.remove('hearing'));

/* =================== LA CONVERSATION =================== */
// sleep : il dort · standby : réveillé, attend « Shadow » · talk : on discute · activity : un jeu est en cours
const dlg = { state: 'sleep', busy: false, silence: 0, lastActive: Date.now(), sayNext: null, expect: null, started: false, greeted: 0 };

class Stop extends Error {}
const RE = {
  wake: /\b(he |hey |eh |e |o |oh |bonjour |salut |coucou )?(shadow|shadows|chadow|shado|chado|shadoo|shadoe|shadou|chadou|chadoo|chadeau|chat d eau|chat dos|sha do|cha do|chat do|shad|chad|chadow|shadow s)\b/,
  stop: /\b(stop|arrete|arretes|arreter|ca suffit|j en ai marre|on arrete)\b/,
  repeat: /\b(repete|repeter|redis|redire|pas compris|j ai pas entendu|tu peux repeter)\b/,
  yes: /\b(oui|ouais|ouai|yes|ok|okay|d accord|dac|c est ca|exact|exactement|bien sur|voila|carrement|vas y|allez|go)\b/,
  no: /\b(non|nan|nope|pas ca|c est pas ca|pas du tout|faux)\b/,
  sleep: /\b(va dormir|dodo|fais dodo|bonne nuit|au revoir|a plus tard|a tout a l heure|tu peux dormir|endors toi|mode veille|va te coucher)\b/,
  help: /\b(qu est ce que tu sais faire|que sais tu faire|tu sais faire quoi|qu est ce qu on peut faire|on fait quoi|qu est ce qu on fait|propose moi|j ai rien a faire|je m ennuie)\b/,
  readJournal: /\b(lis|lire|relis|montre|affiche|ouvre)\b.*\bjournal\b/,
  closeJournal: /\b(ferme|cache|range)\b.*\bjournal\b/,
  journal: /\b(mon journal|le journal|dans le journal|on ecrit|ecrire une phrase|ecrire dans|epeler|on epelle|orthographe)\b/,
  animal: /\b(devine l animal|je pense a un animal|pense a un animal|devine a quel animal)\b/,
  devinette: /\bdevinette/,
  calc: /\b(calcul|calculs|maths|math|mathematiques|addition|additions|soustraction|soustractions|multiplication|multiplications|tables?|complements?)\b/,
  quiz: /\b(quiz|quizz|questionnaire|pose moi des questions|on fait des questions)\b/,
  learn: /\b(apprends moi|parle moi|explique moi|raconte moi des choses|je veux apprendre|tu m apprends)\b/,
  story: /\b(une histoire|invente une histoire|inventer une histoire|on invente)\b/,
  meet: /\b(apprends (mon|ton|son|le) visage|souviens toi de (moi|mon visage)|retiens mon visage|faire connaissance|fais connaissance|on fait connaissance|enregistre mon visage|memorise mon visage)\b/,
  who: /\b(tu me reconnais|qui je suis|qui suis je|tu sais qui je suis|qui tu vois|tu vois qui|qui est la|tu me vois)\b/,
  what: /(\bqu est ce que tu vois\b|\btu vois quoi\b|\bc est quoi ca\b|^qu est ce que c est( ca)?$|\bregarde (ca|ce que|mon|ma|mes)\b|\bqu est ce que je tiens\b|\bqu est ce que j ai dans la main\b|\btu vois ca\b|\bdevine ce que (je|j ai)\b)/,
  hunt: /\b(chasse au tresor|cherche un objet|va chercher|jeu des objets|trouve un objet|apporte|chasse aux objets)\b/,
  time: /\b(quelle heure|l heure qu il est)\b/,
  date: /\b(quel jour|on est quel jour|la date|quel mois)\b/,
  maison: /\b(allume|eteins|eteint|ouvre|ferme|monte|baisse)\b.*\b(lumiere|lumieres|lampe|volets?|television|tele|chauffage|radio)\b/,
  dance: /\b(danse|danser)\b/,
  move: /^(avance|recule|tourne a (gauche|droite)|viens ici|viens vers moi|deplace toi|roule|bouge)\b/,
  joke: /\b(blague|blagues|fais moi rire|un truc drole)\b/,
  name: /\b(comment tu t appelles|c est quoi ton nom|tu t appelles comment|qui es tu|t es qui)\b/,
  hello: /^(bonjour|salut|coucou|hello|yo|bonsoir)\b/,
  howareyou: /\b(ca va|comment vas tu|comment tu vas|tu vas bien)\b/,
  thanks: /\b(merci)\b/,
  voiceLearn: /\b(apprends ma voix|retiens ma voix|enregistre ma voix|memorise ma voix|apprends a reconnaitre ma voix|apprendre ma voix)\b/,
  whoTalks: /\b(qui parle|tu reconnais ma voix|c est qui qui parle|qui c est qui parle|tu sais qui parle|c est quelle voix)\b/,
  bedtime: /\b(histoire du soir|histoire pour dormir|histoire pour m endormir|je vais me coucher|je vais dormir|je vais au lit)\b/,
  motJour: /\bmot du jour\b/,
  dicteeMots: /\b(dictee|dictees|mots de l ecole|mots du ce1|mots du ce un|une dictee)\b/,
  lecture: /\b(lecture|on lit|je veux lire|lire un texte|lire une histoire|je vais lire|je lis)\b/,
  heureJeu: /\b(lire l heure|apprendre l heure|apprends moi l heure|jeu de l heure|l horloge|une horloge)\b/,
  anglais: /\b(anglais|english)\b/,
  jacques: /\bjacques a dit\b/,
  emotions: /\b(jeu des emotions|les emotions|des grimaces|faire des grimaces)\b/,
  pfc: /\b(pierre feuille ciseaux?|chifoumi|pierre papier ciseaux?)\b/,
  cris: /\b(cris? d animaux|cris? des animaux|bruits? d animaux|devine l animal a son cri)\b/,
  doigts: /\b(doigts|avec mes doigts|avec les doigts)\b/,
  couleur: /\b(de quelle couleur|c est quelle couleur|quelle couleur (est|a|il|elle))\b/,
  chanter: /\b(chante|chanter|chanson|chansons|comptine|comptines)\b/,
  calendrier: /\b(combien de (jours|dodos)|dans combien de|c est quand|mon anniversaire|calendrier)\b/,
  visites: /\b(qui est venu|qui est passe|tu as vu qui|qui tu as vu)\b/,
  heros: /\b(dont je suis le heros|ou je suis le heros|je suis le heros|histoire a choix|une aventure|mon aventure)\b/,
  remember: /\b(souviens toi que|retiens que|n oublie pas que|rappelle toi que|souviens toi bien que|note que)\b/,
  recall: /\b(qu est ce que tu sais (sur|de) moi|tu te souviens de quoi|qu est ce que tu te rappelles|tu te souviens de moi|qu est ce que tu sais de moi|ta memoire)\b/,
  forget: /\b(oublie tout|efface ta memoire|vide ta memoire)\b/,
  revise: /\b(mots difficiles|reviser|revision|on revise|mes mots)\b/,
  dontknow: /\b(je sais pas|je ne sais pas|aucune idee|langue au chat|donne la reponse|dis moi la reponse|c est quoi la reponse|j abandonne|je donne ma langue)\b/,
};
const isNo = t => RE.no.test(N(t));
const isYes = t => !isNo(t) && RE.yes.test(N(t));

// Pose une question et attend la réponse (gère « stop », « répète » et les silences)
async function ask(text, { prompt = '', wait: w = 20000, retry = 1 } = {}) {
  let line = text, misses = 0;
  for (;;) {
    await say(line);
    const a = await hear({ prompt, maxWait: w });
    if (a === null) {
      if (dlg.state === 'activity') { line = text; continue; } // on a touché l'écran : il répète
      throw new Stop('cancel');
    }
    if (!a) {
      if (++misses > retry) throw new Stop('silence');
      line = `Tu es là, ${name()} ? ${text}`;
      continue;
    }
    if (RE.stop.test(N(a))) throw new Stop('stop');
    if (RE.repeat.test(N(a))) { line = text; continue; }
    face.set('idle');
    return a;
  }
}
async function askYesNo(text, opts) {
  for (let i = 0; i < 2; i++) {
    const a = await ask(i ? `Dis-moi oui ou non. ${text}` : text, opts);
    if (isYes(a)) return true;
    if (isNo(a)) return false;
  }
  return false;
}

async function activity(fn) {
  dlg.state = 'activity';
  try {
    await fn();
    if (dlg.state === 'activity') dlg.state = 'talk';
  } catch (e) {
    if (!(e instanceof Stop)) {
      console.error(e);
      face.set('oops');
      await say("Oups, j'ai eu un petit bug dans mes circuits !");
      dlg.state = 'talk';
      return;
    }
    if (e.message === 'stop') { face.set('happy'); await say("D'accord, on arrête ! Qu'est-ce qu'on fait maintenant ?"); dlg.state = 'talk'; }
    else if (e.message === 'silence') { face.set('idle'); await say('Je fais une petite pause. Dis « Shadow » quand tu veux continuer !'); dlg.state = 'standby'; }
  }
}

// La boucle de vie de Shadow : il écoute, comprend, répond… tout le temps.
async function life() {
  for (;;) {
    if (dlg.sayNext) { const s = dlg.sayNext; dlg.sayNext = null; if (typeof s === 'function') await s(); else await say(s); }
    if (dlg.state === 'sleep') {
      // Endormi : il se réveille si on l'appelle « Shadow » (ou s'il voit quelqu'un, ou si on le touche)
      const t = await hear({ maxWait: 60000, face: 'sleep', cheap: true });
      if (t && RE.wake.test(N(t)) && dlg.state === 'sleep') wake();
      continue;
    }
    const talk = dlg.state === 'talk';
    const t = await hear({ maxWait: talk ? 25000 : 60000, face: talk ? 'listen' : 'idle', cheap: !talk });
    if (t === null || dlg.state === 'sleep') continue;
    if (!t) {
      if (talk && ++dlg.silence >= 2) toStandby();
      else if (!talk && Date.now() - dlg.lastActive > 6 * 60000 && !VISION.state.faces.length) goSleep(false);
      continue;
    }
    let text = t;
    const n = N(text), m = n.match(RE.wake);
    if (!talk) {
      // En attente : il ne répond que si on dit son nom
      if (!m) continue;
      text = n.slice(m.index + m[0].length).trim();
      dlg.state = 'talk';
      if (!text) { face.set('happy'); dlg.silence = 0; const w = speakerNow(); await say(w ? pick([`Oui ${w} ? Je t'écoute !`, `Bip ! Oui ${w} ?`]) : pick(["Oui ? Je t'écoute !", 'Bip ! Oui ?', 'Je suis là !'])); continue; }
    } else if (m && m.index === 0) {
      // le nom au début de la phrase ne compte pas : « Shadow, on joue ? »
      text = n.slice(m[0].length).trim() || text;
    }
    dlg.silence = 0;
    dlg.lastActive = Date.now();
    dlg.busy = true;
    try { await handle(text); } catch (e) { console.error(e); } finally { dlg.busy = false; }
  }
}

// Range la conversation récente dans la mémoire à long terme (en arrière-plan)
function memorize(force) {
  if (S.memPos > S.chat.length) S.memPos = 0;
  const news = S.chat.slice(S.memPos).filter(m => !m.hidden);
  if (news.filter(m => m.role === 'user').length < (force ? 1 : 2)) return;
  S.memPos = S.chat.length; save();
  MEMOIRE.consolidate(news).catch(e => console.warn('mémoire', e));
}
function toStandby() {
  memorize(true);
  dlg.state = 'standby';
  face.set('idle');
  say('Je reste là. Dis « Shadow » quand tu veux me parler !');
}
function wake(who) {
  if (dlg.state !== 'sleep') return;
  if (limitReached()) { // temps de jeu du jour fini : il reste endormi
    if (Date.now() - (dlg.limitSaidAt || 0) > 120000) { dlg.limitSaidAt = Date.now(); say(`On a bien joué aujourd'hui, ${name()} ! On se retrouve demain.`).then(() => face.set('sleep')); }
    return;
  }
  sessionStart = Date.now(); pauseDone = false;
  dlg.state = 'talk'; dlg.silence = 0; dlg.lastActive = Date.now();
  fx.wake(); face.set('happy');
  dlg.sayNext = async () => { await memoryGreeting(who); await dailyNews(); };
  OREILLES.cancel();
}
// Les nouvelles du jour, une fois par jour : mot du jour, calendrier, humeur
async function dailyNews() {
  const d = daily(), k = dayKey();
  if (d.cal !== k) {
    d.cal = k; save();
    const up = upcoming(14)[0];
    if (up) { if (!up.days) { face.set('happy'); fx.confetti(60); } await say(dodos(up)); }
  }
  if (d.mot !== k) { d.mot = k; save(); await say(motDuJourText()); }
  if (moodQuestionDue()) { dlg.moodPending = true; await say("Au fait, comment s'est passée ta journée ?"); }
}
function goSleep(withWords = true) {
  memorize(true);
  dlg.state = 'sleep';
  OREILLES.cancel();
  if (withWords) {
    say(pick([`Bonne nuit ${name()} ! Bip… bip… zzz.`, 'À plus tard ! Je fais une petite sieste.', 'Au revoir ! Appelle-moi quand tu veux.']))
      .then(() => dlg.state === 'sleep' && face.set('sleep'));
  } else face.set('sleep');
}
// Bonjour « avec souvenirs » : le grand cerveau peut parler de ce qu'il a retenu
async function memoryGreeting(who) {
  const n = who || name();
  if (dlg.greeted === 0 || !AI.ready() || !MEMOIRE.data().facts.length && !MEMOIRE.data().summaries.length) return say(greeting(who));
  dlg.greeted++;
  face.set('happy');
  try {
    const r = await Promise.race([
      AI.chat([{ role: 'system', content: CERVEAU.personality() + MEMOIRE.context() },
        { role: 'user', content: `(${n} vient d'arriver devant toi.) Dis-lui bonjour en 1 ou 2 phrases courtes. Si c'est naturel, parle d'un souvenir de ta mémoire (une question sur un événement prévu, un goût…). Termine par une proposition ou une question.` }],
      { maxTokens: 120, temperature: 0.6 }),
      wait(5000).then(() => ''),
    ]);
    if (r) return say(ETHIQUE.safe(r));
  } catch (e) { /* on dit bonjour normalement */ }
  dlg.greeted--;
  return say(greeting(who));
}
function greeting(who) {
  const n = who || name();
  const pod = partOfDay();
  const hello = pod === 'matin' ? pick([`Bonjour ${n} ! Tu as bien dormi ?`, `Bip ! Bonjour ${n}, mes circuits se réveillent avec toi !`]) : pod === 'soir' ? pick([`Bonsoir ${n} !`, `Bip ! Bonsoir ${n}, tu as passé une bonne journée ?`]) : pick([`Coucou ${n} !`, `Bip-bip ! Salut ${n} !`]);
  dlg.greeted++;
  if (dlg.greeted === 1) return `${hello} C'est moi, Shadow. On peut discuter, écrire ton journal, faire une dictée, lire, jouer à Jacques a dit, des devinettes, du calcul, de l'anglais… Qu'est-ce qui te ferait plaisir ?`;
  return `${hello} ${pick(["Qu'est-ce qu'on fait ?", 'On joue ?', "Je t'écoute."])}`;
}

/* ---------- comprendre ce qu'on lui dit ---------- */
async function handle(text) {
  const n = N(text);
  // « euh », « hum »… : ce n'est pas une phrase, il continue d'écouter sans répondre
  if (/^(euh+|heu+|hum+|hm+|ben|bah|ah|oh|eh|mmh+|pff+)$/.test(n)) return;
  if (dlg.expect && Date.now() < dlg.expect.until) {
    const ex = dlg.expect;
    dlg.expect = null;
    if (isYes(text)) return ex.run();
    if (isNo(text)) return say("D'accord ! Une autre fois.");
  }
  dlg.expect = null;
  // « comment s'est passée ta journée ? » : si la réponse n'est pas une demande de jeu, c'est l'humeur du jour
  const moodWas = dlg.moodPending;
  dlg.moodPending = false;
  if (RE.bedtime.test(n)) return histoireSoirFlow();
  if (RE.sleep.test(n)) return goSleep();
  if (RE.stop.test(n)) { closeJournal(); return say("D'accord ! Je t'écoute si tu as besoin."); }
  if (RE.repeat.test(n)) return say(lastSaid || "Je n'ai encore rien dit !");
  if (RE.help.test(n)) return say("Je sais plein de choses ! Discuter, écrire ton journal, faire une dictée, t'écouter lire, apprendre l'heure, l'anglais, les tables et le calcul, des quiz, des devinettes, les cris d'animaux, Jacques a dit, pierre-feuille-ciseaux, compter avec tes doigts, le jeu des émotions, dire les couleurs, chanter des comptines et raconter des histoires. Dis-moi ce que tu veux !");
  if (RE.motJour.test(n)) return say(motDuJourText());
  if (RE.dicteeMots.test(n)) return activity(dicteeMotsFlow);
  if (RE.lecture.test(n)) return activity(lectureFlow);
  if (RE.heureJeu.test(n)) return activity(heureFlow);
  if (RE.anglais.test(n)) return activity(anglaisFlow);
  if (RE.jacques.test(n)) return activity(jacquesFlow);
  if (RE.emotions.test(n)) return activity(emotionsFlow);
  if (RE.pfc.test(n)) return activity(pfcFlow);
  if (RE.cris.test(n)) return activity(crisFlow);
  if (RE.doigts.test(n)) return activity(doigtsFlow);
  if (RE.couleur.test(n)) return couleurFlow(text);
  if (RE.chanter.test(n)) return chanterFlow(text);
  if (RE.calendrier.test(n)) return calendrierAnswer(text);
  if (RE.visites.test(n)) return say(!S.settings.gardeRobot ? "Je ne fais pas le garde-robot : papa ne l'a pas activé." : visitsSince(Date.now() - 12 * 3600000).length ? `J'ai vu ${visitsText(visitsSince(Date.now() - 12 * 3600000))}.` : "Je n'ai vu personne que je connais.");
  if (RE.heros.test(n)) return AI.ready() ? chatReply(heroSeed(), true) : say("Pour inventer une aventure dont tu es le héros, j'ai besoin de mon grand cerveau. En attendant, on fait des devinettes ?");
  if (RE.closeJournal.test(n)) { closeJournal(); return say("C'est rangé !"); }
  if (RE.readJournal.test(n)) return readJournal();
  if (RE.meet.test(n)) return activity(meetFlow);
  if (RE.voiceLearn.test(n)) return activity(voiceFlow);
  if (RE.whoTalks.test(n)) return whoTalks();
  if (RE.remember.test(n)) return rememberThat(text);
  if (RE.recall.test(n)) return recall();
  if (RE.forget.test(n)) { face.flash('oops'); return say("Ma mémoire, c'est précieux ! Seul papa peut l'effacer, dans les réglages."); }
  if (RE.revise.test(n)) return activity(reviseFlow);
  if (RE.who.test(n)) return whoFlow();
  if (RE.hunt.test(n)) return activity(huntFlow);
  if (RE.what.test(n)) return whatFlow();
  if (RE.journal.test(n)) return activity(journalFlow);
  if (RE.animal.test(n)) return chatReply(SEEDS.animal(), true);
  if (RE.devinette.test(n)) return activity(devinetteFlow);
  if (RE.calc.test(n)) return activity(() => calcFlow(calcKind(n)));
  const th = themeOf(n);
  if (RE.quiz.test(n) || (RE.learn.test(n) && th && !AI.ready())) return activity(() => quizFlow(th));
  if (RE.story.test(n) && AI.ready()) return chatReply(SEEDS.histoire(), true);
  if (RE.time.test(n)) { const d = new Date(); return say(`Il est ${d.getHours()} heure${d.getHours() > 1 ? 's' : ''} ${d.getMinutes() || ''}.`); }
  if (RE.date.test(n)) return say(`Nous sommes ${dateFR(Date.now())}.`);
  if (RE.dance.test(n)) return dance();
  if (RE.maison.test(n)) { const r = await CORPS.maison(); face.flash('oops'); return say(`${r.raison} Mais bientôt, avec papa, je pourrai le faire !`); }
  if (RE.move.test(n)) { const r = await CORPS.bouger(); face.flash('oops'); return say(`${r.raison} Quand papa et toi m'aurez fabriqué un corps, je pourrai me déplacer !`); }
  if (RE.joke.test(n) && !AI.ready()) return say(pick(JOKES));
  if (moodWas && n.split(' ').length > 1) return moodAnswer(text);
  return chatReply(text);
}

const THEME_RE = {
  animaux: /\b(animal|animaux|betes?|chiens?|chats?|lions?|oiseaux?|poissons?)\b/,
  espace: /\b(espace|planetes?|etoiles?|lune|soleil|fusees?|astronautes?|mars)\b/,
  corps: /\b(corps|squelette|os|coeur|dents?|muscles?)\b/,
  nature: /\b(nature|plantes?|arbres?|fleurs?|saisons?|meteo|insectes?)\b/,
  monde: /\b(monde|france|pays|capitales?|oceans?|drapeaux?|geographie)\b/,
  robots: /\b(robots?|sciences?|aimants?|wifi|electricite|batteries?)\b/,
};
const themeOf = n => Object.keys(THEME_RE).find(k => THEME_RE[k].test(n)) || '';

const JOKES = [
  "Pourquoi les robots ne sont jamais fatigués ? Parce qu'ils ont toujours la pile ! Hi hi !",
  "Qu'est-ce qu'un robot met sur ses tartines ? De la confiture de boulons !",
  "Que dit un zéro à un huit ? Oh, tu as mis une jolie ceinture !",
  "Pourquoi le livre de maths est-il triste ? Parce qu'il a beaucoup de problèmes !",
  "Quel est l'animal le plus heureux ? Le hibou, parce que sa femme est chouette !",
];

async function dance() {
  face.set('happy');
  face.el.classList.add('dance');
  fx.tone([[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.3], [784, 0.15], [1047, 0.4]]);
  await say("Je n'ai pas encore de jambes, mais regarde : je danse avec mes yeux ! Bip bop, bip bop !");
  setTimeout(() => face.el.classList.remove('dance'), 2500);
}

/* ---------- discuter (le grand cerveau) ---------- */
const SEEDS = {
  histoire: () => `(${name()} veut inventer une histoire.) Propose d'inventer une histoire ensemble : commence par 2 phrases rigolotes, puis demande-lui ce qui se passe ensuite.`,
  animal: () => `(${name()} veut jouer à « devine l'animal ».) Pense à un animal connu des enfants, sans dire lequel. ${name()} va te poser des questions, tu réponds par oui ou non avec un petit indice. Quand il trouve, félicite-le. Commence par expliquer la règle en une phrase.`,
};
const OFFLINE = [
  [RE.hello, () => `Bonjour ${name()} ! Comment ça va ?`],
  [RE.howareyou, () => 'Mes circuits vont très bien, merci ! Et toi ?'],
  [RE.name, () => `Je m'appelle Shadow ! C'est ${name()} et son papa qui m'ont inventé.`],
  [RE.thanks, () => 'Avec plaisir !'],
  [RE.joke, () => pick(JOKES)],
];
async function chatReply(text, hidden = false) {
  if (!AI.ready()) {
    const n = N(text);
    const hit = OFFLINE.find(([re]) => re.test(n));
    if (hit) return say(hit[1]());
    face.flash('oops');
    return say("Mon grand cerveau n'est pas branché, alors je ne comprends pas tout. Mais je sais faire une dictée, lire avec toi, l'heure, l'anglais, les tables, des quiz, des devinettes, Jacques a dit, des comptines… Dis « qu'est-ce que tu sais faire » pour tout savoir !");
  }
  const m = hidden ? { text, hidden: false } : PRIVE.mask(text);
  S.chat.push({ role: 'user', content: m.text, hidden });
  if (S.chat.length > 60) { const cut = S.chat.length - 60; S.chat = S.chat.slice(-60); S.memPos = Math.max(0, S.memPos - cut); }
  save();
  if (m.hidden) await say("Chut ! Ça, c'est un secret de famille : je ne l'ai pas envoyé à mon cerveau.");
  face.set('think');
  try {
    const vus = VISION.state.faces.map(f => f.name).filter(Boolean);
    const who = speakerNow();
    const now = new Date();
    const facts = `\n\nInfos vraies du moment (sers-t'en, n'en invente pas d'autres) : il est ${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}. Tes yeux sont ${VISION.isOn() ? 'ouverts' : 'fermés'}${vus.length ? `, tu vois ${vus.join(', ')}` : ''}. Tu n'as ni Internet, ni la météo, ni les actualités, ni de corps pour l'instant. ${(() => { const m = motDuJour(); const up = upcoming(30).slice(0, 3).map(x => `${x.e.text} dans ${x.days} jour${x.days > 1 ? 's' : ''}`); return `Le mot du jour est « ${m.mot} » (${m.def}).${up.length ? ` Calendrier : ${up.join(', ')}.` : ''}`; })()}`;
    const sys = CERVEAU.personality() + MEMOIRE.context() + facts + (vus.length ? `\n\n(En ce moment, ta caméra reconnaît : ${vus.join(', ')}.)` : '')
      + (who ? `\n\n(À sa voix, tu reconnais que c'est ${who} qui te parle${who !== name() ? ` (pas ${name()})` : ''}. Adresse-toi à ${who}.)` : '');
    const msgs = [{ role: 'system', content: sys }, ...S.chat.slice(-16).map(({ role, content }) => ({ role, content }))];
    // Il commence à parler dès que la 1re phrase est prête (la suite arrive pendant qu'il parle)
    let queue = Promise.resolve(), bad = false, spoken = 0;
    const onSentence = sentence => {
      if (bad || !sentence) return;
      if (ETHIQUE.safe(sentence) !== sentence) { bad = true; return; }
      if (!spoken++) face.set(/bravo|génial|super|youpi|hourra|gagné|trouvé/i.test(sentence) ? 'happy' : 'idle');
      queue = queue.then(() => say(sentence));
    };
    let raw;
    try {
      raw = await AI.chatStream(msgs, { maxTokens: 200, temperature: 0.55 }, onSentence);
    } catch (e) {
      if (spoken) throw e;
      raw = await AI.chat(msgs, { maxTokens: 200, temperature: 0.55 }); // secours sans « mot à mot »
      onSentence(raw);
    }
    await queue;
    const reply = bad ? "Hum, ça c'est un sujet pour en parler avec papa. Et si on jouait à un jeu ?" : (raw || "Bip… j'ai perdu le fil. Tu peux répéter ?");
    if (bad || !spoken) await say(reply);
    S.chat.push({ role: 'assistant', content: reply });
    save();
    if (S.chat.length - S.memPos >= 16) memorize(); // longue discussion : on range au fur et à mesure
  } catch (e) {
    face.set('oops');
    // un message qui dit la VRAIE cause (et le code d'erreur pour papa, en sous-titre)
    const st = e.status || 0;
    const why = st === 401 || st === 403 ? "Ma clé d'intelligence est refusée. Demande à papa de vérifier la clé Groq dans les réglages."
      : st === 429 ? `Mon cerveau est fatigué : j'ai beaucoup parlé aujourd'hui, Groq me demande de me reposer. Réessaie ${e.retryAfter > 300 ? `dans environ ${e.retryAfter >= 5400 ? `${Math.round(e.retryAfter / 3600)} heures` : `${Math.max(1, Math.round(e.retryAfter / 60))} minutes`}` : 'dans quelques minutes'} ! En attendant, on peut jouer aux devinettes ou faire du calcul.`
        : st >= 500 ? "Le cerveau de Groq a un petit souci de son côté. Réessaie dans un moment."
          : /connexion|WiFi|Trop long/i.test(e.message) ? 'Oups, je ne capte pas Internet. Le WiFi est peut-être coupé.'
            : "Oups, mon cerveau ne répond pas.";
    mustShow = true;
    await say(why);
    subtitle(esc(`${why} (${e.message.slice(0, 120)})`), null);
    mustShow = false;
    console.warn('cerveau', e);
  }
}

/* =================== LA MÉMOIRE (à voix haute) =================== */
// « Souviens-toi que mon chat s'appelle Moustache »
async function rememberThat(text) {
  const m = String(text).match(/(souviens[- ]toi (bien )?que|retiens que|n'?\s?oublie pas que|rappelle[- ]toi que|note que)\s+(.+)/i);
  let fact = m ? m[3].trim() : '';
  if (!fact) return say("Qu'est-ce que je dois retenir ? Dis-moi « souviens-toi que », puis la chose à retenir.");
  // « mon chat… » → « le chat de (prénom)… » (pour que le souvenir reste clair plus tard)
  const n = name();
  fact = fact.replace(/\b(mon|ma|mes)\b/gi, w => ({ mon: 'le', ma: 'la', mes: 'les' })[w.toLowerCase()] + '') ;
  fact = `${n} : ${fact.charAt(0).toUpperCase()}${fact.slice(1)}`.replace(/[.!]*$/, '.');
  if (MEMOIRE.add(fact, n, 'enfant')) { face.set('happy'); fx.ok(); return say("C'est rangé dans ma mémoire ! Je ne l'oublierai pas."); }
  face.flash('oops');
  return say(PRIVE.mask(fact).hidden ? "Ça, c'est un secret de famille : je préfère ne pas le garder dans ma mémoire." : 'Je le savais déjà !');
}
async function recall() {
  const m = MEMOIRE.data();
  if (!m.facts.length) return say("Ma mémoire est encore toute neuve ! Raconte-moi des choses sur toi, ou dis « souviens-toi que… ».");
  face.set('happy');
  if (AI.ready()) {
    try {
      const r = await AI.chat([{ role: 'system', content: CERVEAU.personality() + MEMOIRE.context() },
        { role: 'user', content: `(${name()} te demande ce dont tu te souviens.) Raconte-lui 3 ou 4 choses de ta mémoire, joyeusement, en lui parlant (« tu adores… »). 3 phrases maximum.` }], { maxTokens: 200 });
      if (r) return say(ETHIQUE.safe(r));
    } catch (e) { /* on lit la mémoire telle quelle */ }
  }
  return say(`Je me souviens de plein de choses ! ${m.facts.slice(-4).map(f => f.text).join(' ')}`);
}
// « On révise mes mots difficiles »
async function reviseFlow() {
  const hard = MEMOIRE.data().hard.slice(-5);
  if (!hard.length) return say("Tu n'as pas de mots difficiles en ce moment. Bravo ! On écrit dans ton journal ?");
  await say(`On révise ! Tu as ${hard.length} mot${hard.length > 1 ? 's' : ''} qui t'ont donné du fil à retordre. On essaie encore ?`);
  for (const h of hard) {
    const c = { text: h.t, words: [], tries: 0, hints: [] };
    await spellWord(c, { w: h.t, t: h.t, spell: true });
  }
  face.set('happy'); fx.confetti(40);
  await say('Révision terminée ! Ton cerveau devient de plus en plus fort.');
}

/* =================== LES VOIX =================== */
async function voiceFlow() {
  if (OREILLES.engine() !== 'whisper') return say("Pour reconnaître les voix, j'ai besoin de mes oreilles Whisper : papa doit mettre la clé Groq dans les réglages.");
  let who = '';
  const faces = VISION.state.faces;
  if (faces.length === 1 && faces[0].name && (await askYesNo(`Je vois ${faces[0].name}. C'est ta voix que j'apprends ?`))) who = faces[0].name;
  while (!who) {
    const n = cleanName(await ask("D'accord ! Comment tu t'appelles ?", { wait: 20000 }));
    if (n && (await askYesNo(`Tu t'appelles ${n} ? C'est bien ça ?`))) who = n;
  }
  const prompts = ["Super ! Raconte-moi ce que tu as mangé aujourd'hui.", 'Maintenant, dis-moi ton animal préféré, et pourquoi.', "Et pour finir, compte jusqu'à dix."];
  const prints = [];
  for (const q of prompts) {
    let line = q;
    for (let tries = 0; tries < 2; tries++) {
      await ask(line, { wait: 25000 });
      if (lastPrint) { prints.push(lastPrint); lastPrint = null; break; }
      line = 'Parle un peu plus longtemps, pour que je connaisse bien ta voix !';
    }
  }
  if (prints.length < 2) { face.flash('oops'); return say("Je n'ai pas assez bien entendu ta voix. On réessaiera, dans un endroit plus calme !"); }
  VOIX.enroll(who, prints);
  dlg.speaker = who; dlg.speakerAt = Date.now();
  face.set('happy'); fx.ok(); fx.confetti(30);
  await say(`Ça y est, je connais ta voix, ${who} ! Maintenant, je saurai quand c'est toi qui me parles.`);
}
async function whoTalks() {
  if (!VOIX.people().length) return say("Je ne connais encore aucune voix. Dis « apprends ma voix » et je la retiens !");
  const id = lastPrint ? VOIX.identify(lastPrint) : null;
  if (id) { face.set('happy'); return say(id.sure ? `C'est toi, ${id.name} ! Je reconnais ta voix.` : `Je crois que c'est toi, ${id.name}. Je me trompe ?`); }
  face.flash('oops');
  return say("Hmm, je ne reconnais pas bien cette voix. Tu veux que je l'apprenne ? Dis « apprends ma voix ».");
}

/* =================== LE JOURNAL (épeler à voix haute) =================== */
const SPELL_PROMPT = 'Épellation lettre par lettre : B, A, T, E, A, U. P, E, T, I, T. É, C, O, L, E. M, A, I, S, O, N.';

async function journalFlow() {
  if (S.cur && S.cur.words.some(w => w.spell && !w.done)) {
    if (!(await askYesNo('On continue la phrase de ton journal que tu avais commencée ?'))) S.cur = null;
  } else S.cur = null;

  for (;;) {
    if (!S.cur) {
      let sentence = null;
      let q = 'Super, on écrit dans ton journal ! Quelle phrase veux-tu écrire ?';
      while (!sentence) {
        const t = await ask(q, { wait: 25000 });
        const words = ORTHO.tokenize(t).slice(0, 20);
        if (!words.some(w => w.spell)) { q = "Hmm, je n'ai pas compris de mots. Redis-moi ta phrase ?"; continue; }
        const text = words.map(w => w.w).join(' ');
        if (await askYesNo(`J'ai entendu : ${text}. C'est bien ça ?`)) sentence = { text, words };
        else q = "D'accord ! Redis-moi ta phrase, doucement.";
      }
      S.cur = { text: sentence.text, words: sentence.words.map(w => ({ ...w })), idx: -1, tries: 0, hints: [] };
      save();
      const n = S.cur.words.filter(w => w.spell).length;
      await say(`Ta phrase a ${n} mot${n > 1 ? 's' : ''}. On va les épeler un par un. C'est parti !`);
    }
    const c = S.cur;
    for (let i = 0; i < c.words.length; i++) {
      const w = c.words[i];
      if (!w.spell || w.done) continue;
      c.idx = i; save();
      await spellWord(c, w);
    }
    // phrase terminée !
    const sp = c.words.filter(w => w.spell);
    const stars = sp.filter(w => w.star).length;
    S.journal.unshift({ id: Date.now(), at: Date.now(), text: ORTHO.format(c.words.map(w => w.w).join(' ')), stars, n: sp.length });
    MEMOIRE.event(`${name()} a écrit dans son journal : « ${ORTHO.format(c.text)} » (${stars} étoile${stars > 1 ? 's' : ''}).`);
    logAct('journal', ORTHO.format(c.text), stars, sp.length);
    S.cur = null; save();
    face.set('happy'); fx.ok(); fx.confetti(60);
    await say(`Bip-hourra ! Ta phrase est finie, et tu as gagné ${stars} étoile${stars > 1 ? 's' : ''} ! Je l'ai rangée dans ma mémoire.`);
    if (!(await askYesNo('On écrit une autre phrase ?'))) { await say("D'accord ! Bravo pour ton journal !"); return; }
  }
}

async function spellWord(c, w) {
  c.tries = 0; c.hints = [];
  const ctx = c.dictee ? ` Comme dans : ${c.text}` : ORTHO.needsContext(w.t) ? ` Comme dans ta phrase : ${c.text}.` : '';
  let q = `Épelle le mot : ${w.w}.${ctx} Dis-moi les lettres une par une.`;
  face.set('idle');
  for (;;) {
    const t = await ask(q, { prompt: SPELL_PROMPT, wait: 25000 });
    if (RE.dontknow.test(N(t)) || /\b(aide|indice)\b/.test(N(t))) {
      // il aide sans jamais donner tout le mot
      c.tries++;
      const sk = ORTHO.skeleton(w.t, Math.max(3, c.tries + 2));
      q = `Je t'aide ! Ton mot commence par ${spellOut(sk.filter(x => x !== '_').join(''))}. Épelle tout le mot !`;
      continue;
    }
    const letters = ORTHO.parseSpelling(t);
    if (!letters) { q = `Je n'ai pas entendu de lettres. Dis-les une par une, bien séparées, comme ça : A… B… C… Épelle : ${w.w}.`; continue; }
    const a = letters.join('');
    if (ORTHO.same(a, w.t)) {
      w.done = true; w.star = c.tries === 0;
      if (c.tries >= 2) MEMOIRE.hardWord(w.t, c.tries); // un mot à réviser plus tard
      const mastered = c.tries === 0 && MEMOIRE.mastered(w.t);
      S.stats.words++; if (w.star) S.stats.first++;
      save();
      face.set('happy'); fx.ok(); fx.confetti(24);
      await say(`VALIDÉ ! ${pick(['Bravo', 'Génial', 'Trop fort', 'Super'])} ${name()} !${w.star ? ' Du premier coup, une étoile !' : ''} ${spellOut(w.t)}. Écris ce mot en MAJUSCULES D'IMPRIMERIE dans ton journal.`);
      if (mastered) { fx.confetti(30); await say("Et tu te souviens ? Ce mot était difficile pour toi… Je le retire de mes mots difficiles !"); }
      // il attend que l'enfant ait fini d'écrire
      try { await ask("Dis-moi « c'est écrit » quand tu as fini !", { wait: 90000, retry: 1 }); } catch (e) { if (e.message !== 'silence') throw e; }
      return;
    }
    c.tries++;
    face.set('oops'); fx.oops();
    const h = await CERVEAU.hint(w.t, a, c);
    c.hints.push(h.text); save();
    face.set('oops');
    const sk = ORTHO.skeleton(w.t, c.tries);
    const help = sk ? ` Je t'aide : ton mot commence par ${spellOut(sk.filter(x => x !== '_').join(''))}.` : '';
    q = `J'ai entendu : ${spellOut(a)}. ${h.open} ${h.text}${help} Ré-épelle tout le mot !`;
  }
}

function journalTitle() { return S.prenom ? `Le journal ${deName(S.prenom)}` : 'Mon journal'; }
async function readJournal() {
  openJournal();
  if (!S.journal.length) return say('Ton journal est encore vide. Dis « on écrit dans mon journal » pour commencer !');
  const last = S.journal.slice(0, 3);
  await say(`Voici ${last.length > 1 ? 'tes dernières phrases' : 'ta phrase'} : ${last.map(e => e.text).join(' … ')}`);
}
function openJournal() {
  $('#jr-title').textContent = journalTitle();
  const st = S.stats;
  $('#jr-stats').innerHTML = `<span>🔤 ${st.words} mot${st.words > 1 ? 's' : ''} écrits</span><span>⭐ ${st.first} du premier coup</span><span>📰 ${S.journal.length} phrase${S.journal.length > 1 ? 's' : ''}</span>`;
  $('#jr-list').innerHTML = S.journal.length
    ? S.journal.map(e => `<article class="jr-item"><div class="jr-date">${esc(dateFR(e.at))}</div><p class="jr-text">${esc(e.text)}</p>
        <div class="jr-foot"><span>${'⭐'.repeat(e.stars)}</span><button class="ghost sm" data-del="${e.id}" aria-label="Effacer la phrase">🗑</button></div></article>`).join('')
    : '<p class="jr-empty">Le journal est encore vide.</p>';
  $('#journal').classList.remove('hidden');
}
function closeJournal() { $('#journal').classList.add('hidden'); }

/* =================== LES JEUX (à voix haute) =================== */
async function devinetteFlow() {
  const list = JEUX.shuffle(JEUX.DEVINETTES);
  for (let i = 0; ; i++) {
    const d = (i % 2 === 1 && (await newRiddle())) || list[i % list.length]; // une sur deux est inventée par le grand cerveau
    let q = `Devinette ! ${d.q}`, found = false;
    for (let tries = 0; tries < 3 && !found; tries++) {
      const t = await ask(q, { wait: 25000 });
      if (RE.dontknow.test(N(t))) break;
      if (JEUX.matches(t, d.r)) found = true;
      else { face.flash('oops'); q = tries < 1 ? `Non, ce n'est pas ça… Réfléchis encore ! ${d.q}` : 'Non plus ! Dernière chance !'; }
    }
    logAct('devinette', d.a, found ? 1 : 0, 1);
    if (found) { S.stats.dev++; save(); face.set('happy'); fx.ok(); fx.confetti(24); await say(`Bravo ! C'était ${d.a} !`); }
    else { face.set('happy'); await say(`C'était ${d.a} !`); }
    if (!(await askYesNo('Une autre devinette ?'))) return say("D'accord ! C'était rigolo !");
  }
}

async function calcFlow(kind = 'mix') {
  let score = 0;
  const intro = kind.startsWith('table:') ? (kind === 'table:0' ? 'Les tables de multiplication !' : `La table de ${kind.slice(6)} !`) : kind === 'c10' ? 'Les compléments à 10 !' : kind === 'c100' ? 'Les compléments à 100 !' : 'Calcul mental !';
  await say(`${intro} Je te pose 5 questions. Prêt ?`);
  for (let i = 0; i < 5; i++) {
    const q0 = calcQ(kind);
    const q = { say: q0.ask.replace(/^combien font /, '').replace(/ \?$/, ''), r: q0.r, tip: q0.tip, ask: q0.ask };
    let line = `Question ${i + 1} : ${q.ask}`;
    for (let tries = 0; ;) {
      const t = await ask(line, { wait: 20000 });
      if (RE.dontknow.test(N(t))) { await say(`La réponse, c'est ${q.r}. ${q.tip}`); break; }
      const v = JEUX.parseNumber(t);
      if (v === null) { line = `Dis-moi juste le nombre. ${q.ask}`; continue; }
      if (v === q.r) { if (!tries) score++; face.flash('happy'); fx.ok(); await say(`${pick(['Bravo !', 'Exact !', 'Bonne réponse !'])} C'est ${q.r}.`); break; }
      tries++; face.flash('oops'); fx.oops();
      if (tries < 2) { line = `Ce n'est pas ${v}. Petite astuce : ${q.tip} Alors, ${q.ask}`; continue; }
      await say(`Ce n'est pas grave ! La réponse, c'est ${q.r}. ${q.tip}`);
      break;
    }
  }
  S.stats.calc += score; save();
  MEMOIRE.event(`${intro.replace(/ !$/, '')} : ${score} sur 5.`);
  logAct('calc', kind, score, 5);
  face.set('happy'); if (score >= 3) { fx.ok(); fx.confetti(40); }
  await say(`Tu as ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} sur 5 ! ${score === 5 ? 'Parfait, champion !' : score >= 3 ? 'Très bon score !' : "On s'entraînera encore !"}`);
}

function quizAnswer(t, q) {
  const n = N(t), words = n.split(' ');
  const num = JEUX.parseNumber(t);
  const byNum = q.o.findIndex(o => /^\d+/.test(o) && num !== null && parseInt(o, 10) === num);
  if (byNum >= 0) return byNum;
  const scores = q.o.map(o => N(o).split(' ').filter(w => w.length >= 3 || /\d/.test(w)).filter(w => words.includes(w)).length);
  const max = Math.max(...scores);
  if (max > 0 && scores.filter(s => s === max).length === 1) return scores.indexOf(max);
  for (let i = words.length - 1; i >= 0; i--) {
    if (['a', 'ah'].includes(words[i])) return 0;
    if (['b', 'be', 'bee'].includes(words[i])) return 1;
    if (['c', 'ce', 'se'].includes(words[i])) return 2;
  }
  return -1;
}
async function quizFlow(th) {
  const list = JEUX.quizRound(th || null, 5);
  let score = 0;
  await say(`Quiz ${th ? `sur ${JEUX.THEMES[th].nom.toLowerCase()}` : 'surprise'} ! 5 questions. Réponds A, B ou C.`);
  for (const q of list) {
    const line = `${q.q} ${q.o.map((o, i) => `${'ABC'[i]} : ${o}`).join('. ')}.`;
    let pickI = -1;
    for (let tries = 0; tries < 2 && pickI < 0; tries++) {
      const t = await ask(tries ? `Je n'ai pas compris. Dis A, B ou C. ${line}` : line, { wait: 25000 });
      if (RE.dontknow.test(N(t))) break;
      pickI = quizAnswer(t, q);
    }
    const ok = pickI === q.c;
    if (ok) { score++; face.flash('happy'); fx.ok(); } else { face.flash('oops'); fx.oops(); }
    await say(`${ok ? pick(['Bravo !', 'Bonne réponse !', 'Exact !']) : `La bonne réponse était ${'ABC'[q.c]} : ${q.o[q.c]}.`} ${q.e}`);
  }
  S.stats.quiz += score; save();
  logAct('quiz', th || 'surprise', score, 5);
  MEMOIRE.event(`Quiz ${th ? `sur ${JEUX.THEMES[th].nom.toLowerCase()}` : 'surprise'} : ${score} sur 5.`);
  face.set('happy'); if (score >= 3) { fx.ok(); fx.confetti(40); }
  await say(`Tu as ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} sur 5 ! ${score === 5 ? 'Tu es un vrai savant !' : score >= 3 ? 'Bravo !' : 'On rejouera !'}`);
}

/* =================== LA VISION =================== */
const seen = { last: {}, present: false, presentSince: 0, unknownSince: 0, askedUnknown: 0, smileAt: 0, sadAt: 0, sadCount: 0 };
let visionBusy = false;

/* ---------- Anti-plantage ----------
   Avant une étape lourde (les yeux), on laisse un petit mot dans la mémoire.
   Si l'appli s'arrête brutalement, le mot est encore là au lancement suivant :
   Shadow sait alors ce qui a planté et ne recommence pas tout seul. */
const BOOT_KEY = 'shadow-boot';
const guard = step => { try { localStorage.setItem(BOOT_KEY, step); } catch (e) { /* rien */ } };
const guardOk = () => { try { localStorage.removeItem(BOOT_KEY); } catch (e) { /* rien */ } };
// Vieux navigateur (ex. Chrome 70) : on allège Shadow
const LEGACY = (() => { try { new Function('var a = {}; return a?.b;'); return false; } catch (e) { return true; } })();

async function visionToggle(want) {
  if (visionBusy) return false;
  if (!want) { VISION.stop(); S.settings.vision = false; save(); return true; }
  if (!VISION.supported) return false;
  visionBusy = true;
  guard('vision');
  try {
    await VISION.start($('#cam-video'), { objects: !LEGACY });
    S.settings.vision = true; save();
    setTimeout(() => { if (localStorage.getItem(BOOT_KEY) === 'vision') guardOk(); }, 30000); // 30 s sans plantage : c'est bon
    return true;
  } catch (e) {
    console.warn('vision', e);
    guardOk();
    return false;
  } finally {
    visionBusy = false;
  }
}
async function needEyes() {
  if (VISION.isOn()) return true;
  face.set('think');
  if (await visionToggle(true)) return true;
  face.set('oops');
  mustShow = true;
  await say("Mes yeux ne s'ouvrent pas. Il faut autoriser la caméra, demande à papa.");
  return false;
}

// Les yeux suivent la personne (l'image de la caméra est inversée par rapport à l'écran)
// La caméra n'est pas au centre de l'écran (téléphone à l'horizontale : elle est sur le côté).
// Shadow apprend donc où se trouve « en face de lui » : la position habituelle de la personne.
const gaze = { cx: S.settings.gazeCx || 0, cy: S.settings.gazeCy || 0, n: 0 };
const clamp = (v, a) => Math.max(-a, Math.min(a, v));
VISION.on('track', m => {
  if (!m) return;
  gaze.n++;
  const a = gaze.n < 40 && !S.settings.gazeCx ? 0.08 : 0.004; // vite au début, puis tout doucement
  gaze.cx += (m.cx - gaze.cx) * a;
  gaze.cy += (m.cy - gaze.cy) * a;
  if (gaze.n % 150 === 0) { S.settings.gazeCx = +gaze.cx.toFixed(3); S.settings.gazeCy = +gaze.cy.toFixed(3); save(); }
  if (['sleep', 'think'].includes(face.state)) return;
  face.look(clamp(Math.round(-(m.cx - gaze.cx) * 16), 12), clamp(Math.round((m.cy - gaze.cy) * 10), 7));
});
VISION.on('people', faces => onPeople(faces));

function onPeople(faces) {
  const now = Date.now();
  if (!faces.length) { seen.present = false; seen.unknownSince = 0; seen.sadCount = 0; return; }
  if (!seen.present) { seen.present = true; seen.presentSince = now; }
  const known = faces.find(f => f.name);
  dlg.lastActive = now;

  // Il se réveille quand il voit quelqu'un
  if (dlg.state === 'sleep' && dlg.started && !pauseLock() && now - seen.presentSince > 700) {
    if (known) seen.last[known.name] = now;
    wake(known && known.name);
    return;
  }
  const calm = ['standby', 'talk'].includes(dlg.state) && !dlg.busy && !voice.speaking && !OREILLES.hearing();
  for (const f of faces) {
    if (!f.name) continue;
    const prev = seen.last[f.name] || 0;
    seen.last[f.name] = now;
    noteVisit(f.name); // garde-robot (si papa l'a activé) : en mémoire vive seulement
    if (now - prev > 10 * 60000 && calm) {
      dlg.state = 'talk'; dlg.silence = 0;
      face.flash('happy');
      const v = f.name === S.prenom && prev ? visitsSince(prev) : [];
      say(pick([`Coucou ${f.name} ! Je te reconnais !`, `Oh, ${f.name} ! Content de te voir !`, `Bip-bip ! Salut ${f.name} !`])
        + (v.length ? ` Pendant que tu n'étais pas là, j'ai vu ${visitsText(v)}.` : ''));
      return;
    }
  }
  const main = faces[0];
  if (!main.name) {
    if (!seen.unknownSince) seen.unknownSince = now;
    if (calm && now - seen.unknownSince > 3000 && now - seen.askedUnknown > 10 * 60000) {
      seen.askedUnknown = now;
      dlg.state = 'talk'; dlg.silence = 0;
      dlg.expect = { until: now + 60000, run: () => activity(meetFlow) };
      face.flash('happy');
      say("Bonjour ! Je ne connais pas encore ce visage. Tu veux qu'on fasse connaissance ?");
      return;
    }
  } else seen.unknownSince = 0;

  // Il remarque les sourires… et les petites tristesses
  if (main.expr.happy > 0.85 && face.state !== 'sleep') {
    face.el.classList.add('smile');
    clearTimeout(seen.smileT);
    seen.smileT = setTimeout(() => face.el.classList.remove('smile'), 1600);
    if (calm && now - seen.smileAt > 5 * 60000) {
      seen.smileAt = now;
      say(pick(["J'adore ton sourire !", 'Oh, tu souris ! Ça me fait clignoter de joie !', 'Ton sourire recharge mes batteries !']));
    }
  }
  seen.sadCount = main.expr.sad > 0.6 ? seen.sadCount + 1 : 0;
  if (seen.sadCount >= 3 && calm && now - seen.sadAt > 10 * 60000) {
    seen.sadAt = now;
    dlg.state = 'talk'; dlg.silence = 0;
    face.set('sad');
    say(`${main.name ? `${main.name}, tu` : 'Tu'} as l'air un peu triste… Tu veux m'en parler ? Ou aller faire un câlin à papa ?`);
  }
}

async function whoFlow() {
  if (!(await needEyes())) return;
  face.set('think');
  await wait(1200);
  const faces = VISION.state.faces;
  if (!faces.length) { face.flash('oops'); return say('Je ne vois personne ! Mets-toi bien en face de moi.'); }
  const names = faces.map(f => f.name).filter(Boolean);
  if (names.length) {
    face.set('happy');
    return say(`Oui ! Je vois ${names.join(' et ')} !${faces.length > names.length ? " Et quelqu'un que je ne connais pas encore." : ''}`);
  }
  dlg.expect = { until: Date.now() + 60000, run: () => activity(meetFlow) };
  face.flash('oops');
  return say("Je vois quelqu'un, mais je ne le connais pas encore. Tu veux que j'apprenne ton visage ?");
}

// « Qu'est-ce que tu vois ? »
async function whatFlow() {
  if (!(await needEyes())) return;
  face.set('think');
  await say(pick(['Je regarde…', 'Voyons voir…', 'Hmm, laisse-moi regarder.']));
  // Vision détaillée (option de papa) : une photo part chez Groq
  if (S.settings.seeCloud && S.settings.key) {
    try {
      const r = await AI.see(VISION.snapshot(), "Tu es Shadow, un robot gentil. Voici ce que voit ta caméra. Dis en 2 phrases simples, pour un enfant de 7 ans, ce que tu vois, en lui parlant (« tu tiens… »). Si tu vois une personne, ne décris pas son corps ni son visage : parle seulement de ce qu'elle tient ou fait. Pas d'émoji.");
      if (r) { face.set('happy'); return say(ETHIQUE.safe(r)); }
    } catch (e) { console.warn('vision détaillée', e); }
  }
  if (LEGACY) { face.flash('oops'); return say("Pour reconnaître les objets, mes yeux ont besoin d'un Chrome plus récent. Papa peut le mettre à jour dans le Play Store."); }
  try {
    const objs = (await VISION.objects()).filter(o => o.label !== 'person' && JEUX.OBJETS[o.label]);
    const names = [...new Set(objs.map(o => JEUX.OBJETS[o.label]))];
    const people = VISION.state.faces.length;
    if (!names.length) {
      face.flash('oops');
      return say(people ? "Je te vois, toi ! Mais je ne reconnais pas d'objet. Montre-le-moi de plus près, devant la caméra." : 'Je ne reconnais rien… Mes yeux connaissent environ quatre-vingts choses, comme un livre, une tasse ou un nounours. Montre-moi quelque chose !');
    }
    face.set('happy');
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0];
    return say(`Je vois ${list} !${people ? ' Et toi, bien sûr !' : ''}`);
  } catch (e) {
    face.flash('oops');
    return say('Mes yeux à objets ne marchent pas encore. Il faut le WiFi la première fois.');
  }
}

// Jeu : « Va me chercher un livre ! »
async function huntFlow() {
  if (LEGACY) { face.flash('oops'); return say("La chasse aux objets a besoin d'un Chrome plus récent. Papa peut le mettre à jour dans le Play Store."); }
  if (!(await needEyes())) return;
  let found = 0;
  const items = JEUX.shuffle(JEUX.CHASSE);
  await say('Chasse aux objets ! Je te demande un objet, tu vas le chercher et tu me le montres devant la caméra. Prêt ?');
  for (let round = 0; round < 3; round++) {
    const item = items[round];
    const label = JEUX.OBJETS[item];
    await say(`Va me chercher ${label} ! Tu as une minute. Si tu n'en trouves pas, dis « je trouve pas ».`);
    face.set('listen');
    const t0 = Date.now();
    let ok = false, gaveUp = false;
    // il regarde ET il écoute en même temps
    const listening = (async () => {
      for (;;) {
        const t = await hear({ maxWait: 60000 });
        if (t === null || ok || !t) return;
        if (RE.stop.test(N(t))) { gaveUp = 'stop'; return; }
        if (RE.dontknow.test(N(t)) || /\b(trouve pas|pas trouve|y en a pas|j en ai pas)\b/.test(N(t))) { gaveUp = true; return; }
      }
    })();
    while (!ok && !gaveUp && Date.now() - t0 < 60000) {
      try { ok = (await VISION.objects()).some(o => o.label === item && o.score > 0.4); } catch (e) { break; }
      if (!ok) await wait(600);
    }
    OREILLES.cancel();
    await listening;
    if (gaveUp === 'stop') throw new Stop('stop');
    if (ok) { found++; S.stats.hunt++; save(); face.set('happy'); fx.ok(); fx.confetti(40); await say(`Bravo ! Je vois ${label} ! Tu es super rapide !`); }
    else { face.flash('oops'); await say(`Pas grave ! Ce n'était pas facile à trouver.`); }
  }
  face.set('happy');
  await say(`Tu as trouvé ${found} objet${found > 1 ? 's' : ''} sur 3 ! ${found === 3 ? 'Champion de la chasse !' : 'Bien joué !'}`);
}

/* ----- Faire connaissance (apprendre un visage) ----- */
function cleanName(t) {
  const n = String(t).trim()
    .replace(/^(bonjour|salut|coucou)[,\s]*/i, '')
    .replace(/^(je m'?\s?appelle|moi c'?\s?est|c'?\s?est|je suis|mon prénom c'?\s?est|mon prenom c'?\s?est|mon nom c'?\s?est)\s+/i, '')
    .replace(/[.,!?;:]/g, '').split(/\s+/).slice(0, 2).join(' ').slice(0, 20);
  return n ? n[0].toUpperCase() + n.slice(1) : '';
}
async function meetFlow() {
  if (!(await needEyes())) return;
  face.set('happy');
  await say('Super, on fait connaissance ! Mets-toi bien en face de moi, tout seul. Regarde-moi, puis tourne doucement la tête un peu à gauche et un peu à droite…');
  face.set('think');
  let desc;
  try {
    desc = await VISION.capture(8, 12000);
  } catch (e) {
    face.set('oops');
    await say(e.message === 'several'
      ? "Il y a plusieurs visages ! Un seul à la fois, s'il te plaît. Redis-moi « on fait connaissance » quand tu es prêt."
      : 'Je ne vois pas bien ton visage. Mets-toi bien en face, avec de la lumière, et redis-moi « on fait connaissance ».');
    return;
  }
  face.set('happy'); fx.ok();
  const known = VISION.identify(desc);
  let who = '';
  if (known && (await askYesNo(`Mais je te connais ! Tu es ${known} ?`))) who = known;
  while (!who) {
    const t = await ask("Ton visage est dans ma mémoire ! Comment tu t'appelles ?", { wait: 20000 });
    const n = cleanName(t);
    if (n && (await askYesNo(`Tu t'appelles ${n} ? C'est bien ça ?`))) who = n;
  }
  const p = S.people.find(x => x.name.toLowerCase() === who.toLowerCase());
  if (p) p.desc = [...p.desc, ...desc].slice(-24);
  else S.people.push({ id: Date.now(), name: who, desc });
  save();
  seen.last[who] = Date.now();
  face.set('happy'); fx.confetti(30);
  await say(p ? `Merci ${who} ! Maintenant je te reconnaîtrai encore mieux.` : `Enchanté, ${who} ! Maintenant, je te reconnaîtrai.`);
}

/* =================== TOUCHER L'ÉCRAN =================== */
// Toucher le visage : le réveiller, l'interrompre, ou lui parler sans dire « Shadow »
function tap() {
  if (!dlg.started) { face.set('happy'); return firstStart(); }
  if (dlg.state === 'sleep') { pauseUntil = 0; return wake(); }
  if (voice.speaking) { voice.stop(); return; }
  if (dlg.state === 'standby') { dlg.state = 'talk'; dlg.silence = 0; dlg.sayNext = "Oui ? Je t'écoute !"; OREILLES.cancel(); }
}

/* =================== PAUSE CONSEILLÉE =================== */
let sessionStart = Date.now(), pauseDone = false, pauseUntil = 0;
const pauseLock = () => Date.now() < pauseUntil; // pendant la pause, il ne se réveille pas tout seul
setInterval(() => {
  const m = +S.settings.pause || 0;
  if (!m || pauseDone || dlg.state === 'sleep' || dlg.busy) return;
  if (Date.now() - sessionStart > m * 60000) {
    pauseDone = true;
    pauseUntil = Date.now() + 10 * 60000;
    dlg.state = 'sleep';
    OREILLES.cancel();
    face.set('happy');
    say(`Ça fait ${m} minutes qu'on s'amuse ! Mes circuits chauffent. On fait une pause ? Va boire un verre d'eau, bouger, ou faire un câlin à papa. À tout à l'heure !`)
      .then(() => dlg.state === 'sleep' && face.set('sleep'));
  }
}, 20000);

/* =================== RÉGLAGES (coin de papa) =================== */
function brainVis() {
  const local = ($('input[name=s-brain]:checked') || {}).value === 'local';
  $('#s-groq').hidden = local;
  $('#s-local').hidden = !local;
}
function readSettingsForm() {
  return {
    brain: ($('input[name=s-brain]:checked') || {}).value || 'groq',
    key: $('#s-key').value.trim(),
    model: $('#s-model').value.trim() || AI.DEFAULT_MODEL,
    localUrl: $('#s-local-url').value.trim() || 'http://localhost:11434/v1',
    localModel: $('#s-local-model').value.trim(),
    sound: $('#s-sound').checked, slow: $('#s-slow').checked, subtitles: $('#s-subtitles').checked,
    ears: $('#s-ears').value,
    micSens: $('#s-mic-sens').value,
    lock: $('#s-lock').checked,
    pause: +$('#s-pause').value,
    vision: $('#s-vision').checked,
    seeCloud: $('#s-see-cloud').checked,
    visionModel: $('#s-vision-model').value.trim() || AI.VISION_MODEL,
  };
}
/* ---------- Code secret de papa ----------
   On ne garde pas le code lui-même, seulement son empreinte (SHA-256 + sel). */
async function pinHash(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const gate = { fails: 0, until: 0 };
function openGate() {
  voice.stop();
  const g = $('#dlg-gate');
  if (Date.now() < gate.until) { toast(`Trop d'essais. Réessaie dans ${Math.ceil((gate.until - Date.now()) / 60000)} min.`); return; }
  if (S.settings.pinHash) {
    $('#gate-q').textContent = 'Code secret de papa :';
    $('#gate-a').type = 'password';
  } else {
    const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    g.dataset.answer = a * b;
    $('#gate-q').textContent = `Combien font ${a} × ${b} ?`;
    $('#gate-a').type = 'text';
  }
  $('#gate-a').value = '';
  g.returnValue = '';
  g.showModal();
}
async function checkGate() {
  const v = $('#gate-a').value.trim();
  const ok = S.settings.pinHash
    ? (await pinHash(v, S.settings.pinSalt)) === S.settings.pinHash
    : parseInt(v, 10) === +$('#dlg-gate').dataset.answer;
  if (ok) { gate.fails = 0; openSettings(); return; }
  gate.fails++;
  if (gate.fails >= 5) { gate.fails = 0; gate.until = Date.now() + 5 * 60000; toast('Trop d\'essais : coin de papa bloqué 5 minutes 🔒'); }
  else toast(S.settings.pinHash ? 'Mauvais code 🔒' : 'Raté ! Ce coin est réservé à papa 😉');
}
function renderVoices() {
  const v = VOIX.people();
  $('#s-voices').innerHTML = v.length
    ? v.map(p => `<div class="person"><span>🎙️ ${esc(p.name)} <small class="muted">(${p.prints.length} empreinte${p.prints.length > 1 ? 's' : ''})</small></span><button type="button" class="ghost sm danger" data-forget-voice="${p.id}">Oublier</button></div>`).join('')
    : '<p class="small muted">Shadow ne connaît encore aucune voix. Dites-lui « apprends ma voix ».</p>';
}
function renderPinState() {
  $('#s-pin-state').textContent = S.settings.pinHash ? '✅ Un code secret protège ce coin.' : '⚠️ Pas encore de code : le coin de papa n\'est protégé que par un calcul.';
}
function renderMemory() {
  const m = MEMOIRE.data();
  $('#s-mem-count').textContent = `${m.facts.length} souvenir${m.facts.length > 1 ? 's' : ''} · ${m.summaries.length} résumé${m.summaries.length > 1 ? 's' : ''} d'activités · ${m.hard.length} mot${m.hard.length > 1 ? 's' : ''} difficile${m.hard.length > 1 ? 's' : ''}`;
  $('#s-mem').innerHTML = m.facts.length
    ? m.facts.slice().reverse().map(f => `<div class="person"><span>${esc(f.text)}</span><button type="button" class="ghost sm danger" data-unfact="${f.id}" aria-label="Oublier ce souvenir">✕</button></div>`).join('')
    : '<p class="small muted">Pas encore de souvenirs. Shadow en garde au fil des discussions.</p>';
}
// Sauvegarde de tout Shadow dans un fichier (sans la clé Groq), pour la garder ou la passer sur un autre appareil
function exportShadow() {
  const data = JSON.parse(JSON.stringify(S));
  data.settings.key = '';
  delete data.settings.pinHash; delete data.settings.pinSalt;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shadow-memoire-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function importShadow(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || d.v !== 1) throw new Error('fichier');
      if (!confirm('Remplacer la mémoire, le journal et les visages de Shadow par ceux du fichier ? (les réglages et la clé restent)')) return;
      ['prenom', 'journal', 'people', 'voices', 'memory', 'stats', 'chat', 'memPos', 'cur', 'log', 'playLog', 'dictee'].forEach(k => { if (k in d) S[k] = d[k]; });
      save(); renderMemory(); renderPeople(); renderVoices();
      toast('Mémoire restaurée ✅');
    } catch (e) { toast("Ce fichier n'est pas une sauvegarde de Shadow"); }
  };
  r.readAsText(file);
}
function renderPeople() {
  $('#s-people').innerHTML = S.people.length
    ? S.people.map(p => `<div class="person"><span>👤 ${esc(p.name)}</span><button type="button" class="ghost sm danger" data-forget="${p.id}">Oublier</button></div>`).join('')
    : '<p class="small muted">Shadow ne connaît encore personne. Dites-lui « on fait connaissance ».</p>';
}
function openSettings() {
  const s = S.settings;
  $('#s-prenom').value = S.prenom;
  $('#s-key').value = s.key;
  $('#s-model').value = s.model;
  $('#s-local-url').value = s.localUrl;
  $('#s-local-model').value = s.localModel;
  $$('input[name=s-brain]').forEach(r => { r.checked = r.value === s.brain; });
  brainVis();
  $('#s-sound').checked = s.sound; $('#s-slow').checked = s.slow; $('#s-subtitles').checked = s.subtitles;
  $('#s-ears').value = s.ears;
  $('#s-mic-sens').value = s.micSens;
  $('#s-lock').checked = s.lock;
  meterLoop();
  $('#s-pause').value = String(s.pause);
  $('#s-vision').checked = s.vision;
  $('#s-see-cloud').checked = s.seeCloud;
  $('#s-vision-model').value = s.visionModel;
  $('#s-status').textContent = `Oreilles : ${({ whisper: 'Whisper (Groq), micro toujours ouvert', chrome: 'Chrome (Google)' })[OREILLES.engine()] || 'aucune'} · Yeux : ${VISION.isOn() ? 'ouverts' : 'fermés'}`;
  renderPeople();
  renderMemory();
  renderVoices();
  renderExtras();
  renderPinState();
  $('#s-msg').textContent = '';
  $('#dlg-settings').returnValue = '';
  $('#dlg-settings').showModal();
}
async function testBrain() {
  const msg = $('#s-msg');
  const saved = S.settings;
  S.settings = { ...saved, ...readSettingsForm() };
  if (!AI.ready()) {
    msg.textContent = S.settings.brain === 'local' ? 'Indique le modèle local (ex : qwen3:4b).' : "Colle d'abord la clé Groq (elle commence par gsk_).";
    S.settings = saved;
    return;
  }
  msg.textContent = 'Test en cours…';
  try {
    const r = await AI.chat([{ role: 'system', content: CERVEAU.personality() }, { role: 'user', content: '[Test de papa] Dis bonjour en une phrase.' }], { maxTokens: 80 });
    msg.textContent = `✅ Le cerveau marche : « ${r} »`;
    if (S.settings.seeCloud && VISION.isOn()) {
      try { await AI.see(VISION.snapshot(320), 'Dis juste « ok ».'); msg.textContent += ' · ✅ Vision détaillée OK'; }
      catch (e) { msg.textContent += ` · ❌ Vision détaillée : ${e.message}`; }
    }
  } catch (e) {
    msg.textContent = `❌ ${e.message}`;
  } finally {
    S.settings = saved;
  }
}
// Test des oreilles : jauge du micro en direct + dernière phrase comprise
function meterLoop() {
  const dlgEl = $('#dlg-settings');
  const tick = () => {
    if (!isOpen(dlgEl)) return;
    const m = OREILLES.meter();
    const pct = v => Math.min(100, Math.round(Math.sqrt(v / 0.15) * 100));
    $('#mic-bar').style.width = `${pct(m.level)}%`;
    $('#mic-bar').classList.toggle('on', m.level > m.threshold);
    $('#mic-thr').style.left = `${pct(m.threshold)}%`;
    $('#mic-heard').textContent = m.lastHeard ? `Dernière phrase comprise : « ${m.lastHeard} »` : 'Parle pour tester…';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

const lockLandscape = () => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : Promise.resolve());

/* =================== MODE VERROUILLÉ =================== */
// L'enfant ne peut pas sortir de Shadow par accident. La roue ⚙️ disparaît :
// papa l'ouvre en restant appuyé 3 secondes dans le coin en haut à gauche.
function applyLock() {
  const on = !!S.settings.lock;
  document.body.classList.toggle('locked', on);
  if (on && (history.state || {}).shadow !== 1) history.pushState({ shadow: 1 }, '');
}
// Plein écran : chaque toucher le remet si on en est sorti (le navigateur exige un geste du doigt)
function keepFullscreen(e) {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen || $('dialog[open]')) return;
  if (!S.settings.lock && !(e && e.target && e.target.closest && e.target.closest('#face-wrap, #hint'))) return;
  document.documentElement.requestFullscreen().then(() => lockLandscape()).catch(() => {});
}
function bindLock() {
  // bouton « retour » d'Android : on reste dans Shadow
  window.addEventListener('popstate', () => { if (S.settings.lock) history.pushState({ shadow: 1 }, ''); });
  // fermer l'onglet : le navigateur demande confirmation
  window.addEventListener('beforeunload', e => { if (S.settings.lock) { e.preventDefault(); e.returnValue = ''; } });
  // pas de menu au doigt, pas de zoom
  document.addEventListener('contextmenu', e => { if (S.settings.lock) e.preventDefault(); });
  document.addEventListener('gesturestart', e => { if (S.settings.lock) e.preventDefault(); });
  document.addEventListener('pointerdown', keepFullscreen, true);
  // appui long de 3 s dans le coin secret → coin de papa
  const spot = $('#secret');
  let timer = null;
  const start = e => { e.preventDefault(); clearTimeout(timer); timer = setTimeout(() => { if (navigator.vibrate) navigator.vibrate(60); openGate(); }, 3000); };
  const cancel = () => clearTimeout(timer);
  spot.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => spot.addEventListener(ev, cancel));
}

/* =================== DÉMARRAGE =================== */
// Navigateurs qui ne connaissent pas les fenêtres <dialog> (téléphones un peu anciens) : on les imite
function fixDialogs() {
  $$('dialog').forEach(d => {
    if (typeof d.showModal === 'function') return;
    d.classList.add('poly');
    d.showModal = () => { d.setAttribute('open', ''); };
    d.close = v => { if (v !== undefined) d.returnValue = v; d.removeAttribute('open'); d.dispatchEvent(new Event('close')); };
    d.querySelectorAll('form').forEach(f => {
      f.addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.type !== 'button') f._sub = b.value; });
      f.addEventListener('submit', e => { e.preventDefault(); d.close(f._sub || ''); });
    });
  });
}
const isOpen = d => d.hasAttribute('open');
function bind() {
  fixDialogs();
  document.addEventListener('pointerdown', () => { OREILLES.prime(); if (fx.ctx && fx.ctx.state === 'suspended') fx.ctx.resume(); }, true);
  // Une erreur ? On l'écrit à l'écran (sur téléphone, il n'y a pas d'autre moyen de la voir)
  const showErr = msg => { mustShow = true; subtitle(esc(`Oups, petit bug : ${msg}`), null); };
  window.addEventListener('error', e => showErr(e.message || 'erreur'));
  window.addEventListener('unhandledrejection', e => showErr((e.reason && (e.reason.message || e.reason.name)) || String(e.reason)));
  $('#face-wrap').addEventListener('click', tap);
  $('#hint').addEventListener('click', tap);
  $('#btn-settings').addEventListener('click', openGate);
  $('#jr-close').addEventListener('click', closeJournal);
  $('#jr-list').addEventListener('click', e => {
    const d = e.target.closest('[data-del]');
    if (d && confirm('Effacer cette phrase du journal ?')) { S.journal = S.journal.filter(x => String(x.id) !== d.dataset.del); save(); openJournal(); }
  });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close('cancel')));
  $('#dlg-welcome').addEventListener('cancel', e => e.preventDefault());
  const welcomeDone = () => {
    if (dlg.started) return;
    S.prenom = $('#w-prenom').value.trim().slice(0, 20) || S.prenom;
    save();
    firstStart();
  };
  $('#dlg-welcome .go').addEventListener('click', welcomeDone); // pendant le geste du doigt
  $('#dlg-welcome').addEventListener('close', welcomeDone);
  $('#dlg-gate').addEventListener('close', () => { if ($('#dlg-gate').returnValue === 'ok') checkGate(); });
  $('#s-pin-set').addEventListener('click', async () => {
    const a = $('#s-pin').value.trim(), b = $('#s-pin2').value.trim();
    if (!/^\d{4,8}$/.test(a)) { toast('Le code doit avoir 4 à 8 chiffres'); return; }
    if (a !== b) { toast('Les deux codes ne sont pas pareils'); return; }
    S.settings.pinSalt = Math.random().toString(36).slice(2) + Date.now().toString(36);
    S.settings.pinHash = await pinHash(a, S.settings.pinSalt);
    save();
    $('#s-pin').value = ''; $('#s-pin2').value = '';
    renderPinState();
    toast('Code secret enregistré 🔒');
  });
  $$('input[name=s-brain]').forEach(r => r.addEventListener('change', brainVis));
  $('#s-test').addEventListener('click', testBrain);
  $('#s-journal').addEventListener('click', () => { $('#dlg-settings').close('cancel'); openJournal(); });
  $('#s-clear-chat').addEventListener('click', () => { if (confirm('Effacer toute la conversation avec Shadow ?')) { S.chat = []; save(); toast('Conversation effacée'); } });
  $('#s-clear-journal').addEventListener('click', () => {
    if (confirm('Effacer tout le journal et les étoiles ? (impossible à annuler)')) { S.journal = []; S.cur = null; S.stats = fresh().stats; save(); toast('Journal effacé'); }
  });
  $('#s-voices').addEventListener('click', e => {
    const b = e.target.closest('[data-forget-voice]');
    if (b && confirm('Shadow va oublier cette voix. Continuer ?')) { S.voices = VOIX.people().filter(p => String(p.id) !== b.dataset.forgetVoice); save(); renderVoices(); }
  });
  $('#s-mem').addEventListener('click', e => {
    const b = e.target.closest('[data-unfact]');
    if (!b) return;
    const m = MEMOIRE.data();
    m.facts = m.facts.filter(f => String(f.id) !== b.dataset.unfact); save(); renderMemory();
  });
  $('#s-mem-clear').addEventListener('click', () => {
    if (confirm('Shadow va oublier tous ses souvenirs (le journal et les visages restent). Continuer ?')) { S.memory = { facts: [], summaries: [], hard: [] }; S.memPos = S.chat.length; save(); renderMemory(); toast('Mémoire effacée'); }
  });
  $('#s-export').addEventListener('click', exportShadow);
  $('#s-import').addEventListener('click', () => $('#s-import-file').click());
  $('#s-import-file').addEventListener('change', e => { if (e.target.files[0]) importShadow(e.target.files[0]); e.target.value = ''; });
  $('#s-people').addEventListener('click', e => {
    const b = e.target.closest('[data-forget]');
    if (b && confirm('Shadow va oublier ce visage. Continuer ?')) { S.people = S.people.filter(p => String(p.id) !== b.dataset.forget); save(); renderPeople(); }
  });
  $('#dlg-settings').addEventListener('close', async () => {
    if ($('#dlg-settings').returnValue !== 'save') return;
    const before = S.settings;
    S.settings = { ...S.settings, ...readSettingsForm() };
    S.prenom = $('#s-prenom').value.trim().slice(0, 20) || S.prenom;
    save();
    toast('Réglages enregistrés ✅');
    applyLock();
    subtitle(null, null);
    if (S.settings.vision !== VISION.isOn()) visionToggle(S.settings.vision);
    if (dlg.started && (before.ears !== S.settings.ears || before.key !== S.settings.key)) {
      OREILLES.cancel();
      try { await OREILLES.start(); } catch (e) { toast('Micro indisponible'); }
    }
  });
}

// Premier toucher : le navigateur exige un geste pour autoriser le son et le micro
// Attention : sur téléphone, le son et le micro ne s'ouvrent que PENDANT le geste du doigt.
// Tout ce qui en a besoin est donc fait tout de suite, sans attendre.
function firstStart() {
  if (dlg.started) return;
  dlg.started = true;
  $('#hint').hidden = true;
  OREILLES.prime();        // réveille l'audio du micro maintenant
  voice.unlock();          // débloque la voix (obligatoire sur iPhone/iPad)
  fx.tone([[1, 0.01]]);    // débloque les bips
  const de = document.documentElement;
  if (de.requestFullscreen) de.requestFullscreen().then(() => lockLandscape()).catch(() => {});
  wake();
  if (dlg.notice) { const g = dlg.sayNext, note = dlg.notice; dlg.notice = null; dlg.sayNext = async () => { mustShow = true; await say(note); mustShow = false; if (typeof g === 'function') await g(); else if (g) await say(g); }; }
  (async () => {
    try {
      guard('ears');
      await Promise.race([OREILLES.start(), wait(20000).then(() => { throw new Error('micro trop long à répondre'); })]);
      setTimeout(() => { if (localStorage.getItem(BOOT_KEY) === 'ears') guardOk(); }, 20000);
    } catch (e) {
      console.warn('oreilles', e);
      guardOk();
    }
    // Sur un vieux téléphone, les yeux ne s'ouvrent pas tout seuls (on peut les demander : « tu me reconnais ? »)
    if (S.settings.vision && !LEGACY) visionToggle(true);
    life();
  })();
}

function boot() {
  face.el = $('#face');
  voice.init();
  // L'appli s'est arrêtée brutalement la dernière fois ?
  let crashed = null;
  try { crashed = localStorage.getItem(BOOT_KEY); } catch (e) { /* rien */ }
  if (crashed === 'vision') {
    S.settings.vision = false; save(); guardOk();
    dlg.notice = "La dernière fois, mes yeux ont fait planter le téléphone. Je les ai fermés : papa peut les rallumer dans les réglages.";
  } else if (crashed === 'ears') {
    S.settings.ears = 'chrome'; save(); guardOk();
    dlg.notice = "La dernière fois, mes oreilles ont fait planter le téléphone. J'utilise maintenant les oreilles de Chrome.";
  }
  // Adresse de secours : …/shadow/?secours → démarre sans les parties lourdes
  if (/[?&]secours/.test(location.search)) {
    S.settings.vision = false; S.settings.ears = 'chrome'; save(); guardOk();
    dlg.notice = "Mode secours : mes yeux sont fermés et j'utilise les oreilles de Chrome.";
  }
  bind();
  bindLock();
  applyLock();
  face.set('sleep');
  subtitle(null, null);
  if (!S.prenom) $('#dlg-welcome').showModal();
  window.SHADOW_OK = true; // le filet de sécurité sait que tout a démarré
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne indisponible */ });
  }
}
boot();
