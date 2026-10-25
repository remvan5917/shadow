/* =========================================================
   SHADOW — les missions galactiques, le réveil de mission, les médailles de papa
   - Les missions du jour (papa les règle avec Atlas) : « mes missions », « mission accomplie : je me suis brossé les dents »,
     « j'ai fini mes devoirs » → des points, des grades (Cadet de l'espace, Pilote, Lieutenant, Capitaine, Commandant, Amiral…).
   - Le réveil de mission (les matins d'école) : après le lever de soleil de sa lampe, le briefing : ses rendez-vous du jour
     (seulement les siens, lus dans l'agenda de papa), la météo pour s'habiller, ses missions du matin, et le compte à rebours
     avant le départ (si papa a donné l'heure).
   - Le soir, le bilan de mission ; les médailles que papa lui décerne de loin (« donne une médaille à mon fils »).
   ========================================================= */
'use strict';

const MISSIONS = (() => {
  async function appel(chemin, corps) {
    const r0 = typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : '';
    if (!r0 || window.__BANC) throw new Error('pas de maison');
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 15000);
    try {
      const r = await fetch(`${r0}${chemin}`, { method: corps ? 'POST' : 'GET', headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error(`missions ${r.status}`);
      return await r.json();
    } finally { clearTimeout(tm); }
  }
  const hm = s => { const d = new Date(s * 1000); return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`.replace(' h 00', ' h'); };
  const liste = l => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l[0] || '');
  const jour = () => new Date().toDateString();

  // une cérémonie à l'écran : la lueur, le titre, des confettis
  function ceremonie(titre, sous, couleur = '#fbbf24') {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:58;display:grid;place-items:center;pointer-events:none;background:radial-gradient(55% 55% at 50% 50%,rgba(251,191,36,.35),rgba(0,0,0,.85) 75%);opacity:0;transition:opacity .6s;font-family:ui-monospace,monospace';
    el.innerHTML = `<div style="text-align:center"><div style="font-size:72px">🏅</div><div style="margin-top:8px;font:700 clamp(26px,6vw,52px) system-ui;color:#fff7ed;text-shadow:0 0 18px ${couleur}">${esc(titre)}</div><div style="margin-top:8px;font-size:13px;letter-spacing:.3em;color:${couleur}">${esc(sous)}</div></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => { el.style.opacity = '1'; });
    try { fx.confetti(60); } catch (e) { /* rien */ }
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 700); }, 6000);
  }
  const fanfare = () => fx.tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.35], [784, 0.12], [1047, 0.5]]);

  /* ---------- les missions du jour ---------- */
  async function etat() { return appel('/maison/missions'); }
  async function mesMissions() {
    let e; try { e = await etat(); } catch (er) { return say("Oh, je n'arrive pas à joindre la base. Réessaie tout à l'heure !"); }
    const reste = e.missions.filter(m => !e.faites.includes(m.id)), faites = e.missions.filter(m => e.faites.includes(m.id));
    showBoard(`<div style="font-family:ui-monospace,monospace;padding:12px;border-radius:14px;background:linear-gradient(160deg,#020b14,#1e1b4b);border:1px solid #a78bfa;color:#ede9fe"><div style="font-size:12px;letter-spacing:.2em;color:#c4b5fd">◢ MISSIONS DU JOUR · ${esc(e.grade.toUpperCase())} · ${e.points} PTS</div>${e.missions.map(m => `<div style="margin-top:8px;font-size:18px">${e.faites.includes(m.id) ? '✅' : '⬜'} ${esc(m.nom)} <span style="color:#fbbf24">+${m.points}</span></div>`).join('')}</div>`, 'graphe-board');
    if (!reste.length) return say(`Toutes tes missions sont accomplies aujourd'hui, ${e.grade} ${name()} ! Tu es incroyable !`);
    return say(`${faites.length ? `Déjà ${faites.length} mission${faites.length > 1 ? 's' : ''} accomplie${faites.length > 1 ? 's' : ''} ! ` : ''}Il te reste : ${liste(reste.map(m => m.nom))}. Tu as ${e.points} points, grade : ${e.grade}.${e.prochain ? ` Encore ${e.prochain.points - e.points} points pour devenir ${e.prochain.grade} !` : ''}`);
  }
  async function accomplie(n) {
    let e; try { e = await etat(); } catch (er) { return say("Oh, je n'arrive pas à joindre la base. Réessaie tout à l'heure !"); }
    const matin = new Date().getHours() < 12;
    const cand = e.missions.filter(m => !e.faites.includes(m.id) && String(m.mots || m.nom).split(' ').some(w => w.length > 2 && n.includes(N(w))));
    const m = cand.find(x => x.moment === (matin ? 'matin' : 'soir')) || cand[0];
    if (!m) {
      if (e.missions.some(x => e.faites.includes(x.id) && String(x.mots || x.nom).split(' ').some(w => w.length > 2 && n.includes(N(w))))) return say("Celle-là, tu l'as déjà accomplie aujourd'hui ! Bravo !");
      return say("Bravo ! Mais ce n'est pas une de tes missions du jour. Dis « mes missions » pour les voir.");
    }
    let r; try { r = await appel('/maison/missions', { fait: m.id }); } catch (er) { return say("Oh, je n'arrive pas à joindre la base."); }
    fanfare(); face.flash('happy');
    const promu = r.grade !== e.grade;
    if (promu) { ceremonie(r.grade, 'PROMOTION !', '#a78bfa'); await say(`Mission accomplie ! Plus ${r.gagne} points. Et… alerte ! Promotion ! ${name()}, tu es maintenant ${r.grade} !`); }
    else { try { fx.confetti(30); } catch (er) { /* rien */ } await say(pick([`Mission accomplie ! Plus ${r.gagne} points. Tu as ${r.points} points.`, `Bip bip ! Mission « ${m.nom} » réussie ! Plus ${r.gagne} points !`])); }
    const reste = r.missions.filter(x => !r.faites.includes(x.id));
    if (typeof souvenir === 'function') souvenir(`Mission « ${m.nom} » réussie`, 'mission'); // (une photo pour le film du mois, si sa caméra est déjà allumée)
    if (!reste.length) await say('Toutes les missions du jour sont accomplies ! Papa va être fier de toi !');
  }
  async function grade() {
    let e; try { e = await etat(); } catch (er) { return say("Oh, je n'arrive pas à joindre la base."); }
    return say(`Tu es ${e.grade}, avec ${e.points} points.${e.prochain ? ` Encore ${e.prochain.points - e.points} points pour devenir ${e.prochain.grade} !` : ' Le plus haut grade de la galaxie !'}${e.medailles.length ? ` Et tu as ${e.medailles.length} médaille${e.medailles.length > 1 ? 's' : ''} de papa.` : ''}`);
  }
  async function medaille(texte) {
    dlg.busy = true;
    try { ceremonie('Médaille de papa', String(texte || '').toUpperCase()); fanfare(); await wait(800); await say(`${name()} ! Papa t'a décerné une médaille${texte ? ` : ${texte}` : ''} ! Plus 25 points ! Bravo, ${name()} !`); }
    finally { dlg.busy = false; }
  }

  /* ---------- le réveil de mission ---------- */
  let briefFait = '', compte = [];
  async function briefing() {
    if (briefFait === jour()) return; briefFait = jour();
    let ev = [], e = null, ecole = {};
    try { ev = S.prenom ? (await appel('/maison/agenda/mission', { prenom: S.prenom })).evenements || [] : []; } catch (er) { ev = []; }
    try { e = await etat(); } catch (er) { e = null; }
    try { ecole = (await appel('/maison/reveils')).ecole || {}; } catch (er) { ecole = {}; }
    let meteo = '';
    try {
      const v = S.settings.ville;
      if (v) {
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&current=temperature_2m&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=1`)).json();
        const t = Math.round(w.current.temperature_2m), mx = Math.round(w.daily.temperature_2m_max[0]), pl = w.daily.precipitation_probability_max[0];
        meteo = `Météo : ${t} degrés ce matin, ${mx} cet après-midi. ${t < 8 ? 'Mets un bon manteau, un bonnet et des gants !' : t < 14 ? 'Prends un manteau !' : t < 20 ? 'Un pull suffira.' : 'Il fait chaud : un tee-shirt !'}${pl >= 50 ? ' Et il risque de pleuvoir : un imperméable ou un parapluie !' : ''}`;
      }
    } catch (er) { meteo = ''; }
    face.flash('happy'); fx.tone([[523, 0.12], [659, 0.12], [784, 0.25]]);
    const rdv = ev.filter(x => !x.journee).map(x => `${x.titre.toLowerCase()} à ${hm(x.debut)}`);
    const matin = e ? e.missions.filter(m => m.moment === 'matin' && !e.faites.includes(m.id)).map(m => m.nom) : [];
    await say(`Bonjour capitaine ${name()} ! Ici Shadow, ton copilote. Mission du jour : l'école${rdv.length ? `, puis ${liste(rdv)}` : ''}. ${meteo}${matin.length ? ` Tes missions du matin : ${liste(matin)}.` : ''}`);
    // le compte à rebours avant le départ
    compte.forEach(clearTimeout); compte = [];
    if (/^\d{1,2}:\d{2}$/.test(ecole.depart || '')) {
      const [h, m] = ecole.depart.split(':').map(Number), dep = new Date(); dep.setHours(h, m, 0, 0);
      const reste = Math.round((dep - Date.now()) / 60000);
      if (reste > 2) {
        await say(`Départ pour l'école dans ${reste} minutes, à ${h} h ${m ? String(m).padStart(2, '0') : ''}.`);
        for (const [min, t] of [[15, 'Plus que quinze minutes avant le départ ! Tes chaussures, ton cartable !'], [5, 'Cinq minutes avant le décollage ! Manteau, cartable, on y va !'], [0, "C'est l'heure ! Décollage pour l'école ! Bonne journée, capitaine !"]]) {
          const ms = dep - Date.now() - min * 60000;
          if (ms > 0) compte.push(setTimeout(async () => { if (!dlg.busy && !voice.speaking) { fx.tone([[880, 0.08], [1175, 0.12]]); await say(t); } }, ms));
        }
      }
    }
  }
  // le bilan du soir : une fois, vers 18 h 30 – 19 h 45, quand il est là
  let bilanFait = '';
  async function bilan() {
    if (bilanFait === jour()) return; bilanFait = jour();
    let e; try { e = await etat(); } catch (er) { return; }
    const faites = e.missions.filter(m => e.faites.includes(m.id)), reste = e.missions.filter(m => !e.faites.includes(m.id) && m.moment === 'soir');
    await say(`Bilan de mission, capitaine ! Aujourd'hui, tu as accompli ${faites.length} mission${faites.length > 1 ? 's' : ''}.${reste.length ? ` Il te reste ce soir : ${liste(reste.map(m => m.nom))}.` : ' Toutes accomplies, bravo !'} Tu as ${e.points} points.`);
    const a = await ask("Et toi, qu'est-ce que tu as préféré aujourd'hui ?", { wait: 15000 });
    if (a) await say(pick(["Super ! Je le note dans mon journal de bord.", 'Génial ! Mes circuits adorent tes histoires.', "Trop bien ! C'était une belle journée de mission."]));
  }
  setInterval(() => {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    const la = typeof VISION !== 'undefined' && VISION.isOn() && VISION.state.faces.some(f => f.name && S.prenom && f.name === S.prenom);
    if (!dlg.started || dlg.busy || voice.speaking || dlg.expect || !['standby', 'talk'].includes(dlg.state)) return;
    if (h >= 18.5 && h < 19.75 && (la || Date.now() - (dlg.lastTalk || 0) < 10 * 60000)) bilan();
  }, 60000);

  /* ---------- le soigneur des cochons d'Inde (le carnet du vivant, partagé avec Atlas) ---------- */
  let nomsAnimaux = [];
  setTimeout(async () => { try { nomsAnimaux = ((await appel('/maison/vivant')).animaux || {}).noms || []; } catch (e) { /* plus tard */ } }, 9000);
  const SOINS_E = [['foin', /\bfoin\b/], ['eau', /\b(eau|biberon|a boire)\b/], ['legumes', /\b(legumes?|salade|carottes?|concombre|poivron|persil|endive|pomme|fruits?)\b/], ['granules', /\b(granules?|croquettes?)\b/], ['cage', /\b(cage|litiere|maison des cochons)\b/]];
  async function soigneur(n) {
    const quoi = SOINS_E.filter(([, re]) => re.test(n)).map(([k]) => k); if (!quoi.length) quoi.push('nourri');
    try { for (const q of quoi) await appel('/maison/vivant', { action: 'soin', quoi: q, de: 'enfant' }); } catch (e) { return say("Oh, je n'arrive pas à joindre la base. Mais bravo quand même !"); }
    const qui = nomsAnimaux.length ? liste(nomsAnimaux) : "les cochons d'Inde";
    face.flash('happy'); fx.tone([[784, 0.08], [988, 0.08], [1319, 0.16]]);
    let e = null; try { e = await etat(); } catch (er) { /* rien */ }
    const m = e && e.missions.find(x => /cochon/i.test(x.nom) && !e.faites.includes(x.id));
    if (m) return accomplie(`${n} cochons inde soigneur`);
    return say(pick([`Super soigneur ! ${qui} te disent merci, cui cui !`, `Bravo ! ${qui} sont bien gâtés grâce à toi, capitaine soigneur !`]));
  }
  async function ontMange() {
    let v; try { v = await appel('/maison/vivant'); } catch (e) { return say("Je n'arrive pas à joindre la base."); }
    const a = v.animaux || {}, auj = new Date().toDateString(), so = (a.soins || []).filter(x => new Date(x.at * 1000).toDateString() === auj), qui = (a.noms || []).length ? liste(a.noms) : "Les cochons d'Inde";
    const faits = [...new Set(so.map(x => ({ foin: 'du foin', eau: "de l'eau fraîche", legumes: 'des légumes', granules: 'des granulés', cage: 'une cage propre', nourri: 'à manger' })[x.quoi] || x.quoi))];
    return say(faits.length ? `Aujourd'hui, ${qui} ont eu ${liste(faits)}. ${faits.length < 3 ? 'Tu peux encore les gâter !' : 'Ils sont super bien soignés !'}` : `${qui} n'ont encore rien eu aujourd'hui. Tu veux t'en occuper, soigneur ? Un peu de foin et des légumes !`);
  }
  async function arrose(n) {
    try { await appel('/maison/vivant', { action: 'arrose', lieu: /\bserre\b/.test(n) ? 'serre' : /\b(cour|dehors|grand carre)\b/.test(n) ? 'grand carre' : 'tout', de: 'enfant' }); } catch (e) { return say("Je n'arrive pas à joindre la base, mais bravo jardinier !"); }
    face.flash('happy'); return say(pick(['Bravo jardinier ! Les plantes vont pousser grâce à toi !', 'Super ! Le potager a bien bu. Bip bip, mission jardin réussie !']));
  }
  function route(text, n) {
    const ANIM = nomsAnimaux.length ? new RegExp(`\\b(cochons? d ?indes?|${nomsAnimaux.map(N).join('|')})\\b`) : /\bcochons? d ?indes?\b/;
    if (ANIM.test(n) && /\b(ont mange|a mange|ils ont eu|ont eu a manger|faim)\b/.test(n) && /\?|\best ce que\b/.test(text + ' ' + n)) return ontMange;
    if (/\b(j ai|on a|je viens de|j ai fini de)\s+(donne|mis|change|nettoye|nourri|rempli|remis|soigne)\b/.test(n) && (ANIM.test(n) || /\b(foin|biberon|cage|litiere|granules)\b/.test(n))) return () => soigneur(n);
    if (/\b(j ai|on a)\s+arrose\b/.test(n) && /\b(potager|serre|plantes?|jardin|carre|legumes|tomates|fleurs)\b/.test(n)) return () => arrose(n);
    if (/\b(mes missions|quelles sont mes missions|missions du jour|ma mission|mes missions galactiques)\b/.test(n) && !/\baccompli/.test(n)) return mesMissions;
    if (/\b(mission accomplie|mission reussie|j ai fini|j ai termine|j ai fait|j ai brosse|je me suis brosse|je me suis habille|j ai range|j ai lu|j ai aide|c est fait)\b/.test(n) && /\b(dents?|devoirs|chambre|lu|lire|lecture|livre|habille|aide|mission)\b/.test(n)) return () => accomplie(n);
    if (/\b(mon grade|quel est mon grade|mes points|combien j ai de points|mes medailles)\b/.test(n)) return grade;
    if (/\b(briefing|ma mission du jour|on fait le briefing)\b/.test(n)) return () => { briefFait = ''; return briefing(); };
    return null;
  }
  return { route, briefing, medaille, _bilan: bilan };
})();
