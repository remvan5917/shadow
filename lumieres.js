/* =========================================================
   SHADOW — ses lumières et ses appareils (seulement ceux que papa lui confie)
   - Papa coche dans Atlas les appareils que Shadow a le droit de piloter (la lampe de la chambre,
     la veilleuse…) ; l'ordinateur de la maison refuse tout le reste (/maison/shadow).
   - « Shadow, allume ma lampe », « éteins la veilleuse », « allume la télé »… (une prise peut alimenter n'importe quoi).
   - Pas de discothèque : l'ordinateur accepte au plus 12 commandes en 10 minutes.
   - « ma lumière », « ma chambre » : la lampe qui porte son prénom (pas toutes les lumières de la maison).
   - « mets ma veilleuse », « lumière douce », « baisse ma lumière », « à fond » : l'intensité et la teinte (ampoules réglables).
   - « lance la fusée » : le compte à rebours, et la Fusée s'allume au décollage ; en duo quand Atlas lance la séquence.
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
  // la fusée : « Shadow, lance la fusée » (seul), ou en duo quand Atlas lance la séquence (le canal direct de la maison)
  const canal = (nom, msg) => appel(`/maison/canal/${nom}`, msg).catch(() => {});
  async function fusee(duo) {
    let r = null; try { r = await appel('/maison/shadow'); } catch (e) { /* sans la maison, il fait le compte à rebours quand même */ }
    const f = r && r.actif && (r.appareils || []).find(a => /\bfusee\b/.test(N(a.nom)));
    if (duo) canal('atlas', { type: 'fusee-pret', de: 'shadow' });
    face.flash('happy');
    await say(duo ? pick(['Reçu, Atlas ! Équipage prêt pour le lancement !', 'Prêt, Atlas ! Je lance le compte à rebours !']) : pick(['Séquence de lancement ! Attache ta ceinture !', 'Tous à vos postes : on décolle !']));
    if (f && f.allume) { try { await appel('/maison/shadow/commande', { ids: [f.id], allume: false }); } catch (e) { /* tant pis */ } }
    await say('Dix… neuf… huit… sept… six… cinq… quatre… trois… deux… un…');
    let partie = false;
    if (f) { try { const c = await appel('/maison/shadow/commande', { ids: [f.id], allume: true }); partie = (c.resultats || []).some(x => x.ok); } catch (e) { /* tant pis */ } }
    fx.tone([[220, 0.25], [330, 0.25], [440, 0.25], [880, 0.5]]); face.flash('happy');
    await say(partie ? 'Décollage ! La Fusée est allumée !' : 'Décollage ! Vroooum !');
    if (duo) canal('atlas', { type: 'fusee-ok', de: 'shadow' });
  }
  // le message holographique de papa : projeté en plein écran façon hologramme bleu, quand l'enfant est là
  let holoAttente = [], holoDernier = null;
  const enfantLa = () => (typeof VISION !== 'undefined' && VISION.isOn() && VISION.state.faces.some(f => f.name && S.prenom && f.name === S.prenom)) || Date.now() - (dlg.lastTalk || 0) < 3 * 60000;
  async function holoReleve() {
    try { const r = await appel('/maison/hologramme'); holoAttente = (r.hologrammes || []).filter(h => !h.lu && h.de !== 'enfant').map(h => h.id); } catch (e) { /* plus tard */ }
  }
  async function projette(id, rejoue) {
    const r0 = root(); if (!r0) return;
    let url; try { const b = await (await fetch(`${r0}/maison/hologramme/${id}`, { cache: 'no-store' })).blob(); if (b.size < 5000) return; url = URL.createObjectURL(b); } catch (e) { return; }
    dlg.busy = true;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:60;background:radial-gradient(60% 55% at 50% 55%,#06223a,#000 75%);display:grid;place-items:center;opacity:0;transition:opacity .8s';
    el.innerHTML = `<style>@keyframes holoClig{0%,100%{opacity:.9}47%{opacity:.75}50%{opacity:.4}53%{opacity:.85}}@keyframes holoBal{from{background-position:0 0}to{background-position:0 40px}}</style>
      <div style="position:relative;width:min(86vw,720px);animation:holoClig 3.2s infinite">
        <video playsinline style="width:100%;display:block;border-radius:10px;filter:sepia(1) hue-rotate(165deg) saturate(3) brightness(1.25) contrast(1.15);mix-blend-mode:screen;-webkit-mask-image:radial-gradient(70% 70% at 50% 50%,#000 60%,transparent 100%);mask-image:radial-gradient(70% 70% at 50% 50%,#000 60%,transparent 100%)"></video>
        <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(125,211,252,.12) 0 2px,transparent 2px 6px);animation:holoBal 2s linear infinite;pointer-events:none"></div>
        <div style="position:absolute;left:50%;bottom:-60px;transform:translateX(-50%);width:70%;height:60px;background:radial-gradient(50% 100% at 50% 100%,rgba(125,211,252,.35),transparent 70%)"></div>
      </div>
      <div style="position:fixed;top:14px;left:0;right:0;text-align:center;font:13px ui-monospace,monospace;letter-spacing:.35em;color:#7dd3fc">◢ MESSAGE HOLOGRAPHIQUE · PAPA</div>`;
    document.body.appendChild(el);
    try {
      if (!rejoue) { fx.tone([[523, 0.12], [784, 0.12], [1047, 0.25]]); await say(pick(['Bip bip ! Message holographique entrant… de papa !', 'Transmission holographique reçue ! C\'est un message de papa !'])); }
      OREILLES.mute(true);
      requestAnimationFrame(() => { el.style.opacity = '1'; });
      const v = el.querySelector('video'); v.src = url;
      await new Promise(res => { v.onended = res; v.onerror = res; el.onclick = res; setTimeout(res, 40000); v.play().catch(() => { v.muted = true; v.play().catch(res); }); });
    } finally {
      el.style.opacity = '0'; setTimeout(() => { el.remove(); URL.revokeObjectURL(url); }, 900);
      OREILLES.mute(false); dlg.busy = false;
    }
    holoDernier = id;
    if (!rejoue) { appel('/maison/hologramme', { lu: id }).catch(() => {}); await say(pick(['Fin de la transmission. Tu veux le revoir ? Dis : rejoue le message.', 'Message terminé ! Dis « rejoue le message » pour le revoir.'])); }
  }
  // l'inverse : l'enfant enregistre un message holographique pour papa (Atlas le projette chez papa)
  async function pourPapa() {
    if (!window.MediaRecorder || !navigator.mediaDevices) return say("Oh, je ne sais pas filmer sur cet appareil.");
    let video = null, audio = null, propre = null;
    try {
      audio = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (typeof VISION !== 'undefined' && VISION.isOn() && VISION.flux()) video = VISION.flux().getVideoTracks()[0];
      else { propre = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }); video = propre.getVideoTracks()[0]; }
    } catch (e) { if (audio) audio.getTracks().forEach(t => t.stop()); return say("Oups, je n'arrive pas à ouvrir ma caméra et mon micro."); }
    const flux = new MediaStream([video, ...audio.getAudioTracks()]);
    const rot = typeof VISION !== 'undefined' && VISION.rotation ? VISION.rotation() : 0;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:60;background:#000;display:grid;place-items:center';
    el.innerHTML = `<video autoplay muted playsinline style="max-width:92vw;max-height:80vh;border-radius:14px;transform:rotate(${rot}deg);filter:sepia(1) hue-rotate(165deg) saturate(2.4) brightness(1.1)"></video>
      <div data-e style="position:fixed;top:16px;left:0;right:0;text-align:center;font:15px ui-monospace,monospace;letter-spacing:.3em;color:#7dd3fc">◢ MESSAGE POUR PAPA · PRÊT</div>
      <div style="position:fixed;bottom:18px;left:0;right:0;text-align:center;font:14px system-ui;color:#7dd3fc">Touche l'écran pour arrêter</div>`;
    document.body.appendChild(el); el.querySelector('video').srcObject = flux;
    dlg.busy = true;
    try {
      await say(pick(['Super ! Regarde-moi bien et parle à papa. Trois, deux, un… action !', 'Message holographique pour papa ! Souris ! Trois, deux, un… c\'est parti !']));
      OREILLES.mute(true);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
      const rec = new MediaRecorder(flux, { mimeType: type, videoBitsPerSecond: 800000 }), morceaux = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) morceaux.push(e.data); };
      const fini = new Promise(r => { rec.onstop = r; });
      rec.start(500); fx.tone([[1319, 0.12]]);
      const etat = el.querySelector('[data-e]'), t0 = Date.now();
      const tic = setInterval(() => { etat.textContent = `◢ ENREGISTREMENT ● ${Math.max(0, 20 - Math.round((Date.now() - t0) / 1000))}`; }, 250);
      await new Promise(r => { const t = setTimeout(r, 20000); el.onclick = () => { clearTimeout(t); r(); }; });
      clearInterval(tic); rec.stop(); await fini;
      OREILLES.mute(false); fx.tone([[1319, 0.08], [988, 0.14]]);
      const blob = new Blob(morceaux, { type: 'video/webm' });
      if (blob.size < 5000) return say("Oh, ça n'a pas marché. On réessaie ?");
      const r0 = root();
      const r = await fetch(`${r0}/maison/hologramme?de=enfant&rot=${rot}`, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: blob, cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      face.flash('happy');
      return say(pick(['Message holographique envoyé à papa ! Il va te voir en hologramme !', 'Bip bip, transmission envoyée ! Papa va recevoir ton hologramme.']));
    } catch (e) { return say("Oups, je n'ai pas réussi à l'envoyer à papa."); }
    finally { OREILLES.mute(false); el.remove(); audio.getTracks().forEach(t => t.stop()); if (propre) propre.getTracks().forEach(t => t.stop()); dlg.busy = false; }
  }

  // toutes les 30 secondes : un message attend et l'enfant est là → on le projette
  setInterval(async () => {
    if (!holoAttente.length || !dlg.started || dlg.busy || voice.speaking || OREILLES.hearing() || dlg.expect || !['standby', 'talk'].includes(dlg.state) || !enfantLa()) return;
    const id = holoAttente.shift(); await projette(id, false);
  }, 30000);
  setTimeout(holoReleve, 15000); setInterval(holoReleve, 10 * 60000);

  // il écoute le canal direct : Atlas peut lui demander de faire le compte à rebours
  async function ecoute() {
    for (;;) {
      const r0 = root();
      if (!r0 || window.__BANC || !dlg.started) { await new Promise(r => setTimeout(r, 10000)); continue; }
      try {
        const j = await (await fetch(`${r0}/maison/canal/shadow?attente=25`, { cache: 'no-store' })).json();
        for (const m of j.messages || []) {
          if (m.type === 'fusee' && !dlg.busy) await fusee(true);
          // l'heure du coucher (la maison a allumé la salle de bain, la Fusée, sa radio et sa lumière)
          else if (m.type === 'hologramme') { if (m.texte && !holoAttente.includes(m.texte)) holoAttente.push(m.texte); }
          else if (m.type === 'coucher') { face.flash('happy'); fx.tone([[523, 0.15], [659, 0.15], [784, 0.3]]); await say(pick([`${name()}, c'est l'heure d'aller au lit ! Va vite te brosser les dents : la salle de bain est allumée. Je t'ai mis la Fusée et ta radio.`, `Mission dodo, ${name()} ! D'abord les dents à la salle de bain, ensuite au lit : la Fusée et ta radio t'attendent.`])); }
        }
      } catch (e) { await new Promise(r => setTimeout(r, 15000)); }
    }
  }
  setTimeout(ecoute, 12000);
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
    if (/\b(enregistre|filme|fais|envoie)\b.*\b(message|video|hologramme)\b.*\bpapa\b|\bmessage (video|holographique) pour papa\b|\bhologramme pour papa\b/.test(n)) return pourPapa;
    if (/\b(rejoue|remets|revoir|repasse) (le |ton |mon )?(message|hologramme)\b/.test(n) && holoDernier) return () => projette(holoDernier, true);
    if (/\b(lance la fusee|lancement de la fusee|fais decoller la fusee|compte a rebours|decollage)\b/.test(n)) return () => fusee(false);
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
  return { route, pilote, regle, coucher, fusee, pourPapa, journal: () => journal.slice(), _rafraichir: rafraichir };
})();
