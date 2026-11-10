# Changelog

Each version's section becomes the notes of its GitHub release and of `latest.json`, which the
app shows before installing an update (`scripts/prepare-release.ps1`). Only `### ` titles and
`- ` items are shown in the app. From 0.4.0 a section has an `#### English` block (New,
Improvements, Fixes, Removed) and an `#### Français` block (Nouveautés, Améliorations,
Corrections, Retiré); the app shows the block of its language. Older sections are French only.

## 0.6.6

#### English

### Improvements
- The Fable line's bar turns green, orange or red with what is left, like the quota badges and the notification-area icon.
- Once its reset has passed, the Fable line says "Cycle ended · new reading expected" instead of keeping the old percentage.

### Fixes
- A damaged archive file is set aside more surely: it no longer keeps the other archives from loading, which the next scan could then have replaced.
- A provider over-count held back no longer starts a new scan every minute.
- A damaged scan interval in the settings goes back to 10 minutes instead of scanning nonstop.

#### Français

### Améliorations
- La barre de la ligne Fable passe au vert, à l'orange ou au rouge selon ce qui reste, comme les pastilles de quota et l'icône de la zone de notification.
- Une fois son reset passé, la ligne Fable indique « Cycle terminé · nouveau relevé attendu » au lieu de garder l'ancien pourcentage.

### Corrections
- Un fichier d'archive abîmé est mieux écarté : il n'empêche plus les autres archives de se charger, que le scan suivant aurait pu remplacer.
- Un surcomptage du fournisseur retenu ne relance plus un scan chaque minute.
- Un intervalle de scan abîmé dans les réglages revient à 10 minutes au lieu de scanner sans arrêt.

## 0.6.5

#### English

### Improvements
- The model-scoped weekly limit (Fable) shows when it resets, on the right of its line: "Resets in 5d 3h · 100% left".
- A quota back after more than 5 minutes without a reading (an ended plan taken again, a new sign-in) refreshes the subscription block right away, without waiting for the next scan.
- A larger plan with the same windows (Plus to Pro 200) is followed right away: a weekly usage that drops without a reset refreshes the plan and value.

### Fixes
- Real use near zero is no longer held back for half an hour: going from 1 % to 7 % of the week shows at once. A jump that cannot be real (49 % to 99 %) is still held back until confirmed.

#### Français

### Améliorations
- La limite hebdomadaire propre à un modèle (Fable) indique quand elle se réinitialise, à droite de sa ligne : « Reset dans 5j 3h · 100 % restants ».
- Un quota qui revient après plus de 5 minutes sans relevé (forfait repris, nouvelle connexion) met aussitôt à jour le bloc Abonnement, sans attendre le scan suivant.
- Un forfait plus grand aux mêmes fenêtres (Plus vers Pro 200) est suivi aussitôt : un usage hebdomadaire qui baisse sans reset met à jour le forfait et la valeur.

### Corrections
- Une vraie consommation près de 0 n'est plus retenue une demi-heure : passer de 1 % à 7 % de la semaine s'affiche tout de suite. Une hausse impossible (49 % à 99 %) reste retenue jusqu'à confirmation.

## 0.6.4

#### English

### New
- Several Codex or Claude Code accounts can be declared by hand in Settings › Multiple accounts, one switch per tool, with an optional name and a plan for each account. The Subscription block then shows "N accounts declared", the total of the plans, the API equivalent spent since the 1st of the month across every environment, and its ratio to the plans. The projection and pace stay, from the account signed in when the quota is read. A note in the settings and under the gauges says what the CLI cannot tell apart.

### Improvements
- Every individual plan is recognised with its name and price: Codex Free, Go, Plus, Pro 100, Pro 200 and Pro 500; Claude Pro, Max and Ultra. An unknown plan keeps the name and price the CLI gives.
- On Claude Ultra, which has no 5-hour session, the weekly card fills the row.
- The model-scoped weekly limits (Fable) show under the quota gauges, with their age once read more than 5 minutes ago.
- No projection or limit warning before a tenth of the window has passed or a tenth of the quota is used: the projected use says "too early" instead of announcing the limit after an hour.
- A plan change (Codex Free taken back to Plus) is followed right away, without waiting for the next full scan.
- The Subscription block keeps the advised pace while the quota is unused, and says when value and projection are unavailable for now.

### Fixes
- On the WSL tab with WSL off, the Codex weekly limit per day no longer stays on "Reading..." for good: it is hidden.
- The missing 5-hour session of Claude Ultra is decided from the plan of each environment, which can be signed in to a different account.
- The Fable limit and the reset credits come from the environment of the quota shown, no longer from another one of the tab.
- Quotas are read only once the history has loaded, and a late, older reading is ignored.

#### Français

### Nouveautés
- Plusieurs comptes Codex ou Claude Code peuvent être déclarés à la main dans Réglages › Multicompte, un interrupteur par outil, avec un nom facultatif et un forfait pour chaque compte. Le bloc Abonnement indique alors « N comptes déclarés », le total des forfaits, l'équivalent API dépensé depuis le 1er du mois dans tous les environnements, et son rapport aux forfaits. La projection et le rythme restent, d'après le compte connecté au moment du relevé. Une note dans les réglages et sous les jauges dit ce que le CLI ne sait pas distinguer.

### Améliorations
- Chaque forfait individuel est reconnu avec son nom et son prix : Codex Free, Go, Plus, Pro 100, Pro 200 et Pro 500 ; Claude Pro, Max et Ultra. Un forfait inconnu garde le nom et le prix donnés par le CLI.
- En Claude Ultra, sans session de 5 h, la carte hebdomadaire occupe toute la ligne.
- Les limites hebdomadaires propres à un modèle (Fable) s'affichent sous les jauges du quota, avec leur âge quand le relevé date de plus de 5 minutes.
- Pas de projection ni d'alerte de limite avant qu'un dixième de la période soit écoulé ou un dixième du quota utilisé : la consommation projetée indique « trop tôt » au lieu d'annoncer la limite au bout d'une heure.
- Un changement de forfait (Codex Free repassé en Plus) est suivi aussitôt, sans attendre le scan complet suivant.
- Le bloc Abonnement garde le rythme conseillé tant que le quota n'est pas utilisé, et indique quand valeur et projection sont momentanément indisponibles.

### Corrections
- Sur l'onglet WSL avec WSL désactivé, la limite hebdomadaire Codex utilisée par jour ne reste plus sur « Lecture… » : elle est masquée.
- L'absence de session de 5 h de Claude Ultra est décidée d'après le forfait de chaque environnement, qui peut être connecté à un autre compte.
- La limite Fable et les crédits de reset viennent de l'environnement du quota affiché, et plus d'un autre environnement de l'onglet.
- Les quotas ne sont lus qu'une fois l'historique chargé, et un relevé tardif plus ancien est ignoré.

## 0.6.3

#### English

### Improvements
- Codex on the free plan shows its quota as it is: a single 30-day quota without a 5-hour session. The card is called "Monthly" and fills the row, its chart as tall as the others; the sidebar says "30d quota", the notification area tooltip "30d", and the warning "the monthly limit will be reached". The notification area icon choice is now "Week or month".
- The subscription block says "Free" instead of "n/a" for the value of a free plan, and "unknown price" for a plan whose price is not known.
- The Codex subscription block stays when its quota cannot be read, saying the plan is not read, like Claude's.
- The past Codex quotas found in its logs also include the archived sessions.

### Fixes
- On the free Codex plan, the chart of the weekly limit used per day is hidden: the daily figures of the ChatGPT dashboard are not shares of the monthly quota.
- A monthly quota is no longer drawn with the weekly cycles, and two cycles of different lengths are no longer merged.
- Readings taken while an update downloads are kept: the history is saved after the download, just before installing.
- An update check that hangs stops after 30 seconds, and a download after 10 minutes, so later checks are no longer blocked.
- Quitting the app (closing the window when it does not stay in the notification area, or Quit from the icon) saves the history first.
- Damaged settings fall back to their defaults instead of leaving the window blank.
- Reading the past Codex quotas from its logs stops after 2 minutes and runs once at a time per environment.

#### Français

### Améliorations
- Codex en forfait gratuit affiche son quota tel qu'il est : un quota unique de 30 jours, sans session de 5 h. La carte s'appelle « Mensuel » et occupe toute la ligne, son graphique aussi haut que les autres ; le menu de gauche indique « Quota 30 j », l'infobulle de la zone de notification « 30 j », et l'alerte « la limite mensuelle sera atteinte ». Le choix de l'icône de la zone de notification devient « Semaine ou mois ».
- Le bloc Abonnement indique « Gratuit » au lieu de « n/a » pour la valeur d'un forfait gratuit, et « prix inconnu » pour un forfait dont le prix n'est pas connu.
- Le bloc Abonnement de Codex reste affiché quand son quota ne peut pas être lu, avec « plan non lu », comme celui de Claude.
- Les quotas Codex passés retrouvés dans ses journaux comprennent aussi les sessions archivées.

### Corrections
- En forfait Codex gratuit, le graphique de la limite hebdomadaire utilisée par jour est masqué : les chiffres par jour du tableau de bord ChatGPT ne sont pas des parts du quota mensuel.
- Un quota mensuel n'est plus dessiné avec les cycles hebdomadaires, et deux cycles de durées différentes ne sont plus fusionnés.
- Les relevés pris pendant le téléchargement d'une mise à jour sont gardés : l'historique est enregistré après le téléchargement, juste avant l'installation.
- Une recherche de mise à jour bloquée s'arrête après 30 secondes, et un téléchargement après 10 minutes : les recherches suivantes ne sont plus bloquées.
- Quitter l'application (fermer la fenêtre quand elle ne reste pas dans la zone de notification, ou Quitter depuis l'icône) enregistre d'abord l'historique.
- Des réglages abîmés reprennent leurs valeurs par défaut au lieu de laisser la fenêtre vide.
- La lecture des quotas Codex passés dans ses journaux s'arrête après 2 minutes et ne tourne qu'une fois à la fois par environnement.

## 0.6.2

#### English

### Improvements
- The tooltips of the bar charts (spend and tokens, weekly Codex and Claude limits per day) no longer list the parts at zero.
- For the notification area icon, "Tightest" is now "Lowest", with a plainer description: the lower of the 5-hour session and the week, switching between them by itself.
- The subtitle of the settings page lists its cards as they now are.

### Fixes
- A Codex 5-hour session not started yet no longer records a new quota cycle every two minutes. The empty cycles already recorded are removed from the history at launch, so the past windows only offer real ones.
- A past quota window being looked at no longer goes back to the current one at each reading, on the Computer tab.

#### Français

### Améliorations
- Les infobulles des graphiques en barres (dépenses et tokens, limites hebdomadaires Codex et Claude par jour) ne listent plus les parts à zéro.
- Pour l'icône de la zone de notification, « Le plus serré » devient « Le plus bas », avec une description plus simple : le plus bas de la session 5 h et de la semaine, qui passe de l'un à l'autre tout seul.
- Le sous-titre de la page Réglages liste ses cartes telles qu'elles sont maintenant.

### Corrections
- Une session Codex de 5 h pas encore commencée n'enregistre plus un nouveau cycle de quota toutes les deux minutes. Les cycles vides déjà enregistrés sont retirés de l'historique au lancement : les fenêtres passées ne proposent plus que les vraies.
- Une fenêtre de quota passée qu'on regarde ne revient plus à l'actuelle à chaque relevé, dans l'onglet Ordinateur.

## 0.6.1

#### English

### New
- The notification area icon can show the remaining quota of Claude or Codex, as a number in a green, orange or red square (Settings › Background): the 5-hour session, the weekly quota or the tightest of the two. It goes back to the logo when the whole quota is left, and turns grey when the reading is old.
- The quota cards can go back through past windows with the ‹ › arrows: the curve of each past session or week and what was left at its last reading. "Current" comes back to the window under way.
- The Claude page charts how much of the weekly limit each day used, worked out from the app's own readings. What was used while the app was closed counts on the next day read, marked as approximate.

### Improvements
- The settings page is organized by subject: General, Background, Data, Quotas, WSL, Harnesses, Updates and About.
- In Updates, the installed version keeps its check button and says when the last check ran and when the next automatic one is due. A version found gets a line of its own, so a newer one can still be looked for before installing it.
- The automatic refresh says it keeps going in offline mode: it only reads files on this computer.
- The weekly Claude limit per day stays shown in offline mode, from the readings kept on this computer.

### Fixes
- A failed check no longer hides a version already found, and a failed install says so on that version's line, where it can be tried again.
- The update window no longer opens again by itself when a version is found after a check that found none.
- An automatic and a manual check no longer answer over each other.
- A quota cycle recorded twice a minute apart is read as one curve, without a zigzag, and its readings going down then back up by a point are no longer counted twice.
- A past session that ran past midnight shows the day it ended.
- The hints about quota reading being off point to Settings › Quotas, where the switch now is.

#### Français

### Nouveautés
- L'icône de la zone de notification peut afficher le quota restant de Claude ou de Codex, en chiffre dans un carré vert, orange ou rouge (Réglages › Arrière-plan) : la session de 5 h, le quota hebdomadaire ou le plus serré des deux. Elle revient au logo quand tout le quota reste, et passe au gris quand le relevé est ancien.
- Les cartes de quota peuvent remonter les fenêtres passées avec les flèches ‹ › : la courbe de chaque session ou semaine passée et ce qui restait au dernier relevé. « Actuelle » revient à la fenêtre en cours.
- La page Claude affiche la part de la limite hebdomadaire utilisée chaque jour, calculée à partir des relevés de l'application. Ce qui a été utilisé pendant que l'application était fermée compte pour le jour du relevé suivant, marqué comme approximatif.

### Améliorations
- La page Réglages est organisée par sujet : Général, Arrière-plan, Données, Quotas, WSL, Harness, Mises à jour et À propos.
- Dans Mises à jour, la version installée garde son bouton de recherche et indique quand a eu lieu la dernière vérification et quand vient la prochaine. Une version trouvée a sa propre ligne : on peut donc encore en chercher une plus récente avant de l'installer.
- Le rafraîchissement automatique précise qu'il continue en mode hors ligne : il ne lit que des fichiers de cet ordinateur.
- La limite hebdomadaire Claude par jour reste affichée en mode hors ligne, à partir des relevés gardés sur cet ordinateur.

### Corrections
- Une recherche qui échoue ne cache plus une version déjà trouvée, et une installation qui échoue l'indique sur la ligne de cette version, d'où on peut réessayer.
- La fenêtre de mise à jour ne se rouvre plus d'elle-même quand une version est trouvée après une recherche qui n'en trouvait pas.
- Une recherche automatique et une recherche manuelle ne se répondent plus par-dessus.
- Un cycle de quota enregistré deux fois à une minute d'écart est lu comme une seule courbe, sans dents de scie, et ses relevés qui baissent puis remontent d'un point ne sont plus comptés deux fois.
- Une session passée qui a traversé minuit affiche le jour où elle s'est terminée.
- Les messages sur la lecture des quotas désactivée renvoient à Réglages › Quotas, où se trouve maintenant l'option.

## 0.6.0

#### English

### Improvements
- With several WSL distributions, their list spans the side bar, so a long name shows in full; it also shows on hover.
- The ahead/behind pill of a quota is hidden only right after a reset, when its lead says nothing yet.
- When the quota is not read, the subscription card says its figures are hidden, without promising they come back with the next reading.

### Fixes
- A WSL distribution no longer picks up the Windows locations of a harness set by environment variables (Claude, caches, Goose and others), which could count Windows usage a second time on the Computer tab.
- At launch, the per-model detail of a period is read once instead of up to four times, and asked again after a failed scan.
- On the Computer tab, a stopped distribution never read says it has no data yet, instead of showing figures from a last reading it never had.

#### Français

### Améliorations
- Avec plusieurs distributions WSL, leur liste prend toute la largeur du menu latéral : un nom long s'affiche en entier, et aussi au survol.
- La pastille d'avance ou de retard d'un quota n'est cachée que juste après un reset, quand elle ne dit encore rien.
- Quand le quota n'est pas lu, la carte d'abonnement indique que ses chiffres sont masqués, sans promettre qu'ils reviennent à la prochaine lecture.

### Corrections
- Une distribution WSL ne reprend plus les emplacements Windows d'un harness définis par des variables d'environnement (Claude, caches, Goose et d'autres), qui pouvaient compter deux fois l'usage de Windows dans l'onglet Ordinateur.
- Au lancement, le détail par modèle d'une période est lu une seule fois au lieu de jusqu'à quatre, et redemandé après un scan raté.
- Dans l'onglet Ordinateur, une distribution arrêtée jamais lue indique qu'elle n'a pas encore de données, au lieu d'afficher des chiffres d'une dernière lecture qu'elle n'a jamais eue.

## 0.5.9

#### English

### New
- The update window says when updates were skipped since the installed version, as their notes are not listed there. Its link now always opens the notes of every version.

### Improvements
- In the side bar, the quota line reads "5h · Quota · 7d", each duration next to its percentage; a subscription with only a weekly quota shows "7d quota".
- When the history kept by the app cannot be saved, the status bar says so, with the reason on hover, until a save works again.

### Fixes
- On the quota chart, each stretch keeps its own colour: green while ahead of the steady pace, red while behind it, instead of one colour taken from the current lead.

#### Français

### Nouveautés
- La fenêtre de mise à jour signale les mises à jour sautées depuis la version installée, dont les notes n'y sont pas listées. Son lien ouvre désormais toujours les notes de toutes les versions.

### Améliorations
- Dans le menu latéral, la ligne des quotas devient « 5 h · Quota · 7 j », chaque durée à côté de son pourcentage ; un abonnement avec seulement un quota hebdo affiche « Quota 7 j ».
- Quand l'historique gardé par l'app ne peut pas être enregistré, la barre d'état le signale, avec la raison au survol, jusqu'à ce qu'un enregistrement réussisse.

### Corrections
- Sur le graphique du quota, chaque passage garde sa couleur : vert en avance sur le rythme régulier, rouge en retard, au lieu d'une seule couleur tirée de l'avance actuelle.

## 0.5.8

#### English

### Improvements
- In the side bar, each subscription shows its 5-hour quota on the left and its weekly quota on the right.
- Quota pills have stronger colours, easier to read in both themes.
- When a quota empties right after now, its "empty on" label no longer covers the curve.
- A failed read says what happened in a short sentence in your language; the technical message stays on hover.

### Fixes
- The subscription value keeps the spend of a stopped WSL distribution, and every tab shows the same value.
- A check for updates can no longer interrupt an update being installed.
- A WSL distribution that stops answering can no longer hold the following reads: the three-minute limit now covers the whole read.

#### Français

### Améliorations
- Dans le menu latéral, chaque abonnement affiche son quota 5 h à gauche et son quota hebdo à droite.
- Les pastilles de quota ont des couleurs plus marquées, plus lisibles dans les deux thèmes.
- Quand un quota se vide juste après maintenant, son étiquette « Vide » ne cache plus la courbe.
- Une lecture qui échoue dit ce qui s'est passé en une phrase courte dans votre langue ; le message technique reste au survol.

### Corrections
- La valeur de l'abonnement garde la dépense d'une distribution WSL arrêtée, et chaque onglet affiche la même valeur.
- Une recherche de mise à jour ne peut plus interrompre une mise à jour en cours d'installation.
- Une distribution WSL qui ne répond plus ne peut plus bloquer les lectures suivantes : la limite de trois minutes couvre désormais toute la lecture.

## 0.5.7

#### English

### Improvements
- In the side bar, Windows and WSL sit side by side under Computer, which is centered.
- In French, numbers, percentages and chart dates are written the French way: "4,70 Md", "12,9 %", "14/09", "sept. 2026".
- Cache write and cache read each have their own caption.
- When quotas are off, the tray menu says "Refresh usage", which is what it does.

### Fixes
- The keyboard focus ring is visible on every button, including the selected ones.
- The update window keeps the keyboard focus while it is open, and gives it back when it closes.
- The subscription block no longer shows figures while the quota is not read, in every environment alike: they could stay on one side for up to half an hour.

#### Français

### Améliorations
- Dans le menu latéral, Windows et WSL sont côte à côte sous Ordinateur, qui est centré.
- En français, les nombres, pourcentages et dates des graphiques s'écrivent à la française : « 4,70 Md », « 12,9 % », « 14/09 », « sept. 2026 ».
- Écriture cache et lecture cache ont chacune leur propre sous-titre.
- Quand les quotas sont coupés, le menu de la zone de notification dit « Actualiser l'usage », ce qu'il fait réellement.

### Corrections
- Le contour de sélection au clavier est visible sur tous les boutons, y compris ceux sélectionnés.
- La fenêtre de mise à jour garde le focus clavier tant qu'elle est ouverte, et le rend à sa fermeture.
- Le bloc Abonnement n'affiche plus de chiffres tant que le quota n'est pas lu, de la même façon dans chaque environnement : ils pouvaient rester jusqu'à une demi-heure d'un seul côté.

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
