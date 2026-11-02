import type { Settings } from "./types";

/**
 * Offline mode stops every network call: quotas and updates are off whatever their own switch
 * says, and that choice comes back when the app goes online again. Reading the usage logs is
 * local and goes on.
 */
export const quotasActive = (settings: Settings) => settings.quotas && !settings.offline;

export const autoUpdateActive = (settings: Settings) => settings.autoUpdate && !settings.offline;

export function offlineHint(offline: boolean): string {
  const effect =
    "quotas et mises à jour suspendus, coûts calculés avec les tarifs intégrés (les modèles récents peuvent afficher 0 $).";
  return offline
    ? `Activé : ${effect} Les journaux des harness restent lus.`
    : `Aucun appel réseau : ${effect}`;
}

export function quotaHint(settings: Settings): string {
  if (settings.offline) return "Désactivé en mode hors ligne : les quotas viennent des serveurs de Claude et Codex.";
  return settings.quotas
    ? "Les jauges de Claude Code et Codex sont relues en ligne chaque minute."
    : "Les jauges ne sont plus relues : elles gardent leur dernier relevé.";
}

export function refreshHint(minutes: number): string {
  return minutes > 0
    ? `Relit les journaux des harness toutes les ${minutes} minutes.`
    : "Les journaux des harness ne sont relus qu'au démarrage et avec le bouton ⟳.";
}

export function autoUpdateHint(offline: boolean): string {
  return offline
    ? "Désactivé en mode hors ligne : aucune recherche sur GitHub."
    : "Au démarrage puis toutes les 6 heures, sur les versions publiées sur GitHub.";
}

/** Why a Claude or Codex page shows no quota when the reason is a setting, not a sign-in. */
export function quotaOffReason(settings: Settings): string | undefined {
  if (settings.offline) return "Quota non lu : mode hors ligne activé (Réglages › Données).";
  if (!settings.quotas) return "Quota non lu : la lecture des quotas est désactivée (Réglages › Données).";
  return undefined;
}
