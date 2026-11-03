# Changelog

Each version's section becomes the notes of its GitHub release and of `latest.json`, which the
app shows before installing an update (`scripts/prepare-release.ps1`). Only `### ` titles and
`- ` items are shown in the app. From 0.4.0 a section has an `#### English` block (New,
Improvements, Fixes, Removed) and an `#### Français` block (Nouveautés, Améliorations,
Corrections, Retiré); the app shows the block of its language. Older sections are French only.

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
