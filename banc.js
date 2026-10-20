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
  await essai('rapport de systèmes', async () => { dits.length = 0; await CONSCIENCE.rapport(); return /Rapport/.test(dits.join(' ')); });

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
