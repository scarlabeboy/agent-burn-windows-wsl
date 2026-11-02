# Changelog

Each version's section becomes the notes of its GitHub release and of `latest.json`, which the
app shows before installing an update (`scripts/prepare-release.ps1`). Only `### ` titles and
`- ` items are shown in the app. Sections: Nouveautés, Améliorations, Corrections, Retiré.

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
