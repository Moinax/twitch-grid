# Twitch grid

Plusieurs streams Twitch sur un seul écran, avec une grille réorganisable, un stream en spotlight et des réglages audio par tuile.

Site : https://twitch.moinax.com

## Réglages et grilles

La roue dentée ouvre les réglages de langue, français, anglais ou néerlandais, et de thème, système, clair ou sombre. Ces préférences sont communes aux modes connecté et sans compte, enregistrées dans le navigateur et appliquées sans recharger les vidéos. Le thème système suit les changements du système d’exploitation. Les lecteurs et le chat intégrés restent des interfaces Twitch ; leur langue dépend de Twitch.

Le bouton au-dessus de la recherche ouvre les grilles nommées. Chaque mode conserve sa propre collection et sa dernière grille active. L’ancienne grille devient automatiquement la grille par défaut. Chaque modification est enregistrée dans la grille active, y compris les tuiles, leur ordre, le son, les pauses, le spotlight et le chat.

« Enregistrer sous… » crée une copie avec un nom sans interrompre les lecteurs. « Grille vierge » crée une nouvelle grille vide. La liste permet d’ouvrir, renommer ou supprimer une grille. La suppression demande confirmation ; supprimer la dernière grille recrée une grille par défaut vide. Les favoris restent indépendants des grilles.

Le menu d’une collaboration propose aussi de créer une grille nommée avec ses participants en direct. La grille précédente reste enregistrée. Tous les participants en direct s’affichent à égalité dans une grille simple, sans spotlight ; seul le streamer d’origine a le son. Les réglages et les grilles restent accessibles par leurs icônes lorsque la sidebar est repliée. Repliée, la sidebar empile ses actions par groupes : replier, puis grilles et verrou, puis pause et son, le rail d’avatars au centre, et le compte Twitch avec GitHub en bas. Le rail garde la liste sous forme d’avatars : fond violet pour les chaînes déjà dans la grille, avatar estompé hors ligne. Le survol affiche l’aperçu et le nom, le clic ajoute ou retire la tuile.

## Page d’accueil

Une page de présentation couvre toute la fenêtre, sans la sidebar, tant que le visiteur n’a ni session Twitch, ni favori, ni tuile ouverte. Elle décrit chaque fonction, propose « Connecter Twitch » comme action principale et « Continuer sans compte » pour ouvrir la sidebar avec le focus sur la recherche. Ce second choix est retenu pour l’onglet en cours seulement, jamais dans le stockage local : un nouvel onglet retrouve la page tant que rien n’a été ajouté. Le sélecteur de langue de la barre utilise les mêmes préférences que les réglages de l’application ; le thème suit le réglage enregistré ou le système.

## Ta liste de streamers

Tant qu’aucune tuile n’est ouverte, même avec des favoris, la grille affiche un panneau de démarrage en trois étapes : trouver une chaîne, l’ajouter, la passer en spotlight. « Rechercher un streamer » ouvre la sidebar et met le focus sur la recherche. Sans compte, un lien « Connecter Twitch » reste disponible, et « Revoir la présentation » rouvre la page d’accueil, même avec des favoris. L’icône Twitch de la sidebar reste accessible ; une icône de déconnexion la remplace quand un compte est connecté.

Sans connexion, cherche un streamer par pseudo ou lien Twitch directement dans la sidebar. Les résultats affichent son avatar, sa catégorie et son statut au moment de la recherche. L’étoile ajoute la chaîne aux favoris de ce navigateur. Si la recherche est indisponible, l’ajout direct par pseudo reste possible.

Le statut des favoris est vérifié au chargement, puis toutes les 30 secondes tant que la page est visible. Le serveur garde les réponses en cache une minute. Une chaîne hors ligne apparaît grisée, même si elle n’a pas diffusé depuis longtemps. Quand un stream ouvert dans la grille se termine, sa tuile attend une minute puis disparaît, avec un message dans la sidebar, sauf si elle est en spotlight ou si la grille est verrouillée. Le retour en direct pendant cette minute annule le retrait. Une chaîne ajoutée alors qu’elle était déjà hors ligne reste en place et attend son direct.

Avec « Connecter Twitch », retrouve tes follows et cherche des streamers directement dans la sidebar. Les chaînes en direct passent en premier. Les statuts se rafraîchissent toutes les 30 secondes et les follows environ toutes les minutes, tant que la page est visible. La connexion remplace les favoris par les follows. Il n’y a plus d’onglet ni de bouton de favoris dans ce mode. Les favoris locaux réapparaissent à la déconnexion.

Chaque mode conserve sa grille dans le stockage local du navigateur : tuiles, ordre, spotlight, pause, volume et réglages du son. Se connecter sauvegarde la grille sans compte et restaure la grille du mode connecté. Se déconnecter fait l’inverse. Si le mode choisi n’a pas encore de grille, l’accueil s’affiche. Les favoris locaux restent enregistrés.

Quand une chaîne suivie ou un favori passe de hors ligne à en direct, une notification apparaît dans la page. Clique dessus pour ajouter le stream à la grille et le passer en spotlight avec le son. Une croix permet de fermer la notification. Les streams déjà en direct au chargement ne déclenchent pas de notification. La détection utilise l’actualisation existante toutes les 30 secondes lorsque la page est visible ; le cache du mode sans compte peut retarder l’annonce d’une minute. Les notifications disparaissent si la chaîne repasse hors ligne, quitte ta liste ou si tu te déconnectes.

Le compte connecté est celui de chaque visiteur. Les follows ne sont pas publiés pour les autres utilisateurs. La session Twitch reste dans l’onglet et disparaît à sa fermeture. Si elle expire, reconnecte-toi. La sidebar revient alors aux favoris locaux.

Une petite icône de groupe signale les collaborations dans la sidebar et le header des tuiles. Dans le header, elle ouvre la liste des participants avec leurs avatars et les boutons Ajouter et Tout ajouter. Seuls les participants en direct absents de la grille sont ajoutés. Les nouveaux lecteurs démarrent sans son ; le spotlight, les sons et les pauses existants sont conservés. Une tuile seule reste en spotlight quand ses partenaires sont ajoutés.

La détection utilise les sessions de chat partagé de Twitch, sans ouvrir le chat dans la grille. Elle fonctionne avec ou sans connexion et ne détecte pas les collaborations qui n’utilisent pas cette fonction Twitch. Les résultats sont conservés une minute et revérifiés lors des actualisations. Le mode sans compte utilise les mêmes identifiants serveur que la recherche. Si la détection est indisponible, les icônes sont masquées jusqu’à une actualisation réussie.

## Vue spotlight

Une tuile seule affiche directement le lecteur Twitch complet et occupe toute la grille. Cliquer dessus ne change pas de vue. Dès la deuxième tuile, la grille retrouve ses commandes simplifiées et chaque stream peut passer en spotlight. Revenir à une seule tuile rétablit le lecteur complet.

Clique une tuile pour afficher le lecteur Twitch complet, avec ses réglages de qualité, son volume, sa pause et son plein écran. Le bouton « Spotlight » de la barre fait la même chose et ramène à la grille. Les autres tuiles reçoivent aussi le lecteur complet dès que leur vidéo fait au moins 640 pixels de large, et leur chat quand la tuile fait 640 pixels ou laisse 420 pixels libres sous la vidéo ; elles les gardent jusqu’à 560 pixels, pour qu’une fenêtre proche de la limite ne fasse pas clignoter les lecteurs. Un changement dû à la taille attend 300 millisecondes après la fin du redimensionnement. Les petites tuiles gardent les commandes simplifiées. Les changements de volume, de son et de pause faits dans le lecteur sont conservés au retour à la grille.

Le bouton son de chaque tuile tourne entre trois états : muet, allumé et épinglé. Une tuile allumée se tait quand le spotlight change ; une tuile épinglée garde son son quoi qu’il arrive, jusqu’à ce que tu le coupes. Passer en spotlight allume la tuile et coupe celles qui étaient seulement allumées. Le bouton son du lecteur Twitch compte comme muet ou allumé, jamais épinglé. Le glisser des barres réordonne la grille ; déposer une tuile sur le spotlight lui prend la place, l’ancienne retourne dans la grille à sa position. Les libellés des boutons s’affichent dans une infobulle au survol ou au focus clavier.

Twitch accepte l’option des contrôles à la création du lecteur. Le passage entre les deux vues recrée donc les lecteurs des tuiles qui changent de mode. Les autres streams continuent à jouer.

Le bouton d’agrandissement de la barre étend le stream à toute la fenêtre du navigateur. Les onglets et la barre d’adresse restent visibles. Un second clic restaure la disposition précédente, sans recréer le lecteur ni changer ses réglages audio. Échap permet aussi de revenir lorsque le clavier est actif dans la page.

Après un rechargement, si la grille doit jouer avec du son, un overlay flouté couvre la page. Un clic n’importe où ou une touche réactive les sons prévus par la grille et ferme l’overlay. Les tuiles muettes, les volumes et les pauses restent tels qu’ils étaient enregistrés. L’overlay ne revient plus pendant cette visite. Firefox refuse le son dans un lecteur que tu n’as jamais cliqué et le met en pause : cette pause n’est pas enregistrée comme un choix, un clic sur la vidéo relance la lecture et le prochain rechargement repart en lecture.

## Taille minimale des lecteurs

Twitch ne lance la lecture automatique que dans un lecteur d’au moins 400 × 300 pixels, visible et jamais recouvert. La grille ne réduit donc jamais une tuile sous cette taille : elle limite le nombre de colonnes, garde des lignes assez hautes et fait défiler le reste. Quand plusieurs dispositions sont possibles, elle préfère celle qui tient entièrement à l’écran. Seules les tuiles visibles chargent leur lecteur ; les autres affichent une image du stream et démarrent en arrivant à l’écran. Une tuile en pause garde aussi son image, et son survol lance un aperçu muet dans la tuile.

Sur les tuiles simplifiées et les tuiles en pause, la catégorie, le titre et les commandes occupent un pied de tuile sous la vidéo, jamais par-dessus. Une fenêtre trop étroite pour un seul lecteur, sur téléphone par exemple, garde les images.

## Chat du stream

L’icône de chat dans la barre du stream en spotlight ouvre son chat Twitch. Elle est aussi disponible avec une tuile seule. Le chat suit le spotlight et se ferme temporairement au retour à la grille. Le mode Auto utilise l’espace sous la vidéo quand il reste au moins 420 pixels de hauteur ; sinon, il choisit le placement qui garde la plus grande image. La flèche à côté de l’icône ouvre les options Auto, Top, Bottom, Left et Right. Choisir une option ouvre le chat à cet endroit sans autre clic. Le chat occupe tout son panneau, sans barre de titre ajoutée.

Le chat latéral s’élargit de 320 à 480 pixels pour utiliser les bandes noires verticales sans réduire davantage la vidéo. Il fonctionne aussi dans le mode agrandi. Son ouverture et sa position sont enregistrées séparément pour les modes connecté et sans compte. Changer sa position ne recharge ni le chat ni le lecteur vidéo. Le lien dans ce menu permet de l’ouvrir sur Twitch, qui gère la connexion pour écrire des messages.

## Lancer en local

```sh
pnpm install
pnpm dev
```

Node.js 24 est nécessaire. Ouvre http://localhost:8765. Le lecteur Twitch nécessite un serveur HTTP avec un nom d’hôte, il ne fonctionne pas avec une URL `file://`.

Le serveur redémarre automatiquement quand son code change. Après une modification de `.env.local`, relance `pnpm dev` pour charger les nouvelles variables.

## Configurer Twitch

Crée une application dans la [console Twitch](https://dev.twitch.tv/console/apps) :

- Nom : `Moinax Stream Grid`, ou un autre nom unique, sans le mot « Twitch ».
- Catégorie : Website Integration.
- L’application actuelle de connexion est de type Public. Le site utilise son Client ID ; aucun secret n’est nécessaire pour la connexion des visiteurs.
- Redirection OAuth : `https://twitch.moinax.com`, sans slash final, comme dans la console de cette application.
- Pour tester la connexion localement, ajoute aussi `http://localhost:8765`.

Renseigne l’identifiant client public dans `config.json`, dans la propriété `twitchClientId`. La connexion des visiteurs n’utilise pas de secret client. Si l’identifiant est vide, les favoris fonctionnent et le bouton de connexion est masqué.

La connexion utilise le [flux implicite OAuth de Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow), avec la seule permission `user:read:follows`. L’application vérifie l’état OAuth avant d’accepter un jeton, puis valide la session au démarrage et toutes les heures. Elle appelle l’API Twitch depuis le navigateur.

## Recherche sans compte

La fonction Vercel `GET /api/search?q=…` cherche des chaînes avec un jeton d’application Twitch. Elle ne reçoit ni le compte ni les follows des visiteurs. Le jeton et le secret restent côté serveur.

Dans les variables d’environnement du projet Vercel, configure pour Production :

- `TWITCH_SEARCH_CLIENT_ID` : l’identifiant d’une application Twitch de type **Confidential**.
- `TWITCH_SEARCH_CLIENT_SECRET` : le secret de cette même application.

L’application publique utilisée pour la connexion des visiteurs ne fournit pas de secret. Une application distincte nommée `Moinax Stream Search`, catégorie Website Integration et type Confidential, peut servir à la recherche. Son URL de redirection peut être `https://twitch.moinax.com`. L’identifiant dans `config.json` reste celui de la connexion des visiteurs.

Pour développer en local, renseigne ces deux variables dans `.env.local`, que Git ignore. `pnpm dev` les charge. Après un changement de variables Vercel, redéploie pour les appliquer.

Le serveur conserve les résultats pendant une minute et réutilise le jeton jusqu’à son expiration. Une recherche exacte vérifie aussi le pseudo avec Get Users, car Search Channels omet les chaînes inactives depuis six mois. Get Streams vérifie le statut de ces chaînes. Le même endpoint accepte jusqu’à 100 paramètres `login` pour actualiser les favoris en une requête. La recherche accepte 2 à 100 caractères. Les erreurs ne mettent pas de résultats en cache ; l’interface propose alors un ajout direct par pseudo.

## Déployer

Le projet comprend les fichiers statiques et une fonction Node.js pour la recherche. Vercel doit servir la racine avec le preset « Other », sans commande de build. Associe le domaine `twitch.moinax.com` au projet Vercel et configure son DNS suivant les indications de Vercel.

## Image de partage

Les balises Open Graph et Twitter utilisent une image PNG de 1200 × 630 pixels. La carte est une capture du haut de la landing en anglais, mise en page pour ce format par `scripts/render-share-image.cjs`. Les balises de partage sont en anglais elles aussi, car les robots des réseaux ne voient pas le choix de langue de la page. Après un changement du hero ou de la maquette, régénère l’image avec :

```sh
pnpm og:generate
```

La commande lance le serveur local, utilise Chromium de Playwright et écrit `assets/share-card.png`. L’image est versionnée et servie directement, sans génération lors du déploiement.

## Vérifier

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test:server
pnpm test
```

Les tests serveur couvrent la recherche anonyme, le cache, le renouvellement du jeton, les limites de requêtes et les erreurs sans exposition des identifiants. Les tests navigateur couvrent les favoris, la restauration de la grille, la connexion OAuth, la pagination des follows, leur actualisation et les sessions expirées. Ils simulent l’API et le lecteur Twitch ; la lecture réelle et l’autorisation du compte se vérifient sur le site.

## Origine et licence

Adapté de [ZEvent grid](https://github.com/Moinax/zevent-grid), avec son historique Git. Les données et compteurs de l’événement ont été retirés.

[MIT](LICENSE)
