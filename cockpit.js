/* =========================================================
   SHADOW — la station de pilotage : le cockpit de l'enfant (cockpit.html), comme celui de papa
   - « Shadow, ouvre ma station », « mon cockpit », « la station de pilotage » : le tableau de bord en grand,
     Shadow en petit dans le coin (il écoute et parle toujours). « Ferme la station », ou le bouton « Retour à Shadow ».
   - Une activité lancée depuis la station (une histoire, Jacques a dit…) : on revient sur son visage pour jouer ;
     un petit bouton « Station » reste dans le coin pour y retourner.
   ========================================================= */
'use strict';

const SHADOW_COCKPIT = (() => {
  let retourT = null;
  const ouvert = () => document.body.classList.contains('cockpit');
  function pleinEcran() {
    if (!ouvert() || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  function boutonRetour(montre) {
    let b = document.getElementById('station-retour');
    clearTimeout(retourT);
    if (!montre) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button'); b.id = 'station-retour'; b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg><span>STATION</span>';
      b.onclick = e => { e.stopPropagation(); ouvre(); };
      document.body.appendChild(b);
    }
    retourT = setTimeout(() => boutonRetour(false), 30 * 60000);
  }
  function ouvre() {
    document.body.classList.add('cockpit'); boutonRetour(false);
    let f = document.getElementById('station-cadre');
    if (!f) {
      f = document.createElement('iframe'); f.id = 'station-cadre'; f.title = 'La station de pilotage';
      f.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;z-index:4;background:#03050d'; // la taille ici aussi : jamais 300 × 150, même avec une vieille feuille de style
      const taille = () => { if (f.isConnected) { f.style.width = `${innerWidth}px`; f.style.height = `${innerHeight}px`; } }; // la hauteur VISIBLE (sans la barre de Chrome, que 100vh compte)
      taille(); addEventListener('resize', taille); f.addEventListener('load', taille);
      f.src = `cockpit.html?v=${window.SHADOW_VERSION || ''}`;
      document.body.appendChild(f);
      f.addEventListener('load', () => { try { f.contentDocument.addEventListener('pointerdown', pleinEcran); } catch (e) { /* rien */ } });
    }
    try { localStorage.setItem('shadow-station', '1'); } catch (e) { /* rien */ }
    window.dispatchEvent(new Event('resize'));
  }
  function ferme(retour = false) {
    document.body.classList.remove('cockpit');
    const f = document.getElementById('station-cadre'); if (f) f.remove();
    if (document.fullscreenElement && document.exitFullscreen && !retour) document.exitFullscreen().catch(() => {});
    boutonRetour(retour);
    try { localStorage.setItem('shadow-station', '0'); } catch (e) { /* rien */ }
    window.dispatchEvent(new Event('resize'));
  }
  // depuis la station : on revient sur Shadow, et il lance l'activité comme si on la lui avait demandée
  function lance(texte) {
    ferme(true);
    setTimeout(() => { if (typeof handle === 'function') handle(texte); }, 250);
  }
  // elle se rallume en station si elle l'était (la tablette, le soir)
  setTimeout(() => { try { if (localStorage.getItem('shadow-station') === '1') ouvre(); } catch (e) { /* rien */ } }, 1500);

  function route(text, n) {
    const mot = '(station|station de pilotage|cockpit|poste de pilotage|tableau de bord)';
    if (new RegExp(`\\b(ferme|quitte|sors de|range|cache|enleve)\\b.*\\b${mot}\\b`).test(n)) return () => { ferme(); return say(pick(['Station fermée. Je suis là !', 'Retour sur mon visage ! Bip bip !'])); };
    if (new RegExp(`\\b(ouvre|ouvrir|montre|affiche|allume|lance|mets)\\b.*\\b${mot}\\b|^(ma|la|mon|le) ${mot}$|\\bmode ${mot}\\b`).test(n)) return () => { ouvre(); fx.tone([[523, 0.08], [784, 0.08], [1047, 0.16]]); return say(pick([`Station de pilotage en ligne ! Aux commandes, capitaine ${name()} !`, `Bienvenue dans ta station, capitaine ${name()} ! Touche ce que tu veux, ou parle-moi.`])); };
    return null;
  }
  return { route, ouvre, ferme, lance, ouvert };
})();
window.SHADOW_COCKPIT = SHADOW_COCKPIT;
