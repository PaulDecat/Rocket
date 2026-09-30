# 🚀 Rocket — votre morning économique

Chaque matin, **Nova** (présentatrice) et **Atlas** (co-animateur) vous lisent un point économique sous forme de
podcast : Bourses européennes, Wall Street, Asie, taux et devises, matières premières, radar investissement et
actualité. Des graphiques s'affichent en même temps que la parole.

Vous pouvez aussi **parler à Nova** : dites « **OK Nova** » puis votre question (« comment va le bitcoin ? »,
« montre-moi le CDS à 5 ans de la France », « mets du jazz »…).

---

## 1. Installer (une seule fois)

1. **Installez Node.js** : allez sur <https://nodejs.org>, cliquez sur le gros bouton **LTS**, puis installez le
   fichier téléchargé (suivant, suivant, terminer).
2. **Ouvrez le Terminal** (sur Mac : touches `Cmd + Espace`, tapez « Terminal », Entrée).
3. Tapez `cd ` (avec un espace après), puis **glissez le dossier Rocket** dans la fenêtre du Terminal, et appuyez sur Entrée.
4. Tapez la commande suivante puis Entrée (elle télécharge ce dont Rocket a besoin, ça prend une minute) :

   ```
   npm install
   ```

## 2. Lancer Rocket (chaque matin)

1. Dans le Terminal (dans le dossier Rocket, voir étape 3 ci-dessus), tapez :

   ```
   npm start
   ```

2. Ouvrez **Chrome** (ou Edge) à l'adresse <http://localhost:3000>.
3. Choisissez votre style, puis cliquez sur **▶ Lancer le morning**.

Pour **arrêter** Rocket : revenez dans le Terminal et appuyez sur `Ctrl + C`.

Pour **mettre à jour** Rocket : remplacez le dossier par la nouvelle version, puis refaites `npm install`.

### Raccourcis

| Touche | Action |
|---|---|
| Espace | lecture / pause |
| ← → | réplique précédente / suivante |
| / | écrire une question à Nova |
| Échap | fermer la fiche d'un marché |

---

## 3. Donner un « cerveau » à Nova avec Claude (recommandé)

Sans Claude, Nova répond déjà aux questions simples sur les marchés du jour. Avec Claude, elle peut
**chercher sur le web** (CDS, inflation, taux de la BCE, une entreprise…) et afficher le graphique qui va avec.

Si vous avez un abonnement Claude, Rocket utilise **Claude Code**, sans frais supplémentaires :

1. Dans le Terminal, tapez :

   ```
   npm install -g @anthropic-ai/claude-code
   ```

   Sur Mac, si un message contient « EACCES », tapez plutôt `sudo npm install -g @anthropic-ai/claude-code`
   (votre mot de passe de session vous est demandé ; rien ne s'affiche quand vous le tapez, c'est normal).
2. Tapez `claude`, puis suivez les instructions pour vous connecter à votre compte Claude.
3. Une fois connecté, tapez `/exit`.
4. Relancez Rocket (`Ctrl + C` puis `npm start`). Le Terminal affiche alors : **Réponses : Claude via Claude Code**.

Autre possibilité : une **clé API** Anthropic (facturée à l'usage). Copiez le fichier `.env.example` en `.env`
et renseignez `ANTHROPIC_API_KEY=...`.

---

## 4. Les voix

- Par défaut, Rocket utilise les **voix neuronales de Microsoft**, gratuites et très naturelles
  (il faut une connexion Internet). Dans les réglages ⚙, vous pouvez choisir la voix de Nova et celle d'Atlas,
  la vitesse, ou garder **Nova seule**.
- Si ces voix ne répondent pas, Rocket passe tout seul sur les **voix de votre navigateur**. Sur Mac, les voix
  « Premium » sont bien meilleures : Réglages Système → Accessibilité → Contenu énoncé → Voix du système →
  Gérer les voix → Français → téléchargez par exemple « Audrey (Premium) » et « Thomas (Premium) ».
- Option payante : **ElevenLabs** (voir `.env.example`).

## 5. « OK Nova »

- Fonctionne dans **Chrome** ou **Edge** (pas dans Firefox : utilisez alors la barre de question).
- Au premier lancement, le navigateur demande l'accès au **micro** : cliquez sur **Autoriser**.
- Le bouton **OK NOVA ON/OFF** active ou coupe l'écoute.
- Dites « OK Nova » : un bip retentit, posez votre question. Ou tout d'un coup : « OK Nova, comment va le CAC 40 ? ».
- Pendant que Nova parle, dites « OK Nova » pour l'interrompre.
- Après une réponse, Nova vous réécoute quelques secondes : vous pouvez enchaîner sans redire « OK Nova ».
- Le micro ne fonctionne qu'à l'adresse `localhost` ou en `https` (règle des navigateurs).

Exemples : « stop », « reprends le briefing », « suivant », « quel est le gros coup du jour ? »,
« quelles sont les actus ? », « montre-moi le CDS à 5 ans de la France ».

## 6. La musique (Deezer)

Dites par exemple : « mets Gims », « joue la chanson Bella de Gims », « lance l'album Civilisation d'Orelsan »,
« mets la playlist Chill », « mets du jazz », « mets de la musique », « coupe la musique », « reprends la musique ».

- Sur Mac, la musique se lance dans **l'appli Deezer** de l'ordinateur (morceaux complets, votre compte).
  Sinon, un **lecteur intégré** s'affiche (souvent limité à des extraits de 30 secondes).
- **Vos playlists** (« mets ma playlist Sport », « mets mes coups de cœur », « quelles sont mes playlists ») :
  dans Deezer, ouvrez votre profil → **Partager** → **Copier le lien**, puis collez-le dans ⚙ → Profil Deezer →
  **Vérifier**. Votre profil et vos playlists doivent être **publics**.

## 7. Sur votre téléphone

- **À la maison** : quand Rocket tourne sur l'ordinateur, le Terminal affiche une adresse « Sur le Wi-Fi »
  (par exemple `http://192.168.1.20:3000`). Ouvrez-la sur le téléphone connecté au même Wi-Fi.
  Par sécurité, les questions à Nova et la musique restent réservées à l'ordinateur.
- **Partout** : déployez Rocket gratuitement sur [Render](https://render.com) (New → Blueprint → votre dépôt ;
  le fichier `render.yaml` est prêt). Ajoutez `ANTHROPIC_API_KEY` si vous voulez Claude. Attention : toute
  personne qui connaît l'adresse peut alors poser des questions (facturées sur votre clé) ; ne la partagez pas.
  Sur le téléphone, ouvrez l'adresse dans Safari → Partager → **Sur l'écran d'accueil** : Rocket s'ouvre alors
  comme une application.

## 8. En cas de problème

| Problème | Solution |
|---|---|
| « EADDRINUSE » au lancement | Rocket tourne déjà. Fermez l'autre fenêtre, ou tapez `lsof -ti :3000 \| xargs kill` puis relancez. |
| Pastille rouge **DÉMO** | Les sources (Yahoo Finance, flux d'actualités) sont injoignables : Rocket affiche des données de démonstration. Vérifiez Internet puis cliquez sur ⟳. |
| Pastille orange **PARTIEL** | Une partie des sources ne répond pas ; le reste est en direct. |
| Nova n'entend rien | Autorisez le micro (icône du cadenas dans la barre d'adresse), utilisez Chrome, vérifiez que OK NOVA est sur ON. |
| Pas de son | Cliquez d'abord sur « Lancer le morning » (les navigateurs exigent un clic), vérifiez le volume. |
| Nova ne sait pas répondre aux questions web | Installez Claude Code (partie 3). Le Terminal doit afficher « Réponses : Claude via Claude Code ». |

---

## Pour les curieux

- `npm test` lance les tests (les tests de bout en bout utilisent Playwright s'il est installé).
- Structure : `server.js` (serveur), `lib/` (données, indicateurs, script du podcast, Nova, voix, musique),
  `public/` (interface).
- Les signaux du radar sont des indicateurs techniques automatiques à visée pédagogique, **pas des conseils
  en investissement personnalisés**.
