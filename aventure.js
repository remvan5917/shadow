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
  // la bande-son de la mission : une musique de science-fiction fabriquée en direct (aucun fichier) — une nappe de synthé, un arpège qui tourne,
  // une basse qui pulse ; une musique de menace quand le Professeur Glitch parle ; une fanfare à la victoire.
  // Elle baisse toute seule quand Shadow parle, et se fait presque muette quand il écoute (pour bien entendre le capitaine).
  const BO = (() => {
    let c = null, maitre = null, sortie = null, actif = false, minuterie = 0, baisse = 0, temps = 0, pas = 0, mode = 'mission';
    const MODES = {
      mission: { accords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], tempo: 0.28, filtre: 2200, arpege: [0, 1, 2, 1, 0, 2, 1, 2] },
      menace: { accords: [[45, 48, 51], [46, 49, 52], [45, 48, 51], [44, 47, 50]], tempo: 0.22, filtre: 900, arpege: [0, 0, 2, 0, 1, 0, 2, 1] },
      cristal: { accords: [[60, 64, 67], [65, 69, 72], [62, 65, 69], [67, 71, 74]], tempo: 0.24, filtre: 3200, arpege: [0, 1, 2, 3, 2, 1, 0, 2] },
    };
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    const VOL = 0.07;
    function note(f, t, d, type, vol, dest) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.4, d * 0.25)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(dest); o.start(t); o.stop(t + d + 0.05);
    }
    function joue() {
      if (!actif) return;
      const M = MODES[mode] || MODES.mission;
      while (temps < c.currentTime + 0.6) {
        const acc = M.accords[Math.floor(pas / 16) % M.accords.length];
        if (pas % 16 === 0) acc.forEach((m, i) => { note(hz(m - 12), temps, M.tempo * 16, 'sawtooth', 0.05, sortie); note(hz(m - 12) * 1.004, temps, M.tempo * 16, 'sawtooth', 0.035, sortie); }); // la nappe
        const k = M.arpege[pas % M.arpege.length]; note(hz((acc[k] ?? acc[0]) + 12), temps, M.tempo * 0.9, 'triangle', 0.11, sortie); // l'arpège
        if (pas % 4 === 0) note(hz(acc[0] - 24), temps, M.tempo * 3, 'sine', 0.22, sortie); // la basse
        if (mode === 'menace' && pas % 8 === 4) note(hz(acc[0] - 23), temps, M.tempo * 2, 'square', 0.05, sortie); // la dissonance du méchant
        temps += M.tempo; pas++;
      }
    }
    function niveau() {
      if (!actif || !maitre) return;
      const parle = typeof voice !== 'undefined' && voice.speaking, entend = typeof OREILLES !== 'undefined' && OREILLES.hearing && OREILLES.hearing(), ecoute = typeof OREILLES !== 'undefined' && OREILLES.listening && OREILLES.listening();
      const cible = VOL * (parle ? 0.35 : entend ? 0.08 : ecoute ? 0.3 : 1); // il parle : plus bas ; le capitaine parle : presque rien ; il écoute : bas (sinon la musique se fait passer pour une voix)
      maitre.gain.setTargetAtTime(cible, c.currentTime, 0.12);
    }
    function demarre(m = 'mission') {
      if (!S.settings.sound || actif) { if (actif) change(m); return; }
      try { c = fx.audio(); } catch (e) { return; }
      maitre = c.createGain(); maitre.gain.value = 0.0001;
      const filtre = c.createBiquadFilter(); filtre.type = 'lowpass'; filtre.frequency.value = (MODES[m] || MODES.mission).filtre; filtre.Q.value = 2;
      const echo = c.createDelay(); echo.delayTime.value = 0.37; const retour = c.createGain(); retour.gain.value = 0.3;
      sortie = c.createGain(); sortie.connect(filtre); sortie.connect(echo); echo.connect(retour).connect(echo); retour.connect(filtre);
      filtre.connect(maitre).connect(c.destination); maitre._filtre = filtre;
      actif = true; mode = m; pas = 0; temps = c.currentTime + 0.1;
      minuterie = setInterval(joue, 150); baisse = setInterval(niveau, 150); joue();
    }
    function change(m) { if (!actif || !MODES[m]) return; mode = m; pas = Math.ceil(pas / 16) * 16; try { maitre._filtre.frequency.setTargetAtTime(MODES[m].filtre, c.currentTime, 0.8); } catch (e) { /* rien */ } }
    function stop(apres = 1.8) {
      if (!actif) return; actif = false; clearInterval(minuterie); clearInterval(baisse);
      const m = maitre; try { m.gain.setTargetAtTime(0.0001, c.currentTime, apres / 4); } catch (e) { /* rien */ }
      setTimeout(() => { try { m.disconnect(); } catch (e) { /* rien */ } }, apres * 1000 + 500);
    }
    function victoire() {
      if (!S.settings.sound) return;
      stop(0.6);
      try {
        const cc = fx.audio(), g = cc.createGain(); g.gain.value = 0.09; g.connect(cc.destination); let t = cc.currentTime + 0.3;
        c = cc;
        [[60, 0.16], [64, 0.16], [67, 0.16], [72, 0.5], [67, 0.16], [72, 0.9]].forEach(([m, d]) => { note(hz(m), t, d + 0.3, 'square', 0.25, g); note(hz(m - 12), t, d + 0.3, 'triangle', 0.3, g); t += d; });
        [60, 64, 67, 72].forEach(m => note(hz(m), t, 2.4, 'sawtooth', 0.08, g));
      } catch (e) { /* pas de son */ }
    }
    return { demarre, change, stop, victoire };
  })();
  // le méchant parle sur la tablette ; Shadow attend qu'il ait fini (à peu près) avant de reprendre — et la musique passe en menace
  async function mechant(texte, action = 'mechant') {
    BO.change('menace');
    try { await maison({ action, texte }); } catch (e) { BO.change('mission'); return; }
    await wait(Math.min(14000, 2500 + texte.length * 62));
    BO.change('mission');
  }
  const ecran = (titre, sous = '', col = '#22d3ee') => showBoard(`<style>@keyframes avBal{to{transform:rotate(360deg)}}@keyframes avPing{0%{transform:scale(.3);opacity:.9}100%{transform:scale(1.6);opacity:0}}</style><div style="font-family:ui-monospace,monospace;background:radial-gradient(120% 90% at 50% 0%,#082f49,#020617 70%);border:2px solid ${col};border-radius:18px;padding:16px 20px;color:#e0f2fe;text-align:center;box-shadow:0 0 30px ${col}55"><div style="position:relative;width:86px;height:86px;margin:0 auto 10px;border-radius:50%;border:1px solid ${col}88;background:radial-gradient(circle,${col}22 0 30%,transparent 31% 60%,${col}18 61% 62%,transparent 63%)"><div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,${col}aa,transparent 25%);animation:avBal 2.4s linear infinite"></div><div style="position:absolute;left:58%;top:30%;width:10px;height:10px;border-radius:50%;background:${col};box-shadow:0 0 10px ${col};animation:avPing 1.8s ease-out infinite"></div></div><div style="font-size:12px;letter-spacing:.3em;color:${col}">MISSION · LE CRISTAL DE LA FUSÉE</div><div style="font:800 26px system-ui;margin-top:8px">${titre}</div>${sous ? `<div style="margin-top:8px;font-size:15px;opacity:.85">${sous}</div>` : ''}<button id="av-ok" style="display:none;margin-top:14px;font:800 22px system-ui;color:#022c22;background:#4ade80;border:0;border-radius:16px;padding:14px 30px;box-shadow:0 0 24px rgba(74,222,128,.6)">J'Y SUIS !</button></div>`);
  // il attend que le capitaine arrive dans la pièce : il écoute EN SILENCE (les bruits et les bavardages ne relancent plus la question),
  // il relance doucement toutes les 50 secondes (une phrase différente à chaque fois, trois fois au plus), et le gros bouton « J'y suis ! » marche aussi
  const ARRIVE = /\b(j y suis|j suis|je suis la|suis la|suis arrive|arrive|c est bon|c est la|trouve|je l ai|voila|oui)\b/;
  const arrive_ = t => ARRIVE.test(t) && !/\b(pas|non|jamais|toujours pas)\b/.test(t); // « ça clignote pas ici », « j'y suis pas » : pas encore
  const AIDE = /\b(indice|aide|sais pas|sais plus|ou c est|ou est|perdu|je trouve pas)\b/;
  async function attendsArrivee(p, mots, relances) {
    let touche = false;
    const b = document.getElementById('av-ok'); if (b) { b.style.display = 'inline-block'; b.onclick = e => { e.stopPropagation(); touche = true; try { OREILLES.cancel(); } catch (er) { /* rien */ } }; }
    let derniere = Date.now(), n = 0;
    try {
      for (;;) {
        if (touche) return 'touche';
        const t0 = Date.now();
        let a = await hear({ maxWait: 20000 });
        if (a === null) { await wait(600); if (touche) return 'touche'; continue; } // on a touché l'écran ailleurs : il continue d'attendre, sans répéter
        if (touche) return 'touche';
        if (typeof a === 'string' && a && pourMoi(a, N(a)) === 'adulte') { OREILLES.note(a, '→ une voix d\'adulte : il attend le capitaine'); a = ''; }
        const t = N(a || '');
        if (t) {
          if (RE.stop.test(t)) throw new Stop('stop');
          if (AIDE.test(t)) { await maison({ action: 'clignote', id: p.id, fois: 4 }).catch(() => {}); await say(`Je fais clignoter la lumière encore une fois ! Rappelle-toi : ${pick(INDICES[p.type] || [p.nom])}`); derniere = Date.now(); continue; }
          if (arrive_(t) || (!/\b(pas|non)\b/.test(t) && ((mots && mots.test(t)) || Object.values(MOTS).some(m => m.test(t))))) return t;
          continue; // autre chose (il parle en marchant) : on ne répond pas
        }
        if (Date.now() - t0 < 500) await wait(1500); // les oreilles sont coupées : on ne tourne pas à vide
        if (Date.now() - derniere > 50000) {
          if (n >= relances.length) return '';
          derniere = Date.now();
          if (n === 1) await maison({ action: 'clignote', id: p.id, fois: 4 }).catch(() => {});
          await say(relances[n++]);
        }
      }
    } finally { const b2 = document.getElementById('av-ok'); if (b2) { b2.style.display = 'none'; b2.onclick = null; } }
  }
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
      BO.demarre('menace');
      await say(`Alerte, alerte ! ${c}, quelqu'un a piraté la maison ! Écoute...`);
      await mechant(GLITCH.debut(c));
      face.set('happy');
      await say(`Pas de panique, capitaine ! Toi et moi, on va retrouver les ${etapes.length} morceaux du cristal. À chaque fois, une lumière va clignoter quelque part dans la maison, et je te donnerai une devinette. Règle numéro un des héros : on marche, on ne court pas ! C'est parti ?`);
      for (let k = 0; k < etapes.length; k++) {
        const p = etapes[k];
        ecran(`CRISTAL ${k + 1} SUR ${etapes.length}`, cristaux(trouves), '#22d3ee'); BO.change('mission');
        await maison({ action: 'clignote', id: p.id, fois: 5 }).catch(() => {});
        await say(`Cristal numéro ${k + 1} ! Regarde bien : une lumière clignote dans la maison. Et voici la devinette : ${pick(INDICES[p.type] || [`Je suis la pièce ${p.nom}.`])} Va là-bas, et dis « j'y suis » quand tu y es !`);
        let arrive = false;
        const relances = ["Prends ton temps, capitaine. Dis « j'y suis » quand tu es dans la pièce qui clignote, ou touche le gros bouton vert !",
          `Je refais clignoter la lumière ! Rappelle-toi : ${pick(INDICES[p.type] || [p.nom])}`, "Je suis toujours là ! Si tu veux un indice, dis « indice »."];
        for (let essai = 0; essai < 4 && !arrive; essai++) {
          const a = await attendsArrivee(p, MOTS[p.type], essai ? relances.slice(1) : relances);
          if (!a) break;
          const autre = a !== 'touche' && !(MOTS[p.type] && MOTS[p.type].test(a)) && Object.entries(MOTS).find(([k, m]) => k !== p.type && m.test(a));
          if (autre && !arrive_(a)) { await say(`Ce n'est pas cette pièce-là, capitaine ! Rappelle-toi : ${pick(INDICES[p.type] || [p.nom])}`); continue; }
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
        ecran(`CRISTAL ${k + 1} TROUVÉ !`, cristaux(trouves), '#4ade80'); BO.change('cristal'); fx.tone([[1319, 0.08], [1568, 0.08], [1976, 0.08], [2637, 0.2]]);
        await say(bon ? `Oui ! C'était ${d.a} ! Le verrou s'ouvre... Tu as le cristal numéro ${k + 1} !` : `C'était ${d.a} ! Pas grave : j'ai piraté le verrou avec mes circuits. Tu as le cristal numéro ${k + 1} !`);
        await mechant(GLITCH[Math.min(3, trouves)] ? GLITCH[Math.min(3, trouves)]() : GLITCH[1]());
      }
      // la finale : rapporter les cristaux à la Fusée
      if (info.fusee) {
        ecran('DERNIÈRE ÉTAPE', 'rapporte les cristaux à la Fusée', '#fbbf24');
        await maison({ action: 'clignote', id: info.fusee.id, fois: 4 }).catch(() => {});
        let la = false;
        await say(`Les trois cristaux sont à toi ! Maintenant, rapporte-les à ta Fusée, dans ta chambre, pour la recharger. Dis « j'y suis » quand tu es à côté d'elle, ou touche le gros bouton vert !`);
        const a = await attendsArrivee(info.fusee, /\bfusee\b/, ["Je t'attends près de la Fusée, capitaine !", "La Fusée clignote : elle a hâte de recevoir ses cristaux !", "Dis « j'y suis » quand tu es à côté de ta Fusée."]);
        la = !!a;
        if (!la) { await say("La Fusée t'attendra, capitaine ! On finira l'aventure plus tard."); return; }
        await say("Pose les cristaux à côté de la Fusée... Trois, deux, un... Recharge !"); BO.victoire();
        fx.tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.25], [1319, 0.5]]);
        try { await maison({ action: 'finale', texte: GLITCH.fin(c) }); fusee = true; } catch (e) { /* tant pis */ }
      } else {
        BO.victoire();
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
      BO.stop();
      try { await maison({ action: 'fin', fusee_allumee: fusee }); } catch (e) { /* l'ordinateur remettra tout seul dans 40 minutes */ }
      setTimeout(() => hideBoard(), 9000);
    }
  }
  return { partie, _attends: attendsArrivee, _bo: BO };
})();
