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
    { q: "Je suis le meilleur ami de l'homme et je remue la queue quand je suis content. Qui suis-je ?", a: 'le chien', r: ['chien', 'toutou'] },
    { q: "J'ai une crête rouge et je chante cocorico le matin. Qui suis-je ?", a: 'le coq', r: ['coq'] },
    { q: "Je suis rond, et on me tape avec le pied pour marquer des buts. Qui suis-je ?", a: 'un ballon', r: ['ballon', 'balle'] },
    { q: "On m'ouvre quand il pleut, pour rester au sec. Qui suis-je ?", a: 'un parapluie', r: ['parapluie'] },
    { q: "J'ai des piquants, je vis dans le désert, et je n'ai presque jamais soif. Qui suis-je ?", a: 'un cactus', r: ['cactus'] },
    { q: "On me met aux pieds pour marcher dehors. Qui suis-je ?", a: 'des chaussures', r: ['chaussure', 'basket', 'botte', 'soulier', 'chausson'] },
    { q: "Je garde les aliments au froid, dans la cuisine. Qui suis-je ?", a: 'le frigo', r: ['frigo', 'refrigerateur', 'congelateur'] },
    { q: "Je suis un très grand oiseau qui ne vole pas, mais je cours très vite. Qui suis-je ?", a: "l'autruche", r: ['autruche'] },
    { q: "J'ai huit bras et je vis dans la mer. Qui suis-je ?", a: 'la pieuvre', r: ['pieuvre', 'poulpe'] },
    { q: "Je suis orange avec des rayures noires, et je suis le plus grand des chats sauvages. Qui suis-je ?", a: 'le tigre', r: ['tigre'] },
    { q: "Avec moi et un peu de dentifrice, tes dents sont toutes propres. Qui suis-je ?", a: 'la brosse à dents', r: ['brosse', 'dentifrice'] },
    { q: "Je suis la saison où il fait froid et où il neige parfois. Qui suis-je ?", a: "l'hiver", r: ['hiver'] },
    { q: "Je vole la nuit et je dors la tête en bas. Qui suis-je ?", a: 'la chauve-souris', r: ['chauve souris', 'chauve'] },
    { q: "Je suis un fruit jaune et très acide. Qui suis-je ?", a: 'le citron', r: ['citron'] },
    { q: "On me met sur la tête quand il fait froid. Qui suis-je ?", a: 'un bonnet', r: ['bonnet', 'chapeau', 'casquette', 'capuche'] },
    { q: "Je suis long, je n'ai pas de pattes, et je fais sss. Qui suis-je ?", a: 'le serpent', r: ['serpent'] },
    { q: "J'ai des wagons et je roule sur des rails. Qui suis-je ?", a: 'le train', r: ['train', 'tgv', 'metro', 'tramway'] },
    { q: "J'ai un écran et un clavier, et on peut écrire ou jouer avec moi. Qui suis-je ?", a: 'un ordinateur', r: ['ordinateur', 'ordi', 'tablette'] },
    { q: "Je suis blanc, on me boit au petit déjeuner, et je viens de la vache. Qui suis-je ?", a: 'le lait', r: ['lait'] },
    { q: "J'ai des ailes, des plumes et un bec, et je fais mon nid dans les arbres. Qui suis-je ?", a: 'un oiseau', r: ['oiseau', 'moineau', 'merle', 'pigeon'] },
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
    { th: 'animaux', q: 'Combien de pattes a un insecte ?', o: ['4', '6', '8'], c: 1, e: "Un insecte a 6 pattes, comme la fourmi ou l'abeille." },
    { th: 'animaux', q: 'Quel est l\'animal le plus rapide sur terre ?', o: ['Le guépard', 'Le lion', 'Le cheval'], c: 0, e: 'Le guépard peut courir à plus de 100 kilomètres à l\'heure, aussi vite qu\'une voiture !' },
    { th: 'animaux', q: "Où vit l'ours polaire ?", o: ['Près du pôle Nord', 'Dans le désert', 'Dans la jungle'], c: 0, e: 'Il vit sur la banquise, près du pôle Nord. Les manchots, eux, vivent près du pôle Sud.' },
    { th: 'animaux', q: "Que fabrique l'abeille ?", o: ['Du lait', 'Du miel', 'De la soie'], c: 1, e: "L'abeille fabrique du miel avec le nectar des fleurs." },
    { th: 'animaux', q: 'Comment s\'appelle le bébé de la poule ?', o: ['Le poussin', 'Le chaton', 'Le caneton'], c: 0, e: 'Le bébé de la poule, c\'est le poussin. Le caneton, c\'est le bébé du canard.' },
    { th: 'animaux', q: 'Quel animal a une trompe ?', o: ['La girafe', "L'éléphant", 'Le rhinocéros'], c: 1, e: "L'éléphant se sert de sa trompe pour sentir, boire et attraper des choses." },
    { th: 'animaux', q: 'Le dauphin, c\'est…', o: ['Un poisson', 'Un mammifère', 'Un oiseau'], c: 1, e: 'Il vit dans l\'eau, mais il respire de l\'air avec des poumons : c\'est un mammifère.' },
    { th: 'animaux', q: 'Combien de bosses a un dromadaire ?', o: ['Une', 'Deux', 'Trois'], c: 0, e: 'Le dromadaire a une bosse. Le chameau, lui, en a deux.' },
    { th: 'animaux', q: 'Quel animal est d\'abord un têtard ?', o: ['La grenouille', 'Le poisson rouge', 'Le serpent'], c: 0, e: 'Le têtard vit dans l\'eau, puis il lui pousse des pattes et il devient une grenouille.' },
    { th: 'animaux', q: 'Que mange la vache ?', o: ["De l'herbe", 'De la viande', 'Des insectes'], c: 0, e: "La vache mange de l'herbe, et elle la mâche même plusieurs fois !" },
    { th: 'espace', q: 'Autour de quoi tourne la Terre ?', o: ['Autour de la Lune', 'Autour du Soleil', 'Elle ne tourne pas'], c: 1, e: 'La Terre fait le tour du Soleil en un an.' },
    { th: 'espace', q: 'Combien de temps met la Terre pour faire un tour sur elle-même ?', o: ['Une journée', 'Une semaine', 'Un an'], c: 0, e: "Un tour sur elle-même, c'est une journée : c'est pour ça qu'il y a le jour et la nuit." },
    { th: 'espace', q: 'Comment s\'appelle notre galaxie ?', o: ['La Voie lactée', 'La Grande Ourse', 'La Galaxie bleue'], c: 0, e: 'Notre galaxie s\'appelle la Voie lactée. La Grande Ourse, c\'est un groupe d\'étoiles.' },
    { th: 'espace', q: 'Quelle planète a de grands anneaux ?', o: ['Saturne', 'Mars', 'Mercure'], c: 0, e: 'Saturne a de magnifiques anneaux faits de glace et de cailloux.' },
    { th: 'espace', q: 'Quelle est la planète la plus proche du Soleil ?', o: ['Mercure', 'Vénus', 'La Terre'], c: 0, e: "Mercure est la plus proche du Soleil. La Terre est la troisième." },
    { th: 'espace', q: 'Comment appelle-t-on la Lune quand elle est toute ronde ?', o: ['La pleine lune', 'La nouvelle lune', 'Le croissant'], c: 0, e: "Quand on la voit toute ronde, c'est la pleine lune." },
    { th: 'espace', q: "Qu'est-ce qu'une étoile filante ?", o: ["Un petit caillou de l'espace qui brûle dans le ciel", 'Une étoile qui tombe', 'Un avion'], c: 0, e: "Ce n'est pas une étoile : c'est un petit caillou de l'espace qui brûle en entrant dans l'air." },
    { th: 'espace', q: "Avec quoi les astronautes vont-ils dans l'espace ?", o: ['Une fusée', 'Un hélicoptère', 'Un sous-marin'], c: 0, e: "Il faut une fusée très puissante pour aller dans l'espace." },
    { th: 'espace', q: 'Y a-t-il de l\'air pour respirer sur la Lune ?', o: ['Oui', 'Non', 'Seulement la nuit'], c: 1, e: "Non ! C'est pour ça que les astronautes portent un scaphandre." },
    { th: 'espace', q: "Vue de l'espace, de quelle couleur est surtout la Terre ?", o: ['Bleue', 'Rouge', 'Jaune'], c: 0, e: "Elle est surtout bleue à cause des océans : on l'appelle la planète bleue." },
    { th: 'corps', q: 'Combien a-t-on de doigts en tout, aux deux mains ?', o: ['8', '10', '12'], c: 1, e: '5 doigts à chaque main, ça fait 10 doigts.' },
    { th: 'corps', q: 'Avec quoi goûte-t-on les aliments ?', o: ['Les yeux', 'La langue', 'Les oreilles'], c: 1, e: "On goûte avec la langue. Le nez aide beaucoup aussi : quand on est enrhumé, on sent moins le goût !" },
    { th: 'corps', q: 'Où se trouve le cerveau ?', o: ['Dans la tête', 'Dans le ventre', 'Dans le pied'], c: 0, e: 'Le cerveau est dans la tête, bien protégé par le crâne.' },
    { th: 'corps', q: 'Que faut-il faire avant de manger ?', o: ['Se laver les mains', 'Mettre un chapeau', 'Courir'], c: 0, e: 'On se lave les mains pour enlever les microbes.' },
    { th: 'corps', q: 'Combien de fois par jour faut-il se brosser les dents ?', o: ['Une fois par semaine', 'Deux fois par jour', 'Jamais'], c: 1, e: 'Matin et soir, pendant deux minutes : tes dents te disent merci !' },
    { th: 'corps', q: 'À quoi servent les muscles ?', o: ['À bouger', 'À voir', 'À entendre'], c: 0, e: 'Les muscles tirent sur les os pour que tu puisses bouger, courir et sauter.' },
    { th: 'corps', q: 'Avec quoi entend-on ?', o: ['Les yeux', 'Les oreilles', 'Les mains'], c: 1, e: "On entend avec les oreilles : c'est le sens de l'ouïe." },
    { th: 'corps', q: "Pourquoi faut-il boire de l'eau ?", o: ['Parce que le corps en a besoin', 'Pour devenir bleu', 'Pour dormir debout'], c: 0, e: "Ton corps est fait en grande partie d'eau : il en a besoin tous les jours." },
    { th: 'corps', q: 'Quel os protège le cerveau ?', o: ['Le crâne', 'Le genou', 'La cheville'], c: 0, e: 'Le crâne est comme un casque naturel pour le cerveau.' },
    { th: 'corps', q: 'Que fait le cœur quand on court ?', o: ['Il bat plus vite', "Il s'arrête", 'Il dort'], c: 0, e: 'Quand tu cours, ton cœur bat plus vite pour envoyer plus de sang à tes muscles.' },
    { th: 'nature', q: 'Quand les feuilles des arbres tombent-elles ?', o: ["En automne", 'Au printemps', 'En été'], c: 0, e: "En automne, beaucoup d'arbres perdent leurs feuilles. Elles repoussent au printemps." },
    { th: 'nature', q: "Que devient l'eau quand elle gèle ?", o: ['De la glace', 'De la vapeur', 'Du sable'], c: 0, e: "L'eau qui gèle devient de la glace." },
    { th: 'nature', q: "D'où tombe la pluie ?", o: ['Des nuages', 'Des arbres', 'Des montagnes'], c: 0, e: "Les nuages sont faits de toutes petites gouttes d'eau. Quand elles grossissent, elles tombent : c'est la pluie." },
    { th: 'nature', q: 'Quelle grande fleur jaune tourne vers le soleil ?', o: ['Le tournesol', 'La rose', 'La tulipe'], c: 0, e: 'Le tournesol porte bien son nom : jeune, il se tourne vers le soleil.' },
    { th: 'nature', q: 'Qui fabrique des toiles ?', o: ["L'araignée", 'La fourmi', 'Le papillon'], c: 0, e: "L'araignée tisse sa toile avec un fil qu'elle fabrique elle-même." },
    { th: 'nature', q: 'Combien y a-t-il de saisons dans une année ?', o: ['2', '4', '6'], c: 1, e: 'Il y a 4 saisons : le printemps, l\'été, l\'automne et l\'hiver.' },
    { th: 'nature', q: "Que fait l'écureuil en automne ?", o: ["Il cache des noisettes pour l'hiver", 'Il part à la plage', 'Il fait un bonhomme de neige'], c: 0, e: "Il cache des réserves de noisettes pour avoir à manger en hiver." },
    { th: 'nature', q: 'Que faut-il pour voir un arc-en-ciel ?', o: ['Du soleil et de la pluie', 'De la neige', 'La nuit noire'], c: 0, e: "Quand le soleil brille à travers des gouttes de pluie, il fait un arc-en-ciel." },
    { th: 'nature', q: 'Quel est le fruit du pommier ?', o: ['La poire', 'La pomme', 'La cerise'], c: 1, e: 'Le pommier donne des pommes. Le poirier donne des poires, et le cerisier des cerises.' },
    { th: 'nature', q: 'Que fait une graine quand on la plante ?', o: ['Elle pousse', 'Elle chante', 'Elle s\'envole'], c: 0, e: "Avec de la terre, de l'eau et de la lumière, la graine pousse et devient une plante." },
    { th: 'monde', q: 'Quelle est la plus haute montagne de France ?', o: ['Le mont Blanc', 'La tour Eiffel', 'Le Vésuve'], c: 0, e: 'Le mont Blanc, dans les Alpes, est couvert de neige toute l\'année.' },
    { th: 'monde', q: 'Sur quel continent se trouve la France ?', o: ["L'Europe", "L'Afrique", "L'Amérique"], c: 0, e: 'La France est en Europe, comme l\'Espagne, l\'Italie ou l\'Allemagne.' },
    { th: 'monde', q: 'Quel est le plus grand désert chaud du monde ?', o: ['Le Sahara', 'La Bretagne', 'Le pôle Nord'], c: 0, e: 'Le Sahara, en Afrique, est immense et plein de sable.' },
    { th: 'monde', q: 'Dans quel pays se trouvent les grandes pyramides ?', o: ["L'Égypte", "L'Italie", 'Le Japon'], c: 0, e: "Les grandes pyramides sont en Égypte. Elles ont été construites il y a très, très longtemps." },
    { th: 'monde', q: 'Quelle langue parle-t-on en Angleterre ?', o: ["L'anglais", "L'espagnol", 'Le chinois'], c: 0, e: "En Angleterre, on parle anglais. Hello !" },
    { th: 'monde', q: 'Quel fleuve traverse Paris ?', o: ['La Seine', 'La Loire', 'Le Rhône'], c: 0, e: 'La Seine traverse Paris, avec beaucoup de ponts.' },
    { th: 'monde', q: 'Combien de jours y a-t-il dans une année ?', o: ['100', '365', '1000'], c: 1, e: "Une année a 365 jours, et 366 certaines années qu'on appelle bissextiles." },
    { th: 'monde', q: 'Où se trouve la tour Eiffel ?', o: ['À Paris', 'À Lyon', 'À Marseille'], c: 0, e: 'La tour Eiffel est à Paris. Elle mesure plus de 300 mètres !' },
    { th: 'monde', q: 'Comment est le drapeau du Japon ?', o: ['Blanc avec un rond rouge', 'Bleu et jaune', 'Tout vert'], c: 0, e: 'Le drapeau du Japon est blanc avec un rond rouge : c\'est le soleil.' },
    { th: 'monde', q: 'Comment dit-on bonjour en anglais ?', o: ['Hello', 'Hola', 'Ciao'], c: 0, e: '« Hello », c\'est bonjour en anglais. « Hola », c\'est en espagnol, et « ciao », en italien.' },
    { th: 'robots', q: "Qu'est-ce qui fait briller une ampoule ?", o: ["L'électricité", "L'eau", 'Le sable'], c: 0, e: "C'est l'électricité qui fait briller l'ampoule. Attention, l'électricité, ça ne se touche pas !" },
    { th: 'robots', q: "Que se passe-t-il si on lâche une pomme ?", o: ['Elle tombe', 'Elle monte', 'Elle reste en l\'air'], c: 0, e: 'Elle tombe : la Terre attire tout vers le sol, c\'est la gravité.' },
    { th: 'robots', q: "Qu'est-ce qui flotte sur l'eau ?", o: ['Un bouchon', 'Une pierre', 'Une clé'], c: 0, e: 'Le bouchon est très léger pour sa taille, alors il flotte.' },
    { th: 'robots', q: "Qu'est-ce qu'un robot ?", o: ['Une machine qui peut bouger ou aider', 'Un animal', 'Une plante'], c: 0, e: 'Un robot, c\'est une machine qui peut bouger, parler ou aider. Comme moi !' },
    { th: 'robots', q: "Avec quoi un ordinateur montre-t-il des images ?", o: ['Un écran', 'Une roue', 'Un moteur'], c: 0, e: "L'écran montre les images. Mon visage, c'est un écran aussi !" },
    { th: 'robots', q: "Que devient l'eau quand elle bout ?", o: ['De la vapeur', 'De la glace', 'Du sable'], c: 0, e: "À 100 degrés, l'eau bout et se transforme en vapeur." },
    { th: 'robots', q: "À quoi sert une loupe ?", o: ['À voir les choses en plus gros', 'À entendre', 'À chauffer'], c: 0, e: 'La loupe fait paraître les choses plus grosses : parfait pour observer les insectes !' },
    { th: 'robots', q: 'Quelle forme ont les roues ?', o: ['Rondes', 'Carrées', 'Triangulaires'], c: 0, e: 'Les roues sont rondes pour bien rouler. Avec des roues carrées, ça ferait boum boum boum !' },
    { th: 'robots', q: 'À quoi sert un thermomètre ?', o: ['À mesurer la température', 'À mesurer la taille', "À donner l'heure"], c: 0, e: 'Le thermomètre dit s\'il fait chaud ou froid, ou si on a de la fièvre.' },
    { th: 'robots', q: "Qu'est-ce qu'il faut à une voiture électrique pour rouler ?", o: ['Une batterie chargée', 'Du chocolat', 'Des plumes'], c: 0, e: "Il faut recharger sa batterie, un peu comme moi !" },
  ];

  function quizRound(theme, n = 5) {
    const all = theme ? QUIZ.filter(x => x.th === theme) : QUIZ;
    // d'abord les questions pas encore posées (on recommence quand tout a été vu)
    const seen = (typeof S !== 'undefined' && S.quizSeen) || (typeof S !== 'undefined' ? (S.quizSeen = []) : []);
    let pool = all.filter(x => !seen.includes(x.q));
    if (pool.length < n) { for (const x of all) { const i = seen.indexOf(x.q); if (i >= 0) seen.splice(i, 1); } pool = all; }
    const picked = shuffle(pool).slice(0, n);
    picked.forEach(x => seen.push(x.q));
    if (seen.length > 400) seen.splice(0, seen.length - 400);
    return picked.map(x => {
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
