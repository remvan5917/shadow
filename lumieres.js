/* =========================================================
   SHADOW — ses lumières et ses appareils (seulement ceux que papa lui confie)
   - Papa coche dans Atlas les appareils que Shadow a le droit de piloter (la lampe de la chambre,
     la veilleuse…) ; l'ordinateur de la maison refuse tout le reste (/maison/shadow).
   - « Shadow, allume ma lampe », « éteins la veilleuse », « allume la télé »… (une prise peut alimenter n'importe quoi).
   - Pas de discothèque : l'ordinateur accepte au plus 12 commandes en 10 minutes.
   - « ma lumière », « ma chambre » : la lampe qui porte son prénom (pas toutes les lumières de la maison).
   - « mets ma veilleuse », « lumière douce », « baisse ma lumière », « à fond » : l'intensité et la teinte (ampoules réglables).
   - Si papa l'a choisi, à la fin de l'histoire du soir, il éteint ses lampes (celles de sa chambre).
   ========================================================= */
'use strict';

const LUMIERES = (() => {
  const root = () => (typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : '');
  async function appel(chemin, corps) {
    const r0 = root(); if (!r0 || window.__BANC) throw new Error('pas de maison');
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 15000);
    try {
      const r = await fetch(`${r0}${chemin}`, { method: corps ? 'POST' : 'GET', headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error(`lumières ${r.status}`);
      return await r.json();
    } finally { clearTimeout(tm); }
  }
  const VIDES = new Set(['la', 'le', 'les', 'l', 'de', 'du', 'des', 'd', 'ma', 'mon', 'mes', 'ta', 'ton', 'lumiere', 'lumieres', 'lampe', 'prise', 'shadow', 'stp', 'plait', 's', 'il', 'te']);
  const mots = t => N(t).split(' ').filter(w => w.length > 1 && !VIDES.has(w));
  // « ma lumière », « ma chambre » : la sienne (la lampe qui porte son prénom), pas toute la maison
  const moi = () => { try { return N(name()); } catch (e) { return ''; } };
  const aMoi = a => { const p = moi(); return !!p && N(a.nom).split(' ').includes(p); };
  const lum = a => a.type === 'lampe' || /\b(lumi\w*|lamp\w*|led|leds|veilleuse|guirlande|lampadaire)\b/.test(N(a.nom));
  function choisis(l, cible) {
    const m = mots(cible), c = N(cible);
    if (/\b(tout|toutes|tous)\b/.test(c)) return l; // « éteins tout » : tout ce qu'il a le droit
    // « allume ma lampe », « la lumière » : seulement des lumières (jamais la télé à la place), et d'abord la sienne
    if (!m.length) {
      if (!/\b(lampe|lampes|lumiere|lumieres)\b/.test(c)) return l;
      const ls = l.filter(lum), miens = ls.filter(aMoi);
      if (/\b(lampes|lumieres)\b/.test(c) && /\b(les|toutes)\b/.test(c)) return ls;
      return miens.length ? miens : ls.length <= 1 ? ls : null; // null : « laquelle ? »
    }
    const score = a => mots(a.nom).filter(x => m.some(w => x === w || (w.length > 3 && x.startsWith(w.slice(0, -1))))).length;
    const best = Math.max(0, ...l.map(score));
    if (!best) return []; // il demande autre chose que ce qu'il a le droit : on refuse (jamais « à peu près »)
    const t = l.filter(a => score(a) === best);
    if (t.length > 1 && !/\bpapa\b/.test(c) && t.some(aMoi)) return t.filter(aMoi); // « allume la chambre » : la sienne
    return t;
  }
  const noms = l => (l.length === 1 ? l[0].nom.toLowerCase() : `${l.slice(0, -1).map(a => a.nom.toLowerCase()).join(', ')} et ${l[l.length - 1].nom.toLowerCase()}`);
  const journal = [];
  const note = (quoi, res) => { journal.push(`${new Date().toTimeString().slice(0, 5)} ${quoi} → ${res}`); if (journal.length > 8) journal.shift(); };
  async function pilote(cible, allume) {
    let r; try { r = await appel('/maison/shadow'); } catch (e) { note(`${allume ? 'allume' : 'éteins'} ${cible}`, `maison injoignable (${e.message})`); return say("Oh, l'ordinateur de la maison ne répond pas. Je ne peux pas toucher aux lumières."); }
    if (!r.actif) return say("Papa a mis la maison en pause. Demande-lui !");
    const l = r.appareils || [];
    if (!l.length) return say("Je n'ai pas le droit de toucher aux appareils de la maison. C'est papa qui décide, avec Atlas !");
    // « allume ma lumière et la fusée », « éteins le salon, la cuisine et l'escalier » : chaque morceau choisit, on rassemble
    const bouts = morceaux(cible) || [cible];
    const choix = bouts.map(b => choisis(l, b));
    if (choix.some(x => x === null) && bouts.length === 1) return say(`Laquelle ? Je peux allumer ${noms(l.filter(lum))}.`);
    const c = [...new Set(choix.flatMap(x => (x === null ? l.filter(lum).filter(aMoi) : x)))];
    const pasLeDroit = bouts.length > 1 ? bouts.filter((b, i) => Array.isArray(choix[i]) && !choix[i].length).map(b => b.replace(/^(la|le|les|l|ma|mon|mes)\s+/, '').replace(/\btele(vision)?\b/, 'la télé')) : [];
    if (!c.length) return say(`Ça, je n'ai pas le droit. Moi, je peux seulement allumer et éteindre ${noms(l)}.`);
    let res; try { res = await appel('/maison/shadow/commande', { ids: c.map(a => a.id), allume }); } catch (e) { return say("Oups, ça n'a pas marché. Réessaie dans un instant !"); }
    if (res.refus === 'trop') return say("Ouh là, on a assez joué avec les boutons ! On laisse tout tranquille un petit moment.");
    if (res.refus) return say("Je n'ai pas le droit. Demande à papa !");
    const ok = (res.resultats || []).filter(x => x.ok);
    if (!ok.length) return say("Ça ne répond pas. C'est peut-être débranché.");
    face.flash('happy'); fx.tone(allume ? [[784, 0.06], [1175, 0.1]] : [[1175, 0.06], [784, 0.1]]);
    const lumiere = c.every(lum);
    note(`${allume ? 'allume' : 'éteins'} ${cible}`, `ok : ${c.map(a => a.nom).join(', ')}`);
    const fin = allume ? pick(lumiere ? ['Et la lumière fut !', 'Pouf, allumé !', `C'est allumé, ${name()} !`] : ['Pouf, allumé !', `C'est allumé, ${name()} !`, 'Hop, en marche !']) : pick(['Pouf, éteint !', "C'est éteint.", 'Hop, éteint !']);
    return say(pasLeDroit.length ? `${fin} Mais ${pasLeDroit.join(' et ')}, je n'ai pas le droit.` : fin);
  }
  // l'intensité et la teinte (ses ampoules réglables) : « mets ma veilleuse », « lumière douce », « plus fort », « à fond »
  const AMB = [
    { re: /\b(veilleuse|mode nuit|lumiere de nuit|pour dormir|dodo)\b/, lum: 3, teinte: 0, dit: ['Mode veilleuse. Bonne nuit !', 'Tout doux, comme une veilleuse.'] },
    { re: /\b(douce|doux|tamise|tamisee|calme|cosy|histoire)\b/, lum: 25, teinte: 0, dit: ['Lumière toute douce.', 'Voilà, tout doux.'] },
    { re: /\b(lire|lecture|devoirs|dessiner|dessin)\b/, lum: 100, teinte: 60, dit: ['Lumière pour lire !', "Voilà, on y voit bien."] },
    { re: /\b(a fond|au maximum|au max|plein pot|le plus fort)\b/, lum: 100, teinte: 50, dit: ['À fond !', 'Pleine lumière !'] },
  ];
  const COULEUR = /\b(bleu|bleue|rouge|vert|verte|violet|violette|rose|jaune|orange|turquoise|multicolore|couleur|couleurs|arc en ciel|disco)\b/;
  function voeu(n) {
    const a = AMB.find(x => x.re.test(n));
    if (a) return { lum: a.lum, teinte: a.teinte, dit: a.dit };
    const pc = n.match(/\b(\d{1,3}) (?:pour ?cents?|pourcent)\b/) || n.match(/\ba (\d{1,3})\b/);
    if (pc) return { lum: Math.max(1, Math.min(100, +pc[1])) };
    if (/\b(baisse|diminue|moins fort|moins forte|trop fort|trop forte|moins de lumiere|ca eblouit)\b/.test(n)) return { delta: -30 };
    if (/\b(monte|augmente|plus fort|plus forte|plus de lumiere|trop sombre|on voit rien|on y voit rien)\b/.test(n)) return { delta: 30 };
    if (/\b(chaud|chaude|jaune)\b/.test(n)) return { teinte: 0 };
    if (/\b(froid|froide|blanc|blanche)\b/.test(n)) return { teinte: 100 };
    return null;
  }
  async function regle(cible, o) {
    let r; try { r = await appel('/maison/shadow'); } catch (e) { note(`règle ${cible}`, `maison injoignable (${e.message})`); return say("Oh, l'ordinateur de la maison ne répond pas."); }
    if (!r.actif) return say("Papa a mis la maison en pause. Demande-lui !");
    const l = (r.appareils || []).filter(a => lum(a) && (a.lum != null || a.teinte != null));
    if (!l.length) return say("Ma lumière ne sait pas changer de force. Je peux juste l'allumer ou l'éteindre !");
    // de la phrase, on ne garde que les noms de lampes (« baisse la lumière du salon » → salon) ; sinon, c'est la sienne
    const connusMots = l.flatMap(a => mots(a.nom));
    const garde = mots(cible).filter(w => connusMots.some(x => x === w || (w.length > 3 && x.startsWith(w.slice(0, -1)))));
    const bouts = (morceaux(cible) || [cible]).map(b => mots(b).filter(w => connusMots.some(x => x === w || (w.length > 3 && x.startsWith(w.slice(0, -1))))));
    const c = /\b(tout|toutes|tous)\b/.test(cible) ? choisis(l, 'toutes les lumieres') : !garde.length ? choisis(l, 'ma lumiere')
      : [...new Set(bouts.filter(b => b.length).flatMap(b => choisis(l, b.join(' ')) || []))];
    if (c === null) return say(`Laquelle ? Il y a ${noms(l)}.`);
    if (!c.length) return say(`Ça, je n'ai pas le droit. Moi, je peux régler ${noms(l)}.`);
    const val = a => {
      const lu = o.lum != null ? o.lum : o.delta ? Math.max(3, Math.min(100, (a.allume ? a.lum || 100 : 50) + o.delta)) : (a.allume && a.lum ? a.lum : 100);
      return { lum: lu, teinte: o.teinte != null ? o.teinte : undefined };
    };
    const groupes = {}; // les lampes réglées pareil partent ensemble (une seule commande pour « toutes les lumières »)
    for (const a of c) { const v = val(a), k = JSON.stringify(v); (groupes[k] = groupes[k] || { v, ids: [] }).ids.push(a.id); }
    let ok = 0;
    for (const g of Object.values(groupes)) {
      let res; try { res = await appel('/maison/shadow/commande', Object.assign({ ids: g.ids, allume: true }, g.v)); } catch (e) { return say("Oups, ça n'a pas marché. Réessaie dans un instant !"); }
      if (res.refus === 'trop') return say("Ouh là, on a assez joué avec les boutons ! On laisse tout tranquille un petit moment.");
      if (res.refus) return say("Je n'ai pas le droit. Demande à papa !");
      ok += (res.resultats || []).filter(x => x.ok).length;
    }
    if (!ok) { note(`règle ${cible}`, 'pas de réponse des lampes'); return say("Ça ne répond pas. C'est peut-être débranché."); }
    note(`règle ${cible}`, `ok : ${c.map(a => a.nom).join(', ')}`);
    face.flash('happy'); fx.tone([[880, 0.05], [1046, 0.08]]);
    if (o.dit) return say(pick(o.dit));
    if (o.delta) return say(o.delta < 0 ? pick(['Un peu moins fort.', 'Voilà, plus doux.']) : pick(['Plus fort !', 'Et hop, plus de lumière !']));
    if (o.teinte != null && o.lum == null) return say(o.teinte < 50 ? 'Lumière chaude, comme un feu de camp.' : 'Lumière blanche, comme en plein jour.');
    return say(`C'est réglé à ${o.lum} pour cent.`);
  }
  // la fin de l'histoire du soir : si papa l'a choisi, il éteint ses lampes
  async function coucher() {
    try {
      const r = await appel('/maison/shadow');
      if (!r.actif || !r.coucher) return;
      const l = (r.appareils || []).filter(a => a.allume !== false && (!lum(a) || aMoi(a))); // ses lampes à lui, pas le salon de papa
      if (l.length) await appel('/maison/shadow/commande', { ids: l.map(a => a.id), allume: false, coucher: true });
    } catch (e) { /* tant pis */ }
  }
  // les noms de ce qu'il a le droit de piloter (« allume l'étoile », si papa lui a confié « Étoile »)
  let connus = [];
  const rafraichir = () => appel('/maison/shadow').then(r => { connus = (r.appareils || []).map(x => x.nom); }).catch(() => {});
  setTimeout(rafraichir, 9000); setInterval(rafraichir, 5 * 60000);
  const R = /^(?:shadow\s+)?(allume|rallume|eteins|eteint|eteind|coupe)\s+(?!toi\b)(.+)$/;
  // ce qu'un enfant peut vouloir allumer (s'il n'en a pas le droit, Shadow le lui dit gentiment)
  const LAMPE = /\b(lumiere|lampe|veilleuse|lumieres|guirlande|lampadaire|prise|led|leds|tout|tele|television|ventilateur|ventilo|radio|console|musique|enceinte|chauffage|radiateur|aquarium|projecteur|ecran de la tele)\b/;
  // « mets ma lumière en veilleuse », « baisse ma lampe », « lumière plus forte », « mets la veilleuse »
  const R2 = /^(?:shadow\s+)?(?:mets|met|baisse|monte|augmente|diminue|tamise|fais|passe|regle)\b|\b(lumiere|lampe|veilleuse)\b.*\b(plus|moins|trop|douce|doux|fort|forte|chaud|chaude|froid|froide|a fond|tamisee)\b/;
  const morceaux = t => { const p = String(t).split(/\s*(?:,|\bet\b|\bpuis\b|\bainsi que\b)\s*/).map(x => x.trim()).filter(Boolean); return p.length > 1 ? p : null; };
  function route(text, n) {
    // « allume ma lumière et éteins la fusée » : deux ordres dans la même phrase, l'un après l'autre
    const bouts = morceaux(n);
    if (bouts && bouts.filter(b => /^(?:shadow\s+)?(allume|rallume|eteins|eteint|eteind|coupe|mets|met|baisse|monte)\b/.test(b)).length > 1) {
      const ordres = []; let cur = null;
      for (const b of bouts) { if (/^(?:shadow\s+)?(allume|rallume|eteins|eteint|eteind|coupe|mets|met|baisse|monte)\b/.test(b) || !cur) { cur = b; ordres.push(cur); } else ordres[ordres.length - 1] = `${ordres[ordres.length - 1]} et ${b}`; }
      const fs = ordres.map(o => route1(o, o));
      if (fs.every(Boolean)) return async () => { for (const f of fs) await f(); };
    }
    return route1(text, n);
  }
  function route1(text, n) {
    if (R2.test(n) && (/\b(lumiere|lumieres|lampe|lampes|veilleuse|chambre)\b/.test(n) || connus.some(x => mots(x).some(w => mots(n).includes(w)))) && !/\b(son|volume|musique|tele|television)\b/.test(n) && !/^(?:shadow\s+)?(allume|rallume|eteins|eteint|eteind|coupe)\b/.test(n)) {
      if (COULEUR.test(n) && !/\b(chaud|chaude|froid|froide|jaune|blanc|blanche)\b/.test(n)) return () => say("Ma lampe ne fait que du blanc : du blanc tout chaud, comme un feu de camp, ou du blanc comme en plein jour. Pas de couleurs, désolé !");
      const o = voeu(n);
      if (o) return () => regle(n, o);
    }
    const m = n.match(R);
    if (!m) return null;
    const cible = m[2], nm = mots(cible);
    if (!LAMPE.test(cible) && !connus.some(x => mots(x).some(w => nm.includes(w)))) return null;
    return () => pilote(cible, /^r?allume/.test(m[1]));
  }
  return { route, pilote, regle, coucher, journal: () => journal.slice(), _rafraichir: rafraichir };
})();
