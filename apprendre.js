/* =========================================================
   SHADOW — on lui apprend des choses (et de nouveaux jeux)
   - « Je vais t'apprendre un jeu » : il demande le nom du jeu, écoute les règles
     (en plusieurs fois, jusqu'à « c'est tout »), demande comment on gagne, puis redit
     les règles avec ses mots et vérifie qu'il a bien compris. S'il connaît déjà un peu
     le jeu (le petit bac, ni oui ni non…), il propose ses règles et on corrige.
   - « On joue au … » : il devient le maître du jeu de ce jeu appris (seul avec lui ou à
     plusieurs), avec les tours, les points et le tableau des scores. Il faut le grand cerveau.
   - « J'ai une devinette pour toi » : il essaie de la deviner, puis il la retient
     et la posera à toute la famille (même sans Internet).
   - « Je vais t'apprendre quelque chose » : il le range dans sa mémoire.
   Tout ce qu'on lui apprend est partagé entre les appareils (mémoire partagée).
   ========================================================= */
'use strict';

const APPRENDRE = (() => {
  const jeux = () => (S.jeuxAppris = S.jeuxAppris || []);
  const devs = () => (S.devAppris = S.devAppris || []);
  const FIN = /^(c est tout|c est fini|fini|j ai fini|termine|voila|voila c est tout|c est bon|c est tout pour les regles|rien d autre|non c est tout)$/;
  const DET = /^(le|la|les|l|un|une|des|du|de|d|au|aux|a|en|et)$/;
  const propre = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\[\[[^\]]*\]\]/g, '').trim();
  const qui = () => currentWho() || S.prenom || 'la famille';

  // « le jeu du ni oui ni non » → « Ni oui ni non »
  function nomPropre(raw) {
    let t = String(raw || '').replace(/[«»"!?.]/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^(alors |euh |bon )*/i, '').replace(/^(c['’]est |il s['’]appelle |ça s['’]appelle |ca s['’]appelle |on l['’]appelle |le nom c['’]est )/i, '');
    t = t.replace(/^(le |un )?(nouveau )?jeu (qui s['’]appelle |du |de la |des |de l['’]|d['’])?/i, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  // un jeu appris dont le nom est dans la phrase
  // (les petits mots « la », « des »… ne comptent pas : « on joue à la chaîne des animaux »)
  const sansPetitsMots = t => t.split(' ').filter(w => w && !DET.test(w)).join(' ');
  function cherche(n) {
    const p = ` ${sansPetitsMots(n)} `;
    return jeux().find(j => {
      const k = sansPetitsMots(N(j.nom));
      return k.length >= 3 && p.includes(` ${k} `);
    }) || null;
  }

  async function cerveau(sys, user, maxTokens = 300) {
    if (!AI.ready()) return '';
    try { return propre(await AI.chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens, temperature: 0.5 })); } catch (e) { return ''; }
  }

  /* ---------- apprendre un jeu ---------- */
  async function apprendreJeu(text) {
    const n = N(text || '');
    const ecoute = ENSEMBLE.ecoute;
    face.set('happy');
    let nom = '';
    const m = String(text || '').match(/jeu\s+(?:qui s['’]appelle\s+|du\s+|de la\s+|des\s+|de l['’]|d['’])(.+)$/i);
    if (m) nom = nomPropre(m[1]);
    if (!nom) nom = nomPropre(await ecoute("Super, j'adore apprendre de nouveaux jeux ! Comment il s'appelle, ce jeu ?", { ms: 15000 }));
    if (!nom) return say("Je n'ai pas entendu le nom du jeu. Redis-moi « je vais t'apprendre un jeu » quand tu veux !");
    let jeu = jeux().find(j => N(j.nom) === N(nom));
    if (jeu && !(await askYesNo(`Je connais déjà « ${jeu.nom} » ! Tu veux changer ses règles ?`))) return say(`D'accord ! Dis « on joue à ${jeu.nom} » quand vous voulez.`);

    let regles = '', brut = '';
    // il connaît peut-être déjà un peu ce jeu
    const connu = await cerveau(
      "Tu aides un robot de compagnie pour enfants. Si tu connais vraiment ce jeu pour enfants (jeu de société, de récréation ou de voiture), résume ses règles en 3 à 5 phrases simples, pour y jouer seulement à la voix, sans plateau ni écran. Si tu ne le connais pas avec certitude, réponds exactement : INCONNU.",
      `Le jeu : « ${nom} »`);
    if (connu && !/INCONNU/i.test(connu) && connu.length > 40) {
      if (await askYesNo(`Je crois que je connais un peu « ${nom} » ! ${connu} C'est comme ça que vous jouez ?`)) regles = connu;
      else await say("D'accord, alors explique-moi vos règles à vous !");
    }
    if (!regles) {
      const morceaux = [];
      let ligne = `Explique-moi les règles de « ${nom} », comme à un copain : comment on commence, ce que chacun doit faire à son tour… Tu peux parler en plusieurs fois. Quand tu as fini, dis « c'est tout ».`;
      for (let i = 0; i < 12; i++) {
        const a = await ecoute(ligne, { ms: 30000, redire: i === 0 });
        if (!a) { if (morceaux.length) break; continue; }
        if (FIN.test(N(a))) break;
        morceaux.push(a.replace(/\s*c['’]est tout\.?$/i, ''));
        fx.tone([[880, 0.05]]);
        if (/\bc est tout$/.test(N(a))) break;
        ligne = pick(['Oui… Et ensuite ?', "D'accord… Et après ?", 'Je note… Encore ?', 'Hmm hmm… Et puis ?']);
      }
      if (!morceaux.length) return say("Je n'ai rien entendu. On réessaiera !");
      brut = morceaux.join(' ');
      const gagne = await ecoute('Et comment on gagne ?', { ms: 20000 });
      if (gagne && !RE.dontknow.test(N(gagne))) brut += ` Pour gagner : ${gagne}`;
      regles = brut;
      // il redit les règles avec ses mots, pour vérifier qu'il a compris
      for (let essai = 0; essai < 3; essai++) {
        const clair = await cerveau(
          "Tu aides un robot de compagnie pour enfants à retenir un jeu que la famille lui explique à l'oral. Réécris les règles de façon claire et complète, en 3 à 6 phrases simples (début de partie, ce qu'on fait à chaque tour, comment on gagne). Garde exactement les idées de la famille, n'ajoute rien d'important. Si quelque chose manque, choisis la solution la plus simple et dis-le en une phrase. Pas de liste, pas de titre.",
          `Le jeu : « ${nom} ».\nCe que la famille a expliqué : ${regles}`);
        if (!clair) break;
        if (await askYesNo(`Alors si j'ai bien compris : ${clair} C'est bien ça ?`)) { regles = clair; break; }
        const corr = await ecoute("Qu'est-ce que je dois changer ?", { ms: 30000 });
        if (!corr) { regles = clair; break; }
        regles = `${clair} Correction de la famille : ${corr}`;
      }
    }
    const item = { id: jeu ? jeu.id : Date.now(), nom, regles, brut, par: qui(), at: Date.now() };
    if (jeu) Object.assign(jeu, item); else jeux().push(item);
    save();
    MEMOIRE.event(`${item.par} a appris à Shadow le jeu « ${nom} ».`);
    face.set('happy'); fx.ok(); fx.confetti(40);
    await say(`Merci ! Maintenant je connais « ${nom} ». ${AI.ready() ? `Dis « on joue à ${nom.replace(/^(La|Le|Les|L['’])(?=[\s'’]|$)/, w => w.toLowerCase())} » quand vous voulez !` : "Pour y jouer avec vous, il me faudra mon grand cerveau."}`);
    if (AI.ready() && (await askYesNo('On essaie tout de suite ?'))) return jouer(jeux().find(j => j.id === item.id), '');
  }

  /* ---------- jouer à un jeu appris : Shadow maître du jeu ---------- */
  async function jouer(jeu, text) {
    if (!AI.ready()) return say(`Pour jouer à « ${jeu.nom} », j'ai besoin de mon grand cerveau, et il n'est pas branché. On fait un quiz ou des devinettes à la place ?`);
    const n = N(text || '');
    let js;
    if (/\b(a plusieurs|en famille|tous ensemble|on est (deux|trois|quatre|cinq|six|plusieurs|[2-6])|avec )/.test(n)) js = await ENSEMBLE.equipe(text);
    else {
      const a = await ENSEMBLE.ecoute(`« ${jeu.nom} » ! Tu joues tout seul avec moi, ou vous êtes plusieurs ?`, { ms: 12000 });
      js = /\b(plusieurs|famille|ensemble|deux|trois|quatre|cinq|six|nous|on est|avec)\b/.test(N(a)) ? await ENSEMBLE.equipe('') : ENSEMBLE.solo(qui());
    }
    const titre = jeu.nom;
    const noms = js.map(j => j.nom);
    const sys = `${CERVEAU.persona()}
Tu es le maître du jeu « ${jeu.nom} », un jeu que ${jeu.par || 'la famille'} t'a appris. Ses règles :
${jeu.regles}
Joueurs : ${js.map(j => `${ENSEMBLE.nomDe(j)} (${j.grand ? 'un grand' : 'un enfant'})`).join(', ')}. Si les règles le permettent, tu joues aussi, honnêtement.
Tout se passe à la voix : tu parles, puis un joueur te répond. À chaque message : une à trois phrases courtes à dire à voix haute (pas de liste, pas d'émoji), puis une balise :
[[ecoute]] quand tu attends une réponse (dis clairement à qui c'est le tour) ;
[[fin:Prénom]] quand la partie est finie, avec le prénom du gagnant (ou [[fin:egalite]], ou [[fin:]] s'il n'y a pas de gagnant).
Pour donner un point à quelqu'un, ajoute [[point:Prénom]].
Respecte exactement les règles apprises ; si une règle manque, choisis le plus simple et dis-le. Sois juste et gentil, encourage tout le monde, et garde la partie courte (dix minutes au plus). Tu ne vois pas les joueurs : fais-leur confiance quand ils disent ce qu'ils font. Si on veut arrêter, termine avec [[fin:]].`;
    const hist = [{ role: 'system', content: sys }, { role: 'user', content: 'La partie commence. Rappelle le but du jeu en une phrase, puis lance le premier tour.' }];
    ENSEMBLE.tableau(titre, null, js.length > 1 ? 'Jeu appris' : 'Toi contre moi');
    let fin = null, rates = 0;
    for (let tour = 0; tour < 50 && fin === null; tour++) {
      let rep = '';
      try { rep = String(await AI.chat(hist.length > 26 ? [hist[0]].concat(hist.slice(-24)) : hist, { maxTokens: 260, temperature: 0.7 }) || ''); } catch (e) { rep = ''; }
      rep = rep.replace(/<think>[\s\S]*?<\/think>/g, '');
      if (!rep.trim()) { if (++rates >= 2) { face.set('oops'); return say("Mon grand cerveau ne répond plus… On rejouera plus tard !"); } continue; }
      rates = 0;
      hist.push({ role: 'assistant', content: rep });
      let actif = null;
      (rep.match(/\[\[point:([^\]]*)\]\]/g) || []).forEach(t => {
        const nm = N(t.slice(8, -2));
        const j = js.find(x => N(x.nom) === nm || N(ENSEMBLE.nomDe(x)) === nm);
        if (j) { j.pts++; actif = j; fx.ok(); }
      });
      const f = rep.match(/\[\[fin:?([^\]]*)\]\]/);
      const dit = propre(rep);
      if (!actif) actif = js.find(j => ` ${N(dit)} `.includes(` ${N(ENSEMBLE.nomDe(j))} `)) || null;
      ENSEMBLE.tableau(titre, actif, js.length > 1 ? 'Jeu appris' : 'Toi contre moi');
      if (dit) await say(dit);
      if (f) { fin = f[1].trim(); break; }
      const a = await ENSEMBLE.ecoute('', { prompt: noms.join(', '), ms: 30000 });
      hist.push({ role: 'user', content: a ? `On entend : « ${a} »` : '(personne ne répond)' });
    }
    // la fin de la partie
    const gagnant = fin && !/egalite/i.test(N(fin)) ? js.find(j => N(j.nom) === N(fin) || N(ENSEMBLE.nomDe(j)) === N(fin)) : null;
    ENSEMBLE.victoire(gagnant ? gagnant.nom : '');
    ENSEMBLE.tableau(`${titre} · résultat`, gagnant);
    face.set('happy'); fx.confetti(gagnant ? 60 : 30);
    MEMOIRE.event(`Partie de « ${jeu.nom} » (${noms.join(', ')})${gagnant ? `, gagnée par ${gagnant.nom}` : ''}.`);
    const enfant = js.find(j => S.prenom && N(j.nom) === N(S.prenom));
    logAct('ensemble', jeu.nom, enfant ? enfant.pts : 0, Math.max(1, ...js.map(j => j.pts)));
    if (await askYesNo(`Une autre partie de « ${jeu.nom} » ?`)) return jouer(jeu, js.length > 1 ? 'a plusieurs' : '');
    hideBoard();
    return say('Merci de m\'avoir appris ce jeu, c\'était trop bien !');
  }

  /* ---------- les devinettes qu'on lui apprend ---------- */
  function motsCles(rep) {
    const ws = N(rep).split(' ').filter(w => w.length >= 3 && !DET.test(w) && !/^(c est|est|c|ce|cest|reponse|une|des|les)$/.test(w));
    return ws.length ? ws.slice(-2) : [N(rep)];
  }
  // elles rejoignent les devinettes de Shadow (et marchent sans Internet)
  function injecte() {
    const deja = new Set(JEUX.DEVINETTES.map(d => d.q));
    devs().forEach(d => { if (d.q && !deja.has(d.q)) JEUX.DEVINETTES.push({ q: d.q, a: d.a, r: d.r, de: d.par }); });
  }
  async function apprendreDevinette() {
    const ecoute = ENSEMBLE.ecoute;
    face.set('listen');
    const q = await ecoute('Oh oui, une devinette ! Vas-y, je t\'écoute.', { ms: 30000 });
    if (!q) return say("Je n'ai pas entendu la devinette. On réessaiera !");
    let reponse = '';
    // il essaie de deviner, avec son grand cerveau
    const essai = await cerveau('Tu es un robot de compagnie qui joue aux devinettes avec un enfant. Réponds seulement par ta réponse, en deux à quatre mots (par exemple : « une banane »).', q, 30);
    if (essai) {
      face.set('think'); await say('Hmm… Laisse-moi réfléchir…');
      if (await askYesNo(`Je dirais… ${essai.replace(/[.!]+$/, '')} ?`)) { reponse = essai.replace(/[.!]+$/, ''); face.set('happy'); fx.ok(); await say('Youpi, trouvé !'); }
      else { face.flash('oops'); await say('Raté ! Je donne ma langue au chat.'); }
    }
    if (!reponse) reponse = await ecoute(essai ? "C'était quoi, la réponse ?" : 'Et quelle est la réponse ?', { ms: 20000 });
    if (!reponse || RE.dontknow.test(N(reponse)) || /^(oui|non|ouais|bof)$/.test(N(reponse))) return say("Tant pis, je ne connais pas la réponse !");
    reponse = reponse.replace(/^(c['’]est |la réponse c['’]est |la reponse c['’]est )/i, '');
    const d = { id: Date.now(), q: q.replace(/\s*$/, '').replace(/([^?])$/, '$1 ?'), a: reponse, r: motsCles(reponse), par: qui() };
    if (!devs().some(x => N(x.q) === N(d.q))) { devs().push(d); save(); injecte(); }
    MEMOIRE.event(`${d.par} a appris une devinette à Shadow (réponse : ${reponse}).`);
    face.set('happy');
    await say(`Elle est trop bien ! Je la retiens, et je la poserai à toute la famille !`);
  }

  /* ---------- lui apprendre quelque chose ---------- */
  async function apprendreChose() {
    const a = await ENSEMBLE.ecoute("Oh oui, j'adore apprendre ! Qu'est-ce que tu veux m'apprendre ?", { ms: 30000 });
    if (!a) return say("Je n'ai pas entendu. Tu peux aussi dire « retiens que », puis la chose à retenir.");
    if (/\bjeu\b/.test(N(a))) return apprendreJeu(a);
    if (/\bdevinette\b/.test(N(a))) return apprendreDevinette();
    return rememberThat(`retiens que ${a}`);
  }

  /* ---------- la liste, et oublier un jeu ---------- */
  function liste() {
    const l = jeux().map(j => j.nom);
    const dv = devs().length;
    if (!l.length && !dv) return say("Personne ne m'a encore appris de jeu. Dis « je vais t'apprendre un jeu » !");
    return say(`${l.length ? `Les jeux que vous m'avez appris : ${l.join(', ')}.` : "On ne m'a pas encore appris de jeu."}${dv ? ` Et ${dv} devinette${dv > 1 ? 's' : ''} de la famille !` : ''} Je connais aussi le quiz, le calcul, les devinettes, le monde des Pokémon et l'histoire à plusieurs.`);
  }
  async function oublier(n) {
    const j = cherche(n);
    if (!j) return say("Je ne connais pas ce jeu.");
    if (!(await askYesNo(`J'oublie vraiment le jeu « ${j.nom} » ?`))) return say("D'accord, je le garde !");
    tomb('jeuxAppris', j);
    S.jeuxAppris = jeux().filter(x => x !== j); save();
    return say(`C'est fait, j'ai oublié « ${j.nom} ».`);
  }

  const R = {
    jeu: /\b(je (vais|veux) t apprendre|on (va|veut) t apprendre|je t apprends|on t apprend|apprends|je (vais|veux) te montrer|on va te montrer|je te montre|tu veux apprendre|decouvrir)\b.*\bjeux?\b|\bnouveau jeu\b/,
    devinette: /\b(j ai|on a) une devinette (pour toi|a te poser)\b|\b(je (vais|veux) t apprendre|je t apprends|apprends|je te pose) une devinette\b|\bdevine ce que c est\b/,
    chose: /\b(je (vais|veux) t apprendre|je t apprends|on (va|veut) t apprendre) (quelque chose|un truc|une chose|des choses|un mot)\b/,
    liste: /\b(quels? (jeux?|sont les jeux) (tu connais|je t ai appris|on t a appris|tu sais faire)|tes jeux|les jeux (que tu connais|qu on t a appris|que je t ai appris)|a quoi tu sais jouer)\b/,
    oublier: /\boublie (le jeu|ce jeu)\b/,
    jouer: /\b(on joue|jouons|on fait une partie|on refait une partie|jouer|joue avec nous|on peut jouer)\b/,
  };
  function route(text, n) {
    // « apprends-moi un jeu », « fais-moi découvrir un jeu » : c'est l'enfant qui veut apprendre, pas Shadow
    if (/\b(apprends moi|apprend moi|tu m apprends|tu peux m apprendre|montre moi|fais moi decouvrir|tu me montres)\b/.test(n)) return null;
    if (R.oublier.test(n)) return () => oublier(n);
    if (R.liste.test(n)) return liste;
    if (R.devinette.test(n)) return () => activity(apprendreDevinette);
    if (R.chose.test(n)) return () => activity(apprendreChose);
    if (R.jeu.test(n)) return () => activity(() => apprendreJeu(text));
    const j = R.jouer.test(n) ? cherche(n) : null;
    if (j) return () => activity(() => jouer(j, text));
    return null;
  }

  setTimeout(injecte, 3000);
  setInterval(injecte, 60000); // les devinettes apprises sur un autre appareil arrivent par la mémoire partagée

  return { route, apprendreJeu, apprendreDevinette, apprendreChose, jouer, liste, cherche, injecte, _nomPropre: nomPropre };
})();
