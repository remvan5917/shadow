/* =========================================================
   SHADOW — le monde des Pokémon (tout à la voix)
   - le Pokédex : « parle-moi de Pikachu » (fiche à l'écran : types, taille, poids, forces, évolutions) ;
   - « qui est ce Pokémon ? » : Shadow donne des indices ;
   - les combats : on choisit son Pokémon et le type de chaque attaque (les types comptent vraiment),
     avec un peu de calcul pour gagner un coup critique ;
   - la chasse : un Pokémon sauvage apparaît, une petite question pour lancer la Ball, et il rejoint le Pokédex ;
   - le quiz Pokémon, les médailles de dresseur.
   Données : pokedata.js (faits de PokéAPI). Les images ne sont pas dans Shadow : elles sont affichées depuis le dépôt
   public de PokéAPI au moment de les montrer (elles appartiennent à Nintendo / The Pokémon Company) ; réglage pour les couper.
   ========================================================= */
'use strict';

const POKEMON = (() => {
  /* ---------- les données ---------- */
  const TYPES = POKEDATA.types;
  const COUL = ['#A8A77A', '#C22E28', '#A98FF3', '#A33EA1', '#E2BF65', '#B6A136', '#A6B91A', '#735797', '#B7B7CE', '#EE8130', '#6390F0', '#7AC74C', '#F7D02C', '#F95587', '#96D9D6', '#6F35FC', '#705746', '#D685AD'];
  const FACT = [0, 0.5, 1, 2];
  const eff1 = (a, d) => FACT[+POKEDATA.eff[a * 18 + d]];
  const effOn = (a, p) => p.t.reduce((x, d) => x * eff1(a, d), 1);
  // clé « phonétique » : les oreilles écrivent parfois « Pikatchou » ou « Dracofeu »
  const key = s => ORTHO.bare(String(s)).replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f').replace(/qu/g, 'k').replace(/ck|cc/g, 'k').replace(/c(?=[aou])/g, 'k').replace(/tch/g, 'ch').replace(/sh/g, 'ch')
    .replace(/eau|au/g, 'o').replace(/ou/g, 'u').replace(/ai|ei/g, 'e').replace(/y/g, 'i').replace(/w/g, 'v').replace(/(.)\1+/g, '$1')
    .replace(/(er|ez|e|s|t|x|d)$/, '');
  const P = POKEDATA.raw.split('\n').map((l, i) => {
    const [nom, cat, ty, from, h, w, st, flag, gen] = l.split('|');
    return { id: i + 1, nom, cat, t: ty.split('.').map(Number), from: +from, h: +h, w: +w, s: st.split(',').map(Number), flag: +flag, gen: +gen, k: key(nom) };
  });
  const BY = {}; P.forEach(p => { BY[p.id] = p; });
  const KIDS = {}; P.forEach(p => { if (p.from) (KIDS[p.from] = KIDS[p.from] || []).push(p.id); });
  const total = p => p.s.reduce((a, b) => a + b, 0);
  const root = p => { let r = p; while (r.from && BY[r.from]) r = BY[r.from]; return r; };
  const stage = p => { let n = 0, r = p; while (r.from && BY[r.from]) { r = BY[r.from]; n++; } return n; };
  const pool = () => (S.settings.pokeGen === 'tous' ? P : P.filter(p => p.gen <= (S.settings.pokeGen || 1)));
  const typesTxt = p => p.t.map(i => TYPES[i]).join(' et ');
  const taille = p => (p.h < 10 ? `${p.h * 10} centimètres` : `${Math.floor(p.h / 10)} mètre${p.h >= 20 ? 's' : ''}${p.h % 10 ? ` ${p.h % 10 * 10}` : ''}`);
  const poids = p => { const kg = p.w / 10; return kg < 1 ? `${Math.round(kg * 1000)} grammes` : `${String(kg).replace('.', ',')} kilo${kg >= 2 ? 's' : ''}`; };
  // contre qui il est fort (ses types attaquent) et qui le bat (types qui l'attaquent)
  const fortContre = p => [...new Set(p.t.flatMap(a => TYPES.map((_, d) => d).filter(d => eff1(a, d) >= 2)))];
  const faibleContre = p => TYPES.map((_, a) => a).filter(a => effOn(a, p) >= 2);

  /* ---------- reconnaître un nom de Pokémon dans une phrase ---------- */
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = cur[0];
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function findIn(text, { strict = false } = {}) {
    const words = ORTHO.bare(String(text)).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const grams = [];
    for (let i = 0; i < words.length; i++) for (let n = 1; n <= 3 && i + n <= words.length; n++) grams.push(key(words.slice(i, i + n).join('')));
    let best = null;
    for (const g of grams) {
      if (g.length < 3) continue;
      for (const p of P) {
        if (p.k === g) { if (!best || best.d > 0 || p.k.length > best.p.k.length) best = { p, d: 0 }; continue; }
        if (strict || p.k.length < 5) continue;
        const tol = p.k.length >= 8 ? 2 : 1;
        const d = lev(g, p.k, tol);
        if (d <= tol && (!best || d < best.d)) best = { p, d };
      }
    }
    return best && best.p;
  }

  /* ---------- l'écran ---------- */
  const pill = i => `<span class="ptype" style="background:${COUL[i]}">${esc(TYPES[i])}</span>`;
  // l'image du Pokémon (affichée depuis PokéAPI, gardée en réserve une fois vue) ; ombre = « qui est ce Pokémon ? »
  const IMG = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  const img = (p, cls) => (S.settings.pokeImages === false ? '' : `<img class="pimg ${cls || ''}" src="${IMG(p.id)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`);
  const num = p => `#${String(p.id).padStart(3, '0')}`;
  function chaine(p) {
    const r = root(p), out = [];
    const walk = (x, d) => { out.push({ x, d }); (KIDS[x.id] || []).forEach(k => walk(BY[k], d + 1)); };
    walk(r, 0);
    return out;
  }
  function carte(p) {
    const st = [['PV', 0], ['Attaque', 1], ['Défense', 2], ['Vitesse', 5]];
    const ch = chaine(p);
    const evo = ch.length > 1 ? `<p class="pevo">${ch.map(c => (c.x.id === p.id ? `<b>${esc(c.x.nom)}</b>` : esc(c.x.nom))).join(' → ')}</p>` : '<p class="pevo">Il n\'évolue pas.</p>';
    const pic = img(p);
    return `<div class="pcard" style="--c:${COUL[p.t[0]]}">
      ${pic ? `<div class="pimgbox">${pic}<span class="pnum">${num(p)}</span></div>` : `<div class="porb">${num(p)}</div>`}
      <h3>${esc(p.nom)}</h3><p class="pcat">Pokémon ${esc(p.cat)}${p.flag === 1 ? ' · légendaire' : p.flag === 2 ? ' · fabuleux' : ''}</p>
      <div class="ptypes">${p.t.map(pill).join('')}</div>
      <p class="pmes">${esc(taille(p))} · ${esc(poids(p))}</p>
      <div class="pstats">${st.map(([l, i]) => `<div><span>${l}</span><i style="width:${Math.min(100, Math.round(p.s[i] / 1.6))}%"></i><b>${p.s[i]}</b></div>`).join('')}</div>
      ${evo}
      <p class="pfort">Fort contre : ${fortContre(p).map(pill).join('') || '—'}</p>
      <p class="pfort">Faible contre : ${faibleContre(p).map(pill).join('') || '—'}</p></div>`;
  }
  function decrire(p) {
    const kids = (KIDS[p.id] || []).map(k => BY[k].nom);
    const evo = kids.length ? ` Il évolue en ${kids.length > 2 ? `${kids.length} Pokémon différents, comme ${kids.slice(0, 2).join(' et ')}` : kids.join(' ou ')}.` : p.from ? " C'est sa dernière évolution." : " Il n'évolue pas.";
    const f = fortContre(p).slice(0, 3).map(i => TYPES[i]), w = faibleContre(p).slice(0, 2).map(i => TYPES[i]);
    return `${p.nom}, le Pokémon ${p.cat}, numéro ${p.id}. Type ${typesTxt(p)}.${p.flag === 1 ? " C'est un Pokémon légendaire !" : p.flag === 2 ? " C'est un Pokémon fabuleux, très rare !" : ''} Il mesure ${taille(p)} et pèse ${poids(p)}.${evo}${f.length ? ` Il est fort contre ${f.join(', ')}` : ''}${w.length ? `${f.length ? ', mais' : ' Il est'} faible contre ${w.join(' et ')}.` : '.'}`;
  }
  async function pokedex(p) {
    showBoard(carte(p), 'solid');
    face.set('happy'); VISAGE.puff('etoile', 2);
    if (caught()[p.id]) await say(`${decrire(p)} Et tu l'as déjà dans ton Pokédex !`);
    else await say(decrire(p));
    const shown = $('#board').innerHTML;
    setTimeout(() => { if ($('#board').innerHTML === shown) hideBoard(); }, 20000);
  }

  /* ---------- la collection de l'enfant ---------- */
  const caught = () => S.pokeCaught || (S.pokeCaught = {});
  const stats = () => S.pokeStats || (S.pokeStats = {});
  const nCaught = () => Object.keys(caught()).length;
  function attraper(p) { caught()[p.id] = Date.now(); S.pokeLvl = S.pokeLvl || {}; S.pokeLvl[p.id] = Math.max(S.pokeLvl[p.id] || 0, 5); save(); }
  async function monPokedex() {
    const c = caught(), ids = Object.keys(c).map(Number).sort((a, b) => c[b] - c[a]);
    const g1 = ids.filter(i => i <= 151).length;
    showBoard(`<div class="pdex"><h3>Ton Pokédex</h3><p class="pbig">${ids.length}<small> Pokémon attrapés</small></p><p>${g1} / 151 de la 1re génération · ${ids.length} / ${P.length} en tout</p>
      <div class="pchips">${ids.slice(0, 18).map(i => `<span style="--c:${COUL[BY[i].t[0]]}">${img(BY[i], 'pchip')}${esc(BY[i].nom)}</span>`).join('')}</div></div>`, 'solid');
    if (!ids.length) return say("Ton Pokédex est encore vide ! Dis « on part à la chasse aux Pokémon » pour en attraper.");
    await say(`Tu as attrapé ${ids.length} Pokémon ! Le dernier, c'est ${BY[ids[0]].nom}.${stats().wins ? ` Et tu as gagné ${stats().wins} combat${stats().wins > 1 ? 's' : ''}.` : ''}`);
  }

  /* ---------- la chasse ---------- */
  function sauvage() {
    const pl = pool().filter(p => p.flag === 0 || Math.random() < 0.03); // les légendaires sont très rares
    const w = pl.map(p => (stage(p) === 0 ? 3 : stage(p) === 1 ? 1.5 : 0.7) * (caught()[p.id] ? 0.5 : 1)); // surtout des bébés, et des nouveaux
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pl.length; i++) { r -= w[i]; if (r <= 0) return pl[i]; }
    return pl[0];
  }
  async function rencontre(p) {
    showBoard(`<div class="pwild">${carte(p)}<p class="pmsg">Un ${esc(p.nom)} sauvage apparaît !</p></div>`, 'solid');
    fx.tone([[659, 0.08], [784, 0.08], [988, 0.14]]);
    face.set('surprise');
    await say(`Oh ! Un ${p.nom} sauvage apparaît ! C'est un Pokémon de type ${typesTxt(p)}.`);
    const q = calcQ(Math.random() < 0.5 ? 'mix' : 'c10');
    const a = await ask(`Pour lancer la Poké Ball, réponds vite : ${q.ask}`, { wait: 20000 });
    const v = JEUX.parseNumber(a);
    if (v === q.r) {
      fx.ok(); face.set('proud'); fx.confetti(50);
      const nouveau = !caught()[p.id];
      attraper(p);
      logAct('pokechasse', p.nom, 1, 1);
      await say(`Bonne réponse, ${q.r} ! La Ball tremble… une fois… deux fois… et clic ! ${p.nom} est attrapé !${nouveau ? ` Il rejoint ton Pokédex : tu as maintenant ${nCaught()} Pokémon.` : " Tu l'avais déjà, mais il devient plus fort !"}`);
      return true;
    }
    fx.oops(); face.flash('oops');
    logAct('pokechasse', p.nom, 0, 1);
    await say(`Oh non, la réponse était ${q.r}. ${p.nom} s'est échappé de la Ball et s'est enfui !`);
    return false;
  }
  async function chasse() {
    face.set('happy');
    await say("C'est parti pour la chasse aux Pokémon ! On fouille les hautes herbes…");
    for (let i = 0; i < 3; i++) {
      await wait(500);
      await rencontre(sauvage());
      if (i < 2 && !(await askYesNo('On continue de chercher ?'))) break;
    }
    hideBoard();
    checkBadges();
  }

  /* ---------- qui est ce Pokémon ? ---------- */
  async function devinette() {
    const pl = pool(), p = pl[Math.floor(Math.random() * pl.length)];
    const indices = [
      `Il est de type ${typesTxt(p)}.`,
      `Il mesure ${taille(p)}.`,
      p.from ? `Il évolue de ${BY[p.from].nom}.` : (KIDS[p.id] ? 'Il peut évoluer.' : "Il n'évolue pas."),
      `C'est le Pokémon ${p.cat}.`,
      `Son nom commence par ${LETTER_NAMES[ORTHO.bare(p.nom[0])] || p.nom[0]} et il a ${p.nom.replace(/[^A-Za-zÀ-ÿ]/g, '').length} lettres.`,
    ];
    const ombre = img(p, 'pombre');
    showBoard(`<div class="pcard pmyst">${ombre ? `<div class="pimgbox">${ombre}</div>` : '<div class="porb">?</div>'}<h3>Qui est ce Pokémon&nbsp;?</h3><div class="ptypes">${p.t.map(pill).join('')}</div></div>`, 'solid');
    await say('Qui est ce Pokémon ? Je te donne des indices. ' + indices[0]);
    for (let i = 1; i <= indices.length; i++) {
      const a = await ask(i === 1 ? 'À ton avis ?' : `${indices[i - 1]} Alors ?`, { prompt: `Un nom de Pokémon, par exemple ${pick(P.slice(0, 151)).nom}, ${p.nom.slice(0, 2)}…`, wait: 20000 });
      if (RE.dontknow.test(N(a))) break;
      const g = findIn(a);
      if (g && g.id === p.id) {
        fx.ok(); face.set('proud'); fx.confetti(40);
        stats().devine = (stats().devine || 0) + 1; save();
        logAct('pokedevine', p.nom, 1, 1);
        showBoard(carte(p), 'solid');
        return say(`Bravo ! C'est ${p.nom} ! ${i === 1 ? 'Du premier coup, tu es un vrai expert Pokémon !' : ''}`);
      }
      if (g) await say(`Ce n'est pas ${g.nom}…`);
      if (i === indices.length) break;
    }
    logAct('pokedevine', p.nom, 0, 1);
    showBoard(carte(p), 'solid');
    return say(`C'était ${p.nom} !`);
  }

  /* ---------- le combat ---------- */
  const PV = p => Math.round(p.s[0] * 1.6 + 60);
  function degats(att, def, type, bonus) {
    const atk = Math.max(att.s[1], att.s[3]), dfn = (def.s[2] + def.s[4]) / 2;
    const e = effOn(type, def);
    const stab = att.t.includes(type) ? 1.2 : 1;
    return { n: Math.round((14 + atk / 5) * (100 / (70 + dfn / 3)) * e * stab * (0.85 + Math.random() * 0.15) * (bonus || 1)), e };
  }
  const effTxt = e => (e === 0 ? "Ça n'a aucun effet !" : e >= 2 ? "C'est super efficace !" : e < 1 ? "Ce n'est pas très efficace…" : '');
  function arene(a, b, pa, pb) {
    const bar = (p, hp) => `<div class="pfight" style="--c:${COUL[p.t[0]]}">${img(p, 'pmini')}<b>${esc(p.nom)}</b><div class="ptypes">${p.t.map(pill).join('')}</div><div class="php"><i style="width:${Math.max(0, Math.round(100 * hp / PV(p)))}%"></i></div><small>${Math.max(0, hp)} / ${PV(p)} PV</small></div>`;
    showBoard(`<div class="parena">${bar(a, pa)}<span class="pvs">VS</span>${bar(b, pb)}</div>`, 'solid');
  }
  async function choisir(question) {
    for (let i = 0; i < 2; i++) {
      const a = await ask(question, { prompt: `Un nom de Pokémon : Pikachu, Dracaufeu, Bulbizarre, Évoli…`, wait: 20000 });
      const p = findIn(a);
      if (p) return p;
      question = "Je n'ai pas reconnu ce Pokémon. Redis-moi juste son nom ?";
    }
    const mine = Object.keys(caught()).map(Number);
    return BY[mine.length ? mine[Math.floor(Math.random() * mine.length)] : pick([1, 4, 7, 25])];
  }
  async function combat(textePremier) {
    let moi = textePremier ? findIn(textePremier) : null;
    face.set('happy');
    if (!moi) moi = await choisir("Combat Pokémon ! Quel Pokémon tu choisis ?");
    const tot = total(moi);
    const cand = pool().filter(p => p.id !== moi.id && Math.abs(total(p) - tot) <= 80 && (p.flag === 0 || moi.flag));
    const lui = cand.length ? cand[Math.floor(Math.random() * cand.length)] : sauvage();
    let pa = PV(moi), pb = PV(lui), bonus = 1, potion = true, tour = 0;
    arene(moi, lui, pa, pb);
    await say(`Tu choisis ${moi.nom} ! Moi, j'envoie… ${lui.nom}, de type ${typesTxt(lui)} ! Que le combat commence !`);
    let aMoi = moi.s[5] >= lui.s[5];
    if (!aMoi) await say(`${lui.nom} est plus rapide, il attaque en premier !`);
    while (pa > 0 && pb > 0 && tour < 14) {
      tour++;
      if (aMoi) {
        const opts = moi.t.map(i => TYPES[i]);
        const q = `Que fait ${moi.nom} ? ${opts.length > 1 ? `Attaque ${opts[0]}, attaque ${opts[1]}` : `Attaque ${opts[0]}`}${potion ? ', ou potion' : ''} ?`;
        const a = N(await ask(q, { prompt: `Attaque ${opts.join(', attaque ')}, potion.`, wait: 20000 }));
        if (potion && /\bpotion|soigne|soin\b/.test(a)) {
          potion = false; pa = Math.min(PV(moi), pa + Math.round(PV(moi) * 0.4)); arene(moi, lui, pa, pb);
          fx.ok(); await say(`${moi.nom} boit une potion et récupère des PV ! Il en a ${pa}.`);
        } else {
          let choix = moi.t.find(i => a.includes(ORTHO.bare(TYPES[i]).toLowerCase()));
          if (choix === undefined) choix = moi.t.reduce((x, y) => (effOn(y, lui) > effOn(x, lui) ? y : x)); // pas compris : sa meilleure attaque
          const avant = pb;
          const d = degats(moi, lui, choix, bonus); bonus = 1;
          pb = Math.max(0, pb - d.n); arene(moi, lui, pa, pb);
          if (d.e >= 2) fx.ok();
          await say(`${moi.nom} lance une attaque de type ${TYPES[choix]} ! ${effTxt(d.e)} ${lui.nom} perd ${d.n} PV.`.replace(/\s+/g, ' '));
          // un peu de calcul : la bonne réponse donne un coup critique
          if (pb > 0 && tour % 2 === 1 && d.n > 0) {
            const r = await ask(`Petit calcul de dresseur : ${lui.nom} avait ${avant} PV et en perd ${d.n}. Combien il lui en reste ?`, { wait: 25000 });
            if (JEUX.parseNumber(r) === pb) { bonus = 1.5; fx.ok(); face.flash('proud'); await say(`Exact, ${pb} ! Tu gagnes un coup critique pour ta prochaine attaque !`); }
            else await say(`Il lui reste ${pb} PV.`);
          }
        }
      } else {
        const choix = lui.t.reduce((x, y) => (effOn(y, moi) > effOn(x, moi) ? y : x));
        const d = degats(lui, moi, choix);
        pa = Math.max(0, pa - d.n); arene(moi, lui, pa, pb);
        if (d.e >= 2) fx.oops();
        await say(`${lui.nom} riposte avec une attaque de type ${TYPES[choix]} ! ${effTxt(d.e)} ${moi.nom} perd ${d.n} PV, il lui en reste ${pa}.`.replace(/\s+/g, ' '));
      }
      aMoi = !aMoi;
    }
    if (pb <= 0 || (pa > 0 && pa / PV(moi) >= pb / PV(lui))) {
      face.set('proud'); fx.confetti(70);
      stats().wins = (stats().wins || 0) + 1;
      if (caught()[moi.id]) { S.pokeLvl = S.pokeLvl || {}; S.pokeLvl[moi.id] = (S.pokeLvl[moi.id] || 5) + 1; }
      save(); logAct('pokecombat', `${moi.nom} contre ${lui.nom}`, 1, 1);
      await say(`${lui.nom} est K.O. ! Tu as gagné le combat avec ${moi.nom}, bravo dresseur !${caught()[moi.id] ? ` ${moi.nom} passe au niveau ${S.pokeLvl[moi.id]} !` : ''}`);
    } else {
      face.set('happy'); logAct('pokecombat', `${moi.nom} contre ${lui.nom}`, 0, 1);
      await say(`${moi.nom} est K.O.… Cette fois, c'est moi qui gagne ! Astuce : contre ${lui.nom}, les attaques ${faibleContre(lui).slice(0, 2).map(i => TYPES[i]).join(' ou ') || 'puissantes'} sont super efficaces.`);
    }
    checkBadges();
  }

  /* ---------- le quiz Pokémon ---------- */
  // une question du quiz (aussi utilisée pour les jeux à plusieurs) : { q, rep, ok(réponse), prompt }
  function question() {
    const pl = pool().filter(p => p.flag === 0);
    for (let essai = 0; essai < 20; essai++) {
      const p = pick(pl), kind = pick(['type', 'type', 'evo', 'taille', 'bat']);
      const prompt = `${TYPES.join(', ')}. Pikachu, Dracaufeu.`;
      if (kind === 'evo' && KIDS[p.id]) {
        const kids = KIDS[p.id].map(k => BY[k]);
        return { q: `En quel Pokémon évolue ${p.nom} ?`, rep: kids.map(k => k.nom).join(' ou '), prompt, ok: a => { const g = findIn(a); return !!g && KIDS[p.id].includes(g.id); } };
      }
      if (kind === 'taille') {
        const o = pick(pl.filter(x => Math.abs(x.h - p.h) >= 3));
        const big = p.h > o.h ? p : o;
        return { q: `Qui est le plus grand : ${p.nom} ou ${o.nom} ?`, rep: `${big.nom}, il mesure ${taille(big)}`, prompt, ok: a => { const g = findIn(a); return !!g && g.id === big.id; } };
      }
      if (kind === 'bat') {
        const d = pick(TYPES.map((_, i) => i));
        const win = TYPES.map((_, i) => i).filter(a => eff1(a, d) >= 2);
        if (!win.length) continue;
        return { q: `Quel type d'attaque est super efficace contre le type ${TYPES[d]} ?`, rep: win.map(x => TYPES[x]).join(', '), prompt, ok: a => win.some(x => N(a).includes(ORTHO.bare(TYPES[x]).toLowerCase())) };
      }
      if (kind === 'type') return { q: `De quel type est ${p.nom} ?`, rep: typesTxt(p), prompt, ok: a => p.t.some(x => N(a).includes(ORTHO.bare(TYPES[x]).toLowerCase())) };
    }
    return null;
  }
  async function quiz() {
    let score = 0;
    await say('Quiz Pokémon ! 5 questions. Prêt, dresseur ?');
    for (let i = 0; i < 5; i++) {
      const Q = question();
      if (!Q) continue;
      const a = await ask(`Question ${i + 1} : ${Q.q}`, { prompt: Q.prompt, wait: 20000 });
      if (Q.ok(a)) { score++; fx.ok(); face.flash('happy'); await say(pick(['Bravo !', 'Exact !', 'Super, dresseur !'])); }
      else { face.flash('oops'); await say(`La réponse : ${Q.rep}.`); }
    }
    logAct('pokequiz', '', score, 5);
    face.set('happy'); if (score >= 4) fx.confetti(40);
    await say(`Tu as ${score} bonne${score > 1 ? 's' : ''} réponse${score > 1 ? 's' : ''} sur 5 !${score === 5 ? ' Tu es un vrai Maître Pokémon !' : ''}`);
  }

  /* ---------- un Pokémon sauvage, une fois par jour (au réveil) ---------- */
  async function sauvageDuJour() {
    if (S.settings.pokeDaily === false) return false;
    const d = daily(), k = dayKey(); // daily() : le carnet du jour (activites.js)
    if (d.poke === k || new Date().getHours() < 8) return false;
    d.poke = k; save();
    dlg.expect = { until: Date.now() + 60000, run: () => activity(() => rencontre(sauvage()).then(() => hideBoard())) };
    face.flash('surprise'); VISAGE.puff('eclair', 2);
    await say('Psst… Mes capteurs détectent un Pokémon sauvage tout près ! Tu veux essayer de l\'attraper ?');
    return true;
  }

  /* ---------- à quoi il répond ---------- */
  const R = {
    combat: /\b(combat|bataille|duel|se battre|on se bat)\b.*\bpokemon|\bpokemon\b.*\b(combat|bataille|duel)\b|\bcombat pokemon\b/,
    chasse: /\b(chasse|chasser|attraper|capturer|trouver)\b.*\bpokemon|\bpokemon sauvage/,
    devine: /\b(qui est ce pokemon|devine le pokemon|devinette pokemon|devine quel pokemon|pokemon mystere)\b/,
    quiz: /\b(quiz|questions?)\b.*\bpokemon|\bpokemon\b.*\bquiz\b/,
    dex: /\b(mon pokedex|ma collection|mes pokemon|combien j ai de pokemon|combien de pokemon j ai|montre mon pokedex)\b/,
    demande: /\b(parle moi|c est quoi|qui est|montre moi|tu connais|quel type|de quel type|evolue|evolution|combien (pese|mesure)|il pese|il mesure|fort contre|faible contre|pokedex|fiche)\b/,
  };
  function route(text, n) {
    if (R.dex.test(n)) return () => monPokedex();
    if (R.combat.test(n)) return () => activity(() => combat(text));
    if (R.chasse.test(n)) return () => activity(chasse);
    if (R.devine.test(n)) return () => activity(devinette);
    if (R.quiz.test(n)) return () => activity(quiz);
    // un Pokémon nommé dans une question (ou tout seul) : la fiche du Pokédex
    const short = n.split(' ').length <= 3;
    if (R.demande.test(n) || /\bpokemon\b/.test(n) || short) {
      const p = findIn(text, { strict: !R.demande.test(n) && !/\bpokemon\b/.test(n) });
      if (p) return () => pokedex(p);
    }
    return null;
  }
  // pour le cerveau : les vrais faits sur un Pokémon cité (il n'invente pas)
  function factFor(text) {
    const p = findIn(text, { strict: true });
    return p ? `\n\nTon Pokédex (vrais faits) : ${decrire(p)}` : '';
  }

  BADGES.push(
    { id: 'dresseur', nom: 'Dresseur débutant', ico: '⭐', test: () => nCaught() >= 5 },
    { id: 'maitrepoke', nom: 'Maître Pokémon', ico: '🏆', test: () => nCaught() >= 50 },
    { id: 'arene', nom: "Champion d'arène", ico: '🥇', test: () => (stats().wins || 0) >= 5 },
  );

  return { route, factFor, pokedex, combat, chasse, devinette, quiz, question, monPokedex, sauvageDuJour, findIn, P, BY, decrire };
})();
