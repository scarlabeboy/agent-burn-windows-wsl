/** Shown instead of the overview when no harness left any usage: a first launch, or a machine
 *  where none of the supported agents has been used yet. */
export function EmptyState({
  where,
  harnesses,
  disabledCount,
}: {
  /** Where nothing was found, in words: "sur ce Windows", "dans WSL"… */
  where: string;
  /** Names of the harnesses the app can read. */
  harnesses: string[];
  disabledCount: number;
}) {
  return (
    <div className="card empty-state">
      <h2>Aucune activité trouvée pour l'instant</h2>
      <p>
        Agent Burn Windows lit les journaux de vos agents de code et affiche leur usage dès qu'ils
        existent. Rien n'a été trouvé {where}.
      </p>
      <p className="muted">Harness pris en charge : {harnesses.join(", ")}.</p>
      <p>
        Utilisez l'un d'eux au moins une fois, puis cliquez sur ⟳ en haut à droite (ou attendez le
        prochain rafraîchissement automatique) : il apparaîtra tout seul dans la barre latérale.
      </p>
      {disabledCount > 0 && (
        <p className="muted small">
          {disabledCount === 1 ? "1 harness est désactivé" : `${disabledCount} harness sont désactivés`}{" "}
          dans les réglages et n'est pas lu.
        </p>
      )}
    </div>
  );
}
