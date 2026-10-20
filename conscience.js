/* =========================================================
   SHADOW — la conscience (cerveau v2)
   Comme les robots des films, Shadow sait où il en est :
   - l'état du monde autour de lui (heure, qui est là et depuis quand,
     sa batterie, le réseau, ce qu'on vient de faire, ce qui arrive bientôt) ;
   - il décide lui-même de regarder quand une question le demande ([[regarder]]) ;
   - il retient les événements annoncés (« demain j'ai piscine ») et en reparle après ;
   - sa batterie est son énergie : il demande à être branché, puis économise ;
   - l'heure du coucher (si papa la règle) ;
   - un rapport d'état façon J.A.R.V.I.S. (« état de tes systèmes »).
   Utilise les outils de app.js, cerveau.js, ecran.js (au moment où il s'en sert).
   ========================================================= */
'use strict';

const CONSCIENCE = (() => {
  const hm = d => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const ago = ms => { const m = Math.round(ms / 60000); return m < 1 ? "moins d'une minute" : m < 60 ? `${m} minute${m > 1 ? 's' : ''}` : `${Math.round(m / 60)} heure${m >= 90 ? 's' : ''}`; };
  const iso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ---------- la batterie du téléphone = son énergie ---------- */
  const bat = { level: null, charging: null, warned: 0, saving: false };
  function watchBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(b => {
      const upd = () => { bat.level = Math.round(b.level * 100); bat.charging = b.charging; };
      upd();
      b.addEventListener('levelchange', () => { upd(); batteryCheck(); });
      b.addEventListener('chargingchange', () => {
        upd();
        if (b.charging && bat.warned && awake()) { bat.warned = 0; face.flash('happy'); VISAGE.puff('eclair', 2); say('Merci ! Je sens le courant arriver. Je recharge mes batteries.'); }
        if (b.charging && bat.saving) { bat.saving = false; if (S.settings.vision && !LEGACY) visionToggle(true); }
      });
    }).catch(() => { /* pas d'info batterie */ });
  }
  const awake = () => typeof dlg !== 'undefined' && dlg.started && dlg.state !== 'sleep';
  function batteryCheck() {
    if (bat.level === null || bat.charging || !awake()) return;
    const now = Date.now();
    if (bat.level <= 10 && !bat.saving) {
      bat.saving = true;
      if (VISION.isOn()) visionToggle(false); // les yeux consomment beaucoup : il les ferme
      face.set('sleepy');
      say(`Alerte énergie : ${bat.level} %. Je ferme mes yeux pour économiser. Branche-moi vite, s'il te plaît !`);
    } else if (bat.level <= 20 && now - bat.warned > 30 * 60000) {
      bat.warned = now;
      face.flash('sleepy', 2500);
      say(`Ma batterie est à ${bat.level} %. Tu peux me brancher, s'il te plaît ?`);
    }
  }

  /* ---------- qui est là, depuis quand ---------- */
  function presence() {
    const faces = VISION.isOn() ? VISION.state.faces : [];
    const names = [...new Set(faces.map(f => f.name).filter(Boolean))];
    const unknown = faces.filter(f => !f.name).length;
    const sp = speakerNow();
    return { names, unknown, speaker: sp, since: seen.present ? Date.now() - seen.presentSince : 0, mood: faces[0] && faces[0].expr ? faces[0].expr.k : '' };
  }

  /* ---------- l'état du monde, en quelques lignes pour le cerveau ---------- */
  const MOODS = { happy: 'a l\'air content', sad: 'a l\'air un peu triste', angry: 'a l\'air fâché', surprised: 'a l\'air surpris', fearful: 'a l\'air inquiet', neutral: '' };
  function etat() {
    const now = new Date(), day = now.getDay();
    const lines = [];
    lines.push(`Il est ${hm(now)}, ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][day]}${day === 0 || day === 6 ? ' (week-end)' : day === 3 ? ' (souvent pas d\'école le mercredi)' : ''}.`);
    const p = presence();
    if (p.names.length || p.unknown) lines.push(`Devant toi : ${[...p.names, ...(p.unknown ? [`${p.unknown} personne${p.unknown > 1 ? 's' : ''} que tu ne connais pas`] : [])].join(', ')}${p.since > 60000 ? `, depuis ${ago(p.since)}` : ''}${p.mood && MOODS[p.mood] ? ` ; la personne devant toi ${MOODS[p.mood]}` : ''}.`);
    else if (VISION.isOn()) lines.push("Ta caméra ne voit personne en ce moment.");
    if (bat.level !== null) lines.push(`Ta batterie : ${bat.level} %${bat.charging ? ', en charge' : ''}.`);
    const last = (S.log || []).slice(-1)[0];
    if (last && Date.now() - last.at < 3 * 3600000) lines.push(`Dernière activité : ${last.type}${last.d ? ` (${last.d})` : ''}, il y a ${ago(Date.now() - last.at)}.`);
    const ev = MEMOIRE.upcoming ? MEMOIRE.upcoming(7) : [];
    if (ev.length) lines.push(`Ce que l'enfant t'a annoncé : ${ev.map(e => `${e.quoi} (${e.when})`).join(' ; ')}.`);
    const co = S.settings.coucher;
    if (co) lines.push(`Heure du coucher fixée par papa : ${co.replace(':', ' h ')}.`);
    return `\n\nTa conscience (ce que tes capteurs savent, vrai et à jour) :\n- ${lines.join('\n- ')}`;
  }

  /* ---------- regarder pour répondre ---------- */
  async function observe() {
    if (!VISION.isOn()) { try { await visionToggle(true); await wait(1500); } catch (e) { return ''; } }
    if (!VISION.isOn()) return '';
    const out = [];
    const faces = VISION.state.faces;
    if (faces.length) out.push(`${faces.length} visage${faces.length > 1 ? 's' : ''}${faces.some(f => f.name) ? ` (${faces.map(f => f.name || 'inconnu').join(', ')})` : ''}${faces[0].expr && MOODS[faces[0].expr.k] ? `, la personne ${MOODS[faces[0].expr.k]}` : ''}`);
    if (!LEGACY) {
      try {
        const objs = (await VISION.objects()).filter(o => o.label !== 'person' && JEUX.OBJETS[o.label]);
        const names = [...new Set(objs.map(o => JEUX.OBJETS[o.label]))];
        if (names.length) out.push(`des objets : ${names.join(', ')}`);
      } catch (e) { /* pas d'objets */ }
    }
    return out.length ? out.join(' ; ') : 'rien de précis (peut-être trop sombre, ou rien devant la caméra)';
  }
  // le cerveau a demandé [[regarder]] : on regarde, puis il répond avec ce qu'il a vu
  async function lookAndAnswer(question, msgs) {
    face.set('think');
    const seenTxt = await observe();
    if (!seenTxt) { face.set('confused'); return say("Mes yeux ne s'ouvrent pas. Papa doit autoriser la caméra."); }
    const sys = `${msgs[0].content}\n\nTu viens de regarder avec ta caméra. Elle voit maintenant : ${seenTxt}. Réponds à ${name()} en 1 ou 2 phrases, avec seulement ce que ta caméra a vu. Si elle ne permet pas de répondre, dis-le simplement (« je ne vois pas bien, montre-le-moi de plus près »). Ne décris jamais le corps des personnes. Pas de commande entre crochets.`;
    let queue = Promise.resolve();
    const raw = await AI.chatStream([{ role: 'system', content: sys }, ...msgs.slice(1)], { maxTokens: 140, temperature: 0.4 }, s => {
      const c = String(s).replace(/\[\[[^\]]*\]\]/g, '').trim();
      if (c && ETHIQUE.safe(c) === c) { if (face.state === 'think') face.set('idle'); queue = queue.then(() => say(c)); }
    });
    await queue;
    const ans = String(raw || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    if (ans) { S.chat.push({ role: 'assistant', content: ans }); save(); }
  }

  /* ---------- reparler des événements annoncés ---------- */
  async function followUp() {
    const ev = MEMOIRE.dueEvents ? MEMOIRE.dueEvents() : [];
    if (!ev.length) return false;
    const e = ev[0];
    const today = e.date === iso();
    if (today) {
      if (e.saidToday === iso() || new Date().getHours() >= 20) return false;
      e.saidToday = iso(); save();
      face.flash('happy');
      await say(`Au fait, c'est aujourd'hui : ${e.quoi} !`);
      return true;
    }
    e.followed = true; save();
    dlg.moodPending = false;
    face.set('happy');
    await say(e.apres || `Au fait, ${e.quoi}, comment ça s'est passé ?`);
    return true;
  }

  /* ---------- l'heure du coucher ---------- */
  setInterval(() => {
    const co = S.settings.coucher;
    if (!co || !awake() || dlg.busy || voice.speaking || dlg.expect) return;
    const [h, m] = co.split(':').map(Number);
    const now = new Date(), d = daily(), k = dayKey();
    if (d.coucher === k || now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
    if (Date.now() - (dlg.lastTalk || 0) > 10 * 60000) return; // personne ne lui parle : rien à dire
    d.coucher = k; save();
    dlg.state = 'talk'; dlg.silence = 0;
    face.set('sleepy'); VISAGE.puff('zzz', 2);
    dlg.expect = { until: Date.now() + 60000, run: () => histoireSoirFlow() };
    say(`Il est ${hm(now)}. Mes capteurs disent que c'est l'heure d'aller au lit. Tu veux une histoire pour t'endormir ?`);
  }, 60000);

  /* ---------- le rapport d'état ---------- */
  async function rapport() {
    face.set('proud');
    const parts = ['Rapport de mes systèmes.'];
    parts.push(bat.level !== null ? `Énergie : ${bat.level} %${bat.charging ? ', en charge' : ''}.` : 'Énergie : je ne peux pas lire ma batterie sur ce téléphone.');
    parts.push(navigator.onLine === false ? 'Réseau : coupé, je suis en mode exploration.' : `Réseau : connecté. Grand cerveau : ${AI.ready() ? 'en ligne' : 'pas branché'}.`);
    const p = presence();
    parts.push(VISION.isOn() ? `Yeux : ouverts${p.names.length ? `, je vois ${p.names.join(' et ')}` : ''}.` : 'Yeux : fermés.');
    parts.push(`Oreilles : ${dlg.deaf ? 'en pause' : 'actives'}.`);
    const mem = MEMOIRE.data();
    const todo = (mem.events || []).filter(e => !e.followed).length;
    parts.push(`Mémoire : ${mem.facts.length} souvenir${mem.facts.length > 1 ? 's' : ''}${todo ? ` et ${todo} événement${todo > 1 ? 's' : ''} à suivre` : ''}.`);
    parts.push(`Version ${window.SHADOW_VERSION}. Tous mes systèmes sont opérationnels.`);
    await say(parts.join(' '));
    face.set('idle');
  }

  const R = {
    rapport: /\b(etat de tes systemes|rapport (de tes systemes|d etat|systeme)|diagnostic|tes systemes|comment vont tes circuits|tout va bien dans tes circuits|check up|statut)\b/,
    batterie: /\b(ta batterie|tu as de la batterie|combien de batterie|t es charge|tu es charge|ton energie)\b/,
  };
  function route(text, n) {
    if (R.rapport.test(n)) return rapport;
    if (R.batterie.test(n)) return () => say(bat.level === null ? "Je ne peux pas lire ma batterie sur ce téléphone." : `Ma batterie est à ${bat.level} %${bat.charging ? ', et je suis en train de recharger' : bat.level <= 20 ? '. Il faudrait me brancher bientôt' : ', tout va bien'}.`);
    return null;
  }

  /* ---------- papa : l'heure du coucher ---------- */
  setTimeout(() => {
    const inp = $('#s-coucher');
    if (!inp) return;
    inp.value = S.settings.coucher || '';
    inp.addEventListener('change', () => { S.settings.coucher = inp.value || ''; save(); });
    $('#s-coucher-off').addEventListener('click', () => { inp.value = ''; S.settings.coucher = ''; save(); });
  }, 0);
  watchBattery();

  return { etat, observe, lookAndAnswer, followUp, rapport, route, batteryCheck, battery: () => bat, iso };
})();
