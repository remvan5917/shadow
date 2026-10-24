/* =========================================================
   L'AVENTURE DANS LA MAISON — un jeu de piste où toute la maison joue
   Le Professeur Glitch (Atlas, sur la tablette) a piraté la maison et caché les trois morceaux du cristal
   d'énergie de la Fusée. Shadow est le coéquipier : une lampe clignote pour donner l'indice, une devinette dit
   quelle pièce c'est ; le capitaine y va (en marchant), montre la pièce à la caméra de Shadow (Mistral vérifie
   que c'est la bonne), ouvre le verrou du méchant (une énigme), et rapporte les trois cristaux à la Fusée.
   - jamais l'escalier, jamais la nuit (l'ordinateur refuse après 20 h 30) ; seulement à la maison de papa ;
   - à la fin, toutes les lampes reviennent comme avant (sauf la Fusée, rallumée : c'est la victoire).
   ========================================================= */
'use strict';

const AVENTURE = (() => {
  const INDICES = {
    'cuisine': ["Je suis la pièce où l'on prépare les repas, et où le frigo ronronne tout le temps.", "Chez moi, ça sent bon les crêpes et le chocolat chaud."],
    'salon': ["Je suis la pièce du canapé, où l'on regarde des films tous ensemble.", "Dans cette pièce, on s'installe bien au chaud sur le canapé."],
    'salle de bain': ["Ici, on se brosse les dents et on prend son bain, avec plein de mousse.", "Je suis la pièce où l'eau coule, où l'on se lave les mains avec du savon."],
    'chambre de papa': ["Je suis la chambre où dort le chef de la maison : papa !", "Dans cette chambre, il y a le grand lit de papa."],
    'lingerie': ["Ici, les chaussettes tournent, tournent et tournent dans la machine à laver.", "Je suis la pièce où le linge se lave et sèche."],
    'bureau': ["Je suis la pièce où l'on travaille, avec un ordinateur et des papiers."],
    'entrée': ["Je suis la pièce où l'on enlève ses chaussures en rentrant à la maison."],
    'couloir': ["Je suis un long passage qui relie les pièces entre elles."],
    'salle à manger': ["Je suis la pièce où l'on mange tous ensemble autour de la table."],
  };
  // ce que la vision peut répondre, et ce qui compte comme la bonne pièce
  const PAREIL = { 'chambre de papa': ['chambre'], 'lingerie': ['lingerie', 'buanderie', 'salle de bain'], 'salon': ['salon', 'salle a manger'], 'salle à manger': ['salle a manger', 'salon', 'cuisine'], 'entrée': ['entree', 'couloir'], 'couloir': ['couloir', 'entree'] };
  const MOTS = { 'cuisine': /cuisine/, 'salon': /salon/, 'salle de bain': /salle de bain|salle d eau|toilette/, 'chambre de papa': /chambre|papa/, 'lingerie': /lingerie|buanderie|machine/, 'bureau': /bureau/, 'entrée': /entree/, 'couloir': /couloir/, 'salle à manger': /salle a manger/ };
  const GLITCH = {
    debut: c => `Ha ha ha ! Ici le Professeur Glitch ! J'ai piraté Atlas et toute la maison ! J'ai caché les trois morceaux du cristal d'énergie de ta Fusée, capitaine ${c}. Tu ne les retrouveras jamais !`,
    1: () => "Quoi ? Tu as trouvé le premier morceau ? Grrr... C'était de la chance. Les autres sont bien mieux cachés !",
    2: () => "Encore un ! Impossible ! Mes circuits surchauffent ! Le dernier, tu ne l'auras pas !",
    3: () => "Non, non et non ! Les trois cristaux ! Mais tu ne sauras jamais où les ramener... Ha ha... ha ?",
    fin: c => `Nooon ! La Fusée est rechargée ! Tu m'as vaincu, capitaine ${c}... Je rends la maison à Atlas. Mais je reviendrai !`,
  };
  const r0 = () => window.SHADOW_CHEZ_PAPA !== false && typeof VOIXMAISON !== 'undefined' && VOIXMAISON.root();
  async function maison(corps) {
    const r = r0(); if (!r) throw new Error('pas de maison');
    const res = await fetch(`${r}/maison/aventure`, corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : { cache: 'no-store' });
    return res.json();
  }
  // le méchant parle sur la tablette ; Shadow attend qu'il ait fini (à peu près) avant de reprendre
  async function mechant(texte, action = 'mechant') {
    try { await maison({ action, texte }); } catch (e) { return; }
    await wait(Math.min(14000, 2500 + texte.length * 62));
  }
  const ecran = (titre, sous = '', col = '#22d3ee') => showBoard(`<div style="font-family:ui-monospace,monospace;background:radial-gradient(120% 90% at 50% 0%,#082f49,#020617 70%);border:2px solid ${col};border-radius:18px;padding:16px 20px;color:#e0f2fe;text-align:center"><div style="font-size:12px;letter-spacing:.3em;color:${col}">MISSION · LE CRISTAL DE LA FUSÉE</div><div style="font:800 26px system-ui;margin-top:8px">${titre}</div>${sous ? `<div style="margin-top:8px;font-size:15px;opacity:.85">${sous}</div>` : ''}</div>`);
  const cristaux = n => `${'◆ '.repeat(n)}${'◇ '.repeat(3 - n)}`.trim();

  // il montre la pièce à la caméra : Mistral dit quelle pièce c'est
  async function verifiePiece(piece) {
    if (!VISION.supported || !(S.settings.mistralKey || S.settings.key)) return null;
    if (!(await needEyes())) return null;
    await say("Montre-moi la pièce avec ma caméra : tourne-moi doucement autour de toi. Je regarde dans trois secondes !");
    for (const f of [523, 659, 784]) { fx.tone([[f, 0.12]]); await wait(850); }
    fx.tone([[1047, 0.08], [1319, 0.12]]); face.set('think');
    try {
      const vu = N(await AI.see(VISION.snapshot(960), "Quelle pièce d'une maison voit-on sur cette photo ? Réponds par un seul mot ou groupe de mots, parmi : cuisine, salon, salle de bain, chambre, lingerie, bureau, entrée, couloir, salle à manger, autre, flou.", { maxTokens: 12, temperature: 0 }));
      if (!vu || /flou|autre/.test(vu)) return null;
      const ok = (PAREIL[piece] || [N(piece)]).some(x => vu.includes(N(x)));
      return { ok, vu };
    } catch (e) { return null; }
  }

  async function partie() {
    const c = name();
    if (!r0()) return say("L'aventure de la maison, ça se joue chez papa : il me faut l'ordinateur de la maison pour faire clignoter les lumières !");
    let info; try { info = await maison(); } catch (e) { return say("Je n'arrive pas à joindre l'ordinateur de la maison. On jouera à l'aventure plus tard !"); }
    if (!info.possible) return say(/nuit/.test(info.raison || '') ? "Chut... la maison dort. L'aventure de la maison, c'est pendant la journée, capitaine !" : "Il me faut au moins deux pièces avec une lampe connectée pour l'aventure. Demande à papa !");
    const etapes = JEUX.shuffle(info.pieces.slice()).slice(0, 3), t0 = Date.now();
    let trouves = 0, fusee = false;
    try {
      fx.tone([[220, 0.2], [196, 0.2], [174, 0.4]]); ecran('ALERTE INTRUSION', 'le Professeur Glitch a piraté la maison', '#f43f5e'); face.set('oops');
      await say(`Alerte, alerte ! ${c}, quelqu'un a piraté la maison ! Écoute...`);
      await mechant(GLITCH.debut(c));
      face.set('happy');
      await say(`Pas de panique, capitaine ! Toi et moi, on va retrouver les ${etapes.length} morceaux du cristal. À chaque fois, une lumière va clignoter quelque part dans la maison, et je te donnerai une devinette. Règle numéro un des héros : on marche, on ne court pas ! C'est parti ?`);
      for (let k = 0; k < etapes.length; k++) {
        const p = etapes[k];
        ecran(`CRISTAL ${k + 1} SUR ${etapes.length}`, cristaux(trouves), '#22d3ee');
        await maison({ action: 'clignote', id: p.id, fois: 5 }).catch(() => {});
        await say(`Cristal numéro ${k + 1} ! Regarde bien : une lumière clignote dans la maison. Et voici la devinette : ${pick(INDICES[p.type] || [`Je suis la pièce ${p.nom}.`])} Va là-bas, et dis « j'y suis » quand tu y es !`);
        let arrive = false;
        for (let essai = 0; essai < 4 && !arrive; essai++) {
          const a = N(await ask(essai ? 'Tu y es ? Dis « j\'y suis » quand tu es dans la pièce qui clignote.' : 'Je t\'attends !', { wait: 60000, retry: 2 }));
          if (/\b(indice|aide|sais pas|sais plus|ou|perdu)\b/.test(a)) { await maison({ action: 'clignote', id: p.id, fois: 4 }).catch(() => {}); await say(`Je fais clignoter la lumière encore une fois ! Rappelle-toi : ${pick(INDICES[p.type] || [p.nom])}`); continue; }
          if (!/\b(j y suis|suis la|suis arrive|c est bon|trouve|ici|voila|oui)\b/.test(a) && !(MOTS[p.type] && MOTS[p.type].test(a))) continue;
          // la preuve : la caméra (ou, sans caméra, le nom de la pièce)
          const v = await verifiePiece(p.type);
          if (v && !v.ok && essai < 2) { face.set('think'); await say(`Hmm... on dirait plutôt ${/^(salon|couloir|bureau)/.test(v.vu) ? 'le ' : /^entree/.test(v.vu) ? "l'" : /^(cuisine|salle|chambre|lingerie|buanderie)/.test(v.vu) ? 'la ' : ''}${v.vu.replace(/^entree/, 'entrée')}. Ce n'est pas la pièce qui clignote ! Regarde bien les lumières.`); await maison({ action: 'clignote', id: p.id, fois: 4 }).catch(() => {}); continue; }
          if (!v) {
            const dit = N(await ask("Dans quelle pièce es-tu ?", { wait: 20000, retry: 1 }));
            if (MOTS[p.type] && !MOTS[p.type].test(dit) && essai < 2) { await say(`Ce n'est pas la bonne pièce, capitaine ! Rappelle-toi : ${pick(INDICES[p.type] || [p.nom])}`); continue; }
          }
          arrive = true;
        }
        if (!arrive) { await say("On fait une pause dans l'aventure. On la reprendra une autre fois, capitaine !"); return; }
        // le verrou du Professeur Glitch : une énigme
        fx.tone([[784, 0.08], [988, 0.12]]); face.set('happy');
        const d = pick(JEUX.DEVINETTES);
        ecran('LE VERROU DE GLITCH', d.q, '#a78bfa');
        let rep = ''; try { rep = await ask(`Bravo, c'est la bonne pièce ! Le cristal est là, mais le Professeur Glitch l'a enfermé avec un verrou à énigme. ${d.q}`, { wait: 25000, retry: 1 }); } catch (e) { if (e instanceof Stop && e.message !== 'silence') throw e; }
        const bon = rep && d.r.some(x => N(rep).includes(N(x)));
        trouves++;
        fx.confetti && fx.confetti(30);
        ecran(`CRISTAL ${k + 1} TROUVÉ !`, cristaux(trouves), '#4ade80');
        await say(bon ? `Oui ! C'était ${d.a} ! Le verrou s'ouvre... Tu as le cristal numéro ${k + 1} !` : `C'était ${d.a} ! Pas grave : j'ai piraté le verrou avec mes circuits. Tu as le cristal numéro ${k + 1} !`);
        await mechant(GLITCH[Math.min(3, trouves)] ? GLITCH[Math.min(3, trouves)]() : GLITCH[1]());
      }
      // la finale : rapporter les cristaux à la Fusée
      if (info.fusee) {
        ecran('DERNIÈRE ÉTAPE', 'rapporte les cristaux à la Fusée', '#fbbf24');
        await maison({ action: 'clignote', id: info.fusee.id, fois: 4 }).catch(() => {});
        let la = false;
        for (let i = 0; i < 3 && !la; i++) { const a = N(await ask(i ? 'Tu es près de ta Fusée ? Dis « j\'y suis » !' : `Les trois cristaux sont à toi ! Maintenant, rapporte-les à ta Fusée, dans ta chambre, pour la recharger. Dis « j'y suis » quand tu es à côté d'elle !`, { wait: 60000, retry: 2 })); la = /\b(j y suis|suis la|arrive|c est bon|ici|voila|oui|fusee)\b/.test(a); }
        if (!la) { await say("La Fusée t'attendra, capitaine ! On finira l'aventure plus tard."); return; }
        await say("Pose les cristaux à côté de la Fusée... Trois, deux, un... Recharge !");
        fx.tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.25], [1319, 0.5]]);
        try { await maison({ action: 'finale', texte: GLITCH.fin(c) }); fusee = true; } catch (e) { /* tant pis */ }
      } else {
        try { await maison({ action: 'finale', texte: GLITCH.fin(c) }); } catch (e) { /* tant pis */ }
      }
      face.set('happy'); fx.confetti && fx.confetti(80);
      const min = Math.max(1, Math.round((Date.now() - t0) / 60000));
      ecran('MISSION ACCOMPLIE !', `${cristaux(3)} · en ${min} minute${min > 1 ? 's' : ''}`, '#4ade80');
      await wait(2500);
      await say(`Mission accomplie, capitaine ${c} ! La Fusée est rechargée, et le Professeur Glitch est vaincu ! Tu as tout réussi en ${min} minute${min > 1 ? 's' : ''}. Tu es un vrai héros !`);
      logAct('aventure', `les 3 cristaux en ${min} min`, trouves, 3);
      if (typeof souvenir === 'function') souvenir('La mission maison : le cristal de la Fusée retrouvé', 'aventure');
    } finally {
      try { await maison({ action: 'fin', fusee_allumee: fusee }); } catch (e) { /* l'ordinateur remettra tout seul dans 40 minutes */ }
      setTimeout(() => hideBoard(), 9000);
    }
  }
  return { partie };
})();
