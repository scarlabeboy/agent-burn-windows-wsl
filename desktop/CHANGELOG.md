# Changelog

Each version's section becomes the notes of its GitHub release and of `latest.json`, which the
app shows before installing an update (`scripts/prepare-release.ps1`). Only `### ` titles and
`- ` items are shown in the app. Sections: Nouveautés, Améliorations, Corrections, Retiré.

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
