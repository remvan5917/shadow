/* =========================================================
   SHADOW — module « orthographe »
   Découpe la phrase, compare l'épellation et fabrique des indices
   qui n'écrivent JAMAIS le mot corrigé.
   ========================================================= */
'use strict';

const ORTHO = (() => {
  const VOWELS = 'aeiouyàâäéèêëîïôöùûüÿœæ';
  const lower = s => String(s).toLowerCase().normalize('NFC');
  // œ / æ : on accepte aussi « oe » / « ae » tapés en deux lettres
  const lig = s => lower(s).replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  // sans accents (pour comparer la structure du mot)
  const bare = s => lig(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const isVowel = c => !!c && VOWELS.includes(c);

  /* ---------- découpage de la phrase ---------- */
  function tokenize(text) {
    return String(text)
      .replace(/[’`]/g, "'")
      .replace(/[.,!?;:«»"“”()…[\]]/g, ' ')
      .split(/\s+/)
      .map(w => {
        const t = lower(w).replace(/^['-]+|['-]+$/g, '');
        const spell = /^[a-zàâäçéèêëîïôöùûüÿœæ'-]+$/.test(t) && /[a-zàâäçéèêëîïôöùûüÿœæ]/.test(t);
        return { w: w.replace(/^['-]+|['-]+$/g, ''), t, spell };
      })
      .filter(x => x.t);
  }

  function format(text) {
    let t = String(text).trim().replace(/\s+/g, ' ');
    if (!t) return t;
    t = t[0].toUpperCase() + t.slice(1);
    if (!/[.!?…]$/.test(t)) t += '.';
    return t;
  }

  const same = (a, t) => lig(a) === lig(t);

  function lev(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  const commonPrefix = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };

  /* ---------- petits mots qui se ressemblent (homophones) ---------- */
  // clé : « mot juste|mot épelé » (sans œ). Les indices ne contiennent jamais le mot juste.
  const HOMO = {
    'à|a': "Essaie de dire « avait » à la place. Ça ne marche pas ? Alors ce petit mot a besoin d'un accent grave !",
    'a|à': "Essaie de dire « avait » à la place. Ça marche ? Alors c'est le verbe avoir : pas besoin d'accent !",
    'est|et': "Essaie de dire « était » à la place. Ça marche ? Alors c'est le verbe être : il lui faut plus de lettres !",
    'est|e': "Essaie de dire « était » à la place. Ça marche ? Alors c'est le verbe être : il lui faut plus de lettres !",
    'et|est': "Essaie de dire « était » à la place. Ça ne marche pas ? Alors c'est le petit mot qui relie, il n'a que 2 lettres !",
    'et|es': "Essaie de dire « était » à la place. Ça ne marche pas ? Alors c'est le petit mot qui relie, il n'a que 2 lettres !",
    'et|e': "C'est le petit mot qui relie deux choses : il a 2 lettres, et la 2e est muette !",
    'où|ou': "Ici, ça parle d'un endroit ! Alors il faut un accent sur une lettre.",
    'ou|où': "Ici, ça ne parle pas d'un endroit : pas besoin d'accent !",
    'sont|son': "Essaie de dire « étaient » à la place. Ça marche ? Alors c'est le verbe être : il manque une lettre muette à la fin !",
    'son|sont': "Essaie de dire « mon » à la place. Ça marche ? Alors il n'y a pas de lettre muette à la fin !",
    'ont|on': "Essaie de dire « avaient » à la place. Ça marche ? Alors c'est le verbe avoir : il manque une lettre muette à la fin !",
    'on|ont': "Essaie de dire « il » à la place. Ça marche ? Alors il n'y a pas de lettre muette à la fin !",
    'ces|ses': "Ici, on montre des choses du doigt : ça commence par la même lettre que « celui-là » !",
    'ses|ces': "Ici, ça veut dire « les siens » : ça commence par la même lettre que « sien » !",
    'là|la': "Ici, ça veut dire « à cet endroit » : il faut un accent !",
    'la|là': "Ici, ce n'est pas un endroit : pas besoin d'accent !",
    'ça|sa': "Ici, on peut dire « cela ». Il faut un C avec une cédille !",
    'ça|ca': "Toutes les lettres sont là ! Mais le C a besoin d'une cédille.",
    'sa|ça': "Ici, ça veut dire « la sienne » : ça commence par S, comme « son » !",
    'mais|mes': "Ici, on pourrait dire « pourtant ». Le son « è » s'écrit avec 2 lettres, plus une lettre muette !",
    'mes|mais': "Ici, ça veut dire « les miens » : ça s'écrit comme « tes » et « ses », avec un M !",
  };
  // mots où il faut entendre la phrase pour savoir lequel écrire
  const CONTEXT = new Set(['a', 'à', 'et', 'est', 'ou', 'où', 'son', 'sont', 'on', 'ont', 'ces', 'ses', "c'est", "s'est",
    'mes', 'mais', 'ce', 'se', 'la', 'là', 'sa', 'ça', 'leur', 'leurs', 'vers', 'vert', 'verre', 'ver', 'mer', 'mère', 'maire',
    'cou', 'coup', 'pain', 'pin', 'sans', 'cent', 'sang', 'dans', 'dent', 'vin', 'vingt', 'fin', 'faim', 'seau', 'sot', 'saut',
    'peu', 'peut', 'peux', 'si', 'ci', 'ni', 'nid', 'quand', 'quant', 'camp', 'tant', 'temps', 'tard', 'thé', 'fée', 'fait']);

  /* ---------- sons complexes ---------- */
  const SOUNDS = [
    { g: 'eau', son: 'o', ex: ['un gâteau', 'un château', 'un cadeau'] },
    { g: 'ain', son: 'in', nasal: 1, ex: ['le pain', 'la main', 'demain'] },
    { g: 'ein', son: 'in', nasal: 1, ex: ['plein', 'la peinture'] },
    { g: 'oin', son: 'oin', nasal: 1, ex: ['loin', 'un coin'] },
    { g: 'ill', son: 'ille', ex: ['une fille', 'un papillon'] },
    { g: 'ph', son: 'f', ex: ['une photo', 'un dauphin'] },
    { g: 'gn', son: 'gn', ex: ['la montagne', 'un champignon'] },
    { g: 'ch', son: 'ch', ex: ['un chat', 'un cochon'] },
    { g: 'qu', son: 'k', ex: ['quatre', 'un coquillage'] },
    { g: 'au', son: 'o', ex: ['jaune', 'une auto', 'chaud'] },
    { g: 'ai', son: 'è', ex: ['la maison', 'du lait', 'une fraise'] },
    { g: 'ei', son: 'è', ex: ['la neige', 'une baleine'] },
    { g: 'oi', son: 'oi', ex: ['le roi', 'une étoile'] },
    { g: 'ou', son: 'ou', ex: ['la roue', 'un loup', 'une poule'] },
    { g: 'an', son: 'an', nasal: 1, ex: ['maman', 'un éléphant'] },
    { g: 'am', son: 'an', nasal: 1, ex: ['une lampe', 'la chambre'] },
    { g: 'en', son: 'an', nasal: 1, ex: ['le vent', 'une dent'] },
    { g: 'em', son: 'an', nasal: 1, ex: ['novembre', 'emporter'] },
    { g: 'on', son: 'on', nasal: 1, ex: ['un ballon', 'un bonbon'] },
    { g: 'om', son: 'on', nasal: 1, ex: ['une pompe', 'le nombre'] },
    { g: 'in', son: 'in', nasal: 1, ex: ['un lapin', 'le jardin'] },
    { g: 'im', son: 'in', nasal: 1, ex: ['important', 'simple'] },
    { g: 'un', son: 'un', nasal: 1, ex: ['lundi', 'brun'] },
    { g: 'ss', son: 's', ex: ['une tasse', 'un poisson'] },
    { g: 'er', son: 'é', end: 1, ex: ['manger', 'un boulanger'] },
    { g: 'ez', son: 'é', end: 1, ex: ['le nez', 'chez'] },
    { g: 'et', son: 'è', end: 1, ex: ['un jouet', 'un poulet'] },
  ];

  function fits(s, w, i) {
    const after = w[i + s.g.length];
    if (s.nasal && after && (isVowel(after) || after === 'n' || after === 'm')) return false;
    if (s.g === 'en' && w[i - 1] === 'i') return false; // « ien » se dit « in »
    if (s.end && (i + s.g.length !== w.length || w.length < 4)) return false;
    if (s.g === 'ss' && !(isVowel(w[i - 1]) && isVowel(after))) return false;
    return true;
  }
  // découpe un mot (sans accents) en graphèmes : « bateau » → b a t eau
  function units(w) {
    const out = [];
    let i = 0;
    while (i < w.length) {
      const s = SOUNDS.find(x => w.startsWith(x.g, i) && fits(x, w, i));
      if (s) { out.push({ g: s.g, s, i }); i += s.g.length; }
      else { out.push({ g: w[i], i }); i++; }
    }
    return out;
  }

  const ACCENT_NAMES = {
    'é': 'un accent aigu ( é )', 'è': 'un accent grave ( è )', 'ê': 'un accent circonflexe ( ê )',
    'à': 'un accent grave ( à )', 'ù': 'un accent grave ( ù )', 'â': 'un accent circonflexe ( â )',
    'î': 'un accent circonflexe ( î )', 'ô': 'un accent circonflexe ( ô )', 'û': 'un accent circonflexe ( û )',
    'ç': 'une cédille ( ç )', 'ë': 'un tréma ( ë )', 'ï': 'un tréma ( ï )', 'ü': 'un tréma ( ü )',
  };

  function accentHint(T, A) {
    const t = [...T], a = [...A];
    for (let i = 0; i < t.length; i++) {
      if (t[i] === a[i]) continue;
      if (ACCENT_NAMES[t[i]]) return `Mais la lettre n°${i + 1} a besoin d'${ACCENT_NAMES[t[i]]} !`;
      return `Mais la lettre n°${i + 1} n'a pas besoin d'accent !`;
    }
    return "Regarde bien les accents !";
  }

  function endHint(rest) {
    if (rest === 'e') return "Il manque une lettre muette à la fin de ton mot : une voyelle qu'on n'entend presque pas !";
    if (rest === 'ent') return "Ton mot dit ce que font plusieurs personnes ? Alors il lui faut une fin muette de 3 lettres !";
    if (rest === 'es') return "Il manque 2 lettres muettes à la fin. Pense au féminin et au pluriel !";
    if (rest === 's' || rest === 'x') return "Il manque une lettre muette à la fin ! Est-ce qu'il y en a plusieurs ? Pense au pluriel.";
    if (rest.length === 1 && 'tdpzcg'.includes(rest)) return "Il manque une lettre muette à la fin ! Dis ton mot au féminin, ou trouve un mot de la même famille : tu vas l'entendre.";
    if (rest.length === 1) return "Il manque une lettre à la fin de ton mot. Écoute bien le dernier son !";
    return `Le début est parfait ! Il manque encore ${rest.length} lettres à la fin.`;
  }

  function soundHint(s, T) {
    const exs = s.ex.filter(e => !bare(e).split(/[^a-z]+/).includes(T));
    const ex = pick(exs.length ? exs : s.ex);
    if (s.g === 'ss') return `Entre deux voyelles, le son « s » s'écrit avec 2 lettres, comme dans « ${ex} ».`;
    if (s.end) return `La fin de ton mot fait « ${s.son} ». Ici, elle s'écrit avec 2 lettres, comme dans « ${ex} ».`;
    return `Le son « ${s.son} » de ton mot s'écrit avec ${s.g.length} lettres, comme dans « ${ex} ».`;
  }

  function opener(TB, AB) {
    const d = lev(TB, AB);
    if (d <= 1) return pick(['Tu y es presque, bravo !', 'Presque ! Tu as trouvé presque tout !']);
    if (d <= 2 || commonPrefix(TB, AB) >= 2) return pick(['Tu as trouvé plein de sons !', 'Bien joué, tu entends bien les sons !']);
    return pick(['Bien essayé !', 'Bonne idée, on y est presque !']);
  }

  // Indice fait maison (marche sans Internet). Ne contient jamais le mot.
  function localHint(t, a) {
    const T = lig(t), A = lig(a);
    if (!A) return { open: '', text: 'Tape les lettres une par une, puis appuie sur ✅.' };
    const homo = HOMO[`${T}|${A}`];
    if (homo) return { open: 'Bien essayé !', text: homo };
    const TB = bare(T), AB = bare(A);
    if (TB === AB) return { open: 'Tu as trouvé toutes les lettres, bravo !', text: accentHint(T, A) };
    const open = opener(TB, AB);
    if (TB.startsWith(AB)) return { open, text: endHint(TB.slice(AB.length)) };
    if (AB.startsWith(TB)) return { open: 'Tu as trouvé tout le mot… et même un peu plus !', text: 'Il y a une lettre en trop à la fin. Laquelle ?' };
    if (TB[0] === 'h' && AB[0] !== 'h') return { open, text: "Ton mot commence par une lettre muette, qu'on n'entend pas du tout !" };

    const au = units(AB).map(u => u.g);
    for (const u of units(TB)) {
      if (!u.s) continue;
      const need = units(TB).filter(x => x.g === u.g).length;
      if (au.filter(g => g === u.g).length < need) return { open, text: soundHint(u.s, TB) };
    }
    const dbl = TB.match(/([bcdfglmnprt])\1/);
    if (dbl && !AB.includes(dbl[0])) return { open, text: 'Une lettre de ton mot est doublée ! Écoute bien : où est-elle ?' };
    const last = TB[TB.length - 1];
    if ('tdspxz'.includes(last) && AB[AB.length - 1] !== last) return { open, text: "Ton mot se termine par une lettre muette, qu'on n'entend pas !" };
    const k = commonPrefix(TB, AB);
    if (k >= 1) return { open, text: `Le début est juste jusqu'à la lettre n°${k} ! Écoute bien la suite.` };
    return { open, text: 'Écoute bien le premier son de ton mot. Réécoute-le avec 🔊 !' };
  }

  // L'IA peut-elle aider pour ce mot ? (pas pour les tout petits mots ni les homophones connus)
  const aiOk = (t, a) => bare(t).replace(/[^a-z]/g, '').length >= 3 && !HOMO[`${lig(t)}|${lig(a)}`];

  // Vrai si un texte d'indice laisse échapper le mot (écrit en entier ou épelé)
  function leaks(text, t) {
    const parts = bare(t).split(/['-]/).filter(p => p.length >= 2);
    const whole = bare(t).replace(/[^a-z]/g, '');
    const words = bare(text).split(/[^a-z]+/).filter(Boolean);
    for (const w of words) {
      if (w === whole || parts.includes(w)) return true;
      if (w === whole + 's' || w === whole + 'x') return true;
    }
    let run = '';
    for (const w of words) {
      if (w.length === 1) { run += w; if (run.includes(whole)) return true; } else run = '';
    }
    return false;
  }

  // Squelette d'aide après plusieurs essais : B A _ _ _ _ (jamais le mot entier)
  function skeleton(t, tries) {
    if (tries < 3) return null;
    const chars = [...lower(t)];
    const n = Math.min(tries - 2, chars.length - 1);
    return chars.map((c, i) => (i < n || c === "'" || c === '-') ? c.toUpperCase() : '_');
  }


  /* ---------- comprendre un mot épelé à voix haute ---------- */
  const norm = t => bare(t).replace(/['’-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const LETTER_WORDS = {
    a: 'a', ah: 'a', ha: 'a', b: 'b', be: 'b', bai: 'b', bee: 'b', c: 'c', ce: 'c', se: 'c', d: 'd', de: 'd', des: 'd',
    e: 'e', eu: 'e', euh: 'e', f: 'f', ef: 'f', effe: 'f', ff: 'f', g: 'g', ge: 'g', jai: 'g', h: 'h', ache: 'h', hache: 'h',
    ach: 'h', ash: 'h', i: 'i', hi: 'i', y: 'y', j: 'j', ji: 'j', gi: 'j', k: 'k', ka: 'k', ca: 'k', l: 'l', el: 'l',
    elle: 'l', ele: 'l', m: 'm', em: 'm', aime: 'm', emme: 'm', n: 'n', en: 'n', haine: 'n', enne: 'n', o: 'o', oh: 'o',
    eau: 'o', au: 'o', p: 'p', pe: 'p', q: 'q', ku: 'q', cu: 'q', qu: 'q', r: 'r', er: 'r', air: 'r', erre: 'r',
    aire: 'r', hair: 'r', s: 's', es: 's', esse: 's', t: 't', te: 't', the: 't', tai: 't', u: 'u', hu: 'u', v: 'v',
    ve: 'v', w: 'w', x: 'x', ix: 'x', ixe: 'x', iks: 'x', z: 'z', zed: 'z', zede: 'z',
  };
  const FILLERS = new Set(['et', 'puis', 'apres', 'ensuite', 'le', 'la', 'lettre', 'lettres', 'cest', 'alors', 'voila', 'fini',
    'ca', 'donc', 'je', 'dis', 'epelle', 'ai', 'un', 'une', 'avec', 'majuscule', 'comme', 'mot', 'ok', 'voici']);
  const ACCENT = {
    aigu: { e: 'é' }, grave: { e: 'è', a: 'à', u: 'ù' },
    circonflexe: { e: 'ê', a: 'â', i: 'î', o: 'ô', u: 'û' }, chapeau: { e: 'ê', a: 'â', i: 'î', o: 'ô', u: 'û' },
    cedille: { c: 'ç' }, trema: { e: 'ë', i: 'ï', u: 'ü' },
  };
  // « bé, a, té, o » / « B A T O » / « BATO » → ['b','a','t','o'] ; null si ce n'étaient pas des lettres
  function parseSpelling(raw) {
    const toks = String(raw).replace(/[’`]/g, "'").split(/[\s,.;:!?–—/«»"]+/).filter(Boolean);
    const out = [];
    let unknown = 0;
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      const lo = lower(tok);
      const b = bare(tok).replace(/'/g, '');
      const next = toks[i + 1] ? bare(toks[i + 1]).replace(/'/g, '') : '';
      if (/^[A-ZÀÂÇÉÈÊËÎÏÔÛÙ]{2,}$/.test(tok)) { out.push(...[...lo]); continue; } // « BATO »
      if (/^[a-zàâçéèêëîïôûùœ]$/.test(lo)) {
        if (lo === 'i' && next === 'grec') { out.push('y'); i++; continue; }
        out.push(lo); continue;
      }
      if (b === 'apostrophe') { out.push("'"); continue; }
      if (b === 'tiret' || b === 'trait') { out.push('-'); continue; }
      if (b === 'double' && (next === 'v' || next === 've')) { out.push('w'); i++; continue; }
      if ((b === 'deux' || b === 'double') && LETTER_WORDS[next]) { out.push(LETTER_WORDS[next], LETTER_WORDS[next]); i++; continue; }
      if (b === 'accent' || ACCENT[b]) {
        const kind = ACCENT[b] ? b : next;
        if (b === 'accent') i++;
        const last = out[out.length - 1];
        if (ACCENT[kind] && last && ACCENT[kind][last]) out[out.length - 1] = ACCENT[kind][last];
        continue;
      }
      if (LETTER_WORDS[b]) { out.push(LETTER_WORDS[b]); continue; }
      if (FILLERS.has(b)) continue;
      unknown++;
    }
    if (!out.length || unknown > out.length / 2) return null;
    return out;
  }

  return { tokenize, format, same, localHint, aiOk, leaks, skeleton, needsContext: t => CONTEXT.has(lower(t)), bare, norm, parseSpelling };
})();
