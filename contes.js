/* =========================================================
   SHADOW — les histoires du soir illustrées
   Pendant le dîner (18 h – 20 h 30, quand l'enfant est chez papa), Shadow écrit l'histoire de ce soir : 5 pages,
   l'enfant et son robot pour héros. Chaque page part à l'ordinateur de la maison, qui la dessine avec sa carte graphique
   (/maison/images, style « conte », en priorité). Au coucher (« raconte-moi une histoire »), Shadow la lit page par page,
   l'image en plein écran. Une image pas encore prête : la page est lue quand même.
   Navigateur ancien (Chrome 70) : pas de « ?. », pas de « ?? ».
   ========================================================= */
'use strict';

const CONTES = (() => {
  const root = () => (typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : '');
  const jour = () => new Date().toDateString();
  let enCours = false;
  async function appel(chemin, corps) {
    const r0 = root(); if (!r0 || window.__BANC) throw new Error('pas de maison');
    const r = await fetch(`${r0}${chemin}`, { method: corps ? 'POST' : 'GET', headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store' });
    if (!r.ok) throw new Error(`contes ${r.status}`);
    return r.json();
  }
  const pret = () => !!(S.conte && S.conte.jour === jour() && S.conte.pages && S.conte.pages.length);
  async function prepare() {
    if (enCours || pret() || !AI.ready() || !root()) return false;
    enCours = true;
    try {
      const deja = (S.contesTitres || []).slice(-10).join(', ');
      const raw = await AI.chat([{ role: 'system', content: "Tu écris des histoires du soir pour un garçon de 7 ans : douces, merveilleuses, jamais effrayantes, en français simple. Le héros est l'enfant, avec son petit robot Shadow. Une petite aventure (l'espace, la forêt magique, l'océan, les rêves, les étoiles, les dinosaures gentils…), puis un retour au calme et l'heure de dormir." },
        { role: 'user', content: `Écris l'histoire de ce soir pour ${name()}, en 5 pages de 2 ou 3 phrases courtes chacune. Différente de : ${deja || 'aucune'}. Pour chaque page, décris aussi l'image EN ANGLAIS pour un illustrateur de livre pour enfants (20 mots au plus : la scène, le décor, les couleurs ; « a little boy » et « a small friendly robot », sans nom, sans texte dans l'image). La dernière page finit par « Bonne nuit… ». Réponds UNIQUEMENT en JSON : {"titre": "…", "pages": [{"texte": "…", "image": "…"}]}` }], { maxTokens: 1400, temperature: 0.9 });
      const s = String(raw || ''); const o = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
      const pages = (o.pages || []).filter(p => p && p.texte).slice(0, 6).map(p => ({ texte: typeof ETHIQUE !== 'undefined' ? ETHIQUE.safe(String(p.texte)) : String(p.texte), image: String(p.image || '').slice(0, 220) }));
      if (pages.length < 3) return false;
      const d = new Date(), cle = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      let etats = {};
      try { const r = await appel('/maison/images', { demandes: pages.map((p, i) => ({ titre: `conte ${cle} page ${i + 1}`, prompt: p.image || 'a little boy and a small friendly robot under the stars', style: 'conte', prio: true })) }); etats = r.etats || {}; } catch (e) { etats = {}; }
      S.conte = { jour: jour(), titre: String(o.titre || 'L’histoire de ce soir'), pages: pages.map((p, i) => ({ texte: p.texte, cle: (etats[`conte ${cle} page ${i + 1}`] || {}).cle || '' })) };
      S.contesTitres = (S.contesTitres || []).concat([S.conte.titre]).slice(-20);
      save();
      return true;
    } catch (e) { return false; } finally { enCours = false; }
  }
  // la lecture : l'image en plein écran, le texte en bas, page après page
  async function lit() {
    const r0 = root(), c = S.conte;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99;background:#05070c;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .8s;opacity:0';
    ov.innerHTML = '<img style="max-width:100%;max-height:78%;border-radius:16px;box-shadow:0 0 60px rgba(120,160,255,.25);transition:opacity 1s;opacity:0" alt=""><div style="margin-top:18px;max-width:92%;color:#e8eefc;font:600 22px/1.35 system-ui,sans-serif;text-align:center;text-shadow:0 2px 10px #000"></div>';
    document.body.appendChild(ov);
    const img = ov.querySelector('img'), txt = ov.querySelector('div');
    setTimeout(() => { ov.style.opacity = '1'; }, 30);
    try {
      await say(`Ce soir, l'histoire s'appelle : ${c.titre}.`);
      for (const p of c.pages) {
        img.style.opacity = '0';
        if (p.cle && r0) { img.onload = () => { img.style.opacity = '1'; }; img.onerror = () => { img.style.opacity = '0'; }; img.src = `${r0}/maison/image/${p.cle}.jpg`; }
        txt.textContent = p.texte;
        await wait(900);
        await say(p.texte);
        await wait(700);
      }
    } finally {
      ov.style.opacity = '0'; setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 900);
      S.conte.lu = true; save();
    }
  }
  // pendant le dîner : il prépare l'histoire (l'ordinateur a le temps de la dessiner)
  setInterval(() => {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h < 18 || h > 20.5 || pret() || !dlg.started || window.SHADOW_CHEZ_PAPA === false || S.settings.contesIllustres === false) return;
    prepare().catch(() => {});
  }, 5 * 60000);
  return { prepare, pret, lit };
})();
