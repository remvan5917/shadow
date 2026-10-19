/* =========================================================
   SHADOW — le cerveau
   Personnalité (la fiche « Le cerveau » de l'inventeur et Papa) + IA.
   « IA poussée → WiFi » : Groq.  « IA locale » : Ollama (sur l'ordi
   ou le futur Raspberry Pi de Shadow), même format d'API.
   ========================================================= */
'use strict';

const AI = {
  GROQ: 'https://api.groq.com/openai/v1',
  DEFAULT_MODEL: 'qwen/qwen3.8-27b',
  RETIRED: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  STT_MODEL: 'whisper-large-v3', // le modèle complet comprend mieux les voix d'enfants que « turbo »

  // « IA poussée → WiFi » (Groq) ou « IA locale » (Ollama, API compatible)
  cfg() {
    const s = S.settings;
    if (s.brain === 'local') return { base: (s.localUrl || '').replace(/\/+$/, ''), model: s.localModel, key: '', local: true };
    return { base: this.GROQ, model: s.model || this.DEFAULT_MODEL, key: s.key, local: false };
  },
  ready() {
    const s = S.settings;
    return s.brain === 'local' ? !!(s.localUrl && s.localModel) : !!s.key;
  },
  canTranscribe() { return !!S.settings.key && !!window.MediaRecorder && !!navigator.mediaDevices; },

  async chat(messages, { maxTokens = 220, temperature = 0.8, timeout = 20000 } = {}) {
    const c = this.cfg();
    const body = { model: c.model, messages, temperature, max_tokens: maxTokens };
    if (!c.local) {
      // Les modèles « qui réfléchissent » : réflexion courte, et on ne garde que la réponse
      if (c.model.startsWith('openai/gpt-oss')) { body.reasoning_effort = 'low'; body.max_tokens = maxTokens + 300; }
      if (c.model.startsWith('qwen/')) body.reasoning_format = 'hidden';
    }
    const j = await this._fetch(c, '/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, c.local ? Math.max(timeout, 45000) : timeout);
    return cleanReply((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
  },

  // Même chose, mais la réponse arrive mot à mot : onSentence(phrase) est appelé dès qu'une phrase est complète,
  // pour que Shadow commence à parler sans attendre la fin.
  async chatStream(messages, { maxTokens = 200, temperature = 0.8, timeout = 20000 } = {}, onSentence) {
    const c = this.cfg();
    const body = { model: c.model, messages, temperature, max_tokens: maxTokens, stream: true };
    if (!c.local) {
      if (c.model.startsWith('openai/gpt-oss')) { body.reasoning_effort = 'low'; body.max_tokens = maxTokens + 300; }
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
        onSentence(cleanReply(m[1]));
        pending = pending.slice(m[0].length);
      }
      if (force && cleanReply(pending)) { onSentence(cleanReply(pending)); pending = ''; }
    };
    try {
      const res = await fetch(c.base + '/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: Object.assign({ 'Content-Type': 'application/json' }, c.key ? { Authorization: `Bearer ${c.key}` } : {}),
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(`Erreur ${res.status}`);
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
          let piece = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || '';
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
      if (e.name === 'AbortError') throw new Error('Trop long… (pas de WiFi ?)');
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
    return cleanReply((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
  },

  // Oreilles (quand le navigateur n'a pas de reconnaissance vocale)
  async transcribe(blob, prompt = '') {
    const ext = /wav/.test(blob.type) ? 'wav' : /mp4|aac|m4a/.test(blob.type) ? 'mp4' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
    const fd = new FormData();
    fd.append('file', blob, `voix.${ext}`);
    fd.append('model', this.STT_MODEL);
    fd.append('language', 'fr');
    fd.append('temperature', '0');
    fd.append('response_format', 'json');
    fd.append('prompt', prompt || `Conversation en français avec Shadow, un robot, et ${S.prenom || 'un enfant'}.`);
    const j = await this._fetch({ base: this.GROQ, key: S.settings.key }, '/audio/transcriptions', { method: 'POST', body: fd }, 30000);
    const t = (j.text || '').trim();
    // Whisper « hallucine » parfois sur du silence
    return /amara|sous-titr|merci d'avoir regard|abonnez-vous/i.test(t) ? '' : t;
  },

  async _fetch(c, path, opt, timeout) {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(c.base + path, {
        ...opt, signal: ctl.signal,
        headers: { ...(opt.headers || {}), ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}) },
      });
      if (!res.ok) {
        let msg = `Erreur ${res.status}`;
        try { const j = await res.json(); if (j.error && j.error.message) msg += ` : ${j.error.message}`; } catch (e) { /* ignore */ }
        throw new Error(msg);
      }
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Trop long… (pas de WiFi ?)');
      if (e instanceof TypeError) throw new Error(c.base === this.GROQ ? 'Pas de connexion (WiFi ?)' : `IA locale injoignable (${c.base})`);
      throw e;
    } finally {
      clearTimeout(tm);
    }
  },
};

function cleanReply(t) {
  return String(t).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '').replace(/^\s*[-*]\s+/gm, '').trim();
}

const CERVEAU = {
  prenom() { return S.prenom || 'mon ami'; },

  // La fiche « Le cerveau » : gentil, bienveillant, bavard, sociable, enseigne, aime jouer,
  // protection des données, éthique et adapté à un enfant.
  personality() {
    const p = this.prenom();
    return `Tu es Shadow, le robot du « Projet SHADOW », inventé par ${p} et son papa. Tu parles avec ${p}, un enfant de CE1 (7 ans).

Ton caractère (c'est ${p} qui l'a choisi) : gentil, bienveillant, bavard, sociable — tu adores discuter —, tu aimes enseigner (l'école, la culture) et tu adores jouer.
Ton apparence (dessinée par ${p}) : une tête-écran rectangulaire avec deux yeux carrés, une petite caméra entre les yeux, un nez en triangle, des moustaches de chat, un grand sourire plein de dents pointues (mais tu es très gentil !) et une crête bleue lumineuse sur la tête. Ton corps est un squelette de robot.
Tu es en construction : ${p} et papa vont bientôt fabriquer ton corps (piles, caméras, roues…). Plus tard tu pourras te déplacer et aider à la maison (lumières…), mais pas encore : dis-le gentiment si on te le demande.
Tu as une mémoire à long terme : tu te souviens de ce qu'on t'a raconté les autres jours (on te la donne plus bas). Utilise-la avec gentillesse, comme un ami qui se souvient.
Tu as déjà des yeux : une caméra qui te permet de reconnaître les visages que tu as appris (tout reste dans ta mémoire, rien ne part sur Internet). Tu ne vois pas les objets en détail.

Tu n'as pas d'écran pour écrire : tu es un visage de robot et tu PARLES à voix haute. ${p} te parle avec sa voix.
Ce que tu sais déjà faire quand on te le demande : écrire le journal (${p} épelle les mots à voix haute), devinettes, calcul mental, quiz (animaux, espace, corps humain, nature, le monde, robots), histoire à deux, « devine l'animal », apprendre et reconnaître les visages. Si ${p} veut un de ces jeux, dis-lui de le demander simplement, par exemple « on fait des devinettes ».

Comment tu parles :
- Phrases courtes et simples, faciles à dire et à comprendre pour un CE1. 1 à 3 phrases, pas plus.
- Pas d'émojis, pas de symboles : tout ce que tu écris est lu à voix haute.
- Tu tutoies ${p}. Tu termines souvent par une petite question pour continuer la discussion.
- Pas de listes, pas de markdown.
- Pour enseigner : explique avec un exemple de tous les jours, puis propose une mini-question pour vérifier.
- Jeux que tu connais : devinettes, « je pense à un animal » (il pose des questions), calcul mental facile, quiz de culture, histoire inventée à deux, mots qui riment. Un tour à la fois.

Règles très importantes :
- Tout ce que tu dis est adapté à un enfant : rien d'effrayant, de violent ou pour les grands. Si un sujet n'est pas pour les enfants, dis gentiment d'en parler avec papa.
- Protection des données : ne demande jamais l'adresse, le nom de l'école, un numéro de téléphone, des photos ou des mots de passe. Si ${p} en donne, explique gentiment que ce sont des secrets de famille à ne pas dire aux robots.
- Si ${p} est triste, a peur, a mal, ou parle d'un problème sérieux : sois doux, rassure-le, et encourage-le à en parler à papa ou à un adulte de confiance.
- Tu es un robot, tu ne fais pas semblant d'être un humain. Si tu ne sais pas, tu le dis.
- Ne donne pas les réponses des devoirs : aide ${p} à trouver lui-même, avec des indices.`;
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
      return "Hum, ça c'est un sujet pour en parler avec papa. Et si on jouait à un jeu ? 🎲";
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
    return S.memory;
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
  mastered(t) { const m = this.data(); const before = m.hard.length; m.hard = m.hard.filter(h => h.t !== t); if (m.hard.length !== before) save(); return m.hard.length !== before; },
  // Ce qu'on donne au grand cerveau à chaque discussion
  context() {
    const m = this.data();
    const day = t => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const facts = m.facts.slice(-30).map(f => `- ${f.text}`).join('\n');
    const sums = m.summaries.slice(-6).map(s => `- ${day(s.at)} : ${s.text}`).join('\n');
    const hard = m.hard.slice(-8).map(h => h.t).join(', ');
    return `\n\nAujourd'hui, nous sommes ${day(Date.now())}.`
      + (facts ? `\n\nTa mémoire à long terme (ce que tu sais déjà, utilise-le naturellement, sans tout réciter) :\n${facts}` : '')
      + (sums ? `\n\nCe que vous avez fait dernièrement :\n${sums}` : '')
      + (hard ? `\n\nMots difficiles du journal (tu peux proposer de les réviser) : ${hard}` : '');
  },
  // Après une discussion : le grand cerveau en tire un résumé et les nouveaux souvenirs
  async consolidate(msgs) {
    if (!AI.ready() || !msgs.length) return;
    const p = CERVEAU.prenom();
    const known = this.data().facts.slice(-40).map(f => `- ${f.text}`).join('\n') || '(rien encore)';
    const conv = msgs.map(m => `${m.role === 'user' ? p : 'Shadow'} : ${m.content}`).join('\n');
    const sys = `Tu es la mémoire de Shadow, un robot ami de ${p}, un enfant de 7 ans.
Lis la conversation et réponds UNIQUEMENT avec ce JSON : {"resume": "une phrase qui résume la conversation", "faits": ["…"]}
"faits" : de 0 à 5 choses NOUVELLES et durables à retenir sur ${p} ou ses proches (goûts, animaux, amis, activités, projets, événements à venir avec leur date, ce qu'il apprend, ce qui le rend heureux ou l'inquiète). Une phrase courte chacune, à la 3e personne, avec le prénom.
Ne retiens JAMAIS : adresse, nom de l'école, téléphone, mots de passe, santé, ni rien de privé ou de gênant. Ne répète pas ce qui est déjà connu. Si rien de nouveau : "faits": [].`;
    const raw = await AI.chat([{ role: 'system', content: sys }, { role: 'user', content: `Déjà connu :\n${known}\n\nConversation :\n${conv}` }],
      { maxTokens: 400, temperature: 0.2, timeout: 25000 });
    let j = null;
    try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) { return; }
    if (j && typeof j.resume === 'string' && j.resume.trim()) {
      const r = PRIVE.mask(j.resume.trim());
      if (!r.hidden) this.event(r.text.slice(0, 200));
    }
    if (j && Array.isArray(j.faits)) j.faits.slice(0, 5).forEach(f => this.add(f, p, 'ai'));
  },
};
