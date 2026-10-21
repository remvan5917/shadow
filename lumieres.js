/* =========================================================
   SHADOW — ses lumières et ses appareils (seulement ceux que papa lui confie)
   - Papa coche dans Atlas les appareils que Shadow a le droit de piloter (la lampe de la chambre,
     la veilleuse…) ; l'ordinateur de la maison refuse tout le reste (/maison/shadow).
   - « Shadow, allume ma lampe », « éteins la veilleuse », « allume la télé »… (une prise peut alimenter n'importe quoi).
   - Pas de discothèque : l'ordinateur accepte au plus 12 commandes en 10 minutes.
   - « ma lumière », « ma chambre » : la lampe qui porte son prénom (pas toutes les lumières de la maison).
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
  async function pilote(cible, allume) {
    let r; try { r = await appel('/maison/shadow'); } catch (e) { return say("Oh, l'ordinateur de la maison ne répond pas. Je ne peux pas toucher aux lumières."); }
    if (!r.actif) return say("Papa a mis la maison en pause. Demande-lui !");
    const l = r.appareils || [];
    if (!l.length) return say("Je n'ai pas le droit de toucher aux appareils de la maison. C'est papa qui décide, avec Atlas !");
    const c = choisis(l, cible);
    if (c === null) return say(`Laquelle ? Je peux allumer ${noms(l.filter(lum))}.`);
    if (!c.length) return say(`Ça, je n'ai pas le droit. Moi, je peux seulement allumer et éteindre ${noms(l)}.`);
    let res; try { res = await appel('/maison/shadow/commande', { ids: c.map(a => a.id), allume }); } catch (e) { return say("Oups, ça n'a pas marché. Réessaie dans un instant !"); }
    if (res.refus === 'trop') return say("Ouh là, on a assez joué avec les boutons ! On laisse tout tranquille un petit moment.");
    if (res.refus) return say("Je n'ai pas le droit. Demande à papa !");
    const ok = (res.resultats || []).filter(x => x.ok);
    if (!ok.length) return say("Ça ne répond pas. C'est peut-être débranché.");
    face.flash('happy'); fx.tone(allume ? [[784, 0.06], [1175, 0.1]] : [[1175, 0.06], [784, 0.1]]);
    const lumiere = c.every(lum);
    return say(allume ? pick(lumiere ? ['Et la lumière fut !', 'Pouf, allumé !', `C'est allumé, ${name()} !`] : ['Pouf, allumé !', `C'est allumé, ${name()} !`, 'Hop, en marche !']) : pick(['Pouf, éteint !', "C'est éteint.", 'Hop, éteint !']));
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
  function route(text, n) {
    const m = n.match(R);
    if (!m) return null;
    const cible = m[2], nm = mots(cible);
    if (!LAMPE.test(cible) && !connus.some(x => mots(x).some(w => nm.includes(w)))) return null;
    return () => pilote(cible, /^r?allume/.test(m[1]));
  }
  return { route, pilote, coucher, _rafraichir: rafraichir };
})();
