// Preferences apply before the first paint; channel names and stream titles are never translated.
const translations = {
  'Langue':['Language','Taal'], 'Thème':['Theme','Thema'], 'Clair':['Light','Licht'], 'Sombre':['Dark','Donker'],
  'Fermer':['Close','Sluiten'], 'Annuler':['Cancel','Annuleren'], 'Enregistrer':['Save','Opslaan'],
  'Grilles':['Grids','Rasters'], 'Grille par défaut':['Default grid','Standaardraster'],
  'Enregistrer sous…':['Save as…','Opslaan als…'], 'Grille vierge':['Empty grid','Leeg raster'],
  'Nouvelle grille':['New grid','Nieuw raster'], 'Grille {n}':['Grid {n}','Raster {n}'], 'Changer de grille':['Switch grid','Van raster wisselen'], 'Gérer les grilles…':['Manage grids…','Rasters beheren…'], 'Nom de la grille':['Grid name','Naam van het raster'],
  'Renommer':['Rename','Hernoemen'], 'Supprimer':['Delete','Verwijderen'],
  'Créer la grille':['Create grid','Raster maken'], 'Ouvrir cette grille':['Open this grid','Dit raster openen'],
  'Grille actuelle':['Current grid','Huidig raster'], '{count} tuiles':['{count} tiles','{count} tegels'],
  '{count} tuile':['{count} tile','{count} tegel'], 'Aucune tuile':['No tiles','Geen tegels'],
  'Supprimer « {name} » ?':['Delete “{name}”?','“{name}” verwijderen?'],
  'Les autres grilles et tes favoris seront conservés.':['Your other grids and favorites will be kept.','Je andere rasters en favorieten blijven behouden.'],
  'Donne un nom à cette grille.':['Give this grid a name.','Geef dit raster een naam.'],
  'Choisis un nom différent pour cette grille.':['Choose a different name for this grid.','Kies een andere naam voor dit raster.'],
  'Impossible d’enregistrer dans ce navigateur.':['Unable to save in this browser.','Opslaan in deze browser is niet mogelijk.'],
  'Créer une grille pour cette collaboration':['Create a grid for this collaboration','Een raster voor deze samenwerking maken'],
  'Collaboration · {name}':['Collaboration · {name}','Samenwerking · {name}'],
  'Connecter Twitch':['Connect Twitch','Twitch verbinden'], 'Déconnecter Twitch':['Disconnect Twitch','Twitch loskoppelen'],
  'Mettre une étoile sur GitHub':['Star on GitHub','Geef een ster op GitHub'], 'Star sur GitHub':['Star on GitHub','Ster op GitHub'],
  'Play/pause tous les streams':['Play/pause all streams','Alle streams afspelen/pauzeren'],
  'Afficher/masquer la liste':['Show/hide the list','Lijst tonen/verbergen'],
  'Rechercher un streamer':['Find a streamer','Een streamer zoeken'],
  'Rechercher un streamer…':['Find a streamer…','Een streamer zoeken…'],
  'Effacer la recherche':['Clear search','Zoekopdracht wissen'], 'Streamers':['Streamers','Streamers'],
  'Connecte ton compte Twitch pour retrouver tes follows et regarder plusieurs streams sur un seul écran.':['Connect Twitch to find your followed channels and watch several streams on one screen.','Verbind Twitch om je gevolgde kanalen te vinden en meerdere streams op één scherm te bekijken.'],
  'Retrouve les chaînes que tu suis sur Twitch. Choisis un stream dans la liste pour commencer.':['Find the channels you follow on Twitch. Choose a stream from the list to get started.','Hier vind je de kanalen die je volgt op Twitch. Kies een stream uit de lijst om te beginnen.'],
  'Continuer sans compte':['Continue without an account','Doorgaan zonder account'],
  'Glisse les tuiles pour les ranger. Clique une vidéo pour la mettre en avant.':['Drag tiles to reorder them. Click a video to spotlight it.','Versleep tegels om ze te ordenen. Klik op een video om die uit te lichten.'],
  'Retrouver le son':['Restore audio','Geluid herstellen'],
  'Clique n’importe où ou appuie sur une touche pour réactiver le son de tes streams.':['Click anywhere or press a key to restore your streams’ audio.','Klik ergens of druk op een toets om het geluid van je streams te herstellen.'],
  'Réactiver le son':['Restore audio','Geluid herstellen'],
  'Afficher le chat':['Show chat','Chat tonen'], 'Masquer le chat':['Hide chat','Chat verbergen'],
  'Options du chat':['Chat options','Chatopties'], 'Position du chat':['Chat position','Chatpositie'],
  'Ouvrir sur Twitch ↗':['Open on Twitch ↗','Openen op Twitch ↗'],
  'Auto':['Auto','Auto'], 'Top':['Top','Boven'], 'Bottom':['Bottom','Onder'], 'Left':['Left','Links'], 'Right':['Right','Rechts'],
  'Chat de {name}':['Chat for {name}','Chat van {name}'], 'Stream de {name}':['Stream by {name}','Stream van {name}'],
  'Couper tous les sons':['Mute every stream','Alle geluiden dempen'], 'Réactiver le son':['Restore the sound','Geluid herstellen'],
  'Revenir à la grille':['Back to grid','Terug naar het raster'], 'Déposer ici':['Drop here','Hier neerzetten'], 'Épingler':['Pin','Vastpinnen'], 'Désépingler':['Unpin','Losmaken'],
  'Verrouiller la grille':['Lock the grid','Raster vergrendelen'], 'Déverrouiller la grille':['Unlock the grid','Raster ontgrendelen'],
  'Grille verrouillée':['Grid locked','Raster vergrendeld'], 'verrouillée':['locked','vergrendeld'],
  'Grille verrouillée : déverrouille-la pour ajouter un stream.':['Grid locked: unlock it to add a stream.','Raster vergrendeld: ontgrendel het om een stream toe te voegen.'],
  'Agrandir dans la fenêtre':['Fill the window','Venster vullen'],
  'Revenir à la disposition précédente':['Restore previous layout','Vorige indeling herstellen'],
  'Retirer':['Remove','Verwijderen'], 'Son':['Audio','Geluid'], 'Volume':['Volume','Volume'], 'Play/pause':['Play/pause','Afspelen/pauzeren'],
  'Hors ligne':['Offline','Offline'], 'En direct':['Live','Live'], 'Chaîne Twitch':['Twitch channel','Twitch-kanaal'],
  'Fais défiler pour lire':['Scroll to play','Scroll om af te spelen'],
  'Épingler le son':['Pin audio','Geluid vastzetten'], 'Désépingler le son':['Unpin audio','Geluid losmaken'],
  'Participants à la collaboration':['Collaboration participants','Deelnemers aan de samenwerking'],
  'Collaboration : {names}':['Collaboration: {names}','Samenwerking: {names}'],
  'Collaboration : {count} participants':['Collaboration: {count} participants','Samenwerking: {count} deelnemers'],
  'Déjà dans la grille':['Already in the grid','Al in het raster'], 'Ajouté':['Added','Toegevoegd'], 'Ajouter':['Add','Toevoegen'],
  'Ajouter {name}':['Add {name}','{name} toevoegen'], 'Tout ajouter':['Add all','Alles toevoegen'],
  'Chargement de l’aperçu…':['Loading preview…','Voorbeeld laden…'], 'Aperçu indisponible':['Preview unavailable','Voorbeeld niet beschikbaar'],
  'Aperçu de {name}':['Preview of {name}','Voorbeeld van {name}'], 'L’aperçu tarde à démarrer':['The preview is taking a while to load','Het laden van het voorbeeld duurt langer'],
  'Afficher dans la grille':['Show in grid','In raster tonen'], 'Fermer la notification':['Dismiss notification','Melding sluiten'],
  'Nouveaux streams en direct':['New live streams','Nieuwe livestreams'],
  '{name} est en direct':['{name} is live','{name} is live'],
  'Afficher ou retirer {name}':['Show or remove {name}','{name} tonen of verwijderen'], 'Regarder {name}':['Watch {name}','{name} bekijken'],
  'Retirer des favoris : {name}':['Remove favorite: {name}','Uit favorieten verwijderen: {name}'],
  'Ajouter aux favoris : {name}':['Add favorite: {name}','Toevoegen aan favorieten: {name}'],
  'Recherche en cours…':['Searching…','Zoeken…'], 'Aucun résultat dans cette liste.':['No results in this list.','Geen resultaten in deze lijst.'],
  'Tu ne suis encore aucune chaîne.':['You don’t follow any channels yet.','Je volgt nog geen kanalen.'],
  'Saisis au moins 2 caractères.':['Enter at least 2 characters.','Voer minstens 2 tekens in.'],
  'Recherche sur Twitch…':['Searching Twitch…','Zoeken op Twitch…'], '{count} chaîne trouvée':['{count} channel found','{count} kanaal gevonden'],
  '{count} chaînes trouvées':['{count} channels found','{count} kanalen gevonden'], 'Aucune chaîne trouvée.':['No channels found.','Geen kanalen gevonden.'],
  'Ajouter {name} sans vérifier':['Add {name} without checking','{name} toevoegen zonder controle'],
  'Nouvelle version, clique pour recharger':['New version, click to reload','Nieuwe versie, klik om te herladen'],
  'Le lecteur Twitch est indisponible. La connexion et la recherche restent accessibles.':['The Twitch player is unavailable. Sign-in and search are still available.','De Twitch-speler is niet beschikbaar. Aanmelden en zoeken blijven beschikbaar.'],
  'Le lecteur Twitch est indisponible. Recharge la page pour réessayer.':['The Twitch player is unavailable. Reload the page to try again.','De Twitch-speler is niet beschikbaar. Herlaad de pagina om opnieuw te proberen.'],
  'Impossible d’actualiser le statut des favoris. Nouvelle tentative dans 30 secondes.':['Unable to refresh favorite statuses. Retrying in 30 seconds.','De status van favorieten kan niet worden bijgewerkt. Nieuwe poging over 30 seconden.'],
  'Le navigateur ne peut pas enregistrer les favoris. Ils seront perdus à la fermeture de la page.':['This browser cannot save favorites. They will be lost when you close the page.','Deze browser kan favorieten niet opslaan. Ze gaan verloren als je de pagina sluit.'],
  'La connexion Twitch est indisponible. Les favoris restent accessibles.':['Twitch sign-in is unavailable. Favorites are still available.','Aanmelden bij Twitch is niet beschikbaar. Favorieten blijven beschikbaar.'],
  'La recherche Twitch est indisponible pour le moment. Tu peux ajouter un pseudo directement.':['Twitch search is currently unavailable. You can add a username directly.','Zoeken op Twitch is momenteel niet beschikbaar. Je kunt rechtstreeks een gebruikersnaam toevoegen.'],
  'La session Twitch a expiré. Reconnecte-toi.':['Your Twitch session has expired. Sign in again.','Je Twitch-sessie is verlopen. Meld je opnieuw aan.'],
  'Impossible de vérifier la connexion Twitch.':['Unable to verify the Twitch connection.','De Twitch-verbinding kan niet worden gecontroleerd.'],
  'La connexion Twitch ne permet pas de lire les follows. Reconnecte-toi.':['This Twitch connection cannot read your followed channels. Sign in again.','Deze Twitch-verbinding kan je gevolgde kanalen niet lezen. Meld je opnieuw aan.'],
  'Autorise le stockage de session dans ton navigateur pour connecter Twitch.':['Allow session storage in your browser to connect Twitch.','Sta sessieopslag toe in je browser om Twitch te verbinden.'],
  'La connexion Twitch n’est pas configurée pour cette adresse. L’adresse de retour doit être ajoutée dans les réglages de l’application Twitch.':['Twitch sign-in is not configured for this address. Add its redirect URL in the Twitch application settings.','Aanmelden bij Twitch is niet ingesteld voor dit adres. Voeg de terugkeer-URL toe aan de instellingen van de Twitch-applicatie.'],
  'Cette connexion Twitch n’est plus valide. Recommence depuis le bouton de connexion.':['This Twitch sign-in is no longer valid. Start again using the connect button.','Deze Twitch-aanmelding is niet meer geldig. Probeer het opnieuw met de verbindingsknop.'],
  'Connexion Twitch annulée. Tu peux utiliser les favoris.':['Twitch sign-in cancelled. You can use favorites.','Aanmelden bij Twitch geannuleerd. Je kunt favorieten gebruiken.'],
  'Twitch reçoit trop de requêtes. Réessaie dans une minute.':['Twitch is receiving too many requests. Try again in a minute.','Twitch ontvangt te veel verzoeken. Probeer het over een minuut opnieuw.'],
  'Twitch est indisponible pour le moment. Réessaie dans un instant.':['Twitch is currently unavailable. Try again shortly.','Twitch is momenteel niet beschikbaar. Probeer het zo opnieuw.'],
  'Trop de recherches. Réessaie dans une minute.':['Too many searches. Try again in a minute.','Te veel zoekopdrachten. Probeer het over een minuut opnieuw.'],
  'Présentation de Twitch grid':['About Twitch grid','Over Twitch grid'], 'Aller au contenu':['Skip to content','Naar de inhoud'], 'Navigation':['Navigation','Navigatie'],
  'Fonctionnalités':['Features','Functies'], 'Comment ça marche':['How it works','Hoe het werkt'], 'Questions':['Questions','Vragen'],
  'Gratuit · Open source · Sans installation':['Free · Open source · Nothing to install','Gratis · Open source · Niets te installeren'],
  'Tous tes streams.':['All your streams.','Al je streams.'], 'Un seul écran.':['One screen.','Eén scherm.'],
  'Retrouve tes follows Twitch, compose ta grille et choisis quel stream a le son. Sans compte si tu préfères : tout reste dans ton navigateur.':['Bring in the channels you follow on Twitch, build your grid and pick which stream gets the sound. No account needed if you prefer: everything stays in your browser.','Haal de kanalen die je op Twitch volgt binnen, stel je raster samen en kies welke stream geluid krijgt. Zonder account als je wilt: alles blijft in je browser.'],
  'Code public sous licence MIT. Ta session Twitch et tes grilles restent dans ton navigateur.':['Public code under the MIT license. Your Twitch session and your grids stay in your browser.','Openbare code onder de MIT-licentie. Je Twitch-sessie en je rasters blijven in je browser.'],
  'Twitch, sans jongler entre les onglets':['Twitch, without juggling tabs','Twitch, zonder te jongleren met tabbladen'],
  'Tes directs d’abord':['Live channels first','Live kanalen eerst'],
  'Les chaînes en direct passent en tête de liste, statut vérifié toutes les 30 secondes. Un clic, et le stream rejoint la grille.':['Live channels move to the top of the list, with their status checked every 30 seconds. One click adds the stream to the grid.','Live kanalen staan bovenaan de lijst, met een statuscontrole elke 30 seconden. Eén klik zet de stream in het raster.'],
  'Un seul son à la fois':['One sound at a time','Eén geluid tegelijk'],
  'Le stream en avant a le son, les autres restent muets. Tes volumes et tes pauses survivent au rechargement.':['The spotlighted stream has the sound, the others stay muted. Your volumes and pauses survive a reload.','De uitgelichte stream heeft het geluid, de andere blijven stil. Je volumes en pauzes overleven een herlaadbeurt.'],
  'Une grille qui se souvient':['A grid that remembers','Een raster dat onthoudt'],
  'Tuiles épinglées, grilles nommées, chat et disposition : tout est enregistré dans ton navigateur et revient tel quel.':['Pinned tiles, named grids, chat and layout: everything is saved in your browser and comes back as you left it.','Vastgezette tegels, benoemde rasters, chat en indeling: alles wordt in je browser bewaard en komt terug zoals je het achterliet.'],
  'Twitch grid en une phrase':['Twitch grid in one sentence','Twitch grid in één zin'],
  'Un stream en avant, les autres sous la main. Le son que tu choisis, la grille qui s’en souvient.':['One stream up front, the others within reach. The sound you choose, the grid that remembers it.','Eén stream vooraan, de andere binnen handbereik. Het geluid dat jij kiest, het raster dat het onthoudt.'],
  'Tout ce qui rend Twitch plus pratique au quotidien':['Everything that makes Twitch easier every day','Alles wat Twitch elke dag handiger maakt'],
  'Chaque fonction existe pour une situation concrète : une soirée à plusieurs streams, un tournoi, une veille pendant le travail.':['Every feature exists for a real situation: an evening with several streams, a tournament, a stream running while you work.','Elke functie bestaat voor een concrete situatie: een avond met meerdere streams, een toernooi, een stream op de achtergrond tijdens het werk.'],
  'Follows en direct':['Live follows','Live follows'],
  'Connecte Twitch : tes chaînes suivies apparaissent, directs en premier, rafraîchies toutes les 30 secondes.':['Connect Twitch: the channels you follow appear, live ones first, refreshed every 30 seconds.','Verbind Twitch: je gevolgde kanalen verschijnen, live eerst, elke 30 seconden vernieuwd.'],
  'Favoris sans compte':['Favorites without an account','Favorieten zonder account'],
  'Cherche un pseudo ou colle un lien Twitch. La liste reste dans ce navigateur.':['Search a username or paste a Twitch link. The list stays in this browser.','Zoek een gebruikersnaam of plak een Twitch-link. De lijst blijft in deze browser.'],
  'Mise en avant':['Spotlight','Uitlichten'],
  'Clique une tuile pour le lecteur Twitch complet : qualité, volume, plein écran. Les autres gardent des commandes simplifiées.':['Click a tile for the full Twitch player: quality, volume, fullscreen. The others keep simplified controls.','Klik op een tegel voor de volledige Twitch-speler: kwaliteit, volume, volledig scherm. De andere houden vereenvoudigde knoppen.'],
  'Son par tuile':['Sound per tile','Geluid per tegel'],
  'Choisis le stream qui parle. Un bouton coupe tout, un autre met tout en pause.':['Choose which stream speaks. One button mutes everything, another pauses everything.','Kies welke stream spreekt. Eén knop dempt alles, een andere pauzeert alles.'],
  'Notifications de direct':['Live notifications','Livemeldingen'],
  'Quand une chaîne suivie démarre, une notification l’ajoute à la grille en un clic, avec le son.':['When a followed channel goes live, a notification adds it to the grid in one click, with sound.','Wanneer een gevolgd kanaal live gaat, zet een melding het met één klik in het raster, met geluid.'],
  'Grilles nommées':['Named grids','Benoemde rasters'],
  'Enregistre plusieurs dispositions : soirée, tournoi, veille. Change de grille sans recharger la page.':['Save several layouts: evening, tournament, background. Switch grids without reloading the page.','Bewaar meerdere indelingen: avond, toernooi, achtergrond. Wissel van raster zonder de pagina te herladen.'],
  'Collaborations':['Collaborations','Samenwerkingen'],
  'Le chat partagé Twitch révèle les partenaires d’un stream. Ajoute tous les participants en direct d’un coup.':['Twitch shared chat reveals a stream’s partners. Add every live participant at once.','De gedeelde chat van Twitch toont de partners van een stream. Voeg alle live deelnemers in één keer toe.'],
  'Chat intégré':['Built in chat','Ingebouwde chat'],
  'Le chat du stream en avant s’ouvre à côté de la vidéo : auto, haut, bas, gauche ou droite.':['The spotlighted stream’s chat opens next to the video: auto, top, bottom, left or right.','De chat van de uitgelichte stream opent naast de video: auto, boven, onder, links of rechts.'],
  'Épingler et verrouiller':['Pin and lock','Vastzetten en vergrendelen'],
  'Garde des tuiles en tête de grille et verrouille la disposition pour éviter les ajouts par erreur.':['Keep tiles at the front of the grid and lock the layout to avoid accidental additions.','Houd tegels vooraan in het raster en vergrendel de indeling om onbedoelde toevoegingen te vermijden.'],
  'Agrandir':['Enlarge','Vergroten'],
  'Étends le stream en avant à toute la fenêtre du navigateur. Échap pour revenir.':['Stretch the spotlighted stream to the whole browser window. Escape brings you back.','Rek de uitgelichte stream uit tot het hele browservenster. Escape brengt je terug.'],
  'Trois langues, deux thèmes':['Three languages, two themes','Drie talen, twee thema’s'],
  'Français, anglais, néerlandais. Clair, sombre ou selon le système, sans recharger les vidéos.':['French, English, Dutch. Light, dark or system, without reloading the videos.','Frans, Engels, Nederlands. Licht, donker of systeem, zonder de video’s te herladen.'],
  'Aperçu au survol':['Hover preview','Voorbeeld bij aanwijzen'],
  'Survole une chaîne en direct dans la liste : un aperçu s’ouvre avec le titre et la catégorie du stream.':['Hover a live channel in the list: a preview opens with the stream’s title and category.','Wijs een live kanaal in de lijst aan: een voorbeeld opent met de titel en categorie van de stream.'],
  'Trois gestes, et tout est en place':['Three moves and everything is in place','Drie handelingen en alles staat klaar'],
  'Connecte Twitch, ou cherche un pseudo':['Connect Twitch, or search a username','Verbind Twitch, of zoek een gebruikersnaam'],
  'Le bouton ouvre Twitch et ramène tes follows. Sans compte, la recherche suffit.':['The button opens Twitch and brings back your follows. Without an account, search is enough.','De knop opent Twitch en haalt je follows op. Zonder account volstaat zoeken.'],
  'Remplis la grille':['Fill the grid','Vul het raster'],
  'Clique les chaînes en direct dans la liste. Glisse les tuiles pour les ranger.':['Click the live channels in the list. Drag the tiles to arrange them.','Klik op de live kanalen in de lijst. Sleep de tegels om ze te ordenen.'],
  'Choisis l’avant et le son':['Pick the spotlight and the sound','Kies de uitgelichte stream en het geluid'],
  'Clique une vidéo pour la mettre en avant. Le son la suit, le reste se tait.':['Click a video to spotlight it. The sound follows it, the rest goes quiet.','Klik op een video om hem uit te lichten. Het geluid volgt, de rest zwijgt.'],
  'Rien à installer, rien à créer':['Nothing to install, nothing to create','Niets te installeren, niets aan te maken'],
  'Twitch grid est une page web. Elle demande le minimum et garde tout chez toi.':['Twitch grid is a web page. It asks for the minimum and keeps everything on your side.','Twitch grid is een webpagina. Ze vraagt het minimum en houdt alles bij jou.'],
  'Pas de compte à créer : la connexion passe par Twitch, avec la seule permission de lire tes follows.':['No account to create: sign in goes through Twitch, with the only permission being to read your follows.','Geen account aan te maken: aanmelden verloopt via Twitch, met als enige toestemming het lezen van je follows.'],
  'La session reste dans l’onglet et disparaît à sa fermeture.':['The session stays in the tab and disappears when it closes.','De sessie blijft in het tabblad en verdwijnt zodra je het sluit.'],
  'Tes follows et tes grilles ne sont jamais publiés ni partagés.':['Your follows and grids are never published or shared.','Je follows en rasters worden nooit gepubliceerd of gedeeld.'],
  'Le code est public sous licence MIT. Tu peux le lire, le modifier ou l’héberger de ton côté.':['The code is public under the MIT license. You can read it, change it or host it yourself.','De code is openbaar onder de MIT-licentie. Je kunt hem lezen, aanpassen of zelf hosten.'],
  'Questions fréquentes':['Frequently asked questions','Veelgestelde vragen'],
  'Faut-il un compte Twitch ?':['Do I need a Twitch account?','Heb ik een Twitch-account nodig?'],
  'Non. Sans compte, tu cherches un streamer par pseudo ou lien et il rejoint tes favoris, gardés dans ce navigateur. Avec un compte, tes follows apparaissent directement.':['No. Without an account, you search a streamer by username or link and it joins your favorites, kept in this browser. With an account, your follows appear directly.','Nee. Zonder account zoek je een streamer op gebruikersnaam of link en komt die bij je favorieten, bewaard in deze browser. Met een account verschijnen je follows meteen.'],
  'Que voit Twitch grid de mon compte ?':['What does Twitch grid see of my account?','Wat ziet Twitch grid van mijn account?'],
  'Uniquement la liste des chaînes que tu suis. Le jeton reste dans l’onglet et disparaît à sa fermeture ; rien n’est copié sur un serveur.':['Only the list of channels you follow. The token stays in the tab and disappears when it closes; nothing is copied to a server.','Alleen de lijst met kanalen die je volgt. Het token blijft in het tabblad en verdwijnt zodra je het sluit; niets wordt naar een server gekopieerd.'],
  'Combien de streams en même temps ?':['How many streams at once?','Hoeveel streams tegelijk?'],
  'Il n’y a pas de limite fixée. Chaque tuile est un lecteur Twitch officiel, donc la limite vient de ton écran et de ta connexion.':['There is no set limit. Each tile is an official Twitch player, so the limit comes from your screen and your connection.','Er is geen vaste limiet. Elke tegel is een officiële Twitch-speler, dus de grens ligt bij je scherm en je verbinding.'],
  'Pourquoi le son est coupé après un rechargement ?':['Why is the sound off after a reload?','Waarom staat het geluid uit na een herlaadbeurt?'],
  'Les navigateurs bloquent le son tant que tu n’as pas touché la page. Un écran te demande un clic, rend le son prévu par ta grille et ne revient plus pendant la visite.':['Browsers block sound until you interact with the page. A screen asks for one click, restores the sound your grid expects and does not come back during the visit.','Browsers blokkeren geluid tot je de pagina aanraakt. Een scherm vraagt één klik, herstelt het geluid dat je raster verwacht en komt tijdens het bezoek niet terug.'],
  'Où sont enregistrées mes grilles ?':['Where are my grids saved?','Waar worden mijn rasters bewaard?'],
  'Dans le stockage local de ton navigateur, séparément pour le mode connecté et le mode sans compte. Change de navigateur et tu repars de zéro.':['In your browser’s local storage, separately for the connected mode and the mode without an account. Switch browsers and you start from scratch.','In de lokale opslag van je browser, apart voor de verbonden modus en de modus zonder account. Wissel van browser en je begint opnieuw.'],
  'Comment sont détectées les collaborations ?':['How are collaborations detected?','Hoe worden samenwerkingen gedetecteerd?'],
  'Grâce aux sessions de chat partagé de Twitch. Une collaboration qui n’utilise pas cette fonction n’est pas détectée.':['Through Twitch shared chat sessions. A collaboration that does not use this feature is not detected.','Via de gedeelde chatsessies van Twitch. Een samenwerking die deze functie niet gebruikt, wordt niet gedetecteerd.'],
  'Ça marche sur mobile ?':['Does it work on mobile?','Werkt het op mobiel?'],
  'Oui. La liste se replie, le chat passe sous la vidéo et les grilles restent accessibles. Un grand écran reste plus confortable pour plusieurs streams.':['Yes. The list folds away, the chat moves under the video and the grids stay within reach. A large screen remains more comfortable for several streams.','Ja. De lijst klapt in, de chat gaat onder de video en de rasters blijven bereikbaar. Een groot scherm blijft comfortabeler voor meerdere streams.'],
  'C’est gratuit ?':['Is it free?','Is het gratis?'],
  'Oui, sans publicité ni version payante. Le code est public sous licence MIT ; tu peux aussi l’héberger de ton côté.':['Yes, with no ads and no paid tier. The code is public under the MIT license; you can also host it yourself.','Ja, zonder reclame of betaalde versie. De code is openbaar onder de MIT-licentie; je kunt hem ook zelf hosten.'],
  'Prêt à voir tes streams côte à côte ?':['Ready to watch your streams side by side?','Klaar om je streams naast elkaar te zien?'],
  'Connecte Twitch pour retrouver tes follows, ou commence tout de suite sans compte.':['Connect Twitch to bring in your follows, or start right away without an account.','Verbind Twitch om je follows op te halen, of begin meteen zonder account.'],
  'Ta grille est vide. Trois gestes et tes streams sont côte à côte.':['Your grid is empty. Three moves and your streams sit side by side.','Je raster is leeg. Drie handelingen en je streams staan naast elkaar.'],
  'Ta grille est vide. Tes follows sont dans la liste, les directs en premier.':['Your grid is empty. Your follows are in the list, live ones first.','Je raster is leeg. Je follows staan in de lijst, live eerst.'],
  'Trouve une chaîne':['Find a channel','Vind een kanaal'],
  'Dans la liste : tes follows, ou une recherche par pseudo ou lien Twitch.':['In the list: your follows, or a search by username or Twitch link.','In de lijst: je follows, of een zoekopdracht op gebruikersnaam of Twitch-link.'],
  'Ajoute-la à la grille':['Add it to the grid','Zet het in het raster'],
  'Un clic sur une chaîne en direct ouvre son lecteur ici.':['One click on a live channel opens its player here.','Eén klik op een live kanaal opent hier zijn speler.'],
  'Mets en avant, choisis le son':['Spotlight it, pick the sound','Licht uit, kies het geluid'],
  'Clique une vidéo pour l’agrandir. Le son la suit, les autres se taisent.':['Click a video to enlarge it. The sound follows it, the others go quiet.','Klik op een video om hem te vergroten. Het geluid volgt, de andere zwijgen.'],
  'Revoir la présentation':['See the introduction again','De presentatie opnieuw bekijken'],
  'Liens':['Links','Links'], 'Licence MIT':['MIT license','MIT-licentie'], 'Confidentialité':['Privacy','Privacy'],
  'Twitch est une marque de Twitch Interactive, Inc. Twitch grid est un projet indépendant, sans lien avec Twitch.':['Twitch is a trademark of Twitch Interactive, Inc. Twitch grid is an independent project, not affiliated with Twitch.','Twitch is een merk van Twitch Interactive, Inc. Twitch grid is een onafhankelijk project, niet verbonden aan Twitch.']
};
let preferences;
try { preferences = JSON.parse(localStorage.getItem('tg.preferences')) || {}; } catch { preferences = {}; }
preferences = { language: ['fr','en','nl'].includes(preferences.language) ? preferences.language : 'fr', theme: ['system','light','dark'].includes(preferences.theme) ? preferences.theme : 'system' };
function tr(key, values = {}) {
  const text = preferences.language === 'fr' ? key : translations[key]?.[preferences.language === 'en' ? 0 : 1] || key;
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
function translateTree(root = document) {
  for (const attr of ['text','title','aria-label','placeholder']) {
    const data = 'data-i18n' + (attr === 'text' ? '' : '-' + attr);
    for (const node of root.querySelectorAll('[' + data + ']')) {
      const key = node.getAttribute(data) || (attr === 'text' ? node.textContent.trim() : node.getAttribute(attr) || '');   // an empty data-i18n takes the initial French text as its key
      if (!node.getAttribute(data)) node.setAttribute(data, key);
      const value = tr(key);
      if (attr === 'text') node.textContent = value; else node.setAttribute(attr, value);
    }
  }
}
function relocalizeMessage(value) {
  const key = Object.keys(translations).find(key => key === value || translations[key].includes(value));
  return key ? tr(key) : value;
}
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function applyPreferences() {
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme = preferences.theme === 'system' ? systemTheme.matches ? 'dark' : 'light' : preferences.theme;
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.documentElement.dataset.theme === 'dark' ? '#181818' : '#f4f4f7');
}
applyPreferences();
systemTheme.addEventListener('change', () => { if (preferences.theme === 'system') { applyPreferences(); dispatchEvent(new Event('preferenceschange')); } });
function setPreference(key, value) {
  if (!(key === 'language' ? ['fr','en','nl'] : ['system','light','dark']).includes(value)) return;
  preferences[key] = value;
  try { localStorage.setItem('tg.preferences', JSON.stringify(preferences)); } catch { /* Preferences still work for this visit. */ }
  applyPreferences(); dispatchEvent(new Event('preferenceschange'));
}
