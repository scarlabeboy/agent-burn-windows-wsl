# Changelog

Each version's section becomes the notes of its GitHub release and of `latest.json`, which the
app shows before installing an update (`scripts/prepare-release.ps1`). Only `### ` titles and
`- ` items are shown in the app. From 0.4.0 a section has an `#### English` block (New,
Improvements, Fixes, Removed) and an `#### Français` block (Nouveautés, Améliorations,
Corrections, Retiré); the app shows the block of its language. Older sections are French only.

## 0.5.6

#### English

### New
- A "Renew the Claude Code sign-in" switch in Data settings, off by default. Turn it on if you only use the Claude apps (desktop, VS Code) and not the claude command: those apps never renew the sign-in the app reads, so the Claude quota disappeared a few hours later. It can sign out a claude command open at the same time.

### Improvements
- A quota that fails to read again stays on screen for five minutes instead of two, with its age shown, so it no longer flashes away and back.
- In the side bar, the quota pill of a reading that is no longer live turns grey instead of fading.

### Fixes
- A history save that fails no longer leaves a temporary file behind.

#### Français

### Nouveautés
- Un interrupteur « Renouveler la connexion Claude Code » dans les réglages Données, désactivé par défaut. Activez-le si vous n'utilisez que les apps Claude (bureau, VS Code) et pas la commande claude : ces apps ne renouvellent jamais la connexion que lit l'application, si bien que le quota Claude disparaissait quelques heures plus tard. Il peut déconnecter une commande claude ouverte en même temps.

### Améliorations
- Un quota dont la relecture échoue reste affiché cinq minutes au lieu de deux, avec son âge, et ne clignote plus.
- Dans le menu latéral, la pastille de quota d'un relevé qui n'est plus à jour devient grise au lieu de s'estomper.

### Corrections
- Un enregistrement de l'historique qui échoue ne laisse plus de fichier temporaire derrière lui.

## 0.5.5

#### English

### Improvements
- The app never renews the Claude Code sign-in itself any more, so it can never disturb your Claude Code session. When that sign-in has expired, the Claude quota comes back the next time you use Claude Code.
- Temporary scan files live in the app's own folder, and the app never removes another program's files.
- Before an update installs, the app finishes saving its history.
- An update is only installed if its signature names its version.
- The secure connections used to read quotas get the latest security fixes.

### Fixes
- A malformed date in a Codex log can no longer close the app.

#### Français

### Améliorations
- L'application ne renouvelle plus jamais elle-même la connexion de Claude Code : elle ne peut donc plus perturber votre session Claude Code. Quand cette connexion a expiré, le quota Claude revient à votre prochaine utilisation de Claude Code.
- Les fichiers temporaires de lecture sont rangés dans un dossier propre à l'application, qui ne supprime jamais les fichiers d'un autre programme.
- Avant d'installer une mise à jour, l'application termine l'enregistrement de son historique.
- Une mise à jour n'est installée que si sa signature indique sa version.
- Les connexions sécurisées qui lisent les quotas reçoivent les derniers correctifs de sécurité.

### Corrections
- Une date malformée dans un journal Codex ne peut plus fermer l'application.

## 0.5.4

#### English

### New
- A light theme: General settings have a "Theme" list under the language (System by default, Dark, Light). System follows Windows, even when it changes while the app is open.
- Hovering a stacked bar in a chart shows its total under the date: in USD or tokens in the Spend chart, in percent in the daily weekly limit chart.

### Improvements
- On the open page in the side bar, the weekly quota pill is solid (green, amber or red) so it stays readable on the blue.

#### Français

### Nouveautés
- Un thème clair : les réglages généraux ont une liste « Thème » sous la langue (Système par défaut, Sombre, Clair). Système suit Windows, même s'il change pendant que l'app est ouverte.
- Le survol d'une barre empilée d'un graphique affiche son total sous la date : en $US ou en tokens dans le graphique Dépense, en pourcentage dans la limite hebdomadaire par jour.

### Améliorations
- Sur la page ouverte de la barre latérale, la pastille du quota hebdo est pleine (verte, orange ou rouge) pour rester lisible sur le bleu.

## 0.5.3

#### English

### New
- Each model in the models list has a badge with its reference rates per million tokens (input, output, cache write, cache read), shown on hover. The badge is grey when the rate is unknown or 0.

### Improvements
- The app's tooltips are its own: they open on hover after a short delay, never under the pointer, and stay inside the window, even in a corner.
- Tooltips that only repeated visible text are removed.
- Offline mode prices recent models: each release now embeds the prices of its build day.

#### Français

### Nouveautés
- Chaque modèle de la liste des modèles a une pastille avec ses tarifs de référence par million de tokens (entrée, sortie, écriture cache, lecture cache), affichés au survol. La pastille est grise quand le tarif est inconnu ou à 0.

### Améliorations
- Les infobulles sont propres à l'application : elles s'ouvrent au survol après un court délai, jamais sous le pointeur, et restent dans la fenêtre, même dans un coin.
- Les infobulles qui répétaient seulement le texte visible sont retirées.
- Le mode hors ligne connaît le prix des modèles récents : chaque version embarque les tarifs du jour de sa construction.

## 0.5.2

#### English

### Improvements
- The WSL settings have a "WSL reading" switch, and a separate "Reading mode" list (Automatic, Kept running) greyed out while reading is off. The chosen mode is kept when reading is turned off.
- With the automatic refresh on "Never", the status bar dot turns white and the bar says the automatic refresh is off.
- The update setting says that nothing is installed without your consent.
- The About card credits David's Windows fork of Agent Burn, which inspired some ideas.

### Fixes
- Changing the automatic refresh interval no longer starts a scan, "Never" included.
- Right after choosing 30 minutes, the status bar no longer says "next in 31 min".

#### Français

### Améliorations
- Les réglages WSL ont un interrupteur « Lecture de WSL » et une liste « Mode de lecture » séparée (Automatique, Maintenu allumé), grisée quand la lecture est coupée. Le mode choisi est conservé quand on coupe la lecture.
- Avec l'actualisation automatique sur « Jamais », le voyant de la barre d'état passe en blanc et la barre indique que l'actualisation auto est désactivée.
- Le réglage des mises à jour précise que rien n'est installé sans votre accord.
- La carte « À propos » crédite le fork Windows d'Agent Burn de David, qui a inspiré certaines idées.

### Corrections
- Changer l'intervalle d'actualisation automatique ne lance plus de scan, « Jamais » compris.
- Juste après avoir choisi 30 minutes, la barre d'état n'affiche plus « prochaine dans 31 min ».

## 0.5.1

#### English

### Improvements
- The "quota not read" messages of Claude Code and Codex are shorter, and say that an API key has no quota.

### Fixes
- With "Since the reset day", the side bar amounts no longer change with the open page: Codex and Claude Code count from their own reset day, the other lines over the whole period, as on their pages.
- The note shown where "Since the reset day" does not apply now says it applies to subscriptions whose quota is read.

#### Français

### Améliorations
- Les messages « quota non lu » de Claude Code et de Codex sont plus courts, et précisent qu'une clé API n'a pas de quota.

### Corrections
- Avec « Depuis le jour du reset », les montants de la barre latérale ne changent plus selon la page ouverte : Codex et Claude Code comptent depuis leur propre jour de reset, les autres lignes sur toute la période, comme sur leurs pages.
- La note affichée là où « Depuis le jour du reset » ne s'applique pas précise maintenant qu'elle concerne les abonnements dont le quota est lu.

## 0.5.0

#### English

### Improvements
- When a quota cannot be read, the message gives the cause when the app knows it (CLI missing, read timed out) instead of always blaming the sign-in.
- The "Since reset" period is now called "Since the reset day": it counts the whole day of the reset.
- With quotas turned off, scans no longer contact the Claude and Codex servers for the subscription block.
- The app ignores any personal agent-burn.json, which could silently change its figures.

### Fixes
- A saved data file that cannot be read is no longer overwritten: the archived days stay safe. A damaged file is kept aside, and each save reaches the disk before replacing the old one.
- Offline scans no longer write into the daily archive.
- After a refresh, a period (Today, 7 days…) shows the new figures right away instead of keeping the old ones for up to 10 minutes.
- A harness turned off no longer counts in the totals of a stopped WSL distribution.
- The Codex quota history is rebuilt from the account limit only.
- A second launch in the background (start with Windows, restart after a crash) no longer opens the window.
- The "No activity found yet" screen no longer appears when the archive still holds days whose logs were deleted.
- The WebView2 message no longer advises an antivirus exclusion: it says to restore the quarantined files.

#### Français

### Améliorations
- Quand un quota ne peut pas être lu, le message en donne la cause quand l'application la connaît (CLI absent, délai dépassé), au lieu de toujours accuser la connexion.
- La période « Depuis le reset » s'appelle maintenant « Depuis le jour du reset » : elle compte toute la journée du reset.
- Avec les quotas coupés, les scans ne contactent plus les serveurs de Claude et de Codex pour le bloc Abonnement.
- L'application ignore un éventuel agent-burn.json personnel, qui pouvait changer ses chiffres sans le dire.

### Corrections
- Un fichier de données qui ne peut pas être lu n'est plus écrasé : les journées archivées sont préservées. Un fichier abîmé est mis de côté, et chaque enregistrement atteint le disque avant de remplacer l'ancien.
- Les scans hors ligne n'écrivent plus dans l'archive journalière.
- Après une actualisation, une période (Aujourd'hui, 7 jours…) affiche tout de suite les nouveaux chiffres au lieu de garder les anciens jusqu'à 10 minutes.
- Un harness désactivé ne compte plus dans les totaux d'une distribution WSL arrêtée.
- L'historique du quota Codex est reconstruit à partir de la seule limite du compte.
- Un second lancement en arrière-plan (démarrage avec Windows, relance après un plantage) n'ouvre plus la fenêtre.
- L'écran « Aucune activité trouvée pour l'instant » n'apparaît plus quand l'archive garde des journées dont les journaux ont été supprimés.
- Le message WebView2 ne conseille plus d'exclusion d'antivirus : il dit de restaurer les fichiers mis en quarantaine.

## 0.4.4

#### English

### New
- New setting "Restart after an unexpected stop", on by default: Windows reopens the app in the notification area after a crash, or after a Windows update or an installer closed it. "Quit" still stops it for good.
- Keyboard shortcuts: Ctrl+R or F5 refreshes like the ⟳ button, Ctrl+Shift+R reads the quotas only. They no longer reload the page.

### Improvements
- The weekly quota in the sidebar fades when its reading is no longer live, and the notification-area tooltip says how old such a reading is.

### Fixes
- The message shown when Microsoft Edge WebView2 is missing is now in English, unless Windows is in French.

#### Français

### Nouveautés
- Nouveau réglage « Relancer après un arrêt imprévu », activé par défaut : Windows rouvre l'application dans la zone de notification après un plantage, ou après une mise à jour Windows ou un installeur qui l'a fermée. « Quitter » reste un vrai arrêt.
- Raccourcis clavier : Ctrl+R ou F5 actualise comme le bouton ⟳, Ctrl+Maj+R relit seulement les quotas. Ils ne rechargent plus la page.

### Améliorations
- Le quota hebdomadaire de la barre latérale pâlit quand sa lecture n'est plus à jour, et l'infobulle de l'icône de notification indique l'âge de cette lecture.

### Corrections
- Le message affiché quand Microsoft Edge WebView2 manque est maintenant en anglais, sauf si Windows est en français.

## 0.4.3

#### English

### New
- The overview shows the token breakdown (input, output, cache write, cache read) of all harnesses together, before the models table.

### Fixes
- With many harnesses, the "By harness" card no longer grows taller than the spend chart beside it: its list scrolls inside the card.

#### Français

### Nouveautés
- La vue d'ensemble affiche la répartition des tokens (entrée, sortie, écriture cache, lecture cache) de tous les harness réunis, avant le tableau des modèles.

### Corrections
- Avec beaucoup de harness, la carte « Par harness » ne dépasse plus la hauteur du graphique de dépense à côté : sa liste défile dans la carte.

## 0.4.2

#### English

### Improvements
- On harness pages, the token breakdown now comes before the models table, which ends the page.

### Fixes
- The Subscription block counts the spend of Windows and WSL together: the quota belongs to the account, so the plan value and monthly value were too low when both environments use it.
- A quota stays on screen for up to two minutes after a failed read, with its age shown, instead of flashing to "not read" (Claude Code in WSL without a sign-in).

#### Français

### Améliorations
- Sur les pages de harness, la répartition des tokens passe avant le tableau des modèles, qui termine la page.

### Corrections
- Le bloc Abonnement compte ensemble la dépense de Windows et de WSL : le quota appartient au compte, la valeur du forfait et la valeur mensuelle étaient donc trop basses quand les deux environnements l'utilisent.
- Un quota reste affiché jusqu'à deux minutes après une lecture ratée, avec son âge, au lieu de clignoter vers « non lu » (Claude Code dans WSL sans connexion).

## 0.4.1

#### English

### Improvements
- Page titles and figures get a small coloured icon; quota cards show the logo of their harness.
- Settings cards get sober grey icons, and the WSL card now comes right after General.
- The app name in the side bar lines up with the top bar and stays in place while the menu scrolls.

#### Français

### Améliorations
- Les titres des pages et des chiffres ont une petite icône colorée ; les cartes de quota montrent le logo de leur harness.
- Les cartes des réglages ont des icônes grises sobres, et la carte WSL vient juste après Général.
- Le nom de l'application dans la barre latérale est aligné avec la barre du haut et reste en place quand le menu défile.

## 0.4.0

#### English

### New
- The app is available in English: Settings › General › Language. Until a language is chosen, it follows the Windows language.
- Amounts and dates follow the language ("$1,684.30" in English, "1 684,30 $US" in French), still in dollars.
- Update notes are shown in the chosen language.

#### Français

### Nouveautés
- L'application existe en anglais : Réglages › Général › Langue. Tant qu'aucune langue n'est choisie, elle suit celle de Windows.
- Les montants et les dates suivent la langue (« 1 684,30 $US » en français, « $1,684.30 » en anglais), toujours en dollars.
- Les notes de mise à jour s'affichent dans la langue choisie.

## 0.3.4

### Corrections
- En mode hors ligne ou avec la lecture des quotas coupée, le bloc Abonnement affiche « plan non lu » sur toutes les vues, au lieu d'un plan figé sur certaines et de rien sur d'autres.

## 0.3.3

### Corrections
- Une lecture de l'usage en cours s'arrête avec l'application : elle ne bloque plus l'installation d'une mise à jour (« Erreur lors de l'ouverture du fichier en écriture : agent-burn.exe »).
- Le message affiché quand agent-burn.exe manque dans le dossier de l'application est en français.

## 0.3.2

### Améliorations
- Barre latérale : Claude Code et Codex affichent leur dépense totale comme les autres harness, et leur quota hebdomadaire sur une deuxième ligne.
- Un quota qui n'est plus relu n'est plus affiché : en mode hors ligne ou avec la lecture des quotas coupée, les blocs Quota et Abonnement, le graphique Codex par jour, la barre latérale et l'icône de notification le disent au lieu de montrer un vieux relevé. L'historique est gardé et revient avec le prochain relevé.

### Corrections
- Le bloc Abonnement ne montre plus « plan inconnu » pour Codex en mode hors ligne.
- Avec la lecture des quotas coupée, le graphique Codex par jour n'est plus lu sur le réseau.

## 0.3.1

### Nouveautés
- Interrupteur « Lecture des quotas » dans Réglages › Données : coupé, les jauges ne sont plus relues et gardent leur dernier relevé.
- Mention « Hors ligne » dans la barre de pied quand le mode hors ligne est activé.

### Améliorations
- Carte Données réordonnée (mode hors ligne, quotas, usage), avec des descriptions qui suivent chaque choix.
- En mode hors ligne, les interrupteurs des quotas et des mises à jour sont grisés sur « off » ; votre choix revient quand vous repassez en ligne.
- Le bloc Abonnement de Claude Code explique pourquoi il est vide en mode hors ligne.

### Corrections
- Le mode hors ligne coupe vraiment tout appel réseau : les quotas étaient encore lus en ligne chaque minute.
- En mode hors ligne, une mise à jour trouvée plus tôt ne peut plus être téléchargée ; elle attend le retour en ligne.

## 0.3.0

### Nouveautés
- Archive journalière : chaque jour d'usage lu est conservé par l'application. Quand un harness supprime ses anciens journaux (Claude Code le fait après environ 30 jours), ses dépenses et ses tokens restent dans les graphiques et les totaux.
- Une journée qui vient de l'archive est signalée sous le tableau des modèles : elle compte dans les totaux, mais n'est pas détaillée par modèle.

## 0.2.3

### Améliorations
- Première version construite, testée et signée par GitHub Actions, et non plus sur un PC.
- Guide du projet pour les agents de code (`desktop/AGENTS.md`).

## 0.2.2

### Améliorations
- Une lecture qui échoue s'affiche en rouge dans la barre de pied, avec sa cause, au lieu de « Pas encore lu ».
- Premier lancement : le message d'accueil s'affiche aussi sur l'onglet Ordinateur quand WSL est éteint.

### Corrections
- Une distribution WSL sans Claude Code est de nouveau lue : sa lecture échouait entièrement.

### Retiré
- Le rafraîchissement « Chaque minute » : une lecture peut durer une demi-minute. Ce réglage passe à 5 minutes.

## 0.2.1

### Nouveautés
- Fenêtre de confirmation avant une mise à jour : version, nouveautés et lien vers les notes sur GitHub.
- Resets de limite en stock affichés dans l'en-tête du quota Codex.
- Carte « À propos » dans les réglages : version, dépôt, licence et projet d'origine.

### Améliorations
- « Aucun usage dans cette période » au lieu d'une page de zéros.
- Numéro de version dans la carte « Mises à jour ».

### Corrections
- Messages d'erreur de mise à jour en français.
- Barres de part alignées dans le tableau des modèles.

## 0.2.0

### Nouveautés
- Première bêta publique : vues Ordinateur, Windows et WSL, quotas Claude Code et Codex avec prévision, abonnements, tableau des modèles triable.
- Mises à jour automatiques depuis les releases GitHub.
