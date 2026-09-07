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
  'Revenir à la grille':['Back to grid','Terug naar het raster'],
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
  'Trop de recherches. Réessaie dans une minute.':['Too many searches. Try again in a minute.','Te veel zoekopdrachten. Probeer het over een minuut opnieuw.']
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
      const value = tr(node.getAttribute(data));
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
