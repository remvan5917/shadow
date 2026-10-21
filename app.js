/* =========================================================
   SHADOW — le robot (bêta) · Projet SHADOW, un enfant et son papa
   Juste un visage. On lui parle à voix haute, il répond à voix haute.
   « Shadow, on fait des devinettes ! »
   Tout reste sur cet appareil (localStorage).
   ========================================================= */
'use strict';

const STORE_KEY = window.__BANC ? 'shadow-banc' : 'shadow-v1'; // le banc d'essai ne touche jamais aux vraies données
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const N = t => ORTHO.norm(t);
const name = () => (S.settings && S.settings.video ? 'mon ami' : S.prenom || 'mon ami');
// Mode vidéo (pour filmer) : aucun prénom n'est dit, ni écrit à l'écran
const FAMILLE = /^(papa|maman|mamie|papi|papy|mami|tonton|tata|tatie|grand pere|grand mere|mamy)$/i;
function anonymize(text) {
  if (!S.settings || !S.settings.video) return text;
  const names = [S.prenom].concat((S.people || []).map(x => x.name), (VOIX.people ? VOIX.people() : []).map(x => x.name || x))
    .filter(n => n && typeof n === 'string' && n.length > 1 && !FAMILLE.test(n.trim()));
  let t = String(text);
  for (const n of names) {
    const e = n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\bd[’']${e}(?![A-Za-zÀ-ÿ])`, 'gi'), 'de mon ami')
      .replace(new RegExp(`(^|[^A-Za-zÀ-ÿ])${e}(?![A-Za-zÀ-ÿ])`, 'gi'), (m, a) => `${a}mon ami`);
  }
  return t;
}
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
      sound: true, slow: false, pause: 30, vision: true, ears: 'auto', subtitles: false, micSens: 'loin', lock: false,
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
function save() {
  S.updatedAt = Date.now();
  if (typeof SYNC !== 'undefined') SYNC.markDirty(); // la mémoire partagée sera mise à jour
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* plein ou bloqué */ }
}
// une suppression doit voyager vers les autres appareils (sinon la mémoire partagée la ferait revenir)
const tomb = (path, item) => { if (typeof SYNC !== 'undefined') SYNC.tomb(path, item); };
let S = load();

/* =================== LE VISAGE =================== */
const face = {
  el: null,
  state: 'sleep',
  // toutes ses expressions (les nouvelles sont dessinées dans style.css, partie v28)
  MOODS: ['idle', 'listen', 'think', 'happy', 'oops', 'sleep', 'sad', 'surprise', 'love', 'laugh', 'shy', 'proud', 'confused', 'sleepy', 'calm'],
  set(st) {
    if (!this.el) return;
    this.state = st;
    this.el.classList.remove.apply(this.el.classList, this.MOODS);
    this.el.classList.add(st);
    if (this.el.parentNode) this.el.parentNode.setAttribute('data-mood', st); // le halo prend la couleur de l'émotion
    if (st !== this._lastBody) { this._lastBody = st; CORPS.mood(st); } // les lumières du corps suivent l'émotion
    this.look(0, 0);
  },
  talk(on) { this.el.classList.toggle('talk', on); },
  look(dx, dy) {
    this._lx = dx; this._ly = dy; // le regard « de base » (les micro-mouvements s'y ajoutent)
    $$('#face .look').forEach(g => { g.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : ''; });
    // la tête suit un peu le regard (en 3D), et le reflet sur la vitre glisse dans l'autre sens
    if (this.el) {
      this.el.style.setProperty('--ry', `${(dx * 0.45).toFixed(2)}deg`);
      this.el.style.setProperty('--rx', `${(-dy * 0.5).toFixed(2)}deg`);
      this.el.style.setProperty('--sx', `${(-dx * 0.9).toFixed(1)}px`);
      this.el.style.setProperty('--gx', `${(-dx * 0.25).toFixed(2)}px`);
    }
  },
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

// un rire écrit dans une phrase (« ha ha ha », « hi hi hi », « hahaha », « ho ho ho »)
const LAUGH_RE = /(?:^|[^a-zà-ÿ])((?:h[aiouôîé]+[ -]?){2,})(?=$|[^a-zà-ÿ])/i;
const LAUGH_SPLIT = /((?:^|(?<=[^a-zà-ÿ]))(?:h[aiouôîé]+[ -]?){2,}[!.…]*)/i;
const robotVoice = () => ['robot', 'maison'].includes(S.settings.voix || 'maison'); // « maison » : voix Piper de l'ordinateur (et voix de robot du téléphone en secours)

// La voix de la maison : Piper fabrique la voix sur l'ordinateur (plus belle), et on lui ajoute un vrai effet de robot
const VOIXMAISON = {
  downUntil: 0,
  cache: new Map(),
  root() { const s = S.settings; return s.brain === 'local' && s.localUrl ? s.localUrl.replace(/\/+$/, '').replace(/\/v1$/, '') : ''; },
  usable() {
    return (S.settings.voix || 'maison') === 'maison' && !!this.root() && Date.now() > this.downUntil
      && navigator.onLine !== false && !!(window.AudioContext || window.webkitAudioContext) && !!window.fetch;
  },
  // la voix d'une phrase (gardée un moment : on peut la préparer pendant qu'il dit la phrase d'avant)
  get(t) {
    if (this.cache.has(t)) return this.cache.get(t);
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 4500);
    const p = fetch(`${this.root()}/shadow/voix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }), signal: ctl ? ctl.signal : undefined })
      .then(r => { clearTimeout(tm); if (!r.ok) throw new Error(`voix ${r.status}`); return r.arrayBuffer(); })
      .then(buf => new Promise((res, rej) => fx.audio().decodeAudioData(buf, res, rej)));
    p.catch(() => { this.downUntil = Date.now() + 120000; this.cache.delete(t); }); // l'ordi ne répond pas : voix du téléphone pendant 2 min
    this.cache.set(t, p);
    if (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value);
    return p;
  },
  prefetch(text) {
    if (!this.usable() || !S.settings.sound) return;
    const t = voice.clean(anonymize(text));
    if (t) this.get(t).catch(() => {});
  },
  // joue la voix avec l'effet de robot : résonance métallique + modulation électronique, un peu plus grave
  play(buffer) {
    const c = fx.audio();
    const lvl = S.settings.effet || 'leger';
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = lvl === 'aucun' ? 1 : lvl === 'fort' ? 0.93 : 0.96;
    const out = c.createGain(); out.gain.value = 1; out.connect(c.destination);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    src.connect(hp);
    const dry = c.createGain(); dry.gain.value = lvl === 'fort' ? 0.72 : lvl === 'aucun' ? 1 : 0.86;
    hp.connect(dry); dry.connect(out);
    const extra = [];
    if (lvl !== 'aucun') {
      const d = c.createDelay(0.05); d.delayTime.value = 0.0075; // un écho très court qui se répète : la boîte en métal
      const fb = c.createGain(); fb.gain.value = lvl === 'fort' ? 0.55 : 0.4;
      const wet = c.createGain(); wet.gain.value = lvl === 'fort' ? 0.45 : 0.27;
      hp.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(out);
      const ring = c.createGain(); ring.gain.value = 0; // modulation en anneau : le timbre électronique
      const osc = c.createOscillator(); osc.frequency.value = lvl === 'fort' ? 72 : 50;
      osc.connect(ring.gain); hp.connect(ring);
      const rw = c.createGain(); rw.gain.value = lvl === 'fort' ? 0.34 : 0.17;
      ring.connect(rw); rw.connect(out);
      osc.start(); extra.push(osc);
    }
    src.start();
    return { src, duration: buffer.duration / src.playbackRate.value, stop() { try { src.stop(); } catch (e) { /* déjà fini */ } extra.forEach(o => { try { o.stop(); } catch (e) { /* rien */ } }); } };
  },
};
const voice = {
  v: null,
  speaking: false,
  ok: true, // false = aucune voix française sur cet appareil → sous-titres obligatoires
  init() {
    if (!('speechSynthesis' in window)) return;
    const choose = () => {
      let vs = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
      // sans réseau : seulement les voix installées sur le téléphone (les autres se taisent)
      if (navigator.onLine === false && vs.some(v => v.localService)) vs = vs.filter(v => v.localService);
      // voix de robot : une voix d'homme si le téléphone en a une (Google : x-frb / x-frd)
      const male = v => /x-fr[bd]\b|thomas|henri|paul|mathieu|nicolas|guillaume|antoine|daniel|male|homme|masculin/i.test(`${v.name} ${v.voiceURI}`) && !/female|femme/i.test(v.name);
      const fav = robotVoice() && vs.find(v => /fr[-_]FR/i.test(v.lang) && male(v));
      this.male = !!fav;
      this.v = fav || vs.find(v => /fr[-_]FR/i.test(v.lang) && /google|amélie|amelie|thomas|denise|henri|natural|online/i.test(v.name))
        || vs.find(v => /fr[-_]FR/i.test(v.lang)) || vs[0] || null;
    };
    this.choose = choose;
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
    const t = this.clean(text);
    if (!S.settings.sound || !t) return Promise.resolve();
    // « ha ha ha », « hi hi », « ho ho » : au lieu de les lire, il RIT vraiment (rire de robot)
    if (LAUGH_RE.test(t)) {
      const parts = t.split(LAUGH_SPLIT).filter(x => x && x.trim());
      return parts.reduce((pr, part) => pr.then(() => {
        if (dlg.interrupt) return;
        const m = part.match(LAUGH_RE);
        if (m && m[0].replace(/[\s!.,-]/g, '').length >= part.replace(/[\s!.,-]/g, '').length - 1) {
          const k = /h[oô]/i.test(part) ? 'ho' : /h[iîy]/i.test(part) ? 'hi' : 'ha';
          return VISAGE.rire(k, Math.min(8, Math.max(3, (part.match(/h[aiouôîé]/gi) || []).length + 1)));
        }
        return this.say1(part);
      }), Promise.resolve());
    }
    return this.say1(t);
  },
  say1(t) {
    // la voix de la maison (Piper) si l'ordinateur répond, sinon la voix du téléphone
    if (VOIXMAISON.usable()) return this.sayMaison(t).catch(() => this.saySynth(t));
    return this.saySynth(t);
  },
  sayMaison(t) {
    return VOIXMAISON.get(t).then(buf => new Promise(res => {
      if (Date.now() - (this.endedAt || 0) > 2500) fx.comm(); // le petit signal quand il prend la parole
      OREILLES.mute(true); // il ne s'écoute pas lui-même
      const node = VOIXMAISON.play(buf);
      this._cur = node;
      this.speaking = true; face.talk(true);
      VISAGE.speak(t, Math.max(0.6, Math.min(1.7, (t.length / 14.5) / Math.max(0.3, node.duration)))); // la bouche suit la durée réelle
      let done = false;
      const end = () => {
        if (done) return;
        done = true; this.speaking = false; this.endedAt = Date.now(); this._cur = null;
        node.stop(); face.talk(false); VISAGE.quiet();
        if (node.tail) setTimeout(() => { if (!this.speaking) OREILLES.mute(false); }, node.tail * 650); // l'écho de la salle
        else OREILLES.mute(false);
        res();
      };
      node.src.onended = end;
      setTimeout(end, node.duration * 1000 + 1500);
    }));
  },
  saySynth(t) {
    return new Promise(res => {
      if (!('speechSynthesis' in window)) return res();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'fr-FR';
      if (this.v) u.voice = this.v;
      // voix de robot : plus grave et plus posée (encore plus grave si c'est une voix de femme)
      const robot = robotVoice();
      u.rate = (S.settings.slow ? 0.85 : 1.02) * (robot ? 0.92 : 1);
      u.pitch = robot ? (this.male ? 0.8 : 0.55) : 1.1;
      if (robot && Date.now() - (this.endedAt || 0) > 2500) fx.comm(); // un petit signal électronique quand il prend la parole
      let done = false;
      const end = () => {
        if (done) return;
        done = true; this.speaking = false; this.endedAt = Date.now();
        face.talk(false); VISAGE.quiet();
        OREILLES.mute(false);
        res();
      };
      u.onstart = () => { this.speaking = true; face.talk(true); VISAGE.speak(t, u.rate); };
      // La bouche prend la forme des sons ; le rythme des mots (si le navigateur le donne) la recale
      u.onboundary = e => {
        if (e.name && e.name !== 'word') return;
        VISAGE.sync(e.charIndex);
      };
      u.onend = end;
      u.onerror = end;
      setTimeout(end, 6000 + t.length * 120);
      OREILLES.mute(true); // il ne s'écoute pas lui-même
      speechSynthesis.speak(u);
    });
  },
  stop() {
    VISAGE.rireStop();
    if (this._cur) { try { this._cur.src.onended && this._cur.src.onended(); } catch (e) { /* rien */ } }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
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
  const demo = typeof ECRAN !== 'undefined' && ECRAN.DEMO; // la vidéo de démo se regarde sans sous-titres
  $('#bubble').hidden = empty || demo || !(S.settings.subtitles || !voice.ok || !S.settings.sound || mustShow);
  document.body.classList.toggle('subs', !$('#bubble').hidden);
}
// Shadow parle (et affiche des sous-titres si papa les a activés)
function say(text) {
  if (dlg.interrupt) return Promise.resolve(); // on vient de lui parler : il se tait et écoute
  text = anonymize(text);
  lastSaid = text;
  $('#bubble').classList.remove('alert');
  $('#heard').textContent = '';
  subtitle(esc(String(text).replace(/<[^>]+>/g, ' ')), null);
  VISAGE.react(text); // son visage suit ce qu'il dit (surpris, rieur, câlin…)
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
  audio() {
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  // le petit signal d'un robot de film qui ouvre son canal pour parler (très discret)
  comm() {
    if (!S.settings.sound) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime;
      [[1760, 0, 0.035], [2349, 0.045, 0.05]].forEach(([f, at, d]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(0.025, t + at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
        o.connect(g).connect(c.destination);
        o.start(t + at); o.stop(t + at + d + 0.02);
      });
    } catch (e) { /* pas de son */ }
  },
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
  dlg.interrupt = false; // on écoute à nouveau : Shadow peut reparler
  const ctxPrompt = prompt || `${name()} parle en français à Shadow, son robot.`;
  let r = await OREILLES.listen({ prompt: ctxPrompt, maxWait, cheap, endSilence: endSilence || (prompt === SPELL_PROMPT ? 2.2 : 1.15) });
  if (typeof r === 'string' && r && isEcho(r)) { OREILLES.takePrint(); r = await OREILLES.listen({ prompt: ctxPrompt, maxWait, endSilence: 0.9 }); }
  face.el.classList.remove('hearing');
  if (r && typeof r === 'object') {
    if (r.net || (r.error === 'no-ears' && !AI.online())) {
      // plus de réseau : Whisper → reconnaissance du téléphone ; si elle ne marche pas non plus → « je n'entends pas »
      if (OREILLES.engine() === 'whisper') { try { await OREILLES.start(); } catch (e) { /* rien */ } if (OREILLES.engine() === 'chrome') return ''; }
      dlg.deaf = true;
      return '';
    }
    if (r.error === 'no-ears') { dlg.deaf = true; return ''; }
    face.set('oops');
    mustShow = true;
    if (r.status === 429) {
      // limite de Groq atteinte : il le dit une fois, puis se repose sans répéter
      if (Date.now() - (dlg.tiredAt || 0) > 120000) { dlg.tiredAt = Date.now(); await say('Surchauffe de mes capteurs auditifs ! Je les mets en refroidissement une minute… bip… bip…'); }
      await wait(Math.max(20, Math.min(r.retryAfter || 60, 300)) * 1000);
      mustShow = false;
      return '';
    }
    if (r.status === 401 || r.status === 403) await say("Bip… accès refusé à mes capteurs auditifs. Ma clé d'énergie ne fonctionne plus : papa doit la vérifier dans le panneau de contrôle.");
    else if (r.error === 'no-ears') await say("Bip… mes capteurs auditifs ne sont pas activés. Papa doit brancher ma clé d'énergie dans le panneau de contrôle.");
    else if (r.error === 'not-allowed') await say('Mes oreilles sont bloquées. Il faut autoriser le micro, demande à papa.');
    else await say('Oups, mes oreilles ont un petit souci. Je réessaie.');
    await wait(4000);
    return '';
  }
  mustShow = false;
  if (r) {
    subtitle(null, `🎤 « ${r} »`); whoSpoke();
    heardLog.push({ at: Date.now(), t: r, ok: AI.lastConfident !== false }); // pour papa (en mémoire vive seulement)
    if (heardLog.length > 20) heardLog.shift();
  }
  return r;
}
// Sa propre voix qui revient du haut-parleur : on la reconnaît et on l'ignore
function isEcho(t) {
  if (Date.now() - (voice.endedAt || 0) > 2500) return false; // l'écho arrive juste après qu'il a parlé
  const words = s => N(s).split(' ').filter(w => w.length > 2);
  const a = words(t), b = new Set(words(lastSaid));
  if (a.length < 4 || !b.size) return false; // une réponse courte qui reprend ses mots (« la baleine bleue ») n'est pas un écho
  return a.filter(w => b.has(w)).length / a.length > 0.85;
}
const heardLog = [];
const brainTimes = [];
// Qui vient de parler ? (empreinte de voix + ce que voit la caméra)
let lastPrint = null, voiceLearnAt = 0;
function whoSpoke() {
  const vp = OREILLES.takePrint();
  lastPrint = vp;
  if (!vp) return;
  const id = VOIX.identify(vp);
  const faces = VISION.state.faces;
  const seenName = faces.length === 1 && faces[0].name ? faces[0].name : '';
  if (id) { dlg.speaker = id.name; dlg.speakerAt = Date.now(); dlg.speakerVoix = true; dlg.speakerSure = !!id.sure; }
  else if (seenName && !VOIX.people().length) { dlg.speaker = seenName; dlg.speakerAt = Date.now(); dlg.speakerVoix = false; dlg.speakerSure = false; }
  else dlg.speakerVoix = false;
  // il affine la voix de la personne qu'il voit parler (au plus une fois par minute)
  if (seenName && Date.now() - voiceLearnAt > 60000 && (!id || id.name === seenName) && VOIX.learn(seenName, vp)) voiceLearnAt = Date.now();
}
const speakerNow = () => (dlg.speaker && Date.now() - dlg.speakerAt < 90000 ? dlg.speaker : '');
// qui parle en ce moment : sa voix d'abord, sinon le seul visage connu devant lui, sinon l'enfant
function currentWho() {
  const sp = speakerNow();
  if (sp) return sp;
  const known = VISION.isOn() ? VISION.state.faces.filter(f => f.name) : [];
  return known.length === 1 ? known[0].name : S.prenom || '';
}

// Quelqu'un parle fort pendant que Shadow parle : il se tait tout de suite et écoute
OREILLES.on('bargein', () => {
  if (!voice.speaking) return;
  dlg.interrupt = true;
  voice.stop();
  face.set('listen');
});
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
  stop: /\b(stop+|stoppe|arrete|arretes|arretez|arreter|arrete toi|ca suffit|assez|j en ai marre|on arrete|tais toi|taisez vous|chut+|silence|laisse tomber|fin du jeu|c est fini|pause)\b/,
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
  move: /^(avance|recule|tourne|va a (gauche|droite)|viens ici|viens vers moi|deplace toi|roule|bouge|demi tour|fais un tour)\b/,
  joke: /\b(blague|blagues|fais moi rire|un truc drole)\b/,
  name: /\b(comment tu t appelles|c est quoi ton nom|tu t appelles comment|qui es tu|t es qui)\b/,
  hello: /^(bonjour|salut|coucou|hello|yo|bonsoir)\b/,
  howareyou: /\b(ca va|comment vas tu|comment tu vas|tu vas bien)\b/,
  thanks: /\b(merci)\b/,
  voiceLearn: /\b(apprends ma voix|retiens ma voix|enregistre ma voix|memorise ma voix|apprends a reconnaitre ma voix|apprendre ma voix)\b/,
  whoTalks: /\b(qui parle|tu reconnais ma voix|c est qui qui parle|qui c est qui parle|tu sais qui parle|c est quelle voix)\b/,
  bedtime: /\b(histoire du soir|histoire pour dormir|histoire pour m endormir|je vais me coucher|je vais dormir|je vais au lit)\b/,
  motJour: /\bmot du jour\b/,
  medailles: /\b(mes medailles|ma medaille|les medailles|combien de medailles|mes trophees|mes badges)\b/,
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
    if (!dlg.interrupt) await announceBadges();
    if (dlg.state === 'activity') dlg.state = 'talk';
  } catch (e) {
    if (!(e instanceof Stop)) {
      console.error(e);
      face.set('oops');
      await say("Oups, j'ai eu un petit bug dans mes circuits !");
      dlg.state = 'talk';
      return;
    }
    if (e.message === 'stop') { face.set('happy'); await say("D'accord, on arrête."); dlg.state = 'talk'; }
    else if (e.message === 'silence') { face.set('idle'); await say('Je fais une petite pause. Dis « Shadow » quand tu veux continuer !'); dlg.state = 'standby'; }
  }
}

// La boucle de vie de Shadow : il écoute, comprend, répond… tout le temps.
async function life() {
  for (;;) {
    if (dlg.sayNext) { const s = dlg.sayNext; dlg.sayNext = null; if (typeof s === 'function') await s(); else await say(s); }
    if (dlg.deaf && dlg.state !== 'sleep') { await deafLoop(); continue; }
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
    dlg.lastTalk = Date.now();
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
  // il ne l'annonce qu'une fois par jour : ensuite il se met en veille sans un mot, comme un robot de film
  const d = daily(), k = dayKey();
  if (d.standby !== k) { d.standby = k; save(); say('Je reste là. Dis « Shadow » quand tu veux me parler.'); }
}
function wake(who) {
  if (dlg.state !== 'sleep') return;
  VISAGE.boot(); // il s'allume, comme un vrai robot
  if (limitReached()) { // temps de jeu du jour fini : il reste endormi
    if (Date.now() - (dlg.limitSaidAt || 0) > 120000) { dlg.limitSaidAt = Date.now(); say(`On a bien joué aujourd'hui, ${name()} ! On se retrouve demain.`).then(() => face.set('sleep')); }
    return;
  }
  sessionStart = Date.now(); pauseDone = false;
  warmBrain(); // le cerveau de la maison se prépare pendant qu'il dit bonjour
  dlg.state = 'talk'; dlg.silence = 0; dlg.lastActive = Date.now();
  fx.wake(); face.set('happy');
  dlg.sayNext = async () => {
    await memoryGreeting(who); await updateNews();
    // il reparle d'abord de ce que l'enfant lui avait annoncé (« alors, la piscine ? »), sinon les nouvelles du jour
    if (!(await CONSCIENCE.followUp()) && !(await PROJETS.morning()) && !(await POKEMON.sauvageDuJour())) await dailyNews();
    CONSCIENCE.batteryCheck();
  };
  OREILLES.cancel();
}
// Nouvelle version installée ? Shadow l'annonce une fois (la toute première fois, il ne dit rien)
async function updateNews() {
  const v = window.SHADOW_VERSION;
  if (S.seenVersion === v) return;
  const first = !S.seenVersion;
  S.seenVersion = v; save();
  if (first) return;
  face.set('happy'); fx.wake();
  await say(`Bip bip ! Mes circuits viennent d'être mis à jour : je suis maintenant la version ${v} !`);
}
// Les nouvelles du jour, une fois par jour : mot du jour, calendrier, humeur
async function dailyNews() {
  const d = daily(), k = dayKey();
  if (d.cal !== k) {
    d.cal = k; save();
    const up = upcoming(14)[0];
    if (up) { if (!up.days) { face.set('happy'); fx.confetti(60); } await say(dodos(up)); }
  }
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
  const dd = daily(); // bonjour « avec souvenirs » : une fois par jour (ça coûte de l'énergie au cerveau)
  if (dlg.greeted === 0 || dd.memGreet === dayKey() || !AI.ready() || !MEMOIRE.data().facts.length && !MEMOIRE.data().summaries.length) return say(greeting(who));
  dd.memGreet = dayKey(); save();
  dlg.greeted++;
  face.set('happy');
  try {
    const r = await Promise.race([
      AI.chat([{ role: 'system', content: CERVEAU.persona() + MEMOIRE.context('', n) },
        { role: 'user', content: `(${n} vient d'arriver devant toi.) Dis-lui bonjour en 1 ou 2 phrases courtes, chaleureuses. Si c'est naturel, évoque UN souvenir précis de ta mémoire (un événement prévu, un goût…). Ne propose aucune activité.` }],
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
  // comme un robot de film : il salue, il est là, il écoute (pas de liste d'activités)
  if (dlg.greeted === 1 && !S.seenIntro) { S.seenIntro = true; save(); return `${hello} C'est moi, Shadow. Je t'écoute : parle-moi quand tu veux.`; }
  return hello;
}

/* ---------- comprendre ce qu'on lui dit ---------- */
async function handle(text) {
  const n = N(text);
  // « euh », « hum »… : ce n'est pas une phrase, il continue d'écouter sans répondre
  if (/^(euh+|heu+|hum+|hm+|ben|bah|ah|oh|eh|mmh+|pff+)$/.test(n)) return;
  // l'enfant rit : Shadow rit avec lui
  if (/^((ha|hi|ho|he|hah|hih|mdr|lol)[ !]*){2,}$|^(mdr|lol|ptdr)$/.test(n)) { await say(pick(['Ha ha ha !', 'Hi hi hi !', 'Ha ha ! Tu me fais rire !'])); return; }
  // « Shadow, rigole ! » : il montre son rire
  if (/\b(rigole|rigoler|ris|rire|esclaffe toi|fais (un|ton) rire|tu sais (rire|rigoler)|montre moi (ton rire|comment tu ris|comment tu rigoles))\b/.test(n) && !/\b(pourquoi|blague|drole)\b/.test(n)) {
    await VISAGE.rire('ha', 6); return say(pick(['Voilà mon rire de robot !', 'Ho ho, mes circuits rigolent encore !', 'Rire, ça recharge mes batteries !']));
  }
  // « ok », « d'accord », « cool » : comme R2-D2, un petit bip et un sourire, pas de discours
  if (!dlg.expect && /^(ok|okay|oki|d accord|dac|cool|top|ca marche|tres bien|bien|super)( shadow)?$/.test(n)) { face.flash('happy', 1200); fx.tone([[988, 0.06], [1319, 0.09]]); return; }
  if (!dlg.expect && /^(merci|merci beaucoup|merci shadow|merci beaucoup shadow)$/.test(n)) { face.flash('shy', 1500); return say(pick(['Avec plaisir.', 'De rien !', 'Bip. Avec plaisir.'])); }
  if (dlg.expect && Date.now() < dlg.expect.until) {
    const ex = dlg.expect;
    dlg.expect = null;
    if (isYes(text)) return ex.run();
    if (isNo(text)) return say("D'accord ! Une autre fois.");
  }
  dlg.expect = null;
  const early = ECRAN.routeEarly(n); // « arrête le minuteur » (avant le « stop » général)
  if (early) return early();
  const mg = MESSAGES.route(text, n); // « dis à papa que… », « papa m'a répondu ? »
  if (mg) return mg();
  const pj = PROJETS.route(text, n); // « je veux apprendre la table de 7 cette semaine », « où j'en suis ? »
  if (pj) return pj();
  const ap = APPRENDRE.route(text, n); // « je vais t'apprendre un jeu », « on joue au petit bac », « j'ai une devinette pour toi »
  if (ap) return ap();
  const en = ENSEMBLE.route(text, n); // « on joue à plusieurs », « quiz en famille », « on joue avec papa et maman »
  if (en) return en();
  const pk = POKEMON.route(text, n); // « parle-moi de Pikachu », « combat Pokémon », « on part à la chasse aux Pokémon »
  if (pk) return pk();
  // « comment s'est passée ta journée ? » : si la réponse n'est pas une demande de jeu, c'est l'humeur du jour
  const moodWas = dlg.moodPending;
  dlg.moodPending = false;
  if (RE.bedtime.test(n)) return histoireSoirFlow();
  if (RE.sleep.test(n)) return goSleep();
  if (RE.stop.test(n)) { CORPS.bouger('stop'); closeJournal(); hideBoard(); face.set('idle'); await say("D'accord, je me tais. Dis « Shadow » quand tu veux me parler."); dlg.state = 'standby'; return; }
  if (RE.repeat.test(n)) return say(lastSaid || "Je n'ai encore rien dit !");
  if (RE.help.test(n)) return say("Je sais plein de choses ! Discuter, écrire ton journal, faire une dictée, t'écouter lire, apprendre l'heure, l'anglais, les tables et le calcul, des quiz, des devinettes, les cris d'animaux, Jacques a dit, pierre-feuille-ciseaux, compter avec tes doigts, le jeu des émotions, dire les couleurs, chanter des comptines et raconter des histoires. Avec mon écran, je peux aussi chercher dans mon encyclopédie et te montrer des images, dire la météo, lancer un minuteur, t'accompagner pour le brossage des dents, respirer avec toi pour te calmer, jouer au robot mystère et au jeu des couleurs. Et on peut jouer à plusieurs, toute la famille : dis « on joue à plusieurs » ! Et vous pouvez m'apprendre de nouveaux jeux et des devinettes : dis « je vais t'apprendre un jeu » ! Dis-moi ce que tu veux !");
  if (RE.motJour.test(n)) return say(motDuJourText());
  if (RE.medailles.test(n)) return medaillesAnswer();
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
  const cs = CONSCIENCE.route(text, n); // « état de tes systèmes », « ta batterie »
  if (cs) return cs();
  const ecran = ECRAN.route(text, n); // encyclopédie, météo, minuteur, brossage, respiration, robot mystère, couleurs
  if (ecran) return ecran();
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
  if (RE.move.test(n)) {
    if (!CORPS.branche) { face.flash('oops'); return say("Je n'ai pas encore de roues ! Quand papa et toi m'aurez fabriqué un corps, je pourrai me déplacer !"); }
    const [dir, dur, msg] = moveCmd(n);
    face.flash('happy');
    const r = await CORPS.bouger(dir, dur);
    return say(r.ok ? msg : r.raison);
  }
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

// « avance un peu », « recule », « tourne à gauche »…
function moveCmd(n) {
  const dur = /\b(un peu|petit)\b/.test(n) ? 0.6 : /\b(beaucoup|loin|vite)\b/.test(n) ? 2 : 1;
  if (/\b(recule|arriere)\b/.test(n)) return ['back', dur, 'Je recule !'];
  if (/\bgauche\b/.test(n)) return ['left', 0.6, 'Je tourne à gauche !'];
  if (/\bdroite\b/.test(n)) return ['right', 0.6, 'Je tourne à droite !'];
  if (/\b(tourne|demi tour|fais un tour)\b/.test(n)) return ['right', 1.4, 'Je fais un tour sur moi-même !'];
  return ['forward', dur, "J'avance !"];
}
async function dance() {
  face.set('happy');
  face.el.classList.add('dance');
  fx.tone([[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.3], [784, 0.15], [1047, 0.4]]);
  if (CORPS.branche) { CORPS.danse(); await say('Regarde comme je danse ! Bip bop, bip bop !'); setTimeout(() => face.el.classList.remove('dance'), 2500); return; }
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
    if (AI.hasKey() && !AI.online()) return say("Mode exploration : sans réseau, mon grand cerveau se repose. Mes jeux de bord marchent toujours, demande-moi ce que je sais faire.");
    return say("Mon grand cerveau n'est pas branché, alors je ne comprends pas tout. Demande-moi ce que je sais faire.");
  }
  const m = hidden ? { text, hidden: false } : PRIVE.mask(text);
  S.chat.push({ role: 'user', content: m.text, hidden, who: currentWho() });
  if (S.chat.length > 60) { const cut = S.chat.length - 60; S.chat = S.chat.slice(-60); S.memPos = Math.max(0, S.memPos - cut); }
  save();
  if (m.hidden) await say("Chut ! Ça, c'est un secret de famille : je ne l'ai pas envoyé à mon cerveau.");
  face.set('think');
  try {
    const vus = VISION.state.faces.map(f => f.name).filter(Boolean);
    const who = speakerNow();
    const now = new Date();
    const facts = `\n\nInfos vraies du moment (sers-t'en, n'en invente pas d'autres) : il est ${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}. Tes yeux sont ${VISION.isOn() ? 'ouverts' : 'fermés'}${vus.length ? `, tu vois ${vus.join(', ')}` : ''}. Tu ne vas pas sur Internet et tu n'as pas les actualités ; tu as seulement ton encyclopédie pour enfants (avec [[cherche:sujet]]).${ECRAN.meteoFact() || " Tu n'as pas la météo sous les yeux : n'en parle pas au hasard (on peut te demander « quel temps fait-il »)."} ${CORPS.branche ? `Ton corps est branché : tu peux bouger avec [[avance]], [[recule]], [[gauche]], [[droite]] ou [[danse]]${CORPS.battery !== null ? ` (batterie du corps : ${CORPS.battery} %)` : ''}.` : "Ton corps n'est pas encore fabriqué."} ${(() => { const m = motDuJour(); const up = upcoming(30).slice(0, 3).map(x => `${x.e.text} dans ${x.days} jour${x.days > 1 ? 's' : ''}`); return `Le mot du jour est « ${m.mot} » (${m.def}).${up.length ? ` Calendrier : ${up.join(', ')}.` : ''}`; })()}`;
    const think = CERVEAU.isHard(text); // question difficile : le cerveau qui réfléchit
    const sys = CERVEAU.personality() + MEMOIRE.context(text, currentWho()) + facts + CONSCIENCE.etat() + POKEMON.factFor(text)
      + (think ? "\n\n(Question difficile : raisonne bien avant de répondre, puis réponds en 2 ou 3 phrases simples avec un exemple de tous les jours. Si c'est un exercice d'école, donne un indice plutôt que la réponse.)" : '') + (vus.length ? `\n\n(En ce moment, ta caméra reconnaît : ${vus.join(', ')}.)` : '')
      + (AI.lastConfident === false ? "\n\n(Attention : la dernière phrase a été mal entendue, elle peut contenir des erreurs. Si elle ne veut rien dire, demande gentiment de répéter au lieu de deviner.)" : '')
      + (who ? `\n\n(À sa voix, tu reconnais que c'est ${who} qui te parle${who !== name() ? ` (pas ${name()})` : ''}. Adresse-toi à ${who}.)` : '');
    const msgs = [{ role: 'system', content: anonymize(sys) + (S.settings.video ? "\n\n(Mode vidéo : on te filme pour présenter le Projet SHADOW. Ne dis AUCUN prénom, dis « mon ami ». C'est sans doute papa qui te parle.)" : '') }, ...S.chat.slice(-10).map(({ role, content }) => ({ role, content: String(content).slice(0, 400) }))]; // les 10 derniers messages suffisent
    // Il commence à parler dès que la 1re phrase est prête (la suite arrive pendant qu'il parle)
    if (think) { face.set('think'); VISAGE.puff('question', 2); }
    let queue = think ? say(pick(['Hmm, laisse-moi réfléchir…', 'Bonne question. Je réfléchis…', 'Je fais tourner mes circuits…'])) : Promise.resolve(), bad = false, spoken = 0;
    let action = '', actionArg = '';
    const tAsk = performance.now();
    const onSentence = raw0 => {
      if (!spoken) { brainTimes.push(Math.round(performance.now() - tAsk)); if (brainTimes.length > 20) brainTimes.shift(); }
      // le cerveau peut lancer une activité : [[devinette]], [[jacques]]… (jamais dit à voix haute)
      const sentence = String(raw0).replace(/\[\[\s*([a-z_]+)\s*(?::\s*([^\]]*))?\]\]/gi, (m, a, arg) => { action = a.toLowerCase(); actionArg = (arg || '').trim(); return ''; }).replace(/\[\[[^\]]*$/, '').trim();
      if (bad || !sentence) return;
      if (ETHIQUE.safe(sentence) !== sentence) { bad = true; return; }
      if (!spoken++) face.set(/bravo|génial|super|youpi|hourra|gagné|trouvé/i.test(sentence) ? 'happy' : 'idle');
      VOIXMAISON.prefetch(sentence); // la voix de la phrase se prépare pendant qu'il dit la précédente
      queue = queue.then(() => say(sentence));
    };
    let raw;
    try {
      raw = await AI.chatStream(msgs, { maxTokens: think ? 220 : 150, temperature: think ? 0.4 : 0.55, think }, onSentence);
    } catch (e) {
      if (spoken) throw e;
      raw = await AI.chat(msgs, { maxTokens: think ? 220 : 150, temperature: 0.55, think }); // secours sans « mot à mot »
      onSentence(raw);
    }
    await queue;
    const m = String(raw || '').match(/\[\[\s*([a-z_]+)\s*(?::\s*([^\]]*))?\]\]/i);
    if (m) { action = m[1].toLowerCase(); actionArg = (m[2] || '').trim(); }
    const clean = String(raw || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    // [[regarder]] : il a besoin de voir pour répondre → il ouvre les yeux, regarde, puis répond
    if (!bad && action === 'regarder') {
      if (clean) S.chat.push({ role: 'assistant', content: clean });
      save();
      if (!dlg.interrupt) await CONSCIENCE.lookAndAnswer(text, msgs);
      return;
    }
    // [[rappel:2026-10-21 08:00|prendre ton cahier]] : il le fera plus tard, tout seul
    // un petit cerveau peut ajouter une commande par erreur : on ne la suit que si l'enfant l'a vraiment demandée
    if (action === 'rappel' && !/\b(rappel|rappelle|rappeler|previens|fais moi penser|n oublie pas|dis moi (de|quand|dans|a)|reveille)\b/.test(N(text))) action = '';
    if (action === 'cherche' && clean.length > 60) action = ''; // il a déjà répondu : pas besoin de chercher en plus
    if (!bad && action === 'rappel') {
      if (!CONSCIENCE.addIntention(actionArg)) await say("Hum, je n'ai pas bien compris quand je dois te le rappeler. Redis-le-moi avec le jour et l'heure ?");
      else if (!spoken) await say("C'est noté, je te le rappellerai.");
      S.chat.push({ role: 'assistant', content: clean || "C'est noté, je te le rappellerai." });
      save();
      return;
    }
    // [[cherche:volcan]] : il ne répond pas de mémoire, il va lire son encyclopédie
    if (!bad && action === 'cherche' && actionArg) {
      if (clean) S.chat.push({ role: 'assistant', content: clean });
      save();
      if (!dlg.interrupt) await ECRAN.savoir(actionArg, text, true);
      save();
      return;
    }
    const reply = bad ? "Hum, ça, c'est un sujet pour en parler avec papa." : (clean || (action ? "C'est parti !" : "Bip… j'ai perdu le fil. Tu peux répéter ?"));
    if (bad || !spoken) await say(reply);
    S.chat.push({ role: 'assistant', content: reply });
    save();
    if (S.chat.length - S.memPos >= 16) memorize(); // longue discussion : on range au fur et à mesure
    if (!bad && action && !dlg.interrupt) await runAction(action, actionArg);
  } catch (e) {
    face.set('oops');
    // un message de robot (la vraie cause, mais sans jargon) ; le code technique va dans les réglages de papa
    const st = e.status || 0;
    const wait_ = s => { const h = Math.round(s / 3600); return s >= 3000 ? `environ ${h} heure${h > 1 ? 's' : ''}` : s > 300 ? `environ ${Math.max(1, Math.round(s / 60))} minutes` : 'quelques minutes'; };
    const why = st === 401 || st === 403 ? "Bip… accès refusé à mon noyau central. Ma clé d'énergie ne fonctionne plus : papa doit la vérifier dans le panneau de contrôle."
      : st === 429 ? `Alerte, alerte ! Mon cerveau quantique a utilisé toute son énergie. Je passe en mode recharge pendant ${wait_(e.retryAfter || 600)}. Mes circuits de secours restent allumés : on peut faire une dictée, des devinettes, du calcul ou Jacques a dit !`
        : st >= 500 ? "Interférences détectées ! Mon cerveau distant ne répond plus. Je relance mes circuits… réessaie dans un petit moment."
          : /connexion|WiFi|Trop long/i.test(e.message) ? "Signal perdu… Je n'arrive plus à joindre mon cerveau distant. Vérifie le WiFi, je reste en veille."
            : 'Bip… anomalie dans mes circuits. Réessaie dans un instant !';
    S.lastBrainError = { at: Date.now(), msg: e.message.slice(0, 200) }; save();
    mustShow = true;
    const spoken = say(why);
    $('#bubble').classList.add('alert'); // le style d'alerte reste jusqu'à la prochaine phrase
    await spoken;
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
      const r = await AI.chat([{ role: 'system', content: CERVEAU.persona() + MEMOIRE.context('', currentWho()) },
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
  if (OREILLES.engine() !== 'whisper') return say("Pour reconnaître les voix, j'ai besoin de mes super-oreilles. Elles ont besoin de ma clé d'énergie et du réseau : papa peut les activer dans le panneau de contrôle.");
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

// Les activités que le grand cerveau peut lancer lui-même
async function runAction(a, arg) {
  const map = {
    brossage: ECRAN.brossageFlow, respiration: ECRAN.respirationFlow, mystere: ECRAN.mystereFlow, simon: ECRAN.simonFlow,
    journal: journalFlow, dictee: dicteeMotsFlow, lecture: lectureFlow, heure: heureFlow, anglais: anglaisFlow,
    calcul: () => calcFlow('mix'), quiz: () => quizFlow(''), devinette: devinetteFlow, cris: crisFlow,
    jacques: jacquesFlow, pfc: pfcFlow, doigts: doigtsFlow, emotions: emotionsFlow, chanson: () => chanterFlow(''),
    visage: meetFlow, voix: voiceFlow,
  };
  if (a === 'stop') { CORPS.bouger('stop'); face.set('idle'); dlg.state = 'standby'; return; }
  if (CORPS.branche && { avance: 1, recule: 1, gauche: 1, droite: 1 }[a]) {
    const dir = { avance: 'forward', recule: 'back', gauche: 'left', droite: 'right' }[a];
    return CORPS.bouger(dir, dir === 'forward' || dir === 'back' ? 1 : 0.6);
  }
  if (a === 'danse') return dance();
  if (a === 'dormir') return goSleep();
  if (a === 'histoire_soir') return histoireSoirFlow();
  if (a === 'meteo') return ECRAN.meteo('');
  if (a === 'rapport') return CONSCIENCE.rapport();
  if (a === 'minuteur') return ECRAN.minuteur(arg || '');
  if (a === 'cherche' && arg) return ECRAN.savoir(arg, arg, true);
  if (a === 'pokemon' && arg) { const p = POKEMON.findIn(arg); if (p) return POKEMON.pokedex(p); }
  if (a === 'pokecombat') return activity(() => POKEMON.combat(arg || ''));
  if (a === 'pokechasse') return activity(POKEMON.chasse);
  if (a === 'pokedevine') return activity(POKEMON.devinette);
  if (a === 'pokequiz') return activity(POKEMON.quiz);
  if (a === 'pokedex') return POKEMON.monPokedex();
  if (a === 'plusieurs') return activity(() => ENSEMBLE.partie(arg || ''));
  if (a === 'apprendre') return activity(() => APPRENDRE.apprendreJeu(arg ? `jeu du ${arg}` : ''));
  if (a === 'jouer' && arg) { const j = APPRENDRE.cherche(N(arg)); if (j) return activity(() => APPRENDRE.jouer(j, '')); }
  if (map[a]) return activity(map[a]);
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

function journalTitle() { return S.prenom && !S.settings.video ? `Le journal ${deName(S.prenom)}` : 'Mon journal'; }
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
  if (!S.devSeen) S.devSeen = [];
  let fresh = JEUX.DEVINETTES.filter(d => !S.devSeen.includes(d.q));
  if (fresh.length < 3) { S.devSeen = []; fresh = JEUX.DEVINETTES; }
  const list = JEUX.shuffle(fresh);
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
    if (S.devSeen && !S.devSeen.includes(d.q)) { S.devSeen.push(d.q); save(); }
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
    for (let tries = 0, pasNombre = 0; ;) {
      const t = await ask(line, { wait: 20000 });
      if (RE.dontknow.test(N(t))) { await say(`La réponse, c'est ${q.r}. ${q.tip}`); break; }
      const v = JEUX.parseNumber(t);
      if (v === null) { // trois fois autre chose qu'un nombre : il donne la réponse et passe à la suite
        if (++pasNombre >= 3) { await say(`La réponse, c'était ${q.r}. On continue !`); break; }
        line = `Dis-moi juste le nombre. ${q.ask}`; continue;
      }
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
  if (kind === 'mix') { // le niveau s'adapte : plus dur si tout est juste, plus facile si c'est trop dur
    const lvl = S.calcLevel || 2;
    if (score >= 4 && lvl < 3) { S.calcLevel = lvl + 1; save(); await say('Tu es trop fort : la prochaine fois, je te pose des calculs plus difficiles !'); }
    else if (score <= 1 && lvl > 1) { S.calcLevel = lvl - 1; save(); await say('La prochaine fois, je te pose des calculs un peu plus faciles.'); }
  }
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

/* ---------- une version plus récente existe ? il se met à jour tout seul (une fois) ---------- */
async function verifierMaj() {
  try {
    if (!navigator.onLine || window.__BANC) return;
    const r = await fetch(`index.html?maj=${Date.now()}`, { cache: 'no-store' });
    const m = (await r.text()).match(/SHADOW_VERSION = '(\d+)'/);
    if (!m || +m[1] <= +window.SHADOW_VERSION) return;
    let deja = ''; try { deja = sessionStorage.getItem('shadow-maj') || ''; } catch (e) { /* rien */ }
    if (deja === m[1]) return; // déjà essayé : on ne tourne pas en rond
    try { sessionStorage.setItem('shadow-maj', m[1]); } catch (e) { /* rien */ }
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('shadow-app')).map(k => caches.delete(k))); }
    const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
    await Promise.all(regs.map(g => g.update().catch(() => {})));
    location.reload();
  } catch (e) { /* pas de réseau : on réessaiera au prochain lancement */ }
}

/* =================== LA VISION =================== */
const seen = { last: {}, present: false, presentSince: 0, unknownSince: 0, askedUnknown: 0, smileAt: 0, sadAt: 0, sadCount: 0 };
let visionBusy = false;

/* ---------- Anti-plantage ----------
   Avant une étape lourde (les yeux), on laisse un petit mot dans la mémoire.
   Si l'appli s'arrête brutalement, le mot est encore là au lancement suivant :
   Shadow sait alors ce qui a planté et ne recommence pas tout seul. */
const BOOT_KEY = window.__BANC ? 'shadow-banc-boot' : 'shadow-boot';
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
    if (now - prev > 30 * 60000 && calm) {
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
    if (calm && now - seen.unknownSince > 8000 && now - seen.askedUnknown > 60 * 60000) {
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
    if (calm && now - seen.smileAt > 45 * 60000) {
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
  await say("Super, on fait connaissance ! Mets-toi tout seul devant moi, à peu près à un bras de distance, avec de la lumière sur ton visage.");
  // plusieurs poses : de face, un peu à gauche, un peu à droite, avec un sourire (il te reconnaîtra mieux dans tous les cas)
  const POSES = [['Regarde-moi bien dans les yeux…', 4], ['Tourne un tout petit peu la tête vers la gauche…', 3], ['Et maintenant un petit peu vers la droite…', 3], ['Et fais-moi un grand sourire !', 2]];
  let desc = [], small = 0;
  for (const [line, n] of POSES) {
    face.set('think');
    await say(line);
    try { desc = desc.concat(await VISION.capture(n, 6000, { allowFew: true })); } catch (e) {
      if (e.message === 'several') { face.set('oops'); await say("Il y a plusieurs visages ! Un seul à la fois, s'il te plaît. Redis-moi « on fait connaissance » quand tu es prêt."); return; }
      if (e.message === 'small') small++;
    }
    fx.tone([[880, 0.05]]); // un petit bip : la photo mentale est prise
  }
  if (desc.length < 7) {
    face.set('oops');
    await say(small ? "Tu es un peu loin : approche-toi de moi, et redis-moi « on fait connaissance »." : "Je n'ai pas bien vu ton visage. Mets-toi en face de moi, avec de la lumière, et redis-moi « on fait connaissance ».");
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
  if (p) p.desc = [...desc, ...p.desc].slice(0, 40); // les nouvelles photos mentales passent devant (les plus fiables)
  else S.people.push({ id: Date.now(), name: who, desc });
  save();
  seen.last[who] = Date.now();
  face.set('happy'); fx.confetti(30);
  await say(p ? `Merci ${who} ! Maintenant je te reconnaîtrai encore mieux.` : `Enchanté, ${who} ! Maintenant, je te reconnaîtrai.`);
}

/* =================== IL PREND L'INITIATIVE =================== */
// S'il voit l'enfant à côté de lui depuis un moment, sans rien faire, il propose un jeu (pas plus d'une fois tous les 15 min)
setInterval(() => {
  if (!S.settings.propose) return; // papa choisit dans les réglages (par défaut : il ne propose rien de lui-même)
  if (!dlg.started || !VISION.isOn() || dlg.busy || voice.speaking || OREILLES.hearing()) return;
  if (!['standby', 'talk'].includes(dlg.state) || dlg.expect) return;
  const now = Date.now(), d = daily();
  if ((d.proposals || 0) >= 2) return; // 2 fois par jour au plus
  if (!seen.present || now - seen.presentSince < 4 * 60000) return;
  if (now - (dlg.lastTalk || 0) < 5 * 60000 || now - (dlg.lastProposal || 0) < 60 * 60000) return;
  if (!VISION.state.faces.some(f => f.name === S.prenom)) return;
  dlg.lastProposal = now; d.proposals = (d.proposals || 0) + 1; save();
  const today = dayKey();
  const ideas = [
    !(S.journal || []).some(e => dayKey(new Date(e.at)) === today) && ['écrire une phrase dans ton journal', journalFlow],
    ['faire quelques devinettes', devinetteFlow],
    !LEGACY && ['jouer à Jacques a dit', jacquesFlow],
    ['faire un petit quiz', () => quizFlow('')],
    ['faire du calcul', () => calcFlow('mix')],
    ['chanter une comptine', () => chanterFlow('')],
    ...ECRAN.ideas(),
  ].filter(Boolean);
  const [label, fn] = pick(ideas);
  dlg.state = 'talk'; dlg.silence = 0;
  dlg.expect = { until: now + 60000, run: () => activity(fn) };
  face.flash('happy');
  say(pick([`Psst, ${name()}. Ça te dirait de ${label} ?`, `Bip. J'ai une idée : ${label}. Tu veux ?`]));
}, 20000);

/* =================== SANS RÉSEAU =================== */
// Mode « je n'entends pas » : sans réseau (ou sans oreilles), on le touche et il propose un jeu
// qui n'a pas besoin d'écouter.
async function deafLoop() {
  if (!dlg.deafSaid) {
    dlg.deafSaid = true;
    face.set('idle');
    mustShow = true;
    await say("Sans réseau, mes oreilles ne marchent plus… Mais touche mon visage, et je te propose un jeu !");
    mustShow = false;
  }
  const hint = $('#hint');
  hint.innerHTML = '👆 Touche-moi pour jouer';
  hint.hidden = false;
  const tapped = await new Promise(res => { dlg.deafTap = res; setTimeout(() => res(false), 30000); });
  dlg.deafTap = null;
  hint.hidden = true;
  if (!tapped) { // de temps en temps, il vérifie si ses oreilles remarchent
    if (AI.online() && navigator.onLine !== false) await earsBack();
    return;
  }
  const list = [['une comptine', chanterFlow], ['le mot du jour', () => say(motDuJourText())], ['une blague', () => say(pick(JOKES))], ['le jeu des émotions', emotionsFlow]];
  if (!LEGACY) list.push(['Jacques a dit', jacquesFlow], ['pierre, feuille, ciseaux', pfcFlow], ['compter avec les doigts', doigtsFlow]);
  const [label, fn] = list[(dlg.showI = (dlg.showI || 0) + 1) % list.length];
  face.set('happy');
  await say(`C'est parti pour ${label} !`);
  dlg.state = 'talk';
  await activity(fn);
}
let earsChecking = false;
async function earsBack() {
  if (earsChecking || !dlg.deaf) return;
  earsChecking = true;
  try {
    try { await OREILLES.start(); } catch (e) { return; }
    if (OREILLES.engine() === 'whisper' && dlg.deaf) {
      dlg.deaf = false; dlg.deafSaid = false;
      face.set('happy');
      await say('Mes oreilles remarchent ! Tu peux de nouveau me parler.');
    }
  } finally { earsChecking = false; }
}
async function netChanged(on) {
  voice.choose && voice.choose();
  if (!dlg.started) return;
  if (on) {
    AI.netDownUntil = 0;
    if (dlg.deafTap) { const t = dlg.deafTap; dlg.deafTap = null; t(false); }
    if (dlg.deaf) await earsBack();
    else { OREILLES.cancel(); try { await OREILLES.start(); } catch (e) { /* rien */ } if (!dlg.busy && dlg.state !== 'sleep') say('Connexion retrouvée ! Mon grand cerveau est de retour.'); }
    if (S.offlineVer !== window.SHADOW_VERSION) setTimeout(() => preloadOffline(false), 20000);
  } else {
    AI.netDownUntil = Date.now() + 3600000;
    OREILLES.cancel();
    try { await OREILLES.start(); } catch (e) { /* rien */ }
    if (!dlg.busy && dlg.state !== 'sleep') say('Je passe en mode exploration : plus de réseau, donc mon grand cerveau se repose. Mes circuits de bord marchent toujours !');
  }
}
window.addEventListener('offline', () => netChanged(false));
window.addEventListener('online', () => netChanged(true));

// Préparer le hors-ligne : télécharger les yeux (≈ 30 Mo) quand il y a du WiFi
async function preloadOffline(manual) {
  if (navigator.onLine === false) { if (manual) toast('Il faut du WiFi pour préparer le hors-ligne'); return; }
  if (manual) toast('Téléchargement des yeux… (≈ 30 Mo)');
  try {
    await VISION.preload(!LEGACY);
    S.offlineVer = window.SHADOW_VERSION; S.offlineAt = Date.now(); save();
    if (manual) toast('✅ Shadow est prêt à sortir sans WiFi');
  } catch (e) {
    console.warn('hors-ligne', e);
    if (manual) toast('Téléchargement incomplet : réessaie avec le WiFi');
  }
  if ($('#dlg-settings').hasAttribute('open')) renderOffline();
}
function corpsState() {
  if (!CORPS.supported()) return "Bluetooth indisponible dans ce navigateur (Chrome sur Android ou sur ordinateur).";
  return CORPS.branche ? `✅ Corps branché${CORPS.battery !== null ? ` · batterie ${CORPS.battery} %` : ''}${CORPS.obstacle !== null ? ` · dernier obstacle à ${CORPS.obstacle} cm` : ''}` : 'Pas de corps connecté.';
}
function renderOffline() {
  $('#s-off-state').textContent = S.offlineAt
    ? `✅ Prêt depuis le ${new Date(S.offlineAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${S.offlineVer !== window.SHADOW_VERSION ? ' (une mise à jour sera téléchargée au prochain WiFi)' : ''}.`
    : '⚠️ Pas encore préparé : appuyez sur le bouton avec le WiFi.';
}

/* =================== AUTO-TEST ET RAPPORT (pour régler Shadow avec de vrais chiffres) =================== */
const diag = {};
const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
async function autoTest() {
  const out = $('#s-diag');
  const line = (k, v) => { diag[k] = v; out.innerHTML += `<div class="small">${esc(k)} : <b>${esc(String(v))}</b></div>`; };
  out.innerHTML = '';
  line('Version', `v${window.SHADOW_VERSION}${LEGACY ? ' (mode vieux téléphone)' : ''}`);
  const fr = ('speechSynthesis' in window) ? speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang)) : [];
  line('Voix', voice.v ? `${voice.v.name}${voice.v.localService ? ' (sur le téléphone)' : ' (par Internet)'} — ${fr.length} voix françaises` : 'aucune voix française');
  line('Réseau', navigator.onLine === false ? 'hors ligne' : AI.online() ? 'en ligne' : 'coupé récemment');
  line('Oreilles', OREILLES.engine() || 'aucune');
  out.innerHTML += '<div class="small">🎤 Parle pendant 3 secondes…</div>';
  let peak = 0;
  const t0 = Date.now();
  await new Promise(r => { const iv = setInterval(() => { peak = Math.max(peak, OREILLES.meter().level); if (Date.now() - t0 > 3000) { clearInterval(iv); r(); } }, 50); });
  const m = OREILLES.meter();
  line('Micro', OREILLES.engine() === 'whisper' ? `voix max ${peak.toFixed(3)} / seuil ${m.threshold.toFixed(3)} / bruit ${m.noise.toFixed(4)} → ${peak > m.threshold * 1.5 ? 'OK' : 'trop faible : rapprochez-vous ou montez la sensibilité'}` : 'jauge seulement avec les oreilles Whisper');
  if (AI.canTranscribe()) {
    const sr = 16000, n = sr, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const t1 = performance.now();
    try { await AI.transcribe(new Blob([b], { type: 'audio/wav' })); line('Oreilles (aller-retour)', `${Math.round(performance.now() - t1)} ms`); } catch (e) { line('Oreilles (aller-retour)', `erreur : ${e.message}`); }
  }
  if (AI.ready()) {
    const t2 = performance.now();
    try { await AI.chat([{ role: 'user', content: 'Réponds juste : ok' }], { maxTokens: 10 }); line('Cerveau (aller-retour)', `${Math.round(performance.now() - t2)} ms (${S.settings.model})`); } catch (e) { line('Cerveau (aller-retour)', `erreur : ${e.message}`); }
  } else line('Cerveau', AI.hasKey() ? 'pas de réseau' : 'pas de clé');
  line('Yeux', VISION.isOn() ? `ouverts, ${VISION.state.faces.length} visage(s) vu(s), ${VISION.cost()} ms par image` : 'fermés');
  try {
    const c = await caches.open('shadow-modeles'); const k = await c.keys();
    line('Hors-ligne', `${k.length} fichiers de modèles gardés${S.offlineAt ? ', préparé' : ', pas encore préparé'}`);
  } catch (e) { line('Hors-ligne', 'réserve indisponible'); }
  out.innerHTML += '<div class="small">✅ Fini. Appuyez sur « Copier le rapport » et collez-le à Claude.</div>';
}
function reportText() {
  const s = Object.assign({}, S.settings);
  delete s.key; delete s.pinHash; delete s.pinSalt; delete s.reminders; delete s.events;
  let crash = null;
  try { crash = localStorage.getItem(BOOT_KEY); } catch (e) { /* rien */ }
  return [
    `Rapport Shadow v${window.SHADOW_VERSION} — ${new Date().toLocaleString('fr-FR')}`,
    `Navigateur : ${navigator.userAgent}`,
    `Mode vieux téléphone : ${LEGACY} · réseau : ${navigator.onLine === false ? 'hors ligne' : 'en ligne'} · oreilles : ${OREILLES.engine()} · yeux : ${VISION.isOn() ? `ouverts (${VISION.cost()} ms/image)` : 'fermés'}`,
    `Temps moyens : oreilles ${avg(OREILLES.timings()) || '?'} ms · cerveau (1re phrase) ${avg(brainTimes) || '?'} ms · cerveau utilisé : ${AI.ready() ? (AI.cfg().local ? 'maison' : 'Groq') : 'mini'} · dernières oreilles : ${AI.lastEars || '?'}${S.settings.sttCool > Date.now() ? ' (Groq au repos)' : ''} · visage : ${VISAGE.fps || '?'} images/s${document.body.classList.contains('lite') ? ' (allégé)' : ''}`,
    `Dernière erreur du cerveau : ${S.lastBrainError ? `${S.lastBrainError.msg} (${new Date(S.lastBrainError.at).toLocaleString('fr-FR')})` : 'aucune'}${crash ? ` · plantage détecté : ${crash}` : ''}`,
    `Auto-test : ${Object.keys(diag).length ? Object.entries(diag).map(([k, v]) => `${k} = ${v}`).join(' | ') : 'pas lancé'}`,
    `Réglages : ${JSON.stringify(s)}`,
    'Ce que Shadow a entendu (❓ = mal entendu) :',
    ...heardLog.map(h => `  ${new Date(h.at).toLocaleTimeString('fr-FR')} ${h.ok ? '🎤' : '❓'} « ${h.t} »`),
  ].join('\n');
}
async function copyReport() {
  const txt = reportText();
  try { await navigator.clipboard.writeText(txt); toast('📋 Rapport copié : collez-le à Claude'); }
  catch (e) { const ta = $('#s-diag-text'); ta.hidden = false; ta.value = txt; ta.select(); try { document.execCommand('copy'); toast('📋 Rapport copié'); } catch (e2) { toast('Sélectionnez le texte et copiez-le'); } }
}

/* =================== TOUCHER L'ÉCRAN =================== */
// Toucher le visage : le réveiller, l'interrompre, ou lui parler sans dire « Shadow »
function tap() {
  if (ECRAN.DEMO) return ECRAN.demo(); // mode démo (vidéo) : il se présente, sans écouter
  if (!dlg.started) { face.set('happy'); return firstStart(); }
  if (ECRAN.tapCancel()) return; // le brossage de dents ou la respiration s'arrête
  if (VISAGE.tapped()) return; // trois petites tapes : ça chatouille !
  if (dlg.deaf && dlg.deafTap) { const t = dlg.deafTap; dlg.deafTap = null; return t(true); }
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
  $('#s-groq').hidden = false; // la clé Groq sert aussi aux oreilles et de relais au cerveau de la maison
  $('#s-local').hidden = !local;
}
// l'énergie utilisée aujourd'hui (dans les réglages de papa)
setInterval(() => {
  const el = $('#s-usage');
  if (!el || !$('#dlg-settings').open) return;
  const u = S.usage && S.usage.day === new Date().toDateString() ? S.usage : { tokens: 0, req: 0, audio: 0 };
  el.textContent = `Aujourd'hui : ${u.req} réponse${u.req > 1 ? 's' : ''} du cerveau (${Math.round(u.tokens / 1000)} k jetons), ${Math.round(u.audio / 60)} min de voix transcrite.${AI.localDownUntil > Date.now() ? ' Cerveau de la maison injoignable : relais par Groq.' : ''}`;
}, 2000);
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
    bargeIn: $('#s-barge').checked,
    micNS: $('#s-ns').checked,
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
  renderCarnet(m);
  $('#s-mem-count').textContent = `${m.facts.length} souvenir${m.facts.length > 1 ? 's' : ''} · ${m.summaries.length} résumé${m.summaries.length > 1 ? 's' : ''} d'activités · ${m.hard.length} mot${m.hard.length > 1 ? 's' : ''} difficile${m.hard.length > 1 ? 's' : ''}`;
  // les souvenirs rangés par personne (comme Shadow les range dans sa tête)
  const groups = {};
  m.facts.slice().reverse().forEach(f => { const k = f.who || S.prenom || "l'enfant"; (groups[k] = groups[k] || []).push(f); });
  $('#s-mem').innerHTML = m.facts.length
    ? Object.keys(groups).map(k => `<p class="small carnet-who">${esc(k)}</p>${groups[k].map(f => `<div class="person"><span>${esc(f.text)}</span><button type="button" class="ghost sm danger" data-unfact="${f.id}" aria-label="Oublier ce souvenir">✕</button></div>`).join('')}`).join('')
    : '<p class="small muted">Pas encore de souvenirs. Shadow en garde au fil des discussions.</p>';
}
// le reste du carnet : consignes, événements, rappels, projets (chaque ligne peut être supprimée)
function renderCarnet(m) {
  const row = (txt, attr, id, btn = '✕') => `<div class="person"><span>${txt}</span><button type="button" class="ghost sm danger" data-${attr}="${esc(String(id))}">${btn}</button></div>`;
  const none = t => `<p class="small muted">${t}</p>`;
  const rules = m.rules || [];
  $('#s-rules').innerHTML = rules.length ? rules.map((r, i) => row(`${r.who ? `<b>${esc(r.who)}</b> : ` : ''}${esc(r.text)}`, 'unrule', i)).join('') : none('Aucune consigne pour l\'instant (ex : « appelle-moi Capitaine »).');
  const ev = (m.events || []).filter(e => !e.followed);
  $('#s-events-mem').innerHTML = ev.length ? ev.map(e => row(`${esc(dateFR(new Date(`${e.date}T12:00:00`).getTime()))} : ${esc(e.quoi)}`, 'unevent', e.id)).join('') : none('Rien à suivre.');
  const it = (S.intentions || []).filter(x => !x.done).sort((a, b) => a.at - b.at);
  $('#s-intents').innerHTML = it.length ? it.map(x => row(`${esc(new Date(x.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))} : ${esc(x.text)}`, 'unintent', x.id)).join('') : none('Aucun rappel promis.');
  const pj = (S.projets || []).filter(p => !p.ended).slice(-6).reverse();
  $('#s-projets').innerHTML = pj.length ? pj.map(p => row(`${p.done ? '🎯 réussi : ' : ''}${esc({ table: `table de ${p.param}`, complement: `compléments à ${p.param}`, heure: "lire l'heure", dictee: 'dictée', anglais: 'anglais', lecture: 'lecture' }[p.type] || p.type)} · ${p.sessions.filter(s => s.ok).length}/2 réussites · jusqu'au ${esc(dateFR(new Date(`${p.fin}T12:00:00`).getTime()))}`, 'unprojet', p.id, p.done ? '✕' : 'Arrêter')).join('') : none('Aucun projet. L’enfant peut dire : « je veux apprendre la table de 7 cette semaine ».');
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
// diagnostic en direct (réglages ouverts) : qui il voit, et à quel point il est sûr
setInterval(() => {
  const el = $('#s-vision-live');
  if (!el || !$('#dlg-settings').open) return;
  if (!VISION.isOn()) { el.textContent = 'Yeux fermés.'; return; }
  const d = VISION.diag();
  const sure = x => (x === null ? '' : x < 0.4 ? ' (très sûr)' : x < 0.5 ? ' (sûr)' : ' (pas sûr)');
  el.textContent = `En direct : ${d.faces.length ? d.faces.map(f => (f.name ? `${f.name}${sure(f.dist)}` : f.good ? 'visage inconnu' : 'visage trop loin ou flou')).join(', ') : 'personne'} · détecteur ${d.precis ? 'précis' : 'rapide'}${d.hires ? ', image HD' : ''}`;
}, 1000);
function renderPeople() {
  $('#s-people').innerHTML = S.people.length
    ? S.people.map(p => `<div class="person"><span>👤 ${esc(p.name)} <small class="muted">(${p.desc.length} photos mentales)</small></span><button type="button" class="ghost sm danger" data-forget="${p.id}">Oublier</button></div>`).join('')
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
  $('#s-barge').checked = s.bargeIn !== false;
  $('#s-ns').checked = s.micNS !== false;
  $('#s-heard').innerHTML = heardLog.length ? heardLog.slice().reverse().map(h => `<div class="person"><span>${h.ok ? '🎤' : '❓'} ${new Date(h.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} « ${esc(h.t)} »</span></div>`).join('') : '<p class="small muted">Rien encore depuis l’ouverture de l’appli.</p>';
  $('#s-lock').checked = s.lock;
  meterLoop();
  $('#s-pause').value = String(s.pause);
  $('#s-vision').checked = s.vision;
  $('#s-see-cloud').checked = s.seeCloud;
  $('#s-vision-model').value = s.visionModel;
  const le = S.lastBrainError;
  $('#s-status').textContent = (le ? `Dernière erreur du cerveau (${new Date(le.at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}) : ${le.msg} · ` : '') + `Oreilles : ${({ whisper: 'Whisper (Groq), micro toujours ouvert', chrome: 'Chrome (Google)' })[OREILLES.engine()] || 'aucune'} · Yeux : ${VISION.isOn() ? 'ouverts' : 'fermés'}`;
  renderPeople();
  renderMemory();
  renderVoices();
  renderExtras();
  renderOffline();
  $('#s-corps-state').textContent = corpsState();
  $('#s-corps').textContent = CORPS.branche ? '🔌 Déconnecter le corps' : '🔵 Connecter le corps (Bluetooth)';
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
    const r = await AI.chat([{ role: 'system', content: CERVEAU.persona() }, { role: 'user', content: '[Test de papa] Dis bonjour en une phrase.' }], { maxTokens: 80 });
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
    if (d && confirm('Effacer cette phrase du journal ?')) { S.journal.filter(x => String(x.id) === d.dataset.del).forEach(x => tomb('journal', x)); S.journal = S.journal.filter(x => String(x.id) !== d.dataset.del); save(); openJournal(); }
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
    if (confirm('Effacer tout le journal et les étoiles ? (impossible à annuler)')) { S.journal.forEach(x => tomb('journal', x)); S.journal = []; S.cur = null; S.stats = fresh().stats; save(); toast('Journal effacé'); }
  });
  $('#s-offline').addEventListener('click', () => preloadOffline(true));
  $('#s-corps').addEventListener('click', async () => {
    if (CORPS.branche) { CORPS.disconnect(); return; }
    try { const n = await CORPS.connect(); toast(`🤖 Corps connecté : ${n}`); } catch (e) { toast(e.name === 'NotFoundError' ? 'Aucun corps choisi' : `Bluetooth : ${e.message}`); }
  });
  CORPS.onChange = () => { const el = $('#s-corps-state'); if (el) el.textContent = corpsState(); };
  CORPS.onObstacle = cm => { if (!voice.speaking && Date.now() - (dlg.obsSaid || 0) > 8000) { dlg.obsSaid = Date.now(); face.flash('oops'); say('Oh ! Il y a quelque chose devant moi, je m\'arrête.'); } };
  $('#s-diag-run').addEventListener('click', autoTest);
  $('#s-diag-copy').addEventListener('click', copyReport);
  $('#s-voices').addEventListener('click', e => {
    const b = e.target.closest('[data-forget-voice]');
    if (b && confirm('Shadow va oublier cette voix. Continuer ?')) { VOIX.people().filter(p => String(p.id) === b.dataset.forgetVoice).forEach(p => tomb('voices', p)); S.voices = VOIX.people().filter(p => String(p.id) !== b.dataset.forgetVoice); save(); renderVoices(); }
  });
  $('#s-mem').addEventListener('click', e => {
    const b = e.target.closest('[data-unfact]');
    if (!b) return;
    const m = MEMOIRE.data();
    m.facts.filter(f => String(f.id) === b.dataset.unfact).forEach(f => tomb('memory.facts', f));
    m.facts = m.facts.filter(f => String(f.id) !== b.dataset.unfact); save(); renderMemory();
  });
  // le carnet : supprimer une consigne, un événement, un rappel, arrêter un projet ; ajouter un souvenir
  $('#dlg-settings').addEventListener('click', e => {
    const b = e.target.closest('[data-unrule],[data-unevent],[data-unintent],[data-unprojet]');
    if (!b) return;
    const m = MEMOIRE.data();
    if (b.dataset.unrule !== undefined) { tomb('memory.rules', m.rules[+b.dataset.unrule]); m.rules.splice(+b.dataset.unrule, 1); }
    if (b.dataset.unevent) { m.events.filter(x => String(x.id) === b.dataset.unevent).forEach(x => tomb('memory.events', x)); m.events = m.events.filter(x => String(x.id) !== b.dataset.unevent); }
    if (b.dataset.unintent) { S.intentions.filter(x => String(x.id) === b.dataset.unintent).forEach(x => tomb('intentions', x)); S.intentions = S.intentions.filter(x => String(x.id) !== b.dataset.unintent); }
    if (b.dataset.unprojet) { const p = (S.projets || []).find(x => String(x.id) === b.dataset.unprojet); if (p) p.ended = true; }
    save(); renderMemory();
  });
  $('#s-mem-add').addEventListener('click', () => {
    const t = $('#s-mem-new').value.trim(), w = $('#s-mem-who').value.trim() || S.prenom || '';
    if (!t) return;
    if (MEMOIRE.add(t, w, 'papa')) { $('#s-mem-new').value = ''; renderMemory(); toast('Souvenir ajouté'); } else toast('Déjà connu, ou trop privé pour être gardé');
  });
  $('#s-mem-clear').addEventListener('click', () => {
    if (confirm('Shadow va oublier tous ses souvenirs (le journal et les visages restent). Continuer ?')) { const mm = MEMOIRE.data(); mm.facts.forEach(f => tomb('memory.facts', f)); (mm.rules || []).forEach(r => tomb('memory.rules', r)); (mm.events || []).forEach(e => tomb('memory.events', e)); mm.summaries.forEach(x => tomb('memory.summaries', x)); mm.hard.forEach(x => tomb('memory.hard', x)); S.memory = { facts: [], summaries: [], hard: [] }; S.memPos = S.chat.length; save(); renderMemory(); toast('Mémoire effacée'); }
  });
  $('#s-export').addEventListener('click', exportShadow);
  $('#s-import').addEventListener('click', () => $('#s-import-file').click());
  $('#s-import-file').addEventListener('change', e => { if (e.target.files[0]) importShadow(e.target.files[0]); e.target.value = ''; });
  $('#s-people').addEventListener('click', e => {
    const b = e.target.closest('[data-forget]');
    if (b && confirm('Shadow va oublier ce visage. Continuer ?')) { S.people.filter(p => String(p.id) === b.dataset.forget).forEach(p => tomb('people', p)); S.people = S.people.filter(p => String(p.id) !== b.dataset.forget); save(); renderPeople(); }
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
    // le micro est rouvert si le filtre anti-bruit change (ou si on passe en mode « très loin », qui le coupe)
    if (dlg.started && (before.micNS !== S.settings.micNS || (before.micSens === 'loin') !== (S.settings.micSens === 'loin')) && OREILLES.engine() === 'whisper') { try { await OREILLES.reopen(); } catch (e) { /* rien */ } }
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
  warmBrain();
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
    if (S.offlineVer !== window.SHADOW_VERSION) setTimeout(() => preloadOffline(false), 60000); // en arrière-plan, avec le WiFi
    // Sur un vieux téléphone, les yeux ne s'ouvrent pas tout seuls (on peut les demander : « tu me reconnais ? »)
    if (S.settings.vision && !LEGACY) visionToggle(true);
    life();
  })();
}

function boot() {
  face.el = $('#face');
  // v50 : « très loin » devient l'écoute par défaut (il entend toute la pièce) ; une seule fois, papa peut revenir en arrière
  if (!S.settings.micSensV2) { if (S.settings.micSens === 'haute') S.settings.micSens = 'loin'; S.settings.micSensV2 = true; save(); }
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
  if (/[?&]demo\b/.test(location.search)) $('#hint').firstChild.textContent = '▶️ Touche pour lancer la démo ';
  else if (!S.prenom) $('#dlg-welcome').showModal();
  window.SHADOW_OK = true; // le filet de sécurité sait que tout a démarré
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors-ligne indisponible */ });
    setTimeout(verifierMaj, 4000);
  }
}
boot();
