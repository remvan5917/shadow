/* =========================================================
   SHADOW — ses lumières (seulement celles que papa lui confie)
   - Papa coche dans Atlas les appareils que Shadow a le droit de piloter (la lampe de la chambre,
     la veilleuse…) ; l'ordinateur de la maison refuse tout le reste (/maison/shadow).
   - « Shadow, allume ma lampe », « éteins la veilleuse », « éteins la lumière ».
   - Pas de discothèque : l'ordinateur accepte au plus 12 commandes en 10 minutes.
   - Si papa l'a choisi, à la fin de l'histoire du soir, il éteint ses lampes.
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
  function choisis(l, cible) {
    const m = mots(cible);
    if (!m.length || /\b(tout|toutes|tous)\b/.test(N(cible))) return l; // « allume la lumière », « éteins tout » : tout ce qu'il a le droit
    const t = l.filter(a => mots(a.nom).some(x => m.some(w => x === w || (w.length > 3 && x.startsWith(w.slice(0, -1))))));
    return t; // il demande autre chose que ce qu'il a le droit : on refuse (jamais « à peu près »)
  }
  const noms = l => (l.length === 1 ? l[0].nom.toLowerCase() : `${l.slice(0, -1).map(a => a.nom.toLowerCase()).join(', ')} et ${l[l.length - 1].nom.toLowerCase()}`);
  async function pilote(cible, allume) {
    let r; try { r = await appel('/maison/shadow'); } catch (e) { return say("Oh, l'ordinateur de la maison ne répond pas. Je ne peux pas toucher aux lumières."); }
    if (!r.actif) return say("Papa a mis les lumières en pause. Demande-lui !");
    const l = r.appareils || [];
    if (!l.length) return say("Je n'ai pas encore le droit de toucher aux lumières. C'est papa qui décide, avec Atlas !");
    const c = choisis(l, cible);
    if (!c.length) return say(`Ça, je n'ai pas le droit. Moi, je peux seulement allumer ${noms(l)}.`);
    let res; try { res = await appel('/maison/shadow/commande', { ids: c.map(a => a.id), allume }); } catch (e) { return say("Oups, ça n'a pas marché. Réessaie dans un instant !"); }
    if (res.refus === 'trop') return say("Ouh là, on a assez joué avec la lumière ! On la laisse tranquille un petit moment.");
    if (res.refus) return say("Je n'ai pas le droit. Demande à papa !");
    const ok = (res.resultats || []).filter(x => x.ok);
    if (!ok.length) return say(`${c.length > 1 ? 'Elles ne répondent' : 'Elle ne répond'} pas. Elle est peut-être débranchée.`);
    face.flash('happy'); fx.tone(allume ? [[784, 0.06], [1175, 0.1]] : [[1175, 0.06], [784, 0.1]]);
    return say(allume ? pick(['Et la lumière fut !', 'Pouf, allumé !', `C'est allumé, ${name()} !`]) : pick(['Pouf, éteint !', "C'est éteint.", 'Hop, éteint !']));
  }
  // la fin de l'histoire du soir : si papa l'a choisi, il éteint ses lampes
  async function coucher() {
    try {
      const r = await appel('/maison/shadow');
      if (!r.actif || !r.coucher) return;
      const l = (r.appareils || []).filter(a => a.allume !== false);
      if (l.length) await appel('/maison/shadow/commande', { ids: l.map(a => a.id), allume: false, coucher: true });
    } catch (e) { /* tant pis */ }
  }
  // les noms de ce qu'il a le droit de piloter (« allume l'étoile », si papa lui a confié « Étoile »)
  let connus = [];
  const rafraichir = () => appel('/maison/shadow').then(r => { connus = (r.appareils || []).map(x => x.nom); }).catch(() => {});
  setTimeout(rafraichir, 9000); setInterval(rafraichir, 5 * 60000);
  const R = /^(?:shadow\s+)?(allume|rallume|eteins|eteint|eteind|coupe)\s+(?!toi\b)(.+)$/;
  const LAMPE = /\b(lumiere|lampe|veilleuse|lumieres|guirlande|lampadaire|prise|led|leds|tout)\b/;
  function route(text, n) {
    const m = n.match(R);
    if (!m) return null;
    const cible = m[2], nm = mots(cible);
    if (!LAMPE.test(cible) && !connus.some(x => mots(x).some(w => nm.includes(w)))) return null;
    return () => pilote(cible, /^r?allume/.test(m[1]));
  }
  return { route, pilote, coucher, _rafraichir: rafraichir };
})();
