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
  const lu = m => appel('/maison/messages', { lu: m.id }).catch(() => {});

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
      await say(`${name()} ! J'ai un message de papa : « ${m.texte} »`);
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
  return { route, envoie, releve, _attente: () => attente };
})();
