# Projet SHADOW — le cerveau (bêta)

Shadow, le robot inventé par un enfant et son papa. **Juste un visage** (d'après le dessin de l'enfant) : on lui parle à voix haute, il répond à voix haute.
Étape 3 du planning : « Créer le cerveau → bêta test ».

## Démarrer
1. Ouvrir l'appli (dans Chrome de préférence), écrire le prénom de l'inventeur.
2. **Toucher le visage** une fois : le navigateur demande l'autorisation du micro et de la caméra. Il faut dire oui.
3. Papa : roue ⚙️ en bas à droite (presque invisible), puis le calcul secret. Coller la **clé Groq** (`gsk_…`) : elle sert au cerveau ET aux oreilles. Elle reste sur l'appareil.

## Comment on lui parle
- Quand il écoute, sa crête bleue clignote. Quand il réfléchit, elle devient violette.
- Quand il attend, il ne répond que si on l'appelle : **« Shadow ! »** (toucher son visage marche aussi).
- Il se réveille aussi tout seul quand il voit quelqu'un.

| On dit… | Shadow… |
|---|---|
| « On écrit dans mon journal » | demande la phrase, puis fait épeler chaque mot à voix haute (« bé, a, té… »). Il donne UN indice sans jamais dire la réponse. Quand c'est juste : **VALIDÉ !**, et l'enfant écrit le mot en majuscules d'imprimerie dans son vrai journal. |
| « On fait des devinettes » / « du calcul » / « un quiz sur l'espace » | joue, explique, compte les points |
| « Chasse aux objets » | « Va me chercher un livre ! », puis il le reconnaît avec la caméra |
| « Qu'est-ce que tu vois ? » / « Tu me reconnais ? » | regarde avec la caméra |
| « On fait connaissance » | apprend un visage et le prénom qui va avec |
| « Raconte une histoire », « Devine l'animal », ou n'importe quelle question | discute avec le grand cerveau (Groq) |
| « Stop » / « Répète » / « Va dormir » | arrête / répète / s'endort |

## Mode verrouillé (pour que l'enfant ne sorte pas de Shadow)
⚙️ → « Verrouiller Shadow ». Avec ce mode :
- la roue ⚙️ disparaît. Pour revenir aux réglages : **rester appuyé 3 secondes dans le coin en haut à gauche**, puis le calcul secret ;
- le plein écran est forcé, le bouton retour d'Android est bloqué et le zoom au doigt est désactivé.

Une page web ne peut pas bloquer le bouton d'accueil. Pour verrouiller complètement la tablette :
- **Android** : Paramètres → Sécurité → *Épinglage d'application*, puis épingler Chrome ou l'appli Shadow ;
- **iPad** : Réglages → Accessibilité → *Accès guidé*, puis triple-clic sur le bouton latéral dans Shadow.

## Sur tous les écrans
Le visage prend la plus grande taille possible, que l'écran soit vertical ou horizontal (téléphone, tablette, ordinateur). Sur tablette, on peut l'installer comme une appli : menu de Chrome → *Ajouter à l'écran d'accueil*.

## Ce que la fiche « Le cerveau » est devenue
- **Gentil, bienveillant, bavard, sociable** : sa personnalité, dans `cerveau.js`.
- **Enseigner** : le journal et l'orthographe (`orthographe.js`), les quiz avec une petite leçon, le calcul (`jeux.js`).
- **Aime jouer** : devinettes, calcul, quiz, chasse aux objets, histoires.
- **IA poussée → WiFi** : Groq. **IA locale** : le mini-cerveau intégré marche sans Internet (épellation, jeux, vision). Il y a aussi l'option Ollama.
- **Protection des données** : tout reste sur l'appareil. Les adresses, téléphones et e-mails sont masqués avant l'envoi au cerveau. Pour les visages, Shadow garde une empreinte en chiffres, jamais de photo. La vision se calcule sur l'appareil.
- **Éthique, adapté à un enfant** : règles strictes, filtre sur les réponses, pause conseillée (30 min par défaut), coin réservé à papa.

## Ce qui part sur Internet (à savoir)
- **Oreilles « Whisper »** (par défaut avec une clé) : Shadow détecte lui-même quand quelqu'un parle et n'envoie à Groq que ce morceau de voix. Il n'y a pas de bip. Quand il attend son nom, tout ce qui est dit près de lui est envoyé (la télé aussi). Pour l'éviter : mettre « Chrome » dans les réglages (dans ce cas, le son part chez Google).
- **Discussion** : les phrases partent chez Groq.
- **Vision détaillée** : désactivée par défaut. Si papa l'active, une photo part chez Groq quand on demande « qu'est-ce que tu vois ? ».

## IA locale (Ollama), pour plus tard sur l'ordi ou le Raspberry Pi
1. Installer Ollama, puis par exemple `ollama pull qwen3:4b`.
2. Autoriser l'appli : lancer Ollama avec `OLLAMA_ORIGINS=*`.
3. Réglages → Cerveau → IA locale, adresse `http://localhost:11434/v1`.

Attention : depuis une tablette, `localhost` désigne la tablette, pas l'ordi. Ce mode marche quand l'appli tourne sur la machine qui héberge Ollama.

## Plus tard : le corps et la maison
`corps.js` contient les fonctions `bouger()` et `maison()`, encore vides. On les branchera sur les moteurs (par exemple une carte ESP32 en WiFi) et sur la maison (par exemple Home Assistant) sans toucher au reste du cerveau.

## Fichiers
`index.html` (le visage) · `app.js` (la conversation) · `oreilles.js` · `vision.js` · `cerveau.js` · `orthographe.js` · `jeux.js` · `corps.js` · `sw.js` (hors-ligne).
Pas de compilation : ce sont des fichiers statiques. Après chaque modification, changer `CACHE` dans `sw.js`.
