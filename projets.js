/* =========================================================
   SHADOW — les projets sur plusieurs jours
   « Je veux apprendre la table de 7 cette semaine » :
   Shadow crée un projet, propose l'entraînement du jour (une fois par jour),
   note chaque séance, dit où on en est, et fête l'objectif atteint.
   Objectif : réussir l'entraînement deux jours différents.
   Utilise les outils de app.js et activites.js (au moment où il s'en sert).
   ========================================================= */
'use strict';

const PROJETS = (() => {
  const NUMS = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
  // ce qu'on sait entraîner : le jeu, ce qu'il note dans le carnet, et quand c'est réussi
  const TYPES = {
    table: { titre: p => `la table de ${p}`, run: p => calcFlow(`table:${p}`), log: 'calc', ok: x => x.s >= 5 },
    complement: { titre: p => `les compléments à ${p}`, run: p => calcFlow(p === 100 ? 'c100' : 'c10'), log: 'calc', ok: x => x.s >= 5 },
    heure: { titre: () => "lire l'heure", run: () => heureFlow(), log: 'heure', ok: x => x.s >= 4 },
    dictee: { titre: () => 'les mots de la dictée', run: () => dicteeMotsFlow(), log: 'dictee', ok: x => x.n && x.s >= x.n - 1 },
    anglais: { titre: () => "les mots d'anglais", run: () => anglaisFlow(), log: 'anglais', ok: x => x.s >= 4 },
    lecture: { titre: () => 'la lecture', run: () => lectureFlow(), log: 'lecture', ok: x => x.s >= 90 },
  };
  const GOAL = 2; // réussir 2 jours différents
  const list = () => S.projets || (S.projets = []);
  const active = () => list().filter(p => !p.done && !p.ended);
  const dayN = (p, k = dayKey()) => Math.round((new Date(`${k}T12:00:00`) - new Date(`${p.debut}T12:00:00`)) / 86400000) + 1;
  const length = p => Math.round((new Date(`${p.fin}T12:00:00`) - new Date(`${p.debut}T12:00:00`)) / 86400000) + 1;
  const wins = p => new Set(p.sessions.filter(s => s.ok).map(s => s.date)).size;
  const titre = p => TYPES[p.type].titre(p.param);

  /* ---------- comprendre la demande ---------- */
  const WD = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function horizon(n) {
    const m = n.match(/\ben (\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix) jours\b/);
    if (m) return Math.max(2, NUMS[m[1]] || parseInt(m[1], 10));
    const w = n.match(/\b(?:d ici|avant|pour|jusqu a) (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
    if (w) { let d = (WD.indexOf(w[1]) - new Date().getDay() + 7) % 7; if (d < 2) d += 7; return d; }
    if (/\b(la semaine prochaine|deux semaines)\b/.test(n)) return 14;
    return 7; // « cette semaine » et par défaut
  }
  function typeOf(n) {
    const t = n.match(/\btables? (?:de |des )?(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b/);
    if (t) return ['table', NUMS[t[1]] || parseInt(t[1], 10)];
    if (/\bcomplements?\b/.test(n)) return ['complement', /\bcent\b|100/.test(n) ? 100 : 10];
    if (/\b(l heure|lire l heure|horloge)\b/.test(n)) return ['heure', 0];
    if (/\b(dictee|mots|orthographe|ecrire)\b/.test(n)) return ['dictee', 0];
    if (/\b(anglais|english)\b/.test(n)) return ['anglais', 0];
    if (/\b(lire|lecture)\b/.test(n)) return ['lecture', 0];
    return null;
  }
  const R = {
    // « je veux apprendre la table de 7 cette semaine », « mon objectif : lire l'heure d'ici vendredi »
    create: /\b(objectif|projet|par coeur|cette semaine|d ici|en \d+ jours|en (deux|trois|quatre|cinq|six|sept) jours|la semaine prochaine|avant (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche))\b/,
    want: /\b(je veux|je voudrais|j aimerais|aide moi a|on peut|je dois|il faut que j|mon objectif|nouveau projet|un projet)\b/,
    status: /\b(mon projet|mes projets|ou j en suis|j en suis ou|mon objectif|mes objectifs|on en est ou)\b/,
    cancel: /\b(arrete|annule|abandonne|supprime|efface|stop)\b.*\b(projet|objectif)\b/,
    train: /\b(entrainement du jour|on s entraine|mon entrainement|on fait l entrainement)\b/,
  };

  /* ---------- créer, entraîner, faire le point ---------- */
  async function create(text, n) {
    const ty = typeOf(n);
    if (!ty) return say("Je sais faire des projets pour les tables, les compléments, l'heure, la dictée, la lecture et l'anglais. Dis par exemple : « je veux apprendre la table de 7 cette semaine ».");
    if (active().length >= 2) return say(`Tu as déjà deux projets en cours : ${active().map(titre).join(' et ')}. Finissons-les d'abord !`);
    const [type, param] = ty;
    if (active().some(p => p.type === type && p.param === param)) return status();
    const days = horizon(n);
    const fin = new Date(Date.now() + (days - 1) * 86400000);
    const p = { id: Date.now(), type, param, debut: dayKey(), fin: dayKey(fin), sessions: [], done: false, ended: false };
    list().push(p); save();
    MEMOIRE.add(`${S.prenom || "L'enfant"} s'est fixé un objectif : apprendre ${titre(p)} en ${days} jours.`, S.prenom, 'projet');
    face.set('proud'); VISAGE.puff('etoile', 4); fx.ok();
    dlg.expect = { until: Date.now() + 60000, run: () => train(p) };
    return say(`Projet enregistré : ${titre(p)}, en ${days} jours. Chaque jour, je te propose un petit entraînement. L'objectif : réussir ${GOAL} jours différents. On fait le premier maintenant ?`);
  }
  async function train(p) {
    p = p || active()[0];
    if (!p) return say("Tu n'as pas de projet en cours. Dis par exemple : « je veux apprendre la table de 7 cette semaine ».");
    const T = TYPES[p.type], t0 = Date.now();
    await activity(() => T.run(p.param));
    const x = (S.log || []).filter(l => l.type === T.log && l.at >= t0).slice(-1)[0];
    if (!x) return; // séance arrêtée avant la fin
    const ok = !!T.ok(x);
    p.sessions.push({ date: dayKey(), s: x.s, n: x.n, ok });
    save();
    const w = wins(p);
    if (w >= GOAL) {
      p.done = true; p.doneAt = Date.now(); save();
      face.set('proud'); fx.confetti(90); VISAGE.puff('etoile', 6);
      MEMOIRE.add(`${S.prenom || "L'enfant"} a réussi son objectif : ${titre(p)} (${dateFR(Date.now())}).`, S.prenom, 'projet');
      MEMOIRE.event(`Objectif atteint : ${titre(p)} !`);
      await say(`Objectif atteint ! Tu as réussi ${titre(p)} deux jours différents. Je suis fier de toi, mes circuits clignotent de joie !`);
      checkBadges(); return announceBadges();
    }
    showProgress(p);
    return say(ok ? `Réussi ! Jour ${dayN(p)} : c'est ${w} réussite sur ${GOAL}. Encore une autre journée comme ça, et l'objectif est atteint.` : `C'est noté pour aujourd'hui. Pour réussir, il faut ${T.log === 'lecture' ? 'lire presque sans erreur' : 'tout juste ou presque'}. On réessaiera demain : tu progresses à chaque fois.`);
  }
  function showProgress(p) {
    const L = length(p), today = dayN(p);
    const dots = [];
    for (let i = 1; i <= L; i++) {
      const k = dayKey(new Date(new Date(`${p.debut}T12:00:00`).getTime() + (i - 1) * 86400000));
      const ss = p.sessions.filter(s => s.date === k);
      const st = ss.some(s => s.ok) ? 'ok' : ss.length ? 'fait' : i < today ? 'rate' : i === today ? 'auj' : 'avenir';
      dots.push(`<i class="${st}" title="jour ${i}"></i>`);
    }
    showBoard(`<div class="projet"><h3>${esc(titre(p))}</h3><div class="jours">${dots.join('')}</div><p>${wins(p)} réussite${wins(p) > 1 ? 's' : ''} sur ${GOAL} · jour ${Math.min(today, L)} sur ${L}</p></div>`, 'solid');
    const shown = $('#board').innerHTML;
    setTimeout(() => { if ($('#board').innerHTML === shown) hideBoard(); }, 12000);
  }
  async function status() {
    const a = active();
    const doneP = list().filter(p => p.done).slice(-3);
    if (!a.length) return say(doneP.length ? `Tu n'as pas de projet en cours. Objectifs déjà atteints : ${doneP.map(titre).join(', ')}. Bravo !` : "Tu n'as pas encore de projet. Dis par exemple : « je veux apprendre la table de 7 cette semaine ».");
    const p = a[0];
    showProgress(p);
    const L = length(p), left = L - dayN(p);
    const trainedToday = p.sessions.some(s => s.date === dayKey());
    if (!trainedToday) dlg.expect = { until: Date.now() + 60000, run: () => train(p) };
    return say(`Ton projet : ${titre(p)}. ${wins(p)} réussite${wins(p) > 1 ? 's' : ''} sur ${GOAL}, ${left > 0 ? `il reste ${left} jour${left > 1 ? 's' : ''}` : "c'est le dernier jour"}.${trainedToday ? " Tu t'es déjà entraîné aujourd'hui." : " On fait l'entraînement du jour ?"}${a.length > 1 ? ` Et tu as aussi ${titre(a[1])}.` : ''}`);
  }
  async function cancel() {
    const p = active()[0];
    if (!p) return say("Tu n'as pas de projet en cours.");
    if (!(await askYesNo(`Tu veux vraiment arrêter ton projet, ${titre(p)} ?`))) return say("D'accord, on le garde !");
    p.ended = true; save();
    return say('Projet arrêté. Tu pourras en commencer un autre quand tu veux.');
  }

  /* ---------- au réveil : l'entraînement du jour (une fois par jour), ou la fin du projet ---------- */
  async function morning() {
    const d = daily(), k = dayKey();
    if (d.projet === k) return false;
    const now = new Date();
    for (const p of active()) {
      if (k > p.fin) { // le temps est écoulé
        p.ended = true; save(); d.projet = k; save();
        dlg.expect = { until: Date.now() + 60000, run: () => { p.ended = false; p.fin = dayKey(new Date(Date.now() + 6 * 86400000)); save(); return say(`C'est reparti pour une semaine : ${titre(p)} !`).then(() => train(p)); } };
        return say(`Ton projet, ${titre(p)}, est terminé : ${wins(p)} réussite${wins(p) > 1 ? 's' : ''} sur ${GOAL}. Tu veux qu'on le relance pour une semaine ?`).then(() => true);
      }
      if (p.sessions.some(s => s.date === k) || now.getHours() < 7) continue;
      d.projet = k; save();
      dlg.expect = { until: Date.now() + 60000, run: () => train(p) };
      return say(`Ton projet, ${titre(p)} : jour ${dayN(p)} sur ${length(p)}. On fait l'entraînement du jour ?`).then(() => true);
    }
    return false;
  }

  function route(text, n) {
    if (R.cancel.test(n)) return cancel;
    if (R.status.test(n) && !R.want.test(n)) return status;
    if (R.train.test(n)) return () => train();
    if (R.want.test(n) && R.create.test(n) && typeOf(n)) return () => create(text, n);
    if (/\b(projet|objectif)\b/.test(n) && R.want.test(n)) return () => create(text, n);
    return null;
  }
  // pour la conscience du cerveau
  function fact() {
    const a = active();
    return a.length ? `Projets en cours (fixés par l'enfant) : ${a.map(p => `${titre(p)}, ${wins(p)}/${GOAL} réussites, jour ${dayN(p)} sur ${length(p)}`).join(' ; ')}.` : '';
  }

  BADGES.push({ id: 'objectif', nom: 'Objectif atteint', ico: '🎯', test: () => list().some(p => p.done) });

  return { route, morning, status, train, create, fact, list, active, typeOf, horizon };
})();
