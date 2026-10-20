/* =========================================================
   SHADOW — la mémoire partagée (téléphone, ordinateur, tablette…)
   L'ordinateur de la maison garde la mémoire centrale (…/shadow/etat, via Tailscale).
   Chaque appareil y envoie ce qu'il a appris et récupère ce que les autres ont appris :
   un seul Shadow, où qu'il soit.
   - On FUSIONNE (on n'écrase jamais) : souvenirs, visages, voix, journal… sont réunis.
   - Ce qu'on supprime quelque part est supprimé partout (« pierres tombales »).
   - Les réglages techniques (clé, micro, caméra) et la conversation en cours restent sur chaque appareil.
   Ne marche que si le « cerveau de la maison » est réglé (même adresse).
   ========================================================= */
'use strict';

const SYNC = (() => {
  const clone = x => JSON.parse(JSON.stringify(x === undefined ? null : x));
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const set = (o, path, v) => { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
  const norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const pk = d => (Array.isArray(d) ? d.slice(0, 4).map(x => Math.round(x * 1000)).join(',') : ''); // pour reconnaître une même empreinte

  // ---------- ce qui est partagé, et comment on fusionne chaque liste ----------
  const LISTS = {
    'memory.facts': { key: x => x.id, time: x => x.at, cap: 60 },
    'memory.summaries': { key: x => `${x.at}|${norm(x.text).slice(0, 30)}`, time: x => x.at, cap: 40 },
    'memory.hard': { key: x => norm(x.t), time: x => x.at, cap: 20 },
    'memory.events': { key: x => x.id, time: x => x.id, cap: 30, both: (a, b) => Object.assign({}, a, b, { followed: !!(a.followed || b.followed), saidToday: [a.saidToday, b.saidToday].filter(Boolean).sort().pop() || undefined }) },
    'memory.rules': { key: x => norm(x.text), time: x => x.at, cap: 20 },
    people: { key: x => x.id, time: x => x.id, byName: true, both: (a, b) => Object.assign({}, a, { name: a.name || b.name, desc: unionPrints(a.desc, b.desc, 40, 12) }) },
    voices: { key: x => x.id, time: x => x.id, byName: true, both: (a, b) => Object.assign({}, a, { prints: unionPrints(a.prints, b.prints, 20, 3), thr: Math.max(a.thr || 0, b.thr || 0) || a.thr }) },
    journal: { key: x => x.id || x.at, time: x => x.at, desc: true },
    log: { key: x => `${x.at}|${x.type}`, time: x => x.at, cap: 500 },
    projets: { key: x => x.id, time: x => x.id, both: (a, b) => Object.assign({}, a, b, { done: !!(a.done || b.done), ended: !!(a.ended || b.ended), fin: [a.fin, b.fin].sort().pop(), sessions: unionBy([].concat(a.sessions || [], b.sessions || []), s => `${s.date}|${s.s}|${s.n}`) }) },
    intentions: { key: x => x.id, time: x => x.id, cap: 20, both: (a, b) => Object.assign({}, a, b, { done: !!(a.done || b.done) }) },
    'settings.reminders': { key: x => x.id, time: x => x.id },
    'settings.events': { key: x => x.id || `${x.date}|${norm(x.text)}`, time: x => x.id || 0 },
    jeuxAppris: { key: x => x.id, time: x => x.at || x.id, both: (a, b) => ((b.at || 0) > (a.at || 0) ? b : a) }, // les jeux que la famille lui a appris
    devAppris: { key: x => x.id, time: x => x.id }, // les devinettes que la famille lui a apprises
    'papa.notes': { key: x => x.id, time: x => x.id }, // les notes de papa (mode papa)
  };
  const SETS = ['badges'];
  const MAXMAP = ['stats', 'playLog', 'pokeCaught', 'pokeLvl', 'pokeStats', 'ensemble.victoires']; // compteurs (et Pokémon attrapés) : on garde le plus grand
  const DICTEE = 'dictee'; // { mot: { ok, fail } } : le plus grand de chaque
  const SCALARS = ['prenom', 'calcLevel', 'humeur', 'explorer', 'settings.coucher', 'settings.ville', 'settings.propose'];

  function unionBy(arr, keyFn) { const m = new Map(); arr.forEach(x => { if (x) m.set(keyFn(x), x); }); return [...m.values()]; }
  function unionPrints(a, b, cap, keepFirst) {
    const seen = new Set(), out = [];
    [].concat(a || [], b || []).forEach(d => { const k = pk(d); if (k && !seen.has(k)) { seen.add(k); out.push(d); } });
    while (out.length > cap) out.splice(keepFirst, 1); // on garde les premières (« faire connaissance »)
    return out;
  }

  // ---------- les suppressions (pour qu'un oubli voyage d'un appareil à l'autre) ----------
  function tomb(path, item) {
    const spec = LISTS[path]; if (!spec || !item) return;
    S.tomb = S.tomb || {};
    (S.tomb[path] = S.tomb[path] || {})[String(spec.key(item))] = Date.now();
  }
  function mergeTombs(a, b) {
    const out = {}, old = Date.now() - 90 * 86400000;
    [a || {}, b || {}].forEach(t => Object.keys(t).forEach(p => Object.keys(t[p] || {}).forEach(k => {
      const ts = t[p][k]; if (ts < old) return;
      out[p] = out[p] || {}; out[p][k] = Math.max(out[p][k] || 0, ts);
    })));
    return out;
  }

  function mergeList(path, A, B, tombs) {
    const spec = LISTS[path], dead = (tombs && tombs[path]) || {};
    const m = new Map();
    const add = x => {
      if (!x) return;
      const k = String(spec.key(x));
      const dt = dead[k]; if (dt && (spec.time(x) || 0) <= dt) return; // supprimé ailleurs (et pas recréé depuis)
      m.set(k, m.has(k) ? (spec.both ? spec.both(m.get(k), x) : x) : x);
    };
    (A || []).forEach(add); (B || []).forEach(add);
    let out = [...m.values()];
    if (spec.byName) { // la même personne apprise sur deux appareils : on réunit ses empreintes
      const byN = new Map();
      // « Léo » et « leo », c'est la même personne
      out.forEach(x => { const n = norm(ORTHO.bare(x.name || '')); if (!n) return byN.set(Symbol('x'), x); byN.set(n, byN.has(n) ? spec.both(byN.get(n).id < x.id ? byN.get(n) : x, byN.get(n).id < x.id ? x : byN.get(n)) : x); });
      out = [...byN.values()];
    }
    out.sort((x, y) => (spec.time(x) || 0) - (spec.time(y) || 0));
    if (spec.desc) out.reverse();
    if (spec.cap && out.length > spec.cap) out = spec.desc ? out.slice(0, spec.cap) : out.slice(-spec.cap);
    return out;
  }

  // ce que cet appareil partage
  function extract(s) {
    const d = { updatedAt: s.updatedAt || 0, tomb: clone(s.tomb || {}) };
    Object.keys(LISTS).forEach(p => set(d, p, clone(get(s, p) || [])));
    SETS.concat(MAXMAP, [DICTEE]).forEach(p => set(d, p, clone(get(s, p) || (SETS.includes(p) ? [] : {}))));
    SCALARS.forEach(p => { const v = get(s, p); if (v !== undefined) set(d, p, clone(v)); });
    return d;
  }
  function merge(A, B) {
    const tombs = mergeTombs(A.tomb, B.tomb);
    const out = { updatedAt: Math.max(A.updatedAt || 0, B.updatedAt || 0), tomb: tombs };
    Object.keys(LISTS).forEach(p => set(out, p, mergeList(p, get(A, p), get(B, p), tombs)));
    SETS.forEach(p => set(out, p, [...new Set([].concat(get(A, p) || [], get(B, p) || []))]));
    MAXMAP.forEach(p => { const a = get(A, p) || {}, b = get(B, p) || {}, o = {}; new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { o[k] = Math.max(+a[k] || 0, +b[k] || 0); }); set(out, p, o); });
    { const a = get(A, DICTEE) || {}, b = get(B, DICTEE) || {}, o = {}; new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { const x = a[k] || {}, y = b[k] || {}; o[k] = { ok: Math.max(x.ok || 0, y.ok || 0), fail: Math.max(x.fail || 0, y.fail || 0) }; }); set(out, DICTEE, o); }
    const newer = (A.updatedAt || 0) >= (B.updatedAt || 0) ? A : B, older = newer === A ? B : A;
    SCALARS.forEach(p => { const v = get(newer, p); set(out, p, v !== undefined && v !== '' && v !== null ? v : get(older, p)); });
    return out;
  }
  function apply(d) {
    Object.keys(LISTS).forEach(p => set(S, p, get(d, p) || []));
    SETS.concat(MAXMAP, [DICTEE]).forEach(p => set(S, p, get(d, p)));
    SCALARS.forEach(p => { const v = get(d, p); if (v !== undefined) set(S, p, v); });
    S.tomb = d.tomb;
  }

  // ---------- les échanges avec l'ordinateur ----------
  let rev = 0, dirty = false, busy = false, last = { at: 0, ok: null, msg: '' };
  const root = () => (typeof VOIXMAISON !== 'undefined' ? VOIXMAISON.root() : '');
  const usable = () => !window.__BANC && !!root() && navigator.onLine !== false && S.settings.sync !== false;
  const device = () => (/Android/i.test(navigator.userAgent) ? 'téléphone' : /iPad|Tablet/i.test(navigator.userAgent) ? 'tablette' : 'ordinateur');
  async function call(method, body) {
    const ctl = window.AbortController ? new AbortController() : null;
    const tm = setTimeout(() => ctl && ctl.abort(), 15000);
    try {
      const r = await fetch(`${root()}/shadow/etat`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
      const j = await r.json().catch(() => null);
      return { status: r.status, j };
    } finally { clearTimeout(tm); }
  }
  async function sync(force) {
    if (busy || !usable()) return false;
    // pendant un jeu ou une phrase, on attend (on ne remplace pas la mémoire sous ses pieds)
    if (!force && typeof dlg !== 'undefined' && (dlg.busy || dlg.state === 'activity')) return false;
    busy = true;
    try {
      for (let tour = 0; tour < 3; tour++) {
        const g = tour === 0 ? await call('GET') : g2;
        if (!g || g.status !== 200 && g.status !== 409 || !g.j) throw new Error(`mémoire centrale ${g && g.status}`);
        const remote = g.j;
        const mine = extract(S);
        const merged = remote.data ? merge(mine, remote.data) : mine;
        apply(merged); saveQuiet();
        var g2 = await call('PUT', { rev: remote.rev || 0, par: device(), data: merged });
        if (g2.status === 200) { rev = g2.j.rev; dirty = false; last = { at: Date.now(), ok: true, msg: '' }; refreshUi(); return true; }
        if (g2.status !== 409) throw new Error(`mémoire centrale ${g2.status}`);
        // un autre appareil a écrit entre-temps : on refusionne avec sa version
      }
      throw new Error('trop de conflits');
    } catch (e) {
      last = { at: Date.now(), ok: false, msg: e.message };
      return false;
    } finally { busy = false; }
  }
  function saveQuiet() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* plein ou bloqué */ } }
  function refreshUi() {
    try { if ($('#dlg-settings').open) { renderMemory(); renderPeople(); renderVoices(); } } catch (e) { /* rien */ }
    const el = $('#s-sync-state'); if (el) el.textContent = status();
  }
  function status() {
    if (!root()) return "Mémoire partagée : il faut régler le « cerveau de la maison » (même adresse sur chaque appareil).";
    if (S.settings.sync === false) return 'Mémoire partagée : désactivée sur cet appareil.';
    if (!last.at) return 'Mémoire partagée : pas encore synchronisée.';
    const t = new Date(last.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return last.ok ? `Mémoire partagée : à jour (${t}) avec l'ordinateur de la maison.` : `Mémoire partagée : l'ordinateur ne répond pas (${t}). Elle reprendra toute seule.`;
  }

  setTimeout(() => sync(true), 4000); // au démarrage : on récupère ce que les autres appareils ont appris
  setInterval(() => { if (dirty || Date.now() - last.at > 3 * 60000) sync(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) sync(true); });
  window.addEventListener('online', () => sync());
  setTimeout(() => {
    const b = $('#s-sync-now');
    if (b) b.addEventListener('click', async () => { $('#s-sync-state').textContent = 'Synchronisation…'; await sync(true); refreshUi(); });
    const c = $('#s-sync');
    if (c) { c.checked = S.settings.sync !== false; c.addEventListener('change', () => { S.settings.sync = c.checked; save(); refreshUi(); }); }
    refreshUi();
  }, 0);

  return { sync, tomb, merge, extract, apply, status, markDirty: () => { dirty = true; }, last: () => last };
})();
