# Agent Burn Windows: feuille de route

État au 31/10/2026. Ce document garde les décisions et les idées retenues. Une idée listée ici n'est pas engagée : elle se code seulement après accord.

## Principes

- Le moteur de coûts est celui de Melvynx, sans modification. Seul ajout au CLI : `sessionWindow` pour Codex (`quota.rs`, `plan.rs`).
- Aucune règle de coût propre à un fork. Celle de David (entrée non cachée de `gpt-5.6+` et `gpt-6+` comptée comme écriture de cache) donne environ +100 $ sur Codex et n'est pas reprise.
- WSL est optionnel : sans distribution détectée, l'application n'affiche que Windows.
- Les quotas appartiennent au compte, pas à l'environnement : ils sont lus depuis toutes les sources dans tous les onglets.

## Fait

- Trois vues (Windows, WSL, Computer), barre latérale par harness, vue d'ensemble.
- Quotas de session de 5 h et hebdomadaire, avec prévision, rythme et zone de blocage (Claude, Codex).
- Carte d'abonnement depuis `summary --value` : plan, prix, valeur, consommation projetée, rythme conseillé. Plan Claude lu dans le fichier de connexion (champs de plan seulement) ou réglé à la main.
- Archive durable (`%LOCALAPPDATA%\Agent Burn Windows`) : historique de quota, cache de rapports, écriture atomique, copie `.bak`.
- Historique de quota Codex reconstitué depuis les logs de session.
- Sélecteur de période (totaux exacts en local, détail par modèle par scan de période).
- Rafraîchissement automatique (10 minutes par défaut, réglable).
- WSL jamais réveillé par l'application : détection par `wsl -l -q` et `wsl --list --running --quiet` (délai de 5 s), lecture seulement des distributions déjà « Running », nom d'utilisateur mémorisé (`wsl-users`), détection répétée toutes les 15 s, aucun appel à `wsl.exe` quand WSL est désactivé. Validé le 31/10 avec un moniteur d'état : Ubuntu reste `STOPPED` pendant les scans et rafraîchissements.
- Liste des harness dans les réglages : Actifs (ouvert), Désactivés et Non détectés (repliés). Désactiver = ne plus lire (scan `--agents` = tous les harness pris en charge sauf eux, `--value` conservé), retiré de la barre latérale, des quotas et de la bulle de notification. Les harness vus sont mémorisés (`abf.seen-harnesses`). Le dernier harness actif ne peut pas être désactivé. Limite : le rapport en cache d'un WSL éteint peut encore compter un harness désactivé dans les totaux jusqu'à sa prochaine lecture.
- Arrière-plan : icône de notification, fermeture vers la zone de notification, instance unique, démarrage Windows optionnel, nettoyage à la désinstallation.

## À corriger

1. ~~Dossier d'archive = dossier d'installation~~ : codé, à valider sur les vraies données. L'archive est maintenant dans `%LOCALAPPDATA%\dev.scarlabeboy.agent-burn-windows\archive`. Au premier accès, les fichiers de l'ancien dossier sont copiés, relus, puis supprimés de l'ancien dossier (jamais d'écrasement, jamais de suppression du dossier d'installation). Testé en dossier isolé seulement.
2. ~~WebView2 absent ou cassé~~ : fait. `main.rs` teste WebView2 au démarrage et affiche une boîte de dialogue Windows avec la marche à suivre, au lieu de planter (`0xC0000409`). Testé avec `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` pointant sur un dossier vide, sans toucher au vrai runtime.
3. **Démarrage automatique** : l'activation fonctionne (testée à la main le 31/10). Reste à vérifier la désactivation et le nettoyage par l'installateur à la désinstallation.

4. ~~Doublon de quota quand les environnements divergent~~ : codé, à valider dans la fenêtre. Chaque onglet n'affiche que les quotas de son environnement (Windows, WSL), un WSL éteint n'en affiche aucun, et Computer garde la lecture la plus récente par harness. Sans quota, la page de Claude Code ou Codex dit pourquoi (« non lu » avec la cause). L'icône de notification résume le compte entier. Le réglage « Plan Claude (Windows) » ne vaut plus que pour Windows (prix et valeur de l'abonnement, pas le quota) ; WSL détecte son plan seul.
5. **Quota Claude sous Windows impossible sans connexion lisible.** Le moteur lit `~/.claude/.credentials.json`, absent sous Windows (la connexion de Claude Desktop est dans son stockage chiffré, qu'on ne lit pas). Seule piste propre : installer et connecter la commande `claude` sous Windows. Décision de l'utilisateur à prendre.

## Idées retenues

| Idée | Détail | Dépendance |
|---|---|---|
| Harness « figés » | Un état de plus dans la liste des harness : plus relu, mais dernier relevé conservé dans les totaux. Demande de découper et mémoriser les rapports par harness, puis de les recoller (3 à 4 fois le travail de « retiré »). La table `harnessStates` est prévue pour l'accueillir. | Rapports par harness |
| Bulle de tarifs et colonnes par modèle | Entrée, entrée en cache, écriture de cache, sortie, avec les tarifs réellement utilisés. Éviter l'incohérence « Pricing unavailable » avec un coût affiché. | Le CLI doit exposer les tarifs utilisés |
| Cache des recherches de tarif dans le CLI | Les recherches floues ne sont pas mémorisées : OpenCode coûte environ 28 s de calcul en ligne. Un cache par nom de modèle ramènerait le scan à quelques secondes. À proposer à Melvynx. | Patch du CLI |
| Quota Codex par jour et par surface | `limitUsageDaily` de `harness codex`, déjà fourni par le CLI. | Aucune |
| Archive des journées disparues | Conserver les jours qu'un fournisseur cesse de renvoyer (purge des vieux logs). | Aucune |
| Mises à jour automatiques | Plugin d'updater Tauri et clé de signature des mises à jour. | Clé |
| Signature de code | Réduit les faux positifs d'antivirus (Surfshark a mis l'installateur en quarantaine, `Drop.Win32.FakeProgRegStartup`). | Certificat |
| Icône propre | Le logo de Melvynx est provisoire. | Aucune |
| Mode rapide WSL | Lecture avec un binaire Linux (0,7 s hors ligne contre 6 s). Écarté pour l'instant ; le seul binaire Linux présent est celui de David, qui change les coûts. Possible avec notre propre build Linux embarqué. | Binaire Linux |
| Plan Claude via une option | Le CLI ne détecte pas le plan ; l'application passe `--claude-plan`. | Fait, à surveiller |

## Points de vigilance

- Un scan WSL en ligne dure environ 30 s (OpenCode : 28 s de calcul). Les scans de période coûtent autant qu'un scan complet.
- Le quota par modèle (« Fable ») et les crédits d'usage supplémentaire ne s'affichent que si l'API les renvoie (absents sur un compte Pro).
- Tests de l'interface : toujours avec un `LOCALAPPDATA` isolé, jamais le vrai dossier de données.
- Windows et antivirus : l'installateur n'est pas signé. Prévoir des exclusions dans l'antivirus avant de l'exécuter.
