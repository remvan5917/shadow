/* =========================================================
   SHADOW — les jeux à plusieurs (toute la famille)
   Shadow devient le maître du jeu :
   - il inscrit les joueurs (« on joue à plusieurs », « on joue avec papa et maman ») ;
   - il sait qui est un grand et qui est un enfant : les grands ont des questions plus dures
     (calcul de grand, quiz sans les choix) et un seul essai, les enfants un indice et deux essais ;
   - chacun son tour (« À toi, maman ! »), un tableau des scores à l'écran ;
   - une question ratée peut être « volée » : « Qui d'autre ? Ton prénom, puis ta réponse ! » ;
   - à la fin : le podium, la question de départage en cas d'égalité, et il retient les victoires.
   Jeux : quiz, calcul, devinettes, Pokémon, et l'histoire inventée à plusieurs.
   ========================================================= */
'use strict';

const ENSEMBLE = (() => {
  const GRANDS = /^(papa|maman|mamie|mami|mamy|papi|papy|tonton|tata|tatie|tante|oncle|grand pere|grand mere|parrain|marraine|daddy|mamounette)$/;
  const COULEURS = ['#59c8ff', '#ffb547', '#3ddc84', '#ff6b9a', '#b18cff', '#ffe066'];
  const NOMBRES = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
  const JEUX_NOMS = { quiz: 'Quiz', calcul: 'Calcul', devinette: 'Devinettes', pokemon: 'Quiz Pokémon', histoire: 'Histoire à plusieurs' };
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // « Du bambou » → « du bambou » au milieu d'une phrase (les noms propres gardent leur majuscule)
  const minus = t => (/^(Le|La|Les|Un|Une|Des|Du|De|À|Au|Aux|En|Sur|Dans|Pour|Avec)(?=\s|$)/.test(t) || /^L['’]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  const FIN_LISTE = /^(c est tout|c est bon|non|non merci|personne|plus personne|on est pret|on est prets|fini|termine|c est parti|on commence|on y va|ca suffit|tout le monde est la|go|voila|c est tout le monde)$/;
  const PASSE = /\b(je passe|passe|joker)\b/;

  function mem() {
    if (!S.ensemble) S.ensemble = { joueurs: [], victoires: {}, parties: 0 };
    return S.ensemble;
  }
  // en mode vidéo, aucun prénom n'est dit ni affiché (sauf « papa », « maman »…)
  let joueurs = [];
  const nomDe = j => (S.settings && S.settings.video && !GRANDS.test(N(j.nom)) ? (joueurs.indexOf(j) >= 0 ? `joueur ${joueurs.indexOf(j) + 1}` : 'un joueur') : j.nom);
  const liste = js => { const n = js.map(nomDe); return n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : n[0] || ''; };

  /* ---------- reconnaître un prénom dans une phrase ---------- */
  function connus() { return [S.prenom].concat((S.people || []).map(p => p.name), mem().joueurs.map(j => j.nom)).filter(x => x && typeof x === 'string'); }
  function nomDans(t) {
    const n = N(t)
      .replace(/^((alors|euh|bon|ben|et|ensuite|apres|aussi) )+/, '')
      .replace(/^((c est|moi c est|moi je suis|je suis|je m appelle|il s appelle|elle s appelle|c est moi|le joueur suivant c est|le suivant c est|il y a|y a) )+/, '')
      .replace(/ (qui joue|aussi|s il te plait|il joue|elle joue)$/, '')
      .trim();
    if (!n) return '';
    if (/^(moi|moi meme)$/.test(n)) return currentWho() || S.prenom || '';
    const k = connus().find(x => N(x) === n);
    if (k) return k;
    const mots = n.split(' ');
    if (mots.length > 3 || mots.some(w => w.length > 14)) return '';
    // on garde l'orthographe entendue (accents compris) : les derniers mots de la phrase
    const brut = String(t).replace(/[.,!?;:«»"]/g, ' ').split(/[\s'’]+/).filter(Boolean);
    return brut.slice(-mots.length).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function grandOuPas(nom) {
    if (GRANDS.test(N(nom))) return true;
    if (S.prenom && N(nom) === N(S.prenom)) return false;
    const deja = mem().joueurs.find(j => N(j.nom) === N(nom));
    return deja ? deja.grand : null;
  }
  // « papa, maman et Léa » (les virgules disparaissent souvent à l'écoute : « papa maman et lea »)
  function decoupe(liste) {
    const gens = connus().map(x => N(x));
    const out = [];
    liste.split(/,| et /).map(x => x.trim()).filter(Boolean).forEach(b => {
      const ws = b.split(' ');
      if (ws.length > 1 && ws.every(w => GRANDS.test(w) || gens.includes(w))) out.push(...ws); else out.push(b);
    });
    return out;
  }
  // « on joue avec papa et maman » → [moi, papa, maman]
  function depuisPhrase(n, text) {
    const m = n.match(/\bavec (.+)$/);
    if (!m) return null;
    const morceaux = decoupe(m[1].replace(/\b(au|a la|aux|a une|a un) (quiz|calcul|devinettes?|pokemon|histoire).*$/, ''));
    if (!morceaux.length || morceaux.length > 5) return null;
    // on retrouve l'orthographe d'origine (« Léa » et pas « Lea ») dans la phrase entendue
    const brut = String(text || '').replace(/[.,!?;:«»"]/g, ' ').split(/[\s'’]+/).filter(Boolean);
    const original = x => {
      const k = x.split(' ').length;
      for (let i = 0; i + k <= brut.length; i++) { const w = brut.slice(i, i + k).join(' '); if (N(w) === x) return w; }
      return x;
    };
    const noms = morceaux.map(x => nomDans(original(x))).filter(Boolean);
    if (noms.length !== morceaux.length) return null;
    const moi = currentWho() || S.prenom;
    return (moi ? [moi] : []).concat(noms.filter(x => !moi || N(x) !== N(moi)));
  }

  /* ---------- écouter (avec arrêt, répétition et silences) ---------- */
  let silences = 0;
  async function ecoute(texte, { prompt = '', ms = 20000, redire = true } = {}) {
    let ligne = texte;
    for (let essai = 0; ; essai++) {
      if (ligne) await say(ligne);
      const a = await hear({ prompt, maxWait: ms });
      if (a === null) { ligne = texte; continue; } // on a touché l'écran : il répète
      if (!a) {
        if (!redire || essai >= 1) { if (++silences >= 3) throw new Stop('silence'); return ''; }
        ligne = texte; continue;
      }
      silences = 0;
      const n = N(a);
      if (RE.stop.test(n)) throw new Stop('stop');
      if (RE.repeat.test(n)) { ligne = texte; continue; }
      return a;
    }
  }

  /* ---------- inscrire les joueurs ---------- */
  async function inscrire(text, n) {
    const m = mem();
    let noms = depuisPhrase(n, text);
    if (noms && noms.length < 2) noms = null;
    const attendu = (n.match(/\b(?:on (?:est|joue a)) (deux|trois|quatre|cinq|six|[2-6])\b/) || [])[1];
    const combien = attendu ? NOMBRES[attendu] || parseInt(attendu, 10) : 0;
    if (!noms && m.joueurs.length >= 2 && (!combien || combien === m.joueurs.length)) {
      if (await askYesNo(`On joue comme la dernière fois : ${liste(m.joueurs.map(j => ({ nom: j.nom })))} ?`)) noms = m.joueurs.map(j => j.nom);
    }
    if (!noms) {
      noms = [];
      await say(`Super, une partie à plusieurs ! Chaque joueur me dit son prénom, l'un après l'autre. Quand tout le monde est là, dites « c'est tout ».`);
      while (noms.length < 6) {
        const q = noms.length ? 'Joueur suivant ?' : 'Premier joueur, comment tu t\'appelles ?';
        const a = await ecoute(q, { prompt: connus().concat(['Papa', 'Maman', "C'est tout"]).join(', '), ms: 12000 });
        if (!a) { if (noms.length >= 2) break; continue; }
        if (FIN_LISTE.test(N(a)) || /\bc est tout\b/.test(N(a))) { if (noms.length >= 2) break; await say('Il faut au moins deux joueurs !'); continue; }
        const nom = nomDans(a);
        if (!nom) { await say("Je n'ai pas compris le prénom. Dis juste ton prénom."); continue; }
        if (noms.some(x => N(x) === N(nom))) { await say(`${nom} est déjà inscrit !`); continue; }
        noms.push(nom);
        fx.tone([[880, 0.05], [1175, 0.08]]);
        face.flash('happy', 700);
        if (combien && noms.length >= combien) break;
      }
    }
    const js = [];
    for (const nom of noms) {
      let grand = grandOuPas(nom);
      if (grand === null) {
        const a = await ecoute(`${nom}, tu es un grand ou un enfant ?`, { ms: 10000 });
        grand = /\b(grand|grande|adulte|parent|vieux|vieille|ado)\b/.test(N(a)) && !/\b(enfant|petit|petite)\b/.test(N(a));
      }
      js.push({ nom, grand, pts: 0, c: COULEURS[js.length % COULEURS.length] });
    }
    // les enfants commencent
    js.sort((a, b) => (a.grand === b.grand ? 0 : a.grand ? 1 : -1));
    js.forEach((j, i) => { j.c = COULEURS[i % COULEURS.length]; });
    m.joueurs = js.map(j => ({ nom: j.nom, grand: j.grand }));
    save();
    return js;
  }

  /* ---------- le tableau des scores ---------- */
  function tableau(titre, actif, sous) {
    const max = Math.max(3, ...joueurs.map(j => j.pts));
    showBoard(`<div class="ens"><h3>${esc(titre)}</h3>${sous ? `<small>${esc(sous)}</small>` : ''}<ol>${joueurs.map(j => `
      <li class="${j === actif ? 'on' : ''}" style="--c:${j.c}"><b>${esc(nomDe(j))}</b><i><s style="width:${Math.round(j.pts / max * 100)}%"></s></i><em>${j.pts}</em></li>`).join('')}</ol></div>`, 'ens-board');
  }

  /* ---------- les questions de chaque jeu ---------- */
  function calcGrand() {
    const k = Math.random();
    if (k < 0.35) { const a = rnd(12, 19), b = rnd(3, 9); return { ask: `combien font ${a} fois ${b} ?`, r: a * b }; }
    if (k < 0.7) { const a = rnd(120, 480), b = rnd(35, 95); return { ask: `combien font ${a} plus ${b} ?`, r: a + b }; }
    const a = rnd(101, 300), b = rnd(27, 99); return { ask: `combien font ${a} moins ${b} ?`, r: a - b };
  }
  function fabrique(jeu, nbQuestions) {
    const quizList = jeu === 'quiz' ? JEUX.quizRound(null, Math.min(nbQuestions + 4, 60)) : [];
    const devList = jeu === 'devinette' ? JEUX.shuffle(JEUX.DEVINETTES) : [];
    let i = 0;
    return j => {
      const k = i++;
      if (jeu === 'quiz') {
        const q = quizList[k % quizList.length];
        const choix = `${q.o.map((o, x) => `${'ABC'[x]} : ${o}`).join('. ')}.`;
        return {
          texte: j.grand ? `${q.q} Pour les grands, sans les choix !` : `${q.q} ${choix}`,
          // un grand n'a pas entendu les choix : « A », « B » ou « C » au hasard ne compte pas
          check: a => quizAnswer(j.grand ? N(a).replace(/\b(a|ah|b|be|bee|c|ce|se)\b/g, ' ') : a, q) === q.c, rep: minus(q.o[q.c]), apres: q.e,
          tip: j.grand ? '' : 'Réfléchis bien, tu as encore un essai. Dis A, B ou C.',
          prompt: q.o.join(', '),
        };
      }
      if (jeu === 'calcul') {
        let q;
        if (j.grand) q = calcGrand();
        else { const sv = S.calcLevel; if (!(S.prenom && N(j.nom) === N(S.prenom))) S.calcLevel = 2; q = calcQ('mix'); S.calcLevel = sv; }
        const txt = q.ask.charAt(0).toUpperCase() + q.ask.slice(1);
        return { texte: txt, check: a => JEUX.parseNumber(a) === q.r, rep: `${q.r}`, tip: q.tip ? `Petite astuce : ${q.tip}` : '', prompt: 'Un nombre.' };
      }
      if (jeu === 'devinette') {
        const d = devList[k % devList.length];
        return { texte: `Devinette ! ${d.q}`, check: a => JEUX.matches(a, d.r), rep: d.a, tip: j.grand ? '' : 'Non… Réfléchis encore !' };
      }
      if (jeu === 'pokemon') {
        const Q = POKEMON.question() || POKEMON.question();
        return { texte: Q.q, check: Q.ok, rep: Q.rep, tip: j.grand ? '' : 'Non… Encore un essai, dresseur !', prompt: Q.prompt };
      }
      return null;
    };
  }

  // qui a parlé ? on cherche le prénom d'un joueur dans la phrase
  function joueurDans(a, sauf) {
    const n = ` ${N(a)} `;
    return joueurs.find(j => j !== sauf && n.includes(` ${N(j.nom)} `)) || null;
  }

  async function unTour(j, Q, titre, sous) {
    tableau(titre, j, sous);
    const prompt = `${joueurs.map(x => x.nom).join(', ')}. ${Q.prompt || ''}`;
    let ligne = `À toi, ${nomDe(j)} ! ${Q.texte}`;
    const essais = j.grand ? 1 : 2;
    for (let e = 0; e < essais; e++) {
      const a = await ecoute(ligne, { prompt, ms: 25000 });
      if (!a || RE.dontknow.test(N(a)) || PASSE.test(N(a))) break;
      if (Q.check(a)) {
        j.pts++; fx.ok(); face.flash('happy', 900);
        tableau(titre, j, sous);
        await say(`${pick(['Bravo', 'Exact', 'Bien joué', 'Bonne réponse'])}, ${nomDe(j)} ! ${Q.apres || ''}`);
        return;
      }
      fx.oops(); face.flash('oops', 700);
      ligne = e + 1 < essais ? (Q.tip || 'Non… Encore un essai !') : '';
    }
    // la question peut être volée par un autre joueur
    if (joueurs.length > 1) {
      const a = await ecoute("Qui d'autre ? Ton prénom, puis ta réponse !", { prompt, ms: 7000, redire: false });
      const voleur = a ? joueurDans(a, j) : null;
      if (voleur && Q.check(a)) {
        voleur.pts++; fx.ok(); face.flash('happy', 900);
        tableau(titre, voleur, sous);
        await say(`Bien volé, ${nomDe(voleur)} ! C'était ${Q.rep}. ${Q.apres || ''}`);
        return;
      }
    }
    await say(`La réponse, c'était ${Q.rep}. ${Q.apres || ''}`);
  }

  async function finale(jeu, titre) {
    const nomJeu = JEUX_NOMS[jeu] || jeu;
    let max = Math.max(...joueurs.map(j => j.pts));
    let premiers = joueurs.filter(j => j.pts === max), departage = false;
    // égalité : une question de départage pour les premiers (deux fois au plus)
    for (let d = 0; d < 2 && premiers.length > 1 && max > 0 && jeu !== 'histoire'; d++) {
      departage = true;
      await say(`Égalité entre ${liste(premiers)} ! Question de départage !`);
      const poser = fabrique(jeu, premiers.length);
      for (const j of premiers) await unTour(j, poser(j), titre, 'Départage');
      max = Math.max(...joueurs.map(j => j.pts));
      premiers = joueurs.filter(j => j.pts === max);
    }
    tableau(`${titre} · résultat`, premiers.length === 1 ? premiers[0] : null);
    face.set('happy'); fx.confetti(70);
    const m = mem();
    m.parties = (m.parties || 0) + 1;
    if (!m.victoires) m.victoires = {};
    if (premiers.length === 1) {
      m.victoires[premiers[0].nom] = (m.victoires[premiers[0].nom] || 0) + 1;
      await say(`Et le gagnant est… ${nomDe(premiers[0])}, avec ${max} point${max > 1 ? 's' : ''} ! Ha ha ! Bravo, champion !`);
    } else {
      await say(max === 0 ? "Personne n'a marqué de point cette fois… On s'entraîne et on rejoue !" : `${departage ? 'Encore égalité !' : 'Égalité !'} ${liste(premiers)}, vous êtes tous champions !`);
    }
    const autres = joueurs.filter(j => !premiers.includes(j));
    if (autres.length) await say(`${autres.map(j => `${nomDe(j)}, ${j.pts} point${j.pts > 1 ? 's' : ''}`).join(' ; ')}. Bien joué à tous !`);
    save();
    const scores = joueurs.map(j => `${j.nom} ${j.pts}`).join(', ');
    MEMOIRE.event(`Partie de ${nomJeu.toLowerCase()} à plusieurs : ${scores}.${premiers.length === 1 ? ` Gagnant : ${premiers[0].nom}.` : ' Égalité.'}`);
    const enfant = joueurs.find(j => S.prenom && N(j.nom) === N(S.prenom));
    logAct('ensemble', nomJeu, enfant ? enfant.pts : 0, Math.max(1, max));
  }

  /* ---------- l'histoire inventée à plusieurs ---------- */
  const DEBUTS = [
    "Il était une fois un petit robot qui avait perdu sa vis préférée au fond du jardin.",
    "Un matin, un dragon tout vert frappa à la porte de la maison. Il avait très faim… de crêpes !",
    "Dans une forêt magique vivait un écureuil qui savait parler aux étoiles.",
    "Ce jour-là, la Lune décida de descendre sur Terre pour aller à l'école.",
  ];
  async function cerveau(consigne, histoire) {
    if (!AI.ready()) return '';
    try {
      const t = await AI.chat([
        { role: 'system', content: `${CERVEAU.persona()} Tu animes une histoire inventée à plusieurs, en famille, pour des enfants. Phrases courtes, rigolotes et douces, sans rien de méchant ni de triste. Tu gardes toutes les idées des joueurs. Pas de question, pas de liste.` },
        { role: 'user', content: `L'histoire jusqu'ici :\n${histoire.join(' ')}\n\n${consigne}` },
      ], { maxTokens: 160, temperature: 0.9 });
      return String(t || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    } catch (e) { return ''; }
  }
  async function histoire(titre) {
    const parts = [];
    let debut = await cerveau("Commence l'histoire en deux phrases.", []);
    if (!debut) debut = pick(DEBUTS);
    tableau(titre, null, 'Chacun invente la suite');
    await say(`On invente une histoire tous ensemble ! Je commence, puis chacun son tour ajoute la suite. ${debut}`);
    parts.push(debut);
    for (let tour = 0; tour < 2; tour++) {
      for (const j of joueurs) {
        tableau(titre, j, 'Chacun invente la suite');
        const a = await ecoute(`À toi, ${nomDe(j)} ! Que se passe-t-il ensuite ?`, { ms: 30000 });
        if (a && !PASSE.test(N(a)) && !RE.dontknow.test(N(a))) {
          parts.push(a.charAt(0).toUpperCase() + a.slice(1).replace(/([^.!?])$/, '$1.'));
          j.pts++;
          face.flash('happy', 800);
          await say(pick(['Oh, quelle idée !', 'Génial !', 'Ha ha, trop drôle !', 'Ouh, la suite !']));
        } else await say("D'accord, je continue pour toi !");
      }
      const suite = await cerveau(tour === 0 ? "Continue l'histoire en une ou deux phrases, en reprenant les idées des joueurs." : "Écris la fin de l'histoire en deux ou trois phrases, une belle fin joyeuse.", parts);
      const fin = suite || (tour === 0 ? 'Et là, tout le monde éclata de rire !' : 'Et ils vécurent tous heureux, avec plein de rires et de crêpes. Fin !');
      parts.push(fin);
      await say(fin);
    }
    showBoard(`<div class="ens ens-histoire"><h3>${esc(titre)}</h3><p>${esc(anonymize(parts.join(' ')))}</p></div>`, 'ens-board');
    if (await askYesNo('Je vous relis toute votre histoire ?')) await say(parts.join(' '));
    face.set('happy'); fx.confetti(50);
    await say('Bravo à tous, vous êtes de vrais écrivains !');
    MEMOIRE.event(`Histoire inventée à plusieurs (${joueurs.map(j => j.nom).join(', ')}) : ${parts.join(' ').slice(0, 220)}`);
    logAct('ensemble', JEUX_NOMS.histoire, 1, 1);
  }

  /* ---------- une partie ---------- */
  function quelJeu(n) {
    if (/\bpokemon/.test(n)) return 'pokemon';
    if (/\b(histoire|conte|raconte)/.test(n)) return 'histoire';
    if (/\bdevinette/.test(n)) return 'devinette';
    if (/\b(calcul|maths?|addition|multiplication|tables?)\b/.test(n)) return 'calcul';
    if (/\b(quiz|quizz|questions?)\b/.test(n)) return 'quiz';
    return '';
  }
  async function partie(text) {
    const n = N(text || '');
    silences = 0;
    joueurs = await inscrire(text || '', n);
    await say(`C'est parti ! Les joueurs : ${liste(joueurs)}.${quelJeu(n) !== 'histoire' && joueurs.some(j => j.grand) && joueurs.some(j => !j.grand) ? ' Les grands ont des questions plus dures, et un seul essai !' : ''}`);
    let jeu = quelJeu(n);
    for (;;) {
      while (!jeu) {
        const a = await ecoute('À quoi on joue ? Quiz, calcul, devinettes, Pokémon, ou une histoire à plusieurs ?', { prompt: 'Quiz, calcul, devinettes, Pokémon, histoire.', ms: 15000 });
        jeu = quelJeu(N(a));
        if (!jeu && a) await say("Je n'ai pas compris.");
      }
      joueurs.forEach(j => { j.pts = 0; });
      const titre = JEUX_NOMS[jeu];
      dlg.state = 'activity';
      if (jeu === 'histoire') await histoire(titre);
      else {
        const tours = (() => { const m = n.match(/\b(deux|trois|quatre|cinq|six|[2-9]|10) tours?\b/); return m ? NOMBRES[m[1]] || parseInt(m[1], 10) : 3; })();
        const poser = fabrique(jeu, tours * joueurs.length);
        await say(`${titre} ! ${tours} questions chacun. Et si quelqu'un se trompe, les autres peuvent voler la question !`);
        for (let t = 0; t < tours; t++) {
          for (const j of joueurs) await unTour(j, poser(j), titre, `Tour ${t + 1} sur ${tours}`);
          if (t < tours - 1) await say(t === tours - 2 ? 'Dernier tour !' : `Fin du tour ${t + 1} !`);
        }
        await finale(jeu, titre);
      }
      if (!(await askYesNo('Une autre partie ?'))) { hideBoard(); return say(pick(["C'était trop bien de jouer avec vous !", 'Merci pour la partie, la famille !'])); }
      jeu = '';
    }
  }

  // « qui a gagné le plus de parties ? »
  function palmares() {
    const v = mem().victoires || {};
    const l = Object.keys(v).sort((a, b) => v[b] - v[a]);
    if (!l.length) return say("On n'a pas encore fait de partie à plusieurs. Dis « on joue à plusieurs » !");
    const montre = x => (S.settings && S.settings.video && !GRANDS.test(N(x)) ? 'mon ami' : x);
    return say(`Les victoires : ${l.slice(0, 5).map(x => `${montre(x)}, ${v[x]}`).join(' ; ')}. En tout, ${mem().parties || 0} partie${(mem().parties || 0) > 1 ? 's' : ''} à plusieurs !`);
  }

  const R = {
    debut: /\b(a plusieurs|en famille|tous ensemble|toute la famille|on est (deux|trois|quatre|cinq|six|plusieurs|[2-6])|on joue a (deux|trois|quatre|cinq|six|[2-6])|jeu de groupe|tournoi)/,
    jeu: /\b(jou\w*|jeu|partie|tournoi|quiz|quizz|calcul|devinettes?|histoire|pokemon|defi)\b/,
    palmares: /\b(palmares|classement|qui a gagne le plus|qui gagne le plus|qui est le champion|combien de victoires)\b/,
  };
  function route(text, n) {
    if (R.palmares.test(n)) return palmares;
    if (R.debut.test(n) && R.jeu.test(n) && !/\b(tout seul|seul)\b/.test(n)) return () => activity(() => partie(text));
    // « on joue avec papa et maman » : seulement si ce sont des gens connus (pas « avec mon ballon »)
    const m = n.match(/\bon (?:joue|fait une partie|fait un jeu)\b.* avec (.+)$/);
    if (m) {
      const bouts = decoupe(m[1].replace(/\b(au|a la|aux|a une|a un) .*$/, ''));
      const gens = connus().map(x => N(x));
      // un prénom : un seul mot, sans « mon », « le »… (« avec mon ballon », « avec lui » ne comptent pas)
      const prenom = b => GRANDS.test(b) || gens.includes(b) || (/^[a-z-]{2,14}$/.test(b) && !/^(lui|elle|eux|toi|moi|nous|vous|ca|cela|tout|rien|moi meme)$/.test(b));
      if (bouts.length && bouts.every(prenom)) return () => activity(() => partie(text));
    }
    return null;
  }

  // pour les jeux appris (apprendre.js)
  async function equipe(text) { joueurs = await inscrire(text || '', N(text || '')); return joueurs; }
  function solo(nom) { joueurs = [{ nom: nom || 'toi', grand: false, pts: 0, c: COULEURS[0] }]; return joueurs; }
  function victoire(nom) {
    const m = mem(); m.parties = (m.parties || 0) + 1; if (!m.victoires) m.victoires = {};
    if (nom) m.victoires[nom] = (m.victoires[nom] || 0) + 1;
    save();
  }
  return {
    route, partie, palmares, equipe, solo, victoire, tableau, ecoute, liste, nomDe, joueurDans,
    joueurs: () => joueurs, GRANDS, _nomDans: nomDans, _depuisPhrase: depuisPhrase,
  };
})();
