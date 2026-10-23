/* =========================================================
   SHADOW — le messager entre papa et l'enfant
   - Papa dit à Atlas « dis à mon fils que je rentre à 19 h » : le message attend sur l'ordinateur
     de la maison (/maison/messages) ; Shadow le dit dès que l'enfant est là (vu à la caméra,
     ou il vient de lui parler), puis propose de répondre.
   - « Shadow, dis à papa que je l'aime » / « envoie un message à papa » : Atlas le dit à papa.
   - « Papa m'a répondu ? », « j'ai un message ? » : il relit ce qui attend.
   Les messages restent 3 jours sur l'ordinateur de la maison, jamais ailleurs.
   ========================================================= */
'use strict';

const MESSAGES = (() => {
  const root = () => (typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : '');
  let attente = [];
  async function appel(chemin, corps) {
    const r0 = root(); if (!r0 || window.__BANC) throw new Error('pas de maison');
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 8000);
    try {
      const r = await fetch(`${r0}${chemin}`, { method: corps ? 'POST' : 'GET', headers: corps ? { 'Content-Type': 'application/json' } : {}, body: corps ? JSON.stringify(corps) : undefined, cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error(`messages ${r.status}`);
      return await r.json();
    } finally { clearTimeout(tm); }
  }
  async function releve() {
    try { const j = await appel('/maison/messages?pour=enfant'); attente = (j.messages || []).filter(m => !attente.some(x => x.id === m.id && x.dit)); } catch (e) { /* plus tard */ }
  }
  setTimeout(releve, 8000); setInterval(releve, 30000);
  // la facture : ce que Shadow consomme sur le cerveau (papa la voit avec « Atlas, ma facture »)
  const envoieFacture = () => { if (S.facture && root() && !window.__BANC) appel('/atlas/facture', { id: 'shadow', role: 'shadow', facture: S.facture }).catch(() => {}); };
  setInterval(envoieFacture, 10 * 60000); setTimeout(envoieFacture, 30000);
  const lu = m => appel('/maison/messages', { lu: m.id }).catch(() => {});

  // le message de papa s'affiche aussi en hologramme : les lettres bleues apparaissent pendant que Shadow le lit
  function holoTexte(texte, titre = 'MESSAGE HOLOGRAPHIQUE · PAPA') {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(60% 55% at 50% 55%,rgba(6,34,58,.96),rgba(0,0,0,.97) 75%);opacity:0;transition:opacity .7s;cursor:pointer';
    el.innerHTML = `<style>@keyframes hT{0%,100%{opacity:1}48%{opacity:.82}50%{opacity:.45}52%{opacity:.9}}@keyframes hB{from{background-position:0 0}to{background-position:0 48px}}</style>
      <div style="position:fixed;top:16px;left:0;right:0;text-align:center;font:13px ui-monospace,monospace;letter-spacing:.35em;color:#7dd3fc">◢ ${titre}</div>
      <div style="position:relative;max-width:min(86vw,760px);padding:28px 32px;border:1px solid rgba(125,211,252,.45);border-radius:18px;box-shadow:0 0 40px rgba(56,189,248,.35),0 0 80px rgba(56,189,248,.15) inset;animation:hT 3.4s infinite">
        <div data-t style="font:600 clamp(24px,5.2vw,46px)/1.25 system-ui,sans-serif;color:#d6f4ff;text-shadow:0 0 12px rgba(125,211,252,.9),0 0 28px rgba(56,189,248,.6);text-align:center;min-height:1.3em"></div>
        <div style="position:absolute;inset:0;border-radius:18px;background:repeating-linear-gradient(0deg,rgba(125,211,252,.1) 0 2px,transparent 2px 6px);animation:hB 2.2s linear infinite;pointer-events:none"></div>
        <div style="position:absolute;left:50%;bottom:-70px;transform:translateX(-50%);width:70%;height:70px;background:radial-gradient(50% 100% at 50% 100%,rgba(125,211,252,.35),transparent 70%)"></div>
      </div>`;
    document.body.appendChild(el); requestAnimationFrame(() => { el.style.opacity = '1'; });
    const zone = el.querySelector('[data-t]'); let i = 0;
    const tape = setInterval(() => { i += 1; zone.textContent = texte.slice(0, i); if (i >= texte.length) clearInterval(tape); }, Math.max(28, Math.min(70, 2600 / Math.max(1, texte.length))));
    const fermer = () => { clearInterval(tape); el.style.opacity = '0'; setTimeout(() => el.remove(), 800); };
    el.onclick = fermer;
    return fermer;
  }

  // il le dit quand l'enfant est là, et que Shadow n'est pas occupé
  setInterval(async () => {
    if (!attente.length || !dlg.started || dlg.busy || voice.speaking || OREILLES.hearing() || dlg.expect) return;
    if (!['standby', 'talk'].includes(dlg.state)) return;
    const vu = typeof VISION !== 'undefined' && VISION.isOn() && VISION.state.faces.some(f => f.name && S.prenom && f.name === S.prenom);
    if (!vu && Date.now() - (dlg.lastTalk || 0) > 3 * 60000) return;
    const m = attente.shift(); m.dit = true;
    dlg.busy = true;
    try {
      lu(m);
      face.flash('happy', 2000); fx.tone([[784, 0.08], [1047, 0.08], [1319, 0.12]]);
      await say(`${name()} ! Message holographique de papa !`);
      const fermer = holoTexte(m.texte);
      try { await say(`« ${m.texte} »`); await new Promise(r => setTimeout(r, 2500)); } finally { fermer(); }
      dlg.state = 'talk'; dlg.silence = 0; dlg.lastActive = Date.now();
      dlg.expect = { until: Date.now() + 40000, run: () => activity(reponse) };
      await say('Tu veux lui répondre ?');
    } catch (e) { console.warn('message', e); } finally { dlg.busy = false; }
  }, 4000);

  async function envoie(texte) {
    const t = String(texte || '').trim().replace(/^(que |qu['’]\s*|de |d['’]\s*)/i, '').replace(/[.!]+$/, '');
    if (t.length < 2) return say("Je dis quoi à papa ?");
    if (ETHIQUE.BAD.test(ORTHO.bare(t))) return say("Hum, ce message-là, je ne le transmets pas.");
    try { await appel('/maison/messages', { de: 'enfant', pour: 'papa', texte: t.charAt(0).toUpperCase() + t.slice(1) }); } catch (e) { return say("Oh, je n'arrive pas à joindre l'ordinateur de la maison. Réessaie tout à l'heure !"); }
    face.flash('happy'); fx.tone([[1047, 0.06], [1568, 0.1]]);
    return say(pick(["C'est envoyé à papa ! Atlas va le lui dire.", 'Message envoyé ! Papa va le recevoir.', 'Bip bip, message parti pour papa !']));
  }
  async function reponse() {
    const a = await ask("Qu'est-ce que je dis à papa ?", { wait: 25000 });
    return envoie(a);
  }
  async function lis() {
    await releve();
    if (!attente.length) return say("Pas de nouveau message de papa pour l'instant.");
    const l = attente.splice(0); l.forEach(m => { m.dit = true; lu(m); });
    await say(l.length === 1 ? `Papa te dit : « ${l[0].texte} »` : `Papa t'a laissé ${l.length} messages. ${l.map(m => `« ${m.texte} »`).join('. ')}`);
    dlg.expect = { until: Date.now() + 40000, run: () => activity(reponse) };
    return say('Tu veux lui répondre ?');
  }

  const R = {
    envoie: /^(?:dis|explique|raconte|previens|demande) (?:a |au )?papa (?:que |qu |de |d )(.+)$|^(?:envoie|laisse|transmets?|ecris) (?:un |le )?(?:message|mot|petit mot) (?:a |au |pour )?papa\b\s*(.*)$/,
    lis: /\b(j ai (un|des) (nouveaux? )?messages?|papa (m a|a) (repondu|ecrit|laisse un message)|il y a (un|des) messages?|lis (moi )?(le|mes) messages?)\b/,
  };
  function route(text, n) {
    const m = n.match(R.envoie);
    if (m) {
      const raw = String(text).match(/papa\s*(?:que|qu['’]|de|d['’]|:)?\s*(.+)$/i);
      const t = (m[1] || m[2] || '').trim() ? (raw ? raw[1] : m[1] || m[2]) : '';
      return () => (t ? envoie(t) : activity(reponse));
    }
    if (R.lis.test(n)) return lis;
    return null;
  }
  // le diagnostic à distance (comme Atlas) : l'ordinateur de la maison sait s'il est éveillé, et si un message attend
  async function diagnostic() {
    const r0 = root(); if (!r0 || window.__BANC) return;
    const vu = typeof VISION !== 'undefined' && VISION.isOn() && VISION.state.faces.some(f => f.name && S.prenom && f.name === S.prenom);
    const d = { appareil: `shadow (${/Android/i.test(navigator.userAgent) ? 'téléphone' : 'ordinateur'})`, v: window.SHADOW_VERSION, demarre: dlg.started, etat: dlg.state, occupe: dlg.busy,
      cache: document.hidden, cerveau: typeof AI !== 'undefined' && AI.dernier ? `${AI.dernier.fournisseur} ${AI.dernier.modele}` : '', mistral: !!(S.settings && S.settings.mistralKey), mistralErreur: typeof AI !== 'undefined' && AI.mistralErreur ? String(AI.mistralErreur).slice(0, 140) : '', ecran: `${innerWidth}x${innerHeight}`, cameraAllumee: typeof VISION !== 'undefined' && VISION.isOn(), enfantVu: vu, parleIlYa: dlg.lastTalk ? Math.round((Date.now() - dlg.lastTalk) / 1000) : null,
      entendus: window.SHADOW_CHEZ_PAPA !== false && typeof OREILLES !== 'undefined' && OREILLES.entendus ? OREILLES.entendus() : [], chezPapa: window.SHADOW_CHEZ_PAPA !== false, // chez maman : rien de ce qu'il entend niveau: typeof OREILLES !== 'undefined' && OREILLES.meter ? +OREILLES.meter().level.toFixed(4) : null, seuil: typeof OREILLES !== 'undefined' && OREILLES.meter ? +OREILLES.meter().threshold.toFixed(4) : null, micSens: S.settings.micSens || 'haute', maisonDabord: !!S.settings.earsMaisonFirst,
      maison: window.SHADOW_CHEZ_PAPA !== false && typeof LUMIERES !== 'undefined' && LUMIERES.journal ? LUMIERES.journal() : [], messagesEnAttente: attente.length, oreilles: typeof OREILLES !== 'undefined' && OREILLES.engine ? OREILLES.engine() : '' };
    try { await fetch(`${r0}/atlas/diag`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d), keepalive: true }); } catch (e) { /* plus tard */ }
  }
  setInterval(diagnostic, 30000); setTimeout(diagnostic, 10000);
  document.addEventListener('visibilitychange', diagnostic);
  return { route, envoie, releve, holoTexte, _attente: () => attente };
})();
