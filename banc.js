/* =========================================================
   SHADOW — le banc d'essai (…/shadow/?banc)
   Avant chaque mise à jour : on vérifie que tout marche, en accéléré.
   - toutes les vérifications périodiques (coucher, rappels, batterie, humeur…) sont lancées d'un coup ;
   - le cerveau, les yeux et les oreilles sont simulés ;
   - les vraies données ne sont jamais touchées (mémoire séparée « shadow-banc »).
   Le résultat s'affiche à l'écran et dans window.__BANC_RESULT.
   ========================================================= */
'use strict';

(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const res = [];
  const ok = (nom, cond, info) => res.push({ nom, ok: !!cond, info: info || '' });
  async function essai(nom, fn) {
    try { const r = await fn(); ok(nom, r !== false, typeof r === 'string' ? r : ''); } catch (e) { ok(nom, false, `${e.name} : ${e.message}`); }
  }
  const erreurs = [];
  window.addEventListener('error', e => erreurs.push(e.message));
  window.addEventListener('unhandledrejection', e => erreurs.push(`promesse : ${e.reason && e.reason.message}`));
  await wait(1500);

  // ---------- l'environnement simulé ----------
  const dlgOpen = document.querySelector('dialog[open]'); if (dlgOpen) dlgOpen.close();
  const dits = [];
  const vraieVoix = voice.say.bind(voice);
  voice.say = t => { dits.push(t); return new Promise(r => setTimeout(r, 5)); };
  hear = async () => { await wait(20); return null; };
  S = fresh(); // on part d'une mémoire toute neuve (jamais les vraies données)
  S.prenom = 'Testeur'; S.settings.coucher = '00:00';
  dlg.started = true; dlg.state = 'talk'; dlg.lastTalk = Date.now();
  const vrai = { ready: AI.ready, stream: AI.chatStream, chat: AI.chat, savoir: ECRAN.savoir, look: CONSCIENCE.lookAndAnswer, act: window.activity };
  let reponse = '';
  AI.ready = () => true;
  AI.chatStream = async (m, o, onS) => { onS(reponse); return reponse; };
  AI.chat = async () => '{"resume":"test","faits":[{"qui":"Testeur","fait":"Testeur aime les tests."}],"evenements":[],"consignes":[]}';

  // ---------- 1. toutes les vérifications périodiques, d'un coup ----------
  const iv = window.__intervals || [];
  let pb = 0;
  for (let k = 0; k < iv.length; k++) {
    for (let fois = 0; fois < 2; fois++) {
      try { const r = iv[k].fn(); if (r && r.then) await r.catch(e => { throw e; }); } catch (e) { pb++; ok(`vérification périodique n° ${k + 1} (toutes les ${Math.round(iv[k].ms / 1000)} s)`, false, `${e.name} : ${e.message}`); break; }
    }
  }
  ok(`${iv.length} vérifications périodiques lancées`, iv.length > 5 && !pb, pb ? `${pb} en erreur` : '');

  // ---------- 2. le visage ----------
  await essai('toutes les expressions du visage', () => { face.MOODS.forEach(m => face.set(m)); face.set('idle'); return true; });
  await essai('bouche qui parle + barres de voix', async () => { face.talk(true); VISAGE.speak('Bonjour, je suis Shadow !', 1); await wait(250); const v = face.el.getAttribute('data-vis'); VISAGE.quiet(); face.talk(false); return !!v; });
  await essai("séquence d'allumage", () => { VISAGE.boot(); return face.el.classList.contains('boot'); });
  await essai('réaction aux phrases (surpris, fier…)', () => { face.set('idle'); VISAGE.react('Wouah, incroyable !'); const r = face.state === 'surprise'; face.set('idle'); return r; });
  await essai('la tête suit le regard (3D)', () => { face.look(6, -2); const r = !!face.el.style.getPropertyValue('--ry'); face.look(0, 0); return r; });

  // ---------- 3. comprendre ce qu'on dit ----------
  const routes = [
    ["c'est quoi un volcan", () => ECRAN.route("c'est quoi un volcan", N("c'est quoi un volcan"))],
    ['quel temps il fait', () => ECRAN.route('quel temps il fait', N('quel temps il fait'))],
    ['mets un minuteur de 5 minutes', () => ECRAN.route('mets un minuteur de 5 minutes', N('mets un minuteur de 5 minutes'))],
    ['arrête le minuteur', () => ECRAN.routeEarly(N('arrête le minuteur'))],
    ['je veux apprendre la table de 7 cette semaine', () => PROJETS.route('je veux apprendre la table de 7 cette semaine', N('je veux apprendre la table de 7 cette semaine'))],
    ['état de tes systèmes', () => CONSCIENCE.route('état de tes systèmes', N('état de tes systèmes'))],
    ['shadow mode vidéo', () => ECRAN.routeEarly(N('shadow mode vidéo'))],
  ];
  for (const [phrase, fn] of routes) await essai(`comprend « ${phrase} »`, () => !!fn());

  // ---------- 4. le cerveau et ses commandes ----------
  const appels = [];
  ECRAN.savoir = async s => { appels.push(`cherche:${s}`); };
  CONSCIENCE.lookAndAnswer = async () => { appels.push('regarder'); };
  window.activity = async fn => { appels.push('activité'); };
  const cmd = async (texte, rep) => { reponse = rep; dits.length = 0; await chatReply(texte); return dits.join(' '); };
  await essai('réponse simple du cerveau', async () => /Bonjour/.test(await cmd('salut', 'Bonjour Testeur !')));
  await essai('[[cherche:…]] ouvre l\'encyclopédie', async () => { await cmd('montre-moi un guépard', '[[cherche:guépard]]'); return appels.includes('cherche:guépard'); });
  await essai('[[regarder]] ouvre les yeux', async () => { await cmd("qu'est-ce que je tiens", '[[regarder]]'); return appels.includes('regarder'); });
  await essai('[[rappel:+5|…]] programme un rappel', async () => { const n = (S.intentions || []).length; await cmd('rappelle-moi dans 5 minutes de ranger ma chambre', "D'accord ! [[rappel:+5|ranger ma chambre]]"); const x = S.intentions.slice(-1)[0]; return S.intentions.length === n + 1 && /ta chambre/.test(x.text); });
  await essai('commande ignorée si personne ne l\'a demandée', async () => { const n = (S.intentions || []).length; await cmd('raconte une blague', 'Une blague ! [[rappel:+5|truc]]'); return (S.intentions || []).length === n; });
  await essai('[[dictee]] lance une activité', async () => { appels.length = 0; await cmd('on fait une dictée', "C'est parti ! [[dictee]]"); return appels.includes('activité'); });
  await essai('question difficile → cerveau qui réfléchit', () => CERVEAU.isHard('pourquoi le ciel est bleu') && !CERVEAU.isHard('tu aimes les frites'));
  await essai('mémoire rangée par personne', async () => { await MEMOIRE.consolidate([{ role: 'user', content: "j'adore les tests", who: 'Testeur' }]); return MEMOIRE.data().facts.some(f => f.who === 'Testeur'); });
  await essai('conscience, mémoire, niveau, projets (textes pour le cerveau)', () => { const t = CERVEAU.personality() + MEMOIRE.context('test', 'Testeur') + CONSCIENCE.etat() + PROJETS.fact(); return t.length > 500; });
  await essai('le rapport d\'auto-test', () => reportText().indexOf('Rapport Shadow') === 0);
  await essai('mode vidéo : aucun prénom', () => { S.settings.video = true; const t = anonymize('Bonjour Testeur !'); S.settings.video = false; return t === 'Bonjour mon ami !'; });

  // ---------- 5. les activités à l'écran ----------
  await essai('minuteur (démarre et s\'arrête)', () => { ECRAN.startTimer(60, 'test'); const a = !document.getElementById('timer').hidden; ECRAN.stopTimer(); return a && document.getElementById('timer').hidden; });
  await essai('projet : création', async () => { await PROJETS.create('je veux apprendre la table de 3 cette semaine', N('je veux apprendre la table de 3 cette semaine')); return PROJETS.active().some(p => p.type === 'table' && p.param === 3); });
  await essai('le carnet de papa (affichage + suppression)', () => { MEMOIRE.addRule('Appeler Testeur « Capitaine »', 'Testeur'); renderMemory(); const a = /Capitaine/.test(document.getElementById('s-rules').textContent); const i = MEMOIRE.data().rules.findIndex(r => /Capitaine/.test(r.text)); document.querySelector(`#s-rules [data-unrule="${i}"]`).click(); return a && !MEMOIRE.data().rules.some(r => /Capitaine/.test(r.text)) && !document.querySelector('#s-rules [data-unrule]'); });
  await essai("voix de la maison : secours par la voix du téléphone si l'ordinateur ne répond pas", async () => {
    const avant = { brain: S.settings.brain, url: S.settings.localUrl, voix: S.settings.voix, sound: S.settings.sound };
    Object.assign(S.settings, { brain: 'local', localUrl: 'http://127.0.0.1:9/v1', voix: 'maison', sound: true });
    VOIXMAISON.downUntil = 0;
    const fin = await Promise.race([vraieVoix('Test de secours.').then(() => 'fini'), wait(9000).then(() => 'bloqué')]);
    const secours = VOIXMAISON.downUntil > Date.now();
    Object.assign(S.settings, avant); VOIXMAISON.downUntil = 0;
    return fin === 'fini' && secours;
  });
  await essai("oreilles : relais par celles de la maison quand Groq atteint sa limite", async () => {
    const avant = { brain: S.settings.brain, url: S.settings.localUrl, key: S.settings.key, cool: S.settings.sttCool };
    Object.assign(S.settings, { brain: 'local', localUrl: 'http://maison.test/v1', key: 'gsk_banc', sttCool: 0 });
    const vf = AI._fetch, vfetch = window.fetch; let maison = 0;
    AI._fetch = async () => { const e = new Error('Erreur 429'); e.status = 429; e.retryAfter = 600; throw e; };
    window.fetch = async (u, o) => { if (/\/shadow\/oreilles/.test(u)) { maison++; return new Response(JSON.stringify({ text: ' Shadow, on joue ?', segments: [{ text: ' Shadow, on joue ?', avg_logprob: -0.2, no_speech_prob: 0.01 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }); } return vfetch(u, o); };
    let t = '';
    try { t = await AI.transcribe(new Blob(['x'], { type: 'audio/wav' })); } finally { AI._fetch = vf; window.fetch = vfetch; }
    const ok2 = maison === 1 && /on joue/.test(t) && S.settings.sttCool > Date.now();
    Object.assign(S.settings, { brain: avant.brain, localUrl: avant.url, key: avant.key, sttCool: avant.cool });
    return ok2;
  });
  await essai('mémoire partagée : fusion, oublis et même personne sur deux appareils', () => {
    const T = Date.now() - 3600000, pr = k => Array.from({ length: 128 }, (_, i) => Math.sin(i + k));
    const m = SYNC.merge({ updatedAt: T, memory: { facts: [{ id: T + 1, at: T + 1, text: 'a' }, { id: T + 2, at: T + 2, text: 'b' }] }, people: [{ id: T, name: 'Léo', desc: [pr(0)] }], tomb: {} },
      { updatedAt: T + 5, memory: { facts: [{ id: T + 3, at: T + 3, text: 'c' }] }, people: [{ id: T + 9, name: 'leo', desc: [pr(1)] }], tomb: { 'memory.facts': { [T + 1]: T + 50 } } });
    return m.memory.facts.map(f => f.text).join('') === 'bc' && m.people.length === 1 && m.people[0].desc.length === 2;
  });
  await essai('Pokémon : reconnaît les noms (même mal écrits) et ouvre la bonne fiche', () => {
    const ok1 = POKEMON.findIn('parle-moi de Pikatchou').id === 25 && POKEMON.findIn('c est quoi dracofeu').id === 6 && !POKEMON.findIn("j'ai mangé une pomme", { strict: true });
    const ok2 = !!POKEMON.route('parle moi de bulbizarre', N('parle moi de bulbizarre')) && !POKEMON.route('salut shadow ça va', N('salut shadow ça va'));
    return ok1 && ok2 && /Électrik/.test(POKEMON.decrire(POKEMON.BY[25]));
  });
  await essai('rapport de systèmes', async () => { dits.length = 0; await CONSCIENCE.rapport(); return /Rapport/.test(dits.join(' ')); });
  // ---------- jeux à plusieurs, et ce qu'on lui apprend ----------
  const hb = hear, chatB = AI.chat, rireB = VISAGE.rire, readyB = AI.ready;
  VISAGE.rire = () => Promise.resolve(); AI.ready = () => true;
  const actB = window.activity; window.activity = vrai.act; // les vrais jeux, pas la version vide
  const calc = t => { const m = String(t).match(/(\d+) (plus|moins|fois) (\d+)/); if (!m) return null; const x = +m[1], y = +m[3]; return m[2] === 'plus' ? x + y : m[2] === 'moins' ? x - y : x * y; };
  await essai('jeux à plusieurs : inscription, tours, vol de question et gagnant', async () => {
    dits.length = 0; S.ensemble = null; let k = 0, q = '';
    hear = async () => { await wait(5); const l = dits[dits.length - 1] || ''; if (/grand ou un enfant/.test(l)) return 'une enfant'; if (/À toi/.test(l)) { k++; q = l; return k === 2 ? '1000' : String(calc(l)); } if (/Qui d'autre/.test(l)) return `Maman ${calc(q)}`; return 'non'; };
    await Promise.race([handle('on joue avec papa, maman et Léa au calcul'), wait(20000)]);
    const t = dits.join(' | ');
    if (!(/Léa/.test(t) && /Bien volé, Maman/.test(t) && /gagnant|Égalité/.test(t) && S.ensemble.parties === 1 && S.ensemble.joueurs.length === 4)) throw new Error(t.slice(0, 300));
    return true;
  });
  await essai('apprendre un jeu, puis y jouer (maître du jeu)', async () => {
    dits.length = 0; S.jeuxAppris = []; let mj = 0;
    AI.chat = async m => { const sy = m[0].content; if (/INCONNU/.test(sy)) return 'INCONNU'; if (/Réécris les règles/.test(sy)) return 'Chacun dit un animal qui commence par la dernière lettre du précédent. Le premier à deux points gagne.'; if (/maître du jeu/.test(sy)) return ++mj === 1 ? 'À toi, Testeur, un animal en T ! [[ecoute]]' : '[[point:Testeur]] Bravo, Testeur a gagné ! [[fin:Testeur]]'; return ''; };
    const r = ['La chaîne des animaux', 'on dit un animal qui commence par la dernière lettre', "c'est tout", 'deux points', 'oui', 'oui', 'seul', 'tigre', 'non']; let i = 0;
    hear = async () => { await wait(5); return r[i++] || 'non'; };
    await Promise.race([handle("je vais t'apprendre un jeu"), wait(20000)]);
    const j = APPRENDRE.cherche(N('on joue à la chaîne des animaux'));
    if (!(j && /premier à deux points/.test(j.regles) && /Testeur a gagné/.test(dits.join(' ')))) throw new Error(dits.join(' | ').slice(0, 300));
    return true;
  });
  await essai('devinette apprise : il la retient et la pose ensuite', async () => {
    dits.length = 0; S.devAppris = [];
    AI.chat = async () => 'une baleine';
    const r = ['Je suis jaune et je chauffe la Terre. Qui suis-je ?', 'non', "c'est le soleil"]; let i = 0;
    hear = async () => { await wait(5); return r[i++] || 'non'; };
    await Promise.race([handle("j'ai une devinette pour toi"), wait(10000)]);
    const d = JEUX.DEVINETTES.find(x => /chauffe la Terre/.test(x.q));
    if (!(d && JEUX.matches('le soleil', d.r))) throw new Error(dits.join(' | ').slice(0, 300));
    return true;
  });
  await essai('mémoire partagée : les jeux appris voyagent', () => {
    const a = { updatedAt: 1, jeuxAppris: [{ id: 1, nom: 'Ni oui ni non', regles: 'v1', at: 1 }] };
    const b = { updatedAt: 2, jeuxAppris: [{ id: 1, nom: 'Ni oui ni non', regles: 'v2', at: 5 }, { id: 2, nom: 'Le petit bac', regles: 'x', at: 2 }] };
    const m = SYNC.merge(a, b);
    return m.jeuxAppris.length === 2 && m.jeuxAppris.find(x => x.id === 1).regles === 'v2';
  });
  hear = hb; AI.chat = chatB; VISAGE.rire = rireB; AI.ready = readyB; window.activity = actB;

  // ---------- on remet tout en place ----------
  Object.assign(AI, { ready: vrai.ready, chatStream: vrai.stream, chat: vrai.chat });
  ECRAN.savoir = vrai.savoir; CONSCIENCE.lookAndAnswer = vrai.look; window.activity = vrai.act;
  ok('aucune erreur pendant le banc', !erreurs.length, erreurs.slice(0, 3).join(' | '));
  try { localStorage.removeItem('shadow-banc'); localStorage.removeItem('shadow-banc-boot'); } catch (e) { /* rien */ }

  // ---------- le résultat ----------
  const rates = res.filter(r => !r.ok);
  window.__BANC_RESULT = { total: res.length, rates: rates.length, details: res };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:12px;z-index:999;overflow:auto;background:#0a1124;color:#eef3ff;border:2px solid ' + (rates.length ? '#ff6b6b' : '#3ddc84') + ';border-radius:16px;padding:16px;font:15px/1.45 sans-serif';
  box.innerHTML = `<h2 style="margin:0 0 10px">Banc d'essai v${window.SHADOW_VERSION} : ${rates.length ? `❌ ${rates.length} problème${rates.length > 1 ? 's' : ''}` : '✅ tout est bon'} (${res.length} essais)</h2>`
    + res.map(r => `<div>${r.ok ? '✅' : '❌'} ${esc(r.nom)}${r.info ? ` <small style="color:#9fb0d9">— ${esc(r.info)}</small>` : ''}</div>`).join('');
  document.body.appendChild(box);
})();
