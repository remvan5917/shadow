/* =========================================================
   SHADOW — le mode papa (l'assistant de papa, dans le même robot)
   - On l'ouvre en disant « mode papa » (ou depuis ⚙️) : il faut taper le code secret de papa.
     Sans code secret choisi, le mode papa reste fermé (un calcul ne suffit pas : l'enfant sait compter !).
   - Avec papa, Shadow change complètement : un autre visage, futuriste (visière noire, yeux-capsules ambre,
     égaliseur qui suit sa voix et la tienne, anneau qui tourne quand il réfléchit), plus de jeux ni de propositions,
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
  const st = { on: false, last: 0 };
  const DELAI_KEY = 'shadow-papa-delai';
  const delai = () => { try { const v = localStorage.getItem(DELAI_KEY); return v === null ? 15 : +v; } catch (e) { return 15; } };
  const data = () => (S.papa = S.papa || { chat: [], notes: [] });
  const papaNom = () => 'papa';

  /* ---------- son visage futuriste : il suit les émotions, la voix et le regard du visage normal ---------- */
  function miroir() {
    const src = document.getElementById('face'), dst = document.getElementById('face-papa');
    if (!src || !dst) return;
    dst.setAttribute('class', `fp ${[...src.classList].filter(c => c !== 'face').join(' ')}`);
    ['--lv', '--gx'].forEach(v => dst.style.setProperty(v, src.style.getPropertyValue(v) || (v === '--gx' ? '0px' : '0')));
    const vis = src.getAttribute('data-vis');
    if (vis) dst.setAttribute('data-vis', vis); else dst.removeAttribute('data-vis');
  }
  (() => {
    const src = document.getElementById('face');
    if (src && window.MutationObserver) new MutationObserver(() => { if (st.on) miroir(); }).observe(src, { attributes: true, attributeFilter: ['class', 'style', 'data-vis'] });
  })();

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
    st.on = true; st.last = Date.now();
    document.body.classList.add('papa');
    miroir();
    const fp = document.getElementById('face-papa');
    if (fp) { fp.classList.add('boot'); setTimeout(() => fp.classList.remove('boot'), 1500); }
    $('#papa-badge').hidden = false;
    hideBoard();
    dlg.state = 'talk'; dlg.silence = 0; dlg.lastActive = Date.now();
    fx.tone([[523, 0.07], [784, 0.07], [1046, 0.12]]);
    face.set('idle');
    await say(pick(['Mode papa activé. Je t\'écoute.', 'Mode papa. Qu\'est-ce que je peux faire pour toi ?', 'Salut papa. Je suis à toi, qu\'est-ce qu\'il te faut ?']));
  }
  function sortir(pourquoi) {
    if (!st.on) return;
    st.on = false;
    document.body.classList.remove('papa');
    $('#papa-badge').hidden = true;
    hideBoard();
    fx.tone([[1046, 0.07], [784, 0.07], [523, 0.12]]);
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
  let derniersBlocs = [];
  function ecran(titre, texte) {
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
    ecran('Tes notes', l.map(x => `- ${x.text}`).join('\n'));
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
    ecran(`La journée de ${S.prenom || "l'enfant"}`, t.split('\n').map(l => `- ${l}`).join('\n'));
    return say(t.replace(/\n/g, ' '));
  }

  /* ---------- le cerveau, en version adulte ---------- */
  function systeme(text) {
    const now = new Date();
    const l = notes().slice(-15).map(x => `- ${x.text}`).join('\n');
    const up = upcoming(30).slice(0, 5).map(x => `${x.e.text} dans ${x.days} jour${x.days > 1 ? 's' : ''}`);
    return `Tu es Shadow, le robot que ${papaNom() === 'papa' ? 'ce papa' : papaNom()} construit avec son fils (${S.prenom || "l'enfant"}). Là, c'est le MODE PAPA : tu es l'assistant personnel du papa, un adulte. Il a développé des compétences en IA et en algorithmes et se lance dans la domotique et la robotique.
Avec lui tu es un assistant adulte, direct, précis et compétent : technique, IA, code, électronique, domotique, maison, administratif, cuisine, sport, culture, organisation, conseils… Tu tutoies, tu vas droit au but, sans infantiliser ni en faire trop, avec ta petite personnalité de robot (sobre). Pas d'émojis.
FORMAT : tout ce que tu écris AVANT la ligne [[ecran]] est dit à voix haute : une à quatre phrases naturelles, sans markdown, sans symboles, sans code. Si la réponse a besoin de détails (code, liste, étapes, chiffres, tableau), ajoute ensuite une ligne [[ecran]] puis le détail en texte, affiché à l'écran (markdown simple : listes, **gras**, code entre \`\`\`). Sinon, pas de [[ecran]].
COMMANDES (au plus une, à la toute fin) : [[rappel:AAAA-MM-JJ HH:MM|texte]] pour un rappel, [[note:texte]] pour l'ajouter à ses notes, [[minuteur:durée]], [[meteo]], [[enfant]] pour repasser en mode enfant.
Tu n'as pas Internet, ni accès à ses comptes, ses mails ou sa maison connectée (pas encore) : ne prétends jamais le contraire. Si tu ne sais pas ou si ce n'est pas sûr, dis-le. Pour la santé, le droit ou l'argent, donne des repères généraux et conseille un professionnel pour une décision.
Infos vraies du moment : nous sommes le ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, il est ${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}.${ECRAN.meteoFact() || ''}${up.length ? ` Calendrier de la famille : ${up.join(', ')}.` : ''}
${l ? `Ses notes :\n${l}\n` : ''}La journée de l'enfant (si on te la demande) :\n${journeeTexte()}${MEMOIRE.context(text, '')}`;
  }
  async function repondre(text) {
    if (!AI.ready()) return say("Mon grand cerveau n'est pas branché. Sans lui, en mode papa, je peux noter, lire tes notes, faire le bilan de la journée, la météo et les minuteurs.");
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
    const cmd = raw.match(/\[\[\s*(rappel|note|minuteur|meteo|enfant)\s*(?::\s*([^\]]*))?\]\]/i);
    const detailPropre = String(detail || '').replace(/\[\[\s*(rappel|note|minuteur|meteo|enfant)[^\]]*\]\]/gi, '').trim();
    if (detailPropre) ecran('', detailPropre);
    const dit = String(oral || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    if (!spoken && dit) await say(dit);
    c.push({ role: 'assistant', content: `${dit}${detailPropre ? `\n[[ecran]]\n${detailPropre}` : ''}`.slice(0, 4000), at: Date.now() });
    if (c.length > 40) data().chat = c.slice(-40);
    save();
    if (!cmd) return;
    const a = cmd[1].toLowerCase(), arg = (cmd[2] || '').trim();
    if (a === 'rappel') { if (!CONSCIENCE.addIntention(arg)) await say("Je n'ai pas compris l'heure du rappel."); else if (!spoken) await say('Rappel enregistré.'); }
    else if (a === 'note' && arg) await noter(arg);
    else if (a === 'minuteur') await ECRAN.minuteur(arg || text);
    else if (a === 'meteo') await ECRAN.meteo('');
    else if (a === 'enfant') sortir();
  }

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
  };
  // renvoie true s'il a traité la phrase (sinon on continue comme en mode enfant)
  async function handle(text, n) {
    if (!st.on) return false;
    st.last = Date.now();
    const who = typeof speakerNow === 'function' ? speakerNow() : '';
    if (who && S.prenom && N(who) === N(S.prenom)) { await sortir('enfant'); return false; } // c'est la voix de l'enfant
    if (R.sortir.test(n)) { await sortir(); return true; }
    if (R.ouvrir.test(n)) { await say('On est déjà en mode papa.'); return true; }
    if (RE.stop.test(n)) return false; // « tais-toi », « stop » : comme d'habitude
    if (R.effacerEcran.test(n)) { hideBoard(); await say('OK.'); return true; }
    const nt = String(text).match(/^\s*(?:note|prends note|ajoute (?:à|a) mes notes|ajoute dans mes notes|note dans mes notes)\s*(?:que |de |:)?\s*(.+)$/i);
    if (nt && R.noter.test(n)) { await noter(nt[1]); return true; }
    if (R.effacer.test(n)) { await effacerNotes(); return true; }
    if (R.lire.test(n)) { await lireNotes(); return true; }
    if (R.rapport.test(n)) { await CONSCIENCE.rapport(); return true; }
    if (R.journee.test(n) && (!S.prenom || n.includes(N(S.prenom)) || /\b(mon fils|le petit|il|sa journee)\b/.test(n)) && !AI.ready()) { await journee(); return true; }
    if (!AI.ready() && R.meteo.test(n)) { await ECRAN.meteo(text); return true; }
    if (!AI.ready() && R.minuteur.test(n)) { await ECRAN.minuteur(text); return true; }
    await repondre(text);
    return true;
  }
  // en mode enfant : « mode papa » ouvre la porte (avec le code)
  function route(text, n) { return !st.on && R.ouvrir.test(n) ? demander : null; }

  /* ---------- réglages ---------- */
  (() => {
    const go = $('#s-papa-go'), sel = $('#s-papa-delai'), ex = $('#papa-exit');
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
    get on() { return st.on; }, demander, entrer, sortir, handle, route, renderNotes, journeeTexte, _md: md,
  };
})();
