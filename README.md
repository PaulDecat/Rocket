# 🚀 Rocket v6 — votre assistant personnel

Rocket répond à **toutes vos questions**, à la voix. Et quand vous le lui demandez, il vous lit un point complet : Bourses, taux et devises, matières premières, radar
investissement, actualité économique et politique, votre agenda du jour, une idée de recette et un conseil
bien-être. Des graphiques s'affichent pendant qu'il parle.

Rocket a aussi des onglets **Cuisine**, **Ciné**, **Coach hygiène de vie** et **Planning**, et vous pouvez
**lui parler**.

> Anciennes versions :
> v1 (Nova et Atlas) <https://github.com/PaulDecat/Rocket/archive/2ccb6165a41820e973bcd36aa1c50007151c37de.zip> ·
> v2 <https://github.com/PaulDecat/Rocket/archive/640944de63e88e35ca1c1138c063e504ddbdcd4b.zip> ·
> v5 <https://github.com/PaulDecat/Rocket/archive/3bf49c6d9ff91fc43f944da474c8e32c2e0efe45.zip> ·
> v4 <https://github.com/PaulDecat/Rocket/archive/3918e77b2443a52b758a2cb2b61d3c6ab35eed48.zip> ·
> v3 <https://github.com/PaulDecat/Rocket/archive/ef08f62621873e912bee1cfe21348f41bee582d3.zip>

---

## 1. Installer (une seule fois)

1. Installez **Node.js** : <https://nodejs.org>, gros bouton **LTS**, puis suivant, suivant, terminer.
2. Ouvrez un terminal **dans le dossier Rocket** :
   - **Windows** : ouvrez le dossier Rocket, cliquez dans la barre d'adresse en haut, tapez `cmd`, Entrée.
   - **Mac** : Terminal, tapez `cd ` (avec un espace), glissez le dossier Rocket dans la fenêtre, Entrée.
3. Tapez `npm install` puis Entrée (une minute environ).

## 2. Lancer Rocket

- **Windows** : double-cliquez sur **`Lancer Rocket.bat`**. Dès que Rocket est prêt, il s'ouvre tout seul
  dans **Chrome** (ou **Edge** si Chrome n'est pas installé), les navigateurs où le micro est le plus rapide.
- **Autre méthode** : dans le terminal du dossier, tapez `npm start`, puis ouvrez **Chrome** ou **Edge** à
  l'adresse <http://localhost:3000>.

Choisissez votre style, puis cliquez sur **🚀 Démarrer Rocket**. La matinale **ne se lance pas toute seule** :
dites « Ok Rocket, lance la matinale, s'il te plaît » (ou appuyez sur ▶). Pour arrêter : fermez la fenêtre noire,
ou appuyez sur `Ctrl + C` dedans.

---

## 3. Parler à Rocket

**La règle : Rocket n'exécute une demande que si la phrase commence par « Ok Rocket » et se termine par
« s'il te plaît ».**

> « **Ok Rocket**, comment va le CAC 40, **s'il te plaît** »

Sinon, il ne fait rien (un rappel de la règle s'affiche sous les sous-titres). Si la phrase respecte la
règle mais qu'il ne comprend pas la demande, il répond : « **Désolé Monsieur, je n'ai pas compris.** »
La règle vaut aussi pour la barre de texte.

### Les deux boutons

| Bouton | Ce qu'il fait |
|---|---|
| 🎙 **PARLER** | Appuyez une fois : il devient **rouge**, Rocket écoute votre demande. Il revient à son état initial après la demande. Réappuyez pour annuler. |
| 🔓 **MAINTENIR** | Appuyez : il devient **orange** 🔒 et garde **PARLER enfoncé** : Rocket écoute en continu. Réappuyez sur MAINTENIR : PARLER retrouve son état initial. |

### Pour être bien compris (nouveau dans la v6)

- **Le meilleur micro sur l'ordinateur : la dictée Windows.** Cliquez dans la barre de texte (ou sur le bouton
  **⊞H**), appuyez sur les touches **Windows + H** et parlez : « Ok Rocket, …, s'il te plaît ». C'est la
  reconnaissance de Microsoft, très précise ; la demande part toute seule dès que la phrase est complète.
- Rocket tolère les déformations courantes : « Rocket » seul en début de phrase (le « Ok » est souvent avalé),
  « roquette », « rock et », « okay », « s'il vous plaît », « stp », « sil te plait »…
- Quand une phrase n'est pas exécutée, Rocket affiche **ce qu'il a entendu**, pour que vous voyiez le problème.
- Claude sait que la phrase vient de la reconnaissance vocale : il devine le sens même avec des fautes.
- Opera GX, Brave, Firefox : le moteur local passe en mode **« précis »** (Whisper small, ~250 Mo, bien meilleur
  en français) quand la carte graphique le permet. Réglage dans ⚙ → « Précision du moteur local ».

### 📱 « Dis Siri, Rocket » sur l'iPhone (nouveau dans la v6)

Siri ne peut pas être copié ni renommé (il appartient à Apple et ne fonctionne que dans l'iPhone). Mais un
**raccourci iPhone nommé « Rocket »** fait presque pareil : Siri (la reconnaissance d'Apple) écoute votre
question, l'envoie à Rocket, et l'iPhone lit la réponse. Il faut que l'iPhone soit sur le **même Wi-Fi** que
l'ordinateur, et Rocket allumé.

1. Sur l'ordinateur : ⚙ → **iPhone : « Dis Siri, Rocket »**. Notez l'**adresse** et la **clé** affichées.
2. Sur l'iPhone : app **Raccourcis** → **+** → nommez le raccourci **Rocket**.
3. Ajoutez **Dicter le texte** (langue : Français).
4. Ajoutez **Obtenir le contenu de l'URL** : l'adresse notée, méthode **POST**, en-tête **X-Rocket-Key** = la
   clé, corps **JSON** avec le champ **question** = *Texte dicté*.
5. Ajoutez **Énoncer le texte** (*Contenu de l'URL*).
6. Dites « **Dis Siri, Rocket** », puis votre question. Pas besoin de « Ok Rocket » ni de « s'il te plaît ».

Les ajouts au planning et au coach faits depuis l'iPhone apparaissent sur l'ordinateur quelques secondes plus
tard. Au premier lancement, Windows peut demander d'autoriser Node.js sur le réseau : acceptez (réseau privé).
Si l'adresse de l'ordinateur change (box redémarrée), mettez-la à jour dans le raccourci.

### Le micro (nouveau dans la v3)

- Au premier appui, le navigateur demande l'accès au micro : cliquez sur **Autoriser**.
- Quand PARLER est rouge, une **barre blanche** en bas du bouton bouge avec votre voix : c'est la preuve que
  le micro vous entend.
- **Chrome et Edge** utilisent leur propre reconnaissance vocale (rapide).
- **Opera, Opera GX, Brave, Firefox…** n'ont pas de reconnaissance vocale qui fonctionne. Rocket utilise alors
  son **moteur vocal local** (Whisper), qui tourne directement dans le navigateur. La **première fois**, il
  télécharge environ **80 Mo** (une barre de progression s'affiche), ensuite c'est instantané. Comptez 1 à 3
  secondes de transcription par phrase.
- Si le navigateur ne renvoie aucun texte, Rocket bascule tout seul sur le moteur local, sans que vous ayez à
  répéter. Vous pouvez aussi choisir le moteur dans ⚙ → **Reconnaissance vocale**.

- Rocket comprend aussi « Ok **roquette** » : la reconnaissance vocale écrit souvent « roquette », il sait que
  c'est lui (« une salade de roquette » reste une salade).
- **Plusieurs questions** : après chaque réponse à une demande vocale, PARLER redevient rouge quelques secondes
  pour la question suivante. Vous pouvez aussi poser plusieurs questions d'un coup : « Ok Rocket, quelle heure
  est-il et quel temps fait-il à Lyon, s'il te plaît ».

### Exemples (toujours avec « Ok Rocket … s'il te plaît »)

- **Toutes vos questions** (avec Claude, voir partie 5) : « pourquoi le ciel est bleu », « explique-moi la
  photosynthèse », « traduis bonjour en japonais », « qui a gagné la Coupe du monde 2018 »
- **Sans Claude** : « quelle heure est-il », « quel jour sommes-nous », « combien font 15 pour cent de 80 »,
  « quel temps fait-il à Lyon demain », « qui est Victor Hugo », « c'est quoi la photosynthèse », « raconte une blague »
- **Matinale** : « lance la matinale », « reprends la matinale », « suivant », « stop »
- **Marchés** : « comment va le bitcoin », « quel est le gros coup du jour », « montre-moi le CDS à 5 ans de la France »
- **Onglets** : « ouvre la cuisine », « affiche le planning », « affiche la politique », « affiche la bourse »
- **Planning** : « ajoute dentiste demain à 15 heures », « note réunion avec Paul lundi à 9 heures 30 »,
  « qu'est-ce que j'ai demain », « mon agenda de la semaine », « supprime le dentiste »
- **Coach** : « j'ai bu deux verres d'eau », « j'ai marché », « j'ai mangé une pomme », « mon bilan », « donne-moi un conseil »
- **Cuisine** : « une recette avec des courgettes », « la recette du jour en entier », « une autre recette »
- **Ciné / politique** : « les sorties ciné », « l'actu politique »
- **Musique** : « mets du jazz », « mets ma playlist Sport », « coupe la musique »

---

## 4. Les onglets

| Onglet | Contenu |
|---|---|
| 📈 **Briefing** | Le morning en podcast, avec graphiques synchronisés. |
| ◎ **Radar** | Opportunités, tendances fortes et points de vigilance (signaux techniques, pas des conseils personnalisés). |
| 🍳 **Cuisine** | Recette du jour (de saison), ingrédients, étapes, « Lire la recette », « Autre idée ». |
| 🎬 **Ciné** | Les dernières actualités du cinéma. |
| 💪 **Coach** | 6 habitudes du jour (eau, marche, fruits et légumes, respiration, écrans, coucher) et un conseil bien-être. Remise à zéro chaque jour. |
| 📅 **Planning** | Vos rendez-vous. Rocket vous les rappelle **à voix haute** à l'heure prévue (laissez la page ouverte). Le nombre de rendez-vous du jour s'affiche sur l'onglet. |

À gauche, les **mini-onglets Bourse / Politique** affichent les indicateurs de marché ou les titres politiques.
Ils se mettent à jour automatiquement toutes les 10 minutes (pastille verte).

Votre planning et vos habitudes restent **dans votre navigateur** (rien n'est envoyé sur Internet).

---

## 5. Pour que Rocket réponde à tout : Claude (fortement recommandé)

Sans Claude, Rocket gère les marchés, l'heure, la date, les calculs, la météo, les définitions et
personnalités (Wikipédia) et les commandes de l'appli. **Pour répondre à n'importe quelle question**
(sciences, histoire, conseils, traductions, actualité…), il a besoin de Claude :

1. Dans un terminal : `npm install -g @anthropic-ai/claude-code` (sur Mac, ajoutez `sudo` devant si « EACCES »).
2. Tapez `claude`, connectez-vous à votre compte, puis tapez `/exit`.
3. Relancez Rocket : le terminal affiche **Réponses : Claude via Claude Code**.

Autre possibilité : une clé API Anthropic dans un fichier `.env` (voir `.env.example`).

## 6. Rapidité (nouveau dans la v5)

- Rocket **commence à parler dès la première phrase** de sa réponse, pendant que Claude écrit la suite
  (environ 2 secondes au lieu d'attendre la réponse entière).
- La voix est préparée **phrase par phrase** : la phrase suivante est prête pendant qu'il dit la précédente.
- Les cours de Bourse sont rafraîchis **en arrière-plan** : une question n'attend jamais leur rechargement.
- Opera GX, Brave, Firefox : le moteur vocal local est **préparé dès le démarrage**, et la fin de votre phrase
  est détectée plus vite.
- Claude utilise un réglage rapide, adapté à la voix. Pour des réponses plus approfondies (mais plus lentes),
  voir `ROCKET_CLAUDE_MODEL` et `ROCKET_CLAUDE_EFFORT` dans `.env.example`.

## 7. Voix, musique, téléphone

- **Météo** : indiquez votre ville dans ⚙ → « Votre ville » (Paris par défaut).
- **Voix** : voix Microsoft gratuites (Internet nécessaire), sinon voix du navigateur. Réglages ⚙ : voix de
  Rocket et vitesse.
- **Musique Deezer** : sur Mac dans l'appli Deezer ; sur Windows dans le lecteur intégré (souvent des extraits
  de 30 secondes). Vos playlists : collez le lien de votre profil Deezer dans ⚙ (profil et playlists publics).
- **Téléphone** : le terminal affiche une adresse « Sur le Wi-Fi » à ouvrir sur le téléphone (même Wi-Fi).
  Par sécurité, les demandes à Rocket restent réservées à l'ordinateur. Pour l'utiliser partout : déploiement
  sur [Render](https://render.com) avec le fichier `render.yaml`.

## 8. En cas de problème

| Problème | Solution |
|---|---|
| Rocket ne réagit pas | Commencez par « Ok Rocket » et terminez par « s'il te plaît ». |
| « EADDRINUSE » | Rocket tourne déjà : fermez l'autre fenêtre (Mac : `lsof -ti :3000 \| xargs kill`). |
| `npm` n'est pas reconnu | Installez Node.js, puis fermez et rouvrez le terminal. |
| Pastille **DÉMO** | Sources injoignables : données de démonstration. Vérifiez Internet puis cliquez sur ⟳. |
| PARLER est rouge mais la barre blanche ne bouge pas | Le micro ne capte rien : vérifiez qu'il est branché, choisi par Windows (Paramètres → Son → Entrée), et autorisé dans le navigateur (icône du cadenas dans la barre d'adresse). |
| La barre bouge mais rien ne s'écrit | Patientez la première fois (téléchargement du moteur local). Sinon, ⚙ → Reconnaissance vocale → « Moteur local ». |
| « Le micro est déjà utilisé » | Fermez Discord, Teams ou toute appli qui utilise le micro. |
| Pas de son | Cliquez d'abord sur « Lancer le morning » (les navigateurs exigent un clic). |

---

`npm test` lance les tests automatiques (Playwright facultatif pour les tests dans le navigateur).
