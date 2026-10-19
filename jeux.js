/* =========================================================
   SHADOW — jeux et savoirs (le « mini-cerveau » intégré)
   Tout ici marche sans Internet : devinettes, quiz, calcul.
   ========================================================= */
'use strict';

const JEUX = (() => {
  const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /* ---------- Devinettes ---------- */
  // r = mots acceptés (sans accents, en minuscules)
  const DEVINETTES = [
    { q: "Je suis jaune et courbée, et les singes m'adorent. Qui suis-je ?", a: 'une banane', r: ['banane'] },
    { q: "J'ai des aiguilles mais je ne pique pas. Je te donne l'heure. Qui suis-je ?", a: 'une horloge', r: ['horloge', 'montre', 'pendule', 'reveil'] },
    { q: "Plus je sèche, plus je suis mouillée. Qui suis-je ?", a: 'une serviette', r: ['serviette'] },
    { q: "J'ai plein de dents, mais je ne mange jamais. Je coiffe tes cheveux. Qui suis-je ?", a: 'un peigne', r: ['peigne', 'brosse'] },
    { q: "Je tombe du ciel sans me faire mal. Je suis blanche et froide. Qui suis-je ?", a: 'la neige', r: ['neige', 'flocon'] },
    { q: "Je suis pleine de trous, mais je garde l'eau. Qui suis-je ?", a: 'une éponge', r: ['eponge'] },
    { q: "Je porte ma maison sur mon dos et je laisse une trace qui brille. Qui suis-je ?", a: 'un escargot', r: ['escargot', 'limace'] },
    { q: "Je brille la nuit dans le ciel, et ma forme change pendant le mois. Qui suis-je ?", a: 'la Lune', r: ['lune'] },
    { q: "J'ai quatre pieds mais je ne marche jamais. On mange autour de moi. Qui suis-je ?", a: 'une table', r: ['table'] },
    { q: "Je suis orange, je pousse dans la terre, et les lapins m'adorent. Qui suis-je ?", a: 'une carotte', r: ['carotte'] },
    { q: "Je monte et je descends, mais je ne bouge jamais. Qui suis-je ?", a: 'un escalier', r: ['escalier', 'marche'] },
    { q: "Plus on m'enlève de terre, plus je deviens grand. Qui suis-je ?", a: 'un trou', r: ['trou'] },
    { q: "J'ai un très long cou et des taches. Je mange les feuilles en haut des arbres. Qui suis-je ?", a: 'une girafe', r: ['girafe'] },
    { q: "J'ai des pages et une couverture, mais je n'ai jamais froid. Qui suis-je ?", a: 'un livre', r: ['livre', 'cahier', 'album'] },
    { q: "Il est à toi, mais les autres l'utilisent plus que toi. Qu'est-ce que c'est ?", a: 'ton prénom', r: ['prenom', 'nom'] },
    { q: "Je vis dans l'eau, j'ai des nageoires et je fais des bulles. Qui suis-je ?", a: 'un poisson', r: ['poisson'] },
    { q: "Je vole de fleur en fleur et je fabrique du miel. Qui suis-je ?", a: 'une abeille', r: ['abeille'] },
    { q: "Je suis le roi de la savane et j'ai une grosse crinière. Qui suis-je ?", a: 'le lion', r: ['lion'] },
    { q: "On me souffle une fois par an, sur un gâteau. Qui suis-je ?", a: 'une bougie', r: ['bougie'] },
    { q: "Je suis froide, je fonds au soleil, et on me mange en cornet. Qui suis-je ?", a: 'une glace', r: ['glace', 'sorbet'] },
    { q: "Je suis noir et blanc, je ne vole pas, mais je nage très bien dans l'eau glacée. Qui suis-je ?", a: 'un manchot', r: ['manchot', 'pingouin'] },
    { q: "Je suis un robot avec des moustaches de chat et une crête bleue. Qui suis-je ?", a: 'moi, Shadow', r: ['shadow', 'toi', 'robot'] },
    { q: "J'ai des touches noires et blanches, et je fais de la musique. Qui suis-je ?", a: 'un piano', r: ['piano'] },
    { q: "On me met des lettres et un timbre, puis je voyage jusqu'à ta boîte aux lettres. Qui suis-je ?", a: 'une lettre', r: ['lettre', 'enveloppe', 'carte'] },
    { q: "J'ai deux roues et des pédales, et on me fait avancer avec les pieds. Qui suis-je ?", a: 'un vélo', r: ['velo', 'bicyclette'] },
  ];

  /* ---------- Quiz (avec une petite leçon à chaque fois) ---------- */
  const THEMES = {
    animaux: { nom: 'Les animaux', ico: '🐾' },
    espace: { nom: "L'espace", ico: '🚀' },
    corps: { nom: 'Le corps humain', ico: '🫀' },
    nature: { nom: 'La nature', ico: '🌱' },
    monde: { nom: 'La France et le monde', ico: '🌍' },
    robots: { nom: 'Robots et sciences', ico: '🤖' },
  };
  // c = index de la bonne réponse, e = la petite leçon
  const QUIZ = [
    { th: 'animaux', q: "Combien de pattes a une araignée ?", o: ['6', '8', '10'], c: 1, e: "L'araignée a 8 pattes. Les insectes, eux, en ont 6 : l'araignée n'est pas un insecte !" },
    { th: 'animaux', q: "Quel est le plus grand animal du monde ?", o: ["L'éléphant", 'La baleine bleue', 'La girafe'], c: 1, e: "La baleine bleue peut mesurer 30 mètres : plus long que deux bus !" },
    { th: 'animaux', q: "Que mange surtout le panda ?", o: ['Du bambou', 'Du poisson', 'Des carottes'], c: 0, e: "Le panda mange du bambou presque toute la journée !" },
    { th: 'animaux', q: "La chauve-souris, c'est…", o: ['Un oiseau', 'Un mammifère', 'Un insecte'], c: 1, e: "Elle vole, mais c'est un mammifère : ses bébés boivent le lait de leur maman." },
    { th: 'animaux', q: "Comment s'appelle le bébé de la vache ?", o: ['Le poulain', 'Le veau', "L'agneau"], c: 1, e: "Le bébé de la vache, c'est le veau. Le poulain, c'est le bébé du cheval." },
    { th: 'animaux', q: "Avec quoi respire le poisson ?", o: ['Ses branchies', 'Son nez', 'Il ne respire pas'], c: 0, e: "Le poisson respire avec ses branchies : elles prennent l'air qui est caché dans l'eau." },
    { th: 'espace', q: "Quelle est l'étoile la plus proche de la Terre ?", o: ['Le Soleil', 'La Lune', 'Mars'], c: 0, e: "Le Soleil est une étoile ! La Lune, elle, brille parce que le Soleil l'éclaire." },
    { th: 'espace', q: "Combien de planètes tournent autour du Soleil ?", o: ['5', '8', '12'], c: 1, e: "Il y a 8 planètes. La Terre est la troisième en partant du Soleil." },
    { th: 'espace', q: "Quelle planète est surnommée la planète rouge ?", o: ['Mars', 'Jupiter', 'Vénus'], c: 0, e: "Mars est rouge parce que son sol est plein de rouille !" },
    { th: 'espace', q: "Quelle est la plus grosse planète ?", o: ['La Terre', 'Jupiter', 'Mars'], c: 1, e: "Jupiter est géante : plus de mille Terres pourraient tenir dedans !" },
    { th: 'espace', q: "Qui a marché sur la Lune en premier ?", o: ['Neil Armstrong', 'Thomas Pesquet', 'Napoléon'], c: 0, e: "Neil Armstrong a marché sur la Lune en 1969. Thomas Pesquet, lui, est un astronaute français qui a vécu dans la station spatiale." },
    { th: 'corps', q: "Combien de dents de lait a un enfant ?", o: ['10', '20', '32'], c: 1, e: "Un enfant a 20 dents de lait. Un adulte en a 32 !" },
    { th: 'corps', q: "Quel organe fait circuler le sang ?", o: ['Le cœur', "L'estomac", 'Les poumons'], c: 0, e: "Le cœur est une pompe : il envoie le sang dans tout le corps." },
    { th: 'corps', q: "Avec quoi respire-t-on ?", o: ['Le cœur', 'Les poumons', 'Le ventre'], c: 1, e: "Les poumons se gonflent d'air comme deux ballons quand tu respires." },
    { th: 'corps', q: "Combien d'os a un adulte, à peu près ?", o: ['26', '206', '2000'], c: 1, e: "Un adulte a 206 os. Moi, j'ai un squelette de robot !" },
    { th: 'corps', q: "Quel sens utilise-t-on avec le nez ?", o: ["L'odorat", 'Le goût', "L'ouïe"], c: 0, e: "Avec le nez, on sent les odeurs : c'est l'odorat. L'ouïe, c'est avec les oreilles." },
    { th: 'nature', q: "De quoi une plante a-t-elle besoin pour pousser ?", o: ["De lumière et d'eau", 'De chocolat', 'De bruit'], c: 0, e: "Une plante a besoin de lumière, d'eau, et d'un peu de terre." },
    { th: 'nature', q: "Quelle saison vient après l'hiver ?", o: ["L'été", 'Le printemps', "L'automne"], c: 1, e: "Après l'hiver vient le printemps, puis l'été, puis l'automne." },
    { th: 'nature', q: "À quelle température l'eau gèle-t-elle ?", o: ['0 degré', '50 degrés', '100 degrés'], c: 0, e: "L'eau gèle à 0 degré et elle bout à 100 degrés." },
    { th: 'nature', q: "Que devient une chenille ?", o: ['Un papillon', 'Une abeille', 'Un ver de terre'], c: 0, e: "La chenille fait un cocon, puis elle devient un papillon !" },
    { th: 'nature', q: "Combien de couleurs y a-t-il dans un arc-en-ciel ?", o: ['3', '7', '10'], c: 1, e: "L'arc-en-ciel a 7 couleurs : rouge, orange, jaune, vert, bleu, indigo et violet." },
    { th: 'monde', q: "Quelle est la capitale de la France ?", o: ['Marseille', 'Paris', 'Lyon'], c: 1, e: "La capitale de la France, c'est Paris, avec la tour Eiffel !" },
    { th: 'monde', q: "Quelles sont les couleurs du drapeau français ?", o: ['Bleu, blanc, rouge', 'Vert, blanc, rouge', 'Bleu, jaune, rouge'], c: 0, e: "Le drapeau français est bleu, blanc, rouge." },
    { th: 'monde', q: "Quel est le plus grand océan ?", o: ["L'Atlantique", 'Le Pacifique', "L'océan Indien"], c: 1, e: "Le Pacifique est le plus grand océan : il est plus grand que tous les continents réunis !" },
    { th: 'monde', q: "Où vivent les kangourous ?", o: ['En Australie', 'En Afrique', 'En France'], c: 0, e: "Les kangourous vivent en Australie. Les bébés grandissent dans la poche de leur maman." },
    { th: 'monde', q: "Combien y a-t-il de mois dans une année ?", o: ['10', '12', '14'], c: 1, e: "Une année a 12 mois, de janvier à décembre." },
    { th: 'robots', q: "Qu'est-ce qui donne de l'énergie à un robot ?", o: ['Une batterie', 'De la soupe', 'Des bonbons'], c: 0, e: "Un robot marche avec une batterie ou des piles. Moi aussi, bientôt !" },
    { th: 'robots', q: "À quoi sert une caméra sur un robot ?", o: ['À voir', 'À manger', 'À rouler'], c: 0, e: "La caméra, ce sont les yeux du robot. J'en ai une entre mes deux yeux !" },
    { th: 'robots', q: "Qu'est-ce qu'un aimant attire ?", o: ['Le fer', 'Le bois', 'Le plastique'], c: 0, e: "Un aimant attire le fer, comme les trombones. Pas le bois ni le plastique." },
    { th: 'robots', q: "Qu'est-ce que le WiFi ?", o: ['Des ondes invisibles qui transportent Internet', 'Un gâteau', 'Un animal'], c: 0, e: "Le WiFi, ce sont des ondes invisibles. C'est grâce à lui que mon cerveau parle à Internet !" },
  ];

  function quizRound(theme, n = 5) {
    const pool = theme ? QUIZ.filter(x => x.th === theme) : QUIZ;
    return shuffle(pool).slice(0, n).map(x => {
      const order = shuffle(x.o.map((o, i) => i));
      return { ...x, o: order.map(i => x.o[i]), c: order.indexOf(x.c) };
    });
  }

  /* ---------- Calcul mental (niveau CE1) ---------- */
  function calcQuestion() {
    const kind = pick(['add', 'add', 'sub', 'sub', 'double', 'tens', 'mul']);
    let a, b, op, r, tip;
    if (kind === 'add') { a = rnd(2, 12); b = rnd(2, 9); op = '+'; r = a + b; tip = a + b > 10 && a < 10 ? `Passe par 10 : ${a} + ${10 - a} = 10, puis ajoute le reste.` : `Compte à partir de ${Math.max(a, b)}.`; }
    else if (kind === 'sub') { a = rnd(6, 20); b = rnd(1, Math.min(9, a - 1)); op = '−'; r = a - b; tip = `Pars de ${b} et compte jusqu'à ${a}.`; }
    else if (kind === 'double') { a = rnd(2, 10); b = a; op = '+'; r = a + b; tip = `C'est un double ! Tu connais le double de ${a} ?`; }
    else if (kind === 'tens') { a = rnd(1, 8) * 10; b = rnd(1, 9); op = '+'; r = a + b; tip = `${a}, ce sont ${a / 10} dizaines. Ajoute ${b} unités.`; }
    else { a = pick([2, 5, 10]); b = rnd(1, 5); op = '×'; r = a * b; tip = `${a} × ${b}, c'est ${Array(b).fill(a).join(' + ')}.`; }
    if (kind === 'mul' && Math.random() < 0.5) [a, b] = [b, a];
    return { a, b, op, r, tip, say: `${a} ${op === '+' ? 'plus' : op === '−' ? 'moins' : 'fois'} ${b}` };
  }

  /* ---------- Vérifier une réponse dite à voix haute ---------- */
  const NUMS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  function parseNumber(text) {
    const t = ORTHO.bare(text);
    const d = t.match(/\d+/);
    if (d) return parseInt(d[0], 10);
    // « dix sept » = 17, « vingt trois » = 23, « quatre vingt » = 80
    let total = 0, found = false, prev = '';
    for (const w of t.split(/[^a-z]+/)) {
      if (!(w in NUMS)) continue;
      found = true;
      if (w === 'vingt' && prev === 'quatre') total += 80 - 4;
      else total += NUMS[w];
      prev = w;
    }
    return found ? total : null;
  }
  const matches = (text, accepted) => { const t = ORTHO.bare(text); return accepted.some(r => t.includes(r)); };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ---------- Les objets que les yeux de Shadow connaissent ---------- */
  const OBJETS = {
    person: "quelqu'un", bicycle: 'un vélo', car: 'une voiture', motorcycle: 'une moto', airplane: 'un avion', bus: 'un bus',
    train: 'un train', truck: 'un camion', boat: 'un bateau', 'traffic light': 'un feu rouge', 'fire hydrant': "une bouche d'incendie",
    'stop sign': 'un panneau stop', 'parking meter': 'un parcmètre', bench: 'un banc', bird: 'un oiseau', cat: 'un chat', dog: 'un chien',
    horse: 'un cheval', sheep: 'un mouton', cow: 'une vache', elephant: 'un éléphant', bear: 'un ours', zebra: 'un zèbre',
    giraffe: 'une girafe', backpack: 'un sac à dos', umbrella: 'un parapluie', handbag: 'un sac', tie: 'une cravate',
    suitcase: 'une valise', frisbee: 'un frisbee', skis: 'des skis', snowboard: 'un snowboard', 'sports ball': 'un ballon',
    kite: 'un cerf-volant', 'baseball bat': 'une batte', 'baseball glove': 'un gant', skateboard: 'un skateboard',
    surfboard: 'une planche de surf', 'tennis racket': 'une raquette', bottle: 'une bouteille', 'wine glass': 'un verre',
    cup: 'une tasse', fork: 'une fourchette', knife: 'un couteau', spoon: 'une cuillère', bowl: 'un bol', banana: 'une banane',
    apple: 'une pomme', sandwich: 'un sandwich', orange: 'une orange', broccoli: 'du brocoli', carrot: 'une carotte',
    'hot dog': 'un hot-dog', pizza: 'une pizza', donut: 'un beignet', cake: 'un gâteau', chair: 'une chaise', couch: 'un canapé',
    'potted plant': 'une plante', bed: 'un lit', 'dining table': 'une table', toilet: 'des toilettes', tv: 'une télévision',
    laptop: 'un ordinateur', mouse: 'une souris d\'ordinateur', remote: 'une télécommande', keyboard: 'un clavier',
    'cell phone': 'un téléphone', microwave: 'un micro-ondes', oven: 'un four', toaster: 'un grille-pain', sink: 'un évier',
    refrigerator: 'un frigo', book: 'un livre', clock: 'une horloge', vase: 'un vase', scissors: 'des ciseaux',
    'teddy bear': 'un nounours', 'hair drier': 'un sèche-cheveux', toothbrush: 'une brosse à dents',
  };
  // Pour le jeu « va me chercher… » : des choses faciles et sans danger à apporter
  const CHASSE = ['book', 'cup', 'bottle', 'spoon', 'bowl', 'banana', 'apple', 'orange', 'teddy bear', 'sports ball',
    'remote', 'toothbrush', 'backpack', 'carrot'];

  return { OBJETS, CHASSE, DEVINETTES, THEMES, quizRound, calcQuestion, parseNumber, matches, shuffle };
})();
