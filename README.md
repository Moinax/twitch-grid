# Twitch grid

Plusieurs streams Twitch sur un seul écran, avec une grille réorganisable, un stream en avant et des réglages audio par tuile.

Site : https://twitch.moinax.com

## Ta liste de streamers

La page vide propose d’abord « Connecter Twitch ». Le choix « Continuer sans compte » ouvre les favoris et reste mémorisé dans ce navigateur. Une petite icône Twitch dans la sidebar permet de se connecter plus tard.

Sans connexion, cherche un streamer par pseudo ou lien Twitch directement dans la sidebar. Les résultats affichent son avatar, sa catégorie et son statut au moment de la recherche. L’étoile ajoute la chaîne aux favoris de ce navigateur. Si la recherche est indisponible, l’ajout direct par pseudo reste possible.

Avec « Connecter Twitch », retrouve tes follows et cherche des streamers directement dans la sidebar. Les chaînes en direct passent en premier. Les statuts se rafraîchissent toutes les 30 secondes et les follows environ toutes les minutes, tant que la page est visible. La connexion remplace les favoris par les follows. Il n’y a plus d’onglet ni de bouton de favoris dans ce mode. Les favoris locaux réapparaissent à la déconnexion.

Le compte connecté est celui de chaque visiteur. Les follows ne sont pas publiés pour les autres utilisateurs. La session Twitch reste dans l’onglet et disparaît à sa fermeture. Si elle expire, reconnecte-toi. La sidebar revient alors aux favoris locaux.

## Vue mise en avant

Clique une tuile pour afficher le lecteur Twitch complet, avec ses réglages de qualité, son volume, sa pause et son plein écran. Les petites tuiles gardent les commandes simplifiées. Les changements de volume, de son et de pause faits dans le lecteur sont conservés au retour à la grille.

Twitch accepte l’option des contrôles à la création du lecteur. Le passage entre les deux vues recrée donc les lecteurs des tuiles qui changent de mode. Les autres streams continuent à jouer.

## Lancer en local

```sh
npm run dev
```

Node.js 24 est nécessaire. Ouvre http://localhost:8765. Le lecteur Twitch nécessite un serveur HTTP avec un nom d’hôte, il ne fonctionne pas avec une URL `file://`.

## Configurer Twitch

Crée une application dans la [console Twitch](https://dev.twitch.tv/console/apps) :

- Nom : `Moinax Stream Grid`, ou un autre nom unique, sans le mot « Twitch ».
- Catégorie : Website Integration.
- Type de client : Confidential, pour le flux OAuth implicite. Le site utilise uniquement le Client ID public, jamais le secret client.
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

Pour développer en local, renseigne ces deux variables dans `.env.local`, que Git ignore. `npm run dev` les charge. Après un changement de variables Vercel, redéploie pour les appliquer.

Le serveur conserve les résultats pendant une minute et réutilise le jeton jusqu’à son expiration. Une recherche exacte vérifie aussi le pseudo avec Get Users, car Search Channels omet les chaînes inactives depuis six mois. La recherche accepte 2 à 100 caractères. Les erreurs ne mettent pas de résultats en cache ; l’interface propose alors un ajout direct par pseudo.

## Déployer

Le projet comprend les fichiers statiques et une fonction Node.js pour la recherche. Vercel doit servir la racine avec le preset « Other », sans commande de build. Associe le domaine `twitch.moinax.com` au projet Vercel et configure son DNS suivant les indications de Vercel.

## Vérifier

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:server
npm test
```

Les tests serveur couvrent la recherche anonyme, le cache, le renouvellement du jeton, les limites de requêtes et les erreurs sans exposition des identifiants. Les tests navigateur couvrent les favoris, la restauration de la grille, la connexion OAuth, la pagination des follows, leur actualisation et les sessions expirées. Ils simulent l’API et le lecteur Twitch ; la lecture réelle et l’autorisation du compte se vérifient sur le site.

## Origine et licence

Adapté de [ZEvent grid](https://github.com/Moinax/zevent-grid), avec son historique Git. Les données et compteurs de l’événement ont été retirés.

[MIT](LICENSE)
