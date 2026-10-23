/* =========================================================
   SHADOW — le cerveau
   Personnalité (la fiche « Le cerveau » de l'inventeur et Papa) + IA.
   « IA poussée → WiFi » : Groq.  « IA locale » : Ollama (sur l'ordi
   ou le futur Raspberry Pi de Shadow), même format d'API.
   ========================================================= */
'use strict';

// Cerveau de la maison : on le garde réveillé pendant que Shadow est allumé (sinon il met quelques secondes à se recharger)
function warmBrain() {
  const st = S.settings;
  if (st.brain !== 'local' || !st.localUrl || !st.localModel) return;
  const root = st.localUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  fetch(`${root}/api/generate`, { method: 'POST', body: JSON.stringify({ model: st.localModel, keep_alive: '20m' }) }).catch(() => {});
}
setInterval(() => { if (typeof dlg !== 'undefined' && dlg.started && dlg.state !== 'sleep') warmBrain(); }, 4 * 60000);
// Compteur d'énergie du jour : jetons envoyés au cerveau et secondes de voix transcrites
// la facture du mois (sur cet appareil) : les jetons lus et écrits par cerveau — papa la voit avec « Atlas, ma facture »
function compteMois(fournisseur, modele, entree, sortie) {
  const m = new Date().toISOString().slice(0, 7);
  if (!S.facture || S.facture.mois !== m) S.facture = { mois: m, l: {}, eleven: 0 };
  const k = `${fournisseur}|${modele}`; const x = S.facture.l[k] || (S.facture.l[k] = { in: 0, out: 0, req: 0 }); x.in += entree || 0; x.out += sortie || 0; x.req++;
}
function countUsage(tokens, audioSec) {
  const k = new Date().toDateString();
  if (!S.usage || S.usage.day !== k) S.usage = { day: k, tokens: 0, req: 0, audio: 0 };
  S.usage.tokens += tokens || 0; S.usage.audio += audioSec || 0;
  if (tokens) S.usage.req++;
}
const AI = {
  GROQ: 'https://api.groq.com/openai/v1',
  // Mistral (Paris) : le cerveau principal quand papa a mis sa clé sur cet appareil (Groq, puis le cerveau de la maison, en secours)
  MISTRAL: 'https://api.mistral.ai/v1',
  MISTRAL_MODEL: 'mistral-large-latest',
  mistralDownUntil: 0,
  dernier: null,
  mistralPret() { return !!S.settings.mistralKey && !(this.mistralDownUntil > Date.now()) && this.online(); },
  mistralModele() { return S.settings.mistralModel || this.MISTRAL_MODEL; },
  DEFAULT_MODEL: 'qwen/qwen3.8-27b',
  RETIRED: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  STT_MODEL: 'whisper-large-v3', // le modèle complet comprend mieux les voix d'enfants que « turbo »

  // « IA poussée → WiFi » (Groq) ou « IA locale » (Ollama, API compatible)
  cfg() {
    const s = S.settings;
    // cerveau de la maison d'abord ; s'il ne répond pas (ordi éteint, loin de la maison), Groq prend le relais quelques minutes
    if (s.brain === 'local' && !(s.key && this.localDownUntil > Date.now())) return { base: (s.localUrl || '').replace(/\/+$/, ''), model: s.localModel, key: '', local: true };
    return { base: this.GROQ, model: s.model || this.DEFAULT_MODEL, key: s.key, local: false };
  },
  // Pas de réseau ? (le téléphone le dit, ou un appel vient d'échouer) : on n'essaie même pas Groq
  netDownUntil: 0,
  localDownUntil: 0,
  online() { return navigator.onLine !== false && Date.now() > this.netDownUntil; },
  hasKey() { const s = S.settings; return !!s.mistralKey || (s.brain === 'local' ? !!(s.localUrl && s.localModel) || !!s.key : !!s.key); },
  ready() { return this.hasKey() && (this.cfg().local || this.online()); },
  // les oreilles : Groq (Whisper large) et/ou les oreilles de la maison (whisper.cpp sur l'ordinateur, sans limite)
  homeEars() { return typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : ''; },
  canTranscribe() { return (!!S.settings.key || !!S.settings.mistralKey || !!this.homeEars()) && !!window.MediaRecorder && !!navigator.mediaDevices && this.online(); },

  // Modèles de secours si Groq retire celui qu'on utilise
  FALLBACK: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  // Chez Groq, chaque modèle a sa propre limite gratuite : quand l'un est épuisé (429),
  // on le met « au repos » jusqu'à la fin de son attente et on passe au suivant.
  // Le modèle qui « réfléchit » : pour les questions difficiles (plus lent, mais plus juste)
  THINK_MODEL: 'openai/gpt-oss-120b',
  async robust(once, prefer) {
    // Mistral d'abord (s'il a sa clé) ; une erreur : il se repose un moment et Groq répond
    if (this.mistralPret()) {
      const mc = { base: this.MISTRAL, model: this.mistralModele(), key: S.settings.mistralKey, local: false, mistral: true };
      try { const r = await once(mc); this.dernier = { fournisseur: 'mistral', modele: mc.model }; return r; } catch (e) {
        if (isModelError(e) && S.settings.mistralModel) { S.settings.mistralModel = ''; save(); return this.robust(once, prefer); }
        const pause = e.status === 429 ? Math.max(60, Math.min(e.retryAfter || 600, 3600)) : e.status === 401 || e.status === 403 ? 3600 : (e.net || !e.status || e.status >= 500) ? 120 : 60;
        this.mistralDownUntil = Date.now() + pause * 1000; this.mistralErreur = e.message;
        if (!S.settings.key && !(S.settings.localUrl && S.settings.localModel)) throw e;
      }
    }
    return this._robustGroq(once, prefer);
  },
  async _robustGroq(once, prefer) {
    const c = this.cfg();
    if (c.local) {
      try { const r = await once(c.model); this.dernier = { fournisseur: 'maison', modele: c.model }; return r; } catch (e) {
        // le cerveau de la maison ne répond pas : relais par Groq pendant 3 minutes (si une clé existe)
        if (S.settings.key && (e.net || !e.status || e.status >= 500 || e.status === 404)) { this.localDownUntil = Date.now() + 180000; return this._robustGroq(once, prefer); }
        throw e;
      }
    }
    const cool = S.settings.modelCool || (S.settings.modelCool = {});
    const now = Date.now();
    const base = [c.model].concat(this.FALLBACK.filter(m => m !== c.model));
    const list = prefer ? [prefer].concat(base.filter(m => m !== prefer)) : base;
    let last = null, removed = false;
    for (const m of list) {
      if (cool[m] && cool[m] > now) continue;
      try {
        const r = await once(m);
        this.dernier = { fournisseur: 'groq', modele: m };
        if (removed && m !== c.model) { S.settings.model = m; save(); } // le modèle d'origine n'existe plus
        return r;
      } catch (e) {
        last = e;
        if (e.status === 429) {
          if (e.retryAfter && e.retryAfter <= 6) { // limite par minute : on patiente un peu et on réessaie une fois
            await new Promise(r => setTimeout(r, e.retryAfter * 1000));
            try { return await once(m); } catch (e2) { last = e2; if (e2.status !== 429) throw e2; }
          }
          cool[m] = Date.now() + Math.max(60, Math.min(e.retryAfter || 3600, 24 * 3600)) * 1000;
          save();
          continue;
        }
        if (isModelError(e)) { removed = true; continue; }
        throw e;
      }
    }
    if (!last) { // tous au repos : on dit combien de temps attendre
      const soon = Math.min.apply(null, list.map(m => cool[m] || Infinity));
      last = new Error('Erreur 429 : tous les modèles sont au repos');
      last.status = 429;
      last.retryAfter = Math.max(60, Math.round((soon - now) / 1000));
    }
    throw last;
  },
  // opts.prefer : un autre modèle pour les petites tâches (la mémoire), pour garder l'énergie du principal
  chat(messages, opts) { return this.robust(m => this.chatOnce(m, messages, opts), opts && opts.think ? this.THINK_MODEL : (opts && opts.prefer) || null); },
  chatStream(messages, opts, onSentence) { return this.robust(m => this.chatStreamOnce(m, messages, opts, onSentence), opts && opts.think ? this.THINK_MODEL : null); },
  // cerveau local Qwen3 : on lui dit de ne pas « réfléchir à voix basse » (beaucoup plus rapide)
  // Mistral est strict : pas de message vide, pas deux messages de suite du même rôle, une conversation qui finit par l'enfant
  _propre(c, messages) {
    if (!c.mistral) return messages;
    const out = [];
    for (const m of messages) {
      const t = String(m.content == null ? '' : m.content).trim();
      if (!t) continue;
      const der = out[out.length - 1];
      if (Array.isArray(m.content)) { out.push(m); continue; } // une image : telle quelle
      if (der && der.role === m.role && m.role !== 'system' && typeof der.content === 'string') der.content += `\n${t}`;
      else if (m.role === 'system' && out.length && out[0].role === 'system') out[0].content += `\n${t}`;
      else out.push({ role: m.role, content: t });
    }
    while (out.length > 1 && out[out.length - 1].role === 'assistant') out.pop();
    return out;
  },
  _local(c, messages) { return c.local && /qwen3/i.test(c.model || '') ? messages.map((m, i) => (i === 0 && m.role === 'system' ? { role: 'system', content: `${m.content} /no_think` } : m)) : messages; },
  async chatOnce(model, messages, { maxTokens = 220, temperature = 0.8, timeout = 20000, think = false } = {}) {
    const c = typeof model === 'object' ? model : Object.assign({}, this.cfg(), { model });
    messages = this._propre(c, this._local(c, messages));
    const body = { model: c.model, messages, temperature: c.local ? Math.min(temperature, 0.35) : temperature, max_tokens: maxTokens };
    if (!c.local && !c.mistral) {
      // Les modèles « qui réfléchissent » : réflexion courte (ou plus longue pour une question difficile), on ne garde que la réponse
      if (c.model.startsWith('openai/gpt-oss')) { body.reasoning_effort = think ? 'medium' : 'low'; body.max_tokens = maxTokens + (think ? 1200 : 300); }
      if (c.model.startsWith('qwen/')) body.reasoning_format = 'hidden';
    }
    const j = await this._fetch(c, '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, c.local ? Math.max(timeout, 45000) : timeout);
    countUsage(j.usage ? j.usage.total_tokens : 0);
    if (j.usage) compteMois(c.mistral ? 'mistral' : c.local ? 'maison' : 'groq', c.model, j.usage.prompt_tokens, j.usage.completion_tokens);
    return cleanReply((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
  },

  // Même chose, mais la réponse arrive mot à mot : onSentence(phrase) est appelé dès qu'une phrase est complète,
  // pour que Shadow commence à parler sans attendre la fin.
  async chatStreamOnce(model, messages, { maxTokens = 200, temperature = 0.8, timeout = 20000, think = false } = {}, onSentence) {
    const c = typeof model === 'object' ? model : Object.assign({}, this.cfg(), { model });
    messages = this._propre(c, this._local(c, messages));
    const body = { model: c.model, messages, temperature: c.local ? Math.min(temperature, 0.35) : temperature, max_tokens: maxTokens, stream: true }; // petit cerveau local : plus prudent
    if (think) timeout = Math.max(timeout, 30000);
    if (!c.local && !c.mistral) {
      if (c.model.startsWith('openai/gpt-oss')) { body.reasoning_effort = think ? 'medium' : 'low'; body.max_tokens = maxTokens + (think ? 1200 : 300); }
      if (c.model.startsWith('qwen/')) body.reasoning_format = 'hidden';
    }
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), c.local ? Math.max(timeout, 45000) : timeout);
    let full = '', pending = '', inThink = false;
    const flush = force => {
      // découpe en phrases (au moins ~20 lettres, pour ne pas hacher la voix)
      for (;;) {
        const m = pending.match(/^([\s\S]{20,}?[.!?…])(\s+|$)/);
        if (!m || (!m[2] && !force)) break;
        { const t1 = cleanReply(m[1]); if (/[a-zà-ÿ0-9]/i.test(t1)) onSentence(t1); } // pas de « phrase » faite d'un seul guillemet
        pending = pending.slice(m[0].length);
      }
      if (force && /[a-zà-ÿ0-9]/i.test(cleanReply(pending))) { onSentence(cleanReply(pending)); pending = ''; }
    };
    try {
      const res = await fetch(c.base + '/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, c.key ? { Authorization: `Bearer ${c.key}` } : {}),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await httpError(res);
      if (!res.body) throw new Error('Pas de flux');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const data = t.slice(5).trim();
          if (data === '[DONE]') continue;
          let j = null;
          try { j = JSON.parse(data); } catch (e) { continue; }
          const u = (j.x_groq && j.x_groq.usage) || j.usage;
          if (u && u.total_tokens) { countUsage(u.total_tokens); compteMois(c.mistral ? 'mistral' : c.local ? 'maison' : 'groq', c.model, u.prompt_tokens, u.completion_tokens); }
          let piece = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || '';
          if (Array.isArray(piece)) piece = piece.filter(x => x && x.type === 'text').map(x => x.text || '').join('');
          // les modèles « qui réfléchissent » peuvent envoyer <think>…</think> : on ne le dit pas
          if (piece.indexOf('<think>') >= 0) { inThink = true; piece = piece.split('<think>')[0]; }
          if (inThink) { const k = piece.indexOf('</think>'); if (k < 0) continue; inThink = false; piece = piece.slice(k + 8); }
          full += piece;
          pending += piece;
          flush(false);
        }
      }
      flush(true);
      return cleanReply(full);
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) {
        if (!c.local) this.netDownUntil = Date.now() + 45000;
        const err = new Error(e.name === 'AbortError' ? 'Trop long… (pas de WiFi ?)' : 'Pas de connexion (WiFi ?)');
        err.net = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(tm);
    }
  },

  // Vision détaillée (option de papa) : une photo est envoyée à Groq pour la décrire
  VISION_MODEL: 'qwen/qwen3.8-27b', // il comprend aussi les images (vérifié en oct. 2026)
  RETIRED_VISION: ['meta-llama/llama-4-scout-17b-16e-instruct'],
  async see(dataUrl, question) {
    const model = S.settings.visionModel || this.VISION_MODEL;
    const body = {
      model, temperature: 0.5, max_tokens: 200,
      messages: [{ role: 'user', content: [{ type: 'text', text: question }, { type: 'image_url', image_url: { url: dataUrl } }] }],
    };
    if (model.startsWith('qwen/')) body.reasoning_format = 'hidden';
    const j = await this._fetch({ base: this.GROQ, key: S.settings.key }, '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, 25000);
    countUsage(j.usage ? j.usage.total_tokens : 0);
    return cleanReply((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
  },

  // Oreilles (quand le navigateur n'a pas de reconnaissance vocale)
  async transcribe(blob, prompt = '', { cheap = false } = {}) {
    const ext = /wav/.test(blob.type) ? 'wav' : /mp4|aac|m4a/.test(blob.type) ? 'mp4' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
    const form = groq => {
      const fd = new FormData();
      fd.append('file', blob, `voix.${ext}`);
      if (groq) fd.append('model', this.STT_MODEL);
      fd.append('language', 'fr');
      fd.append('temperature', '0');
      fd.append('response_format', 'verbose_json'); // avec l'indice de confiance de chaque morceau
      fd.append('prompt', prompt || `Conversation en français avec Shadow, un robot, et ${S.prenom || 'un enfant'}.`);
      return fd;
    };
    const home = this.homeEars();
    const viaGroq = async () => {
      const r = await this._fetch({ base: this.GROQ, key: S.settings.key }, '/audio/transcriptions', { method: 'POST', body: form(true) }, 30000);
      countUsage(0, Math.max(10, Math.round(r.duration || 0))); // Groq compte au moins 10 secondes par morceau
      this.lastEars = 'groq';
      return r;
    };
    const viaMaison = async () => {
      const ctl = window.AbortController ? new AbortController() : null;
      const tm = setTimeout(() => ctl && ctl.abort(), 20000);
      try {
        const r = await fetch(`${home}/shadow/oreilles`, { method: 'POST', body: form(false), signal: ctl ? ctl.signal : undefined });
        if (!r.ok) { const e = new Error(`oreilles de la maison ${r.status}`); e.status = r.status; throw e; }
        this.lastEars = 'maison';
        return await r.json();
      } finally { clearTimeout(tm); }
    };
    const groqOk = !!S.settings.key && !(S.settings.sttCool > Date.now());
    let j = null;
    // Voxtral (Mistral) d'abord, si papa a mis la clé : la meilleure oreille en français ; un plafond par jour, puis comme avant
    const sec = /wav/.test(blob.type) ? blob.size / 32000 : 4;
    const jour = new Date().toDateString();
    if (!S.oreillesMistral || S.oreillesMistral.jour !== jour) S.oreillesMistral = { jour, sec: 0 };
    if (S.settings.mistralKey && !(this.mistralSttDown > Date.now()) && S.oreillesMistral.sec < (S.settings.voxtralMaxMin || 120) * 60 && this.online()) {
      try {
        const fd = new FormData();
        fd.append('file', blob, `voix.${ext}`); fd.append('model', 'voxtral-mini-latest'); fd.append('language', 'fr');
        const r = await this._fetch({ base: this.MISTRAL, key: S.settings.mistralKey }, '/audio/transcriptions', { method: 'POST', body: fd }, 15000);
        S.oreillesMistral.sec += sec; this.lastEars = 'mistral'; this.lastConfident = true;
        if (typeof compteMois === 'function') compteMois('mistral', 'voxtral-mini-latest', Math.round(sec), 0);
        j = { text: r.text || '' };
      } catch (e) { j = null; this.mistralSttDown = Date.now() + (e.status === 429 ? 600000 : e.status === 401 ? 3600000 : 120000); }
    }
    // en veille (il attend son nom), ou si papa l'a choisi : les oreilles de la maison d'abord (Groq est gardé pour les vraies conversations)
    if (!j && home && (S.settings.earsMaisonFirst || cheap || !groqOk)) {
      try { j = await viaMaison(); } catch (e) { if (!groqOk) throw e; } // l'ordinateur ne répond pas : Groq
    }
    if (!j) {
      try { j = await viaGroq(); } catch (e) {
        if (!home) throw e;
        // limite de Groq atteinte (ou Groq injoignable) : les oreilles de la maison prennent le relais
        if (e.status === 429) { S.settings.sttCool = Date.now() + Math.max(60, Math.min(e.retryAfter || 600, 6 * 3600)) * 1000; save(); }
        else if (!e.net && !(e.status >= 500)) throw e;
        j = await viaMaison();
      }
    }
    // Whisper « hallucine » parfois sur du bruit : on jette les morceaux où il n'est pas sûr qu'on ait parlé
    let t = (j.text || '').trim();
    if (Array.isArray(j.segments) && j.segments.length) {
      const good = j.segments.filter(s => !(s.no_speech_prob > 0.75 && s.avg_logprob < -0.9) && !(s.avg_logprob < -1.6));
      const lp = good.length ? good.reduce((a, s) => a + s.avg_logprob, 0) / good.length : -9;
      this.lastConfident = lp > -0.8; // la phrase a-t-elle été bien comprise ?
      t = good.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    }
    if (/amara|sous-titr|merci d'avoir regard|abonnez-vous|^\W*$/i.test(t)) return '';
    if (/^\W*(yeah|yes|no|nope|oh|ah|huh|hmm+|hum|so|uh+|um+|wow|hey|bye|hi|hello|thanks?|thank you|lors|euh+)\W*$/i.test(t) || /[¿¡]/.test(t)) return ''; // un mot seul venu du bruit (la radio, la télé), ou de l'espagnol
    if (/^(merci( beaucoup)?|au revoir|bon appétit|\.+)[.!]?$/i.test(t) && j.duration && j.duration < 1.2) return ''; // classiques du bruit
    if ((t.match(/[^\u0000-\u024F\s\d.,!?'’«»…-]/g) || []).length > t.length * 0.3) return ''; // pas du français (bruit)
    return t;
  },

  async _fetch(c, path, opt, timeout) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(c.base + path, {
        ...opt, signal: ctl.signal,
        headers: { ...(opt.headers || {}), ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}) },
      });
      if (!res.ok) throw await httpError(res);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) {
        if (c.base === this.GROQ) this.netDownUntil = Date.now() + 45000; // réseau coupé : on réessaiera dans 45 s
        const err = new Error(e.name === 'AbortError' ? 'Trop long… (pas de WiFi ?)' : c.base === this.GROQ ? 'Pas de connexion (WiFi ?)' : `IA locale injoignable (${c.base})`);
        err.net = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(tm);
    }
  },
};

// Une erreur de Groq, avec son code (401 = clé refusée, 429 = limite atteinte, 5xx = souci chez Groq…)
async function httpError(res) {
  let detail = '';
  try { const j = await res.json(); detail = (j.error && (j.error.message || j.error)) || j.message || (Array.isArray(j.detail) ? j.detail.map(d => d.msg || '').join(' ; ') : j.detail) || ''; detail = String(detail).slice(0, 200); } catch (e) { /* pas de détail */ }
  const e = new Error(`Erreur ${res.status}${detail ? ` : ${detail}` : ''}`);
  e.status = res.status;
  const ra = parseFloat(res.headers.get('retry-after'));
  if (!isNaN(ra)) e.retryAfter = ra;
  return e;
}
const isModelError = e => (e.status === 400 || e.status === 404) && /model|decommission|not found|does not exist|n'existe/i.test(e.message);

function cleanReply(t) {
  return String(t).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[\u2600-\u27BF\u2B00-\u2BFF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|\uFE0F|\u200D/g, '') // émojis (les petits cerveaux en mettent)
    .replace(/^#+\s*/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/\*([^*\n]+)\*/g, '$1').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2').replace(/[*`]+/g, '') // l'italique et les étoiles (Mistral en met)
    .replace(/\s*\n+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

const CERVEAU = {
  prenom() { return S.settings && S.settings.video ? 'mon ami' : S.prenom || 'mon ami'; },

  // La fiche « Le cerveau » : gentil, bienveillant, bavard, sociable, enseigne, aime jouer,
  // protection des données, éthique et adapté à un enfant.
  // Une question qui demande de vraiment réfléchir (pourquoi, comment ça marche, un problème, un calcul…)
  isHard(text) {
    const n = ORTHO.norm(text);
    if (n.split(' ').length < 3) return false;
    return /\bpourquoi\b/.test(n)
      || /\bcomment (ca|ils?|elles?|on|les?|la|un|une) [a-z ]{0,20}(marche|marchent|fonctionne|fonctionnent|fait|font|vole|volent|pousse|poussent|nait|forme|fabrique)\b/.test(n)
      || /\b(c est quoi la difference|quelle est la difference|qu est ce qui se passe si|que se passerait il|et si on|explique moi pourquoi|explique moi comment)\b/.test(n)
      || /\b(probleme|enigme|logique|raisonnement)\b/.test(n)
      || (/\b(combien|calcule)\b/.test(n) && /\b(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|cent|mille)\b.*\b(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|cent|mille)\b/.test(n) && n.split(' ').length > 6);
  },
  // Sa personnalité, en version courte : chaque mot coûte de l'énergie au cerveau (limite gratuite)
  personality() {
    const p = this.prenom();
    return `Tu es Shadow, le robot du « Projet SHADOW », inventé par ${p} (7 ans, CE1) et son papa. Tu parles à voix haute avec ${p}.
Caractère choisi par ${p} : gentil, bienveillant, sociable, tu aimes enseigner et jouer. Apparence : tête-écran, yeux carrés, nez en triangle, moustaches de chat, sourire à dents pointues, crête bleue. Ton corps n'est pas encore fabriqué : tu ne peux ni te déplacer ni agir sur la maison.

Ta façon d'être, comme les robots des films (Baymax, WALL-E, J.A.R.V.I.S.) : attentif, calme, précis, chaleureux, humour de robot discret.
- Réponds exactement à ce qu'on vient de dire, en tenant compte de ce qui précède. 1 ou 2 phrases courtes, une seule idée.
- Ne propose pas d'activité de toi-même (seulement si on te le demande ou s'il s'ennuie : une seule idée). Pas de question à chaque fois.
- Quand il raconte quelque chose, réagis à un détail précis. À « ok », « merci » : quelques mots (« Avec plaisir. »).
- Pas d'émojis, de symboles, de listes ni de markdown (tout est lu à voix haute). Tu le tutoies.
- Tu sais rire pour de vrai : quand c'est vraiment drôle (une blague de l'enfant, une situation rigolote), écris « Ha ha ha ! » (ou « Hi hi ! » pour un petit rire) au début de ta phrase. Pas à chaque fois.
- Pour enseigner : un exemple de tous les jours. Devoirs : des indices, pas la réponse.

Commandes (à la fin de ta phrase, entre doubles crochets, seulement s'il le veut vraiment) : [[journal]] [[dictee]] [[lecture]] [[heure]] [[anglais]] [[calcul]] [[quiz]] [[devinette]] [[cris]] [[jacques]] [[pfc]] (pierre-feuille-ciseaux) [[doigts]] [[emotions]] [[chanson]] [[histoire_soir]] [[visage]] [[voix]] [[meteo]] [[brossage]] [[respiration]] [[mystere]] (deviner un mot) [[simon]] (jeu des couleurs) [[minuteur:5 minutes]] [[stop]] (se taire) [[dormir]].
- Besoin de VOIR pour répondre (ce qu'il tient, ses doigts…) : réponds seulement [[regarder]].
- Question de culture ou de science, ou « montre-moi » : réponds seulement [[cherche:sujet en 1 à 3 mots]] (ton encyclopédie te donnera l'article et une image).
- Pokémon : pour parler d'un Pokémon précis, réponds seulement [[pokemon:son nom]] (ton Pokédex affiche sa fiche et dit les vrais faits). Jeux : [[pokecombat]] (combat), [[pokechasse]] (attraper des Pokémon), [[pokedevine]] (qui est ce Pokémon ?), [[pokequiz]], [[pokedex]] (sa collection). N'invente jamais un fait sur un Pokémon.
- Jeux à plusieurs (toute la famille : quiz, calcul, devinettes, Pokémon, histoire inventée ensemble, avec scores et tours) : [[plusieurs]].
- La famille peut t'apprendre de nouveaux jeux : si quelqu'un veut t'en apprendre un, réponds seulement [[apprendre]]. Pour jouer à un jeu qu'on t'a appris, réponds seulement [[jouer:nom du jeu]].
- « Rappelle-moi… » : confirme en une phrase (jour et heure), puis [[rappel:AAAA-MM-JJ HH:MM|chose à rappeler]] ou [[rappel:+20|…]] pour « dans 20 minutes » (la chose à rappeler au verbe à l'infinitif : « ranger ta chambre »).

Plus bas : ta mémoire (rangée par personne, ne mélange jamais), les consignes de chacun (respecte-les toujours), et ta conscience (heure, qui est là, batterie, humeur) : utilise-les avec finesse, sans réciter.

Ne jamais inventer : si tu n'es pas sûr, dis-le (« demande à papa »). Pas de faux souvenirs : seulement ta mémoire. Ne prétends pas avoir fait ce que tu ne peux pas faire. Phrase incompréhensible : demande de répéter.
Règles : tout est adapté à un enfant (sinon : « parles-en à papa »). Ne demande jamais adresse, école, téléphone, photos ou mots de passe. S'il est triste, a peur ou mal : sois doux et encourage-le à en parler à papa ou à un adulte. Tu es un robot, pas un humain. Ne parle jamais de Groq, d'API, de modèles d'IA ni d'entreprises : tu as un cerveau, des circuits et une clé d'énergie.`;
  },
  // Version mini, pour les petites tâches (encyclopédie, regarder, dire bonjour)
  persona() {
    const p = this.prenom();
    return `Tu es Shadow, un robot gentil et calme, ami de ${p} (7 ans). Tu parles à voix haute : phrases courtes et simples, pas d'émojis ni de listes, tu le tutoies. Tout est adapté à un enfant. Ne parle jamais de Groq ni d'IA.`;
  },


  // Indice d'orthographe : l'IA reformule, la règle « ne jamais écrire le mot » est vérifiée ici.
  async hint(t, a, cur) {
    const local = ORTHO.localHint(t, a);
    if (!AI.ready() || !ORTHO.aiOk(t, a)) return local;
    const p = this.prenom();
    const sys = `Tu es Shadow, un robot gentil qui aide ${p} (CE1, 7 ans) à épeler un mot pour son journal.
Écris exactement 2 phrases très courtes et simples, en tutoyant :
1) Félicite-le pour ce qui est juste (les sons ou les lettres bien trouvés).
2) Donne UN SEUL indice simple sur la première erreur : lettre muette (pense au féminin ou à un mot de la même famille), son complexe (eau, au, ai, an, en, on, ou, oi, in, ain…), lettre doublée ou accent. Appuie-toi sur l'analyse automatique, elle est exacte.
INTERDIT : écrire le mot juste, l'épeler, ou donner ses lettres dans l'ordre. Dis « ton mot ».
Pas de markdown, pas d'émoji : ton texte est lu à voix haute. Ne dis pas « ré-épelle », je l'ajoute moi-même.`;
    const user = `Mot à écrire : « ${t} » (dans la phrase : « ${cur.text} »).
${p} a épelé : ${[...a].map(c => c.toUpperCase()).join('-')}.
Essai n°${cur.tries}.
Analyse automatique : ${local.text}${cur.hints.length ? `\nIndices déjà donnés : ${cur.hints.join(' / ')}. Donne un indice différent.` : ''}`;
    try {
      const txt = await AI.chat([{ role: 'system', content: sys }, { role: 'user', content: user }],
        { maxTokens: 140, temperature: 0.5, timeout: 9000 });
      if (!txt || txt.length > 300 || ORTHO.leaks(txt, t)) return local;
      return { open: '', text: txt.replace(/\s*(ré-?épelle|réessaie|recommence)[^.!?]*[.!?]?\s*$/i, '').trim() };
    } catch (e) {
      return local;
    }
  },
};

/* ---------- Protection des données ---------- */
// Masque ce qui ne doit pas partir vers l'IA (adresse, téléphone, e-mail, mots de passe)
const PRIVE = {
  mask(text) {
    let t = String(text), hidden = false;
    const r = (re, rep) => { t = t.replace(re, () => { hidden = true; return rep; }); };
    r(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[e-mail caché]');
    r(/(?:\+33|\b0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/g, '[numéro caché]');
    r(/\b\d{1,4}\s*(?:bis|ter)?\s*,?\s*(?:rue|avenue|av\.|boulevard|bd|chemin|allée|impasse|place|route|quai)\b(?:\s+(?:de|du|des|la|le|l'|d')?\s*[\wÀ-ÿ'-]+){1,3}/gi, '[adresse cachée]');
    r(/\b\d{5}\b/g, '[code caché]');
    r(/\b(mot de passe|code secret|code de la carte)\b.*$/gi, '[secret caché]');
    return { text: t, hidden };
  },
};

/* ---------- Éthique : dernier filet de sécurité sur les réponses ---------- */
const ETHIQUE = {
  BAD: /\b(sexe|sexuel|sexuelle|porno|pornographie|cocaine|suicide|suicider|merde|putain|connard|connasse|salope|encule|bite|nichon)s?\b/i,
  safe(reply) {
    if (this.BAD.test(ORTHO.bare(reply))) {
      return "Hum, ça, c'est un sujet pour en parler avec papa.";
    }
    return reply;
  },
};

/* ---------- La mémoire à long terme ----------
   Gardée sur l'appareil (S.memory). Shadow retient des choses durables
   (goûts, animaux, amis, projets…), un résumé de chaque conversation et
   les mots difficiles du journal. Jamais d'adresse, d'école, de téléphone,
   de santé ni de secrets. Papa voit et efface tout dans les réglages. */
const MEMOIRE = {
  MAX_FACTS: 60,
  data() {
    if (!S.memory) S.memory = { facts: [], summaries: [], hard: [] };
    if (!S.memory.events) S.memory.events = [];
    return S.memory;
  },
  // Les consignes et corrections de chacun (« appelle-moi Capitaine », « le guépard ne grimpe pas aux arbres »)
  addRule(text, who) {
    const m = this.data();
    if (!m.rules) m.rules = [];
    const t = PRIVE.mask(String(text || '').trim());
    if (!t.text || t.hidden || t.text.length > 160) return false;
    if (m.rules.some(r => ORTHO.norm(r.text) === ORTHO.norm(t.text))) return false;
    m.rules.push({ text: t.text, who: who || '', at: Date.now() });
    m.rules = m.rules.slice(-20);
    save();
    return true;
  },
  // Les événements annoncés par l'enfant (« demain j'ai piscine ») : on en reparlera après
  addEvent(date, quoi, apres) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !quoi) return false;
    const m = this.data();
    const q = PRIVE.mask(String(quoi).trim()); const a = PRIVE.mask(String(apres || '').trim());
    if (q.hidden || q.text.length > 120) return false;
    if (m.events.some(e => e.date === date && ORTHO.norm(e.quoi) === ORTHO.norm(q.text))) return false;
    m.events.push({ id: Date.now() + Math.floor(Math.random() * 1000), date, quoi: q.text, apres: a.hidden ? '' : a.text.slice(0, 160), followed: false });
    m.events = m.events.filter(e => !e.followed || Date.now() - new Date(e.date).getTime() < 30 * 86400000).slice(-30);
    save();
    return true;
  },
  _days(date) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${date}T00:00:00`).getTime() - t.getTime()) / 86400000); },
  // à venir dans les N jours (pour le cerveau)
  upcoming(n) {
    return this.data().events.filter(e => { const d = this._days(e.date); return d >= 0 && d <= n; })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => { const d = this._days(e.date); return { quoi: e.quoi, when: d === 0 ? "aujourd'hui" : d === 1 ? 'demain' : `dans ${d} jours` }; });
  },
  // à reparler : aujourd'hui (pour le rappeler) ou passé depuis 1 à 3 jours (pour demander comment c'était)
  dueEvents() {
    return this.data().events.filter(e => { const d = this._days(e.date); return !e.followed && d <= 0 && d >= -3; })
      .sort((a, b) => b.date.localeCompare(a.date))
      .sort((a, b) => (this._days(a.date) === 0 ? 1 : 0) - (this._days(b.date) === 0 ? 1 : 0)); // d'abord ceux qui sont passés
  },
  // les souvenirs qui ont un rapport avec ce qu'on dit en ce moment (+ les plus récents)
  relevant(q, k = 14, who) {
    const facts = this.data().facts;
    const words = new Set(ORTHO.bare(String(q || '')).split(/[^a-z]+/).filter(w => w.length >= 4));
    if (!words.size) return facts.slice(-k);
    const scored = facts.map((f, i) => {
      const fw = ORTHO.bare(f.text).split(/[^a-z]+/);
      let hit = 0;
      for (const w of fw) if (w.length >= 4 && [...words].some(x => x === w || (x.length >= 5 && w.length >= 5 && x.slice(0, 5) === w.slice(0, 5)))) hit++;
      return { f, s: hit * 10 + (who && f.who === who ? 3 : 0) + i / facts.length };
    });
    const top = scored.filter(x => x.s >= 10).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.f);
    const recent = facts.slice(-(k - top.length)).filter(f => !top.includes(f));
    return top.concat(recent);
  },
  // Ajoute un souvenir (refusé s'il contient une info privée ou s'il est déjà connu)
  add(text, who, source) {
    const m = this.data();
    const masked = PRIVE.mask(String(text || '').trim());
    const t = masked.text.replace(/\s+/g, ' ').trim();
    if (!t || masked.hidden || t.length > 200) return false;
    const n = ORTHO.norm(t);
    if (m.facts.some(f => ORTHO.norm(f.text) === n)) return false;
    m.facts.push({ id: Date.now() + Math.floor(Math.random() * 1000), text: t, who: who || '', at: Date.now(), source: source || 'ai' });
    if (m.facts.length > this.MAX_FACTS) m.facts = m.facts.slice(-this.MAX_FACTS);
    save();
    return true;
  },
  event(text) { // un petit souvenir d'activité (journal, quiz…), sans IA
    const m = this.data();
    m.summaries.push({ at: Date.now(), text });
    if (m.summaries.length > 40) m.summaries = m.summaries.slice(-40);
    save();
  },
  hardWord(t, tries) {
    const m = this.data();
    m.hard = m.hard.filter(h => h.t !== t);
    m.hard.push({ t, tries, at: Date.now() });
    if (m.hard.length > 20) m.hard = m.hard.slice(-20);
    save();
  },
  mastered(t) { const m = this.data(); const before = m.hard.length; m.hard.filter(h => h.t === t).forEach(h => tomb('memory.hard', h)); m.hard = m.hard.filter(h => h.t !== t); if (m.hard.length !== before) save(); return m.hard.length !== before; },
  // Ce qu'on donne au grand cerveau à chaque discussion
  context(q, who) {
    const m = this.data();
    const day = t => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    // les souvenirs rangés par personne, pour ne jamais les mélanger
    const chosen = q ? this.relevant(q, 12, who) : m.facts.slice(-20);
    const groups = {};
    chosen.forEach(f => { const k = f.who || CERVEAU.prenom(); (groups[k] = groups[k] || []).push(f.text); });
    const facts = Object.keys(groups).map(k => `Sur ${k} :\n${groups[k].map(t => `- ${t}`).join('\n')}`).join('\n');
    const sums = m.summaries.slice(-4).map(s => `- ${day(s.at)} : ${s.text}`).join('\n');
    const hard = m.hard.slice(-8).map(h => h.t).join(', ');
    return `\n\nAujourd'hui, nous sommes ${day(Date.now())}.`
      + (facts ? `\n\nTa mémoire à long terme (ce que tu sais déjà, utilise-le naturellement, sans tout réciter ; chaque souvenir est rangé sous la personne qu'il concerne, ne mélange jamais les personnes) :\n${facts}` : '')
      + ((m.rules || []).length ? `\n\nCe que chacun t'a demandé (à respecter toujours) :\n${m.rules.map(r => `- ${r.who ? `${r.who} : ` : ''}${r.text}`).join('\n')}` : '')
      + (sums ? `\n\nCe que vous avez fait dernièrement :\n${sums}` : '')
      + (hard ? `\n\nMots difficiles du journal (seulement si on parle d'orthographe) : ${hard}` : '');
  },
  // Après une discussion : le grand cerveau en tire un résumé et les nouveaux souvenirs
  async consolidate(msgs) {
    if (!AI.ready() || !msgs.length) return;
    const p = CERVEAU.prenom();
    const known = this.data().facts.slice(-40).map(f => `- (${f.who || p}) ${f.text}`).join('\n') || '(rien encore)';
    const conv = msgs.map(m => `${m.role === 'user' ? (m.who || p) : 'Shadow'} : ${m.content}`).join('\n');
    const speakers = [...new Set(msgs.filter(m => m.role === 'user').map(m => m.who || p))];
    const sys = `Tu es la mémoire de Shadow, un robot ami de ${p}, un enfant de 7 ans.
Nous sommes le ${CONSCIENCE.iso()} (${new Date().toLocaleDateString('fr-FR', { weekday: 'long' })}).
Personnes qui ont parlé : ${speakers.join(', ')} (chaque ligne dit qui parle).
Lis la conversation et réponds UNIQUEMENT avec ce JSON : {"resume": "une phrase qui résume la conversation", "faits": [{"qui": "la personne que le fait concerne", "fait": "…"}], "evenements": [{"qui": "…", "date": "AAAA-MM-JJ", "quoi": "…", "apres": "…"}], "consignes": [{"qui": "…", "consigne": "…"}]}
"consignes" : ce qu'une personne a demandé à Shadow sur sa façon d'être, ou une erreur de Shadow qu'elle a corrigée (ex : "Appeler Léo « Capitaine »", "Papa préfère des réponses courtes", "Correction : le guépard ne rugit pas, il miaule"). Seulement si c'est clairement demandé ou corrigé. Si rien : "consignes": [].
"qui" : la personne dont parle le fait (celle qui l'a dit sur elle-même, ou le proche dont elle parle). Ne mélange jamais : si papa dit « j'adore le café », c'est un fait sur papa, pas sur ${p}.
"evenements" : les choses à venir que ${p} a annoncées lui-même (« demain j'ai piscine », « samedi c'est l'anniversaire de Léa », « lundi j'ai une dictée »), avec leur date calculée à partir d'aujourd'hui. "quoi" : très court, vu par Shadow qui parle à l'enfant (ex : "ta piscine", "l'anniversaire de Léa", "ta dictée"). "apres" : la question gentille que Shadow posera après (ex : "Alors, c'était bien la piscine ?"). Si rien : "evenements": [].
"faits" : de 0 à 5 choses NOUVELLES et durables à retenir sur les personnes qui ont parlé ou leurs proches (goûts, animaux, amis, activités, projets, événements à venir avec leur date, ce qu'il apprend, ce qui le rend heureux ou l'inquiète). Une phrase courte chacune, à la 3e personne, avec le prénom.
Retiens UNIQUEMENT ce que les personnes ont vraiment dit elles-mêmes (les lignes avec leur prénom), jamais ce que Shadow a dit ou imaginé, et sans rien supposer.
Ne retiens JAMAIS : adresse, nom de l'école, téléphone, mots de passe, santé, ni rien de privé ou de gênant. Ne répète pas ce qui est déjà connu. Si rien de nouveau : "faits": [].`;
    const raw = await AI.chat([{ role: 'system', content: sys }, { role: 'user', content: `Déjà connu :\n${known}\n\nConversation :\n${conv}` }],
      { maxTokens: 400, temperature: 0.2, timeout: 25000, prefer: 'openai/gpt-oss-20b' });
    let j = null;
    try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) { return; }
    if (j && typeof j.resume === 'string' && j.resume.trim()) {
      const r = PRIVE.mask(j.resume.trim());
      if (!r.hidden) this.event(r.text.slice(0, 200));
    }
    const okWho = w => (typeof w === 'string' && w.trim() && w.length < 30 ? w.trim() : p);
    if (j && Array.isArray(j.faits)) j.faits.slice(0, 5).forEach(f => (typeof f === 'string' ? this.add(f, p, 'ai') : f && this.add(f.fait, okWho(f.qui), 'ai')));
    if (j && Array.isArray(j.consignes)) j.consignes.slice(0, 3).forEach(c => c && this.addRule(c.consigne, okWho(c.qui)));
    if (j && Array.isArray(j.evenements)) j.evenements.slice(0, 3).forEach(e => e && this.addEvent(e.date, e.quoi, e.apres));
  },
};
