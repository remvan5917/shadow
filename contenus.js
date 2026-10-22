/* =========================================================
   SHADOW — les contenus (tout est sur l'appareil, sans Internet)
   Mots du CE1, textes à lire, anglais, mot du jour, cris d'animaux,
   comptines (traditionnelles), histoires du soir, Jacques a dit…
   ========================================================= */
'use strict';

const CONTENUS = (() => {
  /* ---------- Dictée : mots fréquents du CE1 (avec une phrase pour le contexte) ---------- */
  const MOTS_CE1 = [
    ['maison', 'Ma maison a un toit rouge.'], ['école', "Je vais à l'école le matin."], ['maman', 'Maman lit une histoire.'],
    ['frère', 'Mon frère joue au ballon.'], ['sœur', 'Ma sœur dessine un chat.'], ['chat', 'Le chat dort sur le lit.'],
    ['chien', 'Le chien court dans le jardin.'], ['oiseau', "L'oiseau chante dans l'arbre."], ['poisson', 'Le poisson nage dans le bocal.'],
    ['cheval', 'Le cheval galope dans le pré.'], ['lapin', 'Le lapin mange une carotte.'], ['souris', 'La souris a peur du chat.'],
    ['arbre', "L'arbre perd ses feuilles en automne."], ['fleur', 'La fleur sent bon.'], ['soleil', 'Le soleil brille.'],
    ['lune', 'La lune est ronde ce soir.'], ['étoile', 'Une étoile brille dans le ciel.'], ['pluie', 'La pluie mouille le jardin.'],
    ['neige', 'La neige est toute blanche.'], ['vent', 'Le vent souffle fort.'], ['mer', "On se baigne dans la mer l'été."],
    ['bateau', 'Le bateau flotte sur la mer.'], ['train', 'Le train arrive en gare.'], ['voiture', 'La voiture est rouge.'],
    ['vélo', 'Je fais du vélo avec papa.'], ['livre', 'Ce livre est très drôle.'], ['cahier', "J'écris dans mon cahier."],
    ['crayon', 'Mon crayon est cassé.'], ['table', 'Le dîner est sur la table.'], ['chaise', 'Je suis assis sur la chaise.'],
    ['porte', 'Ferme la porte, il fait froid.'], ['fenêtre', 'Je regarde par la fenêtre.'], ['jardin', 'Les tomates poussent dans le jardin.'],
    ['pain', 'Le pain est encore chaud.'], ['lait', 'Je bois un verre de lait.'], ['gâteau', "Le gâteau d'anniversaire a des bougies."],
    ['pomme', 'La pomme est verte.'], ['jouet', 'Je range mes jouets.'], ['ballon', 'Le ballon roule dans la cour.'],
    ['ami', 'Mon ami vient jouer chez moi.'], ['enfant', "L'enfant joue dans la cour."], ['garçon', 'Le garçon court vite.'],
    ['fille', 'La fille saute à la corde.'], ['matin', 'Le matin, je prends mon petit déjeuner.'], ['soir', 'Le soir, je me brosse les dents.'],
    ['nuit', 'La nuit, on voit les étoiles.'], ['jour', "Aujourd'hui, c'est un beau jour."], ['lundi', "Lundi, je retourne à l'école."],
    ['mercredi', 'Mercredi, je vais au parc.'], ['samedi', 'Samedi, il y a un match de foot.'], ['rouge', 'La fraise est rouge.'],
    ['bleu', 'Le ciel est bleu.'], ['vert', "L'herbe est verte, le pull est vert."], ['jaune', 'Le citron est jaune.'],
    ['blanc', 'Le lait est blanc.'], ['grand', 'La girafe est grande, le papa est grand.'], ['petit', 'La souris est petite, le chaton est petit.'],
    ['gentil', 'Le chien est gentil.'], ['toujours', 'Je dis toujours merci.'], ['demain', 'Demain, il fera beau.'],
    ['avec', 'Je joue avec ma sœur.'], ['dans', 'Le chat est dans le panier.'], ['pour', "C'est un cadeau pour toi."],
    ['très', 'Il fait très chaud.'], ['beaucoup', "J'aime beaucoup les bonbons."], ['maintenant', 'Maintenant, on range.'],
    ['après', "Après l'école, je goûte."], ['avant', 'Je me lave les mains avant de manger.'], ['aussi', "Moi aussi, j'aime le chocolat."],
  ].map(([t, phrase]) => ({ t, phrase }));

  /* ---------- Lecture à voix haute (textes écrits pour Shadow) ---------- */
  const TEXTES = [
    'Le petit robot se réveille. Il cligne des yeux et dit bonjour à son ami.',
    'Le chat saute sur la table. Il renverse le verre de lait. Quel coquin !',
    "Il pleut ce matin. Léo met ses bottes et saute dans les flaques d'eau.",
    "La fusée décolle vers la lune. Les astronautes regardent la Terre par la fenêtre.",
    'Dans le jardin, une coccinelle grimpe sur une fleur. Elle a sept points noirs.',
    "Le boulanger prépare le pain très tôt. Ça sent bon dans toute la rue.",
    'Mon ballon rouge roule jusqu’à la mare. Un canard le regarde, très surpris.',
    "Le soir, la maman ours raconte une histoire. Les oursons s'endorment tout doucement.",
    'Le pirate cherche un trésor sur une île. Il creuse, il creuse… et trouve une vieille boîte pleine de coquillages.',
    "Il neige ! Les enfants font un bonhomme de neige avec une carotte pour le nez et deux cailloux pour les yeux.",
    "Le dragon a mal aux dents. Le dentiste monte sur une échelle et lui dit : ouvre grand la bouche !",
    'Au zoo, la girafe mange les feuilles en haut de l’arbre. Le petit éléphant l’arrose avec sa trompe.',
    "Le train part de la gare à huit heures. Dans le wagon, une petite fille regarde les vaches par la fenêtre.",
    "Ce matin, le soleil brille. Papa prépare un pique-nique, et on part au parc avec le ballon.",
    "La tortue et le lapin font une course. Le lapin court vite, mais il s'arrête pour dormir. La tortue gagne !",
    "Shadow, le petit robot, apprend à lire avec son ami. Ensemble, ils lisent une histoire de dinosaures.",
  ];

  /* ---------- Anglais (Shadow prononce le mot avec une voix anglaise) ---------- */
  const ANGLAIS = [
    ['chat', 'cat'], ['chien', 'dog'], ['oiseau', 'bird'], ['poisson', 'fish'], ['cheval', 'horse'], ['vache', 'cow'],
    ['rouge', 'red'], ['bleu', 'blue'], ['vert', 'green'], ['jaune', 'yellow'], ['noir', 'black'], ['blanc', 'white'],
    ['un', 'one'], ['deux', 'two'], ['trois', 'three'], ['quatre', 'four'], ['cinq', 'five'], ['dix', 'ten'],
    ['bonjour', 'hello'], ['merci', 'thank you'], ['oui', 'yes'], ['non', 'no'], ['au revoir', 'goodbye'],
    ['pomme', 'apple'], ['banane', 'banana'], ['lait', 'milk'], ['eau', 'water'], ['pain', 'bread'],
    ['maman', 'mum'], ['papa', 'dad'], ['frère', 'brother'], ['sœur', 'sister'], ['maison', 'house'], ['soleil', 'sun'],
    ['lune', 'moon'], ['livre', 'book'], ['ballon', 'ball'], ['robot', 'robot'],
    ['sept', 'seven'], ['huit', 'eight'], ['neuf', 'nine'], ['rose', 'pink'],
    ['tête', 'head'], ['main', 'hand'], ['pied', 'foot'], ['œil', 'eye'], ['bouche', 'mouth'], ['nez', 'nose'],
    ['grand', 'big'], ['petit', 'small'], ['chaud', 'hot'], ['froid', 'cold'], ['école', 'school'], ['voiture', 'car'],
    ['arbre', 'tree'], ['fleur', 'flower'], ['lapin', 'rabbit'], ['souris', 'mouse'], ['grenouille', 'frog'], ['étoile', 'star'],
  ].map(([fr, en]) => ({ fr, en }));

  /* ---------- Le mot du jour ---------- */
  const MOTS_DU_JOUR = [
    ['gigantesque', 'très, très grand', 'La baleine bleue est gigantesque.'],
    ['minuscule', 'tout petit', 'La fourmi est minuscule.'],
    ['courageux', "qui n'a pas peur de faire quelque chose de difficile", 'Le pompier est courageux.'],
    ['curieux', 'qui veut tout savoir et tout découvrir', 'Le petit chat est curieux.'],
    ['délicieux', 'qui a très bon goût', 'Ce gâteau est délicieux.'],
    ['scintiller', 'briller par petites étincelles', 'Les étoiles scintillent la nuit.'],
    ['chuchoter', 'parler tout doucement', 'On chuchote à la bibliothèque.'],
    ['un explorateur', "quelqu'un qui part découvrir des endroits inconnus", "L'explorateur traverse la jungle."],
    ['rapide', 'qui va vite', 'Le guépard est très rapide.'],
    ['patient', 'qui sait attendre sans s\'énerver', 'Le pêcheur est patient.'],
    ['un volcan', 'une montagne qui peut cracher du feu et de la lave', 'Le volcan fume au loin.'],
    ['ronronner', 'faire le petit bruit du chat content', 'Le chat ronronne sur mes genoux.'],
    ['malicieux', 'qui aime faire des petites farces', 'Le singe malicieux vole une banane.'],
    ['un inventeur', "quelqu'un qui imagine et fabrique des choses nouvelles", 'Papa et toi, vous êtes les inventeurs de Shadow !'],
    ['étincelant', 'qui brille très fort', 'Le trésor est étincelant.'],
    ['grelotter', 'trembler parce qu\'on a froid', 'Sans manteau, je grelotte.'],
    ['un astronaute', "quelqu'un qui voyage dans l'espace", "L'astronaute flotte dans la fusée."],
    ['joyeux', 'qui est plein de joie', 'Les enfants sont joyeux à la fête.'],
    ['une galaxie', "un immense groupe d'étoiles", 'Notre galaxie s\'appelle la Voie lactée.'],
    ['un robot', 'une machine qui peut bouger, parler ou aider', 'Shadow est un robot gentil !'],
    ['la gratitude', 'le fait de dire merci et d\'être content de ce qu\'on a', 'Je montre ma gratitude en disant merci.'],
    ['bavard', 'qui parle beaucoup', 'Shadow est un robot bavard.'],
    ['une énigme', 'une question difficile, comme une devinette', 'Peux-tu résoudre cette énigme ?'],
    ['ruisseler', "couler comme un petit ruisseau", "L'eau ruisselle sur la vitre."],
    ['infatigable', 'qui ne se fatigue jamais', 'Le petit chien est infatigable.'],
    ['un fossile', 'une trace très ancienne d\'un animal ou d\'une plante, gardée dans la pierre', 'On a trouvé un fossile de dinosaure.'],
    ['farfelu', 'un peu bizarre et rigolo', "Quelle idée farfelue !"],
    ['émerveillé', 'très surpris et content devant quelque chose de beau', 'Je suis émerveillé par le feu d\'artifice.'],
    ['un archipel', "un groupe d'îles proches les unes des autres", 'Les pirates naviguent dans un archipel.'],
    ['lumineux', 'qui donne de la lumière', 'Les yeux de Shadow sont lumineux.'],
    ['une boussole', "un objet dont l'aiguille montre toujours le nord", "L'explorateur regarde sa boussole."],
    ['bondir', "sauter d'un coup, très fort", 'Le kangourou bondit dans la plaine.'],
    ['murmurer', 'parler tout bas, presque sans bruit', 'Le vent murmure dans les feuilles.'],
    ['un séisme', 'un tremblement de terre', 'Pendant un séisme, le sol bouge.'],
    ['généreux', 'qui aime donner et partager', 'Mon copain est généreux, il partage son goûter.'],
    ['nocturne', 'qui vit ou se passe la nuit', 'Le hibou est un oiseau nocturne.'],
    ['un télescope', 'un grand tube qui permet de voir les étoiles de près', 'Avec un télescope, on voit les cratères de la Lune.'],
    ['étonné', "surpris par quelque chose qu'on n'attendait pas", 'Je suis étonné : il neige en avril !'],
    ['un fennec', 'un petit renard du désert avec de très grandes oreilles', 'Le fennec dort le jour, à l\'abri de la chaleur.'],
    ['audacieux', 'qui ose faire des choses difficiles', "L'alpiniste audacieux grimpe la montagne."],
    ['une averse', 'une pluie forte qui ne dure pas longtemps', 'Une averse nous surprend au parc.'],
    ['habile', 'qui fait les choses avec adresse', 'Le jongleur est très habile.'],
    ['un écho', 'un son qui revient quand il rebondit sur une paroi', "Dans la grotte, il y a de l'écho !"],
    ['grimacer', 'faire une drôle de tête', 'Je grimace quand je mange un citron.'],
    ['un iceberg', 'une énorme montagne de glace qui flotte sur la mer', "L'iceberg est bien plus grand sous l'eau qu'au-dessus."],
    ['ravi', 'très content', 'Je suis ravi de te voir !'],
    ['une tornade', 'un vent qui tourne très vite, comme un tourbillon géant', 'La tornade soulève la poussière.'],
    ['têtu', "qui ne change pas d'avis", "L'âne est têtu, il ne veut pas avancer."],
    ['une constellation', "un groupe d'étoiles qui dessine une forme dans le ciel", 'La Grande Ourse est une constellation.'],
    ['se camoufler', 'se cacher en prenant les couleurs autour de soi', 'Le caméléon se camoufle sur la branche.'],
    ['fragile', 'qui se casse facilement', 'Attention, ce verre est fragile !'],
  ].map(([mot, def, ex]) => ({ mot, def, ex }));

  /* ---------- Cris d'animaux ---------- */
  const CRIS = [
    { cri: 'Meuh ! Meuuuuh !', a: 'la vache', r: ['vache', 'veau', 'taureau'] },
    { cri: 'Ouaf ! Ouaf ouaf !', a: 'le chien', r: ['chien', 'toutou'] },
    { cri: 'Miaou ! Miaaaou !', a: 'le chat', r: ['chat', 'chaton', 'minou'] },
    { cri: 'Cocoricooo !', a: 'le coq', r: ['coq', 'poule'] },
    { cri: 'Coin coin ! Coin coin !', a: 'le canard', r: ['canard'] },
    { cri: 'Bêêêê ! Bêêê !', a: 'le mouton', r: ['mouton', 'chevre', 'agneau', 'brebis'] },
    { cri: 'Groin groin !', a: 'le cochon', r: ['cochon', 'porc'] },
    { cri: 'Hi-han ! Hi-han !', a: "l'âne", r: ['ane', 'anes'] },
    { cri: 'Hiiiii ! Pfrrr !', a: 'le cheval', r: ['cheval', 'poney'] },
    { cri: 'Rrrrooaaar !', a: 'le lion', r: ['lion', 'tigre'] },
    { cri: 'Hou hou ! Hou hou !', a: 'le hibou', r: ['hibou', 'chouette'] },
    { cri: 'Croâ croâ !', a: 'la grenouille', r: ['grenouille', 'crapaud'] },
    { cri: 'Cot cot codec !', a: 'la poule', r: ['poule', 'coq'] },
    { cri: 'Hou hou hou ! Ah ah ah !', a: 'le singe', r: ['singe', 'gorille', 'chimpanze'] },
  ];

  /* ---------- Comptines traditionnelles (avec un air joué en bips) ---------- */
  const N = { C: 523, D: 587, E: 659, F: 698, G: 784, A: 880, B: 988, c: 1047, g: 392 };
  const tune = s => s.split(' ').map(x => [N[x[0]], x.length > 1 ? 0.5 : 0.28]);
  const COMPTINES = [
    { titre: 'Frère Jacques', lignes: [
      ['Frère Jacques, frère Jacques,', 'C D E C C D E C'],
      ['Dormez-vous ? Dormez-vous ?', 'E F G- E F G-'],
      ['Sonnez les matines, sonnez les matines,', 'G A G F E C G A G F E C'],
      ['Ding, dang, dong ! Ding, dang, dong !', 'C g C- C g C-'],
    ] },
    { titre: 'Au clair de la lune', lignes: [
      ['Au clair de la lune, mon ami Pierrot,', 'C C C D E- D- C E D D C-'],
      ['Prête-moi ta plume pour écrire un mot.', 'C C C D E- D- C E D D C-'],
      ['Ma chandelle est morte, je n’ai plus de feu.', 'D D D D A- A- D C B A G-'],
      ['Ouvre-moi ta porte, pour l’amour de Dieu.', 'C C C D E- D- C E D D C-'],
    ] },
    { titre: 'Une souris verte', lignes: [
      ["Une souris verte qui courait dans l'herbe,", 'E E E C D E F E D'],
      ['Je l’attrape par la queue, je la montre à ces messieurs.', 'D D D G F E D C D E C'],
      ['Ces messieurs me disent : trempez-la dans l’huile, trempez-la dans l’eau,', 'E F G G F E D C D E C'],
      ['Ça fera un escargot tout chaud !', 'G A G F E D C-'],
    ] },
  ].map(c => ({ titre: c.titre, lignes: c.lignes.map(([texte, air]) => ({ texte, air: tune(air) })) }));

  /* ---------- Histoires du soir (douces, pour s'endormir) ---------- */
  const HISTOIRES_SOIR = [
    "Il était une fois une petite étoile qui avait peur du noir. Chaque soir, la lune lui chantait une chanson tout doucement. Une nuit, la petite étoile comprit que c'était elle qui éclairait le ciel. Depuis, elle brille de tout son cœur, pour que les enfants fassent de beaux rêves. Bonne nuit…",
    "Dans une forêt tranquille vivait un ourson qui collectionnait les nuages. Le soir, il les rangeait dans une grande boîte en bois, un pour chaque rêve. Ce soir, il en choisit un tout doux, couleur de miel. Il le posa sous sa tête… et s'endormit en souriant. Bonne nuit…",
    "Un petit robot regardait la mer depuis la plage. Les vagues faisaient chhh, chhh, comme une respiration. Il compta les vagues : une, deux, trois… À la dixième, ses yeux se fermèrent tout doucement. Ses circuits rêvèrent de dauphins et d'étoiles. Bonne nuit…",
  ];

  /* ---------- Histoires immersives (la lampe joue avec : [effet] au début d'une phrase) ---------- */
  const HISTOIRES_LUMIERE = [
    "[nuit] Ce soir-là, un petit robot nommé Bip regardait le ciel depuis sa fenêtre. [etoiles] Une à une, les étoiles s'allumaient, comme si quelqu'un les réveillait doucement. Bip monta dans sa fusée en carton, qui n'était pas en carton du tout. [fusee] Trois, deux, un… décollage ! [nuit] Là-haut, tout était calme et bleu. [magie] Une étoile filante s'approcha et lui fit un clin d'œil brillant. Elle lui dit : « Chaque fois que tu fais un rêve, j'allume une nouvelle étoile. » [dodo] Alors Bip rentra tout doucement, se blottit sous sa couverture, et ferma les yeux pour allumer une étoile. Bonne nuit…",
    "[feu] Au bord d'un lac, un petit renard faisait griller une guimauve près d'un feu de camp. [mer] Les vagues du lac faisaient chhh, chhh, tout doucement. [orage] Au loin, très loin, un petit orage rigolo fit boum, comme un tambour qui éternue. Le renard éclata de rire : « Même pas peur, c'est le ciel qui joue de la musique ! » [nuit] Puis les nuages partirent, et la nuit redevint toute calme. [etoiles] Le ciel se remplit d'étoiles, comme des paillettes. [dodo] Le petit renard bâilla, se roula en boule près des braises chaudes, et s'endormit en souriant. Bonne nuit…",
  ];

  /* ---------- Le jeu des émotions ---------- */
  const EMOTIONS = [
    { k: 'happy', dis: 'une tête toute contente', bravo: 'Quel beau sourire !', moi: 'happy' },
    { k: 'surprised', dis: 'une tête très surprise', bravo: 'Oh ! Tu as l’air vraiment surpris !', moi: 'oops' },
    { k: 'sad', dis: 'une tête toute triste', bravo: 'Oh, comme tu as l’air triste… mais c’est pour de faux !', moi: 'sad' },
    { k: 'angry', dis: 'une tête en colère', bravo: 'Grrr ! Tu as l’air vraiment fâché !', moi: 'oops' },
  ];

  /* ---------- Jacques a dit (vérifié avec la caméra) ---------- */
  const JACQUES = [
    { dis: 'lève les deux bras !', test: 'bothUp' },
    { dis: 'lève un bras !', test: 'oneUp' },
    { dis: 'mets les mains sur la tête !', test: 'handsHead' },
    { dis: 'écarte les bras comme un avion !', test: 'armsWide' },
    { dis: 'mets les mains sur les épaules !', test: 'handsShoulders' },
  ];

  const pickDay = (list, salt = 0) => {
    const d = new Date();
    const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) + d.getFullYear() * 400 + salt;
    return list[day % list.length];
  };

  return { MOTS_CE1, TEXTES, ANGLAIS, MOTS_DU_JOUR, CRIS, COMPTINES, HISTOIRES_SOIR, HISTOIRES_LUMIERE, EMOTIONS, JACQUES, pickDay };
})();
