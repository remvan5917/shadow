/* =========================================================
   SHADOW — ce qu'il fait avec son écran-visage
   - l'encyclopédie : il cherche dans Vikidia (l'encyclopédie des enfants)
     au lieu d'inventer, et montre une image (« montre-moi un guépard ») ;
   - la météo (la ville est réglée par papa) ;
   - un minuteur dans le coin de l'écran, le brossage des dents (2 minutes) ;
   - respirer ensemble pour se calmer ;
   - le robot mystère (deviner un mot lettre par lettre) ;
   - le jeu des couleurs (mémoire).
   Tout se fait à la voix. Utilise les outils de app.js et activites.js.
   ========================================================= */
'use strict';

const ECRAN = (() => {
  const net = () => navigator.onLine !== false;
  const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('Trop long')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
  const getJSON = url => timeout(fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }), 7000);

  /* ---------- on peut l'arrêter en touchant l'écran (brossage, respiration) ---------- */
  let cancel = null, cancelled = false;
  const pause = ms => new Promise(res => { const t = setTimeout(res, ms); cancel = () => { clearTimeout(t); res(); }; });
  function tapCancel() {
    if (!cancel) return false;
    cancelled = true; const c = cancel; cancel = null; c(); voice.stop();
    return true;
  }
  const stopped = () => cancelled;

  /* =================== L'ENCYCLOPÉDIE =================== */
  const cache = {};
  const ARTICLE = /^(un |une |des |le |la |les |l |du |de la |de l |d |de |sur |ce qu est |ce que c est )+/;
  const PERSO = /\b(tu|toi|ton|ta|tes|moi|mon|ma|mes|papa|maman|ca|cela|ici|la reponse|le mot du jour|l heure|la date|la meteo)\b/;
  // « c'est quoi un volcan ? » → « volcan » (seulement les questions claires ; le reste, c'est le cerveau qui choisit)
  function subjectOf(n) {
    const m = n.match(/^(?:dis moi |shadow )?(?:c est quoi|qu est ce que c est|qu est ce qu|c est qui|qui est|qui etait|qui c est|explique moi|parle moi|dis moi des choses sur|raconte moi des choses sur|je veux savoir ce qu est) (un |une |des |le |la |les |l |du |de la |de l |d |de |sur )(.+)$/)
      || n.match(/\b(?:montre moi|fais moi voir|je veux voir|tu peux me montrer|a quoi ressemblent?|tu sais a quoi ressemblent?) (un |une |des |le |la |les |l |du |de la |d |de )?(.+)$/);
    const qui = !m && n.match(/^(?:dis moi |shadow )?(?:c est qui|qui est|qui etait|qui c est|tu connais) ([a-z][a-z ]{2,30})$/);
    if (qui && !/\b(plus|moins|meilleur|meilleure|premier|premiere|dernier|la|la bas|ici|dehors|dedans)$/.test(qui[1]) && !PERSO.test(qui[1])) {
      const who = qui[1].replace(/\b(s il te plait|stp|shadow)\b/g, '').trim();
      return who.split(' ').length <= 3 ? who : '';
    }
    if (!m) return '';
    const s = m[m.length - 1].replace(/\b(s il te plait|stp|steuplait|shadow)\b/g, '').replace(ARTICLE, '').trim();
    if (!s || PERSO.test(s) || s.split(' ').length > 4) return '';
    return s;
  }
  async function lookup(subject) {
    const key = subject.toLowerCase();
    if (cache[key]) return cache[key];
    const V = 'https://fr.vikidia.org/w/api.php?format=json&origin=*&';
    let res = null;
    try {
      const s = await getJSON(`${V}action=query&list=search&srlimit=1&srsearch=${encodeURIComponent(subject)}`);
      const title = s.query && s.query.search[0] && s.query.search[0].title;
      if (title) {
        const p = await getJSON(`${V}action=query&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=5&piprop=thumbnail&pithumbsize=600&redirects=1&titles=${encodeURIComponent(title)}`);
        const page = p.query && Object.values(p.query.pages)[0];
        if (page && page.extract && page.extract.length > 40) res = { title: page.title, text: page.extract, img: page.thumbnail ? page.thumbnail.source : '', src: 'Vikidia' };
        // pas d'image dans Vikidia : celle de l'article Wikipédia du même nom (le sujet est déjà un sujet d'enfant)
        if (res && !res.img) {
          try {
            const w = await getJSON(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(res.title.replace(/ /g, '_'))}`);
            if (w.thumbnail && w.type !== 'disambiguation') { res.img = w.thumbnail.source; res.imgSrc = 'Wikipédia'; }
          } catch (e) { /* tant pis, pas d'image */ }
        }
      }
    } catch (e) { /* on essaie Wikipédia */ }
    if (!res) {
      try {
        const s = await getJSON(`https://fr.wikipedia.org/w/api.php?format=json&origin=*&action=query&list=search&srlimit=1&srsearch=${encodeURIComponent(subject)}`);
        const title = s.query && s.query.search[0] && s.query.search[0].title;
        if (title) {
          const p = await getJSON(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
          // Wikipédia est écrit pour les grands : on prend le texte, pas les images
          if (p.extract && p.type !== 'disambiguation') res = { title: p.title, text: p.extract, img: '', src: 'Wikipédia' };
        }
      } catch (e) { /* rien trouvé */ }
    }
    if (res && (ETHIQUE.BAD.test(ORTHO.bare(res.text)) || ETHIQUE.BAD.test(ORTHO.bare(res.title)))) res = { bad: true };
    if (res) cache[key] = res;
    return res;
  }
  const sentences = t => String(t).replace(/\s*\([^)]*\)/g, '').match(/[^.!?]+[.!?]+/g) || [String(t)];

  // question = ce que l'enfant a dit ; fromChat = la question est déjà dans la conversation
  async function savoir(subject, question, fromChat) {
    if (ETHIQUE.BAD.test(ORTHO.bare(subject))) return say("Hum, ça, c'est un sujet pour en parler avec papa.");
    if (!net()) { face.flash('oops'); return say("Pour chercher dans mon encyclopédie, il me faut du réseau. On regardera tout à l'heure !"); }
    face.set('think');
    VISAGE.puff('question', 2);
    const waitLine = say(pick(['Je regarde dans mon encyclopédie…', 'Je cherche dans mes livres de robot…', 'Une seconde, je consulte ma bibliothèque…']));
    const r = await lookup(subject);
    await waitLine;
    if (!r) { face.set('confused'); return say(`Je n'ai rien trouvé sur « ${subject} » dans mon encyclopédie. Tu peux le dire autrement ?`); }
    if (r.bad) return say("Hum, ça, c'est un sujet pour en parler avec papa.");
    const wantsPic = /\b(montre|voir|ressemble)/.test(N(question));
    if (r.img) {
      showBoard(`<div class="savoir"><img src="${esc(r.img)}" alt="" referrerpolicy="no-referrer"><h3>${esc(r.title)}</h3><small>Image : ${esc(r.imgSrc || r.src)}</small></div>`);
      const shown = $('#board').innerHTML;
      setTimeout(() => { if ($('#board').innerHTML === shown) hideBoard(); }, 25000);
      const img = $('#board img');
      if (img) img.onerror = () => { if ($('#board').innerHTML === shown) hideBoard(); };
    } else if (wantsPic) await say("Je n'ai pas d'image de ça, mais je peux te le raconter.");
    face.set('idle');
    let answer = '';
    if (AI.ready()) {
      const sys = `${CERVEAU.persona()}\n\nVoici ce que dit ton encyclopédie (${r.src}) sur « ${r.title} » :\n${r.text}\n\nRéponds à ${name()} en 2 ou 3 phrases très simples pour un enfant de CE1, en utilisant SEULEMENT ces informations (tu peux simplifier les mots difficiles). Si elles ne répondent pas à sa question, dis gentiment que ton encyclopédie ne le dit pas. ${r.img ? "Une image s'affiche sur ton écran : tu peux dire « regarde ! »." : ''} Pas de commande entre crochets.`;
      let queue = Promise.resolve(), spokeAny = false;
      try {
        answer = await AI.chatStream([{ role: 'system', content: sys }, { role: 'user', content: PRIVE.mask(question).text }], { maxTokens: 180, temperature: 0.4 }, s => {
          const clean = String(s).replace(/\[\[[^\]]*\]\]/g, '').trim();
          if (clean && ETHIQUE.safe(clean) === clean) { spokeAny = true; queue = queue.then(() => say(clean)); }
        });
        await queue;
        answer = String(answer || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
      } catch (e) { await queue; answer = spokeAny ? '…' : ''; }
    }
    if (!answer) { answer = sentences(r.text).slice(0, 2).join(' ').trim(); await say((r.img ? 'Regarde ! ' : '') + answer); }
    if (!fromChat) S.chat.push({ role: 'user', content: PRIVE.mask(question).text });
    S.chat.push({ role: 'assistant', content: answer });
    logAct('savoir', r.title);
  }

  /* =================== LA MÉTÉO =================== */
  const WMO = c => c === 0 ? ['☀️', 'le ciel est tout bleu'] : c <= 2 ? ['🌤️', 'il y a quelques nuages'] : c === 3 ? ['☁️', "c'est nuageux"]
    : c <= 48 ? ['🌫️', 'il y a du brouillard'] : c <= 57 ? ['🌦️', 'il bruine'] : c <= 67 ? ['🌧️', 'il pleut'] : c <= 77 ? ['❄️', 'il neige']
      : c <= 82 ? ['🌦️', 'il y a des averses'] : c <= 86 ? ['🌨️', 'il y a des averses de neige'] : ['⛈️', "il y a de l'orage"];
  let meteoCache = null;
  async function meteoData() {
    const v = S.settings.ville;
    if (!v) return null;
    if (meteoCache && Date.now() - meteoCache.at < 20 * 60000 && meteoCache.ville === v.name) return meteoCache;
    const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&timezone=auto&forecast_days=2`);
    meteoCache = { at: Date.now(), ville: v.name, w };
    return meteoCache;
  }
  function conseil(min, max, pluie, code) {
    let c = max < 6 ? 'Mets ton manteau, ton bonnet et tes gants !' : max < 13 ? 'Prends bien ton manteau !' : max < 19 ? 'Un pull ou une veste, ce sera parfait.' : 'Il fera bon : un tee-shirt suffit !';
    if (code >= 71 && code <= 77 || code === 85 || code === 86) c += ' Et il neige : bonhomme de neige en vue !';
    else if (pluie >= 50 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) c += " N'oublie pas le parapluie ou les bottes !";
    return c;
  }
  async function meteo(text) {
    if (!S.settings.ville) return say("Je ne sais pas encore où on habite pour la météo. Papa peut l'écrire dans mes réglages, et je te dirai le temps qu'il fait !");
    if (!net()) { face.flash('oops'); return say("Sans réseau, je ne peux pas regarder le ciel de mes satellites. Regarde par la fenêtre !"); }
    face.set('think');
    let d;
    try { d = await meteoData(); } catch (e) { face.set('confused'); return say("Mes satellites météo ne répondent pas. Réessaie dans un moment !"); }
    face.set('idle');
    const w = d.w, demain = /\bdemain\b/.test(N(text || ''));
    const k = demain ? 1 : 0;
    const min = Math.round(w.daily.temperature_2m_min[k]), max = Math.round(w.daily.temperature_2m_max[k]);
    const pluie = w.daily.precipitation_probability_max[k] || 0, code = w.daily.weather_code[k];
    const [ico, desc] = WMO(demain ? code : w.current.weather_code);
    const now = Math.round(w.current.temperature_2m);
    const night = !w.current.is_day && !demain;
    showBoard(`<div class="meteo"><span class="big">${night && ico === '☀️' ? '🌙' : ico}</span><div><div class="deg">${demain ? `${min}° / ${max}°` : `${now}°`}</div>
      <p>${demain ? 'Demain' : "Aujourd'hui"} : ${min}° à ${max}°</p><p>💧 pluie : ${pluie} %</p><p class="small">${esc(d.ville)}</p></div></div>`);
    const shown = $('#board').innerHTML;
    setTimeout(() => { if ($('#board').innerHTML === shown) hideBoard(); }, 20000);
    const wet = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
    const rainy = wet(code) || (!demain && wet(w.current.weather_code));
    // s'il pleut déjà (ou s'il va bruiner), on ne dit pas « sans pluie »
    const pl = rainy ? (pluie >= 60 ? 'et ça va mouiller' : 'avec un peu de pluie') : pluie >= 60 ? 'avec de la pluie' : pluie >= 30 ? 'peut-être un peu de pluie' : 'sans pluie';
    const desc2 = night && desc === 'le ciel est tout bleu' ? 'le ciel est dégagé' : desc;
    if (demain) await say(`Demain, ${desc2}, entre ${min} et ${max} degrés, ${pl}. ${conseil(min, max, pluie, code)}`);
    else await say(`Dehors, il fait ${now} degré${Math.abs(now) > 1 ? 's' : ''} et ${desc2}. Aujourd'hui, entre ${min} et ${max} degrés, ${pl}. ${conseil(min, max, pluie, code)}`);
  }
  // pour le cerveau : la vraie météo, s'il l'a déjà regardée (sinon il ne l'invente pas)
  function meteoFact() {
    if (!meteoCache || Date.now() - meteoCache.at > 3 * 3600000) return '';
    const w = meteoCache.w;
    return ` Météo d'aujourd'hui à ${meteoCache.ville} : ${Math.round(w.current.temperature_2m)} degrés, ${WMO(w.current.weather_code)[1]}, entre ${Math.round(w.daily.temperature_2m_min[0])} et ${Math.round(w.daily.temperature_2m_max[0])} degrés.`;
  }
  async function findCity(nameTxt) {
    const s = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=${encodeURIComponent(nameTxt)}`);
    const g = s.results && s.results[0];
    if (!g) return null;
    // la ville seulement, arrondie : pas besoin de l'adresse exacte
    return { name: g.name, lat: Math.round(g.latitude * 100) / 100, lon: Math.round(g.longitude * 100) / 100, pays: g.country || '' };
  }

  /* =================== LE MINUTEUR =================== */
  let tm = null;
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function durationOf(n) {
    const m = n.match(/(\d+|[a-z]+(?: [a-z]+)?) (minutes?|min|secondes?|sec|heures?)\b/);
    let s = 0;
    if (m) {
      let k = JEUX.parseNumber(m[1]);
      if (k === null && /\b(une?|la)$/.test(m[1])) k = 1;
      if (k === null && /\bdemi$/.test(m[1])) k = 0.5;
      if (k !== null) s = k * (/^h/.test(m[2]) ? 3600 : /^s/.test(m[2]) ? 1 : 60);
      if (/\bet demie?\b/.test(n.slice(m.index))) s += /^h/.test(m[2]) ? 1800 : /^m/.test(m[2]) ? 30 : 0;
    }
    return Math.round(s);
  }
  function drawTimer() {
    const el = $('#timer');
    if (!tm) { el.hidden = true; el.innerHTML = ''; return; }
    const left = Math.max(0, Math.ceil((tm.end - Date.now()) / 1000));
    const C = 2 * Math.PI * 40;
    if (!el.firstChild) el.innerHTML = `<svg viewBox="0 0 100 100"><circle class="t-bg" cx="50" cy="50" r="40"/><circle class="t-arc" cx="50" cy="50" r="40" stroke-dasharray="${C}"/></svg><b></b><small></small>`;
    el.hidden = false;
    el.querySelector('.t-arc').style.strokeDashoffset = String(C * (1 - left / tm.total));
    el.querySelector('b').textContent = fmt(left);
    el.querySelector('small').textContent = tm.label;
    el.classList.toggle('low', left <= 10);
  }
  function startTimer(sec, label, silent) {
    stopTimer();
    tm = { end: Date.now() + sec * 1000, total: sec, label: label || 'minuteur', silent: !!silent };
    S.timer = { end: tm.end, total: sec, label: tm.label }; save();
    tm.iv = setInterval(() => {
      drawTimer();
      if (Date.now() >= tm.end) ring();
    }, 1000);
    drawTimer();
  }
  function stopTimer() { if (tm) clearInterval(tm.iv); tm = null; S.timer = null; save(); drawTimer(); }
  function ring() {
    const label = tm.label, silent = tm.silent;
    stopTimer();
    if (silent) return; // le brossage annonce lui-même la fin
    fx.tone([[1319, 0.12], [1047, 0.12], [1319, 0.12], [1047, 0.12], [1568, 0.3]]);
    face.flash('surprise', 2500);
    VISAGE.puff('eclair', 3);
    if (dlg.state === 'sleep') wake();
    dlg.state = dlg.state === 'activity' ? 'activity' : 'talk'; dlg.silence = 0;
    say(`Dring dring ! ${label === 'minuteur' ? 'Le minuteur est fini' : `Le minuteur « ${label} » est fini`} !`);
  }
  async function minuteur(text) {
    const n = N(text);
    let sec = durationOf(n);
    if (!sec) {
      const a = await ask('Un minuteur de combien de minutes ?');
      sec = durationOf(N(a)) || (JEUX.parseNumber(a) || 0) * 60;
    }
    if (!sec) return say("Je n'ai pas compris la durée. Dis par exemple : « minuteur de 5 minutes ».");
    if (sec > 3 * 3600) return say('Mon minuteur va jusqu’à trois heures, pas plus !');
    // « … pour les pâtes » : on garde les vrais mots (avec les accents) pour l'afficher
    const lab = (String(text).toLowerCase().replace(/[?!.]+$/, '').match(/\bpour (?:le |la |les |l'|mon |ma |mes )?([a-zàâçéèêëîïôûùœ' ]{3,20})$/) || [])[1];
    startTimer(sec, lab ? lab.trim() : 'minuteur');
    const mins = Math.floor(sec / 60), secs = sec % 60;
    const txt = [mins && `${mins} minute${mins > 1 ? 's' : ''}`, secs && `${secs} seconde${secs > 1 ? 's' : ''}`].filter(Boolean).join(' et ');
    face.flash('happy');
    return say(`C'est parti : ${txt} ! Je te préviens quand c'est fini. Le compte à rebours est dans le coin de mon écran.`);
  }

  /* =================== LE BROSSAGE DES DENTS (2 minutes) =================== */
  const ZONES = [['en haut à droite', '↗️'], ['en haut à gauche', '↖️'], ['en bas à gauche', '↙️'], ['en bas à droite', '↘️']];
  const ENCOUR = ['Petits ronds, petits ronds !', 'Frotte frotte, bip bop !', 'Pense aussi au dos des dents !', 'Tu brosses comme un champion !', 'Encore un peu !', 'Tes dents vont briller comme mes LEDs !'];
  async function brossageFlow() {
    cancelled = false;
    face.set('happy');
    await say("C'est l'heure du brossage ! Deux minutes, et je te dis où brosser. Si tu dois t'arrêter, touche mon écran. On commence…");
    startTimer(120, 'brossage', true);
    for (let z = 0; z < 4 && !stopped(); z++) {
      showBoard(`<div class="pfc">🪥<small>${ZONES[z][1]} ${ZONES[z][0]}</small></div>`);
      await say(z ? `Maintenant, ${ZONES[z][0]} !` : `${ZONES[z][0][0].toUpperCase()}${ZONES[z][0].slice(1)} !`);
      await pause(13500);
      if (stopped()) break;
      await say(pick(ENCOUR));
      await pause(13500);
    }
    cancel = null;
    hideBoard();
    if (stopped()) { stopTimer(); face.set('idle'); return say("D'accord, on arrête le brossage."); }
    stopTimer();
    face.set('proud'); fx.ok(); fx.confetti(50);
    logAct('dents', '', 1, 1);
    await say('Et voilà, deux minutes ! Tes dents sont toutes propres, elles brillent comme mes LEDs ! Rince bien ta bouche.');
  }

  /* =================== RESPIRER ENSEMBLE =================== */
  async function respirationFlow() {
    cancelled = false;
    face.set('calm');
    face.el.style.setProperty('--breath', '9s');
    await say("On respire ensemble, comme des robots zen. Regarde la bulle : elle grandit quand tu inspires, elle rapetisse quand tu souffles.");
    showBoard('<div class="souffle"><i></i></div><p></p>');
    const box = $('#board .souffle'), lab = $('#board .souffle + p');
    for (let i = 0; i < 4 && !stopped(); i++) {
      box.style.setProperty('--t', '4s'); box.classList.add('in'); lab.textContent = 'Inspire…';
      await Promise.all([say(i ? 'Inspire…' : 'Inspire par le nez…'), pause(4000)]);
      if (stopped()) break;
      box.style.setProperty('--t', '5s'); box.classList.remove('in'); lab.textContent = 'Souffle…';
      await Promise.all([say(i ? 'Souffle…' : 'Souffle tout doucement par la bouche…'), pause(5000)]);
    }
    cancel = null;
    hideBoard();
    face.el.style.removeProperty('--breath');
    if (stopped()) { face.set('idle'); return say("D'accord, on arrête. Tu peux recommencer quand tu veux."); }
    face.set('happy');
    logAct('zen', '', 1, 1);
    await say("Bravo. Tu sens ? Ton corps est plus calme. Si quelque chose t'embête, tu peux aussi en parler à papa.");
  }

  /* =================== LE ROBOT MYSTÈRE (deviner le mot) =================== */
  // à chaque lettre qui n'est pas dans le mot, Shadow dessine un morceau de son cousin robot
  const PIECES = [
    '<rect class="p" x="70" y="30" width="60" height="46" rx="6"/>', // tête
    '<rect class="p" x="80" y="42" width="12" height="12"/><rect class="p" x="108" y="42" width="12" height="12"/>', // yeux
    '<path class="p" d="M86 64 H114"/>', // bouche
    '<path class="p" d="M88 30 L94 18 L100 30 L106 18 L112 30"/>', // crête
    '<rect class="p" x="62" y="84" width="76" height="62" rx="8"/>', // corps
    '<path class="p" d="M62 96 L36 120 M138 96 L164 120"/>', // bras
    '<circle class="p" cx="80" cy="162" r="12"/><circle class="p" cx="120" cy="162" r="12"/>', // roues
  ];
  const fold = c => ORTHO.bare(c);
  function mysteryBoard(word, found, misses, bad) {
    const shown = [...word].map(c => (found.has(fold(c)) || !/[a-zœ]/i.test(fold(c)) ? c.toUpperCase() : '_')).join('');
    showBoard(`<div class="mystere"><svg viewBox="0 0 200 180">${PIECES.map((p, i) => (i < misses ? p.replace(/class="p"/g, 'class="p on"') : p)).join('')}</svg>
      <div class="mot">${esc(shown)}</div><div class="rate">${esc(bad.map(c => c.toUpperCase()).join(' '))}</div></div>`);
    return !shown.includes('_');
  }
  async function mystereFlow() {
    const used = S.mystSeen || (S.mystSeen = []);
    const good = w => w.length >= 4 && w.length <= 8 && !/[\s'-]/.test(w);
    let pool = CONTENUS.MOTS_CE1.filter(x => good(x.t) && !used.includes(x.t));
    if (!pool.length) { S.mystSeen = []; pool = CONTENUS.MOTS_CE1.filter(x => good(x.t)); }
    const choice = pick(pool), word = choice.t, phrase = choice.phrase;
    S.mystSeen.push(word); if (S.mystSeen.length > 40) S.mystSeen.shift();
    const found = new Set(), bad = [];
    let misses = 0, hinted = false;
    mysteryBoard(word, found, misses, bad);
    let line = `Le robot mystère ! J'ai caché un mot de ${word.length} lettres. Dis-moi une lettre ! Si elle n'est pas dans le mot, je dessine un morceau de mon cousin robot. Trouve le mot avant qu'il soit fini !`;
    for (;;) {
      const a = await ask(line, { prompt: "Une lettre de l'alphabet : A, B, C, E, I, M, O, S, T.", retry: 2 });
      const n = N(a);
      if (RE.dontknow.test(n)) { found.clear(); [...word].forEach(c => found.add(fold(c))); mysteryBoard(word, found, misses, bad); face.set('idle'); await say(`C'était « ${word} » ! ${phrase}`); break; }
      // il propose le mot entier
      if (ORTHO.bare(n).replace(/[^a-z]/g, '').includes(ORTHO.bare(word).replace(/[^a-z]/g, '')) && n.length > 2) {
        [...word].forEach(c => found.add(fold(c)));
        mysteryBoard(word, found, misses, bad);
        face.set('proud'); fx.ok(); fx.confetti(60);
        logAct('mystere', word, 1, 1);
        await say(`Bravo ! C'était bien « ${word} » ! ${phrase}`);
        break;
      }
      const letters = (ORTHO.parseSpelling(String(a).replace(/\b(euh+|heu+|hum+|ben|bah|alors|je dis|je pense|c est)\b/gi, ' ')) || []).map(fold).filter(c => /^[a-z]$/.test(c));
      if (!letters.length) { line = 'Dis-moi juste une lettre, par exemple « A » ou « S ».'; continue; }
      const c = letters[0];
      if (found.has(c) || bad.includes(c)) { line = `Tu as déjà dit ${LETTER_NAMES[c] || c}. Une autre lettre ?`; continue; }
      const nb = [...word].filter(x => fold(x) === c).length;
      if (nb) {
        found.add(c); fx.ok(); face.flash('happy');
        if (mysteryBoard(word, found, misses, bad)) {
          face.set('proud'); fx.confetti(60);
          logAct('mystere', word, 1, 1);
          await say(`Oui, il y a ${LETTER_NAMES[c] || c} ! Et tu as trouvé tout le mot : « ${word} » ! ${phrase}`);
          break;
        }
        line = `Oui ! Il y a ${nb > 1 ? `${nb} fois ` : ''}${LETTER_NAMES[c] || c} ! Une autre lettre ?`;
      } else {
        bad.push(c); misses++; fx.oops(); face.flash('oops');
        mysteryBoard(word, found, misses, bad);
        if (misses >= PIECES.length) {
          [...word].forEach(x => found.add(fold(x)));
          mysteryBoard(word, found, misses, bad);
          logAct('mystere', word, 0, 1);
          await say(`Pas de ${LETTER_NAMES[c] || c}… Mon cousin robot est fini ! Le mot était « ${word} ». ${phrase} Tu feras mieux la prochaine fois !`);
          break;
        }
        line = `Pas de ${LETTER_NAMES[c] || c} ! ${misses >= 4 && !hinted ? `Un indice : c'est dans la phrase « ${phrase.replace(new RegExp(word, 'i'), 'bip')} ». ` : ''}Une autre lettre ?`;
        if (misses >= 4) hinted = true;
      }
    }
    await wait(1500);
    if (await askYesNo('On joue avec un autre mot ?')) return mystereFlow();
    hideBoard();
  }

  /* =================== LE JEU DES COULEURS (mémoire) =================== */
  const COUL = [['rouge', '#ff5a5a', 330], ['vert', '#3ddc84', 392], ['bleu', '#4c8dff', 494], ['jaune', '#ffd84d', 587]];
  const COUL_RE = { rouge: 0, vert: 1, verte: 1, verre: 1, vers: 1, bleu: 2, bleue: 2, bleus: 2, jaune: 3, jaunes: 3 };
  async function simonFlow() {
    showBoard(`<div class="simon">${COUL.map(c => `<i style="background:${c[1]};color:${c[1]}"></i>`).join('')}</div><p>Regarde bien, puis dis les couleurs dans l'ordre</p>`);
    const tiles = [...$$('#board .simon i')];
    await say("Le jeu des couleurs ! Je vais allumer des couleurs. Regarde bien, puis dis-les dans le même ordre. Prêt ?");
    const seq = [Math.floor(Math.random() * 4), Math.floor(Math.random() * 4)];
    let best = 0;
    for (;;) {
      await wait(600);
      for (const k of seq) {
        tiles[k].classList.add('on'); fx.tone([[COUL[k][2], 0.35]]);
        if (seq.length <= 3) await say(COUL[k][0]); else await wait(520);
        await wait(seq.length <= 3 ? 120 : 220);
        tiles[k].classList.remove('on');
        await wait(200);
      }
      const a = await ask("À toi ! Dis les couleurs dans l'ordre.", { prompt: 'Rouge, vert, bleu, jaune.', retry: 1 });
      const said = N(a).split(' ').map(w => COUL_RE[w]).filter(x => x !== undefined);
      const ok = said.length >= seq.length && seq.every((k, i) => said[i] === k);
      if (!ok) {
        fx.oops(); face.flash('oops');
        await say(`Oh non ! C'était : ${seq.map(k => COUL[k][0]).join(', ')}. ${best ? `Tu as retenu ${best} couleurs d'affilée, bravo !` : 'Tu feras mieux la prochaine fois !'}`);
        break;
      }
      best = seq.length;
      fx.ok(); face.flash('happy');
      if (seq.length >= 12) { fx.confetti(80); await say('Douze couleurs ! Tu as une mémoire de super-robot !'); break; }
      await say(pick(['Bravo ! Une de plus…', 'Parfait ! On ajoute une couleur…', 'Super mémoire ! Encore une…']));
      seq.push(Math.floor(Math.random() * 4));
    }
    const record = best > (S.stats.simon || 0) && best > 2;
    S.stats.simon = Math.max(S.stats.simon || 0, best);
    logAct('simon', '', best, 12);
    hideBoard();
    if (record) { face.set('proud'); await say(`C'est ton nouveau record : ${best} couleurs !`); }
  }

  /* =================== À QUOI IL RÉPOND =================== */
  const R = {
    timerStop: /\b(arrete|stop|annule|eteins|coupe|enleve)\b.*\b(minuteur|chrono|compte a rebours|sablier)\b/,
    timerLeft: /\b(combien de temps (il )?reste|il reste combien|reste combien de temps|ca fait combien de temps)\b/,
    timer: /\b(minuteur|chrono|chronometre|compte a rebours|sablier|previens moi dans|reveille moi dans|dis moi quand (ca fait|il y a))\b/,
    brossage: /\b(brosse les dents|brosser les dents|brossage|me brosser|je me brosse|laver les dents|lave les dents)\b/,
    respiration: /\b(respire|respirer|respiration|respirons|me calmer|se calmer|calme moi|relaxation|relaxer|me detendre|zen|meditation)\b/,
    upset: /\b(je suis (tres )?(en colere|enerve|enervee|furieux|furieuse|fache|fachee|stresse|stressee))\b|\bca m enerve\b/,
    meteo: /\b(meteo|quel temps|il fait (beau|froid|chaud|quel temps)|il va pleuvoir|il pleut dehors|va t il pleuvoir|il va neiger|il fait combien dehors|combien de degres|temperature dehors|je mets (un|mon) manteau|faut il (un|mon) manteau)\b/,
    mystere: /\b(robot mystere|mot mystere|le pendu|jeu du pendu|devine le mot|deviner un mot)\b/,
    simon: /\b(jeu des couleurs|jeu de memoire|memoire des couleurs|simon)\b/,
  };
  // avant « stop » (sinon « arrête le minuteur » arrêterait toute la conversation)
  function routeEarly(n) {
    // « Shadow, mode vidéo » : il ne dit plus aucun prénom (pour filmer) ; « fin du mode vidéo » pour revenir
    if (/\bmode (video|film|tournage)\b/.test(n)) {
      const off = /\b(fin|arrete|arreter|stop|quitte|quitter|desactive|desactiver|enleve|termine|sors)\b/.test(n);
      return () => {
        S.settings.video = !off; save();
        const box = $('#s-video'); if (box) box.checked = !off;
        face.set(off ? 'happy' : 'proud');
        return say(off ? "Fin du mode vidéo. Je redis les prénoms !" : 'Mode vidéo activé ! Je ne dis plus aucun prénom. Pour revenir, dis « fin du mode vidéo ».');
      };
    }
    if (R.timerStop.test(n)) return () => { const had = !!tm; stopTimer(); return say(had ? 'Minuteur arrêté !' : "Il n'y a pas de minuteur en route."); };
    if (R.timerLeft.test(n) && tm) return () => { const s = Math.ceil((tm.end - Date.now()) / 1000); return say(`Il reste ${s >= 60 ? `${Math.floor(s / 60)} minute${s >= 120 ? 's' : ''}${s % 60 ? ` et ${s % 60} secondes` : ''}` : `${s} secondes`}.`); };
    return null;
  }
  function route(text, n) {
    if (R.brossage.test(n)) return () => activity(brossageFlow);
    if (R.timer.test(n) || (/\bdans \S+ (minutes?|secondes?)\b/.test(n) && /\b(previens|dis moi|appelle|reveille)\b/.test(n))) return () => minuteur(text);
    if (R.respiration.test(n)) return () => activity(respirationFlow);
    if (R.upset.test(n)) return () => {
      face.set('sad');
      dlg.expect = { until: Date.now() + 60000, run: () => activity(respirationFlow) };
      return say("Oh, je comprends. Ça arrive à tout le monde, même aux robots. Tu veux qu'on respire ensemble pour se calmer ?");
    };
    if (R.meteo.test(n)) return () => meteo(text);
    if (R.mystere.test(n)) return () => activity(mystereFlow);
    if (R.simon.test(n)) return () => activity(simonFlow);
    const sub = subjectOf(n);
    if (sub) return () => savoir(sub, text);
    return null;
  }
  // idées pour quand il propose un jeu
  const ideas = () => [['jouer au robot mystère', mystereFlow], ['jouer au jeu des couleurs', simonFlow]];

  /* ---------- les réglages de papa : la ville pour la météo ---------- */
  function renderVille() {
    const st = $('#s-ville-state');
    if (st) st.textContent = S.settings.ville ? `Ville : ${S.settings.ville.name}${S.settings.ville.pays ? ` (${S.settings.ville.pays})` : ''}` : 'Pas de ville : Shadow ne donne pas la météo.';
  }
  function bindSettings() {
    const vx = $('#s-voix'), info = () => { const el = $('#s-voix-info'); if (el) el.textContent = voice.v ? `Voix utilisée : ${voice.v.name}${robotVoice() ? (voice.male ? ' (voix d\'homme, rendue plus grave)' : ' (rendue beaucoup plus grave)') : ''}` : "Aucune voix française trouvée sur l'appareil."; };
    if (vx) {
      vx.value = S.settings.voix || 'robot';
      vx.addEventListener('change', () => { S.settings.voix = vx.value; save(); voice.choose && voice.choose(); info(); });
      $('#s-voix-test').addEventListener('click', () => { voice.unlock(); voice.choose && voice.choose(); info(); voice.say('Bip. Bonjour, je suis Shadow. Mes circuits sont prêts.'); });
      setTimeout(info, 1600);
    }
    const prop = $('#s-propose');
    if (prop) { prop.checked = !!S.settings.propose; prop.addEventListener('change', () => { S.settings.propose = prop.checked; save(); }); }
    const vid = $('#s-video');
    if (vid) { vid.checked = !!S.settings.video; vid.addEventListener('change', () => { S.settings.video = vid.checked; save(); }); }
    const btn = $('#s-ville-ok'), inp = $('#s-ville');
    if (!btn) return;
    renderVille();
    btn.addEventListener('click', async () => {
      const v = inp.value.trim();
      if (!v) { S.settings.ville = null; save(); meteoCache = null; return renderVille(); }
      $('#s-ville-state').textContent = 'Je cherche…';
      try {
        const g = await findCity(v);
        if (!g) { $('#s-ville-state').textContent = 'Ville introuvable. Essaie avec le nom exact.'; return; }
        S.settings.ville = g; save(); meteoCache = null; inp.value = '';
        renderVille();
      } catch (e) { $('#s-ville-state').textContent = 'Pas de réseau : réessaie plus tard.'; }
    });
    $('#s-ville-del').addEventListener('click', () => { S.settings.ville = null; save(); meteoCache = null; renderVille(); });
  }

  /* ---------- les nouvelles médailles ---------- */
  BADGES.push(
    { id: 'curieux', nom: 'Curieux de tout', ico: '📚', test: () => logs('savoir').length >= 10 },
    { id: 'memoire', nom: "Mémoire d'éléphant", ico: '🐘', test: () => (S.stats.simon || 0) >= 6 },
    { id: 'decodeur', nom: 'Décodeur de mots', ico: '🕵️', test: () => logs('mystere').filter(x => x.s === 1).length >= 3 },
    { id: 'zen', nom: 'Robot zen', ico: '🧘', test: () => logs('zen').length >= 1 },
    { id: 'dents', nom: 'Dents de star', ico: '🦷', test: () => logs('dents').length >= 5 },
  );

  // un minuteur en route avant de fermer Shadow continue au retour
  setTimeout(() => {
    bindSettings();
    if (S.timer && S.timer.end > Date.now() + 1500) {
      const t = S.timer;
      startTimer(Math.round((t.end - Date.now()) / 1000), t.label);
      tm.total = t.total; S.timer.total = t.total; save();
    } else if (S.timer) { S.timer = null; save(); }
  }, 0);

  /* =================== LE MODE DÉMO (pour filmer une vidéo) =================== */
  // icônes au trait, dans le style du visage de Shadow (pas d'émojis)
  const ICON = {
    bulb: '<path d="M18 31c-3.2-2.6-5-6.4-5-10.5a11 11 0 0 1 22 0c0 4.1-1.8 7.9-5 10.5v3.5H18z"/><path d="M19.5 39.5h9M21.5 44h5"/>',
    volet: '<rect x="10" y="7" width="28" height="34" rx="2"/><path d="M10 14h28M10 20.5h28M10 27h28M10 33.5h28"/>',
    thermo: '<path d="M20.5 28.5V10a3.5 3.5 0 0 1 7 0v18.5a8 8 0 1 1-7 0z"/><path d="M24 17v16"/><circle cx="24" cy="35" r="2.5"/>',
    shield: '<path d="M24 5l15 5.5v11.5c0 9.5-6.4 17-15 21-8.6-4-15-11.5-15-21V10.5z"/><path d="M17.5 24l4.5 4.5 9-9.5"/>',
    route: '<circle cx="11" cy="37" r="3.5"/><circle cx="37" cy="11" r="3.5"/><path d="M14.5 37H25a6.5 6.5 0 0 0 0-13h-2a6.5 6.5 0 0 1 0-13h10.5" stroke-dasharray="3 4"/>',
    family: '<circle cx="15" cy="15" r="5"/><circle cx="33" cy="15" r="5"/><circle cx="24" cy="25" r="3.5"/><path d="M5 40c0-6.5 4.5-11 10-11 2.5 0 4.7.9 6.4 2.4M43 40c0-6.5-4.5-11-10-11-2.5 0-4.7.9-6.4 2.4M17 41c0-4.5 3-7.5 7-7.5s7 3 7 7.5"/>',
    leaf: '<path d="M9 39C9 21 21 9 40 9c0 19-11 30-31 30z"/><path d="M9 39L29 19"/>',
    home: '<path d="M6 23L24 8l18 15"/><path d="M11 19v20h26V19"/><path d="M20 39V29h8v10"/>',
  };
  const futurBoard = (title, items) => `<div class="futur"><h3>${esc(title)}</h3><ul>${items.map(([ic, txt], i) =>
    `<li style="animation-delay:${0.15 + i * 0.35}s"><svg viewBox="0 0 48 48" aria-hidden="true">${ICON[ic]}</svg><span>${esc(txt)}</span></li>`).join('')}</ul></div>`;

  // …/shadow/?demo : Shadow se présente tout seul, à voix haute.
  // Il n'écoute pas, n'ouvre pas la caméra, ne garde rien en mémoire et ne dit aucun prénom.
  const DEMO = /[?&]demo\b/.test(location.search);
  let demoOn = false;
  async function demo() {
    if (demoOn) return;
    demoOn = true;
    $('#hint').hidden = true;
    voice.unlock(); fx.tone([[1, 0.01]]);
    const keep = { subtitles: S.settings.subtitles, sound: S.settings.sound };
    S.settings.subtitles = false; S.settings.sound = true; // la démo se regarde sans sous-titres (jamais enregistré)
    $('#bubble').hidden = true;
    const de = document.documentElement;
    if (de.requestFullscreen) de.requestFullscreen().catch(() => {});
    const beat = ms => wait(ms);
    const guep = net() ? lookup('guepard').catch(() => null) : Promise.resolve(null); // on prépare l'image en avance
    await beat(900);
    face.set('happy'); fx.wake(); VISAGE.puff('etoile', 4);
    await say('Bip bop ! Bonjour, je suis Shadow, le robot du Projet SHADOW !');
    face.set('idle');
    await say("Mon visage a été dessiné par mon inventeur, un garçon de sept ans. Et c'est avec son papa qu'il me fabrique.");
    await beat(300);
    face.set('happy'); await say('Je peux être content…');
    face.set('surprise'); VISAGE.puff('eclair', 2); await say('surpris !');
    face.set('love'); VISAGE.puff('coeur', 4); await say('Plein de cœurs…');
    face.set('sad'); await say('un peu triste…');
    face.set('confused'); VISAGE.puff('question', 2); await say('perplexe…');
    face.set('laugh'); VISAGE.puff('note', 3); fx.tone([[880, 0.07], [1175, 0.07], [988, 0.07], [1319, 0.07], [1047, 0.1]]);
    await say('Et je rigole quand on me chatouille ! Hi hi hi !');
    face.set('idle');
    await say("On me parle avec la voix : il n'y a pas de bouton, juste mon visage. Je reconnais les visages et les voix de la famille, et tout reste dans le téléphone.");
    const r = await guep;
    if (r && r.img) {
      face.set('think'); VISAGE.puff('question', 2);
      await say("Je n'invente pas les réponses : je cherche dans une encyclopédie pour enfants. Montre-moi un guépard ?");
      showBoard(`<div class="savoir"><img src="${esc(r.img)}" alt="" referrerpolicy="no-referrer"><h3>${esc(r.title)}</h3></div>`);
      face.set('happy');
      await say('Regarde ! Le guépard est le plus rapide des animaux de la terre.');
      await beat(1200);
      hideBoard();
    }
    face.set('idle');
    showBoard(`<div class="mystere"><svg viewBox="0 0 200 180">${PIECES.slice(0, 3).map(p => p.replace(/class="p"/g, 'class="p on"')).join('')}${PIECES.slice(3).join('')}</svg><div class="mot">RO_OT</div><div class="rate">A S</div></div>`);
    await say("J'aide à l'école : orthographe, dictée, lecture, calcul, l'heure, l'anglais… et des jeux, comme le robot mystère !");
    hideBoard();
    // minuteur d'exemple, sans rien enregistrer
    tm = { end: Date.now() + 120000, total: 120, label: 'brossage', silent: true };
    tm.iv = setInterval(drawTimer, 1000); drawTimer();
    face.set('happy');
    await say("Je lance aussi un minuteur pour le brossage des dents, je donne la météo, et je raconte une histoire pour dormir.");
    await beat(600);
    clearInterval(tm.iv); tm = null; drawTimer();
    // la suite du projet : un robot autonome, à la maison et dehors
    face.set('think'); VISAGE.puff('eclair', 2);
    await say("Mais je ne suis que le début. Bientôt, j'aurai un corps complet, comme sur le schéma de mon inventeur, avec des moteurs, des caméras et des capteurs, et je serai complètement autonome.");
    showBoard(futurBoard('À la maison', [['bulb', "J'allume les lumières"], ['volet', 'Je ferme les volets'], ['thermo', 'Je règle le chauffage'], ['shield', 'Je veille sur la maison'], ['route', 'Je me déplace de pièce en pièce']]), 'solid');
    face.set('happy');
    await say("À la maison, j'allumerai les lumières, je fermerai les volets et je réglerai le chauffage. Je veillerai sur la maison et je préviendrai s'il y a un souci.");
    await say("Je me déplacerai tout seul de pièce en pièce, sans me cogner, et je viendrai rappeler l'heure des devoirs.");
    showBoard(futurBoard('Dehors', [['family', "J'accompagne la famille"], ['leaf', 'Je reconnais plantes et animaux'], ['home', 'Je retrouve le chemin']]), 'solid');
    await say("Dehors, j'accompagnerai la famille en promenade, je reconnaîtrai les plantes et les animaux, et je retrouverai toujours le chemin de la maison.");
    hideBoard();
    face.set('proud'); VISAGE.puff('etoile', 5); fx.ok(); fx.confetti(70);
    await say('Le Projet SHADOW continue : un robot fabriqué en famille. À bientôt !');
    await beat(1500);
    face.set('sleep');
    $('#bubble').hidden = true;
    S.settings.subtitles = keep.subtitles; S.settings.sound = keep.sound;
    $('#hint').hidden = false; // on peut la relancer (pour refaire une prise)
    demoOn = false;
  }

  return { route, routeEarly, tapCancel, demo, DEMO, savoir, meteo, meteoFact, ideas, subjectOf, lookup, durationOf, minuteur, startTimer, stopTimer,
    brossageFlow, respirationFlow, mystereFlow, simonFlow };
})();
