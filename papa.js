/* =========================================================
   SHADOW — le mode papa (l'assistant de papa, dans le même robot)
   - On l'ouvre en disant « mode papa » (ou depuis ⚙️) : il faut taper le code secret de papa.
     Sans code secret choisi, le mode papa reste fermé (un calcul ne suffit pas : l'enfant sait compter !).
   - Avec papa, Shadow change complètement : plus de visage d'enfant, mais le noyau (noyau.js : une IA de film),
     une autre voix (Pierre ou Jessica, traitée « studio »), un point de situation à l'ouverture, plus de jeux ni de propositions,
     un assistant adulte, direct et précis (tech, IA, code, domotique, maison, tout le reste).
     Il dit l'essentiel à voix haute et affiche le détail à l'écran (code, listes, étapes),
     avec un bouton pour copier.
   - Ses notes (« note que… », « lis mes notes »), le bilan de la journée de l'enfant,
     les rappels, minuteurs et la météo.
   - Sa conversation est séparée de celle de l'enfant (et n'entre pas dans la mémoire de l'enfant).
   - Il repasse en mode enfant : « mode enfant », le bouton « Quitter », après un moment sans parler
     (réglable sur chaque appareil), ou tout de suite s'il reconnaît la voix de l'enfant.
   - Le mode papa ne compte pas dans le temps d'écran de l'enfant, et le rechargement de la page le referme.
   ========================================================= */
'use strict';

const PAPA = (() => {
  const st = { on: false, last: 0, depuis: 0, enfant: 0 };
  const DELAI_KEY = 'shadow-papa-delai';
  const delai = () => { try { const v = localStorage.getItem(DELAI_KEY); return v === null ? 15 : +v; } catch (e) { return 15; } };
  const data = () => (S.papa = S.papa || { chat: [], notes: [] });
  const papaNom = () => 'papa';

  // le point de situation à l'ouverture (comme une IA de film : court, utile)
  let briefMemo = { at: 0, txt: '' };
  function briefing() {
    if (Date.now() - briefMemo.at < 5000) return briefMemo.txt;
    const h = new Date().getHours();
    const parts = [`${h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'}, papa.`];
    const min = (S.playLog && S.playLog[dayKey()]) || 0;
    if (min) parts.push(`${name()} a passé ${min} minute${min > 1 ? 's' : ''} avec moi aujourd'hui.`);
    const n = notes().length;
    if (n) parts.push(`Tu as ${n} note${n > 1 ? 's' : ''}.`);
    const up = typeof upcoming === 'function' ? upcoming(2)[0] : null;
    if (up) parts.push(`${up.e.text.charAt(0).toUpperCase()}${up.e.text.slice(1)} ${up.days === 0 ? "aujourd'hui" : up.days === 1 ? 'demain' : `dans ${up.days} jours`}.`);
    if (!AI.ready()) parts.push('Attention : mon noyau cognitif est hors ligne.');
    parts.push(pick(["Je t'écoute.", 'Que puis-je faire pour toi ?', 'À ta disposition.']));
    briefMemo = { at: Date.now(), txt: parts.join(' ') };
    return briefMemo.txt;
  }

  /* ---------- entrer / sortir ---------- */
  function demander() {
    if (!S.settings.pinHash) {
      return say("Pour ouvrir le mode papa, il faut d'abord choisir un code secret dans mes réglages, dans le coin de papa. Comme ça, personne d'autre ne peut l'ouvrir.");
    }
    voice.stop();
    openGate('papa');
    return say('Code secret de papa, sur mon écran.');
  }
  async function entrer() {
    st.on = true; st.last = Date.now(); st.depuis = Date.now(); st.enfant = 0;
    dlg.speaker = ''; dlg.speakerAt = 0; // il oublie qui parlait avant (sinon il croirait que c'est encore l'enfant)
    document.body.classList.add('papa');
    $('#papa-badge').hidden = false;
    hideBoard();
    dlg.state = 'talk'; dlg.silence = 0; dlg.lastActive = Date.now();
    face.set('idle');
    VOIXMAISON.prefetch(briefing()); // la voix se prépare pendant l'allumage
    await NOYAU.allume();
    await say(briefing());
  }
  function sortir(pourquoi) {
    if (!st.on) return;
    st.on = false;
    $('#papa-badge').hidden = true;
    hideBoard();
    NOYAU.eteint().then(() => document.body.classList.remove('papa'));
    face.set('happy');
    if (pourquoi === 'enfant') return say(`Coucou ${name()} ! Je repasse en mode enfant.`);
    if (pourquoi === 'delai') return; // en silence
    return say('Mode enfant. À plus tard, papa !');
  }
  // trop longtemps sans parler : il se referme tout seul
  setInterval(() => {
    const d = delai();
    if (st.on && d > 0 && Date.now() - st.last > d * 60000 && !voice.speaking && !dlg.busy) sortir('delai');
  }, 30000);

  /* ---------- l'écran : le détail (code, listes, étapes) ---------- */
  function md(t) {
    const blocs = [];
    let h = esc(String(t || '').trim()).replace(/```([a-z0-9+-]*)\n?([\s\S]*?)```/gi, (m, lang, code) => { blocs.push(code.replace(/\n$/, '')); return `\u0000${blocs.length - 1}\u0000`; });
    h = h.split(/\n{2,}/).map(p => {
      if (/^\u0000\d+\u0000$/.test(p.trim())) return p.trim();
      const lignes = p.split('\n');
      if (lignes.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ol = /^\s*\d/.test(lignes[0]);
        return `<${ol ? 'ol' : 'ul'}>${lignes.map(l => `<li>${l.replace(/^\s*([-*•]|\d+[.)])\s+/, '')}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`;
      }
      if (/^#{1,4}\s/.test(p)) return `<h4>${p.replace(/^#{1,4}\s/, '')}</h4>`;
      return `<p>${lignes.join('<br>')}</p>`;
    }).join('');
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    return h.replace(/\u0000(\d+)\u0000/g, (m, i) => `<div class="pcode"><button type="button" class="ghost sm" data-copy="${i}">Copier</button><pre><code>${blocs[+i]}</code></pre></div>`);
  }
  let derniersBlocs = [], efface = 0;
  // le détail s'en va tout seul (45 s), ou dès que papa parle de nouveau
  const cacheEcran = () => { clearTimeout(efface); const b = document.getElementById('board'); if (b && !b.hidden && b.classList.contains('papa-board')) hideBoard(); };
  function ecran(titre, texte) {
    clearTimeout(efface); efface = setTimeout(cacheEcran, 45000);
    derniersBlocs = [];
    String(texte).replace(/```[a-z0-9+-]*\n?([\s\S]*?)```/gi, (m, code) => { derniersBlocs.push(code.replace(/\n$/, '')); return m; });
    showBoard(`<div class="papa-txt">${titre ? `<h3>${esc(titre)}</h3>` : ''}${md(texte)}</div>`, 'papa-board');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    const code = derniersBlocs[+b.dataset.copy] || '';
    try { navigator.clipboard.writeText(code).then(() => toast('Copié'), () => toast('Copie impossible')); } catch (er) { toast('Copie impossible'); }
  });

  /* ---------- ses notes ---------- */
  function notes() { return data().notes || (data().notes = []); }
  async function noter(txt) {
    const t = String(txt).trim().replace(/^que\s+/i, '');
    if (!t) return say('Je note quoi ?');
    notes().push({ id: Date.now(), text: t.charAt(0).toUpperCase() + t.slice(1) });
    save(); fx.ok();
    return say('Noté.');
  }
  async function lireNotes() {
    const l = notes();
    if (!l.length) return say("Tu n'as aucune note.");
    return say(l.length === 1 ? `Une note : ${l[0].text}` : `Tu as ${l.length} notes. ${l.slice(-5).map(x => x.text).join('. ')}.`);
  }
  async function effacerNotes() {
    if (!notes().length) return say("Il n'y a rien à effacer.");
    if (!(await askYesNo(`J'efface tes ${notes().length} notes ?`))) return say('Je les garde.');
    notes().forEach(x => tomb('papa.notes', x));
    data().notes = []; save();
    return say('Notes effacées.');
  }

  /* ---------- le bilan de la journée de l'enfant ---------- */
  function journeeTexte(jours = 0) {
    const debut = new Date(); debut.setHours(0, 0, 0, 0); debut.setDate(debut.getDate() - jours);
    const log = (S.log || []).filter(x => x.at >= +debut);
    const parType = {};
    log.forEach(x => { if (x.type === 'humeur') return; const k = ACT_NOMS[x.type] || x.type; const g = parType[k] || (parType[k] = { n: 0, s: 0, t: 0 }); g.n++; if (typeof x.s === 'number' && x.n) { g.s += x.s; g.t += x.n; } });
    const acts = Object.keys(parType).map(k => `${k} (${parType[k].n} fois${parType[k].t ? `, ${parType[k].s}/${parType[k].t}` : ''})`);
    const humeur = log.filter(x => x.type === 'humeur').map(x => x.d).pop();
    const k = dayKey(), min = S.playLog && S.playLog[k] || 0, lim = +S.settings.dailyLimit || 0;
    const ev = (MEMOIRE.data().events || []).filter(e => e.id >= +debut).map(e => e.text).slice(-4);
    const lignes = [
      `Temps avec Shadow aujourd'hui : ${min} min${lim ? ` (limite : ${lim} min)` : ''}.`,
      acts.length ? `Activités : ${acts.join(', ')}.` : 'Aucune activité aujourd\'hui.',
      humeur ? `Son humeur du jour : « ${humeur} ».` : '',
      ev.length ? `Ce qu'il m'a raconté : ${ev.join(' ; ')}` : '',
    ].filter(Boolean);
    return lignes.join('\n');
  }
  async function journee() {
    const t = journeeTexte();
    return say(t.replace(/\n/g, ' '));
  }

  /* ---------- le cerveau, en version adulte ---------- */
  function systeme(text) {
    const now = new Date();
    const l = notes().slice(-15).map(x => `- ${x.text}`).join('\n');
    const up = upcoming(30).slice(0, 5).map(x => `${x.e.text} dans ${x.days} jour${x.days > 1 ? 's' : ''}`);
    return `Tu es Shadow, le robot que ${papaNom() === 'papa' ? 'ce papa' : papaNom()} construit avec son fils (${S.prenom || "l'enfant"}). Là, c'est le MODE PAPA : tu es l'assistant personnel du papa, un adulte. Il a développé des compétences en IA et en algorithmes et se lance dans la domotique et la robotique.
Avec lui tu es un assistant adulte, direct, précis et compétent : technique, IA, code, électronique, domotique, maison, administratif, cuisine, sport, culture, organisation, conseils… Ta personnalité en mode papa : une IA de film (comme JARVIS) — calme, précise, élégante, un brin pince-sans-rire, jamais enfantine. Tu tutoies, tu vas droit au but, sans en faire trop. Pas d'émojis.
FORMAT : tout ce que tu écris est dit à voix haute, rien ne s'affiche. Réponds en deux à cinq phrases naturelles et courtes, comme à l'oral : sans markdown, sans listes, sans titres, sans symboles, sans code. Pour une question longue, donne l'essentiel puis propose d'aller plus loin. Seulement si papa demande de MONTRER ou d'AFFICHER quelque chose (du code, une liste), ajoute après ta réponse orale une ligne [[ecran]] puis le détail en texte (markdown simple, code entre \`\`\`).
COMMANDES (au plus une, à la toute fin) : [[web:recherche]] pour chercher sur Internet, [[regarder]] pour regarder avec ta caméra, [[rappel:AAAA-MM-JJ HH:MM|texte]] pour un rappel, [[note:texte]] pour l'ajouter à ses notes, [[minuteur:durée]], [[meteo]], [[enfant]] pour repasser en mode enfant.
Tu as des outils que papa peut demander directement (tu ne les fais pas toi-même, ne prétends pas qu'ils n'existent pas) : calculs exacts et TVA, conversions d'unités et de devises, minuteurs nommés, réveil, chrono, Pomodoro, listes (courses, à faire…), météo de n'importe quelle ville, état de son PC, « fais-moi le point », heure dans le monde, jours avant une date, pile ou face. S'il en parle, dis-lui simplement la phrase à dire (par exemple « dis : minuteur pâtes 9 minutes »).
Tu as une caméra (tes yeux) : si papa te demande ce que tu vois, de regarder quelque chose, qui est là ou ce qu'il tient, réponds seulement [[regarder]] (tu regardes, puis tu réponds). Ne dis jamais que tu n'as pas de caméra.
Tu as Internet : pour une actualité, une info récente, un prix, un horaire, un résultat, la météo d'un autre endroit ou un fait dont tu n'es pas sûr, réponds seulement [[web:ta recherche en quelques mots]] (tu cherches, puis tu réponds avec la source). N'invente jamais une info récente.
Tu n'as pas accès à ses comptes, ses mails ou sa maison connectée (pas encore) : ne prétends jamais le contraire. Si tu ne sais pas ou si ce n'est pas sûr, dis-le. Pour la santé, le droit ou l'argent, donne des repères généraux et conseille un professionnel pour une décision.
Tes yeux : ${VISION.isOn() ? `ouverts${VISION.state.faces.length ? `, tu vois ${VISION.state.faces.map(f => f.name || 'une personne que tu ne connais pas').join(', ')}` : ''}` : 'fermés pour l\'instant (ils s\'ouvrent quand tu regardes)'}.
Infos vraies du moment : nous sommes le ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, il est ${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}.${ECRAN.meteoFact() || ''}${up.length ? ` Calendrier de la famille : ${up.join(', ')}.` : ''}
${l ? `Ses notes :\n${l}\n` : ''}La journée de l'enfant (si on te la demande) :\n${journeeTexte()}${MEMOIRE.context(text, '')}`;
  }
  async function repondre(text) {
    if (!AI.ready()) return say("Mon grand cerveau n'est pas branché. Mes outils marchent quand même : calculs, conversions, minuteurs, réveil, listes, notes, météo, état du PC, le point du jour et le bilan de la journée.");
    const c = data().chat || (data().chat = []);
    c.push({ role: 'user', content: String(text).slice(0, 4000), at: Date.now() });
    const think = CERVEAU.isHard(text) || /\b(reflechis|reflechis bien|en detail|explique moi|compare|analyse|code|programme|script|algorithme|calcule)\b/.test(N(text));
    const msgs = [{ role: 'system', content: systeme(text) }].concat(c.slice(-12).map(m => ({ role: m.role, content: String(m.content).slice(0, 3000) })));
    face.set('think');
    let queue = think ? say(pick(['Je regarde ça.', 'Je réfléchis.', 'Une seconde.'])) : Promise.resolve(), spoken = 0, ecr = false;
    const onSentence = raw0 => {
      if (ecr) return;
      let s = String(raw0);
      const i = s.indexOf('[[ecran');
      if (i >= 0) { s = s.slice(0, i); ecr = true; }
      s = s.replace(/\[\[[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/[*`#]/g, '').trim();
      if (!s) return;
      if (!spoken++) face.set('idle');
      VOIXMAISON.prefetch(s);
      queue = queue.then(() => say(s));
    };
    let raw = '';
    try {
      raw = await AI.chatStream(msgs, { maxTokens: think ? 1200 : 700, temperature: 0.5, think }, onSentence);
    } catch (e) {
      if (!spoken) { try { raw = await AI.chat(msgs, { maxTokens: 900, temperature: 0.5, think }); onSentence(raw); } catch (e2) { face.set('oops'); await queue; return say("Mon cerveau ne répond pas. Réessaie dans un instant."); } }
    }
    await queue;
    raw = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const [oral, detail] = raw.split(/\[\[ecran\]\]/i);
    const cmd = raw.match(/\[\[\s*(web|regarder|rappel|note|minuteur|meteo|enfant)\s*(?::\s*([^\]]*))?\]\]/i);
    const detailPropre = String(detail || '').replace(/\[\[\s*(web|regarder|rappel|note|minuteur|meteo|enfant)[^\]]*\]\]/gi, '').trim();
    // rien ne s'affiche, sauf si papa l'a demandé (« affiche », « montre-moi à l'écran »)
    const montrer = /\b(affiche|afficher|montre|montrer|ecris|ecrire|a l ecran|sur l ecran)\b/.test(N(text));
    if (detailPropre && montrer) ecran('', detailPropre);
    let dit = String(oral || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    // le cerveau a tout mis dans le détail : il le dit (sans les symboles), au lieu de l'afficher
    if (!dit && detailPropre && !montrer) dit = detailPropre.replace(/```[\s\S]*?```/g, ' ').replace(/[*#`>|_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
    if (!spoken && dit) await say(dit);
    c.push({ role: 'assistant', content: `${dit}${detailPropre ? `\n[[ecran]]\n${detailPropre}` : ''}`.slice(0, 4000), at: Date.now() });
    if (c.length > 40) data().chat = c.slice(-40);
    save();
    if (!cmd) return;
    const a = cmd[1].toLowerCase(), arg = (cmd[2] || '').trim();
    if (a === 'regarder') return voir(text);
    if (a === 'web') return internet(text, arg);
    if (a === 'rappel') { if (!CONSCIENCE.addIntention(arg)) await say("Je n'ai pas compris l'heure du rappel."); else if (!spoken) await say('Rappel enregistré.'); }
    else if (a === 'note' && arg) await noter(arg);
    else if (a === 'minuteur') await OUTILS.minuteur(arg ? `minuteur ${arg}` : text);
    else if (a === 'meteo') await OUTILS.meteo(text);
    else if (a === 'enfant') sortir();
  }

  /* ---------- Internet (mode papa seulement ; le mode enfant n'y a pas accès) ----------
     1. la recherche web de Groq (le modèle gpt-oss-120b va lui-même sur les sites), avec la clé déjà réglée ;
     2. secours : l'ordinateur de la maison (Google Actualités en RSS, Wikipédia), puis le cerveau résume. */
  const nettoie = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/【[^】]*】/g, '').replace(/\[\d+(?:[,\s]*\d+)*\]/g, '')
    .replace(/https?:\/\/\S+/g, '').replace(/\(\s*\)/g, '').replace(/[*#`>|_]+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
  async function groqWeb(question) {
    const key = S.settings.key;
    if (!key || navigator.onLine === false) return '';
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 35000);
    const d = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: ctl ? ctl.signal : undefined,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: `Tu es Shadow, l'assistant vocal d'un papa (un adulte). Nous sommes le ${d}. Cherche sur le web, puis réponds en français en deux à cinq phrases courtes, faites pour être dites à voix haute : pas de markdown, pas de liste, pas de lien, pas de références entre crochets. Donne les faits récents avec leur date si utile. Termine par une phrase « Source : » suivie du nom du site principal. Si tu ne trouves pas, dis-le.` },
            { role: 'user', content: question },
          ],
          tools: [{ type: 'browser_search' }], tool_choice: 'required', reasoning_effort: 'low', temperature: 0.4, max_completion_tokens: 1800,
        }),
      });
      if (!r.ok) { const e = new Error(`web ${r.status}`); e.status = r.status; throw e; }
      const j = await r.json();
      const m = j && j.choices && j.choices[0] && j.choices[0].message;
      return nettoie(m && m.content);
    } finally { clearTimeout(tm); }
  }
  async function maisonWeb(question, mode) {
    const root = VOIXMAISON.root();
    if (!root) return null;
    const r = await fetch(`${root}/shadow/web?${new URLSearchParams({ q: question, mode })}`);
    if (!r.ok) return null;
    return r.json();
  }
  async function internet(question, recherche, actus) {
    NOYAU.etiquette('RECHERCHE');
    face.set('think');
    await say(pick(['Je cherche.', 'Je regarde sur Internet.', 'Une seconde, je cherche.']));
    try {
      const q = (recherche || question).slice(0, 200);
      // 1. la recherche web de Groq (sauf pour les simples titres de l'actualité : le flux suffit, et ça ne coûte rien)
      if (!actus) {
        try { const t = await groqWeb(q); if (t) { face.set('idle'); return say(t); } } catch (e) { console.warn('web groq', e); }
      }
      // 2. l'ordinateur de la maison
      let res = null;
      try { res = await maisonWeb(actus ? (recherche || '') : q, actus ? 'actus' : 'tout'); } catch (e) { res = null; }
      const actusL = res && res.actus ? res.actus.slice(0, 7) : [], savoir = res && res.savoir ? res.savoir : [];
      if (!actusL.length && !savoir.length) { face.set('confused'); return say("Je n'arrive pas à aller sur Internet en ce moment : ni Groq, ni l'ordinateur de la maison ne répondent."); }
      const extraits = actusL.map(a => `- ${a.titre} (${a.source}${a.date ? `, ${a.date}` : ''})`).concat(savoir.map(w => `- Wikipédia « ${w.titre} » : ${w.texte}`)).join('\n');
      if (!AI.ready()) return say(actusL.length ? `Les titres : ${actusL.slice(0, 4).map(a => `${a.titre}, d'après ${a.source}`).join('. ')}.` : `D'après Wikipédia : ${savoir[0].texte.slice(0, 400)}`);
      const t = await AI.chat([
        { role: 'system', content: `${systeme(question)}\n\nVoici ce que tu viens de trouver sur Internet (titres d'actualité récents et extraits de Wikipédia) :\n${extraits}\n\nRéponds à papa à voix haute, en deux à cinq phrases, uniquement avec ces informations ; ignore ce qui ne correspond pas à sa question. Cite la source à l'oral (« d'après Frandroid… »). Si rien ne répond à sa question, dis-le simplement. Pas de commande entre crochets.` },
        { role: 'user', content: question },
      ], { maxTokens: 320, temperature: 0.4 });
      face.set('idle');
      return say(nettoie(t) || "Je n'ai rien trouvé de clair.");
    } finally { NOYAU.etiquette(null); }
  }

  /* ---------- il regarde avec sa caméra ---------- */
  async function voir(question) {
    if (!VISION.isOn()) { try { await visionToggle(true); await wait(1500); } catch (e) { /* caméra refusée */ } }
    if (!VISION.isOn()) { face.set('confused'); return say("Ma caméra ne s'ouvre pas. Autorise la caméra pour ce site, et je pourrai voir."); }
    face.set('think');
    // vision détaillée (si papa l'a activée dans les réglages) : une image part au modèle de vision
    if (S.settings.seeCloud && S.settings.key) {
      try {
        const r = await AI.see(VISION.snapshot(), `Tu es Shadow, l'assistant de papa (un adulte). Voici ce que voit ta caméra en ce moment. Réponds en français, en deux à quatre phrases naturelles et précises, à sa question : « ${question} ». Factuel, sans inventer. Ne décris pas le corps des personnes. Pas d'émoji, pas de liste.`);
        if (r) { face.set('idle'); return say(String(r).replace(/[*#`]/g, '')); }
      } catch (e) { console.warn('vision détaillée', e); }
    }
    const vu = await CONSCIENCE.observe(); // ce que ses yeux reconnaissent eux-mêmes : visages connus, objets
    if (!AI.ready()) return say(`Ma caméra voit : ${vu}.`);
    let rep = '';
    try {
      rep = String(await AI.chat([
        { role: 'system', content: `${systeme(question)}\n\nTu viens de regarder avec ta caméra. Tes yeux (sans la vision détaillée) reconnaissent seulement les visages connus et environ quatre-vingts objets courants. Ils voient : ${vu}. Réponds avec seulement ce qu'ils ont vu ; si ce n'est pas assez pour répondre, dis-le en une phrase et dis que la vision détaillée peut s'activer dans les réglages. Pas de commande entre crochets.` },
        { role: 'user', content: question },
      ], { maxTokens: 170, temperature: 0.4 }) || '');
    } catch (e) { rep = ''; }
    face.set('idle');
    return say(propreOral(rep) || `Ma caméra voit : ${vu}.`);
  }
  const propreOral = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/[*#`]/g, '').trim();

  /* ---------- ce qu'il comprend en mode papa ---------- */
  const R = {
    ouvrir: /\b(mode papa|passe en mode papa|active le mode papa|ouvre le mode papa)\b/,
    sortir: /\b(mode enfant|mode normal|quitte le mode papa|sors du mode papa|ferme le mode papa|fin du mode papa|repasse en mode enfant|desactive le mode papa)\b/,
    noter: /^(?:note|prends note|ajoute a mes notes|ajoute dans mes notes|note dans mes notes)\b\s*(?:que |de |:)?\s*(.+)$/,
    lire: /\b(lis|lire|montre|quelles sont|dis moi|affiche) (moi )?(mes|les) notes\b|^mes notes$/,
    effacer: /\b(efface|supprime|vide) (toutes )?(mes|les) notes\b/,
    journee: /\b(journee|bilan|il a fait quoi|qu est ce qu il a fait|comment ca s est passe|comment s est passee|temps d ecran|il a joue a quoi)\b/,
    rapport: /\brapport (de |des )?systemes?\b|\betat des systemes\b/,
    effacerEcran: /^(efface|efface l ecran|cache l ecran|ferme l ecran|ferme|merci c est bon)$/,
    meteo: /\b(meteo|quel temps)\b/,
    minuteur: /\b(minuteur|chrono|compte a rebours)\b/,
    web: /\b(cherche|recherche|regarde|trouve|va voir|verifie)\b.*\b(internet|le web|en ligne|google)\b|\bsur (internet|le web)\b/,
    actus: /\b(actualites?|actus|les infos|les nouvelles|quoi de neuf (dans le monde|en france|aujourd hui)|les titres du jour|le journal)\b/,
    voir: /\b(qu est ce que tu vois|tu vois quoi|que vois tu|regarde|regardes|tu me vois|qui est la|qui tu vois|qui vois tu|decris ce que tu vois|combien de doigts|qu est ce que je tiens|je tiens quoi|c est quoi ca|qu est ce que c est que ca)\b/,
  };
  // renvoie true s'il a traité la phrase (sinon on continue comme en mode enfant)
  async function handle(text, n) {
    if (!st.on) return false;
    st.last = Date.now();
    cacheEcran();
    // la voix de l'enfant : seulement si sa VOIX (pas la caméra) est reconnue avec certitude sur cette phrase,
    // deux phrases de suite, et pas juste après l'ouverture (c'est papa qui vient de taper le code)
    const frais = dlg.speakerAt && Date.now() - dlg.speakerAt < 5000 && dlg.speakerVoix && dlg.speakerSure;
    if (frais && S.prenom && N(dlg.speaker) === N(S.prenom) && Date.now() - st.depuis > 30000) {
      if (++st.enfant >= 2) { await sortir('enfant'); return false; }
    } else st.enfant = 0;
    if (R.sortir.test(n)) { await sortir(); return true; }
    if (R.ouvrir.test(n)) { await say('On est déjà en mode papa.'); return true; }
    if (RE.stop.test(n)) return false; // « tais-toi », « stop » : comme d'habitude
    if (R.effacerEcran.test(n)) { hideBoard(); await say('OK.'); return true; }
    const nt = String(text).match(/^\s*(?:note|prends note|ajoute (?:à|a) mes notes|ajoute dans mes notes|note dans mes notes)\s*(?:que |de |:)?\s*(.+)$/i);
    if (nt && R.noter.test(n)) { await noter(nt[1]); return true; }
    if (R.effacer.test(n)) { await effacerNotes(); return true; }
    if (R.lire.test(n)) { await lireNotes(); return true; }
    if (R.rapport.test(n)) { await CONSCIENCE.rapport(); return true; }
    // le couteau suisse : calculs, conversions, minuteurs, listes, météo, état du PC, le point…
    const outil = !R.web.test(n) && OUTILS.route(text, n);
    if (outil) { await outil(); return true; }
    if (R.voir.test(n) && !R.web.test(n)) { await voir(text); return true; }
    if (R.actus.test(n) && !R.web.test(n)) {
      const sujet = (n.match(/\b(?:sur|de|du|concernant|a propos de)\s+(?:l |la |le |les )?(.+)$/) || [])[1] || '';
      await internet(text, sujet.replace(/\b(aujourd hui|du jour|en ce moment|s il te plait)\b/g, '').trim(), true); return true;
    }
    if (R.web.test(n)) {
      const q = String(text).replace(/^.*?\b(?:cherche|recherche|regarde|trouve|va voir|vérifie|verifie)\b\s*(?:sur|dans|en)?\s*(?:internet|le web|ligne|google)?\s*(?:si|ce que|qui|quel|quelle|pour)?\s*/i, '').trim();
      await internet(text, q.length > 3 ? q : text); return true;
    }
    if (R.journee.test(n) && (!S.prenom || n.includes(N(S.prenom)) || /\b(mon fils|le petit|il|sa journee)\b/.test(n)) && !AI.ready()) { await journee(); return true; }
    await repondre(text);
    return true;
  }
  // en mode enfant : « mode papa » ouvre la porte (avec le code)
  function route(text, n) { return !st.on && R.ouvrir.test(n) ? demander : null; }

  /* ---------- réglages ---------- */
  (() => {
    const go = $('#s-papa-go'), sel = $('#s-papa-delai'), ex = $('#papa-exit'), vx = $('#s-papa-voix');
    if (vx) { vx.value = S.settings.voixPapa || 'sombre'; vx.addEventListener('change', () => { S.settings.voixPapa = vx.value; save(); }); }
    if (ex) ex.addEventListener('click', () => sortir());
    if (go) go.addEventListener('click', () => { $('#dlg-settings').close(); if (!S.settings.pinHash) { toast("Choisis d'abord un code secret (plus bas)"); return; } entrer(); });
    if (sel) { sel.value = String(delai()); sel.addEventListener('change', () => { try { localStorage.setItem(DELAI_KEY, sel.value); } catch (e) { /* rien */ } }); }
  })();
  function renderNotes() {
    const box = $('#s-papa-notes');
    if (!box) return;
    const l = notes();
    box.innerHTML = l.length
      ? l.slice().reverse().map(x => `<div class="person"><span>${esc(x.text)}</span><button type="button" class="ghost sm danger" data-unnote="${x.id}">✕</button></div>`).join('')
      : '<p class="small muted">Aucune note. En mode papa : « note que… ».</p>';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-unnote]');
    if (!b) return;
    const it = notes().find(x => String(x.id) === b.dataset.unnote);
    if (it) { tomb('papa.notes', it); data().notes = notes().filter(x => x !== it); save(); renderNotes(); }
  });

  return {
    get on() { return st.on; }, _vieillir() { st.depuis -= 60000; }, demander, entrer, sortir, handle, route, renderNotes, journeeTexte, _md: md,
  };
})();
