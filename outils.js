/* =========================================================
   SHADOW — le couteau suisse du mode papa (tout à la voix, rien à l'écran)
   - Calculs exacts : « combien font 17,5 % de 2 340 », « racine de 144 », « 2 puissance 10 », TVA (HT / TTC).
   - Conversions : km, miles, pieds, pouces, kg, livres, litres, gallons, °C / °F, km/h, nœuds, Go…
     et devises au cours du jour de la BCE (« 100 dollars en euros »).
   - Minuteurs nommés, plusieurs à la fois (« minuteur pâtes 9 minutes », « combien de temps il reste ? »),
     réveil (« réveille-moi à 6 h 30 »), chrono, Pomodoro (25 min / 5 min, 4 cycles).
   - Listes : courses, à faire, idées, ou n'importe quel nom (partagées entre les appareils).
   - Météo de n'importe quelle ville (aujourd'hui, demain, cet après-midi, ce soir…).
   - État du PC (processeur, mémoire, disque, températures, carte graphique, modèles chargés).
   - « Fais-moi le point » : le briefing complet. Heure dans le monde, jours avant une date, hasard.
   Tout se fait sans le grand cerveau (sauf les titres de l'actualité du point, qui viennent de l'ordinateur).
   ========================================================= */
'use strict';

const OUTILS = (() => {
  const P = () => (S.papa = S.papa || { chat: [], notes: [] });
  const fr = (x, d = 4) => Number(x).toLocaleString('fr-FR', { maximumFractionDigits: d });
  const deux = n => String(n).padStart(2, '0');
  const pluriel = (n, mot) => `${fr(n)} ${mot}${Math.abs(n) >= 2 ? 's' : ''}`;
  const getJSON = async (url, ms = 8000) => {
    const ctl = window.AbortController ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl ? ctl.signal : undefined }); if (!r.ok) throw new Error(`${r.status}`); return await r.json(); } finally { clearTimeout(t); }
  };
  // texte en minuscules, accents gardés, nombres français lisibles par la machine (« 12,5 » → 12.5, « 2 340 » → 2340)
  function brut(text) {
    return ` ${String(text).toLowerCase().replace(/[’']/g, ' ').replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').replace(/(\d)\s*,\s*(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim()} `;
  }
  const CHIFFRES = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, mille: 1000 };
  const nombre = w => { if (w == null) return null; const x = parseFloat(String(w).replace(',', '.')); if (!isNaN(x)) return x; const k = CHIFFRES[ORTHO.bare(String(w)).toLowerCase()]; return k === undefined ? null : k; };

  /* ================= 1. le calcul exact (sans eval : un vrai petit analyseur) ================= */
  function evaluer(expr) {
    const tk = expr.match(/\d+(?:\.\d+)?|[-+*/^()√]/g);
    if (!tk) return null;
    const out = [], ops = [], prio = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, '√': 4, 'n': 4 };
    let prev = null;
    for (const t of tk) {
      if (/\d/.test(t)) out.push(parseFloat(t));
      else if (t === '(') ops.push(t);
      else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()); ops.pop(); }
      else {
        let o = t;
        if (o === '-' && (prev === null || /[-+*/^(√]/.test(prev))) o = 'n'; // moins devant un nombre
        while (ops.length && ops[ops.length - 1] !== '(' && o !== '^' && o !== '√' && o !== 'n' && prio[ops[ops.length - 1]] >= prio[o]) out.push(ops.pop());
        ops.push(o);
      }
      prev = t;
    }
    while (ops.length) out.push(ops.pop());
    const st = [];
    for (const x of out) {
      if (typeof x === 'number') { st.push(x); continue; }
      if (x === '√' || x === 'n') { const a = st.pop(); if (a === undefined) return null; st.push(x === '√' ? Math.sqrt(a) : -a); continue; }
      const b = st.pop(), a = st.pop();
      if (a === undefined || b === undefined) return null;
      st.push(x === '+' ? a + b : x === '-' ? a - b : x === '*' ? a * b : x === '/' ? a / b : Math.pow(a, b));
    }
    return st.length === 1 && isFinite(st[0]) ? st[0] : null;
  }
  function calcul(text) {
    let s = brut(text);
    // la TVA (20 %) : « 100 euros HT en TTC », « 120 TTC en HT »
    let m = s.match(/(\d+(?:\.\d+)?)\s*(?:euros?|€)?\s*(ht|hors taxes?)\b.*\b(ttc|toutes taxes)/);
    if (m) return `${fr(+m[1])} euros hors taxes, ça fait ${fr(+m[1] * 1.2, 2)} euros toutes taxes comprises, avec une taxe à 20 %.`;
    m = s.match(/(\d+(?:\.\d+)?)\s*(?:euros?|€)?\s*(ttc|toutes taxes)\b.*\b(ht|hors taxes?)\b/);
    if (m) return `${fr(+m[1])} euros toutes taxes comprises, ça fait ${fr(+m[1] / 1.2, 2)} euros hors taxes, avec une taxe à 20 %.`;
    s = s.replace(/\b(combien (font|fait|ça fait|ca fait|vaut|valent)|calcule|ça fait combien|ca fait combien|combien|égal|égale|egal|egale|est égal à|s il te plait|stp)\b|\?/g, ' ')
      .replace(/\b(pour ?cents?)\b|%/g, ' % ')
      .replace(/\b(multiplié par|multiplie par|fois)\b|×|\s\*\s|\bx\b/g, ' * ')
      .replace(/\b(divisé par|divise par|sur)\b|÷/g, ' / ')
      .replace(/\bplus\b/g, ' + ').replace(/\bmoins\b/g, ' - ')
      .replace(/\b(puissance|exposant)\b/g, ' ^ ').replace(/\bau carré\b|\bau carre\b/g, ' ^ 2 ').replace(/\bau cube\b/g, ' ^ 3 ')
      .replace(/\bracine (carrée |carree )?(de )?/g, ' √ ');
    // « 17 % de 2340 », « 2340 plus 15 % »
    s = s.replace(/(\d+(?:\.\d+)?)\s*%\s*(?:de|d)\s+(\d+(?:\.\d+)?)/g, '($1/100*$2)').replace(/(\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%/g, '($1*(1$2$3/100))');
    if (/[a-zàâäéèêëîïôöùûüç]{3,}/.test(s.replace(/\b(de|et|le|la|les|du)\b/g, ''))) return null; // il reste des mots : ce n'est pas un calcul
    if (!/\d/.test(s) || !/[-+*/^√(]/.test(s)) return null;
    const r = evaluer(s);
    if (r === null) return null;
    const rond = Math.abs(r) >= 1e6 ? fr(r, 0) : fr(r, Math.abs(r) < 1 ? 6 : 4);
    return `Ça fait ${rond.replace('-', 'moins ')}.`;
  }

  /* ================= 2. les conversions (unités et devises) ================= */
  const U = [ // [noms, grandeur, valeur en unité de base]
    [['kilomètres', 'kilomètre', 'km'], 'l', 1000], [['mètres', 'mètre', 'm'], 'l', 1], [['centimètres', 'centimètre', 'cm'], 'l', 0.01], [['millimètres', 'millimètre', 'mm'], 'l', 0.001],
    [['miles', 'mile', 'milles'], 'l', 1609.344], [['pieds', 'pied', 'feet', 'foot'], 'l', 0.3048], [['pouces', 'pouce', 'inch', 'inches'], 'l', 0.0254], [['yards', 'yard'], 'l', 0.9144],
    [['kilos', 'kilo', 'kilogrammes', 'kilogramme', 'kg'], 'm', 1], [['grammes', 'gramme', 'g'], 'm', 0.001], [['tonnes', 'tonne'], 'm', 1000], [['livres', 'livre', 'lb', 'lbs'], 'm', 0.45359237], [['onces', 'once', 'oz'], 'm', 0.0283495],
    [['litres', 'litre', 'l'], 'v', 1], [['centilitres', 'centilitre', 'cl'], 'v', 0.01], [['millilitres', 'millilitre', 'ml'], 'v', 0.001], [['gallons', 'gallon'], 'v', 3.78541], [['tasses', 'tasse', 'cups', 'cup'], 'v', 0.24],
    [['kilomètres heure', 'km h', 'kmh'], 'vit', 1 / 3.6], [['miles par heure', 'mph'], 'vit', 0.44704], [['nœuds', 'noeuds', 'nœud', 'noeud'], 'vit', 0.514444], [['mètres par seconde', 'm s'], 'vit', 1],
    [['téraoctets', 'téraoctet', 'to'], 'o', 1e12], [['gigaoctets', 'gigaoctet', 'gigas', 'giga', 'go'], 'o', 1e9], [['mégaoctets', 'mégaoctet', 'mégas', 'méga', 'mo'], 'o', 1e6], [['kilooctets', 'kilooctet', 'ko'], 'o', 1e3],
    [['kilowattheures', 'kilowattheure', 'kwh'], 'e', 3.6e6], [['wattheures', 'wattheure', 'wh'], 'e', 3600], [['joules', 'joule', 'j'], 'e', 1], [['calories', 'calorie', 'kcal'], 'e', 4184],
    [['hectares', 'hectare', 'ha'], 's', 10000], [['mètres carrés', 'mètre carré', 'm2'], 's', 1], [['acres', 'acre'], 's', 4046.86], [['pieds carrés', 'pied carré'], 's', 0.092903],
    [['degrés Celsius', 'degrés celsius', 'celsius', 'degrés', '°c'], 't', 'C'], [['degrés Fahrenheit', 'degrés fahrenheit', 'fahrenheit', '°f'], 't', 'F'], [['kelvins', 'kelvin'], 't', 'K'],
  ];
  const DEV = [[['euros', 'euro', '€'], 'EUR'], [['dollars américains', 'dollars us', 'dollars', 'dollar', '$', 'usd'], 'USD'], [['livres sterling', 'livre sterling', 'livres anglaises', 'gbp'], 'GBP'], [['francs suisses', 'franc suisse', 'chf'], 'CHF'],
    [['dollars canadiens', 'dollar canadien', 'cad'], 'CAD'], [['yens', 'yen', 'jpy'], 'JPY'], [['yuans', 'yuan', 'cny'], 'CNY'], [['dirhams', 'dirham'], 'MAD'], [['couronnes suédoises', 'couronne suédoise', 'sek'], 'SEK'], [['dollars australiens', 'dollar australien', 'aud'], 'AUD']];
  const NOM_DEV = { EUR: 'euros', USD: 'dollars', GBP: 'livres sterling', CHF: 'francs suisses', CAD: 'dollars canadiens', JPY: 'yens', CNY: 'yuans', MAD: 'dirhams', SEK: 'couronnes suédoises', AUD: 'dollars australiens' };
  const alias = list => list.map(([noms, ...r]) => noms.map(n => [n, r.concat([noms[0]])])).reduce((a, b) => a.concat(b), []).sort((a, b) => b[0].length - a[0].length);
  const UA = alias(U), DA = alias(DEV);
  const esc2 = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const RU = new RegExp(`(${UA.map(a => esc2(a[0])).join('|')})`), RD = new RegExp(`(${DA.map(a => esc2(a[0])).join('|')})`);
  const trouve = (tbl, t) => { const a = tbl.find(x => x[0] === t); return a ? a[1] : null; };
  function versTemp(x, de, vers) { const c = de === 'C' ? x : de === 'F' ? (x - 32) * 5 / 9 : x - 273.15; return vers === 'C' ? c : vers === 'F' ? c * 9 / 5 + 32 : c + 273.15; }
  async function conversion(text) {
    const s = brut(text).replace(/\bpar heure\b/g, ' par heure ').replace(/\s+/g, ' ');
    // « 100 dollars en euros », « combien d'euros font 100 dollars »
    let m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${RD.source}\\s+(?:en|vers|ça fait combien en|ca fait combien en|c est combien en|combien en)\\s+(?:d )?${RD.source}`))
      || (() => { const k = s.match(new RegExp(`combien (?:de |d )?${RD.source}\\s+(?:font|fait|pour|dans)\\s+(\\d+(?:\\.\\d+)?)\\s*${RD.source}`)); return k ? [k[0], k[2], k[3], k[1]] : null; })();
    if (m) {
      const de = trouve(DA, m[2])[0], vers = trouve(DA, m[3])[0], x = +m[1];
      if (de === vers) return `${fr(x)} ${NOM_DEV[de]}, c'est pareil !`;
      const j = await getJSON(`https://api.frankfurter.dev/v1/latest?amount=${x}&from=${de}&to=${vers}`);
      const v = j.rates && j.rates[vers];
      if (v == null) return "Je n'ai pas le taux de change.";
      return `${fr(x)} ${NOM_DEV[de]}, ça fait ${fr(v, 2)} ${NOM_DEV[vers]}, au cours de la Banque centrale européenne du ${new Date(j.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`;
    }
    m = s.match(new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*${RU.source}\\s+(?:en|vers|ça fait combien de|ca fait combien de|ça fait combien en|c est combien en|combien de|combien en)\\s+(?:d )?${RU.source}(?![a-zé])`))
      || (() => { const k = s.match(new RegExp(`combien (?:de |d )?${RU.source}\\s+(?:font|fait|dans|pour|y a t il dans)\\s+(-?\\d+(?:\\.\\d+)?)\\s*${RU.source}(?![a-zé])`)); return k ? [k[0], k[2], k[3], k[1]] : null; })();
    if (!m) return null;
    const a = trouve(UA, m[2]), b = trouve(UA, m[3]), x = +m[1];
    if (!a || !b || a[0] !== b[0]) return "Ces deux unités ne se convertissent pas l'une en l'autre.";
    const v = a[0] === 't' ? versTemp(x, a[1], b[1]) : x * a[1] / b[1];
    return `${fr(x)} ${m[2]}, ça fait ${fr(v, Math.abs(v) < 10 ? 3 : 2)} ${b[2]}.`;
  }

  /* ================= 3. minuteurs, réveils, chrono, Pomodoro ================= */
  const M = () => (P().minuteurs = P().minuteurs || []);
  function duree(n) {
    let s = 0;
    if (/\b(une )?demi heure\b/.test(n)) s += 1800;
    if (/\bun quart d heure\b/.test(n)) s += 900;
    if (/\btrois quarts d heure\b/.test(n)) s += 2700;
    const h = n.match(/(\d+(?:\.\d+)?|une?|deux|trois|quatre|cinq|six|dix|douze)\s*(?:heures?|h)\b\s*(\d{1,2})?/);
    if (h) { s += (nombre(h[1]) || 0) * 3600; if (h[2]) s += +h[2] * 60; if (/\bet demie?\b/.test(n)) s += 1800; }
    const mi = n.match(/(\d+(?:\.\d+)?|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante)\s*(?:minutes?|min|mn)\b/);
    if (mi) { s += (nombre(mi[1]) || 0) * 60; if (!h && /\bet demie?\b/.test(n.slice(mi.index))) s += 30; }
    const se = n.match(/(\d+|une?|dix|vingt|trente|quarante|cinquante|soixante)\s*(?:secondes?|sec|s)\b/);
    if (se) s += nombre(se[1]) || 0;
    return Math.round(s);
  }
  const dureeTxt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return [h ? pluriel(h, 'heure') : '', m ? pluriel(m, 'minute') : '', !h && x ? pluriel(x, 'seconde') : ''].filter(Boolean).join(' et ') || 'moins d\'une seconde'; };
  function sonne(t) {
    fx.tone([[1319, 0.12], [1047, 0.12], [1319, 0.12], [1047, 0.12], [1568, 0.3]]);
    setTimeout(() => fx.tone([[1319, 0.12], [1047, 0.12], [1568, 0.3]]), 1600);
    if (dlg.state === 'sleep') wake();
    dlg.state = dlg.state === 'activity' ? 'activity' : 'talk'; dlg.silence = 0;
    if (t.type === 'reveil') say(pick(['Il est l\'heure. Réveil.', `Il est ${hhmm()}. Debout, papa.`]));
    else if (t.type === 'pomo') pomoSuite(t);
    else say(t.nom ? `Le minuteur ${t.nom} est terminé.` : 'Le minuteur est terminé.');
  }
  setInterval(() => {
    const now = Date.now(), l = M(), fini = l.filter(t => t.fin <= now);
    if (!fini.length) return;
    P().minuteurs = l.filter(t => t.fin > now); save();
    fini.forEach(sonne);
  }, 1000);
  function nomMinuteur(raw, n) {
    const sans = t => t.trim().replace(/^(le|la|les|l|du|des|de la|un|une)\s+/, '').trim();
    let m = raw.match(/\s(?:pour|du|des|de la)\s+([a-zàâäéèêëîïôöùûüç][a-zàâäéèêëîïôöùûüç -]{1,24}?)\s*$/i);
    if (m && !/(minute|heure|seconde)/.test(m[1])) return sans(m[1]);
    m = raw.match(/\s(?:minuteur|timer)\s+([a-zàâäéèêëîïôöùûüç][a-zàâäéèêëîïôöùûüç ]{1,20}?)\s+(?:de\s+|d\s+)?(?:\d|une?\s|deux|trois|dix|quinze|vingt|trente)/);
    if (m && !/^(de|d|pour|dans|un|une|le|la)$/.test(m[1].trim())) return sans(m[1]);
    return '';
  }
  async function minuteur(text) {
    const n = N(text), raw = brut(text);
    const sec = duree(n);
    if (!sec) return say("De combien de temps ? Dis par exemple : minuteur pâtes 9 minutes.");
    if (sec > 24 * 3600) return say("Pas plus de 24 heures pour un minuteur.");
    const nom = nomMinuteur(raw, n);
    M().push({ id: Date.now(), nom, fin: Date.now() + sec * 1000, total: sec, type: 'min' }); save();
    fx.tone([[880, 0.05], [1175, 0.07]]);
    return say(`Minuteur${nom ? ` ${nom}` : ''} : ${dureeTxt(sec)}. C'est parti.`);
  }
  async function reveil(text) {
    const n = N(text), m = n.match(/\b(?:a|pour)\s+(\d{1,2})\s*(?:heures?|h)\s*(\d{1,2})?/) || n.match(/\b(\d{1,2})\s*(?:heures?|h)\s*(\d{1,2})?/);
    if (!m) return say("À quelle heure ? Dis par exemple : réveille-moi à 6 heures 30.");
    const h = +m[1], mi = m[2] ? +m[2] : (/\bet demie?\b/.test(n) ? 30 : /\bet quart\b/.test(n) ? 15 : 0);
    if (h > 23 || mi > 59) return say("Cette heure n'existe pas.");
    const d = new Date(); d.setHours(h, mi, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
    M().push({ id: Date.now(), nom: 'réveil', fin: +d, total: (d - Date.now()) / 1000, type: 'reveil' }); save();
    return say(`Réveil réglé à ${h} heures${mi ? ` ${mi}` : ''}, ${d.getDate() === new Date().getDate() ? "aujourd'hui" : 'demain'}. Laisse-moi allumé.`);
  }
  async function restant(n) {
    const l = M().filter(t => t.type !== 'reveil').sort((a, b) => a.fin - b.fin);
    if (!l.length) return say("Aucun minuteur en cours.");
    const c = l.filter(t => t.nom && n.includes(N(t.nom)));
    const v = c.length ? c : l;
    return say(v.map(t => `${t.type === 'pomo' ? `Pomodoro, ${t.nom}` : t.nom ? `Minuteur ${t.nom}` : 'Minuteur'} : encore ${dureeTxt((t.fin - Date.now()) / 1000)}.`).join(' '));
  }
  async function annule(n) {
    const l = M();
    if (!l.length) return say("Il n'y a aucun minuteur.");
    if (/\btous\b/.test(n)) { P().minuteurs = []; save(); return say('Tous les minuteurs sont annulés.'); }
    const reveilV = /\breveil\b/.test(n), pomoV = /\bpomodoro\b/.test(n);
    let c = l.filter(t => t.nom && n.includes(N(t.nom)) || (reveilV && t.type === 'reveil') || (pomoV && t.type === 'pomo'));
    if (!c.length && l.filter(t => t.type === 'min').length === 1) c = l.filter(t => t.type === 'min');
    if (!c.length) return say(`Lequel ? ${l.map(t => t.nom || 'sans nom').join(', ')}.`);
    P().minuteurs = l.filter(t => !c.includes(t)); save();
    return say(c.length > 1 ? `${c.length} minuteurs annulés.` : `${c[0].type === 'reveil' ? 'Réveil' : c[0].type === 'pomo' ? 'Pomodoro' : `Minuteur${c[0].nom ? ` ${c[0].nom}` : ''}`} annulé.`);
  }
  let chrono = 0;
  async function chronoCmd(n) {
    if (/\b(arrete|stop|stoppe|fin|termine)\b/.test(n)) { if (!chrono) return say("Le chrono n'est pas lancé."); const s = (Date.now() - chrono) / 1000; chrono = 0; return say(`Chrono arrêté : ${dureeTxt(s)}.`); }
    if (chrono && /\b(combien|ou en est|temps)\b/.test(n)) return say(`Chrono : ${dureeTxt((Date.now() - chrono) / 1000)}.`);
    chrono = Date.now(); fx.tone([[1175, 0.06]]);
    return say('Chrono lancé.');
  }
  // Pomodoro : 25 minutes de concentration, 5 minutes de pause, 4 cycles (une longue pause de 15 minutes à la fin)
  async function pomodoro(n) {
    if (/\b(arrete|stop|annule|fin)\b/.test(n)) { P().minuteurs = M().filter(t => t.type !== 'pomo'); save(); return say('Pomodoro arrêté. Bon travail.'); }
    const travail = (duree(n) || 25 * 60);
    P().minuteurs = M().filter(t => t.type !== 'pomo');
    M().push({ id: Date.now(), nom: 'concentration', fin: Date.now() + travail * 1000, total: travail, type: 'pomo', cycle: 1, travail }); save();
    return say(`Pomodoro lancé : ${dureeTxt(travail)} de concentration. Je te préviens pour la pause. Le mode papa reste ouvert.`);
  }
  function pomoSuite(t) {
    const pause = t.nom === 'concentration';
    if (pause) {
      const longue = t.cycle >= 4, p = longue ? 15 * 60 : 5 * 60;
      M().push({ id: Date.now(), nom: 'pause', fin: Date.now() + p * 1000, total: p, type: 'pomo', cycle: t.cycle, travail: t.travail }); save();
      return say(longue ? 'Quatre cycles terminés. Grande pause : quinze minutes. Bravo.' : `Fin du cycle ${t.cycle}. Pause de cinq minutes : lève-toi, bois un verre d'eau.`);
    }
    if (t.cycle >= 4) return say('Pomodoro terminé. Belle session.');
    M().push({ id: Date.now(), nom: 'concentration', fin: Date.now() + t.travail * 1000, total: t.travail, type: 'pomo', cycle: t.cycle + 1, travail: t.travail }); save();
    return say(`Pause terminée. Cycle ${t.cycle + 1} : ${dureeTxt(t.travail)} de concentration.`);
  }
  function prochain() { // pour l'affichage de bord
    const l = M().slice().sort((a, b) => a.fin - b.fin)[0];
    if (!l) return '—';
    const s = Math.max(0, Math.round((l.fin - Date.now()) / 1000));
    if (l.type === 'reveil') return `RÉVEIL ${deux(new Date(l.fin).getHours())}:${deux(new Date(l.fin).getMinutes())}`;
    return `${(l.nom || 'MINUTEUR').toUpperCase().slice(0, 12)} ${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${deux(Math.floor(s % 3600 / 60))}:${deux(s % 60)}`;
  }

  /* ================= 4. les listes ================= */
  const L = () => (P().listes = P().listes || []);
  function nomListe(t) {
    const x = N(t || '').replace(/^(la |ma |les |mes )/, '').replace(/^liste (de |des |d )?/, '').trim();
    if (!x || /^(course|courses|commissions|supermarche|marche)$/.test(x)) return 'courses';
    if (/^(a faire|choses a faire|taches|tache|todo|to do|trucs a faire)$/.test(x)) return 'à faire';
    if (/^(idee|idees)$/.test(x)) return 'idées';
    return x;
  }
  const deListe = l => (l === 'courses' ? 'des courses' : l === 'à faire' ? 'des choses à faire' : l === 'idées' ? "d'idées" : `« ${l} »`);
  function articles(txt) { return String(txt).split(/,| et |\bpuis\b/).map(x => x.trim().replace(/^(du|de la|de l|des|un|une|le|la|les|l)\s+/i, '').trim()).filter(x => x.length > 1); }
  async function ajoute(raw) {
    const m = raw.match(/\b(?:ajoute|rajoute|mets|note|inscris)\s+(.+?)\s+(?:à|a|aux|dans|sur)\s+(?:la |ma |mes )?(?:liste\s+(?:de |des |d |du )?)?(courses|commissions|[a-zàâäéèêëîïôöùûüç ]{3,24}?)\s*$/i);
    if (!m) return null;
    const liste = nomListe(m[2]), items = articles(m[1]);
    if (!items.length) return null;
    const deja = L().filter(x => x.liste === liste).map(x => N(x.text));
    const neufs = items.filter(i => !deja.includes(N(i)));
    neufs.forEach((t, k) => L().push({ id: Date.now() + k, liste, text: t, at: Date.now() }));
    save(); fx.ok();
    if (!neufs.length) return say(`C'est déjà sur la liste ${deListe(liste)}.`);
    return say(`Ajouté à la liste ${deListe(liste)} : ${neufs.join(', ')}.`);
  }
  async function lis(n) {
    const noms = [...new Set(L().map(x => x.liste))];
    if (!noms.length) return say("Tes listes sont vides. Dis par exemple : ajoute du lait aux courses.");
    const m = n.match(/\bliste (?:de |des |d )?([a-z ]+?)$/) || n.match(/\b(courses|a faire|idees)\b/);
    let liste = m ? nomListe(m[1]) : noms.length === 1 ? noms[0] : 'courses';
    const items = L().filter(x => x.liste === liste);
    if (!items.length) return say(noms.length ? `La liste ${deListe(liste)} est vide. Tes listes : ${noms.map(deListe).join(', ')}.` : 'Liste vide.');
    return say(`Liste ${deListe(liste)}, ${items.length} élément${items.length > 1 ? 's' : ''} : ${items.map(x => x.text).join(', ')}.`);
  }
  async function enleve(raw) {
    const m = raw.match(/\b(?:enlève|enleve|retire|supprime|barre|efface)\s+(.+?)\s+(?:de|des|du)\s+(?:la |ma )?(?:liste\s+(?:de |des |d )?)?(courses|commissions|[a-zàâäéèêëîïôöùûüç ]{3,24}?)\s*$/i);
    if (!m) return null;
    const liste = nomListe(m[2]), cibles = articles(m[1]).map(N);
    const out = L().filter(x => x.liste === liste && cibles.some(c => N(x.text).includes(c) || c.includes(N(x.text))));
    if (!out.length) return say(`Je ne trouve pas ça sur la liste ${deListe(liste)}.`);
    out.forEach(x => tomb('papa.listes', x));
    P().listes = L().filter(x => !out.includes(x)); save();
    return say(`Retiré : ${out.map(x => x.text).join(', ')}.`);
  }
  async function vide(n) {
    const m = n.match(/\bliste (?:de |des |d )?([a-z ]+?)$/) || n.match(/\b(courses|a faire|idees)\b/);
    const liste = m ? nomListe(m[1]) : 'courses', items = L().filter(x => x.liste === liste);
    if (!items.length) return say('Elle est déjà vide.');
    if (!(await askYesNo(`Je vide la liste ${deListe(liste)}, ${items.length} élément${items.length > 1 ? 's' : ''} ?`))) return say('Je la garde.');
    items.forEach(x => tomb('papa.listes', x));
    P().listes = L().filter(x => x.liste !== liste); save();
    return say('Liste vidée.');
  }

  /* ================= 5. la météo de n'importe où ================= */
  const CIEL = c => c === 0 ? 'ciel dégagé' : c <= 2 ? 'quelques nuages' : c === 3 ? 'couvert' : c <= 48 ? 'brouillard' : c <= 57 ? 'bruine' : c <= 67 ? 'pluie' : c <= 77 ? 'neige' : c <= 82 ? 'averses' : c <= 86 ? 'averses de neige' : 'orages';
  async function lieu(nom) {
    if (!nom) { const v = S.settings.ville; return v ? { name: v.name, lat: v.lat, lon: v.lon, tz: 'auto' } : null; }
    const s = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=${encodeURIComponent(nom)}`);
    const g = s.results && s.results[0];
    return g ? { name: g.name, lat: g.latitude, lon: g.longitude, tz: g.timezone || 'auto', pays: g.country || '' } : null;
  }
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  async function meteo(text) {
    const raw = brut(text), n = N(text);
    const vm = raw.match(/\s(?:à|a|au|aux|en|sur|pour)\s+([a-zàâäéèêëîïôöùûüç][a-zàâäéèêëîïôöùûüç -]{1,30}?)\s*(?:demain|aujourd hui|ce soir|cet après midi|cet apres midi|ce matin|ce week end|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|après demain|apres demain|\?|$)/);
    const nomVille = vm && !/^(la maison|ici|demain|aujourd hui|ce soir|l heure|quelle heure)$/.test(vm[1].trim()) ? vm[1].trim() : '';
    let p;
    try { p = await lieu(nomVille); } catch (e) { return say('Le service météo ne répond pas.'); }
    if (!p) return say(nomVille ? `Je ne trouve pas ${nomVille}.` : "Je ne sais pas où tu habites : règle la ville dans mes réglages, ou dis par exemple « météo à Lyon ».");
    let w;
    try { w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&timezone=${encodeURIComponent(p.tz)}&forecast_days=7`); } catch (e) { return say('Le service météo ne répond pas.'); }
    let k = 0;
    if (/\bapres demain\b/.test(n)) k = 2; else if (/\bdemain\b/.test(n)) k = 1;
    const jw = JOURS.findIndex(j => new RegExp(`\\b${j}\\b`).test(n));
    if (jw >= 0) { const auj = new Date().getDay(); k = (jw - auj + 7) % 7 || 7; if (k > 6) k = 6; }
    const ou = `${p.name}`;
    const d = w.daily;
    const tranche = /\bce matin\b/.test(n) ? [7, 12, 'ce matin'] : /\bapres midi\b/.test(n) ? [12, 18, 'cet après-midi'] : /\bce soir\b/.test(n) ? [18, 23, 'ce soir'] : null;
    if (tranche && k === 0) {
      const day = w.hourly.time[0].slice(0, 10), hs = w.hourly.time.map((t, i) => [t, i]).filter(([t]) => t.startsWith(day) && +t.slice(11, 13) >= tranche[0] && +t.slice(11, 13) <= tranche[1]).map(([, i]) => i);
      if (hs.length) {
        const pr = Math.max(...hs.map(i => w.hourly.precipitation_probability[i] || 0)), tmin = Math.round(Math.min(...hs.map(i => w.hourly.temperature_2m[i]))), tmax = Math.round(Math.max(...hs.map(i => w.hourly.temperature_2m[i])));
        const code = w.hourly.weather_code[hs[Math.floor(hs.length / 2)]];
        return say(`${ou}, ${tranche[2]} : ${CIEL(code)}, entre ${tmin} et ${tmax} degrés, ${pr >= 60 ? `pluie probable, ${pr} %` : pr >= 25 ? `risque de pluie ${pr} %` : 'pas de pluie prévue'}.`);
      }
    }
    if (k === 0) {
      const c = w.current;
      return say(`${ou}, en ce moment : ${Math.round(c.temperature_2m)} degrés, ressenti ${Math.round(c.apparent_temperature)}, ${CIEL(c.weather_code)}, vent ${Math.round(c.wind_speed_10m)} kilomètres heure. Aujourd'hui : ${Math.round(d.temperature_2m_min[0])} à ${Math.round(d.temperature_2m_max[0])} degrés, ${d.precipitation_probability_max[0] || 0} % de risque de pluie. Coucher du soleil à ${d.sunset[0].slice(11, 16).replace(':', ' h ')}.`);
    }
    const quand = k === 1 ? 'demain' : k === 2 ? 'après-demain' : JOURS[new Date(d.time[k]).getDay()];
    return say(`${ou}, ${quand} : ${CIEL(d.weather_code[k])}, de ${Math.round(d.temperature_2m_min[k])} à ${Math.round(d.temperature_2m_max[k])} degrés, ${d.precipitation_probability_max[k] || 0} % de risque de pluie, vent jusqu'à ${Math.round(d.wind_speed_10m_max[k])} kilomètres heure.`);
  }

  /* ================= 6. l'état du PC ================= */
  async function pc() {
    const root = VOIXMAISON.root();
    if (!root) return say("Je n'ai pas l'adresse de ton ordinateur dans mes réglages.");
    let e;
    try { e = await getJSON(`${root}/shadow/pc`, 6000); } catch (er) { return say("Ton ordinateur ne répond pas. Il est peut-être éteint, ou Tailscale est coupé."); }
    const parts = [];
    if (e.allume_depuis_h != null) parts.push(`Ton ordinateur est allumé depuis ${e.allume_depuis_h >= 48 ? `${fr(Math.round(e.allume_depuis_h / 24))} jours` : `${fr(Math.round(e.allume_depuis_h))} heures`}.`);
    if (e.charge != null) parts.push(`Processeur : charge ${fr(e.charge, 1)} sur ${e.coeurs} cœurs${e.temp_cpu ? `, ${e.temp_cpu} degrés` : ''}.`);
    if (e.ram_utilisee_pct != null) parts.push(`Mémoire : ${e.ram_utilisee_pct} % de ${fr(Math.round(e.ram_go))} gigas.`);
    if (e.gpu_pct != null) parts.push(`Carte graphique : ${e.gpu_pct} %${e.temp_gpu ? `, ${e.temp_gpu} degrés` : ''}${e.vram_utilisee_pct != null ? `, mémoire vidéo à ${e.vram_utilisee_pct} %` : ''}.`);
    if (e.disque_libre_go != null) parts.push(`Disque : ${fr(e.disque_libre_go)} gigas libres.`);
    if (e.modeles) parts.push(e.modeles.length ? `Modèle d'intelligence artificielle chargé : ${e.modeles.join(', ').replace(/:latest/g, '')}.` : "Aucun modèle d'intelligence artificielle chargé en mémoire.");
    const alertes = [];
    if (e.temp_cpu >= 85 || e.temp_gpu >= 85) alertes.push('Attention, ça chauffe.');
    if (e.disque_pct >= 90) alertes.push('Le disque est presque plein.');
    if (e.ram_utilisee_pct >= 90) alertes.push('La mémoire est presque pleine.');
    return say(parts.concat(alertes).join(' '));
  }

  /* ================= 7. le point du jour ================= */
  async function point() {
    const d = new Date(), h = d.getHours();
    const parts = [`${h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'}. Il est ${h} heures ${deux(d.getMinutes())}, nous sommes ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`];
    try {
      const v = S.settings.ville;
      if (v) {
        const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
        parts.push(`Météo à ${v.name} : ${Math.round(w.current.temperature_2m)} degrés, ${CIEL(w.current.weather_code)}, maximum ${Math.round(w.daily.temperature_2m_max[0])}, ${w.daily.precipitation_probability_max[0] || 0} % de pluie.`);
      }
    } catch (e) { /* pas de météo */ }
    const up = typeof upcoming === 'function' ? upcoming(7).slice(0, 3) : [];
    if (up.length) parts.push(`Agenda : ${up.map(x => `${x.e.text} ${x.days === 0 ? "aujourd'hui" : x.days === 1 ? 'demain' : `dans ${x.days} jours`}`).join(', ')}.`);
    const mins = M();
    if (mins.length) parts.push(`${mins.length} minuteur${mins.length > 1 ? 's' : ''} en cours.`);
    const noms = [...new Set(L().map(x => x.liste))];
    if (noms.length) parts.push(`Listes : ${noms.map(l => `${L().filter(x => x.liste === l).length} pour ${l === 'à faire' ? 'les choses à faire' : l === 'courses' ? 'les courses' : l}`).join(', ')}.`);
    const notes = (P().notes || []).length;
    if (notes) parts.push(`${notes} note${notes > 1 ? 's' : ''}.`);
    const min = (S.playLog && S.playLog[dayKey()]) || 0, acts = (S.log || []).filter(x => x.at >= new Date().setHours(0, 0, 0, 0) && x.type !== 'humeur').length;
    parts.push(min ? `${name()} a passé ${min} minutes avec moi, ${acts} activité${acts > 1 ? 's' : ''}.` : `${name()} ne m'a pas encore parlé aujourd'hui.`);
    try {
      const root = VOIXMAISON.root();
      if (root) {
        const r = await getJSON(`${root}/shadow/web?mode=actus`, 8000);
        const t = (r.actus || []).slice(0, 3);
        // un titre court (les directs et les sous-titres sont coupés), puis la source
        const court = x => { let y = x.replace(/^(en direct|direct|live|vidéo|video)\s*[,:–—-]\s*/i, '').split(/\s[–—|]\s|\s:\s|\s-\s/)[0].replace(/[.!?«»"]+/g, '').trim(); if (y.length > 110) y = `${y.slice(0, 110).replace(/\s+\S*$/, '')}…`; return y; };
        if (t.length) parts.push(`À la une : ${t.map(a => `${court(a.titre)}, d'après ${a.source.replace(/\.fr$|\.com$/i, '')}`).join('. ')}.`);
      }
    } catch (e) { /* pas d'actus */ }
    parts.push("C'est tout.");
    return say(parts.join(' '));
  }

  /* ================= 8. l'heure dans le monde, les jours avant une date, le hasard ================= */
  async function heureAilleurs(raw) {
    const m = raw.match(/\bquelle heure (?:est il|il est|est-il)\s+(?:à|a|au|aux|en)\s+(.+?)\s*\??\s*$/);
    if (!m) return null;
    let p; try { p = await lieu(m[1].trim()); } catch (e) { p = null; }
    if (!p || !p.tz || p.tz === 'auto') return say(`Je ne trouve pas ${m[1].trim()}.`);
    const t = new Intl.DateTimeFormat('fr-FR', { timeZone: p.tz, hour: 'numeric', minute: '2-digit', weekday: 'long' }).formatToParts(new Date());
    const g = k => (t.find(x => x.type === k) || {}).value;
    const jour = g('weekday'), auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
    return say(`À ${p.name}, il est ${+g('hour')} heure${+g('hour') > 1 ? 's' : ''} ${g('minute')}${jour !== auj ? `, on est ${jour}` : ''}.`);
  }
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  async function joursAvant(n) {
    const fetes = { noel: [12, 25], 'jour de l an': [1, 1], 'nouvel an': [1, 1], halloween: [10, 31], 'saint valentin': [2, 14], '14 juillet': [7, 14], 'fete nationale': [7, 14], 'fete de la musique': [6, 21], 'premier mai': [5, 1], 'fete du travail': [5, 1] };
    let mo = null, j = null, an = null, nom = '';
    for (const k of Object.keys(fetes)) if (n.includes(k)) { [mo, j] = fetes[k]; nom = k === 'noel' ? 'Noël' : k; break; }
    if (!mo) {
      const m = n.match(new RegExp(`\\b(\\d{1,2}|premier)\\s+(${MOIS.join('|')})(?:\\s+(\\d{4}))?`));
      if (!m) return null;
      j = m[1] === 'premier' ? 1 : +m[1]; mo = MOIS.indexOf(m[2]) + 1; an = m[3] ? +m[3] : null; nom = `le ${j} ${MOIS[mo - 1].replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre')}`;
    }
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    let d = new Date(an || auj.getFullYear(), mo - 1, j);
    if (!an && d < auj) d = new Date(auj.getFullYear() + 1, mo - 1, j);
    const x = Math.round((d - auj) / 86400000);
    if (x === 0) return say(`C'est aujourd'hui !`);
    if (x < 0) return say(`C'était il y a ${pluriel(-x, 'jour')}.`);
    return say(`${nom.charAt(0).toUpperCase()}${nom.slice(1)}, c'est dans ${pluriel(x, 'jour')}${x > 13 ? `, soit environ ${pluriel(Math.round(x / 7), 'semaine')}` : ''}. Un ${JOURS[d.getDay()]}.`);
  }
  async function hasard(n, raw) {
    if (/\bpile ou face\b/.test(n)) { fx.tone([[1568, 0.05], [1760, 0.05]]); return say(Math.random() < 0.5 ? 'Pile.' : 'Face.'); }
    let m = n.match(/\b(?:lance|jette)\s+(?:un|le|deux|trois)?\s*des?\b(?:\s+(?:a|de)\s+(\d+)\s+faces)?/);
    if (m) { const f = +m[1] || 6, k = /\bdeux\b/.test(n) ? 2 : /\btrois\b/.test(n) ? 3 : 1; const r = Array.from({ length: k }, () => 1 + Math.floor(Math.random() * f)); return say(k > 1 ? `${r.join(', ')}. Total : ${r.reduce((a, b) => a + b, 0)}.` : `${r[0]}.`); }
    m = n.match(/\bnombre (?:au hasard |aleatoire )?entre (-?\d+) et (-?\d+)/);
    if (m) { const a = Math.min(+m[1], +m[2]), b = Math.max(+m[1], +m[2]); return say(`${a + Math.floor(Math.random() * (b - a + 1))}.`); }
    m = raw.match(/\b(?:choisis|choisi|tranche|décide|decide)\s+(?:pour moi\s+)?(?:entre\s+)?(.+?)\s+(?:et|ou)\s+(.+?)\s*\??\s*$/);
    if (m) return say(`${pick(['Je dirais', 'Je choisis', 'Va pour'])} ${pick([m[1], m[2]]).replace(/^(le|la|les|un|une)\s/, w => w)}.`);
    return null;
  }

  /* ================= la porte d'entrée ================= */
  const R = {
    minuteur: /\b(minuteur|timer|compte a rebours)\b/,
    reveil: /\b(reveille moi|reveil|reveiller)\b/,
    restant: /\b(combien de temps (il reste|reste t il)|ou en est (le|mon) minuteur|il reste combien|temps restant)\b/,
    annule: /\b(annule|arrete|stoppe|supprime|enleve)\b.*\b(minuteurs?|reveil|timer)\b/,
    chrono: /\bchrono(metre)?\b/,
    pomo: /\bpomodoro\b/,
    ajoute: /\b(ajoute|rajoute|mets|inscris)\b.*\b(a|aux|dans|sur) (la |ma |mes )?(liste|courses|commissions)\b|\b(ajoute|rajoute)\b.*\b(a|aux|dans) (la |ma )?liste\b/,
    enleve: /\b(enleve|retire|supprime|barre)\b.*\b(de|des|du) (la |ma )?(liste|courses)\b/,
    vide: /\b(vide|efface)\b.*\b(liste|courses)\b/,
    lis: /\b(lis|lire|dis moi|qu est ce qu il y a (sur|dans)|quoi sur|rappelle moi)\b.*\b(liste|courses)\b|\bma liste\b|\bquelles listes\b/,
    meteo: /\b(meteo|quel temps|va t il pleuvoir|il va pleuvoir|il pleut|pleuvoir|temperature dehors|fait il chaud|fait il froid|il fait combien dehors)\b/,
    pc: /\b(etat|statut|sante|comment va|temperature|charge)\b.*\b(pc|ordi|ordinateur|serveur|machine|processeur|carte graphique|gpu|cpu)\b|\b(etat des systemes|diagnostic)\b/,
    point: /\b(fais moi le point|fait moi le point|le point du jour|on fait le point|briefing|resume de la journee|point de la journee)\b/,
    heure: /\bquelle heure (est il|il est) (a|au|aux|en)\b/,
    jours: /\b(dans combien de jours|combien de jours (avant|jusqu a|il reste avant|reste t il avant))\b/,
    hasard: /\b(pile ou face|lance (un|le|deux|trois) des?|jette (un|le) des?|nombre (au hasard |aleatoire )?entre|choisis (pour moi |entre)|tranche entre)\b/,
    conversion: /\b(en|vers|combien (de|d)) (euros?|dollars?|livres?|francs?|yens?|yuans?|kilometres?|km|miles?|metres?|pieds?|pouces?|kilos?|kg|grammes?|litres?|gallons?|degres|celsius|fahrenheit|gigas?|go|mo|kwh|noeuds?|mph|km h|hectares?|acres?|onces?|tasses?|centimetres?|cm)\b/,
    calcul: /\d.*\b(plus|moins|fois|divise|multiplie|sur|puissance|au carre|au cube|pour ?cents?)\b|\bracine\b|\d\s*[-+*/x×÷%^]\s*\d|\b(ht|ttc)\b.*\d|\d.*\b(ht|ttc)\b/,
  };
  function route(text, n) {
    const raw = brut(text);
    if (R.pomo.test(n)) return () => pomodoro(n);
    if (R.chrono.test(n)) return () => chronoCmd(n);
    if (R.restant.test(n)) return () => restant(n);
    if (R.annule.test(n)) return () => annule(n);
    if (R.reveil.test(n) && /\d/.test(n)) return () => reveil(text);
    if (R.minuteur.test(n)) return () => minuteur(text);
    if (R.vide.test(n)) return () => vide(n);
    if (R.ajoute.test(n)) return async () => { if ((await ajoute(raw)) === null) await say("Je n'ai pas compris quoi ajouter. Dis par exemple : ajoute du lait et des œufs aux courses."); };
    if (R.enleve.test(n)) return async () => { if ((await enleve(raw)) === null) await say("Je n'ai pas compris quoi retirer."); };
    if (R.lis.test(n)) return () => lis(n);
    if (R.point.test(n)) return point;
    if (R.pc.test(n)) return pc;
    if (R.heure.test(n)) return async () => { if ((await heureAilleurs(raw)) === null) await say("Pour quelle ville ?"); };
    if (R.jours.test(n)) return async () => { if ((await joursAvant(n)) === null) await say('Pour quelle date ? Dis par exemple : dans combien de jours le 14 février.'); };
    if (R.hasard.test(n)) return async () => { if ((await hasard(n, raw)) === null) await say('Pile ou face, un dé, un nombre entre deux valeurs, ou un choix entre deux options ?'); };
    if (R.meteo.test(n)) return () => meteo(text);
    if (R.conversion.test(n) && /\d/.test(n)) {
      return async () => {
        let r = null;
        try { r = await conversion(text); } catch (e) { r = 'Le service des taux de change ne répond pas.'; }
        if (r) return say(r);
        const c = calcul(text);
        return say(c || "Je n'ai pas compris la conversion. Dis par exemple : 100 dollars en euros, ou 10 miles en kilomètres.");
      };
    }
    if (/\d/.test(raw)) { const c = calcul(text); if (c) return () => say(c); }
    return null;
  }

  return { route, prochain, minuteur, meteo, calcul, conversion, _duree: duree, _evaluer: evaluer };
})();
