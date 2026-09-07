# Twitch grid

Plusieurs streams Twitch sur un seul écran, avec une grille réorganisable, un stream en avant et des réglages audio par tuile.

Site : https://twitch.moinax.com

## Ta liste de streamers

Sans connexion, ajoute des favoris par pseudo ou lien Twitch. Ils restent dans ce navigateur, avec la disposition de la grille et les réglages audio. Le lien « Rechercher sur Twitch » permet de retrouver un pseudo. Le site ne peut pas vérifier les chaînes ni connaître leur statut en direct sans connexion.

Avec « Connecter Twitch », retrouve tes follows et cherche des streamers directement dans la sidebar. Les chaînes en direct passent en premier. Les statuts se rafraîchissent toutes les 30 secondes et les follows environ toutes les minutes, tant que la page est visible. L’étoile ajoute ou retire un favori local sans modifier tes follows Twitch.

Le compte connecté est celui de chaque visiteur. Les follows ne sont pas publiés pour les autres utilisateurs. La session Twitch reste dans l’onglet et disparaît à sa fermeture. Si elle expire, reconnecte-toi. Les favoris restent disponibles.

## Lancer en local

```sh
python3 server.py
```

Ouvre http://localhost:8765. Le lecteur Twitch nécessite un serveur HTTP avec un nom d’hôte, il ne fonctionne pas avec une URL `file://`.

## Configurer Twitch

Crée une application dans la [console Twitch](https://dev.twitch.tv/console/apps) :

- Nom : `Moinax Stream Grid`, ou un autre nom unique, sans le mot « Twitch ».
- Catégorie : Website Integration.
- Type de client : Confidential, pour le flux OAuth implicite. Le site utilise uniquement le Client ID public, jamais le secret client.
- Redirection OAuth : `https://twitch.moinax.com/`, avec le slash final.
- Pour tester la connexion localement, ajoute aussi `http://localhost:8765/`.

Renseigne l’identifiant client public dans `config.json`, dans la propriété `twitchClientId`. Aucun secret client n’est utilisé. Si l’identifiant est vide, les favoris fonctionnent et le bouton de connexion est masqué.

La connexion utilise le [flux implicite OAuth de Twitch](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#implicit-grant-flow), avec la seule permission `user:read:follows`. L’application vérifie l’état OAuth avant d’accepter un jeton, puis valide la session au démarrage et toutes les heures. Elle appelle l’API Twitch depuis le navigateur.

## Déployer

Le site est statique, sans dépendance à installer pour le servir. Vercel doit servir la racine du projet avec le preset « Other », sans commande de build. Associe le domaine `twitch.moinax.com` au projet Vercel et configure son DNS suivant les indications de Vercel.

## Vérifier

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

Les tests navigateur couvrent les favoris, la restauration de la grille, la connexion OAuth, la pagination des follows, leur actualisation et les sessions expirées. Ils simulent l’API et le lecteur Twitch ; la lecture réelle et l’autorisation du compte se vérifient sur le site.

## Origine et licence

Adapté de [ZEvent grid](https://github.com/Moinax/zevent-grid), avec son historique Git. Les données et compteurs de l’événement ont été retirés.

[MIT](LICENSE)
