/* =========================================================
   SHADOW — les devoirs de la semaine
   Papa photographie le cahier de liaison ou la liste de mots (« Atlas, range les devoirs ») ; Atlas les range sur
   l'ordinateur de la maison (/maison/carnet/devoirs). Shadow :
   - fait réviser les mots de la semaine en dictée (« révise mes mots », « la dictée de la semaine ») — d'abord ceux
     qui ne sont pas encore sus ; les résultats repartent chez papa (le bilan du vendredi) ;
   - dit les devoirs (« j'ai quoi comme devoirs ? ») ;
   - propose, le soir (17 h – 19 h 30), une fois par jour : « on révise tes mots de la semaine ? ».
   Navigateur ancien (Chrome 70) : pas de « ?. », pas de « ?? ».
   ========================================================= */
'use strict';

const DEVOIRS = (() => {
  const root = () => (typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : '');
  let sem = null, res = {};
  async function appel(chemin, corps) {
    const r0 = root(); if (!r0 || window.__BANC) throw new Error('pas de maison');
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 8000);
    try {
      const r = await fetch(`${r0}${chemin}`, { method: corps ? 'POST' : 'GET', headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error(`devoirs ${r.status}`);
      return await r.json();
    } finally { clearTimeout(tm); }
  }
  async function releve() {
    try { const j = await appel('/maison/carnet/devoirs'); const d = (j && j.doc) || {}; sem = d.semaine || null; res = d.resultats || {}; } catch (e) { /* plus tard */ }
  }
  setTimeout(releve, 9000); setInterval(releve, 10 * 60000);
  const fraiche = () => !!(sem && sem.mots && sem.mots.length && Date.now() / 1000 - (sem.at || 0) < 10 * 86400);
  async function sauve() { try { await appel('/maison/carnet/devoirs', { action: 'cle', cle: 'resultats', valeur: res }); } catch (e) { /* tant pis */ } }
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const jourDit = iso => { const d = new Date(`${iso}T12:00:00`); const m = new Date(); m.setHours(12, 0, 0, 0); const k = Math.round((d - m) / 86400000); return k === 0 ? "aujourd'hui" : k === 1 ? 'demain' : JOURS[d.getDay()]; };

  async function dictee() {
    await releve();
    if (!fraiche()) { await say("Papa ne m'a pas encore donné tes mots de la semaine. Je te fais une dictée de mots de l'école à la place !"); return dicteeMotsFlow(); }
    const score = m => { const r = res[m.t]; return !r ? 0 : r.dernier !== 'ok' ? 1 : 2 + Math.random(); };
    const list = JEUX.shuffle(sem.mots.slice()).sort((a, b) => score(a) - score(b)).slice(0, 6);
    await say(`Mission dictée de la semaine ! ${list.length} mots de ta liste. Écris-les sur ton cahier, et épelle-les-moi. On y va !`);
    let first = 0;
    for (const m of list) {
      const c = { text: m.phrase || m.t, words: [], tries: 0, hints: [], dictee: true };
      await spellWord(c, { w: m.t, t: m.t, spell: true });
      const r = res[m.t] || { ok: 0, fail: 0 };
      if (c.tries === 0) { r.ok++; r.dernier = 'ok'; first++; } else { r.fail++; r.dernier = 'rate'; }
      r.at = Math.floor(Date.now() / 1000); res[m.t] = r;
    }
    S.devoirsFait = new Date().toDateString(); save();
    await sauve();
    logAct('dictee', list.map(m => m.t).join(', '), first, list.length);
    face.set('happy'); fx.confetti(40);
    const reste = sem.mots.filter(m => !res[m.t] || res[m.t].dernier !== 'ok').length;
    await say(`Mission accomplie ! ${first} mot${first > 1 ? 's' : ''} sur ${list.length} du premier coup. ${reste ? `Il te reste ${reste} mot${reste > 1 ? 's' : ''} à bien connaître : on les revoit demain !` : 'Tu connais toute ta liste, champion !'}`);
  }
  async function liste() {
    await releve();
    if (!sem) return say("Papa ne m'a pas encore donné tes devoirs. Il peut les photographier avec Atlas.");
    const d = (sem.devoirs || []).map(x => `${x.matiere ? `${x.matiere} : ` : ''}${x.quoi}${x.pour ? `, pour ${jourDit(x.pour)}` : ''}`);
    const t = [d.length ? `Tes devoirs : ${d.join(' ; ')}.` : '', sem.poesie ? `Ta poésie à apprendre : ${sem.poesie}.` : '', fraiche() ? `Et ${sem.mots.length} mot${sem.mots.length > 1 ? 's' : ''} à connaître pour la dictée. Dis « révise mes mots » et on s'entraîne !` : ''].filter(Boolean).join(' ');
    return say(t || "Pas de devoirs notés pour cette semaine. Bravo !");
  }
  function route(text, n) {
    if (/\b(mes devoirs|j ai quoi comme devoirs|quels sont mes devoirs|les devoirs de la semaine|qu est ce que j ai a faire pour l ecole)\b/.test(n)) return () => activity(liste);
    if (/\b(mots de la semaine|ma liste de mots|revise mes mots|reviser mes mots|on revise mes mots|dictee de la semaine|la dictee de la maitresse)\b/.test(n)) return () => activity(dictee);
    return null;
  }
  // le soir : Shadow propose, une fois par jour, s'il est là
  setInterval(() => {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60, k = d.toDateString();
    if (h < 17 || h > 19.5 || !fraiche() || S.devoirsFait === k || S.devoirsPropose === k) return;
    if (!dlg.started || dlg.busy || dlg.state === 'sleep' || window.SHADOW_CHEZ_PAPA === false) return;
    if (Date.now() - (dlg.lastActive || 0) > 5 * 60000) return;
    S.devoirsPropose = k; save();
    say(pick(['Petite mission du soir, copilote : on révise tes mots de la semaine ? Dis oui !', 'Bip bip ! Entraînement spécial dictée : on révise tes mots de la semaine ?'])).then(() => { dlg.expect = { until: Date.now() + 40000, run: () => activity(dictee) }; });
  }, 60000);
  return { route, dictee, fraiche };
})();
